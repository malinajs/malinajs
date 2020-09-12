
import { assert, detectExpressionType, isSimpleName, unwrapExp, genId } from '../utils'


export function makeComponent(node, makeEl) {
    let propList = node.attributes;
    let binds = [];
    let head = [];
    let head2 = [];
    let forwardAllEvents = false;
    let injectGroupCall = 0;
    let spreading = false;
    let options = [];
    let dynamicComponent;

    let __classId;
    let classMap = {};

    function addClassMap(name, fn, line) {
        name = name || '$default';
        if(!classMap[name]) classMap[name] = [];
        classMap[name].push({fn, line})
    }

    function addClassMapExp(name, exp) {
        name = name || '$default';
        if(!classMap[name]) classMap[name] = [];
        classMap[name].push({exp})
    }

    const getClassId = () => {
        if(__classId) return __classId;
        __classId = this.config.cssGenId ? this.config.cssGenId() : genId();
        return __classId;
    };

    if(node.name == 'component') {
        assert(node.elArg);
        dynamicComponent = node.elArg[0] == '{' ? unwrapExp(node.elArg) : node.elArg;
    }

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
        } else if(name == 'this') {
            dynamicComponent = unwrapExp(value);
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
            assert(value, 'Empty class');
            if(value.indexOf('{') >= 0) {
                let exp = this.parseText(value);
                addClassMapExp(null, exp);
            } else {
                value.split(/\s+/).forEach(className => {
                    let classObject = this.css && this.css.simpleClasses[className];
                    if(classObject) {
                        let hash = getClassId();
                        classObject.useAsPassed(className, hash);
                        addClassMap(null, null, className + ' ' + hash);
                        addClassMap(className, null, className + ' ' + hash);
                    } else {
                        // global class
                        addClassMap(null, null, className);
                    };
                });
            }
            return;
        } else if(name.startsWith('class:')) {
            let args = name.split(':');
            assert(args.length == 2);
            let className = args[1];
            assert(className);
            let exp;

            if(value) exp = unwrapExp(value);
            else exp = className;

            let funcName = `pf${this.uniqIndex++}`;

            head2.push(`
                const ${funcName} = () => !!(${this.Q(exp)});
            `);

            let classObject = this.css && this.css.simpleClasses[className];
            if(classObject) {
                let h = getClassId();
                classObject.useAsPassed(className, h);
                addClassMap(null, funcName, className + ' ' + h);
                addClassMap(className, funcName, className + ' ' + h);
            } else {
                // global class
                addClassMap(null, funcName, className);
            }
            return;
        } else if(name[0] == '.') {
            let args = name.substring(1).split(':');
            let exp, localClass, childClass = args.shift();
            assert(childClass);
            assert(args.length <= 1);
            if(args[0] || !value) {
                // .header
                // .header:local
                // .header:local={cond}
                if(args[0]) {
                    localClass = args[0];
                    if(value) exp = unwrapExp(value);
                    else exp = localClass;
                } else {
                    exp = localClass = childClass;
                }
                let funcName = `pf${this.uniqIndex++}`;
                injectGroupCall++;

                let classObject = this.css && this.css.simpleClasses[localClass];
                if(classObject) {
                    let h = getClassId();
                    classObject.useAsPassed(childClass, h);
                    addClassMap(childClass, funcName, childClass + ' ' + h);
                } else {
                    // global class
                    addClassMap(childClass, funcName, localClass);
                }

                head2.push(`
                    const ${funcName} = () => !!(${this.Q(exp)});
                `);
            } else {
                if(value.indexOf('{') >= 0) {
                    // .header="{'local global'}"
                    let exp = unwrapExp(value);
                    addClassMapExp(childClass, exp);
                } else {
                    // .header="local global"
                    value.split(/\s+/).forEach(name => {
                        let classObject = this.css && this.css.simpleClasses[name];
                        if(classObject) {
                            let h = getClassId();
                            classObject.useAsPassed(childClass, h);
                            addClassMap(childClass, null, childClass + ' ' + h);
                        } else {
                            addClassMap(childClass, null, name);
                        }
                    });
                }
            }
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

    if(Object.keys(classMap).length) {
        head.push(`let $class = $runtime.makeNamedClass();`);
        options.push('$class');
        let localHash = this.css ? ' ' + this.css.id : '';
        Object.entries(classMap).forEach(i => {
            let childClass = i[0];
            let dyn = false;
            let staticLine = '';
            let line = i[1].map(i => {
                if(i.exp) {
                    dyn = true;
                    return `r += (${i.exp}) + '${localHash} ';`
                } else if(i.fn) {
                    dyn = true;
                    return `if(${i.fn}()) r += '${i.line} ';`
                }
                staticLine += i.line + ' ';
                return `r += '${i.line} ';`;
            }).join('\n');

            if(dyn) {
                let funcName = 'fn' + (this.uniqIndex++);
                let valueName = 'v' + (this.uniqIndex++);
                injectGroupCall++;
                head2.push(`
                    let ${funcName} = () => {
                        let r = '';
                        ${line}
                        return r.trim();
                    };
                    let ${valueName} = ${funcName}();
                    $class['${childClass}'] = ${valueName};
                    $class.$dyn['${childClass}'] = true;
                    $watch($cd, ${funcName}, (result) => {
                        $class['${childClass}'] = result;
                        groupCall();
                    }, {ro: true, value: ${valueName}});
                `);
            } else {
                head2.push(`
                    $class['${childClass}'] = '${staticLine.trim()}';
                `);
            }
        });
    }

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

    options.unshift('afterElement: true, noMount: true, props, boundProps, events, slots');

    const makeSrc = (componentName) => {
        return `
            let props = {};
            let boundProps = {};
            let slots = {};
            ${head.join('\n')};
            let componentOption = {${options.join(', ')}};
            ${head2.join('\n')};
            let $component = ${componentName}(${makeEl()}, componentOption);
            if($component) {
                if($component.destroy) $runtime.cd_onDestroy($cd, $component.destroy);
                ${binds.join('\n')};
                if($component.onMount) $tick($component.onMount);
            }
        `;
    }

    if(!dynamicComponent) {
        return {bind: `{ ${makeSrc(node.name)} }`};
    } else {
        let componentName = 'comp' + (this.uniqIndex++);
        return {bind: `
        {
            const ${componentName} = ($cd, $ComponentConstructor) => {
                ${makeSrc('$ComponentConstructor')}
            };
            let childCD, finalLabel = $runtime.getFinalLabel(${makeEl()});
            $watch($cd, () => (${dynamicComponent}), ($ComponentConstructor) => {
                if(childCD) {
                    childCD.destroy();
                    $runtime.removeElementsBetween(${makeEl()}, finalLabel);
                }
                childCD = null;
                if($ComponentConstructor) {
                    childCD = $cd.new();
                    ${componentName}(childCD, $ComponentConstructor);
                }
            });
        }`};
    }
};
