import { cd_watchObject, cd_new, cd_attach, cd_destroy, fire } from '../runtime/cd.js';


export const invokeSlotBase = ($component, slotName, $context, props, placeholder) => {
  const $slot = $component.$option.slots?.[slotName || 'default'];
  return $slot ? $slot($component, $context, props) : placeholder?.();
};


export const invokeSlot = ($component, slotName, $context, propsFn, placeholder, cmp) => {
  const $slot = $component.$option.slots?.[slotName || 'default'];

  if ($slot) {
    let push, result;
    const w = cd_watchObject(propsFn, (value) => push?.(value), { ro: true, value: {}, cmp });
    fire(w);
    ({ push, ...result } = $slot($component, $context, w.value));
    if (push) {
      result.$cd = cd_new();
      result.$cd.watchers.push(w);
    }
    return result;
  } else return placeholder?.();
};


export const makeSlot = (parentCD, fr, fn) => {
  return (callerComponent, $context, props) => {
    const $dom = fr.cloneNode(true); const $cd = cd_new();
    cd_attach(parentCD, $cd);
    return {
      $dom,
      destroy: () => cd_destroy($cd),
      push: fn($cd, $dom, $context, callerComponent, props)
    };
  };
};
