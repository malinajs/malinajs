import {
    $watch, $watchReadOnly, $$deepComparator, cloneDeep, $$cloneDeep, cd_new, $digest,
    $$compareDeep, cd_onDestroy, addEvent, fire, keyComparator, cd_attach, cd_destroy, cd_component
} from './cd';
import { __app_onerror, safeCall, isFunction, isObject } from './utils';

let templatecache = {};
let templatecacheSvg = {};

let $$uniqIndex = 1;

export const childNodes = 'childNodes';
export const firstChild = 'firstChild';

export let noop = a => a;

export const insertAfter = (label, node) => {
    label.parentNode.insertBefore(node, label.nextSibling);
};

export const createTextNode = (text) => document.createTextNode(text);

export const $$htmlToFragment = (html, option) => {
    let result = templatecache[html];
    if(!result) {
        let t = document.createElement('template');
        t.innerHTML = html.replace(/<>/g, '<!---->');
        result = t.content;
        if(!(option & 2) && result.firstChild == result.lastChild) result = result.firstChild;
        templatecache[html] = result;
    }

    return option & 1 ? result.cloneNode(true) : result;
};

export const $$htmlToFragmentClean = (html, option) => {
    let result = templatecache[html];
    if(!result) {
        let t = document.createElement('template');
        t.innerHTML = html.replace(/<>/g, '<!---->');
        result = t.content;

        let it = document.createNodeIterator(result, 128);
        let n;
        while(n = it.nextNode()) {
            if(!n.nodeValue) n.parentNode.replaceChild(document.createTextNode(''), n);
        }

        if(!(option & 2) && result.firstChild == result.lastChild) result = result.firstChild;
        templatecache[html] = result;
    }

    return option & 1 ? result.cloneNode(true) : result;
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
}


export const iterNodes = (el, last, fn) => {
    let next;
    while(el) {
        next = el.nextSibling;
        fn(el);
        if(el == last) break;
        el = next;
    }
};


export const $$removeElements = (el, last) => iterNodes(el, last, n => n.remove());


export function removeElementsBetween(el, stop) {
    let next;
    el = el.nextSibling;
    while(el) {
        next = el.nextSibling;
        if(el == stop) break;
        el.remove();
        el = next;
    }
}

export const getFinalLabel = n => {
    if(n.nextSibling) return n.nextSibling;
    let e = document.createTextNode('');
    n.parentNode.appendChild(e);
    return e;
};


const resolvedPromise = Promise.resolve();

export function $tick(fn) {
    fn && resolvedPromise.then(fn);
    return resolvedPromise;
}


export function $makeEmitter(option) {
    return (name, detail) => {
        let fn = option.events[name];
        if(!fn) return;
        let e = document.createEvent('CustomEvent');
        e.initCustomEvent(name, false, false, detail);
        fn(e);
    };
}


export function $$addEventForComponent(list, event, fn) {
    let prev = list[event];
    if(prev) {
        if(prev._list) prev._list.push(fn);
        else {
            function handler(e) {
                handler._list.forEach(fn => {
                    fn(e);
                });
            }
            handler._list = [prev, fn];
            list[event] = handler;
        }
    } else list[event] = fn;
}


export let current_component, $context;

export const $onDestroy = fn => current_component._d.push(fn);
export const $onMount = fn => current_component._m.push(fn);


export const $base = ($component) => {
    let $cd = cd_new();
    $cd.component = $component;
    $onDestroy(() => $cd.destroy());

    let planned;
    let apply = r => {
        if(planned) return r;
        planned = true;
        $tick(() => {
            try {
                $digest($cd);
            } finally {
                planned = false;
            }
        });
        return r;
    };

    $component.$cd = $cd;
    $component.apply = apply;
    $component.push = apply;
    apply();
};


export const makeComponent = (init, $base) => {
    return ($option = {}) => {
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
        $base?.($component);

        try {
            $component.$dom = init($option, $component.apply);
        } finally {
            current_component = prev;
            $context = null;
        }

        $component._d.push(...$component._m.map(safeCall));
        return $component;
    };
};


export const callComponent = (context, component, option = {}, propFn, cmp, setter, classFn) => {
    option.context = { ...context };
    let $component, parentWatch, childWatch, cd;

    if(propFn) {
        if(cmp) {
            cd = cd_new();
            parentWatch = $watch(cd, propFn, value => {
                option.props = value;
                if($component) {
                    $component.push?.();
                    childWatch && (childWatch.idle = true);
                    $component.apply?.();
                }
            }, { ro: true, value: {}, cmp });
            fire(parentWatch);
        } else option.props = propFn();
    }

    if(classFn) {
        cd = cd || cd_new();
        fire($watch(cd, classFn, value => {
            option.$class = value;
            $component?.apply?.();
        }, { ro: true, value: {}, cmp: keyComparator }));
    }

    let anchors = option.anchor;
    if(anchors) {
        for(let name in anchors) {
            let a = anchors[name];
            let fn = a.$;
            if(fn) {
                cd = cd || cd_new();
                anchors[name] = el => {
                    let $cd = cd_new();
                    cd_attach(cd, $cd);
                    fn($cd, el);
                    return () => cd_destroy($cd);
                };
            }
        }
    }

    $component = safeCall(() => component(option));
    if(setter && $component?.exportedProps) {
        childWatch = $watch($component.$cd, $component.exportedProps, value => {
            setter(value);
            cd_component(cd).apply();
        }, { ro: true, idle: true, value: parentWatch.value, cmp });
    }
    return {
        $cd: cd,
        $dom: $component.$dom,
        destroy: $component.destroy,
        $component
    };
};


export const attachDynComponent = (parentCD, label, exp, bind) => {
    let active, $cd, $dom, destroy, finalLabel = getFinalLabel(label);
    cd_onDestroy(parentCD, () => destroy?.());
    $watch(parentCD, exp, (component) => {
        destroy?.();
        if($cd) cd_destroy($cd);
        if(active) removeElementsBetween(label, finalLabel);

        if(component) {
            ({ $cd, $dom, destroy } = bind(component));
            cd_attach(parentCD, $cd);
            insertAfter(label, $dom);
            active = true;
        } else {
            destroy = null;
            $cd = null;
            active = false;
        }
    });
};


export const autoSubscribe = (...list) => {
    list.forEach(i => {
        if(i.subscribe) {
            let unsub = i.subscribe(current_component.apply);
            if(isFunction(unsub)) cd_onDestroy(current_component, unsub);
        }
    });
};


export const addStyles = (id, content) => {
    if(document.head.querySelector('style#' + id)) return;
    let style = document.createElement('style');
    style.id = id;
    style.innerHTML = content;
    document.head.appendChild(style);
};


export const addClass = (el, className) => el.classList.add(className);


export const bindClass = (cd, element, fn, className) => {
    $watch(cd, fn, value => {
        if(value) addClass(element, className);
        else element.classList.remove(className);
    }, { ro: true, value: false });
};


export const setClassToElement = (element, value) => bindAttributeBase(element, 'class', value);


export const bindClassExp = (cd, element, fn) => {
    $watch(cd, fn, value => setClassToElement(element, value), { ro: true, value: '' });
};


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
};


export const bindAttribute = (cd, element, name, fn) => {
    $watchReadOnly(cd, () => {
        let v = fn();
        return v == null ? v : '' + v;
    }, value => bindAttributeBase(element, name, value));
};


export const bindAction = (cd, element, action, fn, subscribe) => {
    $tick(() => {
        let handler, value;
        if(fn) {
            value = fn();
            handler = action.apply(null, [element].concat(value));
        } else handler = action(element);
        cd_onDestroy(cd, handler?.destroy);
        subscribe?.(cd, fn, handler, value);
    });
};


export const __bindActionSubscribe = (cd, fn, handler, value) => {
    if(handler?.update && fn) {
        $watch(cd, fn, args => {
            handler.update.apply(handler, args);
        }, { cmp: $$deepComparator(1), value: cloneDeep(value, 1) });
    }
};


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
        let result = {};
        if(defaults) result[defaults] = 1;
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
                    result[className] = 1;
                } else if(h !== true) {
                    result[name] = 1;
                    result[h] = 1;
                }
            }
            let h2 = classMap[name];
            if(h2) {
                result[name] = 1;
                result[h2] = 1;
            } else if(!h) {
                result[name] = 1;
            }
        });
        return Object.keys(result).join(' ');
    };
};


export const makeExternalProperty = ($component, name, getter, setter) => {
    Object.defineProperty($component, name, {
        get: getter,
        set: v => { setter(v); $component.apply(); }
    });
};


export const eachDefaultKey = (item, index, array) => isObject(array[0]) ? item : index;


export const attachAnchor = ($option, $cd, el, name) => {
    let fn = $option.anchor?.[name || 'default'];
    if(fn) cd_onDestroy($cd, fn(el));
};


export const spreadAttributes = (cd, el, fn) => {
    const props = Object.getOwnPropertyDescriptors(el.__proto__);
    let prev = {};
    const set = (k, v) => {
        if(k == 'style') el.style.cssText = v;
        else if(props[k]?.set) el[k] = v;
        else bindAttributeBase(el, k, v);
    };
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
    };
    $watch(cd, fn, apply, {
        cmp: (_, state) => {
            apply(state);
            return 0;
        }
    });
};


export const callExportedFragment = (childComponent, name, slot, events, props, cmp) => {
    let $cd, r;
    if(cmp) {
        $cd = cd_new();
        let fn = props, result;
        props = () => result;
        let w = $watch($cd, fn, (props) => {
            result = props;
            r?.push();
        }, { value: {}, cmp });
        fire(w);
    }
    let fn = childComponent.exported[name];
    r = fn(props, events, slot);
    r.$cd = $cd;
    return r;
};


export const exportFragment = (childCD, name, fn) => {
    cd_component(childCD).exported[name] = (props, events, slot) => {
        let { $cd, $dom } = fn(props, events || {}, slot);
        cd_attach(childCD, $cd);
        let apply = cd_component(childCD).apply;
        return {
            $dom,
            destroy: () => $cd.destroy(),
            push: () => apply?.()
        };
    };
};


export const prefixPush = ($cd, fn) => {
    $cd.prefix.push(fn);
    fn();
};


export const unwrapProps = (cd, props, fn) => {
    if(props) {
        if(isFunction(props)) prefixPush(cd, () => fn(props()));
        else fn(props);
    }
};


export const makeBlock = (fr, fn) => {
    return (v) => {
        let $dom = fr.cloneNode(true), $cd = cd_new();
        fn($cd, $dom, v);
        return { $cd, $dom };
    };
};


export const makeBlockBound = (parentCD, fr, fn) => {
    return () => {
        let $dom = fr.cloneNode(true), $cd = cd_new();
        fn($cd, $dom);
        cd_attach(parentCD, $cd);
        return {
            $dom,
            destroy: () => cd_destroy($cd)
        };
    };
};


export const makeStaticBlock = (fr, fn) => {
    return () => {
        let $dom = fr.cloneNode(true);
        fn?.($dom);
        return { $dom };
    };
};

export const attachBlock = (cdo, label, block) => {
    if(!block) return;
    cd_onDestroy(cdo, block.destroy);
    cd_attach(cdo, block.$cd);
    insertAfter(label, block.$dom);
};


export const mergeEvents = (...callbacks) => {
    callbacks = callbacks.filter(i => i);
    return (e) => callbacks.forEach(cb => cb(e));
};


export const makeRootEvent = (root) => {
    let events = {}, nodes = [];

    if(root.nodeType == 11) {
        let n = root.firstElementChild;
        while(n) {
            nodes.push(n);
            n = n.nextElementSibling;
        }
    } else nodes = [root];

    $onDestroy(() => {
        for(let eventName in events) {
            nodes.forEach(n => n.removeEventListener(eventName, events[eventName]));
        }
    });
    return (target, eventName, callback) => {
        const key = `_$$${eventName}`;
        if(!events[eventName]) {
            let handler = events[eventName] = ($event) => {
                let top = $event.currentTarget;
                let el = $event.target;
                while(el) {
                    el[key]?.($event);
                    if(el == top || $event.cancelBubble) break;
                    el = el.parentNode;
                }
            };
            nodes.forEach(n => n.addEventListener(eventName, handler));
        }
        target[key] = callback;
    };
};
