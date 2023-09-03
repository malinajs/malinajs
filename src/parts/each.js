import { assert, isSimpleName, trimEmptyNodes, parseJS, replaceKeyword } from '../utils.js';
import { xNode } from '../xnode.js';


export function makeEachBlock(data, option) {
  this.require('rootCD');

  // #each items as item, index (key)
  let rx = data.value.match(/^#each\s+(.+)\s+as\s+(.+)$/s);
  assert(rx, `Wrong #each expression '${data.value}'`);
  let arrayName = rx[1];
  let right = rx[2];
  let keyName, keyFunction = null;

  // get keyName
  rx = right.match(/^(.*)\s*\(\s*([^()]+)\s*\)\s*$/s);
  if(rx) {
    right = rx[1];
    keyName = rx[2];
  }
  right = right.trim();

  const makeKeyFunction = (keyLink) => {
    keyFunction = xNode('key-function', {
      exp: replaceKeyword(keyName, n => keyLink[n])
    }, (ctx, n) => {
      ctx.write(`($$item, $index) => ${n.exp}`);
    });
  };

  let itemName, indexName = null, blockPrefix = null;
  if(right[0] == '{' || right[0] == '[') {
    let keywords, unwrap;
    try {
      let exp = `[${right}]`;
      let e = parseJS(exp);
      assert(e.ast.elements.length == 1 || e.ast.elements.length == 2);
      itemName = '$$item';

      unwrap = e.build(e.ast.elements[0]);

      if(e.ast.elements.length == 2) {
        let b = e.ast.elements[1];
        assert(b.type == 'Identifier');
        indexName = e.build(b);
      }

      e = parseJS(`(${unwrap} = $$item)`);
      let l = e.ast.left;
      if(l.type == 'ArrayPattern') {
        keywords = l.elements.map(p => p.name);

        if(keyName) {
          let keyLink = {};
          if(indexName) keyLink[indexName] = '$index';
          for(let i in keywords) keyLink[keywords[i]] = `$$item[${i}]`;
          makeKeyFunction(keyLink);
        }
      } else {
        assert(l.type == 'ObjectPattern');
        keywords = l.properties.map(p => p.key.name);

        if(keyName) {
          let keyLink = {};
          if(indexName) keyLink[indexName] = '$index';
          for(let k of keywords) keyLink[k] = `$$item.${k}`;
          makeKeyFunction(keyLink);
        }
      }
    } catch (e) {
      throw new Error('Wrong destructuring in each: ' + data.value);
    }

    blockPrefix = xNode('each:unwrap', {
      unwrap,
      keywords
    }, (ctx, n) => {
      ctx.writeLine(`let ${n.keywords.join(', ')};`);
      ctx.writeLine(`$runtime.prefixPush(() => (${n.unwrap} = $$item));`);
    });
  } else {
    rx = right.trim().split(/\s*\,\s*/);
    assert(rx.length <= 2, `Wrong #each expression '${data.value}'`);
    itemName = rx[0];
    indexName = rx[1] || null;
    if(keyName) {
      if(keyName == itemName) keyFunction = 'noop';
      else {
        let keyLink = { [itemName]: '$$item' };
        if(indexName) keyLink[indexName] = '$index';
        makeKeyFunction(keyLink);
      }
    }
  }
  assert(isSimpleName(itemName), `Wrong name '${itemName}'`);

  let rebind;
  if(!indexName && keyName == itemName) rebind = null;
  else {
    rebind = xNode('rebind', {
      itemName,
      indexName
    }, (ctx, n) => {
      if(n.indexName) ctx.write(`(_${n.itemName}, _${n.indexName}) => {${n.itemName}=_${n.itemName}; ${n.indexName}=_${n.indexName};}`);
      else ctx.write(`(_${n.itemName}) => {${n.itemName}=_${n.itemName};}`);
    });
  }

  let nodeItems = trimEmptyNodes(data.mainBlock);
  if(!nodeItems.length) nodeItems = [data.mainBlock[0]];

  let itemBlock, block = this.buildBlock({ body: nodeItems }, {
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
      reference: block.reference,
      rebind,
      itemName,
      indexName
    }, (ctx, n) => {
      ctx.write(`$runtime.makeEachSingleBlock((${n.itemName}`);
      if (n.indexName) ctx.write(`, ${n.indexName}`);
      ctx.write(') => [');
      ctx.indent++;
      ctx.write(true);
      if (n.rebind) ctx.add(n.rebind);
      else ctx.write('null');
      ctx.write(',', true);
      if (n.reference) {
        ctx.write(true, `(${n.reference} = `);
        ctx.add(n.block);
        ctx.write(')', true);
      } else {
        ctx.add(n.block);
      }
      ctx.indent--;
      ctx.write(true, '])');
    });
  } else itemBlock = block.block;

  let elseBlock = null;
  if(data.elseBlock) {
    let block = this.buildBlock({ body: data.elseBlock }, {
      allowSingleBlock: false
    });
    elseBlock = block.block;
  }

  const source = xNode('each', {
    keyFunction,
    block: itemBlock,
    elseBlock,
    label: option.label,
    onlyChild: option.onlyChild
  }, (ctx, n) => {
    let el = n.onlyChild ? n.label : n.label.name;
    let mode = 0;
    if(n.onlyChild) mode = 1;
    else if(!n.label.node) mode = 2;
    ctx.writeLine(`$runtime.$$eachBlock(${el}, ${mode}, () => (${arrayName}),`);
    ctx.indent++;
    ctx.write(true);
    if(n.keyFunction === 'noop') ctx.write('$runtime.noop');
    else if(n.keyFunction) ctx.add(n.keyFunction);
    else ctx.write('$runtime.eachDefaultKey');
    ctx.write(',');
    ctx.add(n.block);
    if(n.elseBlock) {
      ctx.write(', $runtime.makeEachElseBlock(');
      ctx.add(n.elseBlock);
      ctx.write(')');
    }
    ctx.indent--;
    ctx.write(true, ');', true);
  });
  this.detectDependency(arrayName);

  return { source };
}
