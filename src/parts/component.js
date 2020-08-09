
import { assert, detectExpressionType, isSimpleName, unwrapExp, genId, toCamelCase } from '../utils'


export function makeComponent(node, makeEl) {
    let propList = node.attributes;
    let binds = [];
    let head = [];
    let head2 = [];
    let forwardAllEvents = false;
    let injectGroupCall = 0;
    let spreading = false;
    let classId;
    let defaultClass = false, namedClass = false, namedClassIndex = 1;
    let options = [];

    if(node.body && node.body.length) {
        let slots = {};
        let defaultSlot = {
            name: 'default',
            type: 'slot'
        }
        defaultSlot.body = node.body.filter(n => {
            if(n.type != 'slot') return true;
            let rx = n.value.match(/^\#slot:(\S+)/);
            if(rx) n.name = rx[1];
            else n.name = 'default';
            assert(!slots[n], 'double slot');
            slots[n.name] = n;
        });

        if(!slots.default) slots.default = defaultSlot;
        // TODO: (else) check if defaultSlot is empty

        Object.values(slots).forEach(slot => {
            assert(isSimpleName(slot.name));
            let args = '', setters = '';
            let rx = slot.value && slot.value.match(/^#slot\S*\s+(.*)$/);
            if(rx) {
                let props = rx[1].trim().split(/\s*,\s*/);
                props.forEach(n => {
                    assert(isSimpleName(n), 'Wrong prop for slot');
                });
                args = `let ${props.join(', ')};`;
                setters = ',' + props.map(name => {
                    return `set_${name}: (_${name}) => {${name} = _${name}; $$apply();}`;
                }).join(',\n');
            }

            let block = this.buildBlock(slot);
            const convert = block.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
            head.push(`
                slots.${slot.name} = function($label) {
                    let $childCD = $cd.new();
                    let $tpl = ${convert}(\`${this.Q(block.tpl)}\`);

                    ${args}

                    ${block.source};
                    ${block.name}($childCD, $tpl);
                    $label.parentNode.insertBefore($tpl, $label.nextSibling);

                    return {
                        destroy: () => {
                            $childCD.destroy();
                        }
                        ${setters}
                    }
                }
            `);
        });
    }

    let boundEvents = {};
    let twoBinds = [];
    propList = propList.filter(prop => {
        let name = prop.name;
        let value = prop.value;
        if(name == '@@') {
            forwardAllEvents = true;
            return false;
        } else if(name.startsWith('{...')) {
            spreading = true;
        } else if(name[0] == ':' || name.startsWith('bind:')) {
            let inner, outer;
            if(name[0] == ':') inner = name.substring(1);
            else inner = name.substring(5);
            if(value) outer = unwrapExp(value);
            else outer = inner;
            assert(isSimpleName(inner), `Wrong property: '${inner}'`);
            assert(detectExpressionType(outer) == 'identifier', 'Wrong bind name: ' + outer);
            twoBinds.push(inner);
            let valueName = 'v' + (this.uniqIndex++);
            head.push(`props.${inner} = ${outer};`);
            head.push(`boundProps.${inner} = 2;`);
            binds.push(`
                if('${inner}' in $component) {
                    let value = $runtime.$$cloneDeep(props.${inner});
                    let $$_w0 = $watch($cd, () => (${outer}), (value) => {
                        props.${inner} = value;
                        $$_w1.value = $$_w0.value;
                        $component.${inner} = value;
                    }, {ro: true, cmp: $runtime.$$compareDeep, value});
                    let $$_w1 = $watch($component.$cd, () => ($component.${inner}), (${valueName}) => {
                        props.${inner} = ${valueName};
                        $$_w0.value = $$_w1.value;
                        ${outer} = ${valueName};
                        $$apply();
                    }, {cmp: $runtime.$$compareDeep, value});
                } else console.error("Component ${node.name} doesn't have prop ${inner}");
            `);
            return false;
        }
        return true;
    });

    if(spreading) {
        head.push('let spreadObject = $runtime.$$makeSpreadObject2($cd, props);');
        head.push('boundProps.$$spreading = true;');
        binds.push('spreadObject.emit = $component.push;');
        if(twoBinds.length) {
            head.push(`spreadObject.except(['${twoBinds.join(',')}']);`);
        }
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
                    if(forwardAllEvents || boundEvents[event]) head.push(`$runtime.$$addEventForComponent(events, '${event}', $option.events.${event});`);
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
                callback = exp;
            } else if(handler) {
                this.checkRootName(handler);
                callback = handler;
            } else {
                callback = `($event) => {${this.Q(exp)}}`;
            }

            if(forwardAllEvents || boundEvents[event]) head.push(`$runtime.$$addEventForComponent(events, '${event}', ${callback});`);
            else head.push(`events.${event} = ${callback};`);
            boundEvents[event] = true;
            return;
        } else if(name == 'class') {
            namedClass = true;
            let index = namedClassIndex++;
            assert(!defaultClass, 'Double class');
            defaultClass = true;
            assert(value, 'Empty class');
            if(value.indexOf('{') >= 0) {
                let exp = this.parseText(value);
                injectGroupCall++;
                head2.push(`
                    $class.$default[${index}] = $runtime.watchInit($cd, () => (${exp}), (value) => {
                        $class.$default[${index}] = value;
                        groupCall();
                    });
                `);
            } else {
                head2.push(`$class.$default = \`${this.Q(value)}\`;`);
            }
            return;
        } else if(name.startsWith('class:')) {
            namedClass = true;
            let index = namedClassIndex++;
            let args = name.split(':');
            assert(args.length == 2);
            let className = args[1];
            assert(className);
            let exp;

            if(value) exp = unwrapExp(value);
            else exp = className;

            let funcName = `pf${this.uniqIndex++}`;
            let valueName = `v${this.uniqIndex++}`;
            injectGroupCall++;
            head2.push(`
                const ${funcName} = () => !!(${this.Q(exp)});
                let ${valueName} = ${funcName}();
                $class.$default[${index}] = ${valueName} ? '${className}' : ''
                $watch($cd, ${funcName}, (value) => {
                    $class.$default[${index}] = value ? '${className}' : '';
                    groupCall();
                }, {ro: true, value: ${valueName}});
            `);
            return;
        } else if(name[0] == '.') {
            namedClass = true;
            let args = name.substring(1).split(':');
            let exp, localClass, childClass = args.shift();
            let hash = this.css ? this.css.id + ' ' : '';
            assert(childClass);
            let keyName = toCamelCase(childClass);
            assert(args.length <= 1);
            if(args[0] || !value) {
                if(args[0]) {
                    localClass = args[0];
                    if(value) exp = unwrapExp(value);
                    else exp = localClass;
                } else {
                    exp = localClass = childClass;
                }
                let funcName = `pf${this.uniqIndex++}`;
                let valueName = `v${this.uniqIndex++}`;
                injectGroupCall++;
                head2.push(`
                    const ${funcName} = () => !!(${this.Q(exp)});
                    let ${valueName} = ${funcName}();
                    $class.${keyName} = ${valueName} ? \`${hash}${localClass}\` : '';
                    $watch($cd, ${funcName}, (value) => {
                        $class.${keyName} = value ? \`${hash}${localClass}\` : '';
                        groupCall();
                    }, {ro: true, value: ${valueName}});
                `);
            } else {
                if(value.indexOf('{') >= 0) {
                    let exp = unwrapExp(value);
                    injectGroupCall++;
                    head2.push(`
                        $class.${keyName} = $runtime.watchInit($cd, () => '${hash}' + (${this.Q(exp)}), (value) => {
                            $class.${keyName} = value;
                            groupCall();
                        });
                    `);
                } else {
                    head2.push(`$class.${keyName} = \`${hash}${this.Q(value)}\`;`);
                }
            }
            return;
        } else if(name == 'bind-class' || name.startsWith('bind-class:')) {
            if(!classId) {
                classId = genId();
                head.push(`let classPrefix = '${classId}';`);
                options.push('classPrefix');
            }
            assert(this.css, 'No styles');
            let args = name.split(':');
            args.shift();
            assert(args.length <= 1, 'Wrong class syntax');
            let child = args[0];
            let parentClasses = value.split(/\s+/);
            assert(parentClasses.length);
            parentClasses.forEach(parent => {
                assert(this.css.simpleClasses[parent], 'No class to pass');
                this.css.passed.push({id: classId, child: child || parent, parent});
            });
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
            injectGroupCall++;
            head.push(`
                let ${fname} = () => (${exp});
                let ${valueName} = ${fname}()
                props.${name} = ${valueName};
                boundProps.${name} = 1;

                $watch($cd, ${fname}, _${name} => {
                    props.${name} = _${name};
                    groupCall();
                }, {ro: true, cmp: $runtime.$$compareDeep, value: $runtime.$$cloneDeep(${valueName})});
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
        if(injectGroupCall == 1) {
            head.push('let groupCall;');
            binds.push('groupCall = $component.push;');
        } else {
            head.push('let groupCall = $runtime.$$groupCall();');
            binds.push('groupCall.emit = $component.push;');
        }
    }
    if(spreading) head.push('spreadObject.build();');

    if(namedClass) {
        head.push(`let $class = $runtime.makeNamedClass('${this.css ? this.css.id : ''}');`);
        options.push('$class');
    }

    options.unshift('afterElement: true, noMount: true, props, boundProps, events, slots');
    return {
        bind:`
        {
            let props = {};
            let boundProps = {};
            let slots = {};
            ${head.join('\n')};
            let componentOption = {${options.join(', ')}};
            ${head2.join('\n')};
            let $component = ${node.name}(${makeEl()}, componentOption);
            if($component) {
                if($component.destroy) $runtime.cd_onDestroy($cd, $component.destroy);
                ${binds.join('\n')};
                if($component.onMount) $tick($component.onMount);
            }
    }`};
};
