
import { Q } from './utils.js'
import { parseElement, parseText } from './parser.js'
import { makeComponent } from './parts/component.js'
import { bindProp } from './parts/prop.js'
import { makeifBlock } from './parts/if.js'
import { makeEachBlock } from './parts/each.js'


let uniqIndex = 0;


export function buildRuntime(data, config, script) {
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

    const ctx = {
        config,
        script,
        buildBlock,
        bindProp,
        makeEachBlock,
        makeifBlock,
        makeComponent
    };

    let bb = ctx.buildBlock(data);
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


function buildBlock(data, option = {}) {
    let tpl = [];
    let lvl = [];
    let binds = [];
    let targets = [];
    let targetMap = {};

    const go = (level, data) => {
        let index = 0;
        const setLvl = () => {lvl[level] = index++;}

        const getElementName = () => {
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
        const bindNode = (n) => {
            if(n.type === 'text') {
                if(lastText !== tpl.length) setLvl();
                if(n.value.indexOf('{') >= 0) {
                    tpl.push(' ');
                    let exp = parseText(n.value);
                    binds.push(`{
                        let $element=${getElementName()};
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
                if(n.name.match(/^[A-Z]/) && this.script.imports.indexOf(n.name) >= 0) {
                    // component
                    tpl.push(`<!-- ${n.name} -->`);
                    let b = this.makeComponent(n, getElementName);
                    binds.push(b.bind);
                    return;
                }
                if(n.openTag.indexOf('{') || n.openTag.indexOf('use:')) {
                    let r = parseElement(n.openTag);
                    let el = ['<' + n.name];
                    r.forEach(p => {
                        let b = this.bindProp(p, getElementName);
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
                let eachBlock = this.makeEachBlock(n, getElementName());
                binds.push(eachBlock.source);
            } else if(n.type === 'if') {
                setLvl();
                tpl.push(`<!-- ${n.value} -->`);
                let ifBlock = this.makeifBlock(n, getElementName());
                binds.push(ifBlock.source);
            } else if(n.type === 'comment') {
                if(!this.config.preserveComments) return;
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
