
import { assert } from './utils.js'
import { parse } from './parser';
import { transformJS } from './code';
import { buildRuntime } from './runtime';

export const version = '0.4.8';

export function compile(src, option = {}) {
    const data = parse(src);
    let script;
    data.body.forEach(d => {
        if(d.type !== 'script') return;
        assert(!script, 'Multi script');
        script = d;
    });

    if(!option.name) option.name = 'widget';
    script = transformJS(script.content, option);

    const runtime = buildRuntime(data, option, script);
    return script.code.split('$$runtime()').join(runtime);
};
