
function $$htmlToFragment(html) {
    let t = document.createElement('template');
    t.innerHTML = html;
    return t.content;
};

function $$removeItem(array, item) {
    let i = array.indexOf(item);
    if(i>=0) array.splice(i, 1);
};

const $$childNodes = 'childNodes';

function $watch(cd, fn, callback, w) {
    if(!w) w = {};
    w.fn = fn;
    w.cb = callback;
    w.value = void 0;
    cd.watchers.push(w);
}

function $ChangeDetector(root) {
    if(root) this.root = root;
    else {
        this.root = this;
        this.onceList = [];
    }
    this.root = root || this;
    this.children = [];
    this.watchers = [];
    this.destroyList = [];
};

Object.assign($ChangeDetector.prototype, {
    new: function() {
        var cd = new $ChangeDetector(this);
        this.children.push(cd);
        return cd;
    },
    wf: function(fn, callback) {
        $watch(this, fn, callback, {ro: true});
    },
    wa: function(fn, callback) {
        let w = {fn: fn, cb: callback, value: undefined, a: true};
        this.watchers.push(w);
        return w;
    },
    ev: function(el, event, callback) {
        el.addEventListener(event, callback);
        this.d(() => {
            el.removeEventListener(event, callback);
        });
    },
    d: function(fn) {
        this.destroyList.push(fn);
    },
    destroy: function() {
        this.watchers.length = 0;
        this.destroyList.forEach(fn => {
            try {
                fn();
            } catch (e) {
                console.error(e);
            }
        });
        this.destroyList.length = 0;
        this.children.forEach(cd => {
            cd.destroy();
        });
        this.children.length = 0;
    },
    once: function(fn) {
        this.root.onceList.push(fn);
    }
});


const compareArray = (a, b) => {
    let a0 = Array.isArray(a);
    let a1 = Array.isArray(b);
    if(a0 !== a1) return true;
    if(!a0) return a !== b;
    if(a.length !== b.length) return true;
    for(let i=0;i<a.length;i++) {
        if(a[i] !== b[i]) return true;
    }
    return false;
};

const compareDeep = (a, b, lvl) => {
    if(lvl < 0) return false;
    if(!a || !b) return a !== b;
    let o0 = typeof(a) == 'object';
    let o1 = typeof(b) == 'object';
    if(!(o0 && o1)) return a !== b;

    let a0 = Array.isArray(a);
    let a1 = Array.isArray(b);
    if(a0 !== a1) return true;

    if(a0) {
        if(a.length !== b.length) return false;
        for(let i=0;i<a.length;i++) {
            if(compareDeep(a[i], b[i], lvl-1)) return true;
        }
    } else {
        let set = {};
        for(let k in a) {
            if(compareDeep(a[k], b[k])) return true;
            set[k] = true;
        }
        for(let k in b) {
            if(set[k]) continue;
            return true;
        }
    }

    return false;
};

function cloneDeep(d, lvl) {
    if(lvl < 0) return;
    if(!d) return d;

    if(typeof(d) == 'object') {
        if(d instanceof Date) return d;
        if(Array.isArray(d)) return d.map(i => cloneDeep(t, lvl-1));
        let r = {};
        for(let k in d) r[k] = cloneDeep(d[k], lvl-1);
        return r;
    }
    return d;
};

function $digest($cd, onFinishLoop) {
    let loop = 10;
    let w;
    while(loop >= 0) {
        let changes = 0;
        let index = 0;
        let queue = [];
        let i, value, cd = $cd;
        while(cd) {
            for(i=0;i<cd.watchers.length;i++) {
                w = cd.watchers[i];
                value = w.fn();
                if(w.value !== value) {
                    if(w.a) {
                        if(compareArray(w.value, value)) {
                            if(Array.isArray(value)) w.value = value.slice();
                            else w.value = value;
                            if(!w.ro) changes++;
                            w.cb(w.value);
                        }
                    } else if(w.d) {
                        if(compareDeep(w.value, value, 10)) {
                            w.value = cloneDeep(value, 10);
                            if(!w.ro) changes++;
                            w.cb(w.value);
                        }
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
    onFinishLoop();
    let once = $cd.onceList;
    $cd.onceList = [];
    once.forEach(fn => {
        try {
            fn();
        } catch (e) {
            console.error(e);
        }
    });
    if(loop < 0) console.error('Infinity changes: ', w);
};

function $$htmlBlock($cd, tag, fn) {
    let lastElement;
    let create = (html) => {
        let fr = $$htmlToFragment(html);
        lastElement = fr.lastChild;
        tag.parentNode.insertBefore(fr, tag.nextSibling);
    };
    let destroy = () => {
        if(!lastElement) return;
        let next, el = tag.nextSibling;
        while(el) {
            next = el.nextSibling;
            el.remove();
            if(el == lastElement) break;
            el = next;
        }

        lastElement = null;
    };
    $watch($cd, fn, (html) => {
        destroy();
        if(html) create(html);
    }, {ro: true});
};

export {$$htmlToFragment, $$removeItem, $$childNodes, $watch, $ChangeDetector, $digest, $$htmlBlock};
