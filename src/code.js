import * as acorn from 'acorn';
import * as astring from 'astring';
import { assert, detectExpressionType, last, isNumber } from './utils.js';
import { xNode } from './xnode.js';


export function parse() {
  let source = this.scriptNodes.length ? this.scriptNodes[0].content : null;
  this.script = {
    source,
    imports: [],
    importedNames: [],
    autosubscribeNames: [],
    props: [],
    rootVariables: {},
    rootFunctions: {},
    autoimport: {},
    comments: []
  };
  if (source) {
    source = source.split(/\n/).map(line => {
      let rx = line.match(/^(\s*)\/\/(.*)$/);
      if (!rx) return line;
      let code = rx[2].trim();
      if (code != '!no-check') return line;
      return rx[1] + '$$_noCheck;';
    }).join('\n');

    const onComment = (isBlockComment, value, start, end) => {
      if (isBlockComment) return;
      this.script.comments.push({ start, end, value });
    };
    this.script.ast = acorn.parse(source, { sourceType: 'module', ecmaVersion: 'latest', onComment });

    if (source.includes('$props')) this.require('$props', 'apply');
    if (source.includes('$attributes')) this.require('$attributes', 'apply');
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

  let rootVariables = result.rootVariables;
  let rootFunctions = result.rootFunctions;
  ast.body.forEach(n => {
    if (n.type == 'FunctionDeclaration') {
      rootFunctions[n.id.name] = true;
    } else if (n.type == 'VariableDeclaration') {
      n.declarations.forEach(i => {
        rootVariables[i.id.name] = true;
        if (i.init && i.init.type == 'ArrowFunctionExpression') rootFunctions[i.id.name] = true;
      });
    }
  });

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
    let method = node._parent.callee.property.name;
    return ['forEach', 'map', 'filter', 'find', 'findIndex'].includes(method);
  }

  function isNoCheck(node) {
    return node.type == 'ExpressionStatement' && node.expression.type == 'Identifier' && node.expression.name == '$$_noCheck';
  }

  const transformNode = (node) => {
    if (funcTypes[node.type] && node.body.body && node.body.body.length) {
      if (node._parent.type == 'CallExpression' && node._parent.callee.name == '$onDestroy') return 'stop';
      for (let i = 0; i < node.body.body.length; i++) {
        let n = node.body.body[i];
        if (!isNoCheck(n)) continue;
        node.body.body.splice(i, 1);
        if (i > 0) {
          node.body.body[i - 1].__stop = true;
          return;
        }
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
      let n = node, p;
      while (n._parent) {
        p = n._parent;
        if (p.type == 'BlockStatement') break;
        n = p;
        p = null;
      }
      if (p) {
        let i = p.body.indexOf(n);
        if (i >= 0 && !(p.body[i + 1] && p.body[i + 1]._apply)) {
          if (n.type == 'ReturnStatement') {
            n.argument = returnApplyBlock(n.argument);
          } else {
            p.body.splice(i + 1, 0, applyBlock());
          }
        }
      }
    } else if (node.type == 'CallExpression' && node.callee?.name == '$watch') {
      this.require('rootCD');
      node.callee.name = '$watchCustom';
      node.arguments[0].__skip = true;

      if (node.arguments[2]?.type == 'Literal') {
        let value = node.arguments[2].raw;
        if (isNumber(value)) {
          value = +value;
          if (value == 1) node.arguments[2] = {type: 'Raw', value: '{cmp: $runtime.keyComparator, value: {}}'};
          else if (value > 1) node.arguments[2] = {type: 'Raw', value: `{cmp: $runtime.deepComparator(${value})}`};
          else node.arguments.length = 2;
        }
      }
    }
  }

  function walk(node, parent) {
    if (typeof node !== 'object') return;

    if (node._apply && node.type == 'ExpressionStatement') return;
    node._parent = parent;
    let forParent = parent;
    if (node.type) {
      if (transformNode(node) == 'stop') return;
      forParent = node;
    }
    for (let key in node) {
      let child = node[key];
      if (key == '_parent') continue;
      if (!child || typeof child !== 'object') continue;

      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          if (!child[i].__skip) walk(child[i], forParent);
          if (child[i].__stop) break;
        }
      } else {
        walk(child, forParent);
      }
    }
  }
  walk(ast, null);

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

  let watchers = xNode.block();

  const makeWatch = (n) => {
    function assertExpression(n) {
      if (['Identifier', 'TemplateLiteral', 'Literal'].includes(n.type)) return;
      if (n.type.endsWith('Expression')) return;
      throw 'Wrong expression';
    }

    if (n.body.type != 'ExpressionStatement') throw 'Error';
    if (n.body.expression.type == 'AssignmentExpression') {
      const ex = n.body.expression;
      if (ex.operator != '=') throw 'Error';
      let target;
      if (ex.left.type == 'Identifier') {
        target = ex.left.name;
        if (!(target in rootVariables)) resultBody.push(makeVariable(target));
      } else if (ex.left.type == 'MemberExpression') {
        target = astring.generate(ex.left);
      } else throw 'Error';
      assertExpression(ex.right);
      const exp = astring.generate(ex.right);
      watchers.push(xNode('watch-assign', {
        $wait: ['apply'],
        target,
        exp
      }, (ctx, n) => {
        if (this.inuse.apply) ctx.write(true, `$runtime.prefixPush(() => {${n.target} = ${n.exp};});`);
        else ctx.write(true, `${n.target} = ${n.exp};`);
      }));
    } else if (n.body.expression.type == 'SequenceExpression') {
      const ex = n.body.expression.expressions;
      const handler = last(ex);
      let callback = astring.generate(handler);
      if (handler.type == 'ArrowFunctionExpression' || handler.type == 'FunctionExpression') {
        // default
      } else if (detectExpressionType(callback) == 'identifier') {
        callback = `(v) => { ${callback}(v); }`;
      } else {
        callback = `() => { ${callback}; }`;
      }

      if (ex.length == 2) {
        assertExpression(ex[0]);
        watchers.push(xNode('watch-expression', {
          $wait: ['apply'],
          exp: astring.generate(ex[0]),
          callback
        }, (ctx, n) => {
          if (this.inuse.apply) {
            if (this.config.immutable) ctx.write(true, `$watch(() => (${n.exp}), ${n.callback});`);
            else ctx.write(true, `$watch(() => (${n.exp}), ${n.callback}, {cmp: $runtime.deepComparator(0)});`);
          } else {
            ctx.write(true, `(${n.callback})(${n.exp});`);
          }
        }));
      } else if (ex.length > 2) {
        for (let i = 0; i < ex.length - 1; i++) assertExpression(ex[i]);
        let exp = {
          type: 'ArrayExpression',
          elements: ex.slice(0, ex.length - 1)
        };

        watchers.push(xNode('watch-expression', {
          $wait: ['apply'],
          exp: astring.generate(exp),
          callback
        }, (ctx, n) => {
          if (this.inuse.apply) ctx.write(true, `$watch(() => ${n.exp}, ($args) => { (${n.callback}).apply(null, $args); }, {cmp: $runtime.deepComparator(1)});`);
          else ctx.write(true, `(${n.callback}).apply(null, ${n.exp})`);
        }));
      } else throw 'Error';
    } else throw 'Error';
  };

  let imports = [];
  let resultBody = [];
  let lastPropIndex = null;
  let constantProps = true;

  if (result.comments.length) {
    result.comments.forEach(c => {
      let last;
      for (let i = 0; i < ast.body.length; i++) {
        let n = ast.body[i];
        if (n.start >= c.start) break;
        last = n;
      }
      if (last && last.end <= c.start) last._comment = c.value;
    });
  }

  let exportedFunctions = xNode('exported-functions', {
    $hold: ['$component'],
    list: []
  }, (ctx, n) => {
    if (!n.list.length) return;
    this.require('$component');
    for (let name of n.list) ctx.write(true, `$component.${name} = ${name};`);
  });

  ast.body.forEach(n => {
    if (n.type == 'ImportDeclaration') {
      imports.push(n);
      n.specifiers.forEach(s => {
        if (s.local.type != 'Identifier') return;
        let name = s.local.name;
        result.importedNames.push(name);
        if (name[0].toLowerCase() == name[0]) {
          if (!n._comment || !n._comment.includes('!no-autosubscribe')) result.autosubscribeNames.push(s.local.name);
        }
        if (s.type != 'ImportDefaultSpecifier') return;
        result.imports.push(name);
      });
      return;
    } else if (n.type == 'ExportNamedDeclaration') {
      if (n.declaration.type == 'FunctionDeclaration') {
        exportedFunctions.list.push(n.declaration.id.name);
        resultBody.push(n.declaration);
        return;
      }

      assert(n.declaration.type == 'VariableDeclaration', 'Wrong export');
      if (n.declaration.kind != 'const') constantProps = false;
      n.declaration.declarations.forEach(d => {
        assert(d.type == 'VariableDeclarator', 'Wrong export');
        let p = { name: d.id.name };
        if (d.init) {
          if (d.init.type == 'Literal') {
            p.value = d.init.raw;
          } else {
            p.value = astring.generate(d.init);
          }
        }
        result.props.push(p);
        this.require('$props');
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


  let blockHead = [];
  let blockTail = [];
  if (lastPropIndex != null) {
    blockHead = resultBody.slice(0, lastPropIndex);
    blockTail = resultBody.slice(lastPropIndex);
  } else {
    blockTail = resultBody;
  }

  const $props = xNode('$props', (ctx, n) => {
    n.value && ctx.add(n.value);
  });
  this.module.head.push($props);

  this.module.code.push(nodeAst({ body: blockHead }));
  this.module.code.push(xNode('$props-update', {
    $hold: ['apply', '$props', '$attributes', $props],
    constantProps,
    head: $props
  }, (ctx, n) => {
    const props = this.script.props;
    const $props = this.glob.$props.value;
    const $attributes = this.glob.$attributes.value;

    if (props.length) {
      // exported props
      n.head.value = xNode('$props', {}, (ctx, n) => {
        ctx.write(true, 'let $props = $option.props || {};');
      });
      if (!n.constantProps) this.require('apply');

      if ($attributes) {
        let pa = props.map(p => {
          if (p.value === void 0) return `${p.name}`;
          return `${p.name}=${p.value}`;
        }).join(', ');
        ctx.write(true, `let {${pa}, ...$attributes} = $props;`);

        if (!n.constantProps) {
          ctx.write(true, `$runtime.current_component.$push = ($$props) => ({${props.map(p => p.name + '=' + p.name).join(', ')}, ...$attributes} = $props = $$props);`);
          ctx.write(true, `$runtime.current_component.$exportedProps = () => ({${props.map(p => p.name).join(', ')}});`);
        }
      } else {
        let pa = props.map(p => {
          if (p.value === void 0) return `${p.name}`;
          return `${p.name}=${p.value}`;
        }).join(', ');
        ctx.write(true, `let {${pa}} = $props;`);

        if (!n.constantProps) {
          ctx.write(true, `$runtime.current_component.$push = ($$props) => ({${props.map(p => p.name + '=' + p.name).join(', ')}} = $props = $$props);`);
          ctx.write(true, `$runtime.current_component.$exportedProps = () => ({${props.map(p => p.name).join(', ')}});`);
        }
      }
    } else {
      // no exported props
      n.head.value = xNode('no-props', ctx => {
        if ($props && $attributes) {
          ctx.write(true, 'let $props = $option.props || {}, $attributes = $props;');
          ctx.write(true, '$runtime.current_component.$push = ($$props) => $props = $attributes = $$props;');
        } else if ($props) {
          ctx.write(true, 'let $props = $option.props || {};');
          ctx.write(true, '$runtime.current_component.$push = ($$props) => $props = $$props;');
        } else if ($attributes) {
          ctx.write(true, 'let $attributes = $option.props || {};');
          ctx.write(true, '$runtime.current_component.$push = ($$props) => $attributes = $$props;');
        }
      });
    }
  }));
  this.module.code.push(nodeAst({ body: blockTail }));

  this.module.top.push(xNode('autoimport', (ctx) => {
    Object.values(this.script.autoimport).forEach(l => ctx.writeLine(l));
  }));

  this.module.top.push(nodeAst({ body: imports }));
  this.module.code.push(watchers);

  if (this.scriptNodes[0] && this.scriptNodes[0].attributes.some(a => a.name == 'property') && this.script.props.length) {
    this.require('apply');
    this.module.code.push(xNode('external-property', {
      props: this.script.props
    }, (ctx, n) => {
      n.props.forEach(p => {
        ctx.write(true, `$runtime.makeExternalProperty('${p.name}', () => ${p.name}, _${p.name} => ${p.name} = _${p.name});`);
      });
    }));
  }

  this.module.code.push(exportedFunctions);
}


const generator = Object.assign({
  Raw: function(node, state) {
    let value = typeof node.value == 'function' ? node.value() : node.value;
    if (value) {
      let indent = state.indent.repeat(state.indentLevel);
      if (!Array.isArray(value)) value = [value];
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

    for (let i = 0; i < length; i++) {
      let statement = statements[i];

      if (statement.type != 'Raw') state.write(indent);
      this[statement.type](statement, state);
      if (statement.type != 'Raw') state.write(lineEnd);
    }
  }
}, astring.baseGenerator);


function nodeAst(data) {
  return xNode('ast', data, (ctx, node) => {
    if (!node.body.length) return;
    let code = astring.generate({
      type: 'CustomBlock',
      body: node.body
    }, { generator, startingIndentLevel: 0 });
    code.split(/\n/).forEach(s => {
      if (s) ctx.write(true, s);
    });
  });
}
