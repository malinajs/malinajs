
import {svgElements, xNode, last, replaceElementKeyword, assert} from './utils.js'


export function buildRuntime() {
    let runtime = xNode('block', {scope: true});
    runtime.push(xNode((ctx) => {
        if(this.inuse.$cd) ctx.writeLine('let $cd = $component.$cd;');
    }));

    let bb = this.buildBlock(this.DOM, {inline: true});
    runtime.push(xNode('template', {
        name: '$parentElement',
        body: bb.tpl,
        svg: bb.svg
    }));
    runtime.push(bb.source);

    if(this.script.onMount) runtime.push(`$runtime.$onMount(onMount);`);
    if(this.script.onDestroy) runtime.push(`$runtime.$onDestroy(onDestroy);`);
    if(this.script.watchers.length) {
        this.script.watchers.forEach(n => runtime.push(n));
    }

    runtime.push(xNode('addStyle', ctx => {
        if(!this.css.active()) return;
        let style = this.css.getContent();
        if(!style) return;
        let config = ctx._ctx.config;
        if(config.css) {
            if(typeof config.css == 'function') config.css(style, config.path, ctx._ctx, ctx);
            else ctx.writeLine(`$runtime.addStyles('${this.css.id}', \`${this.Q(style)}\`);`);
        } else {
            ctx._ctx.css.result = style;
        }
    }));

    runtime.push(xNode('bind-component-element', (ctx) => {
        if(ctx.inuse.$insertElementByOption) ctx.writeLine('$runtime.$insertElementByOption($element, $option, $parentElement);');
        else ctx.writeLine('return $parentElement;');
    }));

    this.module.body.push(runtime);

    if(!this.script.readOnly && this.css.active() && this.css.containsExternal()) this.require('apply', '$cd');

    this.module.head.push(xNode('resolveClass', (ctx) => {
        if(!this.inuse.resolveClass) return;
        if(this.css.active()) {
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


export function buildBlock(data, option={}) {
    let rootTemplate = xNode('node', {inline: true, _ctx: this});
    let binds = xNode('block');
    let result = {};
    let inuse = Object.assign({}, this.inuse);

    const go = (data, isRoot, tpl) => {
        let body = data.body.filter(n => {
            if(n.type == 'script' || n.type == 'style' || n.type == 'slot') return false;
            if(n.type == 'comment' && !this.config.preserveComments) return false;
            if(n.type == 'fragment') {
                try {
                    let f = this.makeFragment(n);
                    f && binds.push(f);
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
                    const pe = this.parseText(n.value);
                    this.detectDependency(pe);

                    let textNode;
                    if(pe.staticText != null) {
                        textNode = tpl.push(pe.staticText);
                    } else {
                        textNode = tpl.push(' ');
                        binds.push(xNode('bindText', {
                            el: textNode.bindName(),
                            exp: pe.result
                        }, (ctx, n) => {
                            if(this.inuse.apply) ctx.writeLine(`$runtime.bindText($cd, ${n.el}, () => ${n.exp});`);
                            else ctx.writeLine(`${n.el}.textContent = ${n.exp};`);
                        }));
                    }

                    pe.parts.forEach(p => {
                        if(p.type != 'js') return;
                        let exp = p.value;
                        if(!exp.endsWith(';')) exp += ';';
                        binds.push(xNode('block', {body: [
                            replaceElementKeyword(exp, () => textNode.bindName())
                        ]}));
                    });

                } else {
                    tpl.push(n.value);
                }
            } else if(n.type === 'template') {
                tpl.push(n.openTag);
                tpl.push(n.content);
                tpl.push('</template>');
            } else if(n.type === 'node') {
                if(n.name == 'malina' && !option.malinaElement) {
                    let b = this.attachHead(n);
                    b && binds.push(b);
                    return;
                }
                if(n.name == 'component' || n.name.match(/^[A-Z]/)) {
                    if(n.name == 'component' || !n.elArg) {
                        // component
                        let el = xNode('node:comment', {label: true, value: n.name});
                        tpl.push(el);
                        let b = this.makeComponent(n, el);
                        binds.push(b.bind);
                    } else {
                        let el = xNode('node:comment', {label: true, value: `exported ${n.elArg}`});
                        tpl.push(el);
                        let b = this.attchExportedFragment(n, el, n.name);
                        b && binds.push(b);
                    }
                    return;
                }
                if(n.name == 'slot') {
                    let slotName = n.elArg;
                    if(!slotName) {
                        if(option.context == 'fragment') {
                            let el = xNode('node:comment', {label: true, value: 'fragment-slot'});
                            tpl.push(el);
                            binds.push(this.attachFragmentSlot(el));
                            return;
                        } else slotName = 'default';
                    }
                    let el = xNode('node:comment', {label: true, value: slotName});
                    tpl.push(el);
                    binds.push(this.attachSlot(slotName, el, n));
                    return;
                }
                if(n.name == 'fragment') {
                    assert(n.elArg, 'Fragment name is required');
                    let el = xNode('node:comment', {label: true, value: `fragment ${n.elArg}`});
                    tpl.push(el);
                    let b = this.attachFragment(n, el);
                    b && binds.push(b);
                    return;
                }

                let el = xNode('node', {name: n.name});
                if(option.oneElement) el._boundName = option.oneElement;
                tpl.push(el);

                if(n.attributes.some(a => a.name.startsWith('{...'))) {
                    n.spreading = [];
                    this.require('$cd');
                    binds.push(xNode('spread-to-element', {
                        el: el.bindName(),
                        props: n.spreading
                    }, (ctx, n) => {
                        ctx.writeLine(`$runtime.spreadAttributes($cd, ${n.el}, () => ({${n.props.join(', ')}}));`);
                    }));
                }
                let bindTail = [];
                n.attributes.forEach(p => {
                    let b = this.bindProp(p, n, el);
                    if(b) {
                        if(b.bind) binds.push(b.bind);
                        if(b.bindTail) bindTail.push(b.bindTail);
                    }
                });
                n.classes.forEach(n => el.class.add(n));

                if(option.bindAttributes && (el.attributes.length || el.class.size)) {
                    el.bindName();
                    binds.push(xNode('bindAttributes', {el}, (ctx, n) => {
                        let elName = n.el.bindName();
                        n.el.attributes.forEach(a => {
                            ctx.writeLine(`${elName}.setAttribute('${a.name}', \`${this.Q(a.value)}\`);`);
                        });
                    }));
                    binds.push(xNode('bindClasses', {el}, (ctx, n) => {
                        let el = n.el;
                        let elName = el.bindName();
                        if(el.class.size) {
                            let className = Array.from(el.class.values()).join(' ');
                            ctx.writeLine(`${elName}.className += ' ${className}';`);
                        }
                    }));
                }
                bindTail.forEach(b => binds.push(b));

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
                let r = n.value.match(/^@(\w+)\s+(.*)$/s);
                let name = r[1];
                let exp = r[2];

                if(name == 'html') {
                    let el = xNode('node:comment', {label: true, value: 'html'});
                    tpl.push(el);
                    binds.push(this.makeHtmlBlock(exp, el));
                    return;
                } else throw 'Wrong tag';
            } else if(n.type === 'await') {
                let el = xNode('node:comment', {label: true, value: n.value});
                tpl.push(el);
                binds.push(this.makeAwaitBlock(n, el));
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
    if(option.protectLastTag) {
        let l = last(rootTemplate.children);
        if(l && l.type == 'node:comment' && l.label) {
            rootTemplate.push(xNode('node:comment', {value: ''}));
        }
    }

    result.tpl = rootTemplate;

    if(binds.body.length) {
        const innerBlock = xNode('block');
        if(!option.oneElement) {
            innerBlock.push(xNode('bindNodes', ctx => {
    
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
        }
        innerBlock.push(binds);

        if(option.inline) {
            result.source = innerBlock;
        } else if(option.inlineFunction) {
            result.source = xNode('function', {
                inline: true,
                arrow: true,
                args: ['$cd', '$parentElement'].concat(option.args || []),
                body: [innerBlock]
            });
        } else {
            result.name = '$$build' + (this.uniqIndex++);
            result.source = xNode('function', {
                name: result.name,
                args: ['$cd', '$parentElement'].concat(option.args || []),
                body: [innerBlock]
            });
        }
    } else {
        result.name = '$runtime.noop';
        result.source = null;
    }
    result.inuse = {};
    for(let k in this.inuse) {
        result.inuse[k] = this.inuse[k] - (inuse[k] || 0);
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
