import { addEvent, $watch } from '../runtime/cd.js';


export const radioButton = (el, getValue, getter, setter) => {
  let w = $watch(getter, (value) => {
    el.checked = getValue() === value;
  });
  addEvent(el, 'change', () => {
    if (el.checked) setter(w.value = getValue());
  });
};
