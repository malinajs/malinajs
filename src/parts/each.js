
import { assert, Q } from '../utils.js'

let uniqIndex = 0;


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

    let rx = data.value.match(/^#each\s+(\S+)\s+as\s+(\w+)\s*$/);
    assert(rx, 'Wrong #each expression');
    let arrayName = rx[1];
    let itemName = rx[2];

    let eachBlockName = 'eachBlock' + (uniqIndex++);
    source.push(`
        function ${eachBlockName} ($cd, top) {

            function bind($ctx, $template, ${itemName}, $index) {
                ${itemData.source};
                ${itemData.name}($ctx.cd, $template);
                $ctx.reindex = function(i) { $index = i; };
            };

            let parentNode = top.parentNode;
            let itemTemplate = $$htmlToFragment(\`${Q(itemData.tpl)}\`);

            let mapping = new Map();
            $watch($cd, () => (${arrayName}), (array) => {
                if(!array || !Array.isArray(array)) array = [];
                let prevNode = top;
                let newMapping = new Map();

                if(mapping.size) {
                    let arrayAsSet = new Set();
                    for(let i=0;i<array.length;i++) {
                        arrayAsSet.add(array[i]);
                    }
                    mapping.forEach((ctx, item) => {
                        if(arrayAsSet.has(item)) return;
                        let el = ctx.first;
                        while(el) {
                            let next = el.nextSibling;
                            el.remove();
                            if(el == ctx.last) break;
                            el = next;
                        }
                        ctx.cd.destroy();
                        $$removeItem($cd.children, ctx.cd);
                    });
                    arrayAsSet.clear();
                }

                let i, item, next_ctx, el, ctx;
                for(i=0;i<array.length;i++) {
                    item = array[i];
                    if(next_ctx) {
                        ctx = next_ctx;
                        next_ctx = null;
                    } else ctx = mapping.get(item);
                    if(ctx) {
                        if(prevNode.nextSibling != ctx.first) {
                            let insert = true;

                ` + (nodeItems.length==1?`
                            if(i + 1 < array.length && prevNode.nextSibling) {
                                next_ctx = mapping.get(array[i + 1]);
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
                        ctx.reindex(i);
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
                    newMapping.set(item, ctx);
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
