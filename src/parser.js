
import { assert, Q } from './utils.js'


export function parse(source) {
    let index = 0;

    const readNext = () => {
        assert(index < source.length, 'EOF');
        return source[index++];
    }

    const readTag = () => {
        let start = index;
        let a = readNext();
        assert(a === '<', 'Tag error');
        let q = null;
        let begin = true;
        let name = '';
        while(true) {
            a = readNext();
            if(q) {
                if(a != q) continue;
                q = null;
                continue
            }
            if(a === '"') {
                q = '"';
                continue;
            }
            if(a === '\'') {
                q = '\'';
                continue;
            }
            if(a === '<') {
                let e = new Error('Wrong tag');
                e.details = source.substring(start, index);
                throw e;
            }
            if(a === '>') {
                const voidTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
                // source[index-2] == '/'
                let closedTag = voidTags.indexOf(name) >= 0;
                return {
                    type: 'node',
                    name: name,
                    openTag: source.substring(start, index),
                    start: start,
                    end: index,
                    closedTag: closedTag
                }
            }
            if(begin) {
                if(a.match(/[\da-zA-Z]/)) {
                    name += a;
                    continue;
                } else begin = false;
            }
        }
    };

    const readScript = (tag) => {
        let endTag = `</${tag}>`;
        let q, a, p, start = index;
        while(true) {
            p = a;
            a = readNext();
            if(q) {
                if(a != q) continue;
                if(p == '\\') continue;
                q = null;
                continue
            }
            if(a == '"' || a == '\'' || a == '`') {
                q = a;
                continue;
            }
            if(a == '<') {
                if(source.substring(index-1, index + endTag.length - 1) == endTag) {
                    let end = index - 1;
                    index += endTag.length - 1;
                    return source.substring(start, end);
                }
            }
        }
    };

    const readStyle = () => {
        let start = index;
        let end = source.substring(start).indexOf('</style>') + start;
        assert(end >= 0, '<style> is not closed')
        index = end + 9;
        return source.substring(start, end);
    };

    const readBinding = () => {
        let start = index;
        assert(readNext() === '{', 'Bind error');
        let p, q;
        while(true) {
            let a = readNext();

            if(q) {
                if(a != q) continue;
                if(p == '\\') continue;
                q = null;
                continue
            }
            if(a == '"' || a == '\'' || a == '`') {
                q = a;
                continue;
            }

            if(a == '{') throw 'Error binding: ' + source.substring(start, index);
            if(a != '}') continue;

            return {
                value: source.substring(start + 1, index - 1)
            };
        }
    };

    const readComment = () => {
        let start = index;
        let end = source.indexOf('-->', start);
        assert(end >= 0, 'Comment is not closed');
        end += 3;
        index = end;
        return source.substring(start, end);
    };

    const go = (parent) => {
        let textNode = null;

        const flushText = () => {
            if(!textNode) return;
            parent.body.push(textNode);
            textNode = null;
        }

        while(index < source.length) {
            let a = source[index];
            if(a === '<') {
                flushText();

                if(source.substring(index, index + 4) === '<!--') {
                    parent.body.push({
                        type: 'comment',
                        content: readComment()
                    });
                    continue;
                }

                if(source[index + 1] === '/') {  // close tag
                    let name = '';
                    index += 2;
                    while(true) {
                        a = readNext();
                        if(a === '>') break;
                        name += a;
                    }
                    assert(name === parent.name, 'Wrong close-tag: ' + parent.name + ' - ' + name);
                    return;
                }

                let tag = readTag();
                parent.body.push(tag);
                if(tag.name === 'script') {
                    tag.type = 'script';
                    tag.content = readScript('script');
                    continue;
                } else if(tag.name === 'template') {
                    tag.type = 'template';
                    tag.content = readScript('template');
                    continue;
                } else if(tag.name === 'style') {
                    tag.type = 'style';
                    tag.content = readStyle();
                    continue;
                };
                if(tag.closedTag) continue;

                tag.body = [];
                try {
                    go(tag);
                } catch (e) {
                    if(typeof e == 'string') e = new Error(e);
                    if(!e.details) e.details = tag.openTag;
                    throw e;
                }
                continue;
            } else if(a === '{') {
                if(['#', '/', ':', '@'].indexOf(source[index + 1]) >= 0) {
                    flushText();
                    let bind = readBinding();
                    if(bind.value.match(/^@\w+/)) {
                        let tag = {
                            type: 'systag',
                            value: bind.value
                        };
                        parent.body.push(tag);
                        continue;
                    } else if(bind.value.startsWith('#each ')) {
                        let tag = {
                            type: 'each',
                            value: bind.value,
                            body: []
                        };
                        parent.body.push(tag);
                        go(tag);
                        continue;
                    } else if(bind.value === '/each') {
                        assert(parent.type === 'each', 'Bind error: /each');
                        return;
                    } else if(bind.value.startsWith('#if ')) {
                        let tag = {
                            type: 'if',
                            value: bind.value,
                            body: []
                        };
                        parent.body.push(tag);
                        go(tag);
                        continue;
                    } else if(bind.value === '/if') {
                        assert(parent.type === 'if', 'Bind error: /if');
                        return;
                    } else if(bind.value === ':else') {
                        assert(parent.type === 'if', 'Bind error: :else');
                        parent.bodyMain = parent.body;
                        parent.body = [];
                    } else throw 'Error binding: ' + bind.value;
                }
            }

            if(!textNode) {
                textNode = {
                    type: 'text',
                    value: ''
                }
            }
            textNode.value += readNext();
        };
        flushText();
        assert(parent.type === 'root', 'File ends to early')
    };

    let root = {
        type: 'root',
        body: []
    };
    go(root);


    return root;
};


export function parseElement(source) {
    // TODO: parse '/>' at the end
    let len = source.length - 1;
    assert(source[0] === '<');
    assert(source[len] === '>');
    if(source[len - 1] == '/') len--;

    let index = 1;
    let start = 1;
    let eq;
    let result = [];
    let first = true;

    const next = () => {
        assert(index < source.length, 'EOF');
        return source[index++];
    }
    const flush = (shift) => {
        if(index <= start) return;
        if(first) {
            first = false;
            return;
        }
        let prop = {
            content: source.substring(start, index + shift)
        }
        if(eq) {
            prop.name = source.substring(start, eq - 1);
            prop.value = source.substring(eq, index + shift);
            eq = null;
        } else prop.name = prop.content;
        result.push(prop);
    };

    let bind = false;

    while(index < len) {
        let a = next();

        if(a === '"' || a === "'") {
            while(a != next());
            continue;
        }

        if(bind) {
            bind = a != '}';
            continue;
        }

        if(a == '{') {
            bind = true;
            continue;
        }

        if(a.match(/^\s$/)) {
            flush(-1);
            start = index;
            continue;
        }
        if(a == '=' && !eq) {
            eq = index;
        }
    }
    flush(0);
    return result;
};


export function parseText(source, quotes) {
    let i = 0;
    let step = 0;
    let text = '';
    let exp = '';
    let result = [];
    let q;
    let len = source.length;
    if(quotes) {
        if(source[0] === '{') quotes = false;
        else {
            i++;
            len--;
            quotes = source[0];
            assert(quotes === source[len], source);
        }
    }
    while(i < len) {
        let a = source[i++];
        if(step == 1) {
            if(q) {
                if(a === q) q = null;
                exp += a;
                continue;
            }
            if(a === '"' || a === "'") {
                q = a;
                exp += a;
                continue;
            }
            if(a === '}') {
                step = 0;
                exp = exp.trim();
                if(!exp) throw 'Wrong expression';
                result.push('(' + exp + ')');
                exp = '';
                continue;
            }
            exp += a;
            continue;
        }
        if(a === '{') {
            if(text) {
                result.push('`' + Q(text) + '`');
                text = '';
            }
            step = 1;
            continue;
        }
        text += a;
    }
    if(text) result.push('`' + Q(text) + '`');
    assert(step == 0, 'Wrong expression: ' + source);
    return result.join('+');
};
