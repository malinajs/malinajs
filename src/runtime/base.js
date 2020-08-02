
import { $watch, $watchReadOnly, $$deepComparator, $$cloneDeep, $ChangeDetector, $digest, $$compareDeep } from './cd';


let templatecache = {false: {}, true: {}};

let $$uniqIndex = 1;

export const $$childNodes = 'childNodes';

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

export function $$removeElements(el, last) {
    let next;
    while(el) {
        next = el.nextSibling;
        el.remove();
        if(el == last) break;
        el = next;
    }
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
                console.error(e);
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

export function $$makeSpreadObject2($cd, props) {
    let index = 0;
    let list = [];
    let self = {};
    let defaultUsed = {};

    const emit = $$groupCall(() => {
        self.build();
        self.emit && self.emit();
    });

    self.build = () => {
        let obj, name, used = Object.assign({}, defaultUsed);
        for(let i=index-1; i>=0; i--) {
            obj = list[i];
            for(name in obj) {
                if(used[name]) continue;
                used[name] = true;
                props[name] = obj[name];
            }
        }
    }

    self.spread = function(fn) {
        let i = index++;
        let value = fn();
        list[i] = value;
        $watch($cd, fn, value => {
            list[i] = value;
            emit();
        }, {ro: true, cmp: $$compareDeep, value: $$cloneDeep(value)});
    }
    self.prop = function(name, fn) {
        let value = fn();
        let i = index++;
        list[i] = {};
        list[i][name] = value;
        $watch($cd, fn, value => {
            list[i][name] = value;
            emit();
        }, {ro: true, cmp: $$compareDeep, value: $$cloneDeep(value)});
    }
    self.attr = function(name, value) {
        let d = {};
        d[name] = value;
        list[index++] = d;
    }
    self.except = function(list) {
        list.forEach(n => defaultUsed[n] = true);
    }
    return self;
};

export function $$makeProp($component, $props, bound, name, getter, setter) {
    let value = $props[name];
    if(value !== void 0) setter(value);
    if((bound[name] || bound.$$spreading) && (bound[name] !== 2)) $component.push.push(() => setter($props[name]));
    $component.exportedProps[name] = true;

    Object.defineProperty($component, name, {
        get: getter,
        set: setter
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

export function $$makeApply($cd) {
    let stop, id = `a${$$uniqIndex++}`;
    return function apply(option) {
        if(option === false) {
            if(_tick_planned.apply) stop = true;
            return;
        }
        if(apply._p) return;

        $tick(() => {
            if(stop) return stop = false;
            try {
                apply._p = true;
                $digest($cd);
            } finally {
                apply._p = false;
            }
        }, id);
    };
}

export function $$makeComponent($element, $option) {
    let $component = {
        $cd: new $ChangeDetector(),
        exportedProps: {},
        push: []
    };

    $component.destroy = () => $component.$cd.destroy();
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

export function $$componentCompleteProps($component, $$apply, $props) {
    let list = $component.push;
    let recalcAttributes, $attributes = $props;
    $component.push = () => {
        list.forEach(fn => fn());
        recalcAttributes();
        $$apply();
    };

    $attributes = {};
    for(let k in $props) {
        if(!$component.exportedProps[k]) {
            $attributes[k] = $props[k];
            recalcAttributes = 1;
        }
    }
    if(recalcAttributes) {
        recalcAttributes = () => {
            for(let k in $attributes) $attributes[k] = $props[k];
        }
    } else recalcAttributes = () => {};

    return $attributes;
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


export const bindText = (cd, element, fn) => {
    $watchReadOnly(cd, fn, value => {
        element.textContent = value;
    });
};
