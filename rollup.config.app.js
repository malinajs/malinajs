
import malinaRollup from './malina-rollup'


function customResolve() {
    return {
        resolveId: (moduleName) => {
            if(moduleName != 'malinajs/runtime.part.js') return null;
            return {
                id: __dirname + '/src/runtime.part.js'
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
