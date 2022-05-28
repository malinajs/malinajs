import { insertAfter, removeElements } from '../runtime/base';
import { $watch } from '../runtime/cd';

let create = (tag, html) => {
  let fr;
  if(tag.parentElement instanceof SVGElement) {
    let t = document.createElement('template');
    t.innerHTML = '<svg>' + html + '</svg>';
    fr = t.content.firstChild;
  } else {
    let t = document.createElement('template');
    t.innerHTML = html;
    fr = t.content;
  }
  let lastElement = fr.lastChild;
  insertAfter(tag, fr);
  return lastElement;
};

export function htmlBlock(tag, fn) {
  let lastElement;
  let destroy = () => {
    if(!lastElement) return;
    removeElements(tag.nextSibling, lastElement);
    lastElement = null;
  };
  $watch(fn, (html) => {
    destroy();
    if(html) lastElement = create(tag, html);
  });
}

export function htmlBlockStatic(tag, value) {
  create(tag, value);
}
