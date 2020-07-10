
import malinaRollup from './malina-rollup'


function customResolve() {
    return {
        resolveId: (moduleName) => {
            if(moduleName != 'malinajs/runtime.js') return null;
            return {
                id: __dirname + '/runtime.js'
            };
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
        malinaRollup(),
        customResolve()
    ]
}
