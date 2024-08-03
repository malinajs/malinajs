import { xNode } from '../xnode.js';


export function makeHtmlBlock(exp, label) {
  this.detectDependency(exp);
  return xNode('html-block', {
    $wait: ['apply'],
    label,
    exp
  }, (ctx, n) => {
    if (this.inuse.apply) ctx.write(true, `$runtime.htmlBlock(${n.label.name}, () => (${n.exp}));`);
    else ctx.write(true, `$runtime.htmlBlockStatic(${n.label.name}, ${n.exp});`);
  });
}
