
module.exports = {
    buildRuntime
};

const {assert} = require('./parser');
const { get } = require('https');


function buildRuntime(data) {
    let runtime = [`
        function $$apply() {
            if($$apply.planned) return;
            $$apply.planned = true;
            setTimeout(() => {
                $$apply.planned = false;
                $$apply.go();
            }, 1);
        };
        (function() {
            function $$CD() {
                let cd = {children: [],watchers: []};
                cd.wf = function(fn, callback, mode) {
                    cd.watchers.push({fn: fn, cb: callback, value: undefined, ro: mode == 'ro'});
                };
                cd.wa = function(fn, callback) {
                    cd.watchers.push({fn: fn, cb: callback, value: undefined, a: true})
                };
                return cd;
            };

            let $cd = $$CD();

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
                let loop = 10;
                while(loop >= 0) {
                    let changes = 0;
                    let cd;
                    for(let cdIndex=-1;cdIndex<$cd.children.length;cdIndex++) {
                        if(cdIndex == -1) cd = $cd;
                        else cd = $cd.children[cdIndex];
                        cd.watchers.forEach((w) => {
                            let value = w.fn();
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
                        });
                    }
                    loop--;
                    if(!changes) break;
                }
            };

    `];

    let uniqIndex = 0;

    function build(data) {
        let tpl = [];
        let lvl = [];
        let binds = [];
        let each_block = [];
        let elements = {};

        function go(level, data) {
            let index = 0;
            const setLvl = () => {lvl[level] = index++;}
            const getElementName = () => {
                let el = '$element';
                lvl.forEach(n => el += `.childNodes[${n}]`);
                let name = elements[el];
                if(!name) {
                    elements[el] = name = 'el' + (uniqIndex++);
                    binds.push(`var ${name} = ${el};`);
                }
                return name;
            };

            data.body.forEach(n => {
                if(n.type === 'text') {
                    setLvl();
                    if(n.value.indexOf('{') >= 0) {
                        tpl.push(' ');
                        let exp = parseText(n.value);
                        binds.push(`$cd.wf(() => ${exp}, (value) => {${getElementName()}.textContent=value;}, 'ro');`);
                    } else tpl.push(n.value);
                } else if(n.type === 'script') {
                    return
                } else if(n.type === 'node') {
                    setLvl();
                    if(n.openTag.indexOf('{') >= 0) {
                        let r = parseElement(n.openTag);
                        let el = ['<' + n.name];
                        r.forEach(p => {
                            if(!p.value || p.value[0] != '{') {
                                el.push(p.content);
                            } else {
                                binds.push(makeBind(p, getElementName()));
                            }
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
                    each_block.push({
                        prevNode: lvl.slice(),
                        data: n
                    });
                } else if(n.type === 'if') {
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

    let bb = build(data);
    runtime.push(bb.source);
    runtime.push(`
        $element.innerHTML = \`${bb.tpl}\`;
        ${bb.name}($cd, $element);
    `);

    runtime.push(`\n})();`);
    return runtime.join('');
}


function Q(s) {
    return s.replace(/`/g, '\\`');
};


function parseText (source) {
    let i = 0;
    let step = 0;
    let text = '';
    let exp = '';
    let result = [];
    let q;
    while(i < source.length) {
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
                result.push(exp);
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
    const flush = () => {
        if(index <= start) return;
        if(first) {
            first = false;
            return;
        }
        let prop = {
            content: source.substring(start, index - 1)
        }
        if(eq) {
            prop.name = source.substring(start, eq - 1);
            prop.value = source.substring(eq, index -1);
            eq = null;
        }
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

        if(a == ' ') {
            flush();
            start = index;
            continue;
        }
        if(a == '=' && !eq) {
            eq = index;
        }
    }
    flush();
    return result;
};


function makeBind(prop, el) {
    let d = prop.name.split(':');
    let name = d[0];
    
    let exp = prop.value.match(/^\{(.*)\}$/)[1];
    assert(exp, prop.content);

    if(name == 'on') {
        let event = d[1];
        assert(event, prop.content);
        return el + `.addEventListener("${event}", ($event) => {${Q(exp)}});`;
    } else if(name == 'bind') {
        let attr = d[1];
        assert(attr, prop.content);
        if(attr === 'value') {
            return `${el}.addEventListener('input', () => { ${exp}=${el}.value; $$apply(); })
                    $cd.wf(() => (${exp}), (value) => { if(value != ${el}.value) ${el}.value = value; }, 'ro');`;
        } else throw 'Not supported: ' + prop.content;
    } else throw 'Wrong binding: ' + prop.content;
};