
import { assert } from './utils.js'
import { parse } from './parser';
import { transformJS } from './code';
import { buildRuntime } from './builder';

export const version = '0.4.10';

export function compile(src, option = {}) {
    const data = parse(src);

    let script = data.body.filter(n => n.type == 'script');
    assert(script.length <= 1, 'Only one script section');

    if(!option.name) option.name = 'widget';
    script = transformJS(script[0]?script[0].content:null, option);

    const runtime = buildRuntime(data, option, script);
    let code = `
        import {
            $$htmlToFragment, $$removeItem, $$childNodes, $watch, $ChangeDetector,
            $digest, $$htmlBlock, $$compareDeep, $$compareArray, $watchReadOnly
        } from 'malinajs/runtime.js';
    `;
    code += script.code.split('$$runtime()').join(runtime);
    return code;
};
