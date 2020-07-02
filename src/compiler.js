
import { parse, assert } from './parser';
import { transformJS } from './code';
import { buildRuntime } from './runtime';

export const version = '0.4.2';

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
    if(script.$onMount) option.$onMount = true;
    option.$watchers = script.watchers;

    const runtime = buildRuntime(data, option);
    return script.code.split('$$runtime()').join(runtime);
};
