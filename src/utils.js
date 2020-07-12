export function assert(x, info) {
    if (!x) throw info;
}

export function Q(s) {
    return s.replace(/`/g, '\\`');
}
