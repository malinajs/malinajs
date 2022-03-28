import * as acorn from 'acorn';
import * as astring from 'astring';
import { assert, detectExpressionType } from './utils.js';
import { xNode } from './xnode.js';


export function parse() {
  let source = this.scriptNodes.length ? this.scriptNodes[0].content : null;
  this.script = {
    source,
    watchers: [],
    imports: [],
    importedNames: [],
    autosubscribeNames: [],
    props: [],
    rootVariables: {},
    rootFunctions: {},
    readOnly: false,
    autoimport: {},
    comments: []
  };
  if(source) {
    this.script.readOnly = this.scriptNodes.some(n => n.attributes.some(a => a.name == 'read-only'));

    if(!this.script.readOnly) {
      source = source.split(/\n/).map(line => {
        let rx = line.match(/^(\s*)\/\/(.*)$/);
        if(!rx) return line;
        let code = rx[2].trim();
        if(code != '!no-check') return line;
        return rx[1] + '$$_noCheck;';
      }).join('\n');
    }
    const onComment = (isBlockComment, value, start, end) => {
      if(isBlockComment) return;
      this.script.comments.push({ start, end, value });
    };
    this.script.ast = acorn.parse(source, { sourceType: 'module', ecmaVersion: 13, onComment });

    if(source.includes('$props')) this.require('$props');
    if(source.includes('$attributes')) this.require('$attributes');
    if(source.includes('$emit')) this.require('$emit');
    if(source.includes('$onDestroy')) this.require('$onDestroy');
    if(source.includes('$onMount')) this.require('$onMount');
    if(source.includes('$context')) this.require('$context');
    if(source.includes('$component')) this.require('$component');
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

  let rootVariables = result.rootVariables;
  let rootFunctions = result.rootFunctions;
  ast.body.forEach(n => {
    if(n.type == 'FunctionDeclaration') {
      rootFunctions[n.id.name] = true;
    } else if(n.type == 'VariableDeclaration') {
      n.declarations.forEach(i => {
        rootVariables[i.id.name] = true;
        if(i.init && i.init.type == 'ArrowFunctionExpression') rootFunctions[i.id.name] = true;
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
    if(!node._parent || node._parent.type != 'CallExpression') return false;
    if(node._parent.callee.type != 'MemberExpression') return false;
    let method = node._parent.callee.property.name;
    return method == 'forEach' || method == 'map' || method == 'filter';
  }

  function isNoCheck(node) {
    return node.type == 'ExpressionStatement' && node.expression.type == 'Identifier' && node.expression.name == '$$_noCheck';
  }

  function transformNode(node) {
    if(funcTypes[node.type] && node.body.body && node.body.body.length) {
      if(node._parent.type == 'CallExpression' && node._parent.callee.name == '$onDestroy') return 'stop';
      for(let i = 0; i < node.body.body.length; i++) {
        let n = node.body.body[i];
        if(!isNoCheck(n)) continue;
        node.body.body.splice(i, 1);
        return 'stop';
      }
      if(!isInLoop(node)) {
        node.body.body.unshift(applyBlock());
      }
    } else if(node.type == 'ArrowFunctionExpression') {
      if(node._parent.type == 'CallExpression' && node._parent.callee.name == '$onDestroy') return 'stop';
      if(node.body.type != 'BlockStatement' && node.body.type != 'ArrowFunctionExpression' && !isInLoop(node)) {
        node.body = returnApplyBlock(node.body);
      }
    } else if(node.type == 'AwaitExpression') {
      let n = node, p;
      while(n._parent) {
        p = n._parent;
        if(p.type == 'BlockStatement') break;
        n = p;
        p = null;
      }
      if(p) {
        let i = p.body.indexOf(n);
        if(i >= 0 && !(p.body[i + 1] && p.body[i + 1]._apply)) {
          if(n.type == 'ReturnStatement') {
            n.argument = returnApplyBlock(n.argument);
          } else {
            p.body.splice(i + 1, 0, applyBlock());
          }
        }
      }
    }
  }

  function walk(node, parent, fn) {
    if(typeof node !== 'object') return;

    if(node._apply) return;
    node._parent = parent;
    let forParent = parent;
    if(node.type) {
      if(fn(node) == 'stop') return;
      forParent = node;
    }
    for(let key in node) {
      let child = node[key];
      if(key == '_parent') continue;
      if(!child || typeof child !== 'object') continue;

      if(Array.isArray(child)) {
        for(let i = 0; i < child.length; i++) {
          walk(child[i], forParent, fn);
        }
      } else {
        walk(child, forParent, fn);
      }
    }
  }
  if(!this.script.readOnly) walk(ast, null, transformNode);

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
      if(['Identifier', 'TemplateLiteral', 'Literal'].includes(n.type)) return;
      if(n.type.endsWith('Expression')) return;
      throw 'Wrong expression';
    }

    if(n.body.type != 'ExpressionStatement') throw 'Error';
    if(n.body.expression.type == 'AssignmentExpression') {
      const ex = n.body.expression;
      if(ex.operator != '=') throw 'Error';
      let target;
      if(ex.left.type == 'Identifier') {
        target = ex.left.name;
        if(!(target in rootVariables)) resultBody.push(makeVariable(target));
      } else if(ex.left.type == 'MemberExpression') {
        target = source.substring(ex.left.start, ex.left.end);
      } else throw 'Error';
      assertExpression(ex.right);
      const exp = source.substring(ex.right.start, ex.right.end);
      result.watchers.push(`$runtime.prefixPush(() => {${target} = ${exp};});`);
    } else if(n.body.expression.type == 'SequenceExpression') {
      const ex = n.body.expression.expressions;
      const handler = ex[ex.length - 1];
      let callback = source.substring(handler.start, handler.end);
      if(handler.type == 'ArrowFunctionExpression' || handler.type == 'FunctionExpression') {
        // default
      } else if(detectExpressionType(callback) == 'identifier') {
        callback = `(v) => { ${callback}(v); }`;
      } else {
        callback = `() => { ${callback}; }`;
      }

      if(ex.length == 2) {
        assertExpression(ex[0]);
        let exp = source.substring(ex[0].start, ex[0].end);
        if(this.config.immutable) result.watchers.push(`$watch($cd, () => (${exp}), ${callback});`);
        else result.watchers.push(`$watch($cd, () => (${exp}), ${callback}, {cmp: $runtime.$$deepComparator(0)});`);
      } else if(ex.length > 2) {
        for(let i = 0; i < ex.length - 1; i++) assertExpression(ex[i]);
        let exp = source.substring(ex[0].start, ex[ex.length - 2].end);
        result.watchers.push(`$watch($cd, () => [${exp}], ($args) => { (${callback}).apply(null, $args); }, {cmp: $runtime.$$deepComparator(1)});`);
      } else throw 'Error';
    } else throw 'Error';
  };

  let imports = [];
  let resultBody = [];
  let lastPropIndex = null;
  let constantProps = true;

  if(result.comments.length) {
    result.comments.forEach(c => {
      let last;
      for(let i = 0; i < ast.body.length; i++) {
        let n = ast.body[i];
        if(n.start >= c.start) break;
        last = n;
      }
      if(last && last.end <= c.start) last._comment = c.value;
    });
  }

  ast.body.forEach(n => {
    if(n.type == 'ImportDeclaration') {
      imports.push(n);
      n.specifiers.forEach(s => {
        if(s.local.type != 'Identifier') return;
        let name = s.local.name;
        result.importedNames.push(name);
        if(name[0].toLowerCase() == name[0]) {
          if(!n._comment || !n._comment.includes('!no-autosubscribe')) result.autosubscribeNames.push(s.local.name);
        }
        if(s.type != 'ImportDefaultSpecifier') return;
        result.imports.push(name);
      });
      return;
    } else if(n.type == 'ExportNamedDeclaration') {
      if(n.declaration.kind != 'const') constantProps = false;
      assert(n.declaration.type == 'VariableDeclaration', 'Wrong export');
      n.declaration.declarations.forEach(d => {
        assert(d.type == 'VariableDeclarator', 'Wrong export');
        let p = { name: d.id.name };
        if(d.init) {
          if(d.init.type == 'Literal') {
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

    if(n.type == 'LabeledStatement' && n.label.name == '$') {
      try {
        makeWatch(n);
        return;
      } catch (e) {
        throw new Error(e + ': ' + source.substring(n.start, n.end));
      }
    }
    resultBody.push(n);
  });

  let header = [];

  if(lastPropIndex != null) {
    header.push(rawNode(() => {
      if(this.inuse.$props) return 'let $props = $option.props || {};';
    }));

    if(!constantProps && !this.script.readOnly) this.require('apply');

    resultBody.splice(lastPropIndex, 0, rawNode(() => {
      let code = [];
      if(this.inuse.$attributes) {
        let pa = result.props.map(p => {
          if(p.value === void 0) return `${p.name}`;
          return `${p.name}=${p.value}`;
        }).join(', ');
        code.push(`let {${pa}, ...$attributes} = $props;`);

        if(!this.script.readOnly && !constantProps) {
          code.push(`$runtime.current_component.push = () => ({${result.props.map(p => p.name + '=' + p.name).join(', ')}, ...$attributes} = $props = $option.props || {});`);
          code.push(`$runtime.current_component.exportedProps = () => ({${result.props.map(p => p.name).join(', ')}});`);
        }
      } else if(this.inuse.$props) {
        let pa = result.props.map(p => {
          if(p.value === void 0) return `${p.name}`;
          return `${p.name}=${p.value}`;
        }).join(', ');
        code.push(`let {${pa}} = $props;`);

        if(!this.script.readOnly && !constantProps) {
          code.push(`$runtime.current_component.push = () => ({${result.props.map(p => p.name + '=' + p.name).join(', ')}} = $props = $option.props || {});`);
          code.push(`$runtime.current_component.exportedProps = () => ({${result.props.map(p => p.name).join(', ')}});`);
        }
      }
      return code;
    }));
  } else {
    header.push(rawNode(() => {
      let code = [];
      if(this.inuse.$props && this.inuse.$attributes) {
        code.push('let $props = $option.props || {}, $attributes = $props;');
        if(!this.script.readOnly) code.push('$runtime.current_component.push = () => $props = $option.props || {}, $attributes = $props;');
      } else if(this.inuse.$props) {
        code.push('let $props = $option.props || {};');
        if(!this.script.readOnly) code.push('$runtime.current_component.push = () => $props = $option.props || {};');
      } else if(this.inuse.$attributes) {
        code.push('let $attributes = $option.props || {};');
        if(!this.script.readOnly) code.push('$runtime.current_component.push = () => $attributes = $option.props || {};');
      }
      return code;
    }));
  }

  if(this.scriptNodes[0] && this.scriptNodes[0].attributes.some(a => a.name == 'property')) {
    result.props.forEach(p => {
      this.require('rootCD');
      resultBody.push(rawNode(`$runtime.makeExternalProperty($component, '${p.name}', () => ${p.name}, _${p.name} => ${p.name} = _${p.name});`));
    });
  }

  this.script.rootLevel = resultBody;

  this.module.top.push(xNode('autoimport', (ctx) => {
    Object.values(this.script.autoimport).forEach(l => ctx.writeLine(l));
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
  }, astring.GENERATOR);
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
    if(value) {
      let indent = state.indent.repeat(state.indentLevel);
      if(!Array.isArray(value)) value = [value];
      value.forEach(v => {
        state.write(indent + v + state.lineEnd);
      });
    }
  },
  CustomBlock: function(node, state) {
    let indent = state.indent.repeat(state.indentLevel);
    let lineEnd = state.lineEnd;

    let statements = node.body;
    let length = statements.length;

    for(let i = 0; i < length; i++) {
      let statement = statements[i];

      if(statement.type != 'Raw') state.write(indent);
      this[statement.type](statement, state);
      if(statement.type != 'Raw') state.write(lineEnd);
    }
  }
}, astring.GENERATOR);


xNode.init.ast = (ctx, node) => {
  if(!node.body.length) return;
  let code = astring.generate({
    type: 'CustomBlock',
    body: node.body
  }, { generator, startingIndentLevel: 0 });
  code.split(/\n/).forEach(s => {
    if(s) ctx.write(true, s);
  });
};
