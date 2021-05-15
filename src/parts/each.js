
import { assert, isSimpleName, detectExpressionType, xNode, trimEmptyNodes } from '../utils.js'


export function makeEachBlock(data, option) {

    let nodeItems = trimEmptyNodes(data.body);
    if(!nodeItems.length) nodeItems = [data.body[0]];

    let itemData = this.buildBlock({body: nodeItems}, {protectLastTag: true, inline: true});

    // #each items as item, index (key)
    let rx = data.value.match(/^#each\s+(.+)\s+as\s+(.+)$/);
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
    };

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

    this.require('apply');
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
