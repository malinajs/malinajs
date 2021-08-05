
import { last } from './utils.js';


export function compactDOM() {
    let data = this.DOM;
    const details = {
        node: [n => n.body],
        each: [n => n.body],
        slot: [n => n.body],
        fragment: [n => n.body],
        if: [n => n.body, n => n.bodyMain],
        await: [n => n.parts.main, n => n.parts.then, n => n.parts.catch]
    }

    function go(body, parentNode) {
        let i;

        const getPrev = () => {
            return i > 0 && body.length ? body[i - 1] : null;
        }

        const getNext = () => {
            return i < body.length ? body[i + 1] : null;
        }

        for(i=0; i<body.length; i++) {
            let node = body[i];
            if(node.type == 'text') {
                let next = getNext();
                if(next && next.type == 'text') {
                    node.value += next.value;
                    body.splice(i + 1, 1);
                }

                if(node.value) {
                    if(!node.value.trim()) {
                        node.value = ' ';
                    } else {
                        let rx = node.value.match(/^(\s*)(.*?)(\s*)$/);
                        if(rx) {
                            let r = '';
                            if(rx[1]) r += ' ';
                            r += rx[2];
                            if(rx[3]) r += ' ';
                            node.value = r;
                        }
                    }
                }
            } else {
                if(node.type == 'node' && (node.name == 'pre' || node.name == 'textarea')) continue;
                let keys = details[node.type];
                keys && keys.forEach(k => {
                    let body = k(node);
                    if(body && body.length) go(body, node);
                })
            }
        }

        const isTable = n => ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'].includes(n.name);

        i = 0;
        while(i < body.length) {
            let node = body[i];
            if(node.type == 'text' && !node.value.trim()) {
                if(parentNode && (parentNode.name == 'table' || isTable(parentNode)) && (i == 0 || i == body.length -1)) {
                    body.splice(i, 1);
                    continue;
                }

                let prev = getPrev();
                let next = getNext();

                if(next?.type == 'node' && next.name == 'br') {
                    body.splice(i, 1);
                    continue;
                }

                if(prev?.type == 'node' && prev.name == 'br') {
                    body.splice(i, 1);
                    continue;
                }

                if(prev && next) {
                    if(prev.type == 'node' && next.type == 'node') {
                        if(isTable(prev) && isTable(next) ||
                            prev.name == 'li' && next.name == 'li' ||
                            prev.name == 'div' && next.name == 'div') {
                                body.splice(i, 1);
                                continue;
                            }
                    }
                } else if(parentNode) {
                    let p = prev && prev.type == 'node' && prev.name;
                    let n = next && next.type == 'node' && next.name;

                    if((p == 'td' || n == 'td') && ((parentNode.type == 'node' && parentNode.name == 'tr') || (parentNode.type == 'each'))) {
                        body.splice(i, 1);
                        continue;
                    }
                    if((p == 'tbody' || n == 'tbody') && (parentNode.type == 'node' && parentNode.name == 'table')) {
                        body.splice(i, 1);
                        continue;
                    }
                    if((p == 'li' || n == 'li') && (parentNode.type == 'node' && parentNode.name == 'ul')) {
                        body.splice(i, 1);
                        continue;
                    }
                    if(parentNode.type == 'node' && parentNode.name == 'div') {
                        body.splice(i, 1);
                        continue;
                    }
                    if(parentNode.type == 'node' && (prev && prev.type == 'each' || next && next.type == 'each')) {
                        body.splice(i, 1);
                        continue;
                    }
                    if(parentNode.type == 'node' && parentNode.name == 'button' && (!p || !n)) {
                        body.splice(i, 1);
                        continue;
                    }
                }
            }
            i++;
        }

    }

    function trimNodes(srcNodes) {
        let nodes = srcNodes.slice();
        let ex = [];
        while(nodes.length) {
            let n = nodes[0];
            if(n.type == 'fragment' || n.type == 'comment') {
                ex.push(n);
                nodes.shift();
                continue;
            }
            if(n.type == 'text' && !n.value.trim()) nodes.shift();
            else break;
        }
        nodes = [...ex, ...nodes];
        ex = [];
        while(nodes.length) {
            let n = last(nodes);
            if(n.type == 'fragment' || n.type == 'comment') {
                ex.push(n);
                nodes.pop();
                continue;
            }
            if(n.type == 'text' && !n.value.trim()) nodes.pop();
            else break;
        }
        return [...nodes, ...ex];
    }

    data.body = trimNodes(data.body);

    go(data.body);
};
