
import { assert, Q } from '../utils.js'

let uniqIndex = 0;


export function makeEachBlock(data, topElementName) {
    let source = [];

    let nodeItems = data.body.filter(n => n.type == 'node');
    if(!nodeItems.length) nodeItems = [data.body[0]];
    assert(nodeItems.length === 1, 'Only 1 node for #each');
    let itemData = this.buildBlock({body: nodeItems}, {top0: true});

    let rx = data.value.match(/^#each\s+(\S+)\s+as\s+(\w+)\s*$/);
    assert(rx, 'Wrong #each expression');
    let arrayName = rx[1];
    let itemName = rx[2];

    let eachBlockName = 'eachBlock' + (uniqIndex++);
    source.push(`
        function ${eachBlockName} ($cd, top) {

            function bind($ctx, ${itemName}, $index) {
                ${itemData.source};
                ${itemData.name}($ctx.cd, $ctx.el);
                $ctx.reindex = function(i) { $index = i; };
            };

            let parentNode = top.parentNode;
            let srcNode = document.createElement("${data.parent.name}");
            srcNode.innerHTML=\`${Q(itemData.tpl)}\`;
            srcNode=srcNode.firstChild;

            let mapping = new Map();
            $cd.wa(() => (${arrayName}), (array) => {
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
                        ctx.el.remove();
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
                        el = ctx.el;

                        if(el.previousSibling != prevNode) {
                            let insert = true;

                            if(i + 1 < array.length && prevNode.nextSibling) {
                                next_ctx = mapping.get(array[i + 1]);
                                if(prevNode.nextSibling.nextSibling === next_ctx.el) {
                                    parentNode.replaceChild(el, prevNode.nextSibling);
                                    insert = false;
                                }
                            }

                            if(insert) {
                                parentNode.insertBefore(el, prevNode.nextSibling);
                            }
                        }
    
                        ctx.reindex(i);
                    } else {
                        el = srcNode.cloneNode(true);
                        let childCD = $cd.new();
                        ctx = {el: el, cd: childCD};
                        bind(ctx, item, i);
                        parentNode.insertBefore(el, prevNode.nextSibling);
                    }
                    prevNode = el;
                    newMapping.set(item, ctx);

                };
                mapping.clear();
                mapping = newMapping;

            });

        }
        ${eachBlockName}($cd, ${topElementName});
    `);

    return {
        source: source.join('\n')
    }
};
