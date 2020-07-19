
import acorn from 'acorn';


export function assert(x, info) {
    if(!x) throw info || 'AssertError';
}

export function Q(s) {
    return s.replace(/`/g, '\\`');
};

export function Q2(s) {
    return s.replace(/`/g, '\\`').replace(/\n/g, '\\n');
};

export function isSimpleName(name) {
    return !!name.match(/^([\w\$_][\w\d\$_]*)$/);
}

export function detectExpressionType(name) {
    if(isSimpleName(name)) return 'identifier';

    let ast = acorn.parse(name);

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
