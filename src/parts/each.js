
import { assert, isSimpleName, detectExpressionType, xNode } from '../utils.js'


export function makeEachBlock(data, option) {

    let nodeItems = data.body;
    while(nodeItems.length) {
        let n = nodeItems[0];
        if(n.type == 'text' && !n.value.trim()) nodeItems.shift();
        else break;
    }
    while(nodeItems.length) {
        let n = nodeItems[nodeItems.length - 1];
        if(n.type == 'text' && !n.value.trim()) nodeItems.pop();
        else break;
    }
    if(!nodeItems.length) nodeItems = [data.body[0]];

    let itemData = this.buildBlock({body: nodeItems}, {protectLastTag: true});

    // #each items as item, index (key)
    let rx = data.value.match(/^#each\s+(\S+)\s+as\s+(.+)$/);
    assert(rx, `Wrong #each expression '${data.value}'`);
    let arrayName = rx[1];
    let right = rx[2];
    let keyName;

    // get keyName
    rx = right.match(/^(.*)\s*\(\s*([^\(\)]+)\s*\)\s*$/);
    if(rx) {
        right = rx[1];
        keyName = rx[2];
    }
    right = right.trim();

    let itemName, indexName, keywords, bind0 = null;
    if(right[0] == '{') {
        rx = right.match(/^\{([^}]+)\}(.*)$/);
        assert(rx, `Wrong #each expression '${data.value}'`);
        keywords = rx[1].trim().split(/\s*\,\s*/);
        itemName = '$$item';
        indexName = rx[2].trim();
        if(indexName[0] == ',') indexName = indexName.substring(1).trim();
        indexName = indexName || '$index';

        let assignVars = keywords.map(k => `${k} = $$item.${k}`).join(', ');
        bind0 = xNode('each:unwrap', ctx => {
            ctx.writeLine(`var ${assignVars};`);
            ctx.writeLine(`$ctx.cd.prefix.push(() => {${assignVars};});`);
        });
    } else {
        rx = right.trim().split(/\s*\,\s*/);
        assert(rx.length <= 2, `Wrong #each expression '${data.value}'`);
        itemName = rx[0];
        indexName = rx[1] || '$index';
    }
    assert(isSimpleName(itemName), `Wrong name '${itemName}'`);
    assert(isSimpleName(indexName), `Wrong name '${indexName}'`);

    if(keyName == itemName) keyName = null;
    if(keyName) assert(detectExpressionType(keyName) == 'identifier', `Wrong key '${keyName}'`);

    let keyFunction = null;
    if(keyName) {
        keyFunction = xNode('each:key', ctx => {
            if(keyName == indexName) ctx.writeLine('function getKey(_, i) {return i;}');
            else ctx.writeLine(`function getKey(${itemName}) {return ${keyName};}`);
        });
    };

    let bind;
    if(itemData.source) {
        bind = xNode('function', {
            name: 'bind',
            args: ['$ctx', '$template', itemName, indexName],
            body: [
                bind0,
                itemData.source,
                xNode(ctx => {
                    ctx.writeLine(`${itemData.name}($ctx.cd, $template);`);
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
            name: 'bind',
            args: ['$ctx'],
            body: [`$ctx.rebind = $runtime.noop;`]
        });
    }

    this.require('apply');
    const source = xNode('block', {scope: true});
    source.push(bind);
    source.push(keyFunction);
    source.push(xNode('each:template', ctx => {
        const convert = itemData.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
        let template = this.xBuild(itemData.tpl);
        ctx.writeLine(`let itemTemplate = ${convert}(\`${this.Q(template)}\`);`);
    }));
    source.push(xNode('each', ctx => {
        let getKey = keyFunction ? 'getKey' : '$runtime.noop';
        ctx.writeLine(`$runtime.$$eachBlock($cd, ${option.elName}, ${option.onlyChild?1:0}, () => (${arrayName}), ${getKey}, itemTemplate, bind);`);
    }));

    return {source};
};
