
import { assert } from './parser'


let uniqIndex = 0;
let buildBlock;

export function buildRuntime(data, runtimeOption) {
    let runtime = [`
        function $$apply() {
            if($$apply._p) return;
            if($$apply.planned) return;
            $$apply.planned = true;
            setTimeout(() => {
                $$apply.planned = false;
                $$apply.go();
            }, 1);
        };
        (function() {
            function $$htmlToFragment(html) {
                let t = document.createElement('template');
                t.innerHTML = html;
                return t.content;
            };
            function $$removeItem(array, item) {
                let i = array.indexOf(item);
                if(i>=0) array.splice(i, 1);
            };
            function $$getElement(el, a) {
                a.split(',').forEach(i => el = el.childNodes[i]);
                return el;
            }

            function $$CD() {
                this.children = [];
                this.watchers = [];
                this.destroyList = [];
                this.onceList = [];
            };
            Object.assign($$CD.prototype, {
                watch: function(fn, callback, mode) {
                    this.watchers.push({fn: fn, cb: callback, value: undefined, ro: mode == 'ro'});
                },
                wf: function(fn, callback) {
                    this.watch(fn, callback, 'ro');
                },
                wa: function(fn, callback) {
                    let w = {fn: fn, cb: callback, value: undefined, a: true};
                    this.watchers.push(w);
                    return w;
                },
                ev: function(el, event, callback) {
                    el.addEventListener(event, callback);
                    this.d(() => {
                        el.removeEventListener(event, callback);
                    });
                },
                d: function(fn) {
                    this.destroyList.push(fn);
                },
                destroy: function() {
                    this.watchers.length = 0;
                    this.destroyList.forEach(fn => {
                        try {
                            fn();
                        } catch (e) {
                            console.error(e);
                        }
                    });
                    this.destroyList.length = 0;
                    this.children.forEach(cd => {
                        cd.destroy();
                    });
                    this.children.length = 0;
                },
                once: function(fn) {
                    this.onceList.push(fn);
                }
            });

            let $cd = new $$CD();

            const arrayCompare = (a, b) => {
                let e0 = a == null || !a.length;
                let e1 = b == null || !b.length;
                if(e0 !== e1) return true;
                if(e0 === true) return false;
                if(a.length !== b.length) return true;
                for(let i=0;i<a.length;i++) {
                    if(a[i] !== b[i]) return true;
                }
                return false;
            };
            $$apply.go = () => {
                $$apply._p = true;
                try {
                    $digest($cd);
                } finally {
                    $$apply._p = false;
                }
            };
            
            function $digest($cd) {
                let loop = 10;
                let once = [];
                let w;
                while(loop >= 0) {
                    let changes = 0;
                    let index = 0;
                    let queue = [];
                    let i, value, cd = $cd;
                    while(cd) {
                        for(let i=0;i<cd.watchers.length;i++) {
                            w = cd.watchers[i];
                            value = w.fn();
                            if(w.a) {
                                if(arrayCompare(w.value, value)) {
                                    w.value = value.slice();
                                    if(!w.ro) changes++;
                                    w.cb(w.value);
                                }
                            } else {
                                if(w.value !== value) {
                                    w.value = value;
                                    if(!w.ro) changes++;
                                    w.cb(w.value);
                                }
                            }
                        };
                        if(cd.children.length) queue.push.apply(queue, cd.children);
                        if(cd.onceList.length) {
                            once.push.apply(once, cd.onceList);
                            cd.onceList.length = 0;
                        }
                        cd = queue[index++];
                    }
                    loop--;
                    if(!changes) break;
                }
                once.forEach(fn => {
                    try {
                        fn();
                    } catch (e) {
                        console.error(e);
                    }
                });
                if(loop < 0) console.error('Infinity changes: ', w);
            };
    `];

    buildBlock = function(data, option = {}) {
        let tpl = [];
        let lvl = [];
        let binds = [];
        let elements = {};

        function go(level, data) {
            let index = 0;
            const setLvl = () => {lvl[level] = index++;}
            const getElementName = () => {
                let el, l = lvl;
                if(option.top0) l = l.slice(1);
                if(l.length) el = `$$getElement($element, '${l.join(',')}')`;
                else el = '$element';
                
                let name = elements[el];
                if(!name) {
                    elements[el] = name = 'el' + (uniqIndex++);
                    binds.push(`var ${name} = ${el};`);
                }
                return name;
            };

            let lastText;
            data.body.forEach(n => {
                if(n.type === 'text') {
                    if(lastText !== tpl.length) setLvl();
                    if(n.value.indexOf('{') >= 0) {
                        tpl.push(' ');
                        let exp = parseText(n.value);
                        binds.push(`$cd.wf(() => ${exp}, (value) => {${getElementName()}.textContent=value;});`);
                    } else tpl.push(n.value);
                    lastText = tpl.length;
                } else if(n.type === 'script') {
                    return
                } else if(n.type === 'style') {
                    setLvl();
                    tpl.push(n.openTag);
                    tpl.push(n.content);
                    tpl.push('</style>');
                } else if(n.type === 'template') {
                    setLvl();
                    tpl.push(n.openTag);
                    tpl.push(n.content);
                    tpl.push('</template>');
                } else if(n.type === 'node') {
                    setLvl();
                    if(n.openTag.indexOf('{') || n.openTag.indexOf('use:')) {
                        let r = parseElement(n.openTag);
                        let el = ['<' + n.name];
                        r.forEach(p => {
                            let b = makeBind(p, getElementName);
                            if(b.prop) el.push(b.prop);
                            if(b.bind) binds.push(b.bind);
                        });
                        if(n.closedTag) el.push('/>');
                        else el.push('>');
                        tpl.push(el.join(' '));
                    } else tpl.push(n.openTag);
                    if(!n.closedTag) {
                        go(level + 1, n);
                        tpl.push(`</${n.name}>`);
                    }
                } else if(n.type === 'each') {
                    setLvl();
                    tpl.push(`<!-- ${n.value} -->`);
                    n.parent = data;
                    let eachBlock = makeEachBlock(n, getElementName());
                    binds.push(eachBlock.source);
                } else if(n.type === 'if') {
                    setLvl();
                    tpl.push(`<!-- ${n.value} -->`);
                    let ifBlock = makeifBlock(n, getElementName());
                    binds.push(ifBlock.source);
                } else if(n.type === 'comment') {
                    if(!runtimeOption.preserveComments) return;
                    setLvl();
                    tpl.push(n.content);
                }
            });

            lvl.length = level;
        };
        go(0, data);

        let source = [];

        let buildName = '$$build' + (uniqIndex++);
        tpl = Q(tpl.join(''));
        source.push(`
            function ${buildName}($cd, $element) {
        `);
        source.push(binds.join('\n'));
        source.push(`    };`);

        return {
            name: buildName,
            tpl: tpl,
            source: source.join('')
        }

    };

    let bb = buildBlock(data);
    runtime.push(bb.source);
    runtime.push(`
        $element.innerHTML = \`${Q(bb.tpl)}\`;
        ${bb.name}($cd, $element);
        $$apply();
    `);
    if(runtimeOption.$onMount) runtime.push(`$cd.once(onMount);`);

    runtime.push(`\n})();`);
    return runtime.join('');
}


function Q(s) {
    return s.replace(/`/g, '\\`');
};


function parseText(source, quotes) {
    let i = 0;
    let step = 0;
    let text = '';
    let exp = '';
    let result = [];
    let q;
    let len = source.length;
    if(quotes) {
        if(source[0] === '{') quotes = false;
        else {
            i++;
            len--;
            quotes = source[0];
            assert(quotes === source[len], source);
        }
    }
    while(i < len) {
        let a = source[i++];
        if(step == 1) {
            if(q) {
                if(a === q) q = null;
                exp += a;
                continue;
            }
            if(a === '"' || a === "'") {
                q = a;
                exp += a;
                continue;
            }
            if(a === '}') {
                step = 0;
                result.push('(' + exp + ')');
                exp = '';
                continue;
            }
            exp += a;
            continue;
        }
        if(a === '{') {
            if(text) {
                result.push('`' + Q(text) + '`');
                text = '';
            }
            step = 1;
            continue;
        }
        text += a;
    }
    if(text) result.push('`' + Q(text) + '`');
    assert(step == 0, 'Wrong expression: ' + source);
    return result.join('+');
};


function parseElement(source) {
    // TODO: parse '/>' at the end
    let len = source.length - 1;
    assert(source[0] === '<');
    assert(source[len] === '>');
    if(source[len - 1] == '/') len--;

    let index = 1;
    let start = 1;
    let eq;
    let result = [];
    let first = true;

    const next = () => {
        assert(index < source.length, 'EOF');
        return source[index++];
    }
    const flush = (shift) => {
        if(index <= start) return;
        if(first) {
            first = false;
            return;
        }
        let prop = {
            content: source.substring(start, index + shift)
        }
        if(eq) {
            prop.name = source.substring(start, eq - 1);
            prop.value = source.substring(eq, index + shift);
            eq = null;
        } else prop.name = prop.content;
        result.push(prop);
    };

    let bind = false;

    while(index < len) {
        let a = next();

        if(a === '"' || a === "'") {
            while(a != next());
            continue;
        }

        if(bind) {
            bind = a != '}';
            continue;
        }

        if(a == '{') {
            bind = true;
            continue;
        }

        if(a.match(/^\s$/)) {
            flush(-1);
            start = index;
            continue;
        }
        if(a == '=' && !eq) {
            eq = index;
        }
    }
    flush(0);
    return result;
};


function makeBind(prop, makeEl) {
    let parts = prop.name.split(':');
    let name = parts[0];
    
    function getExpression() {
        let exp = prop.value.match(/^\{(.*)\}$/)[1];
        assert(exp, prop.content);
        return exp;
    }

    if(name == 'on') {
        let el = makeEl();
        let exp = getExpression();
        let mod = '', opt = parts[1].split('|');
        let event = opt[0];
        opt.slice(1).forEach(opt => {
            if(opt == 'preventDefault') mod += `$event.preventDefault();`;
            else if(opt == 'enter') mod += `if($event.keyCode != 13) return; $event.preventDefault();`;
        });
        assert(event, prop.content);
        return {bind:`$cd.ev(${el}, "${event}", ($event) => { ${mod} $$apply(); let $element=${el}; ${Q(exp)}});`};
    } else if(name == 'bind') {
        let el = makeEl();
        let exp = getExpression();
        let attr = parts[1];
        assert(attr, prop.content);
        if(attr === 'value') {
            return {bind: `$cd.ev(${el}, 'input', () => { ${exp}=${el}.value; $$apply(); });
                    $cd.wf(() => (${exp}), (value) => { if(value != ${el}.value) ${el}.value = value; });`};
        } else if(attr == 'checked') {
            return {bind: `$cd.ev(${el}, 'input', () => { ${exp}=${el}.checked; $$apply(); });
                    $cd.wf(() => !!(${exp}), (value) => { if(value != ${el}.checked) ${el}.checked = value; });`};
        } else throw 'Not supported: ' + prop.content;
    } else if(name == 'class' && parts.length > 1) {
        let el = makeEl();
        let exp = getExpression();
        let className = parts[1];
        assert(className, prop.content);
        return {bind: `$cd.wf(() => !!(${exp}), (value) => { if(value) ${el}.classList.add("${className}"); else ${el}.classList.remove("${className}"); });`};
    } else if(name == 'use') {
        let el = makeEl();
        if(parts.length == 2) {
            let local = 'use' + (uniqIndex++);
            let args = prop.value?getExpression():'';
            let code = `var ${local} = ${parts[1]}(${el}${args?', '+args:''});\n if(${local}) {`;
            if(args) code += `
                if(${local}.update) {
                    let w = $cd.wa(() => [${args}], (args) => {${local}.update.apply(${local}, args);});
                    w.value = w.fn();
                }`;
            code += `if(${local}.destroy) $cd.d(${local}.destroy);}`;
            return {bind: code};
        }
        assert(parts.length == 1, prop.content);
        let exp = getExpression();
        return {bind: `$cd.once(() => { $$apply(); let $element=${el}; ${exp}; });`};
    } else {
        if(prop.value && prop.value.indexOf('{') >= 0) {
            let el = makeEl();
            let exp = parseText(prop.value, true);
            return {bind: `$cd.wf(() => (${exp}), (value) => { ${el}.setAttribute('${name}', value) });`};
        }
        return {
            prop: prop.content
        }
    }
};


function makeEachBlock(data, topElementName) {
    let source = [];

    let nodeItems = data.body.filter(n => n.type == 'node');
    if(!nodeItems.length) nodeItems = [data.body[0]];
    assert(nodeItems.length === 1, 'Only 1 node for #each');
    let itemData = buildBlock({body: nodeItems}, {top0: true});

    let rx = data.value.match(/^#each\s+(\S+)\s+as\s+(\w+)\s*$/);
    let arrayName = rx[1];
    let itemName = rx[2];

    let eachBlockName = 'eachBlock' + (uniqIndex++);
    source.push(`
        function ${eachBlockName} ($cd, top) {

            function bind($ctx, ${itemName}, $index) {
                ${itemData.source};
                ${itemData.name}($ctx.cd, $ctx.el);
                $ctx.reindex = function(i) { $index = i; };
            };

            let parentNode = top.parentNode;
            let srcNode = document.createElement("${data.parent.name}");
            srcNode.innerHTML=\`${Q(itemData.tpl)}\`;
            srcNode=srcNode.firstChild;

            let mapping = new Map();
            $cd.wa(() => (${arrayName}), (array) => {
                let prevNode = top;
                let newMapping = new Map();

                if(mapping.size) {
                    let arrayAsSet = new Set();
                    for(let i=0;i<array.length;i++) {
                        arrayAsSet.add(array[i]);
                    }
                    mapping.forEach((ctx, item) => {
                        if(arrayAsSet.has(item)) return;
                        ctx.el.remove();
                        ctx.cd.destroy();
                        $$removeItem($cd.children, ctx.cd);
                    });
                    arrayAsSet.clear();
                }

                let i, item, next_ctx, el, ctx;
                for(i=0;i<array.length;i++) {
                    item = array[i];
                    if(next_ctx) {
                        ctx = next_ctx;
                        next_ctx = null;
                    } else ctx = mapping.get(item);
                    if(ctx) {
                        el = ctx.el;

                        if(el.previousSibling != prevNode) {
                            let insert = true;

                            if(i + 1 < array.length && prevNode.nextSibling) {
                                next_ctx = mapping.get(array[i + 1]);
                                if(prevNode.nextSibling.nextSibling === next_ctx.el) {
                                    parentNode.replaceChild(el, prevNode.nextSibling);
                                    insert = false;
                                }
                            }

                            if(insert) {
                                parentNode.insertBefore(el, prevNode.nextSibling);
                            }
                        }
    
                        ctx.reindex(i);
                    } else {
                        el = srcNode.cloneNode(true);
                        let childCD = new $$CD(); $cd.children.push(childCD);
                        ctx = {el: el, cd: childCD};
                        bind(ctx, item, i);
                        parentNode.insertBefore(el, prevNode.nextSibling);
                    }
                    prevNode = el;
                    newMapping.set(item, ctx);

                };
                mapping.clear();
                mapping = newMapping;

            });

        }
        ${eachBlockName}($cd, ${topElementName});
    `);

    return {
        source: source.join('\n')
    }
};


function makeifBlock(data, topElementName) {
    let source = [];

    let r = data.value.match(/^#if (.*)$/);
    let exp = r[1];
    assert(exp, 'Wrong binding: ' + data.value);

    let ifBlockName = 'ifBlock' + (uniqIndex++);
    source.push(`function ${ifBlockName}($cd, $element) {`);
    let mainBlock, elseBlock;
    if(data.bodyMain) {
        mainBlock = buildBlock({body: data.bodyMain});
        elseBlock = buildBlock(data);
        source.push(`
            let elsefr = $$htmlToFragment(\`${Q(elseBlock.tpl)}\`);
            ${elseBlock.source}
        `);

    } else {
        mainBlock = buildBlock(data);
    }
    source.push(`
        let mainfr = $$htmlToFragment(\`${Q(mainBlock.tpl)}\`);
        ${mainBlock.source}
    `);

    source.push(`
        let childCD;
        let elements = [];

        function create(fr, builder) {
            childCD = new $$CD();
            $cd.children.push(childCD);
            let el = fr.cloneNode(true);
            for(let i=0;i<el.childNodes.length;i++) elements.push(el.childNodes[i]);
            builder(childCD, el);
            $element.parentNode.insertBefore(el, $element.nextSibling);
        };

        function destroy() {
            if(!childCD) return;
            $$removeItem($cd.children, childCD);
            childCD.destroy();
            childCD = null;
            for(let i=0;i<elements.length;i++) elements[i].remove();
            elements.length = 0;
        };

        $cd.wf(() => !!(${exp}), (value) => {
            if(value) {
                destroy();
                create(mainfr, ${mainBlock.name});
            } else {
                destroy();
                ` + (elseBlock?`if(elsefr) create(elsefr, ${elseBlock.name});`:'') + `
            }
        });
    `);
    source.push(`};\n ${ifBlockName}($cd, ${topElementName});`);
    
    return {
        source: source.join('\n')
    }
};