
import { unwrapExp, assert, isSimpleName, xNode } from '../utils';


export function attachSlot(slotName, label, node) {
    let props = [];
    if(node.attributes && node.attributes.length) {
        node.attributes.forEach(prop => {
            let name = prop.name;
            let value = prop.value;
            if(name[0] == '{') {
                assert(value == null);
                value = name;
                name = unwrapExp(name);
            };
            assert(value != null);
            assert(isSimpleName(name));
            if(value[0] == '{') {
                value = unwrapExp(value);
                this.detectDependency(value);

                props.push(xNode('prop', {
                    name,
                    value,
                    dyn: true
                }, (ctx, n) => {
                    if(this.inuse.apply) ctx.write(`${n.name}: () => (${n.value})`);
                    else ctx.write(`${n.name}: (${n.value})`);
                }));
            } else {
                props.push(xNode('static-prop', {
                    name,
                    value
                }, (ctx, n) => {
                    ctx.write(`${n.name}: \`${this.Q(n.value)}\``);
                }));
            }
        });
    };

    let placeholder;
    if(node.body && node.body.length) {
        let block = this.buildBlock(node, {inline: true});

        const tpl = xNode('template', {
            name: '$parentElement',
            body: block.tpl,
            svg: block.svg
        });

        placeholder = xNode('placeholder', {
            el: label.bindName(),
            body: block.source,
            tpl
        }, (ctx, n) => {
            ctx.build(n.tpl);
            ctx.build(n.body);
            ctx.writeLine(`$runtime.insertAfter(${n.el}, $parentElement);`);
        });
    }

    this.require('$component', '$cd', '$context');

    return xNode('slot', {
        name: slotName,
        el: label.bindName(),
        props,
        placeholder
    }, (ctx, n) => {
        let hasDynProps = n.props.some(p => p.dyn);
        let base = 'Base';
        if(hasDynProps && ctx.inuse.apply) {
            assert(!ctx._ctx.script.readOnly);
            base = '';
        }
        ctx.write(true, `$runtime.attachSlot${base}($context, $cd, '${n.name}', ${n.el}, `);
        if(n.props.length) {
            ctx.write(`{\n`);
            ctx.goIndent(() => {
                for(let i=0; i < n.props.length; i++) {
                    let prop = n.props[i];
                    ctx.writeIndent();
                    ctx.build(prop)
                    if(i + 1 < n.props.length) ctx.write(',');
                    ctx.write('\n');
                }
            });
            ctx.write(true, `}`);
        } else {
            ctx.write(`null`);
        }
        if(n.placeholder) {
            ctx.write(', () => {\n');
            ctx.goIndent(() => {
                ctx.build(n.placeholder);
            });
            ctx.write(true, '}');
        } else if(hasDynProps && !this.config.immutable) ctx.write(`, 0`)
        if(hasDynProps && !this.config.immutable) ctx.write(`, $runtime.$$compareDeep`)
        ctx.write(');\n');
    });
};
