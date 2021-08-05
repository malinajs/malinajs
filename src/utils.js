
import acorn from 'acorn';
import astring from 'astring';


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
    assert(name[name.length - 1] !== '-', 'Wrong name');
    return name.replace(/(\-\w)/g, function(part) {
        return part[1].toUpperCase();
    });
};

export function Q(s) {
    return s.replace(/`/g, '\\`').replace(/\\/g, '\\\\');
};

export function Q2(s) {
    return s.replace(/`/g, '\\`').replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
};

export function unwrapExp(e) {
    assert(e, 'Empty expression');
    let rx = e.match(/^\{(.*)\}$/);
    assert(rx, 'Wrong expression: ' + e);
    return rx[1];
};

export function isSimpleName(name) {
    if(!name) return false;
    if(!name.match(/^([a-zA-Z\$_][\w\d\$_\.]*)$/)) return false;
    if(name[name.length - 1] == '.') return false;
    return true;
}

export const isNumber = (value) => {
    if(typeof value == 'number') return true;
    if(!value) return false;
    if(typeof value != 'string') return false;
    return !isNaN(value);
}

export function detectExpressionType(name) {
    if(isSimpleName(name)) return 'identifier';

    let ast = acorn.parse(name, {allowReturnOutsideFunction: true});

    function checkIdentificator(body) {
        if(body.length != 1) return;
        if(body[0].type != 'ExpressionStatement') return;
        if(body[0].expression.type != 'Identifier') return;
        return true;
    }

    function checkMemberIdentificator(body) {
        if(body.length != 1) return;
        if(body[0].type != 'ExpressionStatement') return;
        let obj = body[0].expression;
        if(obj.type != 'MemberExpression') return;
        if(obj.property.type != 'Identifier') return;
        return true;
    }

    function checkFunction(body) {
        if(body.length != 1) return;
        if(body[0].type != 'ExpressionStatement') return;
        let obj = body[0].expression;
        if(obj.type != 'ArrowFunctionExpression') return;
        return true;
    }

    if(checkIdentificator(ast.body)) return 'identifier';
    if(checkMemberIdentificator(ast.body)) return 'identifier';
    if(checkFunction(ast.body)) return 'function';

    return;
};


export function checkRootName(name) {
    let rx = name.match(/^([\w\$_][\w\d\$_]*)/);
    if(!rx) return this.warning({message: 'Error name: ' + name});
    let root = rx[1];

    if(this.script.rootVariables[root] || this.script.rootFunctions[root]) return true;
    this.warning({message:'No name: ' + name});
};


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
    if(id.length > 6) id = id.substring(id.length - 6)
    return 'm' + id;
};


export const extractKeywords = (exp) => {
    let ast = acorn.parse(exp, {sourceType: 'module', ecmaVersion: 12});

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
            if(typeof(v) != 'object') continue;
            if(Array.isArray(v)) v.forEach(i => {
                i._parent = self || n._parent;
                rec(i);
            });
            else {
                v._parent = self || n._parent;
                rec(v);
            }
        }
    }
    rec(ast);

    return [...keys];
};


export const replaceElementKeyword = (exp, fn) => {
    let changed = false;
    let r = parseJS(exp, (n, pk) => {
        if(n.type != 'Identifier') return;
        if(pk == 'property' || pk == 'params') return;
        if(n.name != '$element') return;
        n.name = fn();
        changed = true;
    });
    return changed ? r.build().trim() : exp;
}


export const parseJS = (exp, fn) => {
    let result = {};
    let ast = result.ast = acorn.parse(exp, {sourceType: 'module', ecmaVersion: 12});

    const rec = (n, pk) => {
        let self;
        if(n.type) {
            self = n;
            fn?.(n, pk);
        }

        for(let k in n) {
            if(k == '_parent') continue;
            let v = n[k];
            if(v == null || typeof(v) != 'object') continue;
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
    }
    rec(ast, null);

    result.build = (data) => {
        return astring.generate(data || ast);
    }
    return result;
};


function I(value = 0) {
    this.$indent = value;
}

export function xWriter(ctx) {
    this._ctx = ctx;
    this.inuse = ctx.inuse;
    this.result = [];
    this.indent = 0;

    this.getIndent = function() {
        return new I(this.indent);
    };
    this.writeIndent = function() {this.write(this.getIndent())};
    this.goIndent = function(fn) {
        this.indent++;
        fn();
        this.indent--;
    };
    this.write = function(...args) {
        for(let i of args) {
            if(i === true) this.result.push(this.getIndent());
            else this.result.push(i);
        }
    };
    this.writeLine = function(s) {
        this.write(true, s + '\n');
    };
    this._compile = function() {
        let result = this.result.slice();
        let dyn, prevDyn = 0, index = 99;

        for(;index>0;index--) {
            dyn = 0;
            let parts = result.slice();
            result = [];
            parts.forEach(n => {
                if(n.node) {
                    dyn++;
                    let r = this.subBuild(n.node, n.indent);
                    if(r?.length) result.push(...r);
                } else result.push(n);
            });
            if(dyn == 0) break;
            if(dyn == prevDyn) throw 'Compile error: circular dependencies';
            prevDyn = dyn;
        }
        if(index <= 0) throw 'Compile error: circular dependencies';

        return result;
    };
    this.toString = function() {
        let result = this._compile();
        return result.map(i => {
            if(i instanceof I) {
                let r = '', l = i.$indent;
                while(l--) r += '  ';
                return r;
            }
            return i;
        }).join('');
    }
    this.build = function(node) {
        if(node == null) return;
        if(node.$deps?.length) {
            if(node.$deps.some(n => !n.$done)) {
                this.result.push({node, indent: this.indent});
                return;
            }
        }
        node.handler(this, node);
        node.$done = true;
    }
    this.subBuild = function(node, indent=0) {
        let w = new xWriter(this._ctx);
        w.indent = indent;
        w.build(node);
        let r = w._compile();
        return r.length ? r : null;
    }
    this.addBlock = function(b) {
        b && b.forEach(i => {
            if(i instanceof I) i.$indent += this.indent;
            this.result.push(i);
        })
    }
}

export function xNode(_type, _data, _handler) {
    /*
        xNode(type, data, handler)
        xNode(type, handler)
        xNode(data, handler)
        xNode(handler)
    */
    if(!(this instanceof xNode)) return new xNode(_type, _data, _handler);

    let type, data, handler;
    if(typeof _type == 'string') {
        type = _type;
        if(typeof _data == 'function') {
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

    this.type = type;
    this.handler = handler;
    return this;
}

xNode.init = {
    raw: (ctx, node) => {
        ctx.writeLine(node.value);
    },
    block: {
        init: (node) => {
            if(!node.body) node.body = [];
            node.push = function(child) {
                assert(arguments.length == 1, 'Wrong xNode');
                if(typeof child == 'string') child = xNode('raw', {value: child});
                this.body.push(child)
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
                } else ctx.build(n);
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
            if(!node.inline) ctx.writeIndent();

            if(node.arrow) {
                if(node.name) ctx.write(`let ${node.name} = `);
            } else {
                ctx.write('function');
                if(node.name) ctx.write(' ' + node.name);
            }
            ctx.write(`(${node.args.join(', ')}) `);
            if(node.arrow) ctx.write('=> ');
            ctx.write(`{\n`);
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
            node.push = function(n) {
                if(typeof n == 'string') {
                    let p = last(this.children);
                    if(p && p.type == 'node:text') {
                        p.value += n;
                        return p;
                    }
                    n = xNode('node:text', {value: n});
                }
                assert(n instanceof xNode);
                this.children.push(n);
                n._ctx = this._ctx;
                return n;
            }
        },
        handler: (ctx, node) => {
            if(node.inline) {
                node.children.forEach(n => ctx.build(n));
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
                    })
                }

                let className = {};
                node.class.forEach(sel => {
                    if(sel.$selector) sel = ctx._ctx.css.resolve(sel);
                    className[sel] = true;
                });
                className = Object.keys(className).join(' ');
                if(className) ctx.write(` class="${className}"`);

                if(node.children.length) {
                    ctx.write('>');
                    node.children.forEach(n => ctx.build(n));
                    ctx.write(`</${node.name}>`);
                } else {
                    if(node.voidTag) ctx.write(`/>`);
                    else ctx.write(`></${node.name}>`);
                }
            }
        },
        bindName: function() {
            if(!this._boundName) this._boundName = `el${this._ctx.uniqIndex++}`
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
            if(ctx._ctx.config.debug && ctx._ctx.config.debugLabel) ctx.write(`<!-- ${node.value} -->`);
            else ctx.write(`<!---->`);
        }
    },
    template: (ctx, node) => {
        let template = ctx._ctx.xBuild(node.body);
        let convert;
        if(node.svg) convert = '$runtime.svgToFragment';
        else if(!template.match(/[<>]/)) convert = '$runtime.createTextNode';
        else {
            convert = '$$htmlToFragment';
            template = template.replace(/<!---->/g, '<>');
        }
        if(node.raw) {
            ctx.write(ctx._ctx.Q(template));
        } else if(node.inline) {
            ctx.write(`${convert}(\`${ctx._ctx.Q(template)}\`)`);
        } else {
            assert(node.name);
            ctx.writeLine(`const ${node.name} = ${convert}(\`${ctx._ctx.Q(template)}\`);`);
        }
    }
};
