
import { assert, detectExpressionType, isSimpleName, unwrapExp, xNode, trimEmptyNodes, toCamelCase, isNumber } from '../utils'


export function makeComponent(node, element) {
    let propList = node.attributes;
    let forwardAllEvents = false;

    this.require('$context', '$cd');

    let options = [];
    let dynamicComponent;

    let propLevel = 0, propLevelType;

    let componentName = node.name;
    if(componentName == 'component') {
        assert(node.elArg);
        dynamicComponent = node.elArg[0] == '{' ? unwrapExp(node.elArg) : node.elArg;
    }

    let passOption = {};

    let head = xNode('block');
    let body = xNode('block');

    let depsPush = [];
    head.push(xNode('push', {
        $deps: depsPush
    }, (ctx, n) => {
        if(n.$deps.some(i => i.requirePush)) ctx.writeLine(`let $$push = $runtime.noop;`)
    }));
    body.push(xNode('push', {
        $deps: depsPush
    }, (ctx, n) => {
        if(n.$deps.some(i => i.requirePush)) ctx.writeLine(`$$push = $child.push;`)
    }));

    const propNode = xNode('prop', {
        $deps: []
    }, (ctx, n) => {
        if(!propLevel && !propLevelType) return;
        if(propLevel) ctx.writeLine(`let $$lvl = [], props = $runtime.makeTree(${propLevel}, $$lvl);`);
        else {
            let inline = n.$deps.map(p => p._inline).filter(p => p).join(', ');
            ctx.writeLine(`let props = {${inline}};`);
        }
    });
    head.push(propNode);

    head.push(xNode('events', ctx => {
        if(forwardAllEvents) {
            ctx.writeLine('let events = {...$option.events};');
        } else if(passOption.events) {
            ctx.writeLine('let events = {};');
        }
    }));

    head.push(xNode('slots', ctx => {
        if(passOption.slots) ctx.writeLine('let slots = {};');
    }));

    head.push(xNode('class', ctx => {
        if(passOption.class) ctx.writeLine(`let $class = {}`);
    }));

    head.push(xNode('anchor', ctx => {
        if(passOption.anchor) ctx.writeLine('let anchor = {};');
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
            if(!slot.body.length) return;
            assert(isSimpleName(slot.name));
            passOption.slots = true;

            let props;
            let rx = slot.value && slot.value.match(/^#slot\S*\s+(.*)$/);
            if(rx) {
                props = rx[1].trim().split(/\s*,\s*/);
                assert(props.length);
                props.forEach(n => {
                    assert(isSimpleName(n), 'Wrong prop for slot');
                });
            }

            let contentNodes = trimEmptyNodes(slot.body);
            if(contentNodes.length == 1 && contentNodes[0].type == 'node' && contentNodes[0].name == 'slot') {
                let parentSlot = contentNodes[0];
                if(!parentSlot.body || !parentSlot.body.length) {
                    head.push(xNode('empty-slot', {
                        childName: slot.name,
                        parentName: parentSlot.elArg || 'default'
                    }, (ctx, n) => {
                        ctx.writeLine(`slots.${n.childName} = $option.slots?.${n.parentName};`)
                    }));
                    return;
                }
            }

            if(props) this.require('apply');
            this.require('$cd');

            let block = this.buildBlock(slot, {inline: true});

            const template = xNode('template', {
                body: block.tpl,
                svg: block.svg,
                inline: true
            });

            head.push(xNode('slot', {
                name: slot.name,
                template,
                bind: block.source,
                componentName,
                props
            }, (ctx, n) => {
                if(n.bind) {
                    ctx.write(true, `slots.${n.name} = $runtime.makeSlot($cd, ($cd, $context, $instance_${n.componentName}`);
                    if(n.props) ctx.write(`, props`);
                    ctx.write(`) => {\n`);
                    ctx.goIndent(() => {
                        if(n.bind) {
                            let push = n.props && ctx.inuse.apply;
                            ctx.write(true, `let $parentElement = `);
                            ctx.build(n.template);
                            ctx.write(`;\n`);
                            if(n.props) {
                                ctx.writeLine(`let {${n.props.join(', ')}} = props;`);
                                if(push) ctx.writeLine(`let push = () => ({${n.props.join(', ')}} = props, $$apply());`)
                            }
                            ctx.build(n.bind);
                            if(push) ctx.writeLine(`return {push, el: $parentElement};`);
                            else ctx.writeLine(`return $parentElement;`);
                        } else {
                            ctx.write(true, `return `);
                            ctx.build(n.template);
                            ctx.write(`;\n`);
                        }
                    });
                    ctx.writeLine(`});`);
                } else {
                    ctx.write(true, `slots.${n.name} = $runtime.makeSlotStatic(() => `);
                    ctx.build(n.template);
                    ctx.write(`);\n`);
                }
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
                ctx.goIndent(() => {
                    if(n.$cd) {
                        ctx.writeLine(`let $childCD = $cd.new();`);
                        ctx.writeLine(`{`);
                        ctx.goIndent(() => {
                            ctx.writeLine(`let $cd = $childCD;`);
                            ctx.build(n.source);
                        });
                        ctx.writeLine(`}`);
                        ctx.writeLine(`return () => {$childCD.destroy();}`);
                    } else {
                        ctx.build(n.source);
                    }
                });
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

            if(this.script.readOnly) this.warning('Conflict: read-only and 2-way binding to component')
            this.require('apply');

            let n = xNode('bindProp2', {
                watchName,
                outer,
                inner
            }, (ctx, n) => {
                ctx.writeLine(`const ${n.watchName} = ${this.config.immutable ? '$watchReadOnly' : '$watch'}($cd, () => (${n.outer}), _${n.inner} => {`);
                ctx.goIndent(() => {
                    ctx.writeLine(`props.${n.inner} = _${n.inner};`);
                    ctx.writeLine(`${n.watchName}.pair && ${n.watchName}.pair(${n.watchName}.value);`);
                    ctx.writeLine(`$$push();`);
                    n.requirePush = true;
                });
                if(this.config.immutable) ctx.writeLine(`});`);
                else ctx.writeLine(`}, {ro: true, cmp: $runtime.$$compareDeep});`);
                ctx.writeLine(`$runtime.fire(${n.watchName});`);
            });
            head.push(n);
            depsPush.push(n);
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
                if(this.config.immutable) ctx.writeLine(`});`);
                else ctx.writeLine(`}, $runtime.$$compareDeep);`);
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
                let propObject = propLevel ? `$$lvl[${propLevel}]` : 'props';

                let n = xNode('spread-object', {
                    name,
                    propObject
                }, (ctx, n) => {
                    ctx.writeLine(`$runtime.fire($watch($cd, () => (${n.name}), (value) => {`);
                    ctx.goIndent(() => {
                        ctx.writeLine(`$runtime.spreadObject(${n.propObject}, value);`);
                        ctx.writeLine(`$$push();`);
                        n.requirePush = true;
                    });
                    ctx.writeLine(`}, {ro: true, cmp: $runtime.$$deepComparator(0)}));`);
                });
                head.push(n);
                depsPush.push(n);
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
                this.require('apply');
                callback = `($event) => {${this.Q(exp)}; $$apply();}`;
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
        } else if(this.config.passClass && (name == 'class' || name.startsWith('class:'))) {
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

            let n = xNode('passClass', {
                funcName,
                exp,
                metaClass
            }, (ctx, n) => {
                ctx.writeLine(`const ${n.funcName} = () => $$resolveClass(${n.exp});`);
                ctx.writeLine(`$class['${n.metaClass}'] = ${n.funcName}();`);
                if(ctx.inuse.apply) {
                    ctx.writeLine(`$watch($cd, ${n.funcName}, (result) => {`);
                    ctx.goIndent(() => {
                        ctx.writeLine(`$class['${n.metaClass}'] = result;`);
                        ctx.writeLine(`$$push();`);
                        n.requirePush = true;
                    });
                    ctx.writeLine(`}, {ro: true, value: $class['${n.metaClass}']});`);
                }
            });
            head.push(n);
            depsPush.push(n);

            passOption.class = true;
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
            let n = xNode('staticProp', {
                name,
                value,
                propObject
            }, (ctx, data) => {
                if(!propLevel) data._inline = `${data.name}: ${data.value}`;
                else ctx.writeLine(`${data.propObject}.${data.name} = ${data.value};`);
            });
            head.push(n);
            propNode.$deps.push(n);
        }

        if(name == 'class') name = '_class';

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

                let n = xNode('bindProp', {
                    exp,
                    name,
                    propObject
                }, (ctx, n) => {
                    if(ctx.inuse.apply) {
                        ctx.writeLine(`$runtime.fire(${this.config.immutable ? '$watchReadOnly' : '$watch'}($cd, () => (${n.exp}), _${n.name} => {`);
                        ctx.goIndent(() => {
                            ctx.writeLine(`${n.propObject}.${n.name} = _${n.name};`);
                            ctx.writeLine(`$$push();`);
                            n.requirePush = true;
                        });
                        if(this.config.immutable) ctx.writeLine(`}));`);
                        else ctx.writeLine(`}, {ro: true, cmp: $runtime.$$compareDeep}));`);
                    } else {
                        if(!propLevel) n._inline = `${n.name}: ${n.exp}`;
                        else ctx.writeLine(`${n.propObject}.${n.name} = ${n.exp};`);
                    }
                });
                head.push(n);
                propNode.$deps.push(n);
                depsPush.push(n);
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
        componentName,
        head,
        body,
        options,
        $cd: '$cd'
    }, (ctx, data) => {
        const $cd = data.$cd || '$cd';

        let head = ctx.subBuild(data.head);
        if(head) {
            ctx.addBlock(head);
            data.requireScope = true;
        }

        let body = ctx.subBuild(data.body);

        if(!body) {
            ctx.writeLine(`$runtime.callComponent(${$cd}, $context, ${data.componentName}, ${data.el}, {${data.options.join(', ')}});`);
        } else {
            data.requireScope = true;
            ctx.writeLine(`let $child = $runtime.callComponent(${$cd}, $context, ${data.componentName}, ${data.el}, {${data.options.join(', ')}});`);
            ctx.writeLine(`if($child?.push) {`);
            ctx.goIndent(() => {
                ctx.addBlock(body);
            });
            ctx.writeLine(`}`);
        }
    });

    if(!dynamicComponent) {
        return {bind: xNode('component-scope', {
            component: result
        }, (ctx, n) => {
            let r = ctx.subBuild(n.component);
            
            if(n.component.requireScope) {
                ctx.writeLine('{');
                ctx.goIndent(() => {
                    ctx.addBlock(r);
                })
                ctx.writeLine('}');
            } else ctx.addBlock(r);
        })};
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
                if(ctx.inuse.apply) {
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
                } else {
                    ctx.writeLine(`let $ComponentConstructor = ${n.exp};`);
                    ctx.writeLine(`if($ComponentConstructor) {`);
                    ctx.goIndent(() => {
                        ctx.writeLine(`let childCD = $cd;`);
                        ctx.build(n.component);
                    });
                    ctx.writeLine(`}`);
                }
            });
            ctx.writeLine('}');
        })};
    }
};
