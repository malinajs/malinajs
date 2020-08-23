
import * as utils from './utils.js'
import { parseText } from './parser.js'
import { makeComponent } from './parts/component.js'
import { bindProp } from './parts/prop.js'
import { makeifBlock } from './parts/if.js'
import { makeEachBlock } from './parts/each.js'
import { makeHtmlBlock } from './parts/html.js'
import { makeAwaitBlock } from './parts/await.js'
import { attachSlot } from './parts/slot.js'
import { makeFragment, attachFragment } from './parts/fragment.js'

const assert = utils.assert;

export function buildRuntime(data, script, css, config) {
    let runtime = [`
        return (function() {
            let $cd = $component.$cd;
    `];
    let runtimeHeader = [];

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
        makeFragment,
        attachFragment,
        checkRootName: utils.checkRootName
    };

    if(css) css.process(data);

    let bb = ctx.buildBlock(data);

    let rootTemplate = bb.tpl;
    runtime.push(bb.source);

    if(bb.svg) {
        runtime.push(`const rootTemplate = $runtime.svgToFragment(\`${Q(rootTemplate)}\`);`);
    } else {
        runtime.push(`const rootTemplate = $$htmlToFragment(\`${Q(rootTemplate)}\`);`);
    }
    runtime.push(`
        ${bb.name}($cd, rootTemplate);
        $component.$$render(rootTemplate);
    `);
    if(script.onMount) runtime.push(`
        if($option.noMount) $component.onMount = onMount;
        else $tick(onMount);
    `);
    if(script.onDestroy) runtime.push(`$runtime.cd_onDestroy($cd, onDestroy);`);
    if(script.watchers.length) {
        runtime.push(script.watchers.join('\n'));
    }

    if(css) runtime.push(`
        $runtime.addStyles('${css.id}', \`${Q(css.getContent())}\`);
    `);

    runtime.push(`
            $$apply();
            return $component;
        })();`);
    return {
        header: runtimeHeader.join('\n'),
        body: runtime.join('\n')
    };
}


function buildBlock(data) {
    let tpl = [];
    let lvl = [];
    let binds = [];
    let DN = {};
    let result = {};

    const go = (level, data, isRoot) => {
        let index = 0;
        const setLvl = () => {lvl[level] = index++;}

        const getElementName = (shift) => {
            let cl;
            if(shift) cl = lvl.slice(0, lvl.length + shift);
            else cl = lvl.slice();

            let d = DN;
            cl.forEach(n => {
                if(d[n] == null) d[n] = {};
                d = d[n];
            });
            if(!d.name) d.name = `el${this.uniqIndex++}`;
            return d.name;
        };

        let body = data.body.filter(n => {
            if(n.type == 'script' || n.type == 'style' || n.type == 'slot') return false;
            if(n.type == 'comment' && !this.config.preserveComments) return false;
            if(n.type == 'fragment') {
                try {
                    let b = this.makeFragment(n);
                    binds.push(b.source);
                } catch (e) {
                    wrapException(e, n);
                }
                return false;
            }
            return true;
        });

        if(isRoot) {
            let svg = false, other = false;
            body.some(node => {
                if(node.type != 'node') return;
                if(utils.svgElements[node.name]) svg = true;
                else return other = true;
            });
            if(svg && !other) result.svg = true;
        }

        {
            let i = 0;
            while(i < body.length - 1) {
                let node = body[i];
                let next = body[i + 1];
                if(node.type == 'text' && next.type == 'text') {
                    node.value += next.value;
                    body.splice(i + 1, 1);
                    continue;
                }
                i++;
            }
        }

        let lastText;
        const bindNode = (n) => {
            if(n.type === 'text') {
                assert(lastText !== tpl.length);
                setLvl();
                if(n.value.indexOf('{') >= 0) {
                    tpl.push(' ');
                    let exp = this.parseText(n.value);
                    binds.push(`$runtime.bindText($cd, ${getElementName()}, () => ${exp});`);
                } else tpl.push(n.value);
                lastText = tpl.length;
            } else if(n.type === 'template') {
                setLvl();
                tpl.push(n.openTag);
                tpl.push(n.content);
                tpl.push('</template>');
            } else if(n.type === 'node') {
                setLvl();
                if(n.name.match(/^[A-Z]/)) {
                    // component
                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- ${n.name} -->`);
                    let b = this.makeComponent(n, getElementName);
                    binds.push(b.bind);
                    return;
                }
                if(n.name.match(/^slot(\:|$| )/)) {
                    let slotName;
                    if(n.name == 'slot') slotName = 'default';
                    else {
                        let rx = n.name.match(/^slot\:(\S+)(.*)$/);
                        assert(rx);
                        slotName = rx[1];
                    };

                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- Slot ${slotName} -->`);
                    let b = this.attachSlot(slotName, getElementName(), n);
                    binds.push(b.source);
                    return;
                }
                if(n.name.match(/^fragment(\:|$| )/)) {
                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- Slot ${n.name} -->`);
                    let b = this.attachFragment(n, getElementName());
                    binds.push(b.source);
                    return;
                }

                let el = ['<' + n.name];
                if(n.attributes.some(a => a.name.startsWith('{...'))) {
                    n.spreadObject = 'spread' + (this.uniqIndex++);
                    n.injectCssHash = !!this.css;
                    binds.push(`
                        let ${n.spreadObject} = $runtime.$$makeSpreadObject($cd, ${getElementName()}, '${this.css && this.css.id}');
                    `);
                }
                n.attributes.forEach(p => {
                    let b = this.bindProp(p, getElementName, n);
                    if(b.prop) el.push(b.prop);
                    if(b.bind) binds.push(b.bind);
                });
                if(n.injectCssHash) el.push(`class="${this.css.id}"`);

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
                n.parent = data;
                let onlyChild = data.type == 'node' && !body.some(sibling => {
                    if(sibling.type == 'text' && !sibling.value.trim()) return false;
                    if(sibling === n) return false;
                    return true;
                });

                setLvl();
                if(onlyChild) {
                    let eachBlock = this.makeEachBlock(n, {
                        elName: getElementName(-1),
                        onlyChild: true
                    });
                    binds.push(eachBlock.source);
                    return 'stop';
                } else {
                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- ${n.value} -->`);
                    n.parent = data;
                    let eachBlock = this.makeEachBlock(n, {elName: getElementName()});
                    binds.push(eachBlock.source);
                }
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
                setLvl();
                tpl.push(n.content);
            }
        }
        body.some(node => {
            try {
                return bindNode(node) == 'stop';
            } catch (e) {
                wrapException(e, node);
            }
        });

        lvl.length = level;
    };
    go(0, data, true);

    let source = [];
    result.name = '$$build' + (this.uniqIndex++);
    result.tpl = this.Q(tpl.join(''));
    
    let args = ['$cd', '$parentElement'];
    if(data.args) args.push.apply(args, data.args);
    source.push(`function ${result.name}(${args.join(', ')}) {\n`);

    const buildNodes = (d, lvl) => {
        let keys = Object.keys(d).filter(k => k != 'name');
        if(keys.length > 1 && !d.name) d.name = 'el' + (this.uniqIndex++);

        if(d.name) {
            let line = lvl.join('');
            source.push(`const ${d.name} = ${line};\n`);
            lvl = [d.name];
        }

        keys.forEach(k => {
            buildNodes(d[k], lvl.concat([`[$runtime.$$childNodes][${k}]`]))
        });
    }
    buildNodes(DN, ['$parentElement']);

    source.push(binds.join('\n'));
    source.push(`};`);
    result.source = source.join('');
    return result;
};

function wrapException(e, n) {
    if(typeof e === 'string') e = new Error(e);
    if(!e.details) {
        console.log('Node: ', n);
        if(n.type == 'text') e.details = n.value.trim();
        else if(n.type == 'node') e.details = n.openTag.trim();
        else if(n.type == 'each') e.details = n.value.trim();
        else if(n.type == 'if') e.details = n.value.trim();
    }
    throw e;
};
