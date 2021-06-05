
import {xNode} from '../utils.js';


export function makeHtmlBlock(exp, label) {
    this.detectDependency(exp);
    this.require('$cd');
    return xNode('block', {
        el: label.bindName(),
        exp
    }, (ctx, n) => {
        ctx.writeLine(`$runtime.$$htmlBlock($cd, ${n.el}, () => (${n.exp}));\n`);
    });
}
