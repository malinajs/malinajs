
import { $$htmlToFragment, insertAfter, svgToFragment } from '../runtime/base';
import { $watch } from '../runtime/cd';

export function $$htmlBlock($cd, tag, fn) {
    let lastElement;
    let create = (html) => {
        let fr;
        if(tag.parentElement instanceof SVGElement) fr = svgToFragment(html);
        else fr = $$htmlToFragment(html);
        lastElement = fr.lastChild;
        insertAfter(tag, fr);
    };
    let destroy = () => {
        if(!lastElement) return;
        let next, el = tag.nextSibling;
        while(el) {
            next = el.nextSibling;
            el.remove();
            if(el == lastElement) break;
            el = next;
        }

        lastElement = null;
    };
    $watch($cd, fn, (html) => {
        destroy();
        if(html) create(html);
    }, {ro: true});
};
