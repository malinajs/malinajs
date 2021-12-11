
import { $$htmlToFragment, insertAfter, svgToFragment, $$removeElements } from '../runtime/base';
import { $watch } from '../runtime/cd';

export function $$htmlBlock($cd, tag, fn) {
    let lastElement;
    let create = (html) => {
        let fr;
        if(tag.parentElement instanceof SVGElement) fr = svgToFragment(html);
        else fr = $$htmlToFragment(html, 3);
        lastElement = fr.lastChild;
        insertAfter(tag, fr);
    };
    let destroy = () => {
        if(!lastElement) return;
        $$removeElements(tag.nextSibling, lastElement);
        lastElement = null;
    };
    if($cd) {
        $watch($cd, fn, (html) => {
            destroy();
            if(html) create(html);
        }, {ro: true});
    } else create(fn());
};
