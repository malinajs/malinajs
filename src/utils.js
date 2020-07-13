
export function assert(x, info) {
    if(!x) throw info;
}

export function Q(s) {
    return s.replace(/`/g, '\\`');
};

export function arrIncludesX(a, arr=[]) {
  return arr.includes(a)
};