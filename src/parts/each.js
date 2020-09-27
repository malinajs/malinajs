
import { assert, isSimpleName, detectExpressionType } from '../utils.js'


export function makeEachBlock(data, option) {
    let source = [];

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

    let itemData = this.buildBlock({body: nodeItems});

    // #each items as item, index (key)
    let rx = data.value.match(/^#each\s+(\S+)\s+as\s+(.+)$/);
    assert(rx, `Wrong #each expression '${data.value}'`);
    let arrayName = rx[1];
    let right = rx[2];
    let keyName;
    let keyFunction;

    // get keyName
    rx = right.match(/^(.*)\s*\(\s*([^\(\)]+)\s*\)\s*$/);
    if(rx) {
        right = rx[1];
        keyName = rx[2];
    }
    right = right.trim();

    let itemName, indexName, keywords, bind0 = '';
    if(right[0] == '{') {
        rx = right.match(/^\{([^}]+)\}(.*)$/);
        assert(rx, `Wrong #each expression '${data.value}'`);
        keywords = rx[1].trim().split(/\s*\,\s*/);
        itemName = '$$item';
        indexName = rx[2].trim();
        if(indexName[0] == ',') indexName = indexName.substring(1).trim();
        indexName = indexName || '$index';

        let assignVars = keywords.map(k => `${k} = $$item.${k}`).join(', ');
        bind0 = `
            var ${assignVars};
            $ctx.cd.prefix.push(() => {
                ${assignVars};
            });
        `;
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

    if(!keyName) keyFunction = 'function getKey(item) {return item;}';
    else if(keyName == indexName) keyFunction = 'function getKey(_, i) {return i;}';
    else keyFunction = `function getKey(${itemName}) {return ${keyName};}`;

    const convert = itemData.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';

    source.push(`
        {
            function bind($ctx, $template, ${itemName}, ${indexName}) {
                ${bind0}
                ${itemData.source};
                ${itemData.name}($ctx.cd, $template);
                $ctx.rebind = function(_${indexName}, _${itemName}) {
                    ${indexName} = _${indexName};
                    ${itemName} = _${itemName};
                };
            };

            ${keyFunction};

            let itemTemplate = ${convert}(\`${this.Q(itemData.tpl)}\`, true);

            $runtime.$$eachBlock($cd, ${option.elName}, ${option.onlyChild?1:0}, () => (${arrayName}), getKey, itemTemplate, bind);
        }
    `);

    return {
        source: source.join('\n')
    };
};
