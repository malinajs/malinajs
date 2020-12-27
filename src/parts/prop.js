
import { assert, detectExpressionType, isSimpleName, unwrapExp, xNode } from '../utils.js'


export function bindProp(prop, node, element) {
    let name, arg;
    if(prop.name[0] == '@') {
        arg = prop.name.substring(1);
        name = 'on';
    }
    if(!name && prop.name[0] == ':') {
        name = 'bind';
        arg = prop.name.substring(1);
    }
    if(!name && prop.name[0] == '*') {
        let rx = prop.name.match(/^\*\{.*\}$/);
        if(rx) {
            assert(prop.value == null, 'wrong binding: ' + prop.content);
            name = 'use';
            prop.value = prop.name.substring(1);
        } else {
            name = 'use';
            arg = prop.name.substring(1);
        }
    }
    if(!name && prop.value == null) {
        let rx = prop.name.match(/^\{(.*)\}$/);
        if(rx) {
            name = rx[1];
            if(name.startsWith('...')) {
                // spread operator
                name = name.substring(3);
                assert(detectExpressionType(name) == 'identifier');
                return {bind: `${node.spreadObject}.spread(() => ${name});`};
            } else {
                prop.value = prop.name;
            }
        }
    }
    if(!name) {
        let r = prop.name.match(/^(\w+)\:(.*)$/)
        if(r) {
            name = r[1];
            arg = r[2];
        } else name = prop.name;
    }

    function getExpression() {
        let exp = prop.value.match(/^\{(.*)\}$/)[1];
        assert(exp, prop.content);
        return exp;
    }

    if(name[0] == '#') {
        let target = name.substring(1);
        assert(isSimpleName(target), target);
        this.checkRootName(target);
        return {bind: `${target}=${element.bindName()};`};
    } else if(name == 'on') {
        if(arg == '@') {
            assert(!prop.value);
            const bind = xNode('forwardAllEvents', {
                el: element.bindName()
            }, (ctx, data) => {
                ctx.writeLine(`for(let event in $option.events)`);
                ctx.goIndent(() => {
                    ctx.writeLine(`$runtime.addEvent($cd, ${data.el}, event, $option.events[event]);`);
                });
            });
            return {bind};
        }
        let mod = '', opts = arg.split(/[\|:]/);
        let event = opts.shift();
        let exp, handler, funcName;

        if(event[0] == '@') {  // forwarding
            event = event.substring(1);
            assert(!prop.value);
            return {bind: xNode('forwardEvent', {
                event,
                el: element.bindName()
            }, (ctx, data) => {
                ctx.writeLine(`$runtime.addEvent($cd, ${data.el}, "${data.event}", ($event) => {`
                    + `$option.events.${data.event} && $option.events.${data.event}($event)});`);
            })};
        }

        if(prop.value) {
            exp = getExpression();
        } else {
            if(opts.length) handler = opts.pop();
            else handler = event;
        };
        assert(event, prop.content);
        assert(!handler ^ !exp, prop.content);

        let needPrevent, preventInserted;
        opts.forEach(opt => {
            if(opt == 'preventDefault') {
                if(preventInserted) return;
                mod += '$event.preventDefault();';
                preventInserted = true;
            } else if(opt == 'stopPropagation') {
                mod += '$event.stopPropagation();';
            } else if(opt == 'enter') {
                mod += 'if($event.keyCode != 13) return;';
                needPrevent = true;
            } else if(opt == 'escape') {
                mod += 'if($event.keyCode != 27) return;';
                needPrevent = true;
            } else throw 'Wrong modificator: ' + opt;
        });
        if(needPrevent && !preventInserted) mod += '$event.preventDefault();';
        if(mod) mod += ' ';

        this.detectDependency(exp || handler);

        if(exp) {
            let type = detectExpressionType(exp);
            if(type == 'identifier') {
                handler = exp;
                exp = null;
            } else if(type == 'function') {
                funcName = 'fn' + (this.uniqIndex++);
            };
        }

        if(funcName) {
            this.require('apply');
            let bind = xNode('bindEvent', {
                event,
                mod,
                funcName,
                exp,
                el: element.bindName(),
                $element: exp.includes('$element')
            }, (ctx, n) => {
                if(n.$element) {
                    ctx.writeLine('{');
                    ctx.indent++;
                    ctx.writeLine(`let $element=${n.el};`)
                }
                ctx.writeLine(`const ${n.funcName} = ${n.exp};`);
                ctx.writeLine(`$runtime.addEvent($cd, ${n.el}, '${n.event}', ($event) => { ${n.mod}${n.funcName}($event); $$apply();});`);
                if(n.$element) {
                    ctx.indent--;
                    ctx.writeLine('}');
                }
            });
            return {bind};
        } else {
            this.require('apply');
            const bind = xNode('bindEvent', {
                el: element.bindName(),
                event,
                mod
            }, (ctx, data) => {
                let exp = data.handlerName ? `${data.handlerName}($event);` : data.exp;
                let l = data.$element ? `let $element=${data.el}; ` : '';
                ctx.writeLine(`$runtime.addEvent($cd, ${data.el}, '${data.event}', ($event) => { ${l}${data.mod}${exp}; $$apply(); });`);
            });

            if(handler) {
                this.checkRootName(handler);
                bind.handlerName = handler;
            } else {
                bind.exp = this.Q(exp);
                bind.$element = exp.includes('$element');
            }

            return {bind};
        }
    } else if(name == 'bind') {
        this.require('apply');
        let exp;
        arg = arg.split(/[\:\|]/);
        let attr = arg.shift();
        assert(attr, prop.content);

        if(prop.value) exp = getExpression();
        else {
            if(arg.length) exp = arg.pop();
            else exp = attr;
        }
        let inputType = null;
        if(node.name == 'input') {
            node.attributes.some(a => {
                if(a.name == 'type') {
                    inputType = a.value;
                    return true;
                }
            });
        }

        assert(['value', 'checked', 'valueAsNumber', 'valueAsDate', 'selectedIndex'].includes(attr), 'Not supported: ' + prop.content);
        assert(arg.length == 0);
        assert(detectExpressionType(exp) == 'identifier', 'Wrong bind name: ' + prop.content);
        if(attr == 'value' && ['number', 'range'].includes(inputType)) attr = 'valueAsNumber';
        this.detectDependency(exp);

        let spreading = '';
        if(node.spreadObject) spreading = `${node.spreadObject}.except(['${attr}']);`;

        let argName = 'a' + (this.uniqIndex++);

        return {bind: xNode('bindInput', {
            el: element.bindName()
        }, (ctx, n) => {
            if(spreading) ctx.writeLine(spreading);
            ctx.writeLine(`$runtime.bindInput($cd, ${n.el}, '${attr}', () => ${exp}, ${argName} => {${exp} = ${argName}; $$apply();});`);
        })};
    } else if(name == 'style' && arg) {
        this.require('apply');
        let styleName = arg;
        let exp = prop.value ? getExpression() : styleName;
        this.detectDependency(exp);

        let hasElement = exp.includes('$element');
        return {bind: xNode('block', {
            scope: hasElement,
            body: [xNode('bindStyle', {
                el: element.bindName(),
                styleName,
                exp,
                hasElement
            }, (ctx, data) => {
                if(data.hasElement) ctx.writeLine(`let $element=${data.el};`);
                ctx.writeLine(`$runtime.bindStyle($cd, ${data.el}, '${data.styleName}', () => (${data.exp}));`);
            })]
        })};
    } else if(name == 'use') {
        this.require('apply');
        if(arg) {
            assert(isSimpleName(arg), 'Wrong name: ' + arg);
            this.checkRootName(arg);
            let args = prop.value ? `, () => [${getExpression()}]` : '';
            this.detectDependency(args);
            return {bind: `$runtime.bindAction($cd, ${element.bindName()}, ${arg}${args});`};
        }
        let exp = getExpression();
        this.detectDependency(exp);
        return {bind: `$tick(() => { let $element=${element.bindName()}; ${exp}; $$apply(); });`};
    } else if(name == 'class') {
        if(node.__skipClass) return {};
        node.__skipClass = true;

        let props = node.attributes.filter(a => a.name == 'class' || a.name.startsWith('class:'));

        let compound = props.some(prop => {
            let classes;
            if(prop.name == 'class') {
                if(prop.value.indexOf('{') >= 0) return true;
                classes = prop.value.trim().split(/\s+/);
            } else {
                classes = [prop.name.slice(6)];
            }
            return classes.some(name => {
                if(this.css.isExternalClass(name)) return true;
                if(name[0] == '$') {
                    this.css.markAsExternal(name.substring(1));
                    return true;
                }
            });
        });

        if(compound) {
            this.require('apply');
            let defaultHash = '';
            if(node.classes.has(this.css.id)) defaultHash = this.css.id;
            node.classes.clear();
            this.require('resolveClass');
            let exp = props.map(prop => {
                if(prop.name == 'class') {
                    return this.parseText(prop.value).result;
                } else {
                    let className = prop.name.slice(6);
                    assert(className);
                    let exp = prop.value ? unwrapExp(prop.value) : className;
                    this.detectDependency(exp);
                    return `(${exp}) ? \`${this.Q(className)}\` : ''`;
                }
            }).join(') + \' \' + (');
            const bind = xNode('compound-class', {
                el: element.bindName(),
                exp,
                defaultHash
            }, (ctx, data) => {
                let base = data.defaultHash ? `,'${data.defaultHash}'` : '';
                ctx.writeLine(`$watchReadOnly($cd, () => $$resolveClass((${data.exp})${base}), value => $runtime.setClassToElement(${data.el}, value));`);
            });
            return {bind};
        } else {
            let bind = xNode('block');
            props.forEach(prop => {
                if(prop.name == 'class') {
                    prop.value.trim().split(/\s+/).forEach(name => {
                        node.classes.add(name);
                    });
                } else {
                    this.require('apply');
                    let className = prop.name.slice(6);
                    assert(className);
                    let exp = prop.value ? unwrapExp(prop.value) : className;
                    this.detectDependency(exp);
                    bind.push(xNode('bindClass', {
                        el: element.bindName(),
                        className,
                        exp,
                        $element: exp.includes('$element')
                    }, (ctx, n) => {
                        if(n.$element) {
                            ctx.writeLine(`{`);
                            ctx.indent++;
                            ctx.writeLine(`let $element = ${n.el};`)
                        }
                        ctx.writeLine(`$runtime.bindClass($cd, ${n.el}, () => !!(${n.exp}), '${n.className}');`)
                        if(n.$element) {
                            ctx.indent--;
                            ctx.writeLine(`}`);
                        }
                    }));
                }
            });
            return {bind};
        }
    } else {
        if(prop.value && prop.value.indexOf('{') >= 0) {
            this.require('apply');
            const parsed = this.parseText(prop.value);
            this.detectDependency(parsed);
            let exp = parsed.result;
            let hasElement = prop.value.includes('$element');

            if(node.spreadObject) {
                return {bind: `
                    ${node.spreadObject}.prop('${name}', () => ${exp});
                `};
            }
            const propList = {
                hidden: true,
                checked: true,
                value: true,
                disabled: true,
                selected: true,
                innerHTML: true,
                innerText: true,
                placeholder: true,
                src: true
            }

            return {bind: xNode('block', {
                scope: hasElement,
                body: [
                    xNode('bindAttribute', {
                        name,
                        exp,
                        hasElement,
                        el: element.bindName()
                    }, (ctx, data) => {
                        if(data.hasElement) ctx.writeLine(`let $element=${data.el};`);
                        if(propList[name]) {
                            ctx.writeLine(`$watchReadOnly($cd, () => (${data.exp}), (value) => {${data.el}.${name} = value;});`);
                        } else {
                            ctx.writeLine(`$runtime.bindAttribute($cd, ${data.el}, '${data.name}', () => (${data.exp}));`);
                        }
                    })
                ]
            })};
        }

        if(node.spreadObject) {
            return {bind: `
                ${node.spreadObject}.attr('${name}', '${prop.value}');
            `};
        }

        element.attributes.push({
            name: prop.name,
            value: prop.value
        });
    }
};
