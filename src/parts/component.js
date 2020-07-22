
import { parseElement } from '../parser.js'
import { assert, detectExpressionType, isSimpleName } from '../utils'


export function makeComponent(node, makeEl) {
    let propList = parseElement(node.openTag);
    let binds = [];
    let head = [];
    let forwardAllEvents = false;
    let injectGroupCall = false;
    
    function unwrapExp(e) {
        assert(e, 'Empty expression');
        let rx = e.match(/^\{(.*)\}$/);
        assert(rx, 'Wrong expression: ' + e);
        return rx[1];
    };

    let boundEvents = {};
    propList = propList.filter(prop => {
        if(prop.name == '@@') {
            forwardAllEvents = true;
            return false;
        }
        return true;
    });

    let spreading = !!propList.some(prop => prop.name.startsWith('{...'));

    if(spreading) {
        head.push('let spreadObject = $$makeSpreadObject2($cd, props);');
        head.push('boundProps.$$spreading = true;');
        binds.push('spreadObject.emit = $component.push;');
    }

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
            if(name.startsWith('...')) {
                name = name.substring(3);
                assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
                head.push(`spreadObject.spread(() => ${name})`);
                return;
            };
            assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
        } else if(name[0] == '@' || name.startsWith('on:')) {
            if(name[0] == '@') name = name.substring(1);
            else name = name.substring(3);
            let arg = name.split(/[\|:]/);
            let exp, handler, isFunc, event = arg.shift();
            assert(event);

            if(value) exp = unwrapExp(value);
            else {
                if(!arg.length) {
                    // forwarding
                    if(forwardAllEvents || boundEvents[event]) head.push(`$$addEvent(events, '${event}', $option.events.${event});`);
                    else head.push(`events.${event} = $option.events.${event};`);
                    boundEvents[event] = true;
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

            let callback;
            if(isFunc) {
                callback = `${exp}`;
            } else if(handler) {
                this.checkRootName(handler);
                callback = `${handler}`;
            } else {
                callback = `($event) => {${this.Q(exp)}}`;
            }

            if(forwardAllEvents || boundEvents[event]) head.push(`$$addEvent(events, '${event}', ${callback});`);
            else head.push(`events.${event} = ${callback};`);
            boundEvents[event] = true;
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
            let valueName = 'v' + (this.uniqIndex++);
            head.push(`props.${inner} = ${outer};`);
            binds.push(`
                if('${inner}' in $component) {
                    let $$_w0 = $watch($cd, () => (${outer}), (value) => {
                        $$_w1.value = $$_w0.value;
                        $component.${inner} = value;
                    }, {ro: true, cmp: $$compareDeep});
                    let $$_w1 = $watch($component.$cd, () => ($component.${inner}), (${valueName}) => {
                        $$_w0.value = $$_w1.value;
                        ${outer} = ${valueName}; $$apply();
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
            if(spreading) {
                return head.push(`
                    spreadObject.prop('${name}', () => ${exp});
                `);
            }
            injectGroupCall = true;
            head.push(`
                let ${fname} = () => (${exp});
                let ${valueName} = ${fname}()
                props.${name} = ${valueName};
                boundProps.${name} = 1;

                $watch($cd, ${fname}, _${name} => {
                    props.${name} = _${name};
                    groupCall();
                }, {ro: true, cmp: $$compareDeep, value: $$cloneDeep(${valueName})});
            `);
        } else {
            if(spreading) {
                head.push(`
                    spreadObject.attr('${name}', \`${this.Q(value)}\`);
                `);
            } else {
                head.push(`props.${name} = \`${this.Q(value)}\``);
            }
        }
    });

    if(forwardAllEvents) head.unshift('let events = Object.assign({}, $option.events);');
    else head.unshift('let events = {};');
    if(injectGroupCall) {
        head.push('let groupCall = $$groupCall();');
        binds.push('groupCall.emit = $component.push;');
    }
    if(spreading) head.push('spreadObject.build();');

    return {
        bind:`
        {
            let props = {};
            let boundProps = {};
            ${head.join('\n')};
            let $component = ${node.name}(${makeEl()}, {afterElement: true, noMount: true, props, boundProps, events});
            if($component) {
                if($component.destroy) $cd.d($component.destroy);
                ${binds.join('\n')};
                if($component.onMount) $cd.once($component.onMount);
            }
    }`};
};
