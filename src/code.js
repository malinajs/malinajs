
import acorn from 'acorn';
import astring from 'astring';
import { assert, replace, detectExpressionType } from './utils.js'


export function transformJS(code, config={}) {
    let result = {
        watchers: [],
        imports: [],
        importedNames: [],
        props: [],
        rootVariables: {},
        rootFunctions: {}
    };
    var ast;
    if(code) {
        code = code.split(/\n/).map(line => {
            let rx = line.match(/^(\s*)\/\/(.*)$/);
            if(!rx) return line;
            let code = rx[2].trim()
            if(code != '!no-check') return line;
            return rx[1] + '$$_noCheck;';
        }).join('\n');
        ast = acorn.parse(code, {sourceType: 'module', ecmaVersion: 12});
    } else {
        ast = {
            body: [],
            sourceType: "module",
            type: "Program"
        };
    }

    let rootVariables = result.rootVariables;
    let rootFunctions = result.rootFunctions;
    ast.body.forEach(n => {
        if(n.type == 'FunctionDeclaration') {
            rootFunctions[n.id.name] = true;
        } else if(n.type == 'VariableDeclaration') {
            n.declarations.forEach(i => {
                rootVariables[i.id.name] = true;
                if(i.init && i.init.type == 'ArrowFunctionExpression') rootFunctions[i.id.name] = true;
            });
        }
    });

    result.onMount = rootFunctions.onMount;
    result.onDestroy = rootFunctions.onDestroy;
    let insertOnDestroy = !(rootFunctions.$onDestroy || rootVariables.$onDestroy);

    const funcTypes = {
        FunctionDeclaration: 1,
        FunctionExpression: 1,
        ArrowFunctionExpression: 1
    }

    function applyBlock() {
        return {
            _apply: true,
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

    function returnApplyBlock(a) {
        return {
            _apply: true,
            callee: {
                type: 'Identifier',
                name: '$$apply'
            },
            type: 'CallExpression',
            arguments: [a]
        }
    }

    function isInLoop(node) {
        if(!node._parent || node._parent.type != 'CallExpression') return false;
        if(node._parent.callee.type != 'MemberExpression') return false;
        let method = node._parent.callee.property.name;
        return method == 'forEach' || method == 'map' || method == 'filter';
    }

    function isNoCheck(node) {
        return node.type == 'ExpressionStatement' && node.expression.type == 'Identifier' && node.expression.name == '$$_noCheck';
    };

    function transformNode(node) {
        if(funcTypes[node.type] && node.body.body && node.body.body.length) {
            if(insertOnDestroy && node._parent.type == 'CallExpression' && node._parent.callee.name == '$onDestroy') return 'stop';
            for(let i=0; i<node.body.body.length; i++) {
                let n = node.body.body[i];
                if(!isNoCheck(n)) continue;
                node.body.body.splice(i, 1);
                return 'stop';
            }
            if(!isInLoop(node)) {
                node.body.body.unshift(applyBlock());
            }
        } else if(node.type == 'ArrowFunctionExpression') {
            if(insertOnDestroy && node._parent.type == 'CallExpression' && node._parent.callee.name == '$onDestroy') return 'stop';
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
            let n = node, p;
            while(n._parent) {
                p = n._parent;
                if(p.type == 'BlockStatement') break;
                n = p;
                p = null;
            }
            if(p) {
                let i = p.body.indexOf(n);
                if(i >= 0 && !(p.body[i + 1] && p.body[i + 1]._apply)) {
                    if(n.type == 'ReturnStatement') {
                        n.argument = returnApplyBlock(n.argument);
                    } else {
                        p.body.splice(i + 1, 0, applyBlock());
                    }
                }
            }
        }
    };

    function walk(node, parent, fn) {
        if(typeof node !== 'object') return;

        if(node._apply) return;
        node._parent = parent;
        let forParent = parent;
        if(node.type) {
            if(fn(node) == 'stop') return;
            forParent = node;
        }
        for(let key in node) {
            let child = node[key];
            if(key == '_parent') continue;
            if(!child || typeof child !== 'object') continue;

            if(Array.isArray(child)) {
                for(let i=0;i<child.length;i++) {
                    walk(child[i], forParent, fn);
                }
            } else {
                walk(child, forParent, fn);
            }
        }
    };
    walk(ast, null, transformNode);

    // temporary fix for ImportExpression
    function fixImportExpression(node) {
        if(node.type != 'ImportExpression') return;
        node.type = 'CallExpression';
        node.callee = {
            type: 'Identifier',
            name: '$$fixImport'
        };
        node.arguments = [node.source];
        delete node.source;
    };
    walk(ast, null, fixImportExpression)

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
            result.watchers.push(`$cd.prefix.push(() => {${target} = ${exp};});`);
        } else if(n.body.expression.type == 'SequenceExpression') {
            const ex = n.body.expression.expressions;
            const handler = ex[ex.length - 1];
            let callback = code.substring(handler.start, handler.end);
            if(handler.type == 'ArrowFunctionExpression' || handler.type == 'FunctionExpression') {
                // default
            } else if(detectExpressionType(callback) == 'identifier') {
                callback = `(v) => { ${callback}(v); }`;
            } else {
                callback = `() => { ${callback}; }`;
            }

            if(ex.length == 2) {
                assertExpression(ex[0]);
                let exp = code.substring(ex[0].start, ex[0].end);
                result.watchers.push(`$watch($cd, () => (${exp}), ${callback}, {cmp: $runtime.$$deepComparator(0)});`);
            } else if(ex.length > 2) {
                for(let i = 0;i<ex.length-1;i++) assertExpression(ex[i]);
                let exp = code.substring(ex[0].start, ex[ex.length-2].end);
                result.watchers.push(`$watch($cd, () => [${exp}], ($args) => { (${callback}).apply(null, $args); }, {cmp: $runtime.$$deepComparator(1)});`);
            } else throw 'Error';
        } else throw 'Error';
    }

    let imports = [];
    let resultBody = [];
    let lastPropIndex = null;

    ast.body.forEach(n => {
        if(n.type == 'ImportDeclaration') {
            imports.push(n);
            n.specifiers.forEach(s => {
                if(s.local.type != 'Identifier') return;
                result.importedNames.push(s.local.name);
                if(s.type != 'ImportDefaultSpecifier') return;
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
                resultBody.push(parseExp(`$runtime.$$makeProp($component, $props, $option.boundProps || {}, '${n}', () => ${n}, _${n} => {${n} = _${n}; $$apply();})`));
                lastPropIndex = resultBody.length;
            });
            return;
        }

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

    let header = [];
    header.push(parseExp('if(!$option) $option = {}'));
    header.push(parseExp('if(!$option.events) $option.events = {}'));
    header.push(parseExp('$$runtimeHeader()'));
    header.push(parseExp('const $props = $option.props || {}'));
    header.push(parseExp('const $component = $runtime.$$makeComponent($element, $option);'));
    header.push(parseExp('const $$apply = $runtime.$$makeApply($component.$cd)'));
    header.push(parseExp('let $class = $option.$class'));

    if(lastPropIndex != null) {
        resultBody.splice(lastPropIndex, 0, parseExp('let $attributes = $runtime.$$componentCompleteProps($component, $$apply, $props)'));
    } else {
        header.push(parseExp('$component.push = $$apply'));
        header.push(parseExp('const $attributes = $props'));
    }

    if(config.autoSubscribe) {
        result.importedNames.forEach(name => {
            header.push(parseExp(`$runtime.autoSubscribe($component.$cd, $$apply, ${name})`));
        });
    }

    if(!rootFunctions.$emit) header.push(parseExp('const $emit = $runtime.$makeEmitter($option)'));
    if(insertOnDestroy) header.push(parseExp('function $onDestroy(fn) {$runtime.cd_onDestroy($component.$cd, fn);}'));
    while(header.length) {
        resultBody.unshift(header.pop());
    }

    let widgetFunc = {
        body: {
            type: 'BlockStatement',
            body: resultBody
        },
        id: {
            type: 'Identifier"',
            name: config.name
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

    if(config.exportDefault) {
        widgetFunc = {
            type: 'ExportDefaultDeclaration',
            declaration: widgetFunc
        }
    };

    ast.body = [widgetFunc];
    ast.body.unshift.apply(ast.body, imports);

    result.code = astring.generate(ast);
    result.code = replace(result.code, '$$fixImport', 'import');
    return result;
}


function parseExp(exp) {
    let ast = acorn.parse(exp);
    assert(ast.body.length == 1);
    return ast.body[0];
}