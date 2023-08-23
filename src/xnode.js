import { last, assert, htmlEntitiesToText, isFunction, get_context, Q } from './utils.js';


function I(value = 0) {
  this.$indent = value;
}


function xWriter(node) {
  const ctx = get_context();
  this.inuse = ctx.inuse;

  this.indent = 0;
  this.write = function(...args) {
    for(let i of args) {
      if(i === true) node.$result.push(new I(this.indent));
      else node.$result.push(i);
    }
  };
  this.writeLine = function(s) { this.write(true, s); };
  this.writeIndent = function() { this.write(true); };
  this.goIndent = fn => {
    this.indent++;
    fn();
    this.indent--;
  };

  this.add = function(n) {
    if(n === null) return;
    assert(n instanceof xNode);
    assert(!n.$inserted, 'already inserted');
    node.$result.push({ node: n, indent: this.indent });
    n.$inserted = true;
  };

  this.isEmpty = function(n) {
    if(n == null) return true;
    if(n.$type == 'if:bind') return false;
    assert(n.$done, 'Node is not built');
    return !n.$result.some(r => {
      if(typeof (r) == 'string') return true;
      else if(r.node instanceof xNode) return !this.isEmpty(r.node);
      else if(r instanceof I) return true;
      else {
        console.error('Type', r);
        throw 'error type';
      }
    });
  };
}


export function xBuild(node) {
  let pending, trace;
  const resolve = n => {
    if (n.__resolving) return;
    n.__resolving = true;

    if (!n.$done) {
      let ready = true;
      n.$wait?.forEach(i => {
        if (i == null) return;
        assert(i instanceof xNode, '$wait supports only xNode');
        if (i.$done) return;
        resolve(i);
        if (i.$done) return;
        ready = false;
        trace.push(`${n.$type} -> ${i.$type}`);
      });
      if(ready) {
        let w = new xWriter(n);
        n.$handler(w, n);
        n.$done = true;
      }
    }

    if(n.$done) {
      n.$result.forEach(r => {
        if(r?.node instanceof xNode) resolve(r.node);
      });
    } else pending++;

    n.__resolving = false;
  };

  let depth;
  for(depth = 10; depth > 0; depth--) {
    pending = 0;
    trace = [];
    resolve(node);
    if(!pending) break;
  }
  if(!depth) {
    trace.forEach(i => get_context().warning(` * ${i}`));
    throw new Error('xNode: Circular dependency');
  }

  let result = [];

  const asm = (n, baseIndent) => {
    if(!n.$done) {
      console.log('not resolved', n);
      throw 'node is not resolved';
    }
    n.$result.forEach(r => {
      if(typeof (r) == 'string') result.push(r);
      else if(r.node instanceof xNode) {
        asm(r.node, r.indent + baseIndent);
      } else if(r instanceof I) {
        r.$indent += baseIndent;
        result.push(r);
      } else {
        console.error('Type', r);
        throw 'error type';
      }
    });
  };
  asm(node, 0);

  for(let i = 0; i < result.length; i++) {
    let r = result[i];
    let next = result[i + 1];

    if(r instanceof I) {
      if(next instanceof I) {
        result[i] = '';
      } else {
        let s = '\n';
        let j = r.$indent;
        while(j--) {
          s += '  ';
        }
        result[i] = s;
      }
    }
  }

  return result.join('');
}


const noop = () => {};


export function xNode(_type, _data, _handler) {
  /*
    xNode(type, data, handler)
    xNode(type, handler)
    xNode(data, handler)
    xNode(handler)
    xNode(xNode, data, handler)

    $wait - wait for a node be processed
    $hold - hold a node from processing, such node must be created before building

      xNode('name', {
        $wait: ['apply', 'rootCD', anotherNode],
        $hold: ['apply', anotherNode]
      }, (ctx, node) => {
        this.inuse.apply      // check if apply is used
        this.inuse.rootCD     // check if rootCD is used
        node.$wait[0].value   // check value of first node in $wait
        ctx.add(childNode);   // insert a node
        ...
      })
  */

  if(_type instanceof xNode) {
    let n = _type;
    if(isFunction(_handler)) {
      Object.assign(n, _data);
      n.$handler = _handler;
    } else {
      assert(!_handler && isFunction(_data), 'Wrong xNode usage');
      n.$handler = _data;
    }
    resolveDependecies(n);
    return n;
  }
  if(!(this instanceof xNode)) return new xNode(_type, _data, _handler);

  let type, data, handler;
  if(typeof _type == 'string') {
    type = _type;
    if(_data === false && !_handler) {
      handler = noop;
      data = null;
    } else if(_handler === false && typeof (_data) == 'object') {
      handler = noop;
      data = _data;
    } else if(typeof _data == 'function') {
      assert(!_handler);
      handler = _data;
    } else {
      data = _data;
      handler = _handler;
    }
  } else if(typeof _type == 'function') {
    assert(!_data && !_handler);
    handler = _type;
  } else {
    assert(typeof _type == 'object');
    data = _type;
    handler = _data;
  }

  if(!handler) handler = xNode.init[type];
  assert(handler);

  if(data) Object.assign(this, data);
  if(handler.init) {
    handler.init(this);
    handler = handler.handler;
    assert(handler);
  }

  this.$type = type;
  this.$handler = handler;
  this.$done = false;
  this.$inserted = false;
  this.$result = [];

  this.$value = function(value=true) {
    assert(!this.$done, 'Attempt to set active, depends node is already resolved');
    this.value = value;
  };
  resolveDependecies(this);
  return this;
}

const resolveDependecies = node => {
  if(node.$wait) {
    node.$wait = node.$wait.map(n => {
      if(typeof (n) == 'string') {
        const context = get_context();
        assert(context.glob[n], `Wrong dependency '${n}'`);
        n = context.glob[n];
      }
      return n;
    });
  }

  if(node.$hold) {
    node.$hold = node.$hold.map(n => {
      if(typeof (n) == 'string') {
        const context = get_context();
        assert(context.glob[n], `Wrong dependency '${n}'`);
        n = context.glob[n];
      }
      assert(!n.$done, 'Attempt to add dependecy, but node is already resolved');
      if(!n.$wait) n.$wait = [];
      n.$wait.push(node);
      return n;
    });
  }
};

xNode.init = {
  raw: (ctx, node) => {
    ctx.writeLine(node.value);
  },
  block: {
    init: (node) => {
      if(!node.body) node.body = [];
      node.push = function(child) {
        assert(arguments.length == 1, 'Wrong xNode');
        if(typeof child == 'string') child = xNode('raw', { value: child });
        this.body.push(child);
      };
      node.unshift = function(child) {
        assert(arguments.length == 1, 'Wrong xNode');
        if(typeof child == 'string') child = xNode('raw', { value: child });
        this.body.unshift(child);
      };
    },
    handler: (ctx, node) => {
      if(node.scope) {
        ctx.writeLine('{');
        ctx.indent++;
      }
      node.body.forEach(n => {
        if(n == null) return;
        if(typeof n == 'string') {
          if(n) ctx.writeLine(n);
        } else ctx.add(n);
      });
      if(node.scope) {
        ctx.indent--;
        ctx.writeLine('}');
      }
    }
  },
  function: {
    init: (node) => {
      if(!node.args) node.args = [];
      xNode.init.block.init(node);
    },
    handler: (ctx, node) => {
      if(!node.inline) ctx.write(true);

      if(node.arrow) {
        if(node.name) ctx.write(`let ${node.name} = `);
      } else {
        ctx.write('function');
        if(node.name) ctx.write(' ' + node.name);
      }
      ctx.write(`(${node.args.join(', ')}) `);
      if(node.arrow) ctx.write('=> ');
      ctx.write('{', true);
      ctx.indent++;
      xNode.init.block.handler(ctx, node);
      ctx.indent--;
      if(node.inline) ctx.write(true, '}');
      else ctx.writeLine('}');
    }
  },
  node: {
    init: (node) => {
      node.children = [];
      node.attributes = [];
      node.class = new Set();
      node.voidTag = false;

      node.bindName = xNode.init.node.bindName;
      node.getLast = () => last(node.children);
      node.push = function(n) {
        if(typeof n == 'string') {
          let p = last(this.children);
          if(p && p.$type == 'node:text') {
            p.value += n;
            return p;
          }
          n = xNode('node:text', { value: n });
        }
        assert(n instanceof xNode);
        this.children.push(n);
        return n;
      };
    },
    handler: (ctx, node) => {
      if(node.inline) {
        node.children.forEach(n => ctx.add(n));
      } else {
        assert(node.name, 'No node name');
        ctx.write(`<${node.name}`);

        if(node.attributes.length) {
          node.attributes.forEach(p => {
            if(p.name == 'class') {
              if(p.value) p.value.split(/\s+/).forEach(name => node.class.add(name));
              return;
            }

            if(p.value) ctx.write(` ${p.name}="${p.value}"`);
            else ctx.write(` ${p.name}`);
          });
        }

        if (node.class.size) {
          ctx.add(get_context().css.resolveAsNode(node.class, [' class="', '"']));
        }
        
        if(node.children.length) {
          ctx.write('>');
          node.children.forEach(n => ctx.add(n));
          ctx.write(`</${node.name}>`);
        } else {
          if(node.voidTag) ctx.write('/>');
          else ctx.write(`></${node.name}>`);
        }
      }
    },
    bindName: function() {
      if(!this._boundName) this._boundName = `el${get_context().uniqIndex++}`;
      return this._boundName;
    }
  },
  'node:text': {
    init: (node) => {
      node.bindName = xNode.init.node.bindName;
    },
    handler: (ctx, node) => {
      ctx.write(node.value);
    }
  },
  'node:comment': {
    init: (node) => {
      node.bindName = xNode.init.node.bindName;
    },
    handler: (ctx, node) => {
      const context = get_context();
      if(context.config.debug && context.config.debugLabel) ctx.write(`<!-- ${node.value} -->`);
      else ctx.write('<!---->');
    }
  },
  template: (ctx, node) => {
    let template = xBuild(node.body);
    let convert, cloneNode = node.cloneNode;
    if(node.svg) {
      convert = '$runtime.svgToFragment';
      cloneNode = false;
    } else if(!template.match(/[<>]/) && !node.requireFragment) {
      convert = '$runtime.createTextNode';
      cloneNode = false;
      if(!node.raw) template = htmlEntitiesToText(template);
    } else {
      if(get_context().config.hideLabel) convert = '$runtime.htmlToFragmentClean';
      else convert = '$runtime.htmlToFragment';
      template = template.replace(/<!---->/g, '<>');
    }
    if(node.raw) {
      ctx.write(Q(template));
    } else if(node.inline) {
      ctx.write(`${convert}(\`${Q(template)}\``);
      if(cloneNode || node.requireFragment) {
        let opt = (cloneNode ? 1 : 0) + (node.requireFragment ? 2 : 0);
        ctx.write(`, ${opt})`);
      } else ctx.write(')');
    } else {
      assert(node.name);
      ctx.write(true, `const ${node.name} = ${convert}(\`${Q(template)}\``);
      if(cloneNode || node.requireFragment) {
        let opt = (cloneNode ? 1 : 0) + (node.requireFragment ? 2 : 0);
        ctx.write(`, ${opt});`);
      } else ctx.write(');');
    }
  }
};
