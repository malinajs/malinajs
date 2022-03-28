import { $$removeElements, firstChild, insertAfter } from '../runtime/base';
import { $watch, cd_new, cd_attach2, cd_detach } from '../runtime/cd';
import { share } from '../runtime/share.js';
import { safeGroupCall } from '../runtime/utils';


export function ifBlock(label, fn, build, buildElse) {
  let first, last, $cd, destroyList, parentCD = share.current_cd;
  share.$onDestroy(() => safeGroupCall(destroyList));

  function createBlock(builder) {
    let $dom;
    destroyList = share.current_destroyList = [];
    $cd = share.current_cd = cd_new();
    try {
      $dom = builder();
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
  }

  function destroyBlock() {
    if(!first) return;
    share.destroyResults = [];
    safeGroupCall(destroyList);
    destroyList.length = 0;
    if($cd) {
      cd_detach($cd);
      $cd = null;
    }
    if(share.destroyResults.length) {
      let f = first, l = last;
      Promise.allSettled(share.destroyResults).then(() => {
        $$removeElements(f, l);
      });
    } else $$removeElements(first, last);
    first = last = null;
    share.destroyResults = null;
  }

  $watch(fn, (value) => {
    if(value) {
      destroyBlock();
      createBlock(build);
    } else {
      destroyBlock();
      if(buildElse) createBlock(buildElse);
    }
  });
}


export function ifBlockReadOnly(label, fn, build, buildElse) {
  function createBlock(builder) {
    insertAfter(label, builder());
  }

  if(fn()) createBlock(build);
  else if(buildElse) createBlock(buildElse);
}
