import { isSimpleName, assert, xNode } from "../utils";

export function makeAwaitBlock(node, element) {
    let valueForThen, exp;
    let rx = node.value.match(/^#await\s+(\S+)\s+then\s+(\S+)\s*$/);
    if(rx) {
        assert(!node.parts.then);
        node.parts.then = node.parts.main;
        node.parts.main = null;
        exp = rx[1];
        valueForThen = rx[2];
    } else {
        rx = node.value.match(/^#await\s+(\S+)\s*$/);
        assert(rx);
        exp = rx[1].trim();
    }

    let parts = [null, null, null];
    if(node.parts.main && node.parts.main.length) {
        parts[0] = this.buildBlock({body: node.parts.main}, {protectLastTag: true, inlineFunction: true});
    }
    if(node.parts.then && node.parts.then.length) {
        let args = [];
        if(valueForThen) {
            assert(isSimpleName(valueForThen));
            args.push(valueForThen);
        } else {
            let rx = node.parts.thenValue.match(/^[^ ]+\s+(.*)$/);
            if(rx) {
                assert(isSimpleName(rx[1]));
                args.push(rx[1]);
            }
        }
        parts[1] = this.buildBlock({body: node.parts.then}, {protectLastTag: true, inlineFunction: true, args});
    }
    if(node.parts.catch && node.parts.catch.length) {
        let args = [];
        let rx = node.parts.catchValue.match(/^[^ ]+\s+(.*)$/);
        if(rx) {
            assert(isSimpleName(rx[1]));
            args.push(rx[1]);
        }
        parts[2] = this.buildBlock({body: node.parts.catch}, {protectLastTag: true, inlineFunction: true, args});
    }

    this.detectDependency(exp);
    if(this.script.readOnly) this.warning('script read-only conflicts with await');
    this.require('apply', '$cd');

    return xNode('await', {
        el: element.bindName(),
        exp,
        parts
    }, (ctx, n) => {
        ctx.writeIndent();
        ctx.write(`$runtime.$$awaitBlock($cd, ${n.el}, () => ${n.exp}, $$apply,\n`);
        ctx.goIndent(() => {
            n.parts.forEach((part, index) => {
                if(part) {
                    let {source, tpl, svg} = part;
                    ctx.writeIndent();
                    if(source) {
                        ctx.build(source);
                        ctx.write(',\n');
                        ctx.writeIndent();
                    } else ctx.write(`$runtime.noop, `);
                    ctx.build(xNode('template', {body: tpl, svg, inline: true}));
                    ctx.write(index == 2 ? '\n' : ',\n');
                } else {
                    ctx.writeLine(`null, null` + (index == 2 ? '' : ','));
                };
            });
        });
        ctx.writeLine(');');
    });
};
