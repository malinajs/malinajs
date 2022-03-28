import { $$removeElements, firstChild, insertAfter } from '../runtime/base';
import { $watch, keyComparator, cd_component, cd_new, cd_attach2, cd_detach } from '../runtime/cd';
import { share } from '../runtime/share.js';
import { safeGroupCall } from '../runtime/utils.js';


export function $$awaitBlock(label, relation, fn, build_main, build_then, build_catch) {
  let parentCD = share.current_cd, first, last, $cd, promise, destroyList, status = 0;
  share.$onDestroy(() => safeGroupCall(destroyList));

  function destroyBlock() {
    if(!first) return;

    safeGroupCall(destroyList);
    destroyList.length = 0;
    if($cd) {
      cd_detach($cd);
      $cd = null;
    }
    $$removeElements(first, last);
    first = last = null;
  }

  function render(builder, value) {
    destroyBlock();

    destroyList = share.current_destroyList = [];
    $cd = share.current_cd = cd_new();
    let $dom;
    try {
      $dom = builder(value);
    } finally {
      share.current_destroyList = null;
      share.current_cd = null;
    }
    cd_attach2(parentCD, $cd);
    if($dom.nodeType == 11) {
      first = $dom[firstChild];
      last = $dom.lastChild;
    } else first = last = $dom;
    insertAfter(label, $dom);
    cd_component(parentCD).apply();
  }

  $watch(relation, () => {
    let p = fn();
    if(status !== 1) render(build_main);
    status = 1;
    if(p && p instanceof Promise) {
      promise = p;
      promise.then(value => {
        status = 2;
        if(promise !== p) return;
        render(build_then, value);
      }).catch(value => {
        status = 3;
        if(promise !== p) return;
        render(build_catch, value);
      });
    }
  }, { ro: true, value: [], cmp: keyComparator });
}
