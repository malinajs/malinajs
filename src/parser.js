
import { assert } from './utils.js'


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
        let attributes = [];
        let begin = true;
        let name = '';
        let bind;
        let eq, attr_start;

        function flush(shift) {
            if(!attr_start) return;
            shift = shift || 0;
            let end = index - 1 + shift;
            let a = {
                content: source.substring(attr_start, end)
            };
            if(eq) {
                a.name = source.substring(attr_start, eq);
                a.value = source.substring(eq + 1, end);
                if(a.value[0] == '"' || a.value[0] == '"') a.value = a.value.substring(1);
                let i = a.value.length - 1;
                if(a.value[i] == '"' || a.value[i] == '"') a.value = a.value.substring(0, i);
            } else a.name = a.content;
            attributes.push(a);
            attr_start = null;
            eq = null;
        };

        while(true) {
            a = readNext();
            if(!begin && !attr_start && a.match(/\S/) && a != '/') attr_start = index - 1;
            if(a == '"' || a == "'") {
                while(a != readNext());
                continue;
            }
            if(bind) {
                if(a == '}') {
                    bind = false;
                    flush(1);
                }
                continue;
            }
            if(a == '{') {
                bind = true;
                continue;
            }
            if(a == '<') {
                let e = new Error('Wrong tag');
                e.details = source.substring(start, index);
                throw e;
            }
            if(a == '/') {
                a = readNext();
                assert(a == '>');
                flush(-1);
            }
            if(a == '>') {
                flush();
                const voidTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
                let voidTag = voidTags.indexOf(name) >= 0;
                let closedTag = voidTag;
                if(!closedTag && source[index-2] == '/') {
                    if(name.match(/^[A-Z]/)) closedTag = true;
                    else if(name == 'slot' || name.match(/^slot\:\S/)) closedTag = true;
                }
                return {
                    type: 'node',
                    name: name,
                    openTag: source.substring(start, index),
                    start: start,
                    end: index,
                    closedTag,
                    voidTag,
                    attributes
                }
            }
            if(begin) {
                if(a.match(/[\da-zA-Z\:]/)) {
                    name += a;
                    continue;
                } else begin = false;
            } else if(attr_start) {
                if(a == '=' && !eq) eq = index - 1;
                else if(a.match(/\s/)) flush();
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
                    } else if(bind.value.startsWith('#await ')) {
                        let mainPart = [];
                        let tag = {
                            type: 'await',
                            value: bind.value,
                            body: mainPart,
                            parts: {
                                main: mainPart,
                                mainValue: bind.value
                            }
                        };
                        parent.body.push(tag);
                        go(tag);
                        continue;
                    } else if(bind.value.match(/^\:then( |$)/)) {
                        assert(parent.type === 'await', 'Bind error: await-then');
                        let thenPart = [];
                        parent.parts.then = thenPart;
                        parent.parts.thenValue = bind.value;
                        parent.body = thenPart;
                    } else if(bind.value.match(/^\:catch( |$)/)) {
                        assert(parent.type === 'await', 'Bind error: await-catch');
                        let catchPart = [];
                        parent.parts.catch = catchPart;
                        parent.parts.catchValue = bind.value;
                        parent.body = catchPart;
                    } else if(bind.value == '/await') {
                        assert(parent.type === 'await', 'Bind error: /await');
                        return;
                    } else if(bind.value.match(/^\#slot(\:| |$)/)) {
                        let tag = {
                            type: 'slot',
                            value: bind.value,
                            body: []
                        };
                        parent.body.push(tag);
                        go(tag);
                        continue;
                    } else if(bind.value == '/slot') {
                        assert(parent.type === 'slot', 'Slot error: /slot');
                        return;
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


export function parseText(source) {
    let i = 0;
    let step = 0;
    let text = '';
    let exp = '';
    let result = [];
    let q;
    let len = source.length;
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
                result.push('`' + this.Q(text) + '`');
                text = '';
            }
            step = 1;
            continue;
        }
        text += a;
    }
    if(text) result.push('`' + this.Q(text) + '`');
    assert(step == 0, 'Wrong expression: ' + source);
    return result.join('+');
};
