
import acorn from 'acorn';
import { assert, isSimpleName, detectExpressionType, xNode, trimEmptyNodes, parseJS } from '../utils.js'


export function makeEachBlock(data, option) {

    let nodeItems = trimEmptyNodes(data.body);
    if(!nodeItems.length) nodeItems = [data.body[0]];

    let itemData = this.buildBlock({body: nodeItems}, {protectLastTag: true, inline: true});

    // #each items as item, index (key)
    let rx = data.value.match(/^#each\s+(.+)\s+as\s+(.+)$/s);
    assert(rx, `Wrong #each expression '${data.value}'`);
    let arrayName = rx[1];
    let right = rx[2];
    let keyName, keyFunction = null;

    // get keyName
    rx = right.match(/^(.*)\s*\(\s*([^\(\)]+)\s*\)\s*$/s);
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

    let itemName, indexName, bind0 = null;
    if(right[0] == '{' || right[0] == '[') {
        let keywords, unwrap;
        try {
            let exp = `[${right}]`;
            let e = parseJS(exp);
            assert(e.ast.body.length == 1);

            itemName = '$$item';
            let n = e.ast.body[0];
            let a = n.expression.elements[0];
            unwrap = exp.substring(a.start, a.end)
            if(n.expression.elements.length == 1) {
                indexName = '$index';
            } else {
                assert(n.expression.elements.length == 2)
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
                    for(let i in keywords) keyLink[keywords[i]] = `$$item[${i}]`;
                    makeKeyFunction(keyLink);
                }
            } else {
                assert(l.type == 'ObjectPattern');
                keywords = l.properties.map(p => p.key.name);

                if(keyName) {
                    let keyLink = {};
                    for(let k of keywords) keyLink[k] = `$$item.${k}`;
                    makeKeyFunction(keyLink);
                }
            }
        } catch (e) {
            throw new Error('Wrong destructuring in each: ' + data.value);
        }

        bind0 = xNode('each:unwrap', {
            unwrap,
            keywords
        }, (ctx, n) => {
            ctx.writeLine(`let ${n.keywords.join(', ')};`);
            ctx.writeLine(`$runtime.prefixPush($ctx.cd, () => (${n.unwrap} = $$item));`);
        });
    } else {
        rx = right.trim().split(/\s*\,\s*/);
        assert(rx.length <= 2, `Wrong #each expression '${data.value}'`);
        itemName = rx[0];
        indexName = rx[1] || '$index';
        if(keyName) {
            if(keyName == itemName) keyFunction = 'noop';
            else makeKeyFunction({[itemName]: '$$item', [indexName]: '$index'});
        }
    }
    assert(isSimpleName(itemName), `Wrong name '${itemName}'`);
    assert(isSimpleName(indexName), `Wrong name '${indexName}'`);

    let bind;
    if(itemData.source) {
        bind = xNode('function', {
            inline: true,
            arrow: true,
            args: ['$ctx', '$parentElement', itemName, indexName],
            body: [
                `let $cd = $ctx.cd;`,
                bind0,
                itemData.source,
                xNode(ctx => {
                    ctx.writeLine(`$ctx.rebind = function(_${indexName}, _${itemName}) {`);
                    ctx.indent++;
                    ctx.writeLine(`${indexName} = _${indexName};`);
                    ctx.writeLine(`${itemName} = _${itemName};`);
                    ctx.indent--;
                    ctx.writeLine(`};`);
                })
            ]
        });
    } else {
        bind = xNode('function', {
            inline: true,
            arrow: true,
            args: ['$ctx'],
            body: [`$ctx.rebind = $runtime.noop;`]
        });
    }

    const template = xNode('template', {
        inline: true,
        body: itemData.tpl,
        svg: itemData.svg
    });

    this.require('$cd');
    const source = xNode('each', {
        keyFunction,
        template,
        bind
    }, (ctx, data) => {
        ctx.writeLine(`$runtime.$$eachBlock($cd, ${option.elName}, ${option.onlyChild?1:0}, () => (${arrayName}),`);
        ctx.indent++;
        ctx.writeIndent();
        if(data.keyFunction === 'noop') ctx.write('$runtime.noop');
        else if(data.keyFunction) ctx.build(data.keyFunction);
        else ctx.write('$runtime.eachDefaultKey');
        ctx.write(`,\n`);
        ctx.writeIndent();
        ctx.build(data.template);
        ctx.write(`,\n`);
        ctx.writeIndent();
        ctx.build(data.bind);
        ctx.write(`);\n`);
        ctx.indent--;
    });
    this.detectDependency(arrayName);

    return {source};
};
