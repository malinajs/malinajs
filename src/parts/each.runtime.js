import { $$removeElements, firstChild, iterNodes } from '../runtime/base';
import { $watch, $$compareArray, isArray, cd_attach, cd_new, cd_destroy } from '../runtime/cd';
import * as cdruntime from '../runtime/cd';


export const makeEachBlock = (fr, fn) => {
  return (item, index) => {
    const $dom = fr.cloneNode(true); const $cd = cd_new();
    const rebind = fn($cd, $dom, item, index);
    return { $cd, $dom, rebind };
  };
};


export const makeStaticEachBlock = (fr, fn) => {
  return (item, index) => {
    const $dom = fr.cloneNode(true);
    const rebind = fn($dom, item, index);
    return { $dom, rebind };
  };
};


export const makeEachSingleBlock = (fn) => {
  return (item, index) => {
    const [rebind, component] = fn(item, index);
    const { $cd, destroy, $dom } = component;
    return { $cd, destroy, $dom, rebind };
  };
};


export function $$eachBlock($parentCD, label, onlyChild, fn, getKey, bind) {
  const eachCD = cd_new();
  cd_attach($parentCD, eachCD);

  let mapping = new Map();
  let lastNode; let vi = 0;

  $watch(eachCD, fn, (array) => {
    if (!array) array = [];
    if (typeof (array) == 'number') array = [...Array(array)].map((_, i) => i + 1);
    else if (!isArray(array)) array = [];

    const newMapping = new Map();
    let prevNode, parentNode;
    if (onlyChild) {
      prevNode = null;
      parentNode = label;
    } else {
      prevNode = label;
      parentNode = label.parentNode;
    }

    if (mapping.size) {
      let ctx; let count = 0;
      vi++;
      for (let i = 0; i < array.length; i++) {
        ctx = mapping.get(getKey(array[i], i, array));
        if (ctx) {
          ctx.a = vi;
          count++;
        }
      }

      if (!count && lastNode) {
        cdruntime.destroyResults = [];
        eachCD.children.forEach((cd) => cd_destroy(cd, false));
        eachCD.children.length = 0;
        mapping.forEach((ctx) => ctx.destroy?.());
        mapping.clear();

        if (cdruntime.destroyResults.length) {
          const removedNodes = [];
          iterNodes(onlyChild ? label.firstChild : label.nextSibling, lastNode, (n) => {
            n.$$removing = true;
            removedNodes.push(n);
          });
          Promise.allSettled(cdruntime.destroyResults).then(() => removedNodes.forEach((n) => n.remove()));
        } else {
          if (onlyChild) label.textContent = '';
          else $$removeElements(label.nextSibling, lastNode);
        }

        cdruntime.destroyResults = null;
      } else if (count < mapping.size) {
        eachCD.children = [];
        cdruntime.destroyResults = [];
        const removedNodes = [];
        mapping.forEach((ctx) => {
          if (ctx.a == vi) {
            ctx.$cd && eachCD.children.push(ctx.$cd);
            return;
          }
          ctx.$cd && cd_destroy(ctx.$cd, false);
          ctx.destroy?.();
          iterNodes(ctx.first, ctx.last, (n) => {
            n.$$removing = true;
            removedNodes.push(n);
          });
        });

        if (cdruntime.destroyResults.length) {
          Promise.allSettled(cdruntime.destroyResults).then(() => removedNodes.forEach((n) => n.remove()));
        } else {
          removedNodes.forEach((n) => n.remove());
        }
        cdruntime.destroyResults = null;
      }
    }

    let i, item, next_ctx, ctx, nextEl, key;
    for (i = 0; i < array.length; i++) {
      item = array[i];
      key = getKey(item, i, array);
      if (next_ctx) {
        ctx = next_ctx;
        next_ctx = null;
      } else ctx = mapping.get(key);
      if (ctx) {
        nextEl = i == 0 && onlyChild ? parentNode[firstChild] : prevNode.nextSibling;
        while (nextEl && nextEl.$$removing) nextEl = nextEl.nextSibling;
        if (nextEl != ctx.first) {
          let insert = true;

          if (ctx.first == ctx.last && (i + 1 < array.length) && prevNode?.nextSibling) {
            next_ctx = mapping.get(getKey(array[i + 1], i + 1, array));
            if (next_ctx && prevNode.nextSibling.nextSibling === next_ctx.first) {
              parentNode.replaceChild(ctx.first, prevNode.nextSibling);
              insert = false;
            }
          }

          if (insert) {
            const insertBefore = prevNode?.nextSibling;
            let next; let el = ctx.first;
            while (el) {
              next = el.nextSibling;
              parentNode.insertBefore(el, insertBefore);
              if (el == ctx.last) break;
              el = next;
            }
          }
        }
        ctx.rebind?.(i, item);
      } else {
        let $dom;
        ({ $dom, ...ctx } = bind(item, i));
        cd_attach(eachCD, ctx.$cd);
        if ($dom.nodeType == 11) {
          ctx.first = $dom[firstChild];
          ctx.last = $dom.lastChild;
        } else ctx.first = ctx.last = $dom;
        parentNode.insertBefore($dom, prevNode?.nextSibling);
      }
      prevNode = ctx.last;
      newMapping.set(key, ctx);
    }
    lastNode = prevNode;
    mapping.clear();
    mapping = newMapping;
  }, { ro: true, cmp: $$compareArray });
}
