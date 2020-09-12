
import { assert, isSimpleName, unwrapExp, detectExpressionType } from "../utils";


export function makeFragment(node) {
    let rx = node.value.match(/#fragment\:(\S+)(.*)$/);
    assert(rx);
    let name = rx[1];
    let args = rx[2] ? rx[2].trim() : null;
    let head = [];
    assert(isSimpleName(name));
    if(args) {
        args = args.split(/\s*,\s*/);
        args.forEach(name => {
            assert(isSimpleName(name));
            head.push(`
                let ${name};
                if($$args.${name} != null) {
                    if(typeof $$args.${name} == 'function') {
                        $cd.prefix.push(() => {${name} = $$args.${name}()});
                    } else ${name} = $$args.${name};
                }
            `);
        });
    }

    let block;
    if(node.body && node.body.length) block = this.buildBlock(node)
    else {
        this.option.warning(`Empty fragment: '${node.value}'`);
        return {source: `function $fragment_${name}() {};`};
    }

    const convert = block.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';

    return {source: `
        function $fragment_${name}($cd, label, $option) {
            let $$args = $option.args;
            ${head.join('\n')}

            ${block.source};
            let $tpl = ${convert}(\`${this.Q(block.tpl)}\`);
            ${block.name}($cd, $tpl);
            label.parentNode.insertBefore($tpl, label.nextSibling);
        };
    `};
}


export function attachFragment(node, elementName) {
    let head = [];
    let name = node.elArg;
    assert(isSimpleName(name));

    node.attributes.forEach(prop => {
        let name = prop.name;
        let value = prop.value;

        if(name[0] == '@' || name.startsWith('on:')) {
            if(name[0] == '@') name = name.substring(1);
            else name = name.substring(3);

            if(name == '@') {
                head.push(`events = $option.events;`)
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
                    head.push(`events.${name} = $option.events.${name};`);
                    return;
                }
            }
            assert(!handler ^ !exp, prop.content);

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
            head.push(`events.${name} = ${callback};`);
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
                head.push(`args.${name} = () => (${exp});`);
            } else {
                head.push(`args.${name} = \`${this.Q(value)}\`;`);
            }
        }

    });

    return {source: `{
        let args = {};
        let events = {};
        ${head.join('\n')}
        $fragment_${name}($cd, ${elementName}, {args, events});
    }`};
};
