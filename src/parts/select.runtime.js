
import { addEvent, $watch } from '../runtime/cd.js';
import { $tick } from '../runtime/base.js';


export const selectElement = (el, getter, setter) => {
  addEvent(el, 'change', () => {
    let op = el.querySelector(':checked');
    if(op?.$$value) {
      let value = op.$$value();
      setter(value);
      w.value = value;
    }
  });
  const update = () => {
    for(let op of el.options) {
      if(op.$$value?.() === w.value) {
        op.selected = true;
        return;
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
