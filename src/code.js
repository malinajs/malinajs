
import acorn from 'acorn';
import astring from 'astring';
import { assert } from './utils.js'


export function transformJS(code, option={}) {
    let result = {
        watchers: [],
        imports: [],
        props: []
    };
    var ast;
    if(code) {
        ast = acorn.parse(code, {sourceType: 'module'})
    } else {
        ast = {
            body: [],
            sourceType: "module",
            type: "Program"
        };
    }

    const funcTypes = {
        FunctionDeclaration: 1,
        FunctionExpression: 1,
        ArrowFunctionExpression: 1
    }

    function applyBlock() {
        return {
            type: 'ExpressionStatement',
            expression: {
                callee: {
                    type: 'Identifier',
                    name: '$$apply'
                },
                type: 'CallExpression'
            }
        }
    }

    function isInLoop(node) {
        if(!node._parent || node._parent.type != 'CallExpression') return false;
        if(node._parent.callee.type != 'MemberExpression') return false;
        let method = node._parent.callee.property.name;
        return method == 'forEach' || method == 'map' || method == 'filter';
    }

    function transformNode(node) {
        if(funcTypes[node.type] && node.body.body && node.body.body.length) {
            if(!isInLoop(node)) {
                node.body.body.unshift(applyBlock());
            }
        } else if(node.type == 'ArrowFunctionExpression') {
            if(node.body.type != 'BlockStatement' && !isInLoop(node)) {
                node.body = {
                    type: 'BlockStatement',
                    body: [{
                        type: 'ReturnStatement',
                        argument: node.body
                    }]
                };
                transformNode(node);
            }
        } else if(node.type == 'AwaitExpression') {
            if(node._parent && node._parent._parent && node._parent._parent._parent) {
                if(node._parent.type == 'ExpressionStatement' &&
                    node._parent._parent.type == 'BlockStatement' &&
                    node._parent._parent._parent.type == 'FunctionDeclaration' &&
                    node._parent._parent._parent.async) {
                        let list = node._parent._parent.body;
                        let i = list.indexOf(node._parent);
                        assert(i >= 0);
                        list.splice(i + 1, 0, applyBlock());
                    }
            }
        }
    };

    function walk(node, parent) {
        if(typeof node !== 'object') return;

        node._parent = parent;
        let forParent = parent;
        if(node.type) {
            transformNode(node);
            forParent = node;
        }
        for(let key in node) {
            let child = node[key];
            if(key == '_parent') continue;
            if(!child || typeof child !== 'object') continue;

            if(Array.isArray(child)) {
                child.forEach(i => walk(i, forParent));
            } else {
                walk(child, forParent);
            }
        }
    };
    walk(ast, null);


    function makeVariable(name) {
        return {
            "type": "VariableDeclaration",
            "declarations": [{
                "type": "VariableDeclarator",
                "id": {
                    "type": "Identifier",
                    "name": name
                },
                "init": null
            }],
            "kind": "var"
        }
    }

    function makeWatch(n) {
        function assertExpression(n) {
            if(n.type == 'Identifier') return;
            if(n.type.endsWith('Expression')) return;
            throw 'Wrong expression';
        };

        if(n.body.type != 'ExpressionStatement') throw 'Error';
        if(n.body.expression.type == 'AssignmentExpression') {
            const ex = n.body.expression;
            if(ex.operator != '=') throw 'Error';
            let target;
            if(ex.left.type == 'Identifier') {
                target = ex.left.name;
                if(!(target in rootVariables)) resultBody.push(makeVariable(target));
            } else if(ex.left.type == 'MemberExpression') {
                target = code.substring(ex.left.start, ex.left.end);
            } else throw 'Error';
            assertExpression(ex.right);
            const exp = code.substring(ex.right.start, ex.right.end);
            result.watchers.push(`$watch($cd, () => (${exp}), ($value) => {${target}=$value;}, {cmp: $$compareArray});`);
        } else if(n.body.expression.type == 'SequenceExpression') {
            const ex = n.body.expression.expressions;
            const handler = ex[ex.length - 1];
            if(['ArrowFunctionExpression', "FunctionExpression"].indexOf(handler.type) < 0) throw 'Error function';
            let callback = code.substring(handler.start, handler.end);

            if(ex.length == 2) {
                assertExpression(ex[0]);
                let exp = code.substring(ex[0].start, ex[0].end);
                result.watchers.push(`$watch($cd, () => (${exp}), ${callback});`);
            } else if(ex.length > 2) {
                for(let i = 0;i<ex.length-1;i++) assertExpression(ex[i]);
                let exp = code.substring(ex[0].start, ex[ex.length-2].end);
                result.watchers.push(`$watch($cd, () => [${exp}], ($args) => { (${callback}).apply(null, $args); }, {cmp: $$compareArray});`);
            } else throw 'Error';
        } else throw 'Error';
    }

    let imports = [];
    let resultBody = [];
    let rootVariables = {};
    ast.body.forEach(n => {
        if(n.type !== 'VariableDeclaration') return;
        n.declarations.forEach(i => rootVariables[i.id.name] = true);
    });

    ast.body.forEach(n => {
        if(n.type == 'ImportDeclaration') {
            imports.push(n);
            n.specifiers.forEach(s => {
                if(s.type != 'ImportDefaultSpecifier') return;
                if(s.local.type != 'Identifier') return;
                result.imports.push(s.local.name);
            });
            return;
        } else if(n.type == 'ExportNamedDeclaration') {
            assert(n.declaration.type == 'VariableDeclaration', 'Wrong export');
            let forInit = [];
            n.declaration.declarations.forEach(d => {
                assert(d.type == 'VariableDeclarator', 'Wrong export');
                result.props.push(d.id.name);
                forInit.push(d.id.name);
            });
            resultBody.push(n.declaration);
            forInit.forEach(n => {
                resultBody.push(initProp(n));
            });
            return;
        }

        if(n.type == 'FunctionDeclaration' && n.id.name == 'onMount') result.onMount = true;
        if(n.type == 'FunctionDeclaration' && n.id.name == 'onDestroy') result.onDestroy = true;
        if(n.type == 'LabeledStatement' && n.label.name == '$') {
            try {
                makeWatch(n);
                return;
            } catch (e) {
                throw new Error(e + ': ' + code.substring(n.start, n.end));
            }
        }
        resultBody.push(n);
    });

    resultBody.push({
        type: 'ExpressionStatement',
        expression: {
            callee: {
                type: 'Identifier',
                name: '$$runtime'
            },
            type: 'CallExpression'
        }
    });

    resultBody.unshift({
        type: 'IfStatement',
        test: {
            type: 'UnaryExpression',
            operator: '!',
            prefix: true,
            argument: {
                type: 'MemberExpression',
                object: {
                    type: 'Identifier',
                    name: '$option'
                },
                property: {
                    type: 'Identifier',
                    name: 'props'
                }
            }
        },
        consequent: {
            type: 'ExpressionStatement',
            expression: {
                type: 'AssignmentExpression',
                operator: '=',
                left: {
                    type: 'MemberExpression',
                    object: {
                        type: 'Identifier',
                        name: '$option'
                    },
                    property: {
                        type: 'Identifier',
                        name: 'props'
                    }
                },
                right: {
                    type: 'ObjectExpression',
                    properties: []
                }
            }
        }
    });
    resultBody.unshift({
        type: 'IfStatement',
        test: {
            type: 'BinaryExpression',
            left: {type: 'Identifier', name: '$option'},
            operator: '==',
            right: {type: 'Literal', value: null}
        },
        consequent: {
            type: 'ExpressionStatement',
            expression: {
                type: 'AssignmentExpression',
                operator: '=',
                left: {type: 'Identifier', name: '$option'},
                right: {type: 'ObjectExpression', properties: []}
            }
        }
    });
    let widgetFunc = {
        body: {
            type: 'BlockStatement',
            body: resultBody
        },
        id: {
            type: 'Identifier"',
            name: option.name
        },
        params: [{
            type: 'Identifier',
            name: '$element'
        }, {
            type: 'Identifier',
            name: '$option'
        }],
        type: 'FunctionDeclaration'
    };

    if(option.exportDefault) {
        widgetFunc = {
            type: 'ExportDefaultDeclaration',
            declaration: widgetFunc
        }
    };

    ast.body = [widgetFunc];
    ast.body.unshift.apply(ast.body, imports);

    result.code = astring.generate(ast);
    return result;
}


function initProp(name) {
    return {
        type: "IfStatement",
        test: {
            type: "BinaryExpression",
            left: {
                type: "Literal",
                value: name
            },
            operator: "in",
            right: {
                type: "MemberExpression",
                object: {
                    type: "Identifier",
                    name: "$option"
                },
                property: {
                    type: "Identifier",
                    name: "props"
                },
                computed: false
            }
        },
        consequent: {
            type: "ExpressionStatement",
            expression: {
                type: "AssignmentExpression",
                operator: "=",
                left: {
                    type: "Identifier",
                    name: name
                },
                right: {
                    type: "MemberExpression",
                    object: {
                        type: "MemberExpression",
                        object: {
                            type: "Identifier",
                            name: "$option"
                        },
                        property: {
                            type: "Identifier",
                            name: "props"
                        },
                        computed: false
                    },
                    property: {
                        type: "Identifier",
                        name: name
                    },
                    computed: false
                }
            }
        },
        alternate: null
    };
}