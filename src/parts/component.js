
import { parseElement } from '../parser.js'
import { assert, detectExpressionType, isSimpleName } from '../utils'


export function makeComponent(node, makeEl) {
    let propList = parseElement(node.openTag);
    let binds = [];
    let head = [];
    let forwardAllEvents = false;
    
    function unwrapExp(e) {
        assert(e, 'Empty expression');
        let rx = e.match(/^\{(.*)\}$/);
        assert(rx, 'Wrong expression: ' + e);
        return rx[1];
    };

    propList.forEach(prop => {
        let name = prop.name;
        let value = prop.value;
        if(name[0] == '#') {
            assert(!value, 'Wrong ref');
            let name = name.substring(1);
            assert(isSimpleName(name), name);
            this.checkRootName(name);
            binds.push(`${name} = $component;`);
            return;
        } else if(name[0] == '{') {
            value = name;
            name = unwrapExp(name);
            assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
        } else if(name[0] == '@' || name.startsWith('on:')) {
            if(name[0] == '@') name = name.substring(1);
            else name = name.substring(3);
            if(name == '@') {
                forwardAllEvents = true;
                return;
            };
            let arg = name.split(/[\|:]/);
            let exp, handler, isFunc, event = arg.shift();
            assert(event);

            if(value) exp = unwrapExp(value);
            else {
                if(!arg.length) {
                    // forwarding
                    head.push(`events.${event} = $option.events.${event};`);
                    return;
                }
                handler = arg.pop();
            }
            assert(arg.length == 0);
            assert(!handler ^ !exp);

            if(exp) {
                let type = detectExpressionType(exp);
                if(type == 'identifier') {
                    handler = exp;
                    exp = null;
                } else isFunc = type == 'function';
            }

            if(isFunc) {
                head.push(`events.${event} = ${exp};`);
            } else if(handler) {
                this.checkRootName(handler);
                head.push(`events.${event} = ${handler};`);
            } else {
                head.push(`events.${event} = ($event) => {${this.Q(exp)}};`);
            }
            return;
        }
        if(name[0] == ':' || name.startsWith('bind:')) {
            let inner, outer;
            if(name[0] == ':') inner = name.substring(1);
            else inner = name.substring(5);
            if(value) outer = unwrapExp(value);
            else outer = inner;
            assert(isSimpleName(inner), `Wrong property: '${inner}'`);
            assert(detectExpressionType(outer) == 'identifier', 'Wrong bind name: ' + outer);
            head.push(`props.${inner} = ${outer};`);
            binds.push(`
                if('${inner}' in $component) {
                    let $$_w0 = $watch($cd, () => (${outer}), (value) => {
                        $$_w1.value = $$_w0.value;
                        $component.${inner} = value;
                    }, {ro: true, cmp: $$compareDeep});
                    let $$_w1 = $watch($component.$cd, () => ($component.${inner}), (value) => {
                        $$_w0.value = $$_w1.value;
                        ${outer} = value; $$apply();
                    }, {ro: true, cmp: $$compareDeep});
                } else console.error("Component ${node.name} doesn't have prop ${inner}");
            `);
            return;
        }
        assert(value, 'Empty property');
        assert(isSimpleName(name), `Wrong property: '${name}'`);
        if(value.indexOf('{') >= 0) {
            let exp = this.parseText(value);
            let fname = 'pf' + (this.uniqIndex++);
            let valueName = 'v' + (this.uniqIndex++);
            head.push(`
                let ${fname} = () => (${exp});
                let ${valueName} = ${fname}()
                props.${name} = ${valueName};
            `);
            binds.push(`
                if('${name}' in $component) {
                    $watch($cd, ${fname}, (value) => {$component.${name} = value}, {ro: true, cmp: $$compareDeep});
                } else console.error("Component ${node.name} doesn't have prop ${name}");
            `);
        } else {
            head.push(`props.${name} = \`${this.Q(value)}\``);
        }
    });

    if(forwardAllEvents) head.unshift('let events = Object.assign({}, $option.events);');
    else head.unshift('let events = {};');

    return {
        bind:`
        {
            let props = {};
            ${head.join('\n')};
            let $component = ${node.name}(${makeEl()}, {afterElement: true, noMount: true, props, events});
            if($component) {
                if($component.destroy) $cd.d($component.destroy);
                ${binds.join('\n')};
                if($component.onMount) $cd.once($component.onMount);
            }
    }`};
};
