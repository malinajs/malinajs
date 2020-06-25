
import { parse, assert } from './parser';
import { transformJS } from './code';
import { buildRuntime } from './runtime';


export function compile(src, option = {}) {
    const data = parse(src);
    let script;
    data.body.forEach(d => {
        if(d.type !== 'script') return;
        assert(!script, 'Multi script');
        script = d;
    });

    script = transformJS(script.content, {name: option.name || 'widget'});

    const runtime = buildRuntime(data);
    return script.split('$$runtime()').join(runtime);
};
