
import { $$removeElements, firstChild, insertAfter } from '../runtime/base';
import { $watch, keyComparator, cd_onDestroy, cd_attach, cd_component } from '../runtime/cd';


export function $$awaitBlock(parentCD, label, relation, fn, build_main, build_then, build_catch) {
    let first, last, $cd, destroy, promise, status = 0;
    cd_onDestroy(parentCD, () => destroy?.());

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

    function render(builder, value) {
        destroyBlock();

        let $dom;
        ({$cd, destroy, $dom} = builder(value));
        cd_attach(parentCD, $cd);
        if($dom.nodeType == 11) {
            first = $dom[firstChild];
            last = $dom.lastChild;
        } else first = last = $dom;
        insertAfter(label, $dom);
        cd_component(parentCD).apply();
    };

    $watch(parentCD, relation, () => {
        let p = fn();
        if(status !== 1) render(build_main);
        status = 1;
        if(p && p instanceof Promise) {
            promise = p;
            promise.then(value => {
                status = 2;
                if(promise !== p) return;
                render(build_then, value);
            }).catch(value => {
                status = 3;
                if(promise !== p) return;
                render(build_catch, value);
            });
        }
    }, {ro: true, value: [], cmp: keyComparator})
}
