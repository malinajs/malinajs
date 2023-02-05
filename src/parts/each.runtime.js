import { removeElements, iterNodes } from '../runtime/base';
import { $watch, compareArray, isArray, cd_attach, cd_new, cd_detach } from '../runtime/cd';
import * as share from '../runtime/share';
import { safeGroupCall2, isObject } from '../runtime/utils';


export const eachDefaultKey = (item, index, array) => isObject(array[0]) ? item : index;


export const makeEachBlock = (fr, fn) => {
  return (item, index) => {
    let $dom = fr.cloneNode(true);
    return [$dom, fn($dom, item, index)];
  };
};


export const makeEachSingleBlock = (fn) => {
  return (item, index) => {
    let [rebind, component] = fn(item, index);
    return [component.$dom, rebind];
  };
};


export const makeEachElseBlock = (fn) => {
  return (label, mode, parentCD) => {
    let first, last;
    let destroyList = share.current_destroyList = [];
    let $cd = share.current_cd = cd_new(parentCD);
    share.current_mountList = [];
    const parentNode = mode ? label : label.parentNode;
    try {
      let $dom = fn();
      if($dom.nodeType == 11) {
        first = $dom.firstChild;
        last = $dom.lastChild;
      } else first = last = $dom;
      cd_attach(parentCD, $cd);
      parentNode.insertBefore($dom, mode ? null : label);
      safeGroupCall2(share.current_mountList, destroyList, 1);
    } finally {
      share.current_destroyList = share.current_mountList = share.current_cd = null;
    }

    return () => {
      cd_detach($cd);
      share.destroyResults = [];
      safeGroupCall2(destroyList, share.destroyResults);

      if(share.destroyResults.length) {
        const f = first, l = last;
        iterNodes(f, l, n => n.$$removing = true);
        Promise.allSettled(share.destroyResults).then(() => iterNodes(f, l, n => n.remove()));
      } else {
        removeElements(first, last);
      }
      share.destroyResults = null;
    };
  };
};


export function $$eachBlock(label, mode, fn, getKey, bind, buildElseBlock) {
  let parentCD = share.current_cd;
  let eachCD = cd_new();
  cd_attach(parentCD, eachCD);

  let mapping = new Map();
  let firstNode, vi = 0, p_promise = 0, p_destroy = 0, elseBlock;
  const onlyChild = mode == 1;

  const destroyAll = () => {
    p_destroy && mapping.forEach(ctx => safeGroupCall2(ctx.d, share.destroyResults));
    mapping.clear();
  };

  share.$onDestroy(destroyAll);
  buildElseBlock && share.$onDestroy(() => elseBlock?.());

  $watch(fn, (array) => {
    if(!array) array = [];
    if(typeof (array) == 'number') array = [...Array(array)].map((_, i) => i + 1);
    else if(!isArray(array)) array = [];

    let newMapping = new Map();
    let parentNode = mode ? label : label.parentNode;

    if(mapping.size) {
      let ctx, count = 0;
      vi++;
      for(let i = 0; i < array.length; i++) {
        ctx = mapping.get(getKey(array[i], i, array));
        if(ctx) {
          ctx.a = vi;
          count++;
        }
      }

      if(!count && firstNode) {
        share.destroyResults = [];
        eachCD.children.length = 0;
        destroyAll();

        if(share.destroyResults.length) {
          p_promise = 1;
          let removedNodes = [];
          iterNodes(firstNode, onlyChild ? null : label.previousSibling, n => {
            n.$$removing = true;
            removedNodes.push(n);
          });
          Promise.allSettled(share.destroyResults).then(() => removedNodes.forEach(n => n.remove()));
        } else {
          if(onlyChild) label.textContent = '';
          else removeElements(firstNode, label.previousSibling);
        }

        share.destroyResults = null;
      } else if(count < mapping.size) {
        eachCD.children = [];
        share.destroyResults = [];
        let removedNodes = [];
        mapping.forEach(ctx => {
          if(ctx.a == vi) {
            ctx.$cd && eachCD.children.push(ctx.$cd);
            return;
          }
          safeGroupCall2(ctx.d, share.destroyResults);
          iterNodes(ctx.first, ctx.last, n => removedNodes.push(n));
        });

        if(share.destroyResults.length) {
          p_promise = 1;
          removedNodes.forEach(n => n.$$removing = true);
          Promise.allSettled(share.destroyResults).then(() => removedNodes.forEach(n => n.remove()));
        } else {
          removedNodes.forEach(n => n.remove());
        }
        share.destroyResults = null;
      }
    }

    if(elseBlock && array.length) {
      elseBlock();
      elseBlock = null;
    }

    let i, item, next_ctx, ctx, nextEl, key;
    let nextNode = mode ? null : label;
    i = array.length;
    while(i--) {
      item = array[i];
      key = getKey(item, i, array);
      if(next_ctx) {
        ctx = next_ctx;
        next_ctx = null;
      } else ctx = mapping.get(key);
      if(ctx) {
        nextEl = nextNode ? nextNode.previousSibling : parentNode.lastChild;
        if(p_promise) while(nextEl && nextEl.$$removing) nextEl = nextEl.previousSibling;
        if(nextEl != ctx.last) {
          let insert = true;

          if(ctx.first == ctx.last && (i > 0) && nextEl) {
            next_ctx = mapping.get(getKey(array[i - 1], i - 1, array));
            if(next_ctx && nextEl.previousSibling === next_ctx.last) {
              parentNode.replaceChild(ctx.first, nextEl);
              insert = false;
            }
          }

          if(insert) {
            let next, el = ctx.first;
            while(el) {
              next = el.nextSibling;
              parentNode.insertBefore(el, nextNode);
              if(el == ctx.last) break;
              el = next;
            }
          }
        }
        ctx.rebind?.(item, i);
        nextNode = ctx.first;
      } else {
        let $dom, rebind,
          d = share.current_destroyList = [],
          m = share.current_mountList = [],
          $cd = share.current_cd = cd_new(eachCD);
        try {
          ([$dom, rebind] = bind(item, i));
        } finally {
          share.current_destroyList = share.current_mountList = share.current_cd = null;
        }
        ctx = { $cd, rebind };
        cd_attach(eachCD, $cd);
        if($dom.nodeType == 11) {
          ctx.first = $dom.firstChild;
          ctx.last = $dom.lastChild;
        } else ctx.first = ctx.last = $dom;
        parentNode.insertBefore($dom, nextNode);
        nextNode = ctx.first;
        safeGroupCall2(m, d, 1);
        if(d.length) {
          ctx.d = d;
          p_destroy = 1;
        }
      }
      newMapping.set(key, ctx);
    }
    firstNode = nextNode;
    mapping.clear();
    mapping = newMapping;

    if(!array.length && !elseBlock && buildElseBlock) {
      elseBlock = buildElseBlock(label, mode, parentCD);
    }
  }, { cmp: compareArray });
}
