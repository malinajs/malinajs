
import { $$removeElements, childNodes, firstChild } from '../runtime/base';
import { $watch, $$compareArray, isArray } from '../runtime/cd';

export function $$eachBlock($parentCD, label, onlyChild, fn, getKey, itemTemplate, bind) {
    let $cd = $parentCD.new();

    let mapping = new Map();
    let lastNode;
    let tplLength = itemTemplate[childNodes].length;

    $watch($cd, fn, (array) => {
        if(!array) array = [];
        if(typeof(array) == 'number') array = [...Array(array)].map((_,i) => i + 1);
        else if(!isArray(array)) array = [];

        let newMapping = new Map();
        let prevNode, parentNode;
        if(onlyChild) {
            prevNode = null;
            parentNode = label;
        } else {
            prevNode = label;
            parentNode = label.parentNode;
        }

        if(mapping.size) {
            let ctx, count = 0;
            for(let i=0;i<array.length;i++) {
                ctx = mapping.get(getKey(array[i], i));
                if(ctx) {
                    ctx.a = true;
                    count++;
                }
            }

            if(!count && lastNode) {
                if(onlyChild) label.textContent = '';
                else $$removeElements(label.nextSibling, lastNode);
                $cd.children.forEach(cd => cd.destroy(false));
                $cd.children.length = 0;
                mapping.clear();
            } else {
                $cd.children = [];
                mapping.forEach(ctx => {
                    if(ctx.a) {
                        ctx.a = false;
                        $cd.children.push(ctx.cd);
                        return;
                    }
                    $$removeElements(ctx.first, ctx.last);
                    ctx.cd.destroy(false);
                });
            }
        }

        let i, item, next_ctx, ctx, nextEl;
        for(i=0;i<array.length;i++) {
            item = array[i];
            if(next_ctx) {
                ctx = next_ctx;
                next_ctx = null;
            } else ctx = mapping.get(getKey(item, i));
            if(ctx) {
                nextEl = i == 0 && onlyChild ? parentNode[firstChild] : prevNode.nextSibling;
                if(nextEl != ctx.first) {
                    let insert = true;

                    if(tplLength == 1 && (i + 1 < array.length) && prevNode.nextSibling) {
                        next_ctx = mapping.get(getKey(array[i + 1], i + 1));
                        if(prevNode.nextSibling.nextSibling === next_ctx.first) {
                            parentNode.replaceChild(ctx.first, prevNode.nextSibling);
                            insert = false;
                        }
                    }

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
                ctx.first = tpl[firstChild];
                ctx.last = tpl.lastChild;
                parentNode.insertBefore(tpl, prevNode && prevNode.nextSibling);
            }
            prevNode = ctx.last;
            newMapping.set(getKey(item, i), ctx);
        };
        lastNode = prevNode;
        mapping.clear();
        mapping = newMapping;
    }, {ro: true, cmp: $$compareArray});
};
