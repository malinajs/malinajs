
import { assert, compactDOM, replace } from './utils.js'
import { parse as parseHTML } from './parser';
import * as codelib from './code';
import { buildRuntime, buildBlock } from './builder';
import { processCSS } from './css/index';

import * as utils from './utils.js'
import { parseText } from './parser.js'
import { makeComponent } from './parts/component.js'
import { bindProp } from './parts/prop.js'
import { makeifBlock } from './parts/if.js'
import { makeEachBlock } from './parts/each.js'
import { makeHtmlBlock } from './parts/html.js'
import { makeAwaitBlock } from './parts/await.js'
import { attachSlot } from './parts/slot.js'
import { makeFragment, attachFragment } from './parts/fragment.js'


export const version = '0.6.3';


export function compile(source, config = {}) {
    config = Object.assign({
        name: 'widget',
        warning: (w) => console.warn('!', w.message),
        exportDefault: true,
        inlineTemplate: false,
        hideLabel: false,
        compact: true,
        autoSubscribe: true,
        cssGenId: null,
        plugins: []
    }, config);

    const ctx = {
        source,
        config,
        uniqIndex: 0,
        
        Q: config.inlineTemplate ? utils.Q2 : utils.Q,
        buildBlock,
        bindProp,
        makeEachBlock,
        makeifBlock,
        makeComponent,
        makeHtmlBlock,
        parseText,
        makeAwaitBlock,
        attachSlot,
        makeFragment,
        attachFragment,
        checkRootName: utils.checkRootName,
        use: {},

        DOM: null,
        parseHTML,
        compactDOM,

        script: null,
        scriptNodes: null,
        js_parse: codelib.parse,
        js_transform: codelib.transform,
        js_build: codelib.build,

        styleNodes: null,
        css: null,
        processCSS,

        runtime: {componentHeader: []},
        result: null,
        buildRuntime
    };

    hook(ctx, 'dom:before');
    ctx.parseHTML();
    hook(ctx, 'dom');
    ctx.scriptNodes = [];
    ctx.styleNodes = [];
    ctx.DOM.body = ctx.DOM.body.filter(n => {
        if(n.type == 'script') {
            ctx.scriptNodes.push(n);
            return false;
        }
        if(n.type == 'style') {
            ctx.styleNodes.push(n);
            return false;
        }
        return true;
    });
    hook(ctx, 'dom:check');
    assert(ctx.scriptNodes.length <= 1, 'Only one script section');
    hook(ctx, 'dom:compact');
    if(config.compact) ctx.compactDOM();
    hook(ctx, 'dom:after');

    hook(ctx, 'js:before');
    ctx.js_parse();
    hook(ctx, 'js');
    ctx.js_transform();
    hook(ctx, 'js:after');

    hook(ctx, 'css:before');
    ctx.processCSS();
    if(ctx.css) ctx.css.process(ctx.DOM);
    hook(ctx, 'css');

    hook(ctx, 'runtime:before');
    ctx.buildRuntime();
    hook(ctx, 'runtime');


    hook(ctx, 'build:before');
    ctx.js_build();
    hook(ctx, 'build:assemble');
    let code = `
        import * as $runtime from 'malinajs/runtime.js';
        import { $watch, $watchReadOnly, $tick } from 'malinajs/runtime.js';
    `;

    if(config.hideLabel) {
        code += `import { $$htmlToFragmentClean as $$htmlToFragment } from 'malinajs/runtime.js';\n`;
    } else {
        code += `import { $$htmlToFragment } from 'malinajs/runtime.js';\n`;
    }

    if(config.injectRuntime) code += config.injectRuntime + '\n';

    let scriptCode = replace(ctx.script.code, '$$runtimeHeader()', ctx.runtime.header, 1);
    scriptCode = replace(scriptCode, '$$runtime()', ctx.runtime.body, 1);
    ctx.result = code + scriptCode;
    hook(ctx, 'build');
    return ctx.result;
};


function hook(ctx, name) {
    ctx.config.plugins.forEach(h => {
        h[name] && h[name](ctx);
    });
};
