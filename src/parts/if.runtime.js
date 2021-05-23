
import { $$removeElements, firstChild, insertBefore } from '../runtime/base';
import { $watch } from '../runtime/cd';

export function $$ifBlock($cd, $parentElement, fn, tpl, build, tplElse, buildElse) {
    let childCD;
    let first, last;

    function create(fr, builder) {
        childCD = $cd.new();
        let tpl = fr.cloneNode(true);
        builder(childCD, tpl);
        first = tpl[firstChild];
        last = tpl.lastChild;
        insertBefore($parentElement, tpl, $parentElement.nextSibling);
    };

    function destroy() {
        if(!childCD) return;
        childCD.destroy();
        childCD = null;
        $$removeElements(first, last);
        first = last = null;
    };

    $watch($cd, fn, (value) => {
        if(value) {
            destroy();
            create(tpl, build);
        } else {
            destroy();
            if(buildElse) create(tplElse, buildElse);
        }
    });
};
