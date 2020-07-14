
import malinaRollup from 'malinajs/malina-rollup'


function customResolve() {
    return {
        resolveId: (moduleName) => {
            if(moduleName == 'malinajs/runtime.js') return {id: __dirname + '/runtime.js'};
            if(moduleName == 'malinajs') return {id: __dirname + '/malina.js'};
            return null;
        }
    }
};

export default {
    input: 'example/main.js',
    output: {
        file: './example/public/app.js',
        format: 'iife'
    },
    plugins: [
        malinaRollup({
            inlineTemplate: true,
            hideLabel: false
        }),
        customResolve()
    ]
}
