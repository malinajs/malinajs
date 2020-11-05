
import {assert, svgElements} from './utils.js'


export function buildRuntime() {
    let runtime = [`
        return (function() {
            let $cd = $component.$cd;
    `];

    let bb = this.buildBlock(this.DOM);

    let rootTemplate = bb.tpl;
    runtime.push(bb.source);

    if(bb.svg) {
        runtime.push(`const rootTemplate = $runtime.svgToFragment(\`${this.Q(rootTemplate)}\`);`);
    } else {
        runtime.push(`const rootTemplate = $$htmlToFragment(\`${this.Q(rootTemplate)}\`);`);
    }
    runtime.push(`
        ${bb.name}($cd, rootTemplate);
        $component.$$render(rootTemplate);
    `);
    if(this.script.onMount) runtime.push(`
        if($option.noMount) $component.onMount = onMount;
        else $tick(onMount);
    `);
    if(this.script.onDestroy) runtime.push(`$runtime.cd_onDestroy($cd, onDestroy);`);
    if(this.script.watchers.length) {
        runtime.push(this.script.watchers.join('\n'));
    }

    if(this.css) runtime.push(`
        $runtime.addStyles('${this.css.id}', \`${this.Q(this.css.getContent())}\`);
    `);

    runtime.push(`
            $$apply();
            return $component;
        })();`);

    if(this.use.resolveClass) {
        if(this.css) {
            let {classMap, metaClass, main} = this.css.getClassMap();
            if(main) main = `'${main}'`;
            else main = 'null';
            classMap = Object.entries(classMap).map(i => `'${i[0]}': '${i[1]}'`).join(', ');
            metaClass = Object.entries(metaClass).map(i => {
                let value = i[1] === true ? 'true' : `'${i[1]}'`;
                return `'${i[0]}': ${value}`;
            }).join(', ');
            this.runtime.componentHeader.push(`
                const $$resolveClass = $runtime.makeClassResolver(
                    $option, {${classMap}}, {${metaClass}}, ${main}
                );
            `);
        }
    }

    this.runtime.header = this.runtime.componentHeader.join('\n');
    this.runtime.body = runtime.join('\n');
}


export function buildBlock(data) {
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
                if(svgElements[node.name]) svg = true;
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
                    let exp = this.parseText(n.value).result;
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
                if(n.name == 'component' || n.name.match(/^[A-Z]/)) {
                    // component
                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- ${n.name} -->`);
                    let b = this.makeComponent(n, getElementName);
                    binds.push(b.bind);
                    return;
                }
                if(n.name == 'slot') {
                    let slotName = n.elArg || 'default';
                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- Slot ${slotName} -->`);
                    let b = this.attachSlot(slotName, getElementName(), n);
                    binds.push(b.source);
                    return;
                }
                if(n.name == 'fragment') {
                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- Fragment ${n.name} -->`);
                    let b = this.attachFragment(n, getElementName());
                    binds.push(b.source);
                    return;
                }

                let el = ['<' + n.name];
                if(n.attributes.some(a => a.name.startsWith('{...'))) {
                    n.spreadObject = 'spread' + (this.uniqIndex++);
                    if(this.css) n.classes.add(this.css.id);
                    binds.push(`
                        let ${n.spreadObject} = $runtime.$$makeSpreadObject($cd, ${getElementName()}, '${this.css && this.css.id}');
                    `);
                }
                n.attributes.forEach(p => {
                    let b = this.bindProp(p, getElementName, n);
                    if(b.prop) el.push(b.prop);
                    if(b.bind) binds.push(b.bind);
                });
                let className = Array.from(n.classes).join(' ');
                if(className) el.push(`class="${className}"`);

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
