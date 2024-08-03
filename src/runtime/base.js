import {
  $watch, deepComparator, cloneDeep, cd_new, $digest,
  addEvent, fire, keyComparator, cd_attach, cd_detach, cd_component, WatchObject
} from './cd';
import { __app_onerror, safeCall, isFunction, isObject, safeGroupCall, safeGroupCall2 } from './utils';
import * as share from './share.js';
import { $onDestroy } from './share.js';

let templatecache = {};
let templatecacheSvg = {};

export let noop = a => a;

export const insertAfter = (label, node) => {
  label.parentNode.insertBefore(node, label.nextSibling);
};

export const createTextNode = (text) => document.createTextNode(text);

export const htmlToFragment = (html, option) => {
  let result = templatecache[html];
  if (!result) {
    let t = document.createElement('template');
    t.innerHTML = html.replace(/<>/g, '<!---->');
    result = t.content;
    if (!(option & 2) && result.firstChild == result.lastChild) result = result.firstChild;
    templatecache[html] = result;
  }

  return option & 1 ? result.cloneNode(true) : result;
};

export const htmlToFragmentClean = (html, option) => {
  let result = templatecache[html];
  if (!result) {
    let t = document.createElement('template');
    t.innerHTML = html.replace(/<>/g, '<!---->');
    result = t.content;

    let it = document.createNodeIterator(result, 128);
    let n;
    while (n = it.nextNode()) {
      if (!n.nodeValue) n.parentNode.replaceChild(document.createTextNode(''), n);
    }

    if (!(option & 2) && result.firstChild == result.lastChild) result = result.firstChild;
    templatecache[html] = result;
  }

  return option & 1 ? result.cloneNode(true) : result;
};


export function svgToFragment(content) {
  if (templatecacheSvg[content]) return templatecacheSvg[content].cloneNode(true);
  let t = document.createElement('template');
  t.innerHTML = '<svg>' + content + '</svg>';

  let result = document.createDocumentFragment();
  let svg = t.content.firstChild;
  while (svg.firstChild) result.appendChild(svg.firstChild);
  templatecacheSvg[content] = result.cloneNode(true);
  return result;
}


export const iterNodes = (el, last, fn) => {
  let next;
  while (el) {
    next = el.nextSibling;
    fn(el);
    if (el == last) break;
    el = next;
  }
};


export const removeElements = (el, last) => iterNodes(el, last, n => n.remove());


const resolvedPromise = Promise.resolve();

export function $tick(fn) {
  fn && resolvedPromise.then(fn);
  return resolvedPromise;
}


export function makeEmitter(option) {
  return (name, detail) => {
    let fn = option.events?.[name];
    if (!fn) return;
    let e = document.createEvent('CustomEvent');
    e.initCustomEvent(name, false, false, detail);
    fn(e);
  };
}


export let current_component, $context;


export const makeApply = () => {
  let $cd = current_component.$cd = share.current_cd = cd_new();
  $cd.component = current_component;

  let planned, flag = [0];
  let apply = r => {
    flag[0]++;
    if (planned) return r;
    planned = true;
    $tick(() => {
      try {
        $digest($cd, flag);
      } finally {
        planned = false;
      }
    });
    return r;
  };

  current_component.$apply = apply;
  current_component.$push = apply;
  apply();
  return apply;
};


export const makeComponent = (init) => {
  return ($option = {}) => {
    $context = $option.context || {};
    let prev_component = current_component,
      prev_cd = share.current_cd,
      $component = current_component = { $option };
    share.current_cd = null;

    try {
      $component.$dom = init($option);
    } finally {
      current_component = prev_component;
      share.current_cd = prev_cd;
      $context = null;
    }

    return $component;
  };
};


export const callComponent = (component, context, option = {}) => {
  option.context = { ...context };
  let $component = safeCall(() => component(option));
  if ($component instanceof Node) $component = { $dom: $component };
  return $component;
};


export const callComponentDyn = (component, context, option = {}, propFn, cmp, setter, classFn) => {
  let $component, parentWatch;

  if (propFn) {
    parentWatch = $watch(propFn, value => {
      $component.$push?.(value);
      $component.$apply?.();
    }, { value: {}, idle: true, cmp });
    option.props = fire(parentWatch);
  }

  if (classFn) {
    fire($watch(classFn, value => {
      option.$class = value;
      $component?.$apply?.();
    }, { value: {}, cmp: keyComparator }));
  }

  $component = callComponent(component, context, option);
  if (setter && $component?.$exportedProps) {
    let parentCD = share.current_cd, w = new WatchObject($component.$exportedProps, value => {
      setter(value);
      cd_component(parentCD).$apply();
      $component.$push(parentWatch.fn());
      $component.$apply();
    });
    Object.assign(w, { idle: true, cmp, value: parentWatch.value });
    $component.$cd.watchers.push(w);
  }

  return $component;
};


export const attachDynComponent = (label, exp, bind, parentLabel) => {
  let parentCD = share.current_cd;
  let destroyList, $cd, first;
  const destroy = () => safeGroupCall(destroyList);
  $onDestroy(destroy);

  $watch(exp, (component) => {
    destroy();
    if ($cd) cd_detach($cd);
    if (first) removeElements(first, parentLabel ? null : label.previousSibling);

    if (component) {
      destroyList = share.current_destroyList = [];
      share.current_mountList = [];
      $cd = share.current_cd = cd_new(parentCD);
      try {
        const $dom = bind(component).$dom;
        cd_attach(parentCD, $cd);
        first = $dom.nodeType == 11 ? $dom.firstChild : $dom;
        if (parentLabel) label.appendChild($dom);
        else label.parentNode.insertBefore($dom, label);
        safeGroupCall2(share.current_mountList, destroyList);
      } finally {
        share.current_destroyList = share.current_mountList = share.current_cd = null;
      }
    } else {
      $cd = first = destroyList = null;
    }
  });
};


export const autoSubscribe = (...list) => {
  list.forEach(i => {
    if (isFunction(i.subscribe)) {
      let unsub = i.subscribe(current_component.$apply);
      if (isFunction(unsub)) $onDestroy(unsub);
    }
  });
};


export const addStyles = (id, content) => {
  if (document.head.querySelector('style#' + id)) return;
  let style = document.createElement('style');
  style.id = id;
  style.innerHTML = content;
  document.head.appendChild(style);
};


export const addClass = (el, className) => el.classList.add(className);


export const bindClass = (element, fn, className) => {
  $watch(fn, value => {
    if (value) addClass(element, className);
    else element.classList.remove(className);
  }, { value: false });
};


export const setClassToElement = (element, value) => bindAttributeBase(element, 'class', value);


export const bindClassExp = (element, fn) => {
  $watch(fn, value => setClassToElement(element, value), { value: '' });
};


export const bindText = (element, fn) => {
  $watch(() => '' + fn(), value => {
    element.textContent = value;
  });
};


export const bindStyle = (element, name, fn) => {
  $watch(fn, (value) => {
    element.style.setProperty(name, value);
  });
};


export const bindAttributeBase = (element, name, value) => {
  if (value != null) element.setAttribute(name, value);
  else element.removeAttribute(name);
};


export const bindAttribute = (element, name, fn) => {
  $watch(() => {
    let v = fn();
    return v == null ? v : '' + v;
  }, value => bindAttributeBase(element, name, value));
};


export const bindAction = (element, action, fn, subscribe) => {
  let handler, value;
  if (fn) {
    value = fn();
    handler = action.apply(null, [element].concat(value));
  } else handler = action(element);
  if (isFunction(handler)) $onDestroy(handler);
  else {
    $onDestroy(handler?.destroy);
    subscribe?.(fn, handler, value);
    handler?.init && share.$onMount(handler.init);
  }
};


export const __bindActionSubscribe = (fn, handler, value) => {
  if (handler?.update && fn) {
    $watch(fn, args => {
      handler.update.apply(handler, args);
    }, { cmp: deepComparator(1), value: cloneDeep(value, 1) });
  }
};


export const bindInput = (element, name, get, set) => {
  let w = $watch(name == 'checked' ? () => !!get() : get, value => {
    element[name] = value == null ? '' : value;
  });
  addEvent(element, 'input', () => {
    set(w.value = element[name]);
  });
};


export const makeClassResolver = ($option, classMap, metaClass, mainName) => {
  if (!$option.$class) $option.$class = {};
  if (!mainName && metaClass.main) mainName = 'main';
  return (line, defaults) => {
    let result = {};
    if (defaults) result[defaults] = 1;
    line.trim().split(/\s+/).forEach(name => {
      let meta;
      if (name[0] == '$') {
        name = name.substring(1);
        meta = true;
      }
      let h = metaClass[name] || meta;
      if (h) {
        let className = ($option.$class[name === mainName ? '$$main' : name] || '').trim();
        if (className) {
          result[className] = 1;
        } else if (h !== true) {
          result[name] = 1;
          result[h] = 1;
        }
      }
      let h2 = classMap[name];
      if (h2) {
        result[name] = 1;
        result[h2] = 1;
      } else if (!h) {
        result[name] = 1;
      }
    });
    return Object.keys(result).join(' ');
  };
};


export const makeExternalProperty = (name, getter, setter) => {
  let $component = current_component;
  Object.defineProperty($component, name, {
    get: getter,
    set: v => { setter(v); $component.$apply(); }
  });
};


export const attachAnchor = ($option, el, name) => {
  $option.anchor?.[name || 'default']?.(el);
};


export const makeAnchor = (fn) => {
  let parentCD = share.current_cd;
  return ($dom) => {
    let prev = share.current_cd, $cd = share.current_cd = cd_new();
    cd_attach(parentCD, $cd);
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
    if (k == 'style') el.style.cssText = v;
    else if (props[k]?.set) el[k] = v;
    else bindAttributeBase(el, k, v);
  };
  const apply = (state) => {
    for (let k in state) {
      let value = state[k];
      if (prev[k] != value) {
        set(k, value);
        prev[k] = value;
      }
    }
    for (let k in prev) {
      if (!(k in state)) {
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
  let push, $dom, fn = childComponent.$exported?.[name];
  if (!fn) return;
  if (cmp) {
    let result;
    let w = $watch(props, (value) => {
      result = value;
      push?.();
    }, { value: {}, cmp });
    fire(w);
    props = () => result;
  }
  ([$dom, push] = fn(props, events, slot));
  return $dom;
};


export const exportFragment = (component, name, fn) => {
  let childCD = share.current_cd;
  if (!component.$exported) component.$exported = {};
  component.$exported[name] = (props, events, slot) => {
    let prev = share.current_cd, apply;
    if (childCD) {
      let $cd = share.current_cd = cd_new();
      cd_attach(childCD, $cd);
      $onDestroy(() => cd_detach($cd));
      apply = component.$apply;
      apply();
    } else {
      share.current_cd = null;
    }

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
  if (props) {
    if (isFunction(props)) prefixPush(() => fn(props()));
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
    cd_attach(parentCD, $cd);
    share.$onDestroy(() => cd_detach($cd));
    try {
      fn($dom);
      return $dom;
    } finally {
      share.current_cd = prev;
    }
  };
};


export const attachBlock = (label, $dom) => {
  if (!$dom) return;
  insertAfter(label, $dom.$dom || $dom);
};

export const addBlock = (parent, $dom) => {
  if (!$dom) return;
  parent.appendChild($dom.$dom || $dom);
};

export const insertBlock = (label, $dom) => {
  if (!$dom) return;
  label.parentNode.insertBefore($dom.$dom || $dom, label);
};

export const mergeEvents = (...callbacks) => {
  callbacks = callbacks.filter(i => i);
  return (e) => callbacks.forEach(cb => cb(e));
};

export const mergeAllEvents = ($events, local) => {
  let result = Object.assign({}, $events);
  for (let e in local) {
    if (result[e]) result[e] = mergeEvents($events[e], local[e]);
    else result[e] = local[e];
  }
  return result;
};

export const makeRootEvent = (root) => {
  let events = {}, nodes = [];

  if (root.nodeType == 11) {
    let n = root.firstElementChild;
    while (n) {
      nodes.push(n);
      n = n.nextElementSibling;
    }
  } else nodes = [root];

  $onDestroy(() => {
    for (let eventName in events) {
      nodes.forEach(n => n.removeEventListener(eventName, events[eventName]));
    }
  });
  return (target, eventName, callback) => {
    const key = `_$$${eventName}`;
    if (!events[eventName]) {
      let handler = events[eventName] = ($event) => {
        let top = $event.currentTarget;
        let el = $event.target;
        while (el) {
          el[key]?.($event);
          if (el == top || $event.cancelBubble) break;
          el = el.parentNode;
        }
      };
      nodes.forEach(n => n.addEventListener(eventName, handler));
    }
    target[key] = callback;
  };
};

export const mount = (label, component, option) => {
  let app, first, last, destroyList = share.current_destroyList = [];
  share.current_mountList = [];
  try {
    app = component(option);
    let $dom = app.$dom;
    delete app.$dom;
    if ($dom.nodeType == 11) {
      first = $dom.firstChild;
      last = $dom.lastChild;
    } else first = last = $dom;
    label.appendChild($dom);
    safeGroupCall2(share.current_mountList, destroyList);
  } finally {
    share.current_destroyList = share.current_mountList = null;
  }
  app.destroy = () => {
    safeGroupCall(destroyList);
    removeElements(first, last);
  };
  return app;
};

export const mountStatic = (label, component, option) => {
  share.current_destroyList = [];
  share.current_mountList = [];
  try {
    let app = component(option);
    label.appendChild(app.$dom);
    safeGroupCall(share.current_mountList);
    return app;
  } finally {
    share.current_destroyList = share.current_mountList = null;
  }
};

export const refer = (active, line) => {
  let result = [], i, v;
  const code = (x, d) => x.charCodeAt() - d;

  for (i = 0; i < line.length; i++) {
    let a = line[i];
    switch (a) {
      case '>':
        active = active.firstChild;
        break;
      case '+':
        active = active.firstChild;
      case '.':
        result.push(active);
        break;
      case '!':
        v = code(line[++i], 48) * 42 + code(line[++i], 48);
        while (v--) active = active.nextSibling;
        break;
      case '#':
        active = result[code(line[++i], 48) * 26 + code(line[++i], 48)];
        break;
      default:
        v = code(a, 0);
        if (v >= 97) active = result[v - 97];
        else {
          v -= 48;
          while (v--) active = active.nextSibling;
        }
    }
  }
  return result;
};
