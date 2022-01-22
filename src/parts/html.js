import { xNode } from '../xnode.js';


export function makeHtmlBlock(exp, label, requireCD) {
  this.detectDependency(exp);
  this.require('rootCD');
  return xNode('block', {
    $wait: ['apply'],
    el: label.bindName(),
    exp,
    requireCD
  }, (ctx, n) => {
    let cd;
    if(this.inuse.apply) {
      n.requireCD.$value(true);
      cd = '$cd';
    } else cd = 'null';
    ctx.write(true, `$runtime.$$htmlBlock(${cd}, ${n.el}, () => (${n.exp}));`);
  });
}
