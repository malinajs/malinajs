
import { $$removeElements, firstChild, insertAfter } from '../runtime/base';
import { $watch, cd_onDestroy, cd_attach, cd_destroy } from '../runtime/cd';

export function $$ifBlock(parentCD, label, fn, build, buildElse) {
    let first, last, $cd, destroy;
    cd_onDestroy(parentCD, () => destroy?.());

    function createBlock(builder) {
        let $dom;
        ({$cd, destroy, $dom} = builder());
        cd_attach(parentCD, $cd);
        if($dom.nodeType == 11) {
            first = $dom[firstChild];
            last = $dom.lastChild;
        } else first = last = $dom;
        insertAfter(label, $dom);
    };

    function destroyBlock() {
        if(!first) return;
        destroy?.();
        destroy = null;
        if($cd) {
            cd_destroy($cd);
            $cd = null;
        }
        $$removeElements(first, last);
        first = last = null;
    };

    $watch(parentCD, fn, (value) => {
        if(value) {
            destroyBlock();
            createBlock(build);
        } else {
            destroyBlock();
            if(buildElse) createBlock(buildElse);
        }
    });
};
