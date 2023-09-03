
import { assert, unwrapExp, detectExpressionType, last } from '../utils.js';
import { xNode } from '../xnode.js';


export function radioInput(node, el) {
  // Usage: <input type="radio" name={value} value={it} />
  assert(node.name == 'input');
  if (!node.attributes.some(a => a.name == 'type' && a.value == 'radio')) return null;
  const aName = node.attributes.find(a => a.name == 'name');
  if(!aName.value.startsWith('{')) return null;
  const aValue = node.attributes.find(a => a.name == 'value');

  aName._skip = true;
  aValue._skip = true;

  const name = unwrapExp(aName.value);
  assert(detectExpressionType(name) == 'identifier', 'Wrong name for radio input');
  let value = aValue.value;
  if(value.match(/^\{.+\}$/)) value = unwrapExp(aValue.value);
  else value = '`' + value + '`';

  this.require('apply');

  return xNode('radioInput', {
    name,
    value,
    el: el.bindName()
  }, (ctx, n) => {
    ctx.write(true, `$runtime.radioButton(${n.el}, () => (${n.value}), () => (${n.name}), ($$) => {${n.name} = $$; $$apply();});`);
  });
}
