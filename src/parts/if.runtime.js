import { removeElements } from '../runtime/base';
import { $watch, cd_new, cd_attach, cd_detach } from '../runtime/cd';
import * as share from '../runtime/share';
import { safeGroupCall2 } from '../runtime/utils';


export function ifBlock(label, fn, parts, parentLabel) {
  let first, last, $cd, destroyList, parentCD = share.current_cd;
  share.$onDestroy(() => safeGroupCall2(destroyList, share.destroyResults));

  function createBlock(builder) {
    let $dom;
    destroyList = share.current_destroyList = [];
    let mountList = share.current_mountList = [];
    $cd = share.current_cd = cd_new(parentCD);
    try {
      $dom = builder();
    } finally {
      share.current_destroyList = share.current_mountList = share.current_cd = null;
    }
    cd_attach(parentCD, $cd);
    if($dom.nodeType == 11) {
      first = $dom.firstChild;
      last = $dom.lastChild;
    } else first = last = $dom;
    if(parentLabel) label.appendChild($dom);
    else label.parentNode.insertBefore($dom, label);
    safeGroupCall2(mountList, destroyList, 1);
  }

  function destroyBlock() {
    if(!first) return;
    share.destroyResults = [];
    safeGroupCall2(destroyList, share.destroyResults);
    destroyList.length = 0;
    if($cd) {
      cd_detach($cd);
      $cd = null;
    }
    if(share.destroyResults.length) {
      let f = first, l = last;
      Promise.allSettled(share.destroyResults).then(() => {
        removeElements(f, l);
      });
    } else removeElements(first, last);
    first = last = null;
    share.destroyResults = null;
  }

  $watch(fn, (value) => {
    destroyBlock();
    if(value != null) createBlock(parts[value]);
  });
}


export function ifBlockReadOnly(label, fn, parts, parentLabel) {
  let value = fn();
  if(value != null) {
    const $dom = parts[value]();
    if(parentLabel) label.appendChild($dom);
    else label.parentNode.insertBefore($dom, label);
  }
}
