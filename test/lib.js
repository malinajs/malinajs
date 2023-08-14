
import jsdom from 'jsdom';
import * as rollup from 'rollup';
import assert from 'assert';
import * as malina from '../malina.mjs';
import path from 'path';

const basepath = path.resolve();

export async function build(name, option={}) {
    function customResolve() {
        return {
            resolveId: (moduleName) => {
                if(moduleName == 'malinajs' || moduleName == 'malinajs/runtime.js') return {id: basepath + '/runtime.js'};
                if(moduleName == 'malinajs/malina.mjs') return {id: basepath + '/malina.mjs'};
                if(moduleName == 'main.xht') return {id: basepath + `/test/${name}/main.xht`};
                if(moduleName == './entry.js') return {id: basepath + '/test/entry.js'};
                return null;
            },
            async transform(code, id) {
                if (!id.endsWith('.xht')) return null;
                let ctx = await malina.compile(code, {
                    displayVersion: false,
                    cssGenId: () => `c${cssIndex++}`,
                    hideLabel: option.hideLabel
                });
                return ctx.result;
            }
        }
    };

    let cssIndex = 1;
    const bundle = await rollup.rollup({
        input: './entry.js',
        plugins: [customResolve()]
    });

    const { output } = await bundle.generate({
        format: 'iife',
        name: 'mainApp'
    });

    const code = output[0].code;
    const {window} = new jsdom.JSDOM(``, { runScripts: "dangerously" });
    window.$$option = {context: option.context};
    window.eval(code);

    return {
        code,
        window,
        document: window.document,
        app: window.app
    };
};


export function tick(t = 1) {
    return new Promise(resolve => {
        setTimeout(resolve, t);
    });
}


export function equalClass(actual, expected) {
    if(typeof actual.className === 'string') actual = actual.className;
    if(typeof expected.className === 'string') expected = expected.className;
    actual = actual.trim().split(/\s+/).sort().join(' ');
    expected = expected.trim().split(/\s+/).sort().join(' ');
    assert.strictEqual(actual, expected);
};

export default { build, tick, equalClass };
