import { iterNodes } from '../runtime/base';
import { cd_new, cd_attach, cd_detach } from '../runtime/cd';
import * as share from '../runtime/share';
import { safeGroupCall } from '../runtime/utils';


export const keepAlive = (store, keyFn, builder) => {
  if(!store.$$d) store.$$d = [];
  const key = keyFn();
  let block = store.get(key);
  const parentCD = share.current_cd;

  share.$onDestroy(() => {
    if(!block.fr) block.fr = new DocumentFragment();
    iterNodes(block.first, block.last, n => block.fr.appendChild(n));
    cd_detach(block.$cd);
  });

  if(block) {
    cd_attach(parentCD, block.$cd);
    return block.fr;
  } else {
    let $dom, first, last, prev_destroyList = share.current_destroyList;
    let destroyList = share.current_destroyList = [];
    let $cd = share.current_cd = cd_new(parentCD);
    try {
      $dom = builder();
    } finally {
      share.current_destroyList = prev_destroyList;
      share.current_cd = parentCD;
    }
    cd_attach(parentCD, $cd);
    if($dom.nodeType == 11) {
      first = $dom.firstChild;
      last = $dom.lastChild;
    } else first = last = $dom;

    store.$$d.push(() => safeGroupCall(destroyList));
    store.set(key, block = {first, last, $cd});

    return $dom;
  }
}
