import { assert } from './utils.js';
import { xNode, xBuild } from './xnode.js';
import { compactDOM } from './compact.js';
import { parse as parseHTML, parseText } from './parser';
import * as codelib from './code';
import { buildRuntime, buildBlock } from './builder';
import { processCSS } from './css/index';

import * as utils from './utils.js';
import { makeComponent, makeComponentDyn } from './parts/component.js';
import { bindProp } from './parts/prop.js';
import { makeifBlock } from './parts/if.js';
import { makeEachBlock } from './parts/each.js';
import { makeHtmlBlock } from './parts/html.js';
import { makeAwaitBlock } from './parts/await.js';
import { attachSlot } from './parts/slot.js';
import { makeFragment, attachFragment, attachFragmentSlot, attchExportedFragment } from './parts/fragment.js';
import { attachHead } from './parts/head.js';
import { inspectProp } from './code-utils.js';
import { attachPortal } from './parts/portal.js';
import { makeEventProp } from './event-prop.js';


export const version = '0.7.1-alpha';


export async function compile(source, config = {}) {
    if(config.localConfig !== false && config.path) config = loadConfig(config.path, config);

    config = Object.assign({
        name: 'widget',
        exportDefault: true,
        inlineTemplate: false,
        hideLabel: false,
        compact: true,
        autoSubscribe: true,
        cssGenId: null,
        plugins: [],
        debug: true,
        css: true,
        passClass: true,
        immutable: false
    }, config);

    const ctx = {
        source,
        config,
        uniqIndex: 0,
        warning: config.warning || (w => console.warn('!', w.message || w)),

        Q: config.inlineTemplate ? utils.Q2 : utils.Q,
        buildBlock,
        bindProp,
        makeEachBlock,
        makeifBlock,
        makeComponent,
        makeComponentDyn,
        makeHtmlBlock,
        parseText,
        makeAwaitBlock,
        attachSlot,
        makeFragment,
        attachFragmentSlot,
        attachFragment,
        attchExportedFragment,
        attachHead,
        inspectProp,
        attachPortal,
        makeEventProp,
        checkRootName: utils.checkRootName,

        inuse: {},
        glob: {
            apply: xNode('apply', false),
            component: xNode('$component', false),
            componentFn: xNode('componentFn', false),
            rootCD: xNode('root-cd', false)
        },
        require: function(...args) {
            for(let name of args) {
                let deps = true;
                if(name == '$props:no-deps') { name = '$props'; deps = false; }
                if(name == 'apply' && ctx.script.readOnly) name = 'blankApply';
                if(ctx.inuse[name] == null) ctx.inuse[name] = 0;
                ctx.inuse[name]++;
                if(!deps) continue;
                if(name == 'apply') ctx.glob.apply.$value(true);
                if(name == '$component') ctx.glob.component.$value(true);
                if(name == '$attributes') ctx.require('$props');
                if(name == '$props' && !ctx.script.readOnly) ctx.require('apply', '$cd');
                if(name == '$cd') {
                    ctx.glob.rootCD.$value(true);
                    ctx.require('$component');
                }
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
            return xBuild(ctx, node);
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
    result.push('import * as $runtime from \'malinajs/runtime.js\';');
    result.push('import { $watch, $watchReadOnly, $tick } from \'malinajs/runtime.js\';');
    if(config.hideLabel) {
        result.push('import { $$htmlToFragmentClean as $$htmlToFragment } from \'malinajs/runtime.js\';');
    } else {
        result.push('import { $$htmlToFragment } from \'malinajs/runtime.js\';');
    }
    result.push(ctx.module.top);
    result.push(makeComponentFn.call(ctx));

    ctx.result = xBuild(ctx, result);

    await hook(ctx, 'build');
    return ctx;
}


async function hook(ctx, name) {
    for(let i = 0; i < ctx.config.plugins.length; i++) {
        const fn = ctx.config.plugins[i][name];
        if(fn) await fn(ctx);
    }
}


function detectDependency(data) {
    const check = name => {
        for(let k of ['$props', '$attributes', '$emit', '$context']) {
            if(name.includes(k)) this.require(k);
        }
    };

    if(typeof data == 'string') {
        check(data);
    } else {
        assert(data.parts);

        for(let p of data.parts) {
            if(p.type == 'exp' || p.type == 'js') check(p.value);
        }
    }
}


function loadConfig(filename, option) {
    const fs = require('fs');
    let result = Object.assign({}, option);
    if(result.plugins) result.plugins = result.plugins.slice();

    let localConfig;
    let parts = filename.split(/[\/\\]/);
    for(let i = parts.length - 1; i > 1; i--) {
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


function makeComponentFn() {
    let componentFn = xNode('componentFn', {
        $deps: [this.glob.apply, this.glob.rootCD],
        body: [this.module.head, this.module.code, this.module.body]
    }, (ctx, n) => {
        let component = xNode('function', {
            args: ['$option'],
            inline: true,
            arrow: true,
            body: n.body
        });

        if(this.glob.apply.value) {
            ctx.add(this.glob.componentFn);
            ctx.write('$runtime.makeComponent(');
            component.args.push('$$apply');
            ctx.add(component);
            ctx.write(', $runtime.$base);', true);
        } else if(this.glob.rootCD.value || ctx.inuse.$cd || ctx.inuse.$component || ctx.inuse.$context || ctx.inuse.blankApply) {
            ctx.add(this.glob.componentFn);
            if(ctx.inuse.blankApply) {
                component.body[0].body.unshift(xNode('block', (ctx) => {
                    ctx.writeLine('let $$apply = $runtime.noop;');
                }));
            }

            ctx.write('$runtime.makeComponent(');
            ctx.add(component);
            ctx.write(');', true);
        } else {
            this.glob.componentFn.$value('thin');
            ctx.add(this.glob.componentFn);
            ctx.write('($option={}) => {', true);
            ctx.goIndent(() => {
                ctx.add(xNode('block', { body: n.body }));
            });
            ctx.write(true, '}');
        }
    });

    return xNode('block', {
        $compile: [this.module.head, this.module.code, this.module.body],
        name: this.config.name,
        componentFn
    }, (ctx, n) => {
        ctx.writeIndent();
        if(this.config.exportDefault) ctx.write('export default ');
        else ctx.write(`const ${n.name} = `);
        ctx.add(this.glob.apply);
        ctx.add(n.componentFn);
    });
}
