
import { assert, isSimpleName, detectExpressionType } from '../utils.js'


export function makeEachBlock(data, topElementName) {
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

    rx = right.match(/^(.*)\s+\(\s*([^\(\)]+)\s*\)\s*$/);
    if(rx) {
        right = rx[1];
        keyName = rx[2];
    }
    rx = right.trim().split(/\s*\,\s*/);
    assert(rx.length <= 2, `Wrong #each expression '${data.value}'`);
    let itemName = rx[0];
    let indexName = rx[1] || '$index';
    assert(isSimpleName(itemName), `Wrong name '${itemName}'`);
    assert(isSimpleName(indexName), `Wrong name '${indexName}'`);

    if(keyName == itemName) keyName = null;
    if(keyName) assert(detectExpressionType(keyName) == 'identifier', `Wrong key '${keyName}'`);

    if(!keyName) keyFunction = 'function getKey(item) {return item;}';
    else if(keyName == indexName) keyFunction = 'function getKey(_, i) {return i;}';
    else keyFunction = `function getKey(${itemName}) {return ${keyName};}`;

    let eachBlockName = 'eachBlock' + (this.uniqIndex++);
    source.push(`
        function ${eachBlockName} ($cd, top) {

            function bind($ctx, $template, ${itemName}, ${indexName}) {
                ${itemData.source};
                ${itemData.name}($ctx.cd, $template);
                $ctx.rebind = function(_${indexName}, _${itemName}) {
                    ${indexName} = _${indexName};
                    ${itemName} = _${itemName};
                };
            };

            ${keyFunction};

            let itemTemplate = $$htmlToFragment(\`${this.Q(itemData.tpl)}\`, true);

            let mapping = new Map();
            let lineArray = [];
            $watch($cd, () => (${arrayName}), (array) => {
                if(!array) array = [];
                if(typeof(array) == 'number') {
                    lineArray.length = array;
                    array--;
                    while(array >= 0 && !lineArray[array]) lineArray[array] = array-- + 1;
                    array = lineArray;
                } else if(!Array.isArray(array)) array = [];

                let prevNode = top;
                let newMapping = new Map();

                if(mapping.size) {
                    let arrayAsSet = new Set();
                    for(let i=0;i<array.length;i++) {
                        arrayAsSet.add(getKey(array[i], i));
                    }
                    mapping.forEach((ctx, key) => {
                        if(arrayAsSet.has(key)) return;
                        $$removeElements(ctx.first, ctx.last);
                        ctx.cd.destroy();
                        $$removeItem($cd.children, ctx.cd);
                    });
                    arrayAsSet.clear();
                }

                let parentNode = top.parentNode;
                let i, item, next_ctx, el, ctx;
                for(i=0;i<array.length;i++) {
                    item = array[i];
                    if(next_ctx) {
                        ctx = next_ctx;
                        next_ctx = null;
                    } else ctx = mapping.get(getKey(item, i));
                    if(ctx) {
                        if(prevNode.nextSibling != ctx.first) {
                            let insert = true;

                ` + (nodeItems.length==1?`
                            if(i + 1 < array.length && prevNode.nextSibling) {
                                next_ctx = mapping.get(getKey(array[i + 1], i + 1));
                                if(prevNode.nextSibling.nextSibling === next_ctx.first) {
                                    parentNode.replaceChild(ctx.first, prevNode.nextSibling);
                                    insert = false;
                                }
                            }
                `:``) + `
                            if(insert) {
                                let insertBefore = prevNode.nextSibling;
                                let next, el = ctx.first;
                                while(el) {
                                    next = el.nextSibling;
                                    parentNode.insertBefore(el, insertBefore);
                                    if(el == ctx.last) break;
                                    el = next;
                                }
                            }
                        }
                        ctx.rebind(i, item);
                    } else {
                        let tpl = itemTemplate.cloneNode(true);
                        let childCD = $cd.new();
                        ctx = {cd: childCD};
                        bind(ctx, tpl, item, i);
                        ctx.first = tpl.firstChild;
                        ctx.last = tpl.lastChild;
                        parentNode.insertBefore(tpl, prevNode.nextSibling);
                    }
                    prevNode = ctx.last;
                    newMapping.set(getKey(item, i), ctx);
                };
                mapping.clear();
                mapping = newMapping;
            }, {cmp: $$compareArray});
        }
        ${eachBlockName}($cd, ${topElementName});
    `);

    return {
        source: source.join('\n')
    }
};
