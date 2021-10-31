
import { assert } from '../utils.js'
import { xNode } from '../xnode.js'


export function makeifBlock(data, element) {
    let r = data.value.match(/^#if (.*)$/);
    let exp = r[1];
    assert(exp, 'Wrong binding: ' + data.value);
    this.detectDependency(exp);
    this.require('$cd');

    let mainBlock, elseBlock;

    if(data.bodyMain) {
        mainBlock = this.buildBlock({body: data.bodyMain}, {protectLastTag: true});
        elseBlock = this.buildBlock(data, {protectLastTag: true});
    } else {
        mainBlock = this.buildBlock(data, {protectLastTag: true});
    }

    const source = xNode('if:bind', {
        el: element.bindName(),
        exp,
        mainBlock: mainBlock.block,
        elseBlock: elseBlock && elseBlock.block
    }, (ctx, n) => {
        ctx.write(true, `$runtime.$$ifBlock($cd, ${n.el}, () => !!(${n.exp}),`);
        ctx.indent++;
        ctx.write(true);
        ctx.add(n.mainBlock);
        if(n.elseBlock) {
            ctx.write(',');
            ctx.add(n.elseBlock);
        }
        ctx.indent--;
        ctx.write(true, ');', true);
    });

    return {source};
};
