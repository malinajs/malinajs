
import { $watch, $watchReadOnly, $$deepComparator, $$cloneDeep, $ChangeDetector, $digest, $$compareDeep, cd_onDestroy } from './cd';
import { __app_onerror } from './utils';

let templatecache = {false: {}, true: {}, svg: {}};

let $$uniqIndex = 1;

export const $$childNodes = 'childNodes';
export const $$firstChild = 'firstChild';

export function $$htmlToFragment(html, lastNotTag) {
    lastNotTag = !!lastNotTag;
    if(templatecache[lastNotTag][html]) return templatecache[lastNotTag][html].cloneNode(true);

    let t = document.createElement('template');
    t.innerHTML = html;
    let result = t.content;
    if(lastNotTag && result.lastChild.nodeType == 8) result.appendChild(document.createTextNode(''));
    templatecache[lastNotTag][html] = result.cloneNode(true);
    return result;
};

export function $$htmlToFragmentClean(html, lastNotTag) {
    lastNotTag = !!lastNotTag;
    if(templatecache[lastNotTag][html]) return templatecache[lastNotTag][html].cloneNode(true);
    let result = $$htmlToFragment(html, lastNotTag);
    let it = document.createNodeIterator(result, 128);
    let n;
    while(n = it.nextNode()) {
        if(!n.nodeValue) n.parentNode.replaceChild(document.createTextNode(''), n);
    };
    templatecache[lastNotTag][html] = result.cloneNode(true);
    return result;
};

export function svgToFragment(content) {
    if(templatecache.svg[content]) return templatecache.svg[content].cloneNode(true);
    let t = document.createElement('template');
    t.innerHTML = '<svg>' + content + '</svg>';

    let result = document.createDocumentFragment();
    let svg = t.content.firstChild;
    while(svg.firstChild) result.appendChild(svg.firstChild);
    templatecache.svg[content] = result.cloneNode(true);
    return result;
};

export function $$removeElements(el, last) {
    let next;
    while(el) {
        next = el.nextSibling;
        el.remove();
        if(el == last) break;
        el = next;
    }
};

export function removeElementsBetween(el, stop) {
    let next;
    el = el.nextSibling;
    while(el) {
        next = el.nextSibling;
        if(el == stop) break;
        el.remove();
        el = next;
    }
};

export const getFinalLabel = n => {
    if(n.nextSibling) return n.nextSibling;
    let e = document.createTextNode('');
    n.parentNode.appendChild(e);
    return e;
};


let _tick_list = [];
let _tick_planned = {};
export function $tick(fn, uniq) {
    if(uniq) {
        if(_tick_planned[uniq]) return;
        _tick_planned[uniq] = true;
    }
    _tick_list.push(fn);
    if(_tick_planned.$tick) return;
    _tick_planned.$tick = true;
    setTimeout(() => {
        _tick_planned = {};
        let list = _tick_list;
        _tick_list = [];
        list.forEach(fn => {
            try {
                fn();
            } catch (e) {
                __app_onerror(e);
            }
        });
    }, 0);
};


export function $makeEmitter(option) {
    return (name, detail) => {
        let fn = option.events[name];
        if(!fn) return;
        let e = document.createEvent('CustomEvent');
        e.initCustomEvent(name, false, false, detail);
        fn(e);
    };
};

export function $$addEventForComponent(list, event, fn) {
    let prev = list[event];
    if(prev) {
        if(prev._list) prev._list.push(fn);
        else {
            function handler(e) {
                handler._list.forEach(fn => {
                    fn(e);
                })
            }
            handler._list = [prev, fn];
            list[event] = handler;
        }
    } else list[event] = fn;
};

export function $$makeSpreadObject($cd, el, css) {
    let prev = {};
    let index = 0;
    let list = [];
    let defaultUsed = {};

    const props = Object.getOwnPropertyDescriptors(el.__proto__);

    const render = $$groupCall(function() {
        let obj, name, value, used = Object.assign({}, defaultUsed);
        for(let i=index-1; i>=0; i--) {
            obj = list[i];
            for(name in obj) {
                if(used[name]) continue;
                used[name] = true;
                value = obj[name];
                if(prev[name] == value) continue;
                prev[name] = value;

                if(props[name] && props[name].set) {
                    el[name] = value;
                } else {
                    if(value == null) el.removeAttribute(name);
                    else {
                        if(name == 'class' && css) value += ' ' + css;
                        el.setAttribute(name, value);
                    }
                }
            }
        }
    });

    return {
        spread: function(fn) {
            let i = index++;
            $watch($cd, fn, value => {
                list[i] = value;
                render();
            }, {ro: true, cmp: $$deepComparator(1)});
        },
        prop: function(name, fn) {
            let i = index++;
            list[i] = {};
            $watch($cd, fn, value => {
                list[i][name] = value;
                render();
            }, {ro: true});
        },
        attr: function(name, value) {
            let d = {};
            d[name] = value;
            list[index++] = d;
        },
        except: function(list) {
            list.forEach(n => defaultUsed[n] = true);
        }
    }
};


export function $$makeProp($component, name, getter, setter) {
    let value = $component.$option.props[name];
    if(value !== void 0) setter(value);
    $component.exportedProps[name] = {getter, setter};

    Object.defineProperty($component, name, {
        get: getter,
        set: v => {setter(v); $component.apply();}
    });
}

export function $$groupCall(emit) {
    let id = `gc${$$uniqIndex++}`;
    const fn = function() {
        $tick(() => {
            fn.emit && fn.emit();
        }, id);
    };
    fn.emit = emit;
    return fn;
};

export const $$makeComponent = ($element, $option) => {
    if(!$option.events) $option.events = {};
    if(!$option.props) $option.props = {};
    let $cd = new $ChangeDetector();

    let id = `a${$$uniqIndex++}`;
    let process;
    let apply = r => {
        if(process) return r;
        $tick(() => {
            try {
                process = true;
                $digest($cd);
            } finally {
                process = false;
            }
        }, id);
        return r;
    };

    let $component = {
        $option,
        $cd,
        exportedProps: {},
        apply,
        push: apply,
        destroy: () => $component.$cd.destroy()
    };

    $component.$$render = (rootTemplate) => {
        if ($option.afterElement) {
            $element.parentNode.insertBefore(rootTemplate, $element.nextSibling);
        } else {
            $element.innerHTML = '';
            $element.appendChild(rootTemplate);
        }
    }

    return $component;
};


export const componentPropBinderError = (name) => {
    $runtime.__app_onerror(`Component doesn't have prop ${name}`);
}


export const componentPropBinder = ($component) => {
    return (name, up, initValue) => {
        let p = $component.exportedProps[name];
        if(p) {
            let w = $watch($component.$cd, p.getter, (value) => {
                up(w.value, value);
            }, {value: initValue, cmp: $$compareDeep});
            return (wvalue, value) => {
                w.value = wvalue;
                p.setter(value);
                $component.push();
            };
        } else componentPropBinderError(name);
    }
}


export const callComponent = (cd, component, el, option) => {
    option.afterElement = true;
    option.noMount = true;
    let $component = component(el, option);
    if($component) {
        if($component.destroy) cd_onDestroy(cd, $component.destroy);
        if($component.onMount) $tick($component.onMount);
    }
    return $component;
};

export const autoSubscribe = (cd, apply, obj) => {
    if(obj && 'value' in obj && obj.subscribe) {
        let unsub = obj.subscribe(apply);
        if(typeof unsub == 'function') cd_onDestroy(cd, unsub);
    }
}

export function $$componentCompleteProps($component) {
    if(Object.keys($component.exportedProps).length) {
        let $attributes = {};
        let $props = $component.$option.props;
        const recalc = () => {
            for(let k in $props) {
                if(!(k in $component.exportedProps)) $attributes[k] = $props[k];
            }
            for(let k in $attributes) {
                if(!(k in $props)) delete $attributes[k];
            }
        }
        $component.push = () => {
            recalc();
            $component.apply();
        };
        recalc();
        return $attributes;
    };
    return $component.$option.props;
};


export const addStyles = (id, content) => {
    if(document.head.querySelector('style#' + id)) return;
    let style = document.createElement('style');
    style.id = id;
    style.innerHTML = content;
    document.head.appendChild(style);
};


export const bindClass = (cd, element, fn, className) => {
    $watchReadOnly(cd, fn, value => {
        if(value) element.classList.add(className);
        else element.classList.remove(className);
    });
}


export const setClassToElement = (element, value) => {
    if(typeof element.className == 'string') element.className = value;
    else element.className.baseVal = value;
}


export const bindText = (cd, element, fn) => {
    $watchReadOnly(cd, fn, value => {
        element.textContent = value;
    });
};


export const makeClassResolver = ($option, classMap, metaClass, mainName) => {
    if(!$option.$class) $option.$class = {};
    if(!mainName && metaClass.main) mainName = 'main';
    return (line, defaults) => {
        let result = [];
        if(defaults) result.push(defaults);
        line.trim().split(/\s+/).forEach(name => {
            let h = metaClass[name];
            if(h) {
                let className = ($option.$class[name === mainName ? '$$main' : name] || '').trim();
                if(className) {
                    result.push(className);
                } else if(h !== true) {
                    result.push(name, h);
                }
            }
            let h2 = classMap[name];
            if(h2) {
                result.push(name, h2);
            } else if(!h) {
                result.push(name);
            }
        });
        return result.join(' ');
    }
};


export const makeTree = (n, lvl) => {
    let p = null;
    while(n--) {
        let c = Object.create(p);
        lvl.push(c);
        p = c;
    }
    let root = Object.create(p);
    lvl.unshift(root);
    return root;
};


export const spreadObject = (d, src) => {
    for(let k in src) d[k] = src[k];
    for(let k in d) {
        if(!(k in src)) delete d[k];
    }
};


export function noop() {};
