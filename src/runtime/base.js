import {
  $watch, $watchReadOnly, $$deepComparator, cloneDeep, $$cloneDeep, cd_new, $digest,
  $$compareDeep, addEvent, fire, keyComparator, cd_attach, cd_attach2, cd_detach, cd_component, WatchObject
} from './cd';
import { __app_onerror, safeCall, isFunction, isObject, safeGroupCall } from './utils';
import { $onDestroy } from './share.js';

let templatecache = {};
let templatecacheSvg = {};

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
    let fn = option.events?.[name];
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
export const $onMount = fn => current_component._m.push(fn);


export const makeApply = () => {
  let $cd = current_component.$cd = share.current_cd = cd_new();
  $cd.component = current_component;

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

  current_component.apply = apply;
  current_component.push = apply;
  apply();
  return apply;
};


export const makeComponent = (init) => {
  return ($option = {}) => {
    $context = $option.context || {};
    let prev_component = current_component,
      prev_cd = share.current_cd,
      $component = current_component = {
        $option,
        context: $context,
        exported: {},
        _m: []
      };
    share.current_cd = null;

    try {
      $component.$dom = init($option);
    } finally {
      current_component = prev_component;
      $context = null;
      share.current_cd = prev_cd;
    }

    $component._m.forEach(fn => $onDestroy(safeCall(fn)));
    return $component;
  };
};


export const callComponent = (context, component, option = {}, propFn, cmp, setter, classFn) => {
  option.context = { ...context };
  let $component, parentWatch, childWatch, parentCD = share.current_cd;

  if(propFn) {
    if(cmp) {
      parentWatch = $watch(propFn, value => {
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
    fire($watch(classFn, value => {
      option.$class = value;
      $component?.apply?.();
    }, { ro: true, value: {}, cmp: keyComparator }));
  }

  $component = safeCall(() => component(option));
  if(setter && $component?.exportedProps) {
    let w = new WatchObject($component.exportedProps, value => {
      setter(value);
      cd_component(parentCD).apply();
      option.props = parentWatch.fn();
      $component.push();
    });
    Object.assign(w, { ro: true, idle: true, cmp, value: parentWatch.value });
    $component.$cd.watchers.push(w);
  }

  return $component;
};


export const attachDynComponent = (label, exp, bind) => {
  let parentCD = share.current_cd;
  let active, destroyList, $cd, $dom, finalLabel = getFinalLabel(label);
  const destroy = () => destroyList && safeGroupCall(destroyList);
  $onDestroy(destroy);

  $watch(exp, (component) => {
    destroy();
    if($cd) cd_detach($cd);
    if(active) removeElementsBetween(label, finalLabel);

    if(component) {
      destroyList = share.current_destroyList = [];
      $cd = share.current_cd = cd_new();
      try {
        $dom = bind(component).$dom;
      } finally {
        share.current_destroyList = null;
        share.current_cd = null;
      }
      cd_attach2(parentCD, $cd);
      insertAfter(label, $dom);
      active = true;
    } else {
      $cd = null;
      active = false;
      destroyList = null;
    }
  });
};


export const autoSubscribe = (...list) => {
  list.forEach(i => {
    if(isFunction(i.subscribe)) {
      let unsub = i.subscribe(current_component.apply);
      if(isFunction(unsub)) $onDestroy(unsub);
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


export const bindClass = (element, fn, className) => {
  $watch(fn, value => {
    if(value) addClass(element, className);
    else element.classList.remove(className);
  }, { ro: true, value: false });
};


export const setClassToElement = (element, value) => bindAttributeBase(element, 'class', value);


export const bindClassExp = (element, fn) => {
  $watch(fn, value => setClassToElement(element, value), { ro: true, value: '' });
};


export const bindText = (element, fn) => {
  $watchReadOnly(() => '' + fn(), value => {
    element.textContent = value;
  });
};


export const bindStyle = (element, name, fn) => {
  $watchReadOnly(fn, (value) => {
    element.style[name] = value;
  });
};


export const bindAttributeBase = (element, name, value) => {
  if(value != null) element.setAttribute(name, value);
  else element.removeAttribute(name);
};


export const bindAttribute = (element, name, fn) => {
  $watchReadOnly(() => {
    let v = fn();
    return v == null ? v : '' + v;
  }, value => bindAttributeBase(element, name, value));
};


export const bindAction = (element, action, fn, subscribe) => {
  let handler, value;
  if(fn) {
    value = fn();
    handler = action.apply(null, [element].concat(value));
  } else handler = action(element);
  $onDestroy(handler?.destroy);
  subscribe?.(fn, handler, value);
  handler.init && $tick(handler.init);
};


export const __bindActionSubscribe = (fn, handler, value) => {
  if(handler?.update && fn) {
    $watch(fn, args => {
      handler.update.apply(handler, args);
    }, { cmp: $$deepComparator(1), value: cloneDeep(value, 1) });
  }
};


export const bindInput = (element, name, get, set) => {
  let w = $watchReadOnly(name == 'checked' ? () => !!get() : get, value => {
    element[name] = value == null ? '' : value;
  });
  addEvent(element, 'input', () => {
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


export const attachAnchor = ($option, el, name) => {
  $option.anchor?.[name || 'default']?.(el);
};


export const makeAnchor = (fn) => {
  let parentCD = share.current_cd;
  return ($dom) => {
    let prev = share.current_cd, $cd = share.current_cd = cd_new();
    cd_attach2(parentCD, $cd);
    $onDestroy(() => cd_detach($cd));
    try {
      fn($dom);
    } finally {
      share.current_cd = prev;
    }
  };
};


export const spreadAttributes = (el, fn) => {
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
  $watch(fn, apply, {
    cmp: (_, state) => {
      apply(state);
      return 0;
    }
  });
};


export const callExportedFragment = (childComponent, name, slot, events, props, cmp) => {
  let push, $dom;
  if(cmp) {
    let result;
    let w = $watch(props, (value) => {
      result = value;
      push?.();
    }, { value: {}, cmp });
    fire(w);
    props = () => result;
  }
  let fn = childComponent.exported[name];
  ([$dom, push] = fn(props, events, slot));
  return $dom;
};


export const exportFragment = (name, fn) => {
  let childCD = share.current_cd;
  cd_component(childCD).exported[name] = (props, events, slot) => {
    let prev = share.current_cd, $cd = share.current_cd = cd_new();
    cd_attach2(childCD, $cd);
    $onDestroy(() => cd_detach($cd));
    let apply = cd_component(childCD).apply;
    apply();
    try {
      return [fn(props, events || {}, slot), apply];
    } finally {
      share.current_cd = prev;
    }
  };
};


export const prefixPush = fn => {
  share.current_cd.prefix.push(fn);
  fn();
};


export const unwrapProps = (props, fn) => {
  if(props) {
    if(isFunction(props)) prefixPush(() => fn(props()));
    else fn(props);
  }
};


export const makeBlock = (fr, fn) => {
  return (v) => {
    let $dom = fr.cloneNode(true);
    fn?.($dom, v);
    return $dom;
  };
};


export const makeBlockBound = (fr, fn) => {
  let parentCD = share.current_cd;
  return () => {
    let $dom = fr.cloneNode(true), prev = share.current_cd, $cd = share.current_cd = cd_new();
    cd_attach2(parentCD, $cd);
    $onDestroy(() => cd_detach($cd));
    try {
      fn($dom);
      return $dom;
    } finally {
      share.current_cd = prev;
    }
  };
};


export const attachBlock = (label, $dom) => {
  if(!$dom) return;
  insertAfter(label, $dom.$dom || $dom);
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

export const mount = (label, component, option) => {
  let app, $dom, first, last, destroyList = share.current_destroyList = [];
  try {
    ({ $dom, ...app } = component(option));
    if($dom.nodeType == 11) {
      first = $dom.firstChild;
      last = $dom.lastChild;
    } else first = last = $dom;
    label.appendChild($dom);
  } finally {
    share.current_destroyList = null;
  }
  app.destroy = () => {
    safeGroupCall(destroyList);
    $$removeElements(first, last);
  };
  return app;
};
