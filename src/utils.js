
import acorn from 'acorn';

let _svgElements = 'animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,tspan,unknown,use,view';
let svgElements = {};
_svgElements.split(',').forEach(k => svgElements[k] = true);

export { svgElements };

export function assert(x, info) {
    if(!x) throw info || (new Error('AssertError'));
}

export function replace(s, from, to, count) {
    let d = s.split(from);
    if(count) assert(d.length === count + 1, 'Replace multi-entry');
    return d.join(to);
}

export function toCamelCase(name) {
    assert(name[name.length - 1] !== '-', 'Wrong name');
    return name.replace(/(\-\w)/g, function(part) {
        return part[1].toUpperCase();
    });
};

export function Q(s) {
    return s.replace(/`/g, '\\`');
};

export function Q2(s) {
    return s.replace(/`/g, '\\`').replace(/\n/g, '\\n');
};

export function unwrapExp(e) {
    assert(e, 'Empty expression');
    let rx = e.match(/^\{(.*)\}$/);
    assert(rx, 'Wrong expression: ' + e);
    return rx[1];
};

export function isSimpleName(name) {
    if(!name) return false;
    if(!name.match(/^([\w\$_][\w\d\$_\.]*)$/)) return false;
    if(name[name.length - 1] == '.') return false;
    return true;
}

export function detectExpressionType(name) {
    if(isSimpleName(name)) return 'identifier';

    let ast = acorn.parse(name, {allowReturnOutsideFunction: true});

    function checkIdentificator(body) {
        if(body.length != 1) return;
        if(body[0].type != 'ExpressionStatement') return;
        if(body[0].expression.type != 'Identifier') return;
        return true;
    }

    function checkMemberIdentificator(body) {
        if(body.length != 1) return;
        if(body[0].type != 'ExpressionStatement') return;
        let obj = body[0].expression;
        if(obj.type != 'MemberExpression') return;
        if(obj.property.type != 'Identifier') return;
        return true;
    }

    function checkFunction(body) {
        if(body.length != 1) return;
        if(body[0].type != 'ExpressionStatement') return;
        let obj = body[0].expression;
        if(obj.type != 'ArrowFunctionExpression') return;
        return true;
    }

    if(checkIdentificator(ast.body)) return 'identifier';
    if(checkMemberIdentificator(ast.body)) return 'identifier';
    if(checkFunction(ast.body)) return 'function';

    return;
};


export function checkRootName(name) {
    let rx = name.match(/^([\w\$_][\w\d\$_]*)/);
    if(!rx) return this.config.warning({message: 'Error name: ' + name});
    let root = rx[1];

    if(this.script.rootVariables[root] || this.script.rootFunctions[root]) return true;
    this.config.warning({message:'No name: ' + name});
};

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

        i = 0;
        while(i < body.length) {
            let node = body[i];
            if(node.type == 'text' && !node.value.trim()) {
                let prev = getPrev();
                let next = getNext();
                if(prev && next) {
                    if(prev.type == 'node' && next.type == 'node') {
                        if(prev.name == 'td' && next.name == 'td' ||
                            prev.name == 'tr' && next.name == 'tr' ||
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
                }
            }
            i++;
        }

    }

    go(data.body);
};

export const genId = () => {
    let id = Math.floor(Date.now() * Math.random()).toString(36);
    if(id.length > 6) id = id.substring(id.length - 6)
    return 'm' + id;
};
