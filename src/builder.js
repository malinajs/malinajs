
import {assert, svgElements, xNode, last} from './utils.js'


export function buildRuntime() {
    let runtime = xNode('function', {name: '', inline: true});
    runtime.push(xNode((ctx) => {
        if(this.inuse.apply) ctx.writeLine('let $cd = $component.$cd;');
    }));

    let bb = this.buildBlock(this.DOM);

    let rootTemplate = bb.tpl;
    runtime.push(bb.source);

    if(bb.svg) {
        runtime.push(`const rootTemplate = $runtime.svgToFragment(\`${this.Q(rootTemplate)}\`);`);
    } else {
        runtime.push(xNode('makeTemplate', ctx => {
            let template = this.xBuild(rootTemplate);
            ctx.writeLine(`const rootTemplate = $$htmlToFragment(\`${this.Q(template)}\`);`);
        }));
    }
    runtime.push(xNode('raw:template', {
        name: bb.name
    }, (ctx, n) => {
        if(this.inuse.apply) ctx.writeLine(`${n.name}($cd, rootTemplate);`);
        else ctx.writeLine(`${n.name}(null, rootTemplate);`);
        ctx.writeLine(`$component.$$render(rootTemplate);`);
    }));

    if(this.script.onMount) {
        runtime.push(`if($option.noMount) $component.onMount = onMount;`);
        runtime.push(`else $tick(onMount);`);
    }
    if(this.script.onDestroy) runtime.push(`$runtime.cd_onDestroy($cd, onDestroy);`);
    if(this.script.watchers.length) {
        this.script.watchers.forEach(n => runtime.push(n));
    }

    runtime.push(xNode('addStyle', ctx => {
        if(!this.css) return;
        ctx.writeLine(`$runtime.addStyles('${this.css.id}', \`${this.Q(this.css.getContent())}\`);`);
    }));

    runtime.push(xNode('raw:apply', ctx => {
        if(this.inuse.apply) ctx.writeLine('$$apply();');
    }));

    runtime.push(`return $component;`);

    let result = xNode(ctx => {
        ctx.writeIdent();
        ctx.write('return (');
        ctx.build(runtime);
        ctx.write(')();\n');
    });

    this.module.body.push(result);

    this.module.head.push(xNode('resolveClass', (ctx) => {
        if(!this.inuse.resolveClass) return;
        if(this.css) {
            let {classMap, metaClass, main} = this.css.getClassMap();
            if(main) main = `'${main}'`;
            else main = 'null';
            classMap = Object.entries(classMap).map(i => `'${i[0]}': '${i[1]}'`).join(', ');
            metaClass = Object.entries(metaClass).map(i => {
                let value = i[1] === true ? 'true' : `'${i[1]}'`;
                return `'${i[0]}': ${value}`;
            }).join(', ');

            ctx.writeLine(`const $$resolveClass = $runtime.makeClassResolver(`);
            ctx.indent++;
            ctx.writeLine(`$option, {${classMap}}, {${metaClass}}, ${main}`)
            ctx.indent--;
            ctx.writeLine(`);`)
        } else {
            ctx.writeLine(`const $$resolveClass = $runtime.noop;`);
        }
    }))
}


export function buildBlock(data, option) {
    let rootTemplate = xNode('node', {inline: true, _ctx: this});
    let binds = xNode('block');
    let result = {};

    const go = (data, isRoot, tpl) => {
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

        const bindNode = (n) => {
            if(n.type === 'text') {
                if(n.value.indexOf('{') >= 0) {
                    let t = tpl.push(' ');
                    const pe = this.parseText(n.value);
                    this.detectDependency(pe);
                    binds.push(xNode('bindText', {
                        el: t.bindName(),
                        exp: pe.result
                    }, (ctx, n) => {
                        if(this.inuse.apply) ctx.writeLine(`$runtime.bindText($cd, ${n.el}, () => ${n.exp});`);
                        else ctx.writeLine(`${n.el}.textContent = ${n.exp};`);
                    }));

                } else {
                    tpl.push(n.value);
                }
            } else if(n.type === 'template') {
                tpl.push(n.openTag);
                tpl.push(n.content);
                tpl.push('</template>');
            } else if(n.type === 'node') {
                if(n.name == 'component' || n.name.match(/^[A-Z]/)) {
                    // component
                    let el = xNode('node:comment', {label: true, value: n.name});
                    tpl.push(el);
                    let b = this.makeComponent(n, el);
                    binds.push(b.bind);
                    return;
                }
                if(n.name == 'slot') {
                    let slotName = n.elArg || 'default';
                    let el = xNode('node:comment', {label: true, value: slotName});
                    tpl.push(el);
                    let b = this.attachSlot(slotName, el.bindName(), n);
                    binds.push(b.source);
                    return;
                }
                if(n.name == 'fragment') {
                    let el = xNode('node:comment', {label: true, value: `fragment ${n.name}`});
                    tpl.push(el);
                    let b = this.attachFragment(n, el.bindName());
                    binds.push(b.source);
                    return;
                }

                let el = xNode('node', {name: n.name});
                tpl.push(el);

                if(n.attributes.some(a => a.name.startsWith('{...'))) {
                    n.spreadObject = 'spread' + (this.uniqIndex++);
                    if(this.css) n.classes.add(this.css.id);
                    this.require('apply');
                    binds.push(`
                        let ${n.spreadObject} = $runtime.$$makeSpreadObject($cd, ${el.bindName()}, '${this.css && this.css.id}');
                    `);
                }
                n.attributes.forEach(p => {
                    let b = this.bindProp(p, n, el);
                    if(b && b.bind) binds.push(b.bind);
                });
                n.classes.forEach(n => el.class.add(n));

                el.voidTag = n.voidTag;
                if(!n.closedTag) {
                    go(n, false, el);
                }
            } else if(n.type === 'each') {
                if(data.type == 'node' && data.body.length == 1) {
                    let eachBlock = this.makeEachBlock(n, {
                        elName: tpl.bindName(),
                        onlyChild: true
                    });
                    binds.push(eachBlock.source);
                    return;
                } else {
                    let element = xNode('node:comment', {label: true, value: `${n.value}`});
                    tpl.push(element);
                    let eachBlock = this.makeEachBlock(n, {elName: element.bindName()});
                    binds.push(eachBlock.source);
                    return;
                }
            } else if(n.type === 'if') {
                let element = xNode('node:comment', {label: true, value: n.value});
                tpl.push(element);
                let ifBlock = this.makeifBlock(n, element);
                binds.push(ifBlock.source);
                return;
            } else if(n.type === 'systag') {
                let r = n.value.match(/^@(\w+)\s+(.*)$/)
                let name = r[1];
                let exp = r[2];

                if(name == 'html') {
                    let el = xNode('node:comment', {label: true, value: 'html'});
                    tpl.push(el);
                    binds.push(this.makeHtmlBlock(exp, el.bindName()));
                    return;
                } else throw 'Wrong tag';
            } else if(n.type === 'await') {
                let el = xNode('node:comment', {label: true, value: n.value});
                tpl.push(el);
                let block = this.makeAwaitBlock(n, el.bindName());
                binds.push(block.source);
                return;
            } else if(n.type === 'comment') {
                tpl.push(n.content);
            }
        }
        body.forEach(node => {
            try {
                bindNode(node);
            } catch (e) {
                wrapException(e, node);
            }
        });
    };
    go(data, true, rootTemplate);
    if(option && option.protectLastTag) {
        let l = last(rootTemplate.children);
        if(l && l.type == 'node:comment' && l.label) {
            rootTemplate.push(xNode('node:comment', {value: ''}));
        }
    }

    result.tpl = rootTemplate;

    if(!binds.empty()) {
        result.name = '$$build' + (this.uniqIndex++);

        let source = xNode('function', {
            name: result.name,
            args: ['$cd', '$parentElement'].concat([] || data.args)
        });

        source.push(xNode('bindNodes', ctx => {

            const gen = (parent, parentName) => {
                for(let i=0; i < parent.children.length; i++) {
                    let node = parent.children[i];
                    let diff = i == 0 ? '[$runtime.firstChild]' : `[$runtime.childNodes][${i}]`;

                    if(node._boundName) ctx.writeLine(`let ${node._boundName} = ${parentName() + diff};`);
                    if(node.children) gen(node, () => {
                        if(node._boundName) return node._boundName;
                        return parentName() + diff;
                    })
                }
            }
            gen(rootTemplate, () => '$parentElement');
        }))

        source.push(binds);
        result.source = source;
    } else {
        result.name = '$runtime.noop';
        result.source = null;
    }
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
