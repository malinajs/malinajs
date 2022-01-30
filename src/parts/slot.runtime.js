import { $watch, WatchObject, cd_new, cd_attach2, fire, cd_detach } from '../runtime/cd.js';
import * as share from '../runtime/share.js';

export const invokeSlotBase = ($component, slotName, $context, props, placeholder) => {
  let $slot = $component.$option.slots?.[slotName || 'default'];
  return $slot ? $slot($component, $context, props)[0] : placeholder?.();
};

export const invokeSlot = ($component, slotName, $context, propsFn, placeholder, cmp) => {
  let $slot = $component.$option.slots?.[slotName || 'default'];

  if($slot) {
    let push, $dom,
      w = new WatchObject(propsFn, value => push(value), true);
    Object.assign(w, {value: {}, cmp, idle: true})
    fire(w);
    ([$dom, push] = $slot($component, $context, w.value));
    if(push) share.current_cd.watchers.push(w);
    return $dom;
  } else return placeholder?.();
};

export const makeSlot = (fr, fn) => {
  let parentCD = share.current_cd;
  return (callerComponent, $context, props) => {
    let $dom = fr.cloneNode(true), prev = share.current_cd, $cd = share.current_cd = cd_new();
    cd_attach2(parentCD, $cd);
    share.$onDestroy(() => cd_detach($cd));
    try {
      return [$dom, fn($dom, $context, callerComponent, props)];
    } finally {
      share.current_cd = prev;
    }
  };
};
