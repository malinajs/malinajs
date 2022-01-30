import { __app_onerror, safeCall, isObject } from './utils';
import * as share from './share.js';
import { $onDestroy } from './share.js';

export function WatchObject(fn, cb, ro) {
  this.fn = fn;
  this.cb = cb;
  this.ro = ro || false;
  this.value = NaN;
  this.cmp = null;
}

export function $watch(fn, callback, option) {
  let w = new WatchObject(fn, callback);
  option && Object.assign(w, option);
  share.current_cd.watchers.push(w);
  return w;
}

export function $watchReadOnly(fn, callback) {
  return $watch(fn, callback, { ro: true });
}

export function addEvent(el, event, callback) {
  if(!callback) return;
  el.addEventListener(event, callback);

  $onDestroy(() => {
    el.removeEventListener(event, callback);
  });
}

export function $$removeItem(array, item) {
  let i = array.indexOf(item);
  if(i >= 0) array.splice(i, 1);
}

function $ChangeDetector(parent) {
  this.parent = parent;
  this.children = [];
  this.watchers = [];
  this.prefix = [];
}

export const cd_component = cd => {
  while(cd.parent) cd = cd.parent;
  return cd.component;
};

export const cd_new = () => new $ChangeDetector();

export const cd_attach2 = (parent, cd) => {
  if(cd) {
    cd.parent = parent;
    parent.children.push(cd);
  }
};

export const cd_attach = (cd) => cd_attach2(share.current_cd, cd);

export const cd_detach = cd => $$removeItem(cd.parent.children, cd);

export const isArray = (a) => Array.isArray(a);

const compareArray = (a, b) => {
  let a0 = isArray(a);
  let a1 = isArray(b);
  if(a0 !== a1) return true;
  if(!a0) return a !== b;
  if(a.length !== b.length) return true;
  for(let i = 0; i < a.length; i++) {
    if(a[i] !== b[i]) return true;
  }
  return false;
};


export function $$compareArray(w, value) {
  if(!compareArray(w.value, value)) return 0;
  if(isArray(value)) w.value = value.slice();
  else w.value = value;
  w.cb(w.value);
  return w.ro ? 0 : 1;
}


const compareDeep = (a, b, lvl) => {
  if(lvl < 0 || !a || !b) return a !== b;
  if(a === b) return false;
  let o0 = isObject(a);
  let o1 = isObject(b);
  if(!(o0 && o1)) return a !== b;

  let a0 = isArray(a);
  let a1 = isArray(b);
  if(a0 !== a1) return true;

  if(a0) {
    if(a.length !== b.length) return true;
    for(let i = 0; i < a.length; i++) {
      if(compareDeep(a[i], b[i], lvl - 1)) return true;
    }
  } else {
    let set = {};
    for(let k in a) {
      if(compareDeep(a[k], b[k], lvl - 1)) return true;
      set[k] = true;
    }
    for(let k in b) {
      if(set[k]) continue;
      return true;
    }
  }

  return false;
};

export function cloneDeep(d, lvl) {
  if(lvl < 0 || !d) return d;

  if(isObject(d)) {
    if(d instanceof Date) return d;
    if(d instanceof Element) return d;
    if(isArray(d)) return d.map(i => cloneDeep(i, lvl - 1));
    let r = {};
    for(let k in d) r[k] = cloneDeep(d[k], lvl - 1);
    return r;
  }
  return d;
}

export const $$cloneDeep = function(d) {
  return cloneDeep(d, 10);
};

export function $$deepComparator(depth) {
  return function(w, value) {
    let diff = compareDeep(w.value, value, depth);
    diff && (w.value = cloneDeep(value, depth), !w.idle && w.cb(value));
    w.idle = false;
    return !w.ro && diff ? 1 : 0;
  };
}

export const $$compareDeep = $$deepComparator(10);


export const keyComparator = (w, value) => {
  let diff = false;
  for(let k in value) {
    if(w.value[k] != value[k]) diff = true;
    w.value[k] = value[k];
  }
  diff && !w.idle && w.cb(value);
  w.idle = false;
  return !w.ro && diff ? 1 : 0;
};


export const fire = w => {
  if(w.cmp) w.cmp(w, w.fn());
  else {
    w.value = w.fn();
    w.cb(w.value);
  }
};

export function $digest($cd) {
  let loop = 10;
  let w;
  while(loop >= 0) {
    let changes = 0;
    let index = 0;
    let queue = [];
    let i, value, cd = $cd;
    while(cd) {
      for(i = 0; i < cd.prefix.length; i++) cd.prefix[i]();
      for(i = 0; i < cd.watchers.length; i++) {
        w = cd.watchers[i];
        value = w.fn();
        if(w.value !== value) {
          if(w.cmp) {
            changes += w.cmp(w, value);
          } else {
            w.value = value;
            if(!w.ro) changes++;
            w.cb(w.value);
          }
        }
      }
      if(cd.children.length) queue.push.apply(queue, cd.children);
      cd = queue[index++];
    }
    loop--;
    if(!changes) break;
  }
  if(loop < 0) __app_onerror('Infinity changes: ', w);
}
