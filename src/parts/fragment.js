
import { assert, isSimpleName, unwrapExp, detectExpressionType, xNode } from "../utils";


export function makeFragment(node) {
    let rx = node.value.match(/#fragment\:(\S+)(.*)$/);
    assert(rx);
    let name = rx[1];
    let args = rx[2] ? rx[2].trim() : null;

    const source = xNode('function', {
        name: `$fragment_${name}`,
        args: ['$cd, label, $option']
    });
    source.push(`let $$args = $option.args;`);

    assert(isSimpleName(name));
    if(args) {
        args = args.split(/\s*,\s*/);
        args.forEach(name => {
            assert(isSimpleName(name));
            source.push(xNode('block', {name}, (ctx, data) => {
                let name = data.name;
                ctx.writeLine(`let ${name};`);
                ctx.writeLine(`if($$args.${name} != null) {`);
                ctx.indent++;
                ctx.writeLine(`if(typeof $$args.${name} == 'function') {`);
                ctx.indent++;
                ctx.writeLine(`$cd.prefix.push(() => {${name} = $$args.${name}()});`);
                ctx.indent--;
                ctx.writeLine(`} else ${name} = $$args.${name};`);
                ctx.indent--;
                ctx.writeLine(`}`);
            }));
        });
    }

    let block;
    if(node.body && node.body.length) block = this.buildBlock(node)
    else {
        this.option.warning(`Empty fragment: '${node.value}'`);
        return {source: `function $fragment_${name}() {};`};
    }

    source.push(xNode('template', {
        name: '$tpl',
        body: block.tpl,
        svg: block.svg
    }));

    source.push(xNode('block', {
        source: block.source,
        name: block.name
    }, (ctx, data) => {
        if(!data.source) return;
        data.source.handler(ctx, data.source);
        ctx.writeLine(`${data.name}($cd, $tpl);`);
    }));
    source.push(`$runtime.insertBefore(label, $tpl, label.nextSibling);`);

    return {source};
}


export function attachFragment(node, elementName) {
    const source = xNode('block', {scope: true});
    source.push(`let args = {};`);
    source.push(`let events = {};`);
    let name = node.elArg;
    assert(isSimpleName(name));

    node.attributes.forEach(prop => {
        let name = prop.name;
        let value = prop.value;

        if(name[0] == '@' || name.startsWith('on:')) {
            if(name[0] == '@') name = name.substring(1);
            else name = name.substring(3);

            if(name == '@') {
                source.push(`events = $option.events;`)
                return;
            }

            let args = name.split(':');
            name = args.shift();
            assert(isSimpleName(name));

            let exp, handler, isFunc;
            if(value) exp = unwrapExp(value);
            else {
                if(args.length) handler = args.pop();
                else {
                    source.push(`events.${name} = $option.events.${name};`);
                    return;
                }
            }
            assert(!handler ^ !exp, prop.content);
            this.detectDependency(exp || handler);

            if(exp) {
                let type = detectExpressionType(exp);
                if(type == 'identifier') {
                    handler = exp;
                    exp = null;
                } else {
                    isFunc = (type == 'function');
                }
            }

            let callback;
            if(isFunc) {
                callback = exp;
            } else if(handler) {
                this.checkRootName(handler);
                callback = handler;
            } else {
                callback = `($event) => {${this.Q(exp)}}`;
            }
            source.push(`events.${name} = ${callback};`);
        } else {
            if(name[0] == '{') {
                assert(!value);
                value = name;
                name = unwrapExp(name);
            }

            assert(isSimpleName(name));
            assert(value);
            if(value.indexOf('{') >= 0) {
                let exp = unwrapExp(value);
                this.detectDependency(exp);
                source.push(`args.${name} = () => (${exp});`);
            } else {
                source.push(`args.${name} = \`${this.Q(value)}\`;`);
            }
        }

    });

    source.push(`$fragment_${name}($cd, ${elementName}, {args, events});`);
    return {source};
};
