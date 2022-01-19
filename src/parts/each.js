import acorn from 'acorn';
import { assert, isSimpleName, detectExpressionType, trimEmptyNodes } from '../utils.js';
import { xNode } from '../xnode.js';


export function makeEachBlock(data, option) {
  this.require('apply');

  // #each items as item, index (key)
  let rx = data.value.match(/^#each\s+(.+)\s+as\s+(.+)$/s);
  assert(rx, `Wrong #each expression '${data.value}'`);
  let arrayName = rx[1];
  let right = rx[2];
  let keyName;

  // get keyName
  rx = right.match(/^(.*)\s*\(\s*([^()]+)\s*\)\s*$/s);
  if(rx) {
    right = rx[1];
    keyName = rx[2];
  }
  right = right.trim();

  let itemName, indexName, blockPrefix = null;
  if(right[0] == '{') {
    rx = right.match(/^(\{[^}]+\})(.*)$/s);
    assert(rx, `Wrong #each expression '${data.value}'`);
    let exp = rx[1], keywords;

    try {
      keywords = acorn.parse(`(${exp} = $$item)`, { sourceType: 'module', ecmaVersion: 12 }).body[0].expression.left.properties.map(p => p.key.name);
    } catch (e) {
      throw new Error('Wrong destructuring in each: ' + data.value);
    }

    itemName = '$$item';
    indexName = rx[2].trim();
    if(indexName[0] == ',') indexName = indexName.substring(1).trim();
    indexName = indexName || '$index';

    blockPrefix = xNode('each:unwrap', {
      exp,
      keywords
    }, (ctx, n) => {
      if(this.script.readOnly) ctx.writeLine(`let ${n.exp} = $$item;`);
      else {
        ctx.writeLine(`let ${n.keywords.join(', ')};`);
        ctx.writeLine(`$runtime.prefixPush(() => (${n.exp} = $$item));`);
      }
    });
  } else {
    rx = right.trim().split(/\s*,\s*/);
    assert(rx.length <= 2, `Wrong #each expression '${data.value}'`);
    itemName = rx[0];
    indexName = rx[1] || '$index';
  }
  assert(isSimpleName(itemName), `Wrong name '${itemName}'`);
  assert(isSimpleName(indexName), `Wrong name '${indexName}'`);

  let keyFunction = null;
  if(keyName == itemName) {
    keyName = null;
    keyFunction = 'noop';
  }
  if(keyName) assert(detectExpressionType(keyName) == 'identifier', `Wrong key '${keyName}'`);

  if(keyName) {
    this.detectDependency(keyName);
    keyFunction = xNode('function', {
      inline: true,
      arrow: true,
      args: [itemName, 'i'],
      body: [xNode('block', {
        index: indexName,
        key: keyName
      }, (ctx, data) => {
        if(data.key == data.index) ctx.writeLine('return i;');
        else ctx.writeLine(`return ${data.key};`);
      })]
    });
  }

  let rebind;
  if(!this.script.readOnly) {
    rebind = xNode('block', {
      itemName,
      indexName
    }, (ctx, n) => {
      ctx.write(`(_${n.indexName}, _${n.itemName}) => {${n.indexName}=_${n.indexName}; ${n.itemName}=_${n.itemName};}`);
    });
  }

  let nodeItems = trimEmptyNodes(data.body);
  if(!nodeItems.length) nodeItems = [data.body[0]];

  let itemBlock, block = this.buildBlock({ body: nodeItems }, {
    protectLastTag: true,
    allowSingleBlock: !blockPrefix,
    each: {
      blockPrefix,
      rebind,
      itemName,
      indexName
    }
  });

  if(block.singleBlock) {
    itemBlock = xNode('each-component', {
      block: block.singleBlock,
      rebind,
      itemName,
      indexName
    }, (ctx, n) => {
      ctx.write(`$runtime.makeEachSingleBlock((${n.itemName}, ${n.indexName}) => [`);
      ctx.indent++;
      ctx.write(true);
      ctx.add(n.rebind);
      ctx.write(',', true);
      ctx.add(n.block);
      ctx.indent--;
      ctx.write(true, '])');
    });
  } else itemBlock = block.block;

  const source = xNode('each', {
    keyFunction,
    block: itemBlock
  }, (ctx, n) => {
    ctx.writeLine(`$runtime.$$eachBlock(${option.elName}, ${option.onlyChild ? 1 : 0}, () => (${arrayName}),`);
    ctx.indent++;
    ctx.write(true);
    if(n.keyFunction === 'noop') ctx.write('$runtime.noop');
    else if(n.keyFunction) ctx.add(n.keyFunction);
    else ctx.write('$runtime.eachDefaultKey');
    ctx.write(',');
    ctx.add(n.block);
    ctx.indent--;
    ctx.write(true, ');', true);
  });
  this.detectDependency(arrayName);

  return { source };
}
