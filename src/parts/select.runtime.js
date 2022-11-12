
import { addEvent, $watch } from '../runtime/cd.js';


export const selectElement = (el, getter, setter) => {
  addEvent(el, 'change', () => {
    let op = el.querySelector(':checked');
    if(op?.$$value) {
      let value = op.$$value();
      setter(value);
      w.value = value;
    }
  });
  let w = $watch(getter, (value) => {
    for(let op of el.options) {
      if(op.$$value?.() === value) {
        op.selected = true;
        return;
      }
    }
    el.selectedIndex = -1;
  });
}

export const selectOption = (op, getter) => {
  op.$$value = getter;
}
