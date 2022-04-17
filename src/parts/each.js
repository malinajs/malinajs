import { assert, isSimpleName, trimEmptyNodes, parseJS } from '../utils.js';
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
    const e = parseJS(keyName).transform((n, pk) => {
      if(n.type != 'Identifier') return;
      if(pk == 'property') return;
      let r = keyLink[n.name];
      if(r) n.name = r;
    });
    let exp = e.build(e.ast.body[0].expression);
    keyFunction = xNode('key-function', {
      exp
    }, (ctx, n) => {
      ctx.write(`($$item, $index) => ${n.exp}`);
    });
  }

  let itemName, indexName = null, blockPrefix = null;
  if(right[0] == '{' || right[0] == '[') {
    let keywords, unwrap;
    try {
      let exp = `[${right}]`;
      let e = parseJS(exp);
      assert(e.ast.body.length == 1);

      itemName = '$$item';
      let n = e.ast.body[0];
      assert(n.expression.elements.length == 1 || n.expression.elements.length == 2);
      let a = n.expression.elements[0];
      unwrap = exp.substring(a.start, a.end);
      
      if(n.expression.elements.length == 2) {
        let b = n.expression.elements[1];
        assert(b.type == 'Identifier');
        indexName = exp.substring(b.start, b.end);
      }

      e = parseJS(`(${unwrap} = $$item)`);
      let l = e.ast.body[0].expression.left;
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
      if(this.script.readOnly) ctx.writeLine(`let ${n.unwrap} = $$item;`);
      else {
        ctx.writeLine(`let ${n.keywords.join(', ')};`);
        ctx.writeLine(`$runtime.prefixPush(() => (${n.unwrap} = $$item));`);
      }
    });
  } else {
    rx = right.trim().split(/\s*\,\s*/);
    assert(rx.length <= 2, `Wrong #each expression '${data.value}'`);
    itemName = rx[0];
    indexName = rx[1] || null;
    if(keyName) {
      if(keyName == itemName) keyFunction = 'noop';
      else {
        let keyLink = {[itemName]: '$$item'};
        if(indexName) keyLink[indexName] = '$index';
        makeKeyFunction(keyLink);
      }
    }
  }
  assert(isSimpleName(itemName), `Wrong name '${itemName}'`);

  let rebind;
  if(!this.script.readOnly) {
    if(!indexName && keyName == itemName) rebind = null;
    else {
      rebind = xNode('block', {
        itemName,
        indexName
      }, (ctx, n) => {
        if(n.indexName) ctx.write(`(_${n.itemName}, _${n.indexName}) => {${n.itemName}=_${n.itemName}; ${n.indexName}=_${n.indexName};}`);
        else ctx.write(`(_${n.itemName}) => {${n.itemName}=_${n.itemName};}`);
      });
    }
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
      ctx.write(`$runtime.makeEachSingleBlock((${n.itemName}`);
      if(n.indexName) ctx.write(`, ${n.indexName}`)
      ctx.write(`) => [`);
      ctx.indent++;
      ctx.write(true);
      if(n.rebind) ctx.add(n.rebind);
      else ctx.write('null')
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
