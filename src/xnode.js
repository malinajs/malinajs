
import { last, assert, htmlEntitiesToText } from './utils.js';


function I(value = 0) {
    this.$indent = value;
}


function xWriter(ctx, node) {
    this._ctx = ctx;
    this.inuse = ctx.inuse;

    this.indent = 0;
    this.write = function(...args) {
        for(let i of args) {
            if(i === true) node.$result.push(new I(this.indent));
            else node.$result.push(i);
        }
    }
    this.writeLine = function(s) {this.write(true, s);};
    this.writeIndent = function() {this.write(true)};
    this.goIndent = fn => {
        this.indent++;
        fn();
        this.indent--;
    }

    this.add = this.build = function(n) {
        if(n === null) return;
        assert(n instanceof xNode);
        assert(!n.$inserted, 'already inserted');
        node.$result.push({node: n, indent: this.indent});
        n.$inserted = true;
    }

    this.isEmpty = function(n) {
        if(n == null) return true;
        assert(n.$done, 'Node is not built');
        return !n.$result.some(r => {
            if(typeof(r) == 'string') return true;
            else if(r.node instanceof xNode) return !this.isEmpty(r.node);
            else if(r instanceof I) return true;
            else {
                console.error('Type', r);
                throw 'error type';
            }
        });
    }
};


export function xBuild(ctx, node) {
    let pending = 0;
    const resolve = n => {
        n.$compile?.forEach(c => {
            c != null && resolve(c);
        });
        if(!n.$done) {
            let ready = true;
            if(n.$deps?.length) {
                if(n.$deps.some(i => i != null && !i.$done)) {
                    pending++;
                    ready = false;
                }
            }
            if(ready) {
                let w = new xWriter(ctx, n);
                n.$handler(w, n);
                n.$done = true;
            }
        }

        if(n.$done) {
            n.$result.forEach(r => {
                if(r?.node instanceof xNode) resolve(r.node);
            });
        } else pending++;
    }
    let depth;
    for(depth=10;depth > 0;depth--) {
        pending = 0;
        resolve(node);
        if(!pending) break;
    }
    if(!depth) throw new Error('xNode: Circular dependency');

    let result = [];

    const asm = (n, baseIndent) => {
        if(!n.$done) {
            console.log('not resolved', n);
            throw 'node is not resolved';
        }
        n.$result.forEach(r => {
            if(typeof(r) == 'string') result.push(r);
            else if(r.node instanceof xNode) {
                asm(r.node, r.indent + baseIndent);
            }
            else if(r instanceof I) {
                r.$indent += baseIndent;
                result.push(r);
            } else {
                console.error('Type', r);
                throw 'error type';
            }
        })
    }
    asm(node, 0);

    for(let i = 0; i < result.length; i++) {
        let r = result[i];
        let next = result[i+1];

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
    */
    if(!(this instanceof xNode)) return new xNode(_type, _data, _handler);

    let type, data, handler;
    if(typeof _type == 'string') {
        type = _type;
        if(_data === false && !_handler) {
            handler = noop;
            data = null;
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
    this.$depends = function(n) {
        assert(!this.$done, 'Attempt to add dependecy, but node is already resolved');
        if(!this.$deps) this.$deps = [];
        this.$deps.push(n);
    }
    this.$value = function(value) {
        assert(!this.$done, 'Attempt to set active, depends node is already resolved');
        this.value = value === undefined ? true : value;
    }
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
            if(!node.inline) ctx.write(true);

            if(node.arrow) {
                if(node.name) ctx.write(`let ${node.name} = `);
            } else {
                ctx.write('function');
                if(node.name) ctx.write(' ' + node.name);
            }
            ctx.write(`(${node.args.join(', ')}) `);
            if(node.arrow) ctx.write('=> ');
            ctx.write(`{`, true);
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
        let convert, cloneNode = node.cloneNode;
        if(node.svg) {
            convert = '$runtime.svgToFragment';
            cloneNode = false;
        } else if(!template.match(/[<>]/) && !node.requireFragment) {
            convert = '$runtime.createTextNode';
            cloneNode = false;
            if(!node.raw) template = htmlEntitiesToText(template);
        } else {
            convert = '$$htmlToFragment';
            template = template.replace(/<!---->/g, '<>');
        }
        if(node.raw) {
            ctx.write(ctx._ctx.Q(template));
        } else if(node.inline) {
            ctx.write(`${convert}(\`${ctx._ctx.Q(template)}\``);
            if(cloneNode || node.requireFragment) {
                let opt = (cloneNode ? 1 : 0) + (node.requireFragment ? 2 : 0);
                ctx.write(`, ${opt})`);
            } else ctx.write(')');
        } else {
            assert(node.name);
            ctx.write(true, `const ${node.name} = ${convert}(\`${ctx._ctx.Q(template)}\``);
            if(cloneNode || node.requireFragment) {
                let opt = (cloneNode ? 1 : 0) + (node.requireFragment ? 2 : 0);
                ctx.write(`, ${opt});`);
            } else ctx.write(');');
        }
    }
};
