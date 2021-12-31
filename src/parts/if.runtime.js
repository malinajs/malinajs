
import { $$removeElements, firstChild, insertAfter } from '../runtime/base';
import { $watch, cd_onDestroy, cd_attach, cd_destroy } from '../runtime/cd';
import * as cdruntime from '../runtime/cd';


export function ifBlock(parentCD, label, fn, build, buildElse) {
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
        cdruntime.destroyResults = [];
        destroy?.();
        destroy = null;
        if($cd) {
            cd_destroy($cd);
            $cd = null;
        }
        if(cdruntime.destroyResults.length) {
            let f = first, l = last;
            Promise.allSettled(cdruntime.destroyResults).then(() => {
                $$removeElements(f, l);
            });
        } else $$removeElements(first, last);
        first = last = null;
        cdruntime.destroyResults = null;
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


export function ifBlockReadOnly(component, label, fn, build, buildElse) {
    function createBlock(builder) {
        let {destroy, $dom} = builder();
        cd_onDestroy(component, destroy);
        insertAfter(label, $dom);
    };

    if(fn()) createBlock(build);
    else if(buildElse) createBlock(buildElse);
};
