
import { addEvent, $watch, isArray } from '../runtime/cd.js';
import { $tick } from '../runtime/base.js';


export const selectElement = (el, getter, setter) => {
  addEvent(el, 'change', () => {
    let value = [];
    el.querySelectorAll(':checked').forEach(o => {
      value.push(o.$$value ? o.$$value() : o.value);
    });
    value = el.multiple ? value : value[0];
    setter(value);
    w.value = value;
  });
  const update = () => {
    let value = w.value;
    if(el.multiple) {
      if(isArray(value)) {
        for(let o of el.options) {
          const option_value = o.$$value ? o.$$value() : o.value;
          o.selected = value.indexOf(option_value) != -1;
        }
        return;
      }
    } else {
      for(let o of el.options) {
        if((o.$$value ? o.$$value() : o.value) === value) {
          o.selected = true;
          return;
        }
      }
    }
    el.selectedIndex = -1;
  };
  const w = $watch(getter, update);

  let debounce = 0;
  el.$$update = () => {
    if(debounce) return;
    debounce = 1;
    $tick(() => {
      debounce = 0;
      update();
    });
  }
}

export const selectOption = (op, getter) => {
  op.$$value = getter;
  if(op.parentElement?.$$update) op.parentElement.$$update();
  else $tick(() => op.parentElement?.$$update?.());
}
