
import { assert, compactDOM, xNode, xWriter } from './utils.js'
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


export const version = '0.6.19';


export async function compile(source, config = {}) {
    if(config.localConfig !== false && config.path) config = loadConfig(config.path, config);

    config = Object.assign({
        name: 'widget',
        warning: (w) => console.warn('!', w.message),
        exportDefault: true,
        inlineTemplate: false,
        hideLabel: false,
        compact: true,
        autoSubscribe: true,
        cssGenId: null,
        plugins: [],
        debug: true,
        css: true
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

        inuse: {},
        require: function() {
            for(let name of arguments) {
                if(ctx.inuse[name] == null) ctx.inuse[name] = 0;
                ctx.inuse[name]++;
                if(name == '$attributes') ctx.require('$props');
                if(name == '$props') ctx.require('apply', '$cd');
                if(name == '$cd') ctx.require('$component');
                if(name == '$onDestroy') ctx.require('$component');
                if(name == '$onMount') ctx.require('$component');
            }
        },
        detectDependency,

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

        runtime: {},
        result: null,
        buildRuntime,

        module: {
            top: xNode('block'),
            head: xNode('block'),
            code: xNode('block'),
            body: xNode('block')
        },

        xBuild: node => {
            let w = new xWriter(ctx);
            w.build(node);
            return w.toString();
        }
    };

    await hook(ctx, 'dom:before');
    ctx.parseHTML();
    await hook(ctx, 'dom');
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
    await hook(ctx, 'dom:check');
    assert(ctx.scriptNodes.length <= 1, 'Only one script section');
    await hook(ctx, 'dom:compact');
    if(config.compact) ctx.compactDOM();
    await hook(ctx, 'dom:after');

    await hook(ctx, 'js:before');
    ctx.js_parse();
    await hook(ctx, 'js');
    ctx.js_transform();
    await hook(ctx, 'js:after');

    await hook(ctx, 'css:before');
    ctx.processCSS();
    if(ctx.css.active()) ctx.css.process(ctx.DOM);
    await hook(ctx, 'css');

    await hook(ctx, 'runtime:before');
    ctx.buildRuntime();
    await hook(ctx, 'runtime');


    await hook(ctx, 'build:before');
    const result = ctx.result = xNode('block');
    result.push(`import * as $runtime from 'malinajs/runtime.js';`)
    result.push(`import { $watch, $watchReadOnly, $tick } from 'malinajs/runtime.js';`)
    if(config.hideLabel) {
        result.push(`import { $$htmlToFragmentClean as $$htmlToFragment } from 'malinajs/runtime.js';`);
    } else {
        result.push(`import { $$htmlToFragment } from 'malinajs/runtime.js';`);
    }
    if(config.injectRuntime) result.push(config.injectRuntime);
    result.push(ctx.module.top);

    result.push(xNode('block', {
        name: config.name,
        component: xNode('function', {
            args: ['$option'],
            inline: true,
            arrow: true,
            body: [ctx.module.head, ctx.module.code, ctx.module.body]
        })
    }, (ctx, n) => {
        ctx.writeIndent();
        if(config.exportDefault) ctx.write('export default ');
        else ctx.write(`const ${n.name} = `);

        if(ctx.inuse.apply || ctx.inuse.$cd) {
            ctx.write('$runtime.makeComponent(');
            n.component.args.push('$$apply');
            ctx.build(n.component);
            ctx.write(');\n');
        } else if(ctx.inuse.$component || ctx.inuse.$context) {
            ctx.write('$runtime.makeComponentBase(');
            ctx.build(n.component);
            ctx.write(');\n');
        } else {
            ctx.write('($element, $option={}) => {\n');
            ctx.goIndent(() => {
                ctx.write(ctx.getIndent() + '$runtime.$bindComponent(');
                ctx.build(n.component);
                ctx.write(', $element, $option);\n');
            });
            ctx.write('}');
        }
    }));

    ctx.result = ctx.xBuild(result);

    await hook(ctx, 'build');
    return ctx;
};


async function hook(ctx, name) {
    for(let i=0; i<ctx.config.plugins.length; i++) {
        const fn = ctx.config.plugins[i][name];
        if(fn) await fn(ctx);
    }
};


function detectDependency(data) {
    const check = name => {
        for(let k of ['$props', '$attributes', '$emit', '$context']) {
            if(name.includes(k)) this.require(k);
        }
    }

    if(typeof data == 'string') {
        check(data);
    } else {
        assert(data.parts);

        for(let p of data.parts) {
            if(p.type == 'exp') check(p.value);
        }
    }
}


function loadConfig(filename, option) {
    const fs = require('fs');
    let result = Object.assign({}, option);
    if(result.plugins) result.plugins = result.plugins.slice();

    let localConfig;
    let parts = filename.split(/[\/\\]/);
    for(let i=parts.length-1;i>1;i--) {
        let local = parts.slice(0, i).join('/') + '/malina.config.js';
        if(fs.existsSync(local)) {
            localConfig = local;
            break;
        }
    }

    if(localConfig) {
        const confFn = require(localConfig);
        result = confFn(result, filename);
    }
    if(!result.path) result.path = filename;
    if(!result.name) result.name = filename.match(/([^/\\]+)\.\w+$/)[1];

    return result;
}