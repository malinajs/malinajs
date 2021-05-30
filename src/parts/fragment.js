
import { assert, isSimpleName, unwrapExp, detectExpressionType, xNode, toCamelCase } from "../utils";


export function makeFragment(node) {
    let rx = node.value.match(/#fragment\:(\S+)(.*)$/);
    assert(rx);
    let name = rx[1];
    assert(isSimpleName(name));
    let props = rx[2] ? rx[2].trim() : null;
    if(props) props = props.split(/\s*,\s*/);

    let block;
    if(node.body && node.body.length) block = this.buildBlock(node, {inline: true});
    else {
        this.warning(`Empty fragment: '${node.value}'`);
        return xNode('empty-fragment', {name}, (ctx, n) => {
            ctx.writeLine(`function $fragment_${n.name}() {};`);
        });
    }

    return xNode('fragment', {
        name,
        props,
        source: block.source,
        template: xNode('template', {
            name: '$parentElement',
            body: block.tpl,
            svg: block.svg
        })
    }, (ctx, n) => {
        ctx.writeLine(`function $fragment_${n.name}($cd, label, $option={}) {`);
        ctx.indent++;

        if(n.props) {
            if(ctx.inuse.apply) {
                ctx.writeLine('let ' + n.props.join(', ') + ';');
                ctx.writeLine(`$option.props && $cd.prefix.push(() => ({${n.props.join(', ')}} = $option.props()));`);
            } else {
                ctx.writeLine('let ' + n.props.join(', ') + ';');
                ctx.writeLine(`$option.props && ({${n.props.join(', ')}} = $option.props());`);
            }
        }

        ctx.build(n.template);
        ctx.build(n.source);
        ctx.writeLine(`$runtime.insertBefore(label, $parentElement, label.nextSibling);`);

        ctx.indent--;
        ctx.writeLine('}');
    });
}


export function attachFragment(node, element) {
    let name = node.elArg;
    assert(isSimpleName(name));

    let props = [];
    let events = [];
    let forwardAllEvents;

    node.attributes.forEach(prop => {
        let name = prop.name;
        let value = prop.value;

        if(name[0] == '@' || name.startsWith('on:')) {
            if(name[0] == '@') name = name.substring(1);
            else name = name.substring(3);

            if(name == '@') {
                forwardAllEvents = true;
                return;
            }

            if(name[0] == '@') {
                name = name.substring(1);
                return events.push({
                    name,
                    callback: `$option.events?.${name}`
                });
            }

            let args = name.split(':');
            name = args.shift();
            assert(isSimpleName(name));

            let exp, handler, isFunc;
            if(value) exp = unwrapExp(value);
            else {
                if(args.length) handler = args.pop();
                else handler = name;
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
            events.push({name, callback});
        } else {
            if(name[0] == '{') {
                assert(!value);
                value = name;
                name = unwrapExp(name);
            } else name = toCamelCase(name);

            assert(isSimpleName(name));
            assert(value);
            if(value.indexOf('{') >= 0) {
                let exp = unwrapExp(value);
                this.detectDependency(exp);
                props.push({name, exp});
            } else {
                props.push({name, exp: '`' + this.Q(value) + '`'});
            }
        }
    });

    this.require('$cd');

    return xNode('call-fragment', {
        forwardAllEvents,
        el: element.bindName(),
        name,
        events,
        props
    }, (ctx, n) => {
        ctx.write(true, `$fragment_${n.name}($cd, ${n.el}`);
        if(n.props.length || n.events.length) {
            ctx.write(`, {\n`);
            ctx.indent++;

            if(n.props.length) {
                ctx.write(true, 'props: () => ({');
                n.props.forEach((p, i) => {
                    if(i) ctx.write(', ');
                    ctx.write(`${p.name}: ${p.exp}`);
                })
                ctx.write('})');
            }

            if(n.forwardAllEvents) {
                if(n.events.length) this.warning(`Fragment: mixing binding and forwarding is not supported:: '${node.openTag}'`);
                if(n.props.length) ctx.write(',\n');
                ctx.write(true, 'events: $option.events');
            } else if(n.events.length) {
                if(n.props.length) ctx.write(',\n');
                ctx.write(true, 'events: {');
                n.events.forEach((e, i) => {
                    if(i) ctx.write(', ');
                    if(e.name == e.callback) ctx.write(`${e.name}`);
                    else ctx.write(`${e.name}: ${e.callback}`);
                })
                ctx.write('}');
            }

            ctx.write('\n');
            ctx.indent--;
            ctx.writeLine(`});`);
        } else {
            ctx.write(`);\n`);
        }
    });
};
