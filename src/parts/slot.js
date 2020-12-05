
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
                    value
                }, (ctx, n) => {
                    ctx.write(`${n.name}: () => (${n.value})`);
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
            ctx.writeLine(`${n.el}.parentNode.insertBefore($parentElement, ${n.el}.nextSibling);`);
        });
    }

    this.require('apply');

    return xNode('slot', {
        name: slotName,
        el: label.bindName(),
        props,
        placeholder
    }, (ctx, n) => {
        ctx.writeIndent();
        ctx.write(`$runtime.attachSlot($option, $cd, '${n.name}', ${n.el}`);
        if(n.props.length) {
            ctx.write(', {\n');
            ctx.goIndent(() => {
                for(let i=0; i < props.length; i++) {
                    let prop = props[i];
                    ctx.writeIndent();
                    ctx.build(prop)
                    if(i + 1 < props.length) ctx.write(',');
                    ctx.write('\n');
                }
            });
            ctx.writeIndent();
            ctx.write('}');
        }
        if(n.placeholder) {
            ctx.write(', () => {\n');
            ctx.goIndent(() => {
                ctx.build(n.placeholder);
            });
            ctx.writeIndent();
            ctx.write('}');
        }
        ctx.write(');\n');
    });
};
