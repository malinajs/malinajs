import { xNode } from '../xnode.js';


export function attachSlot(slotName, node) {
  let props = [], staticProps = true, deepChecking = false;

  if (node.attributes && node.attributes.length) {
    node.attributes.forEach(prop => {
      let { name, value, ...ip } = this.inspectProp(prop);
      if (!ip.static) staticProps = false;
      if (ip.mod.deep) deepChecking = true;
      props.push(xNode('slot-prop', {
        name,
        value
      }, (ctx, n) => {
        ctx.write(`${n.name}: ${n.value}`);
      }));
    });
  }

  let placeholder;
  if (node.body?.length) placeholder = this.buildBlock(node).block;

  this.require('$context');
  this.require('$component');

  let result = xNode('slot', {
    $wait: ['apply'],
    name: slotName,
    props,
    staticProps,
    placeholder,
    deepChecking
  }, (ctx, n) => {
    let dynamicProps = this.inuse.apply && !n.staticProps;

    let missed = '', slotName = n.name == 'default' ? 'null' : `'${n.name}'`;
    if (dynamicProps) ctx.write(`$runtime.invokeSlot($component, ${slotName}, $context`);
    else ctx.write(`$runtime.invokeSlotBase($component, ${slotName}, $context`);

    if (n.props.length) {
      if (dynamicProps) ctx.write(', () => ({');
      else ctx.write(', {');
      n.props.forEach((prop, i) => {
        if (i) ctx.write(', ');
        ctx.add(prop);
      });
      ctx.write('}');
      if (dynamicProps) ctx.write(')');
    } else missed += ', null';

    if (n.placeholder) {
      ctx.write(missed, ', ');
      missed = '';
      ctx.add(n.placeholder);
    } else missed += ', null';

    if (dynamicProps) {
      ctx.write(missed, ', ');
      if (n.deepChecking) ctx.write('$runtime.compareDeep');
      else ctx.write('$runtime.keyComparator');
    }
    ctx.write(')');
  });
  return result;
}
