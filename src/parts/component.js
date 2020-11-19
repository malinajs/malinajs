
import { assert, detectExpressionType, isSimpleName, unwrapExp, genId } from '../utils'


export function makeComponent(node, makeEl) {
    let propList = node.attributes;
    let binds = [];
    let head = [];
    let forwardAllEvents = false;
    let options = ['$$: $component'];
    let dynamicComponent;

    let propLevel = 0, propLevelType;

    if(node.name == 'component') {
        assert(node.elArg);
        dynamicComponent = node.elArg[0] == '{' ? unwrapExp(node.elArg) : node.elArg;
    }

    let passOption = {};

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

            passOption.slots = true;
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
    propList = propList.filter(prop => {
        let name = prop.name;
        let value = prop.value;
        if(name == '@@') {
            forwardAllEvents = true;
            return false;
        } else if(name[0] == ':' || name.startsWith('bind:')) {
            let inner, outer;
            if(name[0] == ':') inner = name.substring(1);
            else inner = name.substring(5);
            if(value) outer = unwrapExp(value);
            else outer = inner;
            assert(isSimpleName(inner), `Wrong property: '${inner}'`);
            assert(detectExpressionType(outer) == 'identifier', 'Wrong bind name: ' + outer);

            let watchName = '$$w' + (this.uniqIndex++);
            propLevelType = 'binding';
            passOption.props = true;
            passOption.push = true;
            head.push(`
                const ${watchName} = $watch($cd, () => (${outer}), _${inner} => {
                    props.${inner} = _${inner};
                    ${watchName}.pair && ${watchName}.pair(${watchName}.value);
                    $$push();
                }, {ro: true, cmp: $runtime.$$compareDeep});
                $runtime.fire(${watchName});
            `);
            binds.push(`
                $runtime.bindPropToComponent($child, '${inner}', ${watchName}, _${outer} => {
                    ${outer} = _${outer};
                    $$apply();
                });
            `);
            return false;
        } else if(name == 'this') {
            dynamicComponent = unwrapExp(value);
            return false;
        }
        return true;
    });

    propList.forEach(prop => {
        let name = prop.name;
        let value = prop.value;
        if(name[0] == '#') {
            assert(!value, 'Wrong ref');
            let name = name.substring(1);
            assert(isSimpleName(name), name);
            this.checkRootName(name);
            binds.push(`${name} = $child;`);
            return;
        } else if(name[0] == '{') {
            value = name;
            name = unwrapExp(name);
            if(name.startsWith('...')) {
                if(propLevelType) propLevel++;
                propLevelType = 'spreading';

                name = name.substring(3);
                assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
                passOption.push = true;
                let propObject = propLevel ? `$$lvl[${propLevel}]` : 'props';
                head.push(`
                    $runtime.fire($watch($cd, () => (${name}), (value) => {
                        $runtime.spreadObject(${propObject}, value);
                        $$push();
                    }, {ro: true, cmp: $runtime.$$deepComparator(0)}));
                `);
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
                    passOption.events = true;
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

            passOption.events = true;
            if(forwardAllEvents || boundEvents[event]) head.push(`$runtime.$$addEventForComponent(events, '${event}', ${callback});`);
            else head.push(`events.${event} = ${callback};`);
            boundEvents[event] = true;
            return;
        } else if(name == 'class' || name.startsWith('class:')) {
            let metaClass, args = name.split(':');
            if(args.length == 1) {
                metaClass = '$$main';
            } else {
                assert(args.length == 2);
                metaClass = args[1];
                assert(metaClass);
            }
            assert(value);

            const parsed = this.parseText(prop.value);
            let exp = parsed.result;
            let funcName = `$$pf${this.uniqIndex++}`;
            head.push(`
                const ${funcName} = () => $$resolveClass(${exp});
                $class['${metaClass}'] = ${funcName}();

                $watch($cd, ${funcName}, (result) => {
                    $class['${metaClass}'] = result;
                    $$push();
                }, {ro: true, value: $class['${metaClass}']});
            `);
            passOption.class = true;
            passOption.push = true;
            this.use.resolveClass = true;
            return;
        }
        assert(isSimpleName(name), `Wrong property: '${name}'`);
        if(value && value.indexOf('{') >= 0) {
            let exp = this.parseText(value).result;

            if(propLevelType == 'spreading') propLevel++;
            propLevelType = 'prop';
            let propObject = propLevel ? `$$lvl[${propLevel}]` : 'props';

            passOption.props = true;
            passOption.push = true;
            head.push(`
                $runtime.fire($watch($cd, () => (${exp}), _${name} => {
                    ${propObject}.${name} = _${name};
                    $$push();
                }, {ro: true, cmp: $runtime.$$compareDeep}));
            `);
        } else {
            if(value) value = '`' + this.Q(value) + '`';
            else value = 'true';

            if(propLevelType == 'spreading') propLevel++;
            propLevelType = 'attr';

            let propObject = propLevel ? `$$lvl[${propLevel}]` : 'props';
            head.push(`
                ${propObject}.${name} = ${value};
            `);
        }
    });

    let rootHead = [];
    if(passOption.push) {
        rootHead.push(`let $$push = $runtime.noop;`);
        binds.push(`$$push = $child.push;`);
    }

    if(passOption.class) {
        rootHead.push(`let $class = {}`);
        options.push('$class');
    }

    if(passOption.slots) {
        rootHead.push('let slots = {};');
        options.push('slots');
    }

    if(propLevel || propLevelType) {
        if(propLevel) rootHead.push(`let $$lvl = [], props = $runtime.makeTree(${propLevel}, $$lvl);`);
        else rootHead.push('let props = {};');
        options.push('props');
    }

    if(forwardAllEvents) {
        rootHead.push('let events = Object.assign({}, $option.events);');
        options.push('events');
    } else if(passOption.events) {
        rootHead.push('let events = {};');
        options.push('events');
    }

    const makeSrc = (componentName, brackets) => {
        let scope = false;
        let result = '';
        if(rootHead.length || head.length) {
            scope = true;
            result = `
                ${rootHead.join('\n')};
                ${head.join('\n')};
            `;
        }
        if(binds.length) {
            scope = true;
            result += `
                let $child = $runtime.callComponent($cd, ${componentName}, ${makeEl()}, {${options.join(', ')}});
                if($child) {
                    ${binds.join('\n')};
                }
            `;
        } else {
            result += `
                $runtime.callComponent($cd, ${componentName}, ${makeEl()}, {${options.join(', ')}});
            `;
        }
        if(brackets && scope) return '{' + result + '}';
        return result;
    }

    if(!dynamicComponent) {
        return {bind: `${makeSrc(node.name, true)}`};
    } else {
        let componentName = '$$comp' + (this.uniqIndex++);
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
