
import { __app_onerror, safeCall } from './utils';

export function $watch(cd, fn, callback, w) {
    if(!w) w = {};
    w.fn = fn;
    w.cb = callback;
    if(!('value' in w)) w.value = NaN;
    cd.watchers.push(w);
    return w;
};

export function $watchReadOnly(cd, fn, callback) {
    return $watch(cd, fn, callback, {ro: true});
};

export const watchInit = (cd, fn, callback) => {
    let w = $watchReadOnly(cd, fn, callback);
    w.value = fn();
    return w.value;
};

export function addEvent(cd, el, event, callback) {
    el.addEventListener(event, callback);
    cd_onDestroy(cd, () => {
        el.removeEventListener(event, callback);
    });
};

export function cd_onDestroy(cd, fn) {
    if(fn) cd._d.push(fn);
};

export function $$removeItem(array, item) {
    let i = array.indexOf(item);
    if(i>=0) array.splice(i, 1);
};

export function $ChangeDetector(parent) {
    this.parent = parent;
    this.children = [];
    this.watchers = [];
    this._d = [];
    this.prefix = [];
    this.$$ = parent?.$$;
};

$ChangeDetector.prototype.new = function() {
    var cd = new $ChangeDetector(this);
    this.children.push(cd);
    return cd;
};

$ChangeDetector.prototype.destroy = function(option) {
    if(option !== false && this.parent) $$removeItem(this.parent.children, this);
    this.watchers.length = 0;
    this.prefix.length = 0;
    this._d.map(safeCall);
    this._d.length = 0;
    this.children.map(cd => cd.destroy(false));
    this.children.length = 0;
};


export const isArray = (a) => Array.isArray(a);

const compareArray = (a, b) => {
    let a0 = isArray(a);
    let a1 = isArray(b);
    if(a0 !== a1) return true;
    if(!a0) return a !== b;
    if(a.length !== b.length) return true;
    for(let i=0;i<a.length;i++) {
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
};


const compareDeep = (a, b, lvl) => {
    if(lvl < 0 || !a || !b) return a !== b;
    if(a === b) return false;
    let o0 = typeof(a) == 'object';
    let o1 = typeof(b) == 'object';
    if(!(o0 && o1)) return a !== b;

    let a0 = isArray(a);
    let a1 = isArray(b);
    if(a0 !== a1) return true;

    if(a0) {
        if(a.length !== b.length) return true;
        for(let i=0;i<a.length;i++) {
            if(compareDeep(a[i], b[i], lvl-1)) return true;
        }
    } else {
        let set = {};
        for(let k in a) {
            if(compareDeep(a[k], b[k], lvl-1)) return true;
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

    if(typeof(d) == 'object') {
        if(d instanceof Date) return d;
        if(d instanceof Element) return d;
        if(isArray(d)) return d.map(i => cloneDeep(i, lvl-1));
        let r = {};
        for(let k in d) r[k] = cloneDeep(d[k], lvl-1);
        return r;
    }
    return d;
};

export const $$cloneDeep = function(d) {
    return cloneDeep(d, 10);
};

export function $$deepComparator(depth) {
    return function(w, value) {
        if(!compareDeep(w.value, value, depth)) return 0;
        w.value = cloneDeep(value, depth);
        w.cb(value);
        return w.ro ? 0 : 1;
    };
};

export const $$compareDeep = $$deepComparator(10);

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
            for(i=0;i<cd.prefix.length;i++) cd.prefix[i]();
            for(i=0;i<cd.watchers.length;i++) {
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
            };
            if(cd.children.length) queue.push.apply(queue, cd.children);
            cd = queue[index++];
        }
        loop--;
        if(!changes) break;
    }
    if(loop < 0) __app_onerror('Infinity changes: ', w);
};
