import { assert } from '../utils.js';
import { xNode } from '../xnode.js';


export function makeifBlock(data, element, requireCD) {
  const r = data.value.match(/^#if (.*)$/);
  const exp = r[1];
  assert(exp, 'Wrong binding: ' + data.value);
  this.detectDependency(exp);
  this.require('$cd');

  let mainBlock, elseBlock;

  const getBlock = (b) => {
    if (b.singleBlock) {
      return xNode('make-block', {
        block: b.singleBlock
      }, (ctx, n) => {
        ctx.write('() => ');
        ctx.add(n.block);
      });
    }
    return b.block;
  };

  if (data.bodyMain) {
    mainBlock = getBlock(this.buildBlock({ body: data.bodyMain }, { protectLastTag: true, allowSingleBlock: true }));
    elseBlock = getBlock(this.buildBlock(data, { protectLastTag: true, allowSingleBlock: true }));
  } else {
    mainBlock = getBlock(this.buildBlock(data, { protectLastTag: true, allowSingleBlock: true }));
  }

  const result = xNode('if:bind', {
    $deps: [this.glob.apply],
    requireCD,
    el: element.bindName(),
    exp,
    mainBlock: mainBlock,
    elseBlock: elseBlock
  }, (ctx, n) => {
    if (this.glob.apply.value) {
      n.requireCD.$value(true);
      ctx.write(true, `$runtime.ifBlock($cd, ${n.el}, () => !!(${n.exp}),`);
    } else {
      this.glob.component.$value(true);
      ctx.write(true, `$runtime.ifBlockReadOnly($component, ${n.el}, () => !!(${n.exp}),`);
    }

    ctx.indent++;
    ctx.write(true);
    ctx.add(n.mainBlock);
    if (n.elseBlock) {
      ctx.write(',');
      ctx.add(n.elseBlock);
    }
    ctx.indent--;
    ctx.write(true, ');', true);
  });
  requireCD.$depends(result);
  this.glob.component.$depends(result);
  return result;
}
