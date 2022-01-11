import acorn from 'acorn';
import astring from 'astring';
import { assert, detectExpressionType } from './utils.js';
import { xNode } from './xnode.js';


export function parse() {
  let source = this.scriptNodes.length ? this.scriptNodes[0].content : null;
  this.script = {
    source,
    watchers: [],
    imports: [],
    importedNames: [],
    props: [],
    rootVariables: {},
    rootFunctions: {},
    readOnly: false,
    autoimport: {}
  };
  if (source) {
    this.script.readOnly = this.scriptNodes.some((n) => n.attributes.some((a) => a.name == 'read-only'));

    if (!this.script.readOnly) {
      source = source.split(/\n/).map((line) => {
        const rx = line.match(/^(\s*)\/\/(.*)$/);
        if (!rx) return line;
        const code = rx[2].trim();
        if (code != '!no-check') return line;
        return rx[1] + '$$_noCheck;';
      }).join('\n');
    }
    this.script.ast = acorn.parse(source, { sourceType: 'module', ecmaVersion: 12 });

    if (source.includes('$props')) this.require('$props');
    if (source.includes('$attributes')) this.require('$attributes');
    if (source.includes('$emit')) this.require('$emit');
    if (source.includes('$onDestroy')) this.require('$onDestroy');
    if (source.includes('$onMount')) this.require('$onMount');
    if (source.includes('$context')) this.require('$context');
    if (source.includes('$component')) this.require('$component');
  } else {
    this.script.ast = {
      body: [],
      sourceType: 'module',
      type: 'Program'
    };
  }
}

export function transform() {
  const result = this.script;
  const source = this.script.source;
  const ast = this.script.ast;

  const rootVariables = result.rootVariables;
  const rootFunctions = result.rootFunctions;
  ast.body.forEach((n) => {
    if (n.type == 'FunctionDeclaration') {
      rootFunctions[n.id.name] = true;
    } else if (n.type == 'VariableDeclaration') {
      n.declarations.forEach((i) => {
        rootVariables[i.id.name] = true;
        if (i.init && i.init.type == 'ArrowFunctionExpression') rootFunctions[i.id.name] = true;
      });
    }
  });

  result.onMount = rootFunctions.onMount;
  result.onDestroy = rootFunctions.onDestroy;

  const funcTypes = {
    FunctionDeclaration: 1,
    FunctionExpression: 1,
    ArrowFunctionExpression: 1
  };

  const applyBlock = () => {
    this.require('apply');
    return {
      _apply: true,
      type: 'ExpressionStatement',
      expression: {
        callee: {
          type: 'Identifier',
          name: '$$apply'
        },
        type: 'CallExpression'
      }
    };
  };

  const returnApplyBlock = (a) => {
    this.require('apply');
    return {
      _apply: true,
      callee: {
        type: 'Identifier',
        name: '$$apply'
      },
      type: 'CallExpression',
      arguments: [a]
    };
  };

  function isInLoop(node) {
    if (!node._parent || node._parent.type != 'CallExpression') return false;
    if (node._parent.callee.type != 'MemberExpression') return false;
    const method = node._parent.callee.property.name;
    return method == 'forEach' || method == 'map' || method == 'filter';
  }

  function isNoCheck(node) {
    return node.type == 'ExpressionStatement' && node.expression.type == 'Identifier' && node.expression.name == '$$_noCheck';
  }

  function transformNode(node) {
    if (funcTypes[node.type] && node.body.body && node.body.body.length) {
      if (node._parent.type == 'CallExpression' && node._parent.callee.name == '$onDestroy') return 'stop';
      for (let i = 0; i < node.body.body.length; i++) {
        const n = node.body.body[i];
        if (!isNoCheck(n)) continue;
        node.body.body.splice(i, 1);
        return 'stop';
      }
      if (!isInLoop(node)) {
        node.body.body.unshift(applyBlock());
      }
    } else if (node.type == 'ArrowFunctionExpression') {
      if (node._parent.type == 'CallExpression' && node._parent.callee.name == '$onDestroy') return 'stop';
      if (node.body.type != 'BlockStatement' && node.body.type != 'ArrowFunctionExpression' && !isInLoop(node)) {
        node.body = returnApplyBlock(node.body);
      }
    } else if (node.type == 'AwaitExpression') {
      let n = node; let p;
      while (n._parent) {
        p = n._parent;
        if (p.type == 'BlockStatement') break;
        n = p;
        p = null;
      }
      if (p) {
        const i = p.body.indexOf(n);
        if (i >= 0 && !(p.body[i + 1] && p.body[i + 1]._apply)) {
          if (n.type == 'ReturnStatement') {
            n.argument = returnApplyBlock(n.argument);
          } else {
            p.body.splice(i + 1, 0, applyBlock());
          }
        }
      }
    }
  }

  function walk(node, parent, fn) {
    if (typeof node !== 'object') return;

    if (node._apply) return;
    node._parent = parent;
    let forParent = parent;
    if (node.type) {
      if (fn(node) == 'stop') return;
      forParent = node;
    }
    for (const key in node) {
      const child = node[key];
      if (key == '_parent') continue;
      if (!child || typeof child !== 'object') continue;

      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          walk(child[i], forParent, fn);
        }
      } else {
        walk(child, forParent, fn);
      }
    }
  }
  if (!this.script.readOnly) walk(ast, null, transformNode);

  function makeVariable(name) {
    return {
      type: 'VariableDeclaration',
      declarations: [{
        type: 'VariableDeclarator',
        id: {
          type: 'Identifier',
          name: name
        },
        init: null
      }],
      kind: 'var'
    };
  }

  const makeWatch = (n) => {
    function assertExpression(n) {
      if (['Identifier', 'TemplateLiteral', 'Literal'].includes(n.type)) return;
      if (n.type.endsWith('Expression')) return;
      throw new Error('Wrong expression');
    }

    if (n.body.type != 'ExpressionStatement') throw new Error('Error');
    if (n.body.expression.type == 'AssignmentExpression') {
      const ex = n.body.expression;
      if (ex.operator != '=') throw new Error('Error');
      let target;
      if (ex.left.type == 'Identifier') {
        target = ex.left.name;
        if (!(target in rootVariables)) resultBody.push(makeVariable(target));
      } else if (ex.left.type == 'MemberExpression') {
        target = source.substring(ex.left.start, ex.left.end);
      } else throw new Error('Error');
      assertExpression(ex.right);
      const exp = source.substring(ex.right.start, ex.right.end);
      result.watchers.push(`$runtime.prefixPush($cd, () => {${target} = ${exp};});`);
    } else if (n.body.expression.type == 'SequenceExpression') {
      const ex = n.body.expression.expressions;
      const handler = ex[ex.length - 1];
      let callback = source.substring(handler.start, handler.end);
      if (handler.type == 'ArrowFunctionExpression' || handler.type == 'FunctionExpression') {
        // default
      } else if (detectExpressionType(callback) == 'identifier') {
        callback = `(v) => { ${callback}(v); }`;
      } else {
        callback = `() => { ${callback}; }`;
      }

      if (ex.length == 2) {
        assertExpression(ex[0]);
        const exp = source.substring(ex[0].start, ex[0].end);
        if (this.config.immutable) result.watchers.push(`$watch($cd, () => (${exp}), ${callback});`);
        else result.watchers.push(`$watch($cd, () => (${exp}), ${callback}, {cmp: $runtime.$$deepComparator(0)});`);
      } else if (ex.length > 2) {
        for (let i = 0; i < ex.length - 1; i++) assertExpression(ex[i]);
        const exp = source.substring(ex[0].start, ex[ex.length - 2].end);
        result.watchers.push(`$watch($cd, () => [${exp}], ($args) => { (${callback}).apply(null, $args); }, {cmp: $runtime.$$deepComparator(1)});`);
      } else throw new Error('Error');
    } else throw new Error('Error');
  };

  const imports = [];
  const resultBody = [];
  let lastPropIndex = null;
  let constantProps = true;

  ast.body.forEach((n) => {
    if (n.type == 'ImportDeclaration') {
      imports.push(n);
      n.specifiers.forEach((s) => {
        if (s.local.type != 'Identifier') return;
        result.importedNames.push(s.local.name);
        if (s.type != 'ImportDefaultSpecifier') return;
        result.imports.push(s.local.name);
      });
      return;
    } else if (n.type == 'ExportNamedDeclaration') {
      if (n.declaration.kind != 'const') constantProps = false;
      assert(n.declaration.type == 'VariableDeclaration', 'Wrong export');
      n.declaration.declarations.forEach((d) => {
        assert(d.type == 'VariableDeclarator', 'Wrong export');
        const p = { name: d.id.name };
        if (d.init) {
          if (d.init.type == 'Literal') {
            p.value = d.init.raw;
          } else {
            p.value = astring.generate(d.init);
          }
        }
        result.props.push(p);
        this.require('$props:no-deps');
        lastPropIndex = resultBody.length;
      });
      return;
    }

    if (n.type == 'LabeledStatement' && n.label.name == '$') {
      try {
        makeWatch(n);
        return;
      } catch (e) {
        throw new Error(e + ': ' + source.substring(n.start, n.end));
      }
    }
    resultBody.push(n);
  });

  this.glob.component.$handler = (ctx, n) => {
    if (this.inuse.$component || n.value) ctx.writeLine('const $component = $runtime.current_component;');
  };
  this.module.head.push(this.glob.component);

  const header = [];
  header.push(rawNode(() => {
    if (this.inuse.$events) return 'const $events = $option.events || {};';
  }));

  if (lastPropIndex != null) {
    header.push(rawNode(() => {
      if (this.inuse.$props) return 'let $props = $option.props || {};';
    }));

    if (!constantProps && !this.script.readOnly) this.require('apply');

    resultBody.splice(lastPropIndex, 0, rawNode(() => {
      const code = [];
      if (this.inuse.$attributes) {
        const pa = result.props.map((p) => {
          if (p.value === void 0) return `${p.name}`;
          return `${p.name}=${p.value}`;
        }).join(', ');
        code.push(`let {${pa}, ...$attributes} = $props;`);

        if (!this.script.readOnly && !constantProps) {
          code.push(`$runtime.current_component.push = () => ({${result.props.map((p) => p.name + '=' + p.name).join(', ')}, ...$attributes} = $props = $option.props || {});`);
          code.push(`$runtime.current_component.exportedProps = () => ({${result.props.map((p) => p.name).join(', ')}});`);
        }
      } else if (this.inuse.$props) {
        const pa = result.props.map((p) => {
          if (p.value === void 0) return `${p.name}`;
          return `${p.name}=${p.value}`;
        }).join(', ');
        code.push(`let {${pa}} = $props;`);

        if (!this.script.readOnly && !constantProps) {
          code.push(`$runtime.current_component.push = () => ({${result.props.map((p) => p.name + '=' + p.name).join(', ')}} = $props = $option.props || {});`);
          code.push(`$runtime.current_component.exportedProps = () => ({${result.props.map((p) => p.name).join(', ')}});`);
        }
      }
      return code;
    }));
  } else {
    header.push(rawNode(() => {
      const code = [];
      if (this.inuse.$props && this.inuse.$attributes) {
        code.push('let $props = $option.props || {}, $attributes = $props;');
        if (!constantProps && !this.script.readOnly) code.push('$runtime.current_component.push = () => $props = $option.props || {}, $attributes = $props;');
      } else if (this.inuse.$props) {
        code.push('let $props = $option.props || {};');
        if (!constantProps && !this.script.readOnly) code.push('$runtime.current_component.push = () => $props = $option.props || {};');
      } else if (this.inuse.$attributes) {
        code.push('let $attributes = $option.props || {};');
        if (!constantProps && !this.script.readOnly) code.push('$runtime.current_component.push = () => $attributes = $option.props || {};');
      }
      return code;
    }));
  }

  header.push(rawNode(() => {
    if (this.inuse.$context) return 'const $context = $runtime.$context;';
  }));


  imports.push(rawNode(() => {
    if (this.inuse.$onMount) return 'import {$onMount} from \'malinajs/runtime.js\';';
  }));

  header.push(rawNode(() => {
    if (this.inuse.$onDestroy) return 'const $onDestroy = fn => $component._d.push(fn);';
  }));

  if (this.config.autoSubscribe) {
    const names = result.importedNames.filter((name) => name[0].toLowerCase() == name[0]);
    if (names.length) {
      if (!this.script.readOnly) this.require('$cd', 'apply');
      header.push(rawNode(() => {
        if (this.inuse.apply) return `$runtime.autoSubscribe(${names.join(', ')});`;
      }));
    }
  }

  if (!rootFunctions.$emit) {
    header.push(rawNode(() => {
      if (this.inuse.$emit) return 'const $emit = $runtime.$makeEmitter($option);';
    }));
  }

  if (this.scriptNodes[0] && this.scriptNodes[0].attributes.some((a) => a.name == 'property')) {
    result.props.forEach((p) => {
      this.require('$cd');
      resultBody.push(rawNode(`$runtime.makeExternalProperty($component, '${p.name}', () => ${p.name}, _${p.name} => ${p.name} = _${p.name});`));
    });
  }

  this.script.rootLevel = resultBody;

  this.module.top.push(xNode('autoimport', (ctx) => {
    Object.values(this.script.autoimport).forEach((l) => ctx.writeLine(l));
  }));

  this.module.top.push(xNode('ast', { body: imports }));
  this.module.head.push(xNode('ast', { body: header }));
  this.module.code.push(xNode('ast', { body: resultBody }));
}

export function build() {
  const generator = Object.assign({
    ImportExpression: function(node, state) {
      state.write('import(');
      this[node.source.type](node.source, state);
      state.write(')');
    },
    Raw: function(node, state) {
      state.write(node.value);
    }
  }, astring.baseGenerator);
  this.script.code = astring.generate(this.script.ast, { generator });
}


function rawNode(exp, n) {
  n = n || {};
  n.type = 'Raw';
  n.value = exp;
  return n;
}


const generator = Object.assign({
  ImportExpression: function(node, state) {
    state.write('import(');
    this[node.source.type](node.source, state);
    state.write(')');
  },
  Raw: function(node, state) {
    let value = typeof node.value == 'function' ? node.value() : node.value;
    if (value) {
      const indent = state.indent.repeat(state.indentLevel);
      if (!Array.isArray(value)) value = [value];
      value.forEach((v) => {
        state.write(indent + v + state.lineEnd);
      });
    }
  },
  CustomBlock: function(node, state) {
    const indent = state.indent.repeat(state.indentLevel);
    const lineEnd = state.lineEnd;

    const statements = node.body;
    const length = statements.length;

    for (let i = 0; i < length; i++) {
      const statement = statements[i];

      if (statement.type != 'Raw') state.write(indent);
      this[statement.type](statement, state);
      if (statement.type != 'Raw') state.write(lineEnd);
    }
  }
}, astring.baseGenerator);


xNode.init.ast = (ctx, node) => {
  if (!node.body.length) return;
  const code = astring.generate({
    type: 'CustomBlock',
    body: node.body
  }, { generator, startingIndentLevel: 0 });
  code.split(/\n/).forEach((s) => {
    if (s) ctx.write(true, s);
  });
};
