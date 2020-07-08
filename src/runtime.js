
import { assert } from './parser'


let uniqIndex = 0;
let buildBlock;

export function buildRuntime(data, runtimeOption, script) {
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
        return (function() {
            function $$htmlToFragment(html) {
                let t = document.createElement('template');
                t.innerHTML = html;
                return t.content;
            };
            function $$removeItem(array, item) {
                let i = array.indexOf(item);
                if(i>=0) array.splice(i, 1);
            };
            const $$childNodes = 'childNodes';

            function $watch(cd, fn, callback, w) {
                if(!w) w = {};
                w.fn = fn;
                w.cb = callback;
                w.value = void 0;
                cd.watchers.push(w);
            }

            function $$CD() {
                this.children = [];
                this.watchers = [];
                this.destroyList = [];
                this.onceList = [];
            };
            Object.assign($$CD.prototype, {
                wf: function(fn, callback) {
                    $watch(this, fn, callback, {ro: true});
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

            let $component = {};
            $component.destroy = () => {
                $cd.destroy();
            };

            const compareArray = (a, b) => {
                let a0 = Array.isArray(a);
                let a1 = Array.isArray(b);
                if(a0 !== a1) return true;
                if(!a0) return a !== b;
                if(a.length !== b.length) return true;
                for(let i=0;i<a.length;i++) {
                    if(a[i] !== b[i]) return true;
                }
                return false;
            };

            const compareDeep = (a, b, lvl) => {
                if(lvl < 0) return false;
                if(!a || !b) return a !== b;
                let o0 = typeof(a) == 'object';
                let o1 = typeof(b) == 'object';
                if(!(o0 && o1)) return a !== b;

                let a0 = Array.isArray(a);
                let a1 = Array.isArray(b);
                if(a0 !== a1) return true;

                if(a0) {
                    if(a.length !== b.length) return false;
                    for(let i=0;i<a.length;i++) {
                        if(compareDeep(a[i], b[i], lvl-1)) return true;
                    }
                } else {
                    let set = {};
                    for(let k in a) {
                        if(compareDeep(a[k], b[k])) return true;
                        set[k] = true;
                    }
                    for(let k in b) {
                        if(set[k]) continue;
                        return true;
                    }
                }

                return false;
            };

            function cloneDeep(d, lvl) {
                if(lvl < 0) return;
                if(!d) return d;

                if(typeof(d) == 'object') {
                    if(d instanceof Date) return d;
                    if(Array.isArray(d)) return d.map(i => cloneDeep(t, lvl-1));
                    let r = {};
                    for(let k in d) r[k] = cloneDeep(d[k], lvl-1);
                    return r;
                }
                return d;
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
                            if(w.value !== value) {
                                if(w.a) {
                                    if(compareArray(w.value, value)) {
                                        if(Array.isArray(value)) w.value = value.slice();
                                        else w.value = value;
                                        if(!w.ro) changes++;
                                        w.cb(w.value);
                                    }
                                } else if(w.d) {
                                    if(compareDeep(w.value, value, 10)) {
                                        w.value = cloneDeep(value, 10);
                                        if(!w.ro) changes++;
                                        w.cb(w.value);
                                    }
                                } else {
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
                $$apply._p = false;
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
        let targets = [];
        let targetMap = {};

        function go(level, data) {
            let index = 0;
            const setLvl = () => {lvl[level] = index++;}

            const getElementNameRaw = () => {
                let l = lvl;
                if(option.top0) l = l.slice(1);
                let name = '$parentElement';
                l.forEach(n => {
                    name += `[$$childNodes][${n}]`;
                });

                let tname = targetMap[name];
                if(!tname) {
                    tname = `el${uniqIndex++}`;
                    targets.push(`let ${tname} = ${name};`);
                    targetMap[name] = tname;
                }
                return tname;
            };

            let body = data.body.filter(n => n.type != 'script');
            let lastText;
            function bindNode(n) {
                if(n.type === 'text') {
                    if(lastText !== tpl.length) setLvl();
                    if(n.value.indexOf('{') >= 0) {
                        tpl.push(' ');
                        let exp = parseText(n.value);
                        binds.push(`{
                            let $element=${getElementNameRaw()};
                            $cd.wf(() => ${exp}, (value) => {$element.textContent=value;});}`);
                    } else tpl.push(n.value);
                    lastText = tpl.length;
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
                    if(n.name.match(/^[A-Z]/) && script.imports.indexOf(n.name) >= 0) {
                        // component
                        tpl.push(`<!-- ${n.name} -->`);
                        let b = makeComponent(n, getElementNameRaw);
                        binds.push(b.bind);
                        return;
                    }
                    if(n.openTag.indexOf('{') || n.openTag.indexOf('use:')) {
                        let r = parseElement(n.openTag);
                        let el = ['<' + n.name];
                        r.forEach(p => {
                            let b = makeBind(p, getElementNameRaw);
                            if(b.prop) el.push(b.prop);
                            if(b.bind) binds.push(b.bind);
                        });
                        el = el.join(' ');
                        el += n.closedTag?'/>':'>';
                        tpl.push(el);
                    } else tpl.push(n.openTag);
                    if(!n.closedTag) {
                        go(level + 1, n);
                        tpl.push(`</${n.name}>`);
                    }
                } else if(n.type === 'each') {
                    setLvl();
                    tpl.push(`<!-- ${n.value} -->`);
                    n.parent = data;
                    let eachBlock = makeEachBlock(n, getElementNameRaw());
                    binds.push(eachBlock.source);
                } else if(n.type === 'if') {
                    setLvl();
                    tpl.push(`<!-- ${n.value} -->`);
                    let ifBlock = makeifBlock(n, getElementNameRaw());
                    binds.push(ifBlock.source);
                } else if(n.type === 'comment') {
                    if(!runtimeOption.preserveComments) return;
                    setLvl();
                    tpl.push(n.content);
                }
            }
            body.forEach(n => {
                try {
                    bindNode(n);
                } catch (e) {
                    if(typeof e === 'string') e = new Error(e);
                    if(!e.details) {
                        console.log('Node: ', n);
                        if(n.type == 'text') e.details = n.value.trim();
                        else if(n.type == 'node') e.details = n.openTag.trim();
                        else if(n.type == 'each') e.details = n.value.trim();
                        else if(n.type == 'if') e.details = n.value.trim();
                    }
                    throw e;
                }
            });

            lvl.length = level;
        };
        go(0, data);

        let source = [];

        let buildName = '$$build' + (uniqIndex++);
        tpl = Q(tpl.join(''));
        source.push(`function ${buildName}($cd, $parentElement) {\n`);
        source.push(targets.join('\n'));
        source.push(binds.join('\n'));
        source.push(`};`);

        return {
            name: buildName,
            tpl: tpl,
            source: source.join('')
        }

    };

    let bb = buildBlock(data);
    runtime.push(bb.source);
    runtime.push(`
        const rootTemplate = \`${Q(bb.tpl)}\`;
        if($option.afterElement) {
            let tag = $element;
            $element = $$htmlToFragment(rootTemplate);
            ${bb.name}($cd, $element);
            tag.parentNode.insertBefore($element, tag.nextSibling);
        } else {
            $element.innerHTML = rootTemplate;
            ${bb.name}($cd, $element);
        }
    `);
    if(script.onMount) runtime.push(`$cd.once(onMount);`);
    if(script.onDestroy) runtime.push(`$cd.d(onDestroy);`);
    if(script.watchers.length) {
        runtime.push('$cd.once(() => {\n' + script.watchers.join('\n') + '\n$$apply();\n});');
    }
    if(script.props.length) {
        script.props.forEach(prop => {
            let valueName = prop=='value'?'_value':'value';
            runtime.push(`
                $component.setProp_${prop} = (${valueName}) => {
                    if(${prop} == ${valueName}) return;
                    ${prop} = ${valueName};
                    $$apply();
                };
            `)
        });
    };

    runtime.push(`
            $$apply();
            return $component;
        })();`);
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
                exp = exp.trim();
                if(!exp) throw 'Wrong expression';
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
        let exp = getExpression();
        let mod = '', opt = parts[1].split('|');
        let event = opt[0];
        opt.slice(1).forEach(opt => {
            if(opt == 'preventDefault') mod += `$event.preventDefault();`;
            else if(opt == 'enter') mod += `if($event.keyCode != 13) return; $event.preventDefault();`;
            else if(opt == 'escape') mod += `if($event.keyCode != 27) return; $event.preventDefault();`;
            else throw 'Wrong modificator: ' + opt;
        });
        assert(event, prop.content);
        return {bind:`{
            let $element=${makeEl()};
            $cd.ev($element, "${event}", ($event) => { ${mod} $$apply(); ${Q(exp)}});
            }`};
    } else if(name == 'bind') {
        let exp = getExpression();
        let attr = parts[1];
        assert(attr, prop.content);
        if(attr === 'value') {
            return {bind: `{
                    let $element=${makeEl()};
                    $cd.ev($element, 'input', () => { ${exp}=$element.value; $$apply(); });
                    $cd.wf(() => (${exp}), (value) => { if(value != $element.value) $element.value = value; });
                }`};
        } else if(attr == 'checked') {
            return {bind: `{
                    let $element=${makeEl()};
                    $cd.ev($element, 'input', () => { ${exp}=$element.checked; $$apply(); });
                    $cd.wf(() => !!(${exp}), (value) => { if(value != $element.checked) $element.checked = value; });
                }`};
        } else throw 'Not supported: ' + prop.content;
    } else if(name == 'class' && parts.length > 1) {
        let exp = getExpression();
        let className = parts[1];
        assert(className, prop.content);
        return {bind: `{
                let $element = ${makeEl()};
                $cd.wf(() => !!(${exp}), (value) => { if(value) $element.classList.add("${className}"); else $element.classList.remove("${className}"); });
            }`};
    } else if(name == 'use') {
        if(parts.length == 2) {
            let args = prop.value?getExpression():'';
            let code = `{let useObject = ${parts[1]}(${makeEl()}${args?', '+args:''});\n if(useObject) {`;
            if(args) code += `
                if(useObject.update) {
                    let w = $cd.wa(() => [${args}], (args) => {useObject.update.apply(useObject, args);});
                    w.value = w.fn();
                }`;
            code += `if(useObject.destroy) $cd.d(useObject.destroy);}}`;
            return {bind: code};
        }
        assert(parts.length == 1, prop.content);
        let exp = getExpression();
        return {bind: `{
            let $element=${makeEl()};
            $cd.once(() => { $$apply(); ${exp}; });}`};
    } else {
        if(prop.value && prop.value.indexOf('{') >= 0) {
            let exp = parseText(prop.value, true);
            if(['hidden','checked','value','disabled','selected'].indexOf(name) >= 0) {
                return {bind: `{
                    let $element=${makeEl()};
                    $cd.wf(() => (${exp}), (value) => {$element.${name} = value;});
                }`};
            } else {
                return {bind: `{
                    let $element=${makeEl()};
                    $cd.wf(() => (${exp}), (value) => {
                        if(value) $element.setAttribute('${name}', value);
                        else $element.removeAttribute('${name}');
                    });
                }`};
            }
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
    assert(rx, 'Wrong #each expression');
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
                if(!array || !Array.isArray(array)) array = [];
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
    source.push(`function ${ifBlockName}($cd, $parentElement) {`);
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
            $parentElement.parentNode.insertBefore(el, $parentElement.nextSibling);
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

function makeComponent(node, makeEl) {
    let props = parseElement(node.openTag);
    let binds = [];
    props.forEach(prop => {
        if(prop.value.indexOf('{') >= 0) {
            let exp = parseText(prop.value, true);
            binds.push(`
                if($component.setProp_${prop.name}) {
                    $watch($cd, () => (${exp}), $component.setProp_${prop.name}, {d: true, ro: true});
                } else console.error("Component ${node.name} doesn't have prop ${prop.name}");
            `);
        } else {
            // bind as text
        }
    });

    return {bind:`{
        let $component = ${node.name}(${makeEl()}, {afterElement: true});
        if($component) {
            if($component.destroy) $cd.d($component.destroy);
            ${binds.join('\n')};
        }
    }`};
};
