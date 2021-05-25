
import { assert, detectExpressionType, isSimpleName, unwrapExp, xNode, trimEmptyNodes, toCamelCase, isNumber } from '../utils'


export function makeComponent(node, element) {
    let propList = node.attributes;
    let forwardAllEvents = false;

    this.require('$component');
    this.require('apply', '$cd');

    let options = ['$$: $component'];
    let dynamicComponent;

    let propLevel = 0, propLevelType;

    if(node.name == 'component') {
        assert(node.elArg);
        dynamicComponent = node.elArg[0] == '{' ? unwrapExp(node.elArg) : node.elArg;
    }

    let passOption = {};

    let head = xNode('block');
    let body = xNode('block');

    head.push(xNode('push', {
        $cond: () => passOption.push
    }, ctx => {
        ctx.writeLine(`let $$push = $runtime.noop;`)
    }));
    body.push(xNode('push', {
        $cond: () => passOption.push
    }, ctx => {
        ctx.writeLine(`$$push = $child.push;`)
    }));

    head.push(xNode('prop', {
        $cond: () => propLevel || propLevelType
    }, ctx => {
        if(propLevel) ctx.writeLine(`let $$lvl = [], props = $runtime.makeTree(${propLevel}, $$lvl);`);
        else ctx.writeLine('let props = {};');
    }));

    head.push(xNode('events', {
        $cond: () => forwardAllEvents || passOption.events
    }, ctx => {
        if(forwardAllEvents) {
            ctx.writeLine('let events = Object.assign({}, $option.events);');
        } else if(passOption.events) {
            ctx.writeLine('let events = {};');
        }
    }));

    head.push(xNode('slots', {
        $cond: () => passOption.slots
    }, ctx => {
        ctx.writeLine('let slots = {};');
    }));

    head.push(xNode('class', {
        $cond: () => passOption.class
    }, ctx => {
        ctx.writeLine(`let $class = {}`);
    }));

    head.push(xNode('anchor', {
        $cond: () => passOption.anchor
    }, ctx => {
        ctx.writeLine('let anchor = {};');
    }));

    let _boundEvents = {};
    const boundEvent = (name) => {
        if(!_boundEvents[name]) _boundEvents[name] = forwardAllEvents ? 1 : 0;
        _boundEvents[name]++;
    }

    if(node.body && node.body.length) {
        let slots = {};
        let anchors = [];
        let defaultSlot = {
            name: 'default',
            type: 'slot'
        }
        defaultSlot.body = trimEmptyNodes(node.body.filter(n => {
            if(n.type == 'node' && n.name[0] == '^') {
                anchors.push(n);
                return false;
            }
            if(n.type != 'slot') return true;
            let rx = n.value.match(/^\#slot:(\S+)/);
            if(rx) n.name = rx[1];
            else n.name = 'default';
            assert(!slots[n], 'double slot');
            slots[n.name] = n;
        }));

        if(!slots.default && defaultSlot.body.length) slots.default = defaultSlot;

        Object.values(slots).forEach(slot => {
            assert(isSimpleName(slot.name));
            let props, setters;
            let rx = slot.value && slot.value.match(/^#slot\S*\s+(.*)$/);
            if(rx) {
                let args = rx[1].trim().split(/\s*,\s*/);
                args.forEach(n => {
                    assert(isSimpleName(n), 'Wrong prop for slot');
                });
                props = xNode('slot:props', {
                    props: args
                }, (ctx, data) => {
                    ctx.writeLine(`let ${data.props.join(', ')};`);
                });
                setters = xNode('slot:setters', {
                    props: args
                }, (ctx, data) => {
                    for(let name of data.props) {
                        ctx.writeLine(`, set_${name}: (_${name}) => {${name} = _${name}; $$apply();}`);
                    }
                });
            }

            passOption.slots = true;
            let block = this.buildBlock(slot, {inline: true});

            const template = xNode('template', {
                name: '$parentElement',
                body: block.tpl,
                svg: block.svg
            });

            head.push(xNode('slot', {
                name: slot.name,
                template,
                bind: block.source,

                props,
                setters,
                $cd: block.inuse.$cd,
                optional_$cd: block.inuse.optional_$cd
            }, (ctx, data) => {
                let $cd = data.$cd || data.optional_$cd && this.inuse.$cd;
                ctx.writeLine(`slots.${data.name} = function($label, $component) {`);
                ctx.goIndent(() => {
                    if($cd) ctx.writeLine(`let $childCD = $cd.new();`);
                    ctx.build(data.template);
                    ctx.build(data.props);
                    if(data.bind) {
                        if($cd) {
                            ctx.writeLine(`{`);
                            ctx.goIndent(() => {
                                ctx.writeLine(`let $cd = $childCD;`);
                                ctx.build(data.bind);
                            });
                            ctx.writeLine(`}`);
                        } else {
                            ctx.build(data.bind);
                        }
                    }

                    ctx.writeLine(`$runtime.insertBefore($label, $parentElement, $label.nextSibling);`);
                    ctx.writeLine(`return {`);
                    ctx.goIndent(() => {
                        if($cd) ctx.writeLine(`destroy: () => {$childCD.destroy();}`);
                        ctx.build(data.setters);
                    });
                    ctx.writeLine(`};`);
                });
                ctx.writeLine(`}`);
            }));
        });

        anchors.forEach(n => {
            passOption.anchor = true;
            let block = this.buildBlock({body: [n]}, {inline: true, oneElement: 'el', bindAttributes: true});
            let name = n.name.slice(1) || 'default';
            assert(isSimpleName(name));
            head.push(xNode('anchor', {
                name,
                source: block.source,
                $cd: block.inuse.$cd
            }, (ctx, n) => {
                ctx.writeLine(`anchor.${n.name} = (el) => {`);
                if(n.$cd) {
                    ctx.goIndent(() => {
                        ctx.writeLine(`let $childCD = $cd.new();`);
                        ctx.writeLine(`{`);
                        ctx.goIndent(() => {
                            ctx.writeLine(`let $cd = $childCD;`);
                            ctx.build(n.source);
                        });
                        ctx.writeLine(`}`);
                        ctx.writeLine(`return () => {$childCD.destroy();}`);
                    });
                } else {
                    ctx.build(n.source);
                }
                ctx.writeLine(`}`);
            }));
        });
    }

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
            this.detectDependency(outer);

            let watchName = '$$w' + (this.uniqIndex++);
            propLevelType = 'binding';
            passOption.props = true;
            passOption.push = true;

            head.push(xNode('bindProp2', {
                watchName,
                outer,
                inner
            }, (ctx, data) => {
                ctx.writeLine(`const ${data.watchName} = $watch($cd, () => (${data.outer}), _${data.inner} => {`);
                ctx.goIndent(() => {
                    ctx.writeLine(`props.${data.inner} = _${data.inner};`);
                    ctx.writeLine(`${data.watchName}.pair && ${data.watchName}.pair(${data.watchName}.value);`);
                    ctx.writeLine(`$$push();`);
                });
                ctx.writeLine(`}, {ro: true, cmp: $runtime.$$compareDeep});`);
                ctx.writeLine(`$runtime.fire(${data.watchName});`);
            }));
            body.push(xNode('bindProp2', {
                watchName,
                outer,
                inner
            }, (ctx, data) => {
                ctx.writeLine(`$runtime.bindPropToComponent($child, '${data.inner}', ${data.watchName}, _${data.outer} => {`);
                ctx.goIndent(() => {
                    ctx.writeLine(`${data.outer} = _${data.outer};`);
                    ctx.writeLine(`$$apply();`);
                });
                ctx.writeLine(`});`);
            }));
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
            body.push(xNode('ref', {
                name
            }, (ctx, data) => {
                ctx.writeLine(`${data.name} = $child;`);
            }));
            return;
        } else if(name[0] == '{') {
            value = name;
            name = unwrapExp(name);
            if(name.startsWith('...')) {
                if(propLevelType) propLevel++;
                propLevelType = 'spreading';

                name = name.substring(3);
                assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
                this.detectDependency(name);
                passOption.push = true;
                let propObject = propLevel ? `$$lvl[${propLevel}]` : 'props';

                head.push(xNode('spread-object', {
                    name,
                    propObject
                }, (ctx, n) => {
                    ctx.writeLine(`$runtime.fire($watch($cd, () => (${n.name}), (value) => {`);
                    ctx.goIndent(() => {
                        ctx.writeLine(`$runtime.spreadObject(${n.propObject}, value);`);
                        ctx.writeLine(`$$push();`);
                    });
                    ctx.writeLine(`}, {ro: true, cmp: $runtime.$$deepComparator(0)}));`);
                }));
                return;
            };
            assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
        } else if(name[0] == '@' || name.startsWith('on:')) {
            if(name[0] == '@') name = name.substring(1);
            else name = name.substring(3);
            let arg = name.split(/[\|:]/);
            let exp, handler, isFunc, event = arg.shift();
            assert(event);

            if(event[0] == '@') {  // forwarding
                event = event.substring(1);
                assert(!value);
                passOption.events = true;
                boundEvent(event);
                head.push(xNode('forwardEvent', {
                    event
                }, (ctx, data) => {
                    if(_boundEvents[data.event] > 1) ctx.writeLine(`$runtime.$$addEventForComponent(events, '${data.event}', $option.events.${data.event});`);
                    else ctx.writeLine(`events.${data.event} = $option.events.${data.event};`);
                }))
                return;
            }

            if(value) exp = unwrapExp(value);
            else {
                if(arg.length) handler = arg.pop();
                else handler = event;
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

            this.detectDependency(exp || handler);

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
            boundEvent(event);
            head.push(xNode('passEvent', {
                event,
                callback
            }, (ctx, data) => {
                if(_boundEvents[data.event] > 1) ctx.writeLine(`$runtime.$$addEventForComponent(events, '${data.event}', ${data.callback});`);
                else ctx.writeLine(`events.${data.event} = ${data.callback};`);
            }));
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
            this.detectDependency(parsed);
            let exp = parsed.result;
            let funcName = `$$pf${this.uniqIndex++}`;

            head.push(xNode('passClass', {
                funcName,
                exp,
                metaClass
            }, (ctx, data) => {
                ctx.writeLine(`const ${data.funcName} = () => $$resolveClass(${data.exp});`);
                ctx.writeLine(`$class['${data.metaClass}'] = ${data.funcName}();`);
                ctx.writeLine(`$watch($cd, ${data.funcName}, (result) => {`);
                ctx.goIndent(() => {
                    ctx.writeLine(`$class['${data.metaClass}'] = result;`);
                    ctx.writeLine(`$$push();`);
                });
                ctx.writeLine(`}, {ro: true, value: $class['${data.metaClass}']});`);
            }));

            passOption.class = true;
            passOption.push = true;
            this.require('resolveClass');
            return;
        }

        const staticProp = (name, value) => {
            if(typeof value == 'number') value = '' + value;
            else if(value) value = '`' + this.Q(value) + '`';
            else value = 'true';

            if(propLevelType == 'spreading') propLevel++;
            propLevelType = 'attr';

            let propObject = propLevel ? `$$lvl[${propLevel}]` : 'props';
            head.push(xNode('staticProp', {
                name,
                value,
                propObject
            }, (ctx, data) => {
                ctx.writeLine(`${data.propObject}.${data.name} = ${data.value};`);
            }));
        }

        assert(name.match(/^([\w\$_][\w\d\$_\.\-]*)$/), `Wrong property: '${name}'`);
        name = toCamelCase(name);
        if(value && value.indexOf('{') >= 0) {
            const pe = this.parseText(value);
            this.detectDependency(pe);
            if(pe.parts.length == 1 && isNumber(pe.parts[0].value)) {
                staticProp(name, Number(pe.parts[0].value));
            } else {
                let exp = pe.result;

                if(propLevelType == 'spreading') propLevel++;
                propLevelType = 'prop';
                let propObject = propLevel ? `$$lvl[${propLevel}]` : 'props';

                passOption.props = true;
                passOption.push = true;
                head.push(xNode('bindProp', {
                    exp,
                    name,
                    propObject
                }, (ctx, data) => {
                    ctx.writeLine(`$runtime.fire($watch($cd, () => (${data.exp}), _${data.name} => {`);
                    ctx.goIndent(() => {
                        ctx.writeLine(`${data.propObject}.${data.name} = _${data.name};`);
                        ctx.writeLine(`$$push();`);
                    });
                    ctx.writeLine(`}, {ro: true, cmp: $runtime.$$compareDeep}));`);
                }));
            }
        } else {
            staticProp(name, value);
        }
    });


    if(propLevel || propLevelType) options.push('props');
    if(forwardAllEvents || passOption.events) options.push('events');
    if(passOption.slots) options.push('slots');
    if(passOption.class) options.push('$class');
    if(passOption.anchor) options.push('anchor');

    let result = xNode('component', {
        el: element.bindName(),
        componentName: node.name,
        head,
        body,
        options,
        $cd: '$cd'
    }, (ctx, data) => {
        const $cd = data.$cd || '$cd';
        ctx.build(data.head);
        if(data.body.empty()) {
            ctx.writeLine(`$runtime.callComponent(${$cd}, ${data.componentName}, ${data.el}, {${data.options.join(', ')}});`);
        } else {
            ctx.writeLine(`let $child = $runtime.callComponent(${$cd}, ${data.componentName}, ${data.el}, {${data.options.join(', ')}});`);
            ctx.writeLine(`if($child) {`);
            ctx.goIndent(() => {
                ctx.build(data.body);
            });
            ctx.writeLine(`}`);
        }
    });

    if(!dynamicComponent) {
        if(head.empty() && body.empty()) return {bind: result};
        return {bind: xNode('block', {scope: true, body: [result]})};
    } else {
        this.detectDependency(dynamicComponent);

        result.componentName = '$ComponentConstructor';
        result.$cd = 'childCD';
        return {bind: xNode('dyn-component', {
            el: element.bindName(),
            exp: dynamicComponent,
            component: result
        }, (ctx, n) => {
            ctx.writeLine('{');
            ctx.goIndent(() => {
                ctx.writeLine(`let childCD, finalLabel = $runtime.getFinalLabel(${n.el});`);
                ctx.writeLine(`$watch($cd, () => (${n.exp}), ($ComponentConstructor) => {`);
                ctx.goIndent(() => {
                    ctx.writeLine(`if(childCD) {`);
                    ctx.goIndent(() => {
                        ctx.writeLine(`childCD.destroy();`);
                        ctx.writeLine(`$runtime.removeElementsBetween(${n.el}, finalLabel);`);
                    });
                    ctx.writeLine(`}`);
                    ctx.writeLine(`childCD = null;`);
                    ctx.writeLine(`if($ComponentConstructor) {`);
                    ctx.goIndent(() => {
                        ctx.writeLine(`childCD = $cd.new();`);
                        ctx.build(n.component);
                    });
                    ctx.writeLine(`}`);
                });
                ctx.writeLine(`});`);
            });
            ctx.writeLine('}');
        })};
    }
};
