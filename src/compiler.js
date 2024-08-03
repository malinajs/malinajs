import { assert, use_context } from './utils.js';
import { xNode, xBuild, resolveDependecies } from './xnode.js';
import { compactDOM, compactFull } from './compact.js';
import { parseHTML, parseText } from './parser';
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
import { makeKeepAlive } from './parts/keep-alive.js';

export { parseHTML, parseText, parseBinding, parseAttibutes } from './parser.js';
export { xNode, xBuild } from './xnode.js';
export { use_context, get_context } from './utils.js';


export const version = '0.8.0-a2';


export async function compile(source, config = {}) {
  config = Object.assign({
    inlineTemplate: false,
    hideLabel: false,
    compact: true,
    autoSubscribe: false,
    cssGenId: null,
    plugins: [],
    debug: true,
    css: true,
    passClass: true,
    immutable: false,
    deepCheckingProps: false,
    useGroupReferencing: true,
    preserveComments: false,
    debugLabel: false,
    autoimport: null
  }, config);

  const ctx = {
    source,
    config,
    uniqIndex: 0,
    warning: config.warning || (w => console.warn('!', w.message || w)),

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
    makeKeepAlive,
    checkRootName: utils.checkRootName,

    inuse: {},
    glob: {
      $component: xNode('$component', { $hold: ['componentFn'] }),
      rootCD: xNode('root-cd', () => {}),
      apply: xNode('apply', { $hold: ['componentFn'], $wait: ['rootCD'] }),
      componentFn: xNode('componentFn'),
      $onMount: xNode('$onMount'),
      $props: xNode('$props'),
      $attributes: xNode('$attributes')
    },
    require: function(...args) {
      for (let name of args) {
        if (ctx.inuse[name] == null) ctx.inuse[name] = 0;
        ctx.inuse[name]++;
        if (['apply', '$onMount', '$component', 'componentFn', 'rootCD', '$props', '$attributes'].includes(name)) ctx.glob[name].$setValue();
      }
    },
    detectDependency,

    DOM: null,
    parseHTML: function() {
      this.DOM = parseHTML(this.source);
    },
    compactDOM: config.compact == 'full' ? compactFull : compactDOM,

    script: null,
    scriptNodes: null,
    js_parse: codelib.parse,
    js_transform: codelib.transform,

    styleNodes: null,
    css: null,
    processCSS,

    runtime: {},
    result: null,
    buildRuntime,

    module: {
      top: xNode.block(),
      head: xNode.block(),
      code: xNode.block(),
      body: xNode.block()
    }
  };

  use_context(ctx, setup);

  await hook(ctx, 'dom:before');
  ctx.parseHTML();
  await hook(ctx, 'dom');
  ctx.scriptNodes = [];
  ctx.styleNodes = [];
  ctx.DOM.body = ctx.DOM.body.filter(n => {
    if (n.type == 'script') {
      ctx.scriptNodes.push(n);
      return false;
    }
    if (n.type == 'style') {
      ctx.styleNodes.push(n);
      return false;
    }
    return true;
  });
  await hook(ctx, 'dom:check');
  assert(ctx.scriptNodes.length <= 1, 'Only one script section');
  await hook(ctx, 'dom:compact');
  if (config.compact) ctx.compactDOM();
  await hook(ctx, 'dom:after');

  await hook(ctx, 'js:before');
  ctx.js_parse();
  await hook(ctx, 'js');
  use_context(ctx, ctx.js_transform);
  await hook(ctx, 'js:after');

  await hook(ctx, 'css:before');
  ctx.processCSS();
  if (ctx.css.active()) ctx.css.process(ctx.DOM);
  await hook(ctx, 'css');

  await hook(ctx, 'runtime:before');
  use_context(ctx, ctx.buildRuntime);
  await hook(ctx, 'runtime');

  await hook(ctx, 'build:before');

  use_context(ctx, function() {
    const root = xNode('root', (ctx) => {
      ctx.write(true, `import * as $runtime from 'malinajs/runtime.js';`);
      ctx.write(true, 'import { $watch } from \'malinajs/runtime.js\';');
      ctx.add(this.module.top);
      const componentFn = this.glob.componentFn;

      if (componentFn.self) {
        ctx.write(true, 'const $$selfComponent = ');
        ctx.add(componentFn);
        ctx.write(true, 'export default $$selfComponent;');
      } else {
        ctx.write(true, 'export default ');
        ctx.add(componentFn);
      }
    });

    for (let k in this.glob) resolveDependecies(this.glob[k]);
    this.result = xBuild(root, { warning: this.config.warning });
  });

  await hook(ctx, 'build');
  return ctx;
}


async function hook(ctx, name) {
  for (let i = 0; i < ctx.config.plugins.length; i++) {
    const fn = ctx.config.plugins[i][name];
    if (fn) await use_context(ctx, () => fn.call(ctx, ctx));
  }
}


function detectDependency(data) {
  const check = name => {
    for (let k of ['$props', '$attributes', '$emit', '$context']) {
      if (name.includes(k)) {
        this.require(k);
        if (k == '$props' || k == '$attributes') this.require('apply');
      }
    }
  };

  if (typeof data == 'string') {
    check(data);
  } else {
    assert(data.parts);

    for (let p of data.parts) {
      if (p.type == 'exp' || p.type == 'js') check(p.value);
    }
  }
}


function setup() {
  Object.assign(this.glob.componentFn, {
    $wait: [this.glob.rootCD],
    module: this.module,
    $handler: (ctx, n) => {
      if (this.glob.rootCD.value) n.value = true;

      if (n.value) ctx.write('$runtime.makeComponent($option => {');
      else ctx.write('($option={}) => {', true);

      ctx.indent++;
      ctx.add(this.module.head);
      ctx.add(this.module.code);
      ctx.add(this.module.body);
      ctx.indent--;

      if (n.value) ctx.write(true, '});');
      else ctx.write(true, '}');
    }
  });
}
