import acorn from 'acorn';
import astring from 'astring';


const _svgElements = 'animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,tspan,unknown,use,view';
const svgElements = {};
_svgElements.split(',').forEach((k) => svgElements[k] = true);

export { svgElements };

export const last = (a) => a[a.length - 1];

export function assert(x, info) {
  if (!x) throw info || (new Error('AssertError'));
}

export function replace(s, from, to, count) {
  const d = s.split(from);
  if (count) assert(d.length === count + 1, 'Replace multi-entry');
  return d.join(to);
}

export function toCamelCase(name) {
  assert(name[name.length - 1] !== '-', 'Wrong name');
  return name.replace(/(\-\w)/g, function(part) {
    return part[1].toUpperCase();
  });
}

export function Q(s) {
  return s.replace(/`/g, '\\`').replace(/\\/g, '\\\\');
}

export function Q2(s) {
  return s.replace(/`/g, '\\`').replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

export function unwrapExp(e) {
  assert(e, 'Empty expression');
  const rx = e.match(/^\{(.*)\}$/);
  assert(rx, 'Wrong expression: ' + e);
  return rx[1];
}

export function isSimpleName(name) {
  if (!name) return false;
  if (!name.match(/^([a-zA-Z\$_][\w\d\$_\.]*)$/)) return false;
  if (name[name.length - 1] == '.') return false;
  return true;
}

export const isNumber = (value) => !isNaN(parseFloat(value)) && !isNaN(value - 0);

export function detectExpressionType(name) {
  if (isSimpleName(name)) return 'identifier';

  const ast = acorn.parse(name, { allowReturnOutsideFunction: true });

  function checkIdentificator(body) {
    if (body.length != 1) return;
    if (body[0].type != 'ExpressionStatement') return;
    if (body[0].expression.type != 'Identifier') return;
    return true;
  }

  function checkMemberIdentificator(body) {
    if (body.length != 1) return;
    if (body[0].type != 'ExpressionStatement') return;
    const obj = body[0].expression;
    if (obj.type != 'MemberExpression') return;
    if (obj.property.type != 'Identifier') return;
    return true;
  }

  function checkFunction(body) {
    if (body.length != 1) return;
    if (body[0].type != 'ExpressionStatement') return;
    const obj = body[0].expression;
    if (obj.type != 'ArrowFunctionExpression') return;
    return true;
  }

  function checkFunctionCall(body) {
    if (body.length != 1) return;
    if (body[0].type != 'ExpressionStatement') return;
    const obj = body[0].expression;
    if (obj.type != 'CallExpression') return;
    if (obj.callee?.type == 'Identifier') return obj.callee.name;
  }

  if (checkIdentificator(ast.body)) return 'identifier';
  if (checkMemberIdentificator(ast.body)) return 'identifier';
  if (checkFunction(ast.body)) return 'function';

  const fn = checkFunctionCall(ast.body);
  if (fn) return { type: 'function-call', name: fn };
}


export function checkRootName(name) {
  const rx = name.match(/^([\w\$_][\w\d\$_]*)/);
  if (!rx) return this.warning({ message: 'Error name: ' + name });
  const root = rx[1];

  if (this.script.rootVariables[root] || this.script.rootFunctions[root]) return true;
  this.warning({ message: 'No name: ' + name });
}


export function trimEmptyNodes(srcNodes) {
  const nodes = srcNodes.slice();
  while (nodes.length) {
    const n = nodes[0];
    if (n.type == 'text' && !n.value.trim()) nodes.shift();
    else break;
  }
  while (nodes.length) {
    const n = last(nodes);
    if (n.type == 'text' && !n.value.trim()) nodes.pop();
    else break;
  }
  return nodes;
}


export const genId = () => {
  let id = Math.floor(Date.now() * Math.random()).toString(36);
  if (id.length > 6) id = id.substring(id.length - 6);
  return 'm' + id;
};


export const extractKeywords = (exp) => {
  const ast = acorn.parse(exp, { sourceType: 'module', ecmaVersion: 12 });

  const keys = new Set();
  const rec = (n) => {
    let self;
    if (n.type) {
      self = n;
      if (n.type == 'Identifier' && (n._parent.type != 'MemberExpression' || n._parent.property !== n)) {
        const name = [n.name];
        let i = n._parent;
        while (i?.type == 'MemberExpression') {
          if (i.property.type == 'Identifier') name.push('.' + i.property.name);
          else if (i.property.type == 'Literal') name.push(`[${i.property.raw}]`);
          else throw new Error(`Wrong member type: ${i.property.type}`);
          i = i._parent;
        }
        keys.add(name.join(''));
      }
    }

    for (const k in n) {
      if (k == '_parent') continue;
      const v = n[k];
      if (typeof (v) != 'object') continue;
      if (Array.isArray(v)) {
        v.forEach((i) => {
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


export const replaceElementKeyword = (exp, fn) => {
  let changed = false;
  const r = parseJS(exp, (n, pk) => {
    if (n.type != 'Identifier') return;
    if (pk == 'property' || pk == 'params') return;
    if (n.name != '$element') return;
    n.name = fn();
    changed = true;
  });
  return changed ? r.build().trim() : exp;
};


export const parseJS = (exp, fn) => {
  const result = {};
  const ast = result.ast = acorn.parse(exp, { sourceType: 'module', ecmaVersion: 12 });

  const rec = (n, pk) => {
    let self;
    if (n.type) {
      self = n;
      fn?.(n, pk);
    }

    for (const k in n) {
      if (k == '_parent') continue;
      const v = n[k];
      if (v == null || typeof (v) != 'object') continue;
      if (Array.isArray(v)) {
        v.forEach((i) => {
          i._parent = self || n._parent;
          rec(i, k);
        });
      } else {
        v._parent = self || n._parent;
        rec(v, k);
      }
    }
  };
  rec(ast, null);

  result.build = (data) => {
    return astring.generate(data || ast);
  };
  return result;
};


export const htmlEntitiesToText = (text) => {
  const entities = [
    [/&amp;/g, '&'],
    [/&apos;/g, '\''],
    [/&#x27;/g, '\''],
    [/&#x2F;/g, '/'],
    [/&#39;/g, '\''],
    [/&#47;/g, '/'],
    [/&lt;/g, '<'],
    [/&gt;/g, '>'],
    [/&nbsp;/g, ' '],
    [/&quot;/g, '"']
  ];
  entities.forEach(([k, v]) => {
    text = text.replace(k, v);
  });
  return text;
};
