import { isSimpleName, assert, extractKeywords } from "../utils";
import { xNode } from '../xnode.js'


export function makeAwaitBlock(node, element) {
    let valueForThen, exp;

    let rx = node.value.match(/^#await\s+(.+)\s+then\s+(\S+)\s*$/);
    if(rx) {
        assert(!node.parts.then);
        node.parts.then = node.parts.main;
        node.parts.main = null;
        exp = rx[1];
        valueForThen = rx[2];
    } else {
        rx = node.value.match(/^#await\s+(.+)\s*$/);
        assert(rx);
        exp = rx[1].trim();
    }

    let keywords = extractKeywords(exp);

    let parts = [null, null, null];
    if(node.parts.main && node.parts.main.length) {
        parts[0] = this.buildBlock({body: node.parts.main}, {protectLastTag: true});
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
        parts[1] = this.buildBlock({body: node.parts.then}, {protectLastTag: true, extraArguments: args});
    }
    if(node.parts.catch && node.parts.catch.length) {
        let args = [];
        let rx = node.parts.catchValue.match(/^[^ ]+\s+(.*)$/);
        if(rx) {
            assert(isSimpleName(rx[1]));
            args.push(rx[1]);
        }
        parts[2] = this.buildBlock({body: node.parts.catch}, {protectLastTag: true, extraArguments: args});
    }

    if(this.script.readOnly) {
        this.warning('script read-only conflicts with await');
        return;
    }
    this.detectDependency(exp);
    this.require('apply');

    return xNode('await', {
        el: element.bindName(),
        exp,
        parts,
        keywords
    }, (ctx, n) => {
        ctx.write(true, `$runtime.$$awaitBlock($cd, ${n.el}, () => [${n.keywords.join(', ')}], () => ${n.exp},`);
        ctx.indent++;
        n.parts.forEach((part, index) => {
            if(index) ctx.write(', ');
            if(part) {
                ctx.write(true);
                ctx.add(part.block);
            } else ctx.write('null');
        });
        ctx.indent--;
        ctx.write(');', true);
    });
};
