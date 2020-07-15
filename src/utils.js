
export function assert(x, info) {
    if(!x) throw info;
}

export function Q(s) {
    return s.replace(/`/g, '\\`');
};

export function Q2(s) {
    return s.replace(/`/g, '\\`').replace(/\n/g, '\\n');
};

export function arrIncludesX(a, arr=[]) {
  return arr.includes(a)
};