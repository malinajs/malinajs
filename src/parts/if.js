import { assert } from '../utils.js';
import { xNode } from '../xnode.js';


export function makeifBlock(data, element) {
  let r = data.value.match(/^#if (.*)$/s);
  let exp = r[1];
  assert(exp, 'Wrong binding: ' + data.value);
  this.detectDependency(exp);

  let mainBlock, elseBlock;

  const getBlock = b => {
    if(b.singleBlock) {
      return xNode('make-block', {
        block: b.singleBlock
      }, (ctx, n) => {
        ctx.write('() => ');
        ctx.add(n.block);
      });
    }
    return b.block;
  };

  if(data.bodyMain) {
    mainBlock = getBlock(this.buildBlock({ body: data.bodyMain }, { protectLastTag: true, allowSingleBlock: true }));
    elseBlock = getBlock(this.buildBlock(data, { protectLastTag: true, allowSingleBlock: true }));
  } else {
    mainBlock = getBlock(this.buildBlock(data, { protectLastTag: true, allowSingleBlock: true }));
  }

  return xNode('if:bind', {
    $hold: [this.glob.rootCD],
    $require: [this.glob.apply],
    el: element.bindName(),
    exp,
    mainBlock: mainBlock,
    elseBlock: elseBlock
  }, (ctx, n) => {
    if(this.glob.apply.value) {
      this.require('$cd');
      ctx.write(true, `$runtime.ifBlock(${n.el}, () => !!(${n.exp}),`);
    } else {
      ctx.write(true, `$runtime.ifBlockReadOnly(${n.el}, () => !!(${n.exp}),`);
    }

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
}
