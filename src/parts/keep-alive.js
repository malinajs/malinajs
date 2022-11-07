import { assert, trimEmptyNodes, unwrapExp } from '../utils.js';
import { xNode } from '../xnode.js';
import { parseAttibutes } from '../parser.js';


export function makeKeepAlive(node) {
  let block;
  if(node.body && node.body.length) {
    block = this.buildBlock({ body: trimEmptyNodes(node.body) }, { }).block;
  } else {
    this.warning(`Empty block: '${node.value}'`);
    return xNode('empty-block', (ctx, n) => {
      ctx.writeLine(`function $block() {};`);
    });
  }

  let key = null;
  let args = node.value.substr(6);
  if(args) {
    args = parseAttibutes(args);
    const a = args.find(a => a.name == 'key');
    if(a) {
      let value = a.value;
      if(value[0] == '{') value = unwrapExp(value);
      key = `() => (${value})`;
    }
  }

  if(!key) key = `() => '$$${this.uniqIndex++}'`;

  this.glob.keepAliveStore.$value();

  return xNode('keep-alive', {
    block,
    key
  }, (ctx, n) => {
    ctx.write(`$runtime.keepAlive($$keepAliveStore, ${n.key}, `);
    ctx.add(n.block);
    ctx.write(')');
  });
}
