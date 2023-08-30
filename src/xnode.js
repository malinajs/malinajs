import { last, assert, htmlEntitiesToText, isFunction, get_context, Q } from './utils.js';


function I(value = 0) {
  this.$indent = value;
}


function xWriter(node) {
  this.indent = 0;
  this.write = function(...args) {
    for(let i of args) {
      if(i === true) node.$result.push(new I(this.indent));
      else node.$result.push(i);
    }
  };
  this.writeLine = function(s) { this.write(true, s); };

  this.add = function(n) {
    if(n === null) return;
    assert(n instanceof xNode);
    assert(!n.$inserted, 'already inserted');
    node.$result.push({ node: n, indent: this.indent });
    n.$inserted = true;
  };

  this.isEmpty = function(n) {
    if(n == null) return true;
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


export function xBuild(node, option={}) {
  let pending, trace, active;

  const resolve = n => {
    if (n.__resolving) return;
    n.__resolving = true;
    active = n;

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
    try {
      resolve(node);
    } catch (e) {
      if (active) console.log('# Error node', active);
      throw e;
    }
    if(!pending) break;
  }
  if(!depth) {
    option.warning?.('(i) Circular dependency:\n' + trace.map(s => ` * ${s}`).join('\n'));
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


export function xNode(type, ...args) {
  /*
    xNode(type, data, handler)
    xNode(type, handler)

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

  let [data, handler] = args.length == 2 ? args : [{}, args[0]];

  if(!(this instanceof xNode)) return new xNode(type, data, handler);
  Object.assign(this, data);

  this.$type = type;
  this.$handler = handler;
  this.$done = false;
  this.$inserted = false;
  this.$result = [];

  this.$setValue = function(value=true) {
    assert(!this.$done, 'Attempt to set active, depends node is already resolved');
    if (typeof(value) == 'object') Object.assign(this, value);
    else this.value = value;
  };
  resolveDependecies(this);
  return this;
}

export const resolveDependecies = node => {
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


xNode.raw = value => {
  return xNode('raw', {value}, (ctx, node) => {
    ctx.write(true, node.value);
  });
};


xNode.block = (data={}) => {
  return xNode('block', {
    body: [],
    push(child) {
      assert(arguments.length == 1, 'Wrong xNode');
      if(typeof child == 'string') child = xNode.raw(child);
      this.body.push(child);
    },
    unshift(child) {
      assert(arguments.length == 1, 'Wrong xNode');
      if(typeof child == 'string') child = xNode.raw(child);
      this.body.unshift(child);
    },
    ...data
  }, (ctx, node) => {
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
  });
};


xNode.baseNode = (type, data, handler) => {
  return xNode(type, {
    bindName() {
      if(!this._boundName) this._boundName = `el${get_context().uniqIndex++}`;
      return this._boundName;
    },
    ...data
  }, handler);
};


xNode.node = (data) => {
  return xNode.baseNode('node', {
    children: [],
    attributes: [],
    class: new Set(),
    voidTag: false,
    getLast() { return last(this.children) },
    push(n) {
      if(typeof n == 'string') {
        let p = last(this.children);
        if(p && p.$type == 'node:text') {
          p.value += n;
          return p;
        }
        n = xNode.baseNode('node:text', { value: n }, (ctx, node) => {
          ctx.write(node.value);
        });
      }
      assert(n instanceof xNode);
      this.children.push(n);
      return n;
    },
    ...data
  }, (ctx, node) => {
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
  });
};


xNode.nodeComment = (data) => {
  return xNode.baseNode('node:comment', data, (ctx, node) => {
    const config = get_context().config;
    if(config.debug && config.debugLabel) ctx.write(`<!-- ${node.value} -->`);
    else ctx.write('<!---->');
  });
};


xNode.template = (data) => {
  return xNode('template', data, (ctx, node) => {
    const config = get_context().config;
    let template = xBuild(node.body, {warning: config.warning});
    let convert, cloneNode = node.cloneNode;
    if(node.svg) {
      convert = '$runtime.svgToFragment';
      cloneNode = false;
    } else if(!template.match(/[<>]/) && !node.requireFragment) {
      convert = '$runtime.createTextNode';
      cloneNode = false;
      if(!node.raw) template = htmlEntitiesToText(template);
    } else {
      if(config.hideLabel) convert = '$runtime.htmlToFragmentClean';
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
  });
};
