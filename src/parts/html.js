import { xNode } from '../xnode.js';


export function makeHtmlBlock(exp, label, requireCD) {
  this.detectDependency(exp);
  this.require('$cd');
  const result = xNode('block', {
    $deps: [this.glob.apply],
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

  requireCD.$depends(result);
  return result;
}
