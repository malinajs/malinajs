
import malinaRollup from './malina-rollup'


export default {
    input: 'example/main.js',
    output: {
        file: './example/public/app.js',
        format: 'iife'
    },
    plugins: [
        malinaRollup()
    ]
}
