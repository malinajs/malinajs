import { xNode } from '../xnode.js';


export function makeHtmlBlock(exp, label) {
  this.detectDependency(exp);
  return xNode('block', {
    $wait: ['apply'],
    el: label.bindName(),
    exp
  }, (ctx, n) => {
    if(this.inuse.apply) ctx.write(true, `$runtime.$$htmlBlock(${n.el}, () => (${n.exp}));`);
    else ctx.write(true, `$runtime.$$htmlBlockStatic(${n.el}, ${n.exp});`);
  });
}
