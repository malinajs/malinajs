
const jsdom = require("jsdom");
const rollup = require('rollup');
const malinaRollup = require('../malina-rollup');

async function build(name, option={}) {
    function customResolve() {
        return {
            resolveId: (moduleName) => {
                if(moduleName == 'malinajs/runtime.js') return {id: __dirname + '/../runtime.js'};
                if(moduleName == 'malinajs') return {id: __dirname + '/../malina.js'};
                if(moduleName == 'main.xht') return {id: __dirname + `/${name}/main.xht`};
                if(moduleName == './entry.js') return {id: __dirname + '/entry.js'};
                return null;
            }
        }
    };

    let cssIndex = 1;
    const bundle = await rollup.rollup({
        input: './entry.js',
        plugins: [customResolve(), malinaRollup({
            displayVersion: false,
            cssGenId: () => `c${cssIndex++}`,
            hideLabel: option.hideLabel
        })]
    });

    const { output } = await bundle.generate({
        format: 'iife',
        name: 'mainApp'
    });

    const code = output[0].code;
    const dom = new jsdom.JSDOM(`<body><script>${code}</script></body>`, { runScripts: "dangerously" });

    return {
        code,
        dom,
        document: dom.window.document
    };
};


module.exports = {build};
