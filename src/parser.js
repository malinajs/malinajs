
export function assert (x, info) {
    if(!x) throw info;
}

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
            if(a === '>') {
                const voidTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
                let closedTag = source[index-1] == '/' || voidTags.indexOf(name) >= 0;
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
        while(true) {
            let a = readNext();
            // TODO: fix for '"`
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
                go(tag);
                continue;
            } else if(a === '{') {
                if(['#', '/', ':'].indexOf(source[index + 1]) >= 0) {
                    flushText();
                    let bind = readBinding();
                    if(bind.value.startsWith('#each ')) {
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
