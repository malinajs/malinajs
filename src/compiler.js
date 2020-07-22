
import { assert } from './utils.js'
import { parse } from './parser';
import { transformJS } from './code';
import { buildRuntime } from './builder';
import { processCSS } from './css/index';

export const version = '0.5.10';

export function compile(src, config = {}) {
    if(!config.name) config.name = 'widget';
    if(!config.warning) config.warning = function() {};

    const data = parse(src);

    let script = data.body.filter(n => n.type == 'script');
    assert(script.length <= 1, 'Only one script section');

    script = transformJS(script[0]?script[0].content:null, config);

    let css = data.body.filter(n => n.type == 'style');
    assert(css.length <= 1, 'Only one style section');
    css = css[0] && processCSS(css[0], config);

    const runtime = buildRuntime(data, script, css, config);

    let htmlFragment = config.hideLabel ? '$$htmlToFragmentClean as $$htmlToFragment' : '$$htmlToFragment';
    let code = `
        import {
            ${htmlFragment}, $$removeItem, $$childNodes, $watch, $ChangeDetector, $$removeElements,
            $digest, $$htmlBlock, $$compareDeep, $$compareArray, $watchReadOnly, $$ifBlock, $makeEmitter,
            $$addEvent, $$deepComparator, $$makeSpreadObject
        } from 'malinajs/runtime.js';
    `;
    code += script.code.split('$$runtime()').join(runtime);
    return code;
};
