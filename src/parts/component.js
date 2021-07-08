
import { assert, detectExpressionType, isSimpleName, unwrapExp, xNode, trimEmptyNodes, toCamelCase, isNumber } from '../utils'


export function makeComponent(node, element) {
    let propList = node.attributes;
    let forwardAllEvents = false;

    this.require('$context', '$cd');

    let options = [];
    let dynamicComponent;
    let reference = null;
    let propsFn = [], propsSetter = [], $class=[], staticProps = true;

    let componentName = node.name;
    if(componentName == 'component') {
        assert(node.elArg);
        dynamicComponent = node.elArg[0] == '{' ? unwrapExp(node.elArg) : node.elArg;
    } else if(this.config.autoimport) {
        let imported = this.script.autoimport[componentName] || this.script.importedNames.includes(componentName)
            || this.script.rootVariables[componentName] || this.script.rootFunctions[componentName];

        if(!imported) {
            let r = this.config.autoimport(componentName, this.config.path, this);
            if(r) this.script.autoimport[componentName] = r;
        }
    }

    let passOption = {};
    let head = xNode('block');

    head.push(xNode('events', ctx => {
        if(forwardAllEvents) {
            this.require('$events');
            ctx.writeLine('let events = {...$events};');
        } else if(passOption.events) {
            ctx.writeLine('let events = {};');
        }
    }));

    head.push(xNode('slots', ctx => {
        if(passOption.slots) ctx.writeLine('let slots = {};');
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
            name = name.substring(1);
            assert(isSimpleName(name), name);
            this.checkRootName(name);
            reference = name;
            return;
        } else if(name[0] == ':' || name.startsWith('bind:')) {
            let inner, outer;
            if(name[0] == ':') inner = name.substring(1);
            else inner = name.substring(5);
            if(value) outer = unwrapExp(value);
            else outer = inner;
            assert(isSimpleName(inner), `Wrong property: '${inner}'`);
            assert(detectExpressionType(outer) == 'identifier', 'Wrong bind name: ' + outer);
            this.detectDependency(outer);

            if(this.script.readOnly) this.warning('Conflict: read-only and 2-way binding to component')
            this.require('apply');
            staticProps = false;

            if(inner == outer) propsFn.push(`${inner}`);
            else propsFn.push(`${inner}: ${outer}`);
            propsSetter.push(`${inner}: ${outer} = ${outer}`);

            return;
        } else if(name[0] == '{') {
            value = name;
            name = unwrapExp(name);
            if(name.startsWith('...')) {
                name = name.substring(3);
                assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
                this.detectDependency(name);
                staticProps = false;
                propsFn.push(`...${name}`);
                return;
            };
            assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
        } else if(name[0] == '@' || name.startsWith('on:')) {
            if(name.startsWith('@@')) {
                let event = name.substring(2);
                assert(!value);
                passOption.events = true;
                boundEvent(event);
                this.require('$events');
                head.push(xNode('forwardEvent', {
                    event
                }, (ctx, data) => {
                    if(_boundEvents[data.event] > 1) ctx.writeLine(`$runtime.$$addEventForComponent(events, '${data.event}', $events.${data.event});`);
                    else ctx.writeLine(`events.${data.event} = $events.${data.event};`);
                }))
                return;
            }

            let {event, fn} = this.makeEventProp(prop);

            passOption.events = true;
            boundEvent(event);
            head.push(xNode('passEvent', {
                event,
                fn
            }, (ctx, n) => {
                if(_boundEvents[n.event] > 1) {
                    ctx.write(true, `$runtime.$$addEventForComponent(events, '${n.event}', `);
                    ctx.build(n.fn);
                    ctx.write(`);\n`);
                } else {
                    ctx.write(true, `events.${n.event} = `);
                    ctx.build(n.fn);
                    ctx.write(`;\n`);
                }
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
            $class.push(`${metaClass}: $$resolveClass(${exp})`);

            this.require('resolveClass');
            return;
        }

        const staticProp = (name, value) => {
            if(typeof value == 'number') value = '' + value;
            else if(value === true || value === false || value === null) value = '' + value;
            else if(value === void 0) value = 'true'
            else value = '`' + this.Q(value) + '`';
            propsFn.push(`${name}: ${value}`);
        }

        if(name == 'class') name = '_class';

        assert(name.match(/^([\w\$_][\w\d\$_\.\-]*)$/), `Wrong property: '${name}'`);
        name = toCamelCase(name);
        if(value && value.indexOf('{') >= 0) {
            const pe = this.parseText(value);
            this.detectDependency(pe);
            if(pe.parts.length == 1 && isNumber(pe.parts[0].value)) {
                staticProp(name, Number(pe.parts[0].value));
            } else if(pe.parts.length == 1 && (pe.parts[0].value === 'true' || pe.parts[0].value === 'false')) {
                staticProp(name, pe.parts[0].value === 'true');
            } else if(pe.parts.length == 1 && pe.parts[0].value === 'null') {
                staticProp(name, null);
            } else {
                staticProps = false;
                let exp = pe.result;
                if(name == exp) propsFn.push(`${name}`);
                else propsFn.push(`${name}: ${exp}`);
            }
        } else {
            staticProp(name, value);
        }
    });


    if(forwardAllEvents || passOption.events) options.push('events');
    if(passOption.slots) options.push('slots');
    if(passOption.anchor) options.push('anchor');

    let result = xNode('component', {
        el: element.bindName(),
        componentName,
        head,
        options,
        $cd: '$cd',
        props: propsFn,
        propsSetter,
        reference,
        $class
    }, (ctx, n) => {
        const $cd = n.$cd || '$cd';

        let head = ctx.subBuild(n.head);
        if(head) {
            ctx.addBlock(head);
            n.requireScope = true;
        }

        if(n.props.length && staticProps) {
            n.options.push(`props: {${n.props.join(', ')}}`);
            n.props = [];
        }

        ctx.write(true);
        if(n.reference) ctx.write(`${n.reference} = `);
        ctx.write(`$runtime.callComponent(${$cd}, $context, ${n.componentName}, ${n.el}, {${n.options.join(', ')}}`);

        let other = '';
        ctx.indent++;
        if(n.props.length) ctx.write(`,\n`, true, `() => ({${n.props.join(', ')}})`);
        else other = ', null';

        if(ctx.inuse.apply && n.props.length) {
            if(other) ctx.write(other);
            other = '';
            ctx.write(`,`);
            if(n.props.length) ctx.write('\n', true);
            if(this.config.immutable) ctx.write(`$runtime.keyComparator`);
            else ctx.write(`$runtime.$$compareDeep`);
        } else other += ', null';

        if(n.propsSetter.length) {
            if(other) ctx.write(other);
            other = '';
            ctx.write(`,\n`, true, `($$_value) => ({${n.propsSetter.join(', ')}} = $$_value)`);
        } else other += ', null';

        if(n.$class.length) {
            if(other) ctx.write(other);
            other = '';
            ctx.write(`,\n`, true, `() => ({${n.$class.join(', ')}})`);
        } else other += ', null';

        ctx.indent--;
        ctx.write(`);\n`);
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
