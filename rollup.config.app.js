
import malinaRollup from 'malinajs/malina-rollup'
import css from 'rollup-plugin-css-only';

function customResolve() {
    return {
        resolveId: (moduleName) => {
            if(moduleName == 'malinajs/runtime.js') return {id: __dirname + '/runtime.js'};
            if(moduleName == 'malinajs') return {id: __dirname + '/malina.js'};
            return null;
        }
    }
};

let cssInJS = true;

export default {
    input: 'example/main.js',
    output: {
        file: './example/public/app.js',
        format: 'iife'
    },
    plugins: [
        malinaRollup({
            inlineTemplate: true,
            css: cssInJS
        }),
        customResolve(),
        !cssInJS && css({ output: 'bundle.css' })
    ]
}
