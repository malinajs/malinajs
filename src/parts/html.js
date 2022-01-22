import { xNode } from '../xnode.js';


export function makeHtmlBlock(exp, label, requireCD) {
  this.detectDependency(exp);
  this.require('$cd');
  return xNode('block', {
    $require: [this.glob.apply],
    el: label.bindName(),
    exp,
    requireCD
  }, (ctx, n) => {
    let cd;
    if(this.glob.apply.value) {
      n.requireCD.$value(true);
      cd = '$cd';
    } else cd = 'null';
    ctx.write(true, `$runtime.$$htmlBlock(${cd}, ${n.el}, () => (${n.exp}));`);
  });
}
