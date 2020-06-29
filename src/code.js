
import acorn from 'acorn';
import astring from 'astring';


export function transformJS(code, option={}) {
    let result = {};
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

    ast.body.forEach(n => {
        if(n.type != 'FunctionDeclaration') return;
        if(n.id.name != 'onMount') return;
        result.$onMount = true;
    });

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
