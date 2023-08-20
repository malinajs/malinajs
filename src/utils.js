import acorn from 'acorn';
import astring from 'astring';

let current_context;

export const get_context = () => {
  assert(current_context, 'Out of context');
  return current_context;
};

export const use_context = (context, fn) => {
  let prev = current_context;
  try {
    current_context = context;
    return fn.call(context);
  } finally {
    current_context = prev;
  }
};

let _svgElements = 'animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,tspan,unknown,use,view';
let svgElements = {};
_svgElements.split(',').forEach(k => svgElements[k] = true);

export { svgElements };

export const last = a => a[a.length - 1];

export function assert(x, info) {
  if(!x) throw info || (new Error('AssertError'));
}

export function replace(s, from, to, count) {
  let d = s.split(from);
  if(count) assert(d.length === count + 1, 'Replace multi-entry');
  return d.join(to);
}

export function toCamelCase(name) {
  assert(last(name) !== '-', 'Wrong name');
  return name.replace(/(.\-\w)/g, function(part) {
    if(part[0] == '-') return part;
    return part[0] + part[2].toUpperCase();
  });
}

export function Q(s) {
  if(get_context().config.inlineTemplate) return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\n/g, '\\n'); 
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

export function unwrapExp(e) {
  assert(e, 'Empty expression');
  let rx = e.match(/^\{(.*)\}$/);
  assert(rx, 'Wrong expression: ' + e);
  return rx[1];
}

export function isSimpleName(name) {
  if(!name) return false;
  if(!name.match(/^([a-zA-Z$_][\w\d$_.]*)$/)) return false;
  if(name[name.length - 1] == '.') return false;
  return true;
}

export const isNumber = (value) => {
  if(typeof value == 'number') return true;
  if(!value) return false;
  if(typeof value != 'string') return false;
  return !isNaN(value);
};

export function detectExpressionType(name) {
  if(isSimpleName(name)) return 'identifier';

  let ast = acorn.parse(name, { allowReturnOutsideFunction: true, ecmaVersion: 'latest' });

  function checkIdentificator(body) {
    if(body.length != 1) return;
    if(body[0].type != 'ExpressionStatement') return;
    let obj = body[0].expression;
    return obj.type == 'Identifier' || obj.type == 'MemberExpression';
  }

  function checkFunction(body) {
    if(body.length != 1) return;
    if(body[0].type != 'ExpressionStatement') return;
    let obj = body[0].expression;
    if(obj.type != 'ArrowFunctionExpression') return;
    return true;
  }

  function checkFunctionCall(body) {
    if(body.length != 1) return;
    if(body[0].type != 'ExpressionStatement') return;
    let obj = body[0].expression;
    if(obj.type != 'CallExpression') return;
    if(obj.callee?.type == 'Identifier') return obj.callee.name;
  }

  if(checkIdentificator(ast.body)) return 'identifier';
  if(checkFunction(ast.body)) return 'function';

  let fn = checkFunctionCall(ast.body);
  if(fn) return { type: 'function-call', name: fn };
}


export function checkRootName(name) {
  let rx = name.match(/^([\w$_][\w\d$_]*)/);
  if(!rx) return this.warning({ message: 'Error name: ' + name });
  let root = rx[1];

  if(this.script.rootVariables[root] || this.script.rootFunctions[root]) return true;
  this.warning({ message: 'No name: ' + name });
}


export function trimEmptyNodes(srcNodes) {
  let nodes = srcNodes.slice();
  while(nodes.length) {
    let n = nodes[0];
    if(n.type == 'text' && !n.value.trim()) nodes.shift();
    else break;
  }
  while(nodes.length) {
    let n = last(nodes);
    if(n.type == 'text' && !n.value.trim()) nodes.pop();
    else break;
  }
  return nodes;
}


export const genId = () => {
  let id = Math.floor(Date.now() * Math.random()).toString(36);
  if(id.length > 6) id = id.substring(id.length - 6);
  return 'm' + id;
};


export const extractKeywords = (exp) => {
  let ast = acorn.parse(exp, { sourceType: 'module', ecmaVersion: 'latest' });

  const keys = new Set();
  const rec = (n) => {
    let self;
    if(n.type) {
      self = n;
      if(n.type == 'Identifier' && (n._parent.type != 'MemberExpression' || n._parent.property !== n)) {
        let name = [n.name];
        let i = n._parent;
        while(i?.type == 'MemberExpression') {
          if(i.property.type == 'Identifier') name.push('.' + i.property.name);
          else if(i.property.type == 'Literal') name.push(`[${i.property.raw}]`);
          else throw `Wrong member type: ${i.property.type}`;
          i = i._parent;
        }
        keys.add(name.join(''));
      }
    }

    for(let k in n) {
      if(k == '_parent') continue;
      let v = n[k];
      if(typeof (v) != 'object') continue;
      if(Array.isArray(v)) {
        v.forEach(i => {
          i._parent = self || n._parent;
          rec(i);
        });
      } else {
        v._parent = self || n._parent;
        rec(v);
      }
    }
  };
  rec(ast);

  return [...keys];
};


export const replaceKeyword = (exp, fn, option) => {
  let changed = false;
  let r = parseJS(exp, option).transform((n, pk) => {
    if(n.type != 'Identifier') return;
    if(pk == 'property' || pk == 'params') return;
    let name = fn(n.name);
    if(name) {
      n.name = name;
      changed = true;
    }
  });
  return changed ? r.build() : exp;
};


export const parseJS = (exp, option) => {
  let self = {};
  if(option === true) self.ast = acorn.parse(exp, { ecmaVersion: 'latest' });
  else self.ast = acorn.parseExpressionAt(exp, 0, { ecmaVersion: 'latest' });

  self.transform = function(fn) {
    const rec = (n, pk) => {
      let self;
      if(n.type) {
        self = n;
        fn?.(n, pk);
      }

      for(let k in n) {
        if(k == '_parent') continue;
        let v = n[k];
        if(v == null || typeof (v) != 'object') continue;
        if(Array.isArray(v)) {
          v.forEach(i => {
            i._parent = self || n._parent;
            rec(i, k);
          });
        } else {
          v._parent = self || n._parent;
          rec(v, k);
        }
      }
    };
    rec(self.ast, null);

    return self;
  };

  self.build = function(data) {
    return astring.generate(data || self.ast, { indent: '', lineEnd: '' });
  };
  return self;
};


export const htmlEntitiesToText = (text) => {
  let entities = [
    [/&amp;/g, '&'],
    [/&apos;/g, '\''],
    [/&#x27;/g, '\''],
    [/&#x2F;/g, '/'],
    [/&#39;/g, '\''],
    [/&#47;/g, '/'],
    [/&lt;/g, '<'],
    [/&gt;/g, '>'],
    [/&nbsp;/g, ' '],
    [/&quot;/g, '"']
  ];
  entities.forEach(([k, v]) => {
    text = text.replace(k, v);
  });
  return text;
};

export const isFunction = fn => typeof fn == 'function';
