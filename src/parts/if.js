import { assert } from '../utils.js';
import { xNode } from '../xnode.js';


export function makeifBlock(data, label) {
  const getBlock = b => {
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

  let elseBlock, parts = [];
  data.parts.forEach(part => {
    let rx = part.value.match(/^(#if|:elif|:else\s+if)\s(.*)$/s);
    let exp = rx[2]?.trim();
    assert(exp, 'Wrong binding: ' + part.value);
    this.detectDependency(exp);
    parts.push({
      exp,
      block: getBlock(this.buildBlock(part, { allowSingleBlock: true }))
    });
  });
  if (data.elsePart) elseBlock = getBlock(this.buildBlock({ body: data.elsePart }, { allowSingleBlock: true }));

  return xNode('if:bind', {
    $wait: ['apply'],
    label,
    parts,
    elseBlock
  }, (ctx, n) => {
    if (this.inuse.apply) {
      ctx.write(true, `$runtime.ifBlock(${n.label.name}, `);
    } else {
      ctx.write(true, `$runtime.ifBlockReadOnly(${n.label.name}, `);
    }

    if (n.parts.length == 1) {
      if (n.elseBlock) ctx.write(`() => (${n.parts[0].exp}) ? 0 : 1`);
      else ctx.write(`() => (${n.parts[0].exp}) ? 0 : null`);
      ctx.indent++;
    } else {
      ctx.write(`() => {`);
      ctx.indent++;
      n.parts.forEach((p, i) => {
        ctx.write(true, `if(${p.exp}) return ${i};`);
      });
      if (n.elseBlock) ctx.write(true, `return ${n.parts.length};`);
      ctx.write(true, `}`);
    }
    ctx.write(`, [`);
    n.elseBlock && n.parts.push({ block: n.elseBlock });
    n.parts.forEach((p, i) => {
      if (i) ctx.write(', ');
      ctx.add(p.block);
    });
    ctx.write(']');

    ctx.indent--;
    ctx.write(true);
    if (!n.label.node) ctx.write(', true');
    ctx.write(');', true);
  });
}
