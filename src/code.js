
import acorn from 'acorn';
import astring from 'astring';


export function transformJS(code, option={}) {
    let result = {watchers: []};
    var ast = acorn.parse(code, { ecmaVersion: 6 })

    const funcTypes = {
        FunctionDeclaration: 1,
        FunctionExpression: 1,
        ArrowFunctionExpression: 1
    }

    const fix = (node) => {
        if(funcTypes[node.type] && node.body.body && node.body.body.length) {
            node.body.body.unshift({
                type: 'ExpressionStatement',
                expression: {
                    callee: {
                        type: 'Identifier',
                        name: '$$apply'
                    },
                    type: 'CallExpression'
                }
            });
        }
    }

    const transform = function(node) {
        const x = 0;
        for(let key in node) {
            let value = node[key];
            if(typeof value === 'object') {
                if(Array.isArray(value)) {
                    value.forEach(transform);
                } else if(value && value.type) {
                    transform(value);
                }
            }
        }
        fix(node);
    };
    
    transform(ast.body);

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
            if(ex.left.type != 'Identifier') throw 'Error';
            const target = ex.left.name;

            assertExpression(ex.right);
            const exp = code.substring(ex.right.start, ex.right.end);
            result.watchers.push(`$watch($cd, () => (${exp}), ($value) => {${target}=$value;});`);
        } else if(n.body.expression.type == 'SequenceExpression') {
            const ex = n.body.expression.expressions;
            if(ex.length != 2) throw 'Error';
    
            assertExpression(ex[0]);
            if(!ex[0].type.endsWith('Expression') && ex[0].type != 'Identifier') throw 'Wrong expression';
            let exp = code.substring(ex[0].start, ex[0].end);
    
            if(['ArrowFunctionExpression', "FunctionExpression"].indexOf(ex[1].type) < 0) throw 'Error function';
            let callback = code.substring(ex[1].start, ex[1].end);
    
            result.watchers.push(`$watch($cd, () => (${exp}), ${callback});`);
        } else throw 'Error';
    }

    let resultBody = [];
    ast.body.forEach(n => {
        if(n.type == 'FunctionDeclaration' && n.id.name == 'onMount') result.$onMount = true;
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
    ast.body = resultBody;

    ast.body.push({
        type: 'ExpressionStatement',
        expression: {
            callee: {
                type: 'Identifier',
                name: '$$runtime'
            },
            type: 'CallExpression'
        }
    });
    
    ast.body = [{
        body: {
            type: 'BlockStatement',
            body: ast.body
        },
        id: {
            type: 'Identifier"',
            name: option.name
        },
        params: [{
            type: 'Identifier',
            name: '$element'
        }],
        type: 'FunctionDeclaration'
    }];
    
    result.code = astring.generate(ast);
    return result;
}
