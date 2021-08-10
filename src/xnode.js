
import { last, assert } from './utils.js';


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
            node.getLast = () => last(node.children);
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
