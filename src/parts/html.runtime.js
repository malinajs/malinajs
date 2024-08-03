import { removeElements } from '../runtime/base';
import { $watch } from '../runtime/cd';

let create = (tag, html) => {
  let fr;
  if (tag.parentElement instanceof SVGElement) {
    let t = document.createElement('template');
    t.innerHTML = '<svg>' + html + '</svg>';
    fr = t.content.firstChild;
  } else {
    let t = document.createElement('template');
    t.innerHTML = html;
    fr = t.content;
  }
  let firstElement = fr.firstChild;
  tag.parentNode.insertBefore(fr, tag);
  return firstElement;
};

export function htmlBlock(tag, fn) {
  let firstElement;
  let destroy = () => {
    if (!firstElement) return;
    removeElements(firstElement, tag.previousSibling);
    firstElement = null;
  };
  $watch(fn, (html) => {
    destroy();
    if (html) firstElement = create(tag, html);
  });
}

export function htmlBlockStatic(tag, value) {
  create(tag, value);
}
