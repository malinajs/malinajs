
import { $watch, $watchReadOnly, $$deepComparator, cloneDeep, $$cloneDeep, $ChangeDetector, $digest,
    $$compareDeep, cd_onDestroy, addEvent } from './cd';
import { __app_onerror, safeCall } from './utils';

let templatecache = {};
let templatecacheSvg = {};

let $$uniqIndex = 1;

export const childNodes = 'childNodes';
export const firstChild = 'firstChild';

export let noop = a => a;

export const insertBefore = (el, node, before) => {
    el.parentNode.insertBefore(node, before);
}

export const createTextNode = (text) => {
    let f = document.createDocumentFragment();
    f.append(text);
    return f;
}

export const $$htmlToFragment = (html) => {
    if(templatecache[html]) return templatecache[html].cloneNode(true);

    let t = document.createElement('template');
    t.innerHTML = html;
    let result = t.content;
    templatecache[html] = result.cloneNode(true);
    return result;
};

export const $$htmlToFragmentClean = (html) => {
    if(templatecache[html]) return templatecache[html].cloneNode(true);

    let t = document.createElement('template');
    t.innerHTML = html;
    let result = t.content;

    let it = document.createNodeIterator(result, 128);
    let n;
    while(n = it.nextNode()) {
        if(!n.nodeValue) n.parentNode.replaceChild(document.createTextNode(''), n);
    };
    templatecache[html] = result.cloneNode(true);
    return result;
};

export function svgToFragment(content) {
    if(templatecacheSvg[content]) return templatecacheSvg[content].cloneNode(true);
    let t = document.createElement('template');
    t.innerHTML = '<svg>' + content + '</svg>';

    let result = document.createDocumentFragment();
    let svg = t.content[firstChild];
    while(svg[firstChild]) result.appendChild(svg[firstChild]);
    templatecacheSvg[content] = result.cloneNode(true);
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
        list.map(safeCall);
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

export let current_component, $context;

export const $onDestroy = fn => current_component._d.push(fn);
export const $onMount = fn => current_component._m.push(fn);


export const $bindComponent = (init, $element, $option) => {
    if(!$option.events) $option.events = {};
    let r = init($option);
    if ($option.afterElement) {
        insertBefore($element, r, $element.nextSibling);
    } else {
        $element.innerHTML = '';
        $element.appendChild(r);
    }
}


export const makeComponentBase = (init, owncd) => {
    return ($element, $option={}) => {
        let prev = current_component;
        $context = $option.context || {};
        let $component = current_component = {
            $option,
            destroy: () => $component._d.map(safeCall),
            context: $context,
            _d: [],
            _m: []
        };
        if(owncd) {
            $component.$cd = {
                _d: $component._d,
                watchers: [],
                new: () => $component.$cd
            }
        }

        try {
            $bindComponent(init, $element, $option);
            if(owncd) {
                let watchers = $component.$cd.watchers;
                while(watchers.length) {
                    let wl = watchers.slice();
                    watchers.length = 0;
                    wl.forEach(w => w.cb(w.fn()));
                }
            }
        } finally {
            current_component = prev;
            $context = null;
        }

        $component._d.push(...$component._m.map(safeCall));
        return $component;
    };
}


export const makeComponent = (init) => {
    return ($element, $option={}) => {
        if(!$option.props) $option.props = {};
        return makeComponentBase(() => {
            let $cd = new $ChangeDetector();
            $onDestroy(() => $cd.destroy());

            let id = `a${$$uniqIndex++}`;
            let process;
            let apply = r => {
                if (process) return r;
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

            current_component.$cd = $cd;
            current_component.apply = apply;
            current_component.push = apply;

            return apply(init($option, apply));
        })($element, $option);
    };
};


export const callComponent = (cd, context, component, el, option) => {
    option.afterElement = true;
    option.context = {...context};
    let $component = safeCall(() => component(el, option));
    if($component && $component.destroy) cd_onDestroy(cd, $component.destroy);
    return $component;
};

export const autoSubscribe = (component, obj) => {
    if(obj.subscribe) {
        let unsub = obj.subscribe(component.apply);
        if(typeof unsub == 'function') cd_onDestroy(component.$cd, unsub);
    }
}


export const addStyles = (id, content) => {
    if(document.head.querySelector('style#' + id)) return;
    let style = document.createElement('style');
    style.id = id;
    style.innerHTML = content;
    document.head.appendChild(style);
};


export const addClass = (el, className) => el.classList.add(className);


export const bindClass = (cd, element, fn, className) => {
    $watchReadOnly(cd, fn, value => {
        if(value) addClass(element, className);
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


export const bindStyle = (cd, element, name, fn) => {
    $watchReadOnly(cd, fn, (value) => {
        element.style[name] = value;
    });
};


export const bindAttributeBase = (element, name, value) => {
    if(value != null) element.setAttribute(name, value);
    else element.removeAttribute(name);
}


export const bindAttribute = (cd, element, name, fn) => {
    $watchReadOnly(cd, fn, value => bindAttributeBase(element, name, value));
};


export const bindAction = (cd, element, action, fn, subscribe) => {
    $tick(() => {
        let handler, value;
        if(fn) {
            value = fn();
            handler = action.apply(null, [element].concat(value));
        } else handler = action(element);
        if(handler?.destroy) cd_onDestroy(cd, handler.destroy);
        subscribe?.(cd, fn, handler, value);
    });
};


export const __bindActionSubscribe = (cd, fn, handler, value) => {
    if(handler?.update && fn) {
        $watch(cd, fn, args => {
            handler.update.apply(handler, args);
        }, {cmp: $$deepComparator(1), value: cloneDeep(value, 1) });
    }
}


export const bindInput = (cd, element, name, get, set) => {
    let w = $watchReadOnly(cd, name == 'checked' ? () => !!get() : get, value => {
        if(value != element[name]) element[name] = value;
    });
    addEvent(cd, element, 'input', () => {
        set(w.value = element[name]);
    });
};


export const makeClassResolver = ($option, classMap, metaClass, mainName) => {
    if(!$option.$class) $option.$class = {};
    if(!mainName && metaClass.main) mainName = 'main';
    return (line, defaults) => {
        let result = [];
        if(defaults) result.push(defaults);
        line.trim().split(/\s+/).forEach(name => {
            let meta;
            if(name[0] == '$') {
                name = name.substring(1);
                meta = true;
            }
            let h = metaClass[name] || meta;
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
        let c = p ? Object.create(p) : {};
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


export const recalcAttributes = (props, skip) => {
    let result = {};
    for(let k in props)
        if(!skip[k]) result[k] = props[k];
    return result;
};


export const completeProps = ($component, setter, getters) => {
    $component.push = () => {
        setter();
        $component.apply();
    }
    $component.exportedProps = getters;
};


export const bindPropToComponent = ($component, name, parentWatch, up) => {
    let getter = $component.exportedProps[name];
    if(!getter) return __app_onerror(`Component doesn't have prop ${name}`);

    let w = $watch($component.$cd, getter, value => {
        parentWatch.value = w.value;
        $component.$option.props[name] = value;
        up(value);
    }, { value: parentWatch.value, cmp: $$compareDeep });
    parentWatch.pair = value => w.value = value;
}


export const makeExternalProperty = ($component, name, getter, setter) => {
    Object.defineProperty($component, name, {
        get: getter,
        set: v => {setter(v); $component.apply();}
    });
}


export const attachSlotBase = ($option, $context, $cd, slotName, label, placeholder) => {
    let $slot = $option.slots && $option.slots[slotName];
    if($slot) {
        let s = $slot(label, $context);
        cd_onDestroy($cd, s.destroy);
        return s;
    } else placeholder && placeholder();
};


export const attachSlot = ($option, $context, $cd, slotName, label, props, placeholder) => {
    let slot = attachSlotBase($option, $context, $cd, slotName, label, placeholder);
    if(slot) {
        for(let key in props) {
            let setter = `set_${key}`;
            if(s[setter]) {
                let exp = props[key];
                if(typeof exp == 'function') $watch($cd, exp, s[setter], {ro: true, cmp: $$compareDeep});
                else s[setter](exp);
            }
        }
    }
};


export const eachDefaultKey = (item, index, array) => typeof array[0] === 'object' ? item : index;


export const attachAnchor = ($option, $cd, name, el) => {
    let fn = $option.anchor && $option.anchor[name];
    if(fn) cd_onDestroy($cd, fn(el));
}
