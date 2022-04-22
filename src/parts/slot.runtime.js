import { WatchObject, cd_new, cd_attach2, fire, cd_detach } from '../runtime/cd.js';
import * as share from '../runtime/share.js';

export const invokeSlotBase = ($component, slotName, $context, props, placeholder) => {
  let $slot = $component.$option.slots?.[slotName || 'default'];
  return $slot ? $slot($component, $context, props) : placeholder?.();
};

export const invokeSlot = ($component, slotName, $context, propsFn, placeholder, cmp) => {
  let $slot = $component.$option.slots?.[slotName || 'default'];

  if($slot) {
    let push, w = new WatchObject(propsFn, value => push(value));
    Object.assign(w, {value: {}, cmp, idle: true});
    fire(w);
    let $dom = $slot($component, $context, w.value);
    if($dom.$dom) {
      if($dom.push) {
        push = $dom.push;
        share.current_cd.watchers.push(w);
      }
      $dom = $dom.$dom;
    }
    return $dom;
  } else return placeholder?.();
};

export const makeSlot = (fr, fn) => {
  let parentCD = share.current_cd;
  return (callerComponent, $context, props) => {
    let $dom = fr.cloneNode(true), prev = share.current_cd, $cd = share.current_cd = cd_new();
    cd_attach2(parentCD, $cd);
    share.$onDestroy(() => cd_detach($cd));
    parentCD.component.apply();
    try {
      return {$dom, push: fn($dom, $context, callerComponent, props)};
    } finally {
      share.current_cd = prev;
    }
  };
};
