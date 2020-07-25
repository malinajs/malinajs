
import * as utils from './utils.js'
import { parseText } from './parser.js'
import { makeComponent } from './parts/component.js'
import { bindProp } from './parts/prop.js'
import { makeifBlock } from './parts/if.js'
import { makeEachBlock } from './parts/each.js'
import { makeHtmlBlock } from './parts/html.js'
import { makeAwaitBlock } from './parts/await.js'
import { attachSlot } from './parts/slot.js'


export function buildRuntime(data, script, css, config) {
    let runtime = [`
        return (function() {
            let $cd = $component.$cd;
    `];

    const Q = config.inlineTemplate ? utils.Q2 : utils.Q;
    const ctx = {
        uniqIndex: 0,
        Q,
        config,
        script,
        css,
        buildBlock,
        bindProp,
        makeEachBlock,
        makeifBlock,
        makeComponent,
        makeHtmlBlock,
        parseText,
        makeAwaitBlock,
        attachSlot,
        checkRootName: utils.checkRootName
    };

    if(css) css.process(data);

    let bb = ctx.buildBlock(data);

    let rootTemplate = bb.tpl;
    runtime.push(bb.source);
    runtime.push(`
        const rootTemplate = $$htmlToFragment(\`${Q(rootTemplate)}\`);
        ${bb.name}($cd, rootTemplate);
        $component.$$render(rootTemplate);
    `);
    if(script.onMount) runtime.push(`
        if($option.noMount) $component.onMount = onMount;
        else $cd.once(onMount);
    `);
    if(script.onDestroy) runtime.push(`$cd.d(onDestroy);`);
    if(script.watchers.length) {
        runtime.push('$cd.once(() => {\n' + script.watchers.join('\n') + '\n$$apply();\n});');
    }

    if(css) runtime.push(`
        if(!document.head.querySelector('style#${css.id}')) {
            let style = document.createElement('style');
            style.id = '${css.id}';
            style.innerHTML = \`${Q(css.getContent())}\`;
            document.head.appendChild(style);
        }
    `);

    runtime.push(`
            $$apply();
            return $component;
        })();`);
    return runtime.join('');
}


function buildBlock(data) {
    let tpl = [];
    let lvl = [];
    let binds = [];
    let DN = {};

    const go = (level, data) => {
        let index = 0;
        const setLvl = () => {lvl[level] = index++;}

        const getElementName = () => {
            let d = DN;
            lvl.forEach(n => {
                if(d[n] == null) d[n] = {};
                d = d[n];
            });
            if(!d.name) d.name = `el${this.uniqIndex++}`;
            return d.name;
        };

        let n, body = data.body.filter(n => n.type != 'script' && n.type != 'style');
        if(data.type == 'root') {
            while(n = body[0]) {
                if(n.type != 'text') break;
                n.value = n.value.trimLeft();
                if(n.value) break;
                else body.shift();
            }
            while(n = body[body.length - 1]) {
                if(n.type != 'text') break;
                n.value = n.value.trimRight();
                if(n.value) break;
                else body.pop();
            }
        }

        let lastText;
        const bindNode = (n) => {
            if(n.type === 'text') {
                if(lastText !== tpl.length) setLvl();
                if(n.value.indexOf('{') >= 0) {
                    tpl.push(' ');
                    let exp = this.parseText(n.value);
                    binds.push(`{
                        let $element=${getElementName()};
                        $watchReadOnly($cd, () => ${exp}, (value) => {$element.textContent=value;});}`);
                } else tpl.push(n.value);
                lastText = tpl.length;
            } else if(n.type === 'template') {
                setLvl();
                tpl.push(n.openTag);
                tpl.push(n.content);
                tpl.push('</template>');
            } else if(n.type === 'node') {
                setLvl();
                if(n.name.match(/^[A-Z]/) && this.script.imports.indexOf(n.name) >= 0) {
                    // component
                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- ${n.name} -->`);
                    let b = this.makeComponent(n, getElementName);
                    binds.push(b.bind);
                    return;
                }
                if(n.name.match(/^slot(\:|$)/)) {
                    let slotName;
                    if(n.name == 'slot') slotName = 'default';
                    else {
                        let rx = n.name.match(/^slot\:(\S+)(.*)$/);
                        utils.assert(rx);
                        slotName = rx[1];
                        // rx[2];  args
                    };

                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- Slot ${slotName} -->`);
                    let b = this.attachSlot(slotName, getElementName(), n);
                    binds.push(b.source);
                    return;
                }

                let hasClass = false;
                let el = ['<' + n.name];
                if(n.attributes.some(a => a.name.startsWith('{...'))) {
                    n.spreadObject = 'spread' + (this.uniqIndex++);
                    n.scopedClass = !!this.css;
                    binds.push(`
                        let ${n.spreadObject} = $$makeSpreadObject($cd, ${getElementName()}, '${this.css && this.css.id}');
                    `);
                }
                n.attributes.forEach(p => {
                    let b = this.bindProp(p, getElementName, n);
                    if(b.prop) el.push(b.prop);
                    if(b.bind) binds.push(b.bind);
                    if(b.scopedClass) hasClass = true;
                });
                if(n.scopedClass && !hasClass) el.push(`class="${this.css.id}"`);

                el = el.join(' ');
                if(n.closedTag) {
                    el += n.voidTag ? '/>' : `></${n.name}>`;
                } else el += '>';
                tpl.push(el);

                if(!n.closedTag) {
                    go(level + 1, n);
                    tpl.push(`</${n.name}>`);
                }
            } else if(n.type === 'each') {
                setLvl();
                if(this.config.hideLabel) tpl.push(`<!---->`);
                else tpl.push(`<!-- ${n.value} -->`);
                n.parent = data;
                let eachBlock = this.makeEachBlock(n, getElementName());
                binds.push(eachBlock.source);
            } else if(n.type === 'if') {
                setLvl();
                if(this.config.hideLabel) tpl.push(`<!---->`);
                else tpl.push(`<!-- ${n.value} -->`);
                let ifBlock = this.makeifBlock(n, getElementName());
                binds.push(ifBlock.source);
            } else if(n.type === 'systag') {
                let r = n.value.match(/^@(\w+)\s+(.*)$/)
                let name = r[1];
                let exp = r[2];

                if(name == 'html') {
                    setLvl();
                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- html -->`);
                    binds.push(this.makeHtmlBlock(exp, getElementName()));
                } else throw 'Wrong tag';
            } else if(n.type === 'await') {
                setLvl();
                if(this.config.hideLabel) tpl.push(`<!---->`);
                else tpl.push(`<!-- ${n.value} -->`);
                let block = this.makeAwaitBlock(n, getElementName());
                binds.push(block.source);
            } else if(n.type === 'comment') {
                if(!this.config.preserveComments) return;
                setLvl();
                tpl.push(n.content);
            }
        }
        body.forEach(n => {
            try {
                bindNode(n);
            } catch (e) {
                if(typeof e === 'string') e = new Error(e);
                if(!e.details) {
                    console.log('Node: ', n);
                    if(n.type == 'text') e.details = n.value.trim();
                    else if(n.type == 'node') e.details = n.openTag.trim();
                    else if(n.type == 'each') e.details = n.value.trim();
                    else if(n.type == 'if') e.details = n.value.trim();
                }
                throw e;
            }
        });

        lvl.length = level;
    };
    go(0, data);

    let source = [];
    let buildName = '$$build' + (this.uniqIndex++);
    tpl = this.Q(tpl.join(''));
    
    let args = ['$cd', '$parentElement'];
    if(data.args) args.push.apply(args, data.args);
    source.push(`function ${buildName}(${args.join(', ')}) {\n`);

    const buildNodes = (d, lvl) => {
        let keys = Object.keys(d).filter(k => k != 'name');
        if(keys.length > 1 && !d.name) d.name = 'el' + (this.uniqIndex++);

        if(d.name) {
            let line = lvl.join('');
            source.push(`const ${d.name} = ${line};\n`);
            lvl = [d.name];
        }

        keys.forEach(k => {
            buildNodes(d[k], lvl.concat([`[$$childNodes][${k}]`]))
        });
    }
    buildNodes(DN, ['$parentElement']);

    source.push(binds.join('\n'));
    source.push(`};`);

    return {
        name: buildName,
        tpl: tpl,
        source: source.join('')
    }

};
