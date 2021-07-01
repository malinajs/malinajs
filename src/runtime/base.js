
import { $watch, $watchReadOnly, $$deepComparator, cloneDeep, $$cloneDeep, $ChangeDetector, $digest,
    $$compareDeep, cd_onDestroy, addEvent, fire, keyComparator } from './cd';
import { __app_onerror, safeCall, isFunction } from './utils';

let templatecache = {};
let templatecacheSvg = {};

let $$uniqIndex = 1;

export const childNodes = 'childNodes';
export const firstChild = 'firstChild';

export let noop = a => a;

export const insertAfter = (label, node) => {
    label.parentNode.insertBefore(node, label.nextSibling);
}

export const createTextNode = (text) => {
    let f = document.createDocumentFragment();
    f.append(text);
    return f;
}

export const $$htmlToFragment = (html) => {
    if(templatecache[html]) return templatecache[html].cloneNode(true);

    let t = document.createElement('template');
    t.innerHTML = html.replace(/<>/g, '<!---->');
    let result = t.content;
    templatecache[html] = result.cloneNode(true);
    return result;
};

export const $$htmlToFragmentClean = (html) => {
    if(templatecache[html]) return templatecache[html].cloneNode(true);

    let t = document.createElement('template');
    t.innerHTML = html.replace(/<>/g, '<!---->');
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


export let current_component, $context;

export const $onDestroy = fn => current_component._d.push(fn);
export const $onMount = fn => current_component._m.push(fn);


export const $insertElementByOption = ($label, $option, $element) => {
    if ($option.afterElement) {
        insertAfter($label, $element);
    } else {
        $label.innerHTML = '';
        $label.appendChild($element);
    }
};


export const $readOnlyBase = {
    a: ($component) => {
        $component.$cd = {
            _d: $component._d,
            watchers: [],
            prefix: [],
            new: () => $component.$cd,
            destroy: noop,
            $$: $component
        };
    },
    b: ($component) => {
        let watchers = $component.$cd.watchers;
        let prefix = $component.$cd.prefix;
        while(watchers.length || prefix.length) {
            let wl = watchers.slice();
            watchers.length = 0;
            prefix.forEach(safeCall);
            prefix.length = 0;
            wl.forEach(w => w.cb(w.fn()));
        }
    }
};


export const $base = {
    a: ($component) => {
        let $cd = new $ChangeDetector();
        $cd.$$ = $component;
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

        $component.$cd = $cd;
        $component.apply = apply;
        $component.push = apply;
    },
    b: ($component) => {
        $component.apply();
    }
};


export const makeComponent = (init, $base) => {
    return ($element, $option={}) => {
        let prev = current_component;
        $context = $option.context || {};
        let $component = current_component = {
            $option,
            destroy: () => $component._d.map(safeCall),
            context: $context,
            exported: {},
            _d: [],
            _m: []
        };
        $base.a($component);

        try {
            $insertElementByOption($element, $option, init($option, $component.apply));
            $base.b($component);
        } finally {
            current_component = prev;
            $context = null;
        }

        $component._d.push(...$component._m.map(safeCall));
        return $component;
    };
};


export const callComponent = (cd, context, component, label, option, propFn, cmp, setter, classFn) => {
    option.afterElement = true;
    option.context = {...context};
    let $component, parentWatch, childWatch;

    if(propFn) {
        if(cmp) {
            parentWatch = $watch(cd, propFn, value => {
                option.props = value;
                if($component) {
                    $component.push?.();
                    childWatch && (childWatch.idle = true);
                    $component.apply?.();
                }
            }, {ro: true, value: {}, cmp});
            fire(parentWatch);
        } else option.props = propFn();
    }

    if(classFn) {
        fire($watch(cd, classFn, value => {
            option.$class = value;
            $component?.apply?.();
        }, {ro: true, value: {}, cmp: keyComparator}));
    }

    $component = safeCall(() => component(label, option));
    if($component) {
      cd_onDestroy(cd, $component.destroy);

      if(setter && $component.exportedProps) {
        childWatch = $watch($component.$cd, $component.exportedProps, value => {
          setter(value);
          cd.$$.apply();
        }, {ro: true, idle: true, value: parentWatch.value, cmp})
      }
    }
    return $component;
};


export const autoSubscribe = (...list) => {
    list.forEach(i => {
        if(i.subscribe) {
            let unsub = i.subscribe(current_component.apply);
            if(isFunction(unsub)) cd_onDestroy(current_component, unsub);
        }
    })
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
    $watchReadOnly(cd, () => '' + fn(), value => {
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
    $watchReadOnly(cd, () => '' + fn(), value => bindAttributeBase(element, name, value));
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
        element[name] = value == null ? '' : value;
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


export const makeExternalProperty = ($component, name, getter, setter) => {
    Object.defineProperty($component, name, {
        get: getter,
        set: v => {setter(v); $component.apply();}
    });
}


export const attachSlotBase = ($context, $cd, slotName, label, props, placeholder) => {
    let $slot = $cd.$$.$option.slots?.[slotName];
    if($slot) $slot($cd, label, $context, props);
    else placeholder?.();
};


export const attachSlot = ($context, $cd, slotName, label, props, placeholder, cmp) => {
    let $slot = $cd.$$.$option.slots?.[slotName];
    if($slot) {
        let resultProps = {}, push;
        if(props) {
            let setter = (k) => {
                return v => {
                    resultProps[k] = v;
                    push?.();
                }
            }
            for(let k in props) {
                let v = props[k];
                if(isFunction(v)) {
                    fire($watch($cd, v, setter(k), {ro: true, cmp}));
                } else resultProps[k] = v;
            }
        }
        push = $slot($cd, label, $context, resultProps);
    } else placeholder?.();
};


export const makeSlot = (parentCD, fn) => {
    return (callerCD, label, $context, props) => {
        let $cd = parentCD.new();
        cd_onDestroy(callerCD, () => $cd.destroy());
        let r = fn($cd, $context, callerCD, props || {});
        insertAfter(label, r.el || r);
        $cd.$$.apply?.();
        return r.push;
    };
}


export const makeSlotStatic = (fn) => {
    return (callerCD, label) => {
        insertAfter(label, fn());
    }
}


export const eachDefaultKey = (item, index, array) => typeof array[0] === 'object' ? item : index;


export const attachAnchor = ($option, $cd, name, el) => {
    let fn = $option.anchor?.[name];
    if(fn) cd_onDestroy($cd, fn(el));
}


export const spreadAttributes = (cd, el, fn) => {
    const props = Object.getOwnPropertyDescriptors(el.__proto__);
    let prev = {};
    const set = (k, v) => {
        if(k == 'style') el.style.cssText = v;
        else if(props[k]?.set) el[k] = v;
        else bindAttributeBase(el, k, v);
    }
    const apply = (state) => {
        for(let k in state) {
            let value = state[k];
            if(prev[k] != value) {
                set(k, value);
                prev[k] = value;
            }
        }
        for(let k in prev) {
            if(!(k in state)) {
                set(k, null);
                delete prev[k];
            }
        }
    }
    $watch(cd, fn, apply, {cmp: (_, state) => {
        apply(state);
        return 0;
    }})
}


export const attchExportedFragment = ($parentCD, $childCD, name, label, template, innerFn) => {
    let fn = $childCD.$$.exported[name];
    if(fn) {
        let inner;
        if(template) {
            inner = (childCD, label) => {
                const $parentElement = $$htmlToFragment(template);
                if(innerFn) {
                    let $cd = $parentCD.new();
                    cd_onDestroy(childCD, () => $cd.destroy());
                    innerFn($cd, $parentElement);
                    $cd.$$.apply?.();
                }
                insertAfter(label, $parentElement);
            }
        }

        fn($parentCD, $childCD, label, inner);
    }
};


export const makeExportedFragment = ($component, name, template, fn) => {
    $component.exported[name] = ($parentCD, $childCD, label, inner) => {
        const $parentElement = $$htmlToFragment(template);
        if(fn) {
            let $cd = $childCD.new();
            cd_onDestroy($parentCD, () => $cd.destroy());
            fn($cd, $parentElement, inner);
            $cd.$$.apply?.();
        }
        insertAfter(label, $parentElement);
    }
};
