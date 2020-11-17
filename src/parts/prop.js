
import { parseText } from '../parser.js';
import { assert, detectExpressionType, isSimpleName, unwrapExp } from '../utils.js'


export function bindProp(prop, makeEl, node) {
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
                return {bind: `
                    ${node.spreadObject}.spread(() => ${name});
                `};
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
        return {bind: `${target}=${makeEl()};`};
    } else if(name == 'on') {
        if(arg == '@') {
            assert(!prop.value);
            return {bind: `
                {
                    for(let event in $option.events) {
                        $runtime.addEvent($cd, ${makeEl()}, event, $option.events[event]);
                    }
                }
            `};
        }
        let mod = '', opts = arg.split(/[\|:]/);
        let event = opts.shift();
        let exp, handler, funcName;
        if(prop.value) {
            exp = getExpression();
        } else {
            if(!opts.length) {
                // forwarding
                return {bind: `
                    $runtime.addEvent($cd, ${makeEl()}, "${event}", ($event) => {
                        const fn = $option.events.${event};
                        if(fn) fn($event);
                    });\n`
                };
            }
            handler = opts.pop();
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
            let bind
            if(exp.indexOf('$element') >= 0) {
                bind = `{
                    let $element=${makeEl()};
                    const ${funcName} = ${exp};
                    $runtime.addEvent($cd, $element, "${event}", ($event) => { ${mod} ${funcName}($event); $$apply();});
                }`;
            } else {
                bind = `
                    const ${funcName} = ${exp};
                    $runtime.addEvent($cd, ${makeEl()}, "${event}", ($event) => { ${mod} ${funcName}($event); $$apply();});
                `;
            }
            return {bind};
        } else if(handler) {
            this.checkRootName(handler);
            return {bind: `
                    $runtime.addEvent($cd, ${makeEl()}, "${event}", ($event) => { ${mod} ${handler}($event); $$apply();});
                `
            };
        } else {
            let bind
            if(exp.indexOf('$element') >= 0) {
                bind = `{
                    let $element=${makeEl()};
                    $runtime.addEvent($cd, $element, "${event}", ($event) => { ${mod} ${this.Q(exp)}; $$apply(); });
                }`
            } else {
                bind = `
                    $runtime.addEvent($cd, ${makeEl()}, "${event}", ($event) => { ${mod} ${this.Q(exp)}; $$apply(); });
                `
            }
            return {bind};
        }
    } else if(name == 'bind') {
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

        let spreading = '';
        if(node.spreadObject) spreading = `${node.spreadObject}.except(['${attr}']);`;

        let argName = 'a' + (this.uniqIndex++);

        return {bind: `
            ${spreading}
            $runtime.bindInput($cd, ${makeEl()}, '${attr}', () => ${exp}, ${argName} => {${exp} = ${argName}; $$apply();});
        `};
    } else if(name == 'style' && arg) {
        let styleName = arg;
        let exp = prop.value ? getExpression() : styleName;
        if(exp.indexOf('$element') >= 0) {
            return {bind: `{
                    let $element = ${makeEl()};
                    $runtime.bindStyle($cd, $element, '${styleName}', () => (${exp}));
                }`};
        } else {
            return {bind: `
                $runtime.bindStyle($cd, ${makeEl()}, '${styleName}', () => (${exp}));
            `};
        }
    } else if(name == 'use') {
        if(arg) {
            assert(isSimpleName(arg), 'Wrong name: ' + arg);
            this.checkRootName(arg);
            let args = prop.value ? `, () => [${getExpression()}]` : '';
            return {bind: `$runtime.bindAction($cd, ${makeEl()}, ${arg}${args});`};
        }
        let exp = getExpression();
        return {bind: `$tick(() => { let $element=${makeEl()}; ${exp}; $$apply(); });`};
    } else if(name == 'class') {
        if(node.__skipClass) return {};
        if(!this.css) return {prop: prop.content};
        
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
            return classes.some(name => this.css.isExternalClass(name));
        });

        if(compound) {
            let defaultHash = '';
            if(node.classes.has(this.css.id)) defaultHash = `,'${this.css.id}'`;
            node.classes.clear();
            this.use.resolveClass = true;
            let exp = props.map(prop => {
                if(prop.name == 'class') {
                    return this.parseText(prop.value).result;
                } else {
                    let className = prop.name.slice(6);
                    assert(className);
                    let exp = prop.value ? unwrapExp(prop.value) : className;
                    return `(${exp}) ? \`${this.Q(className)}\` : ''`;
                }
            }).join(') + \' \' + (');
            return {bind: `
                $watchReadOnly($cd, () => $$resolveClass((${exp})${defaultHash}), value => $runtime.setClassToElement(${makeEl()}, value));
            `};
        } else {
            let bind = [];
            props.forEach(prop => {
                if(prop.name == 'class') {
                    prop.value.trim().split(/\s+/).forEach(name => {
                        node.classes.add(name);
                    });
                } else {
                    let className = prop.name.slice(6);
                    assert(className);
                    let exp = prop.value ? unwrapExp(prop.value) : className;
                    bind.push(`$runtime.bindClass($cd, ${makeEl()}, () => !!(${exp}), '${className}');`);
                }
            });
            return {bind: bind.join('\n')};
        }
    } else {
        if(prop.value && prop.value.indexOf('{') >= 0) {
            const parsed = this.parseText(prop.value);
            let exp = parsed.result;
            let hasElement = prop.value.indexOf('$element') >= 0;

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
            if(propList[name]) {
                if(hasElement) {
                    return {bind: `{
                        let $element=${makeEl()};
                        $watchReadOnly($cd, () => (${exp}), (value) => {$element.${name} = value;});
                    }`};
                } else {
                    return {bind: `$watchReadOnly($cd, () => (${exp}), (value) => {${makeEl()}.${name} = value;});`};
                }
            } else {
                if(hasElement) {
                    return {
                        bind: `{
                            let $element=${makeEl()};
                            $runtime.bindAttribute($cd, $element, '${name}', () => (${exp}));
                        }`
                    };
                } else {
                    let el = makeEl();
                    return {
                        bind: `
                            $runtime.bindAttribute($cd, ${el}, '${name}', () => (${exp}));
                        `
                    };
                }
            }
        }

        if(node.spreadObject) {
            return {bind: `
                ${node.spreadObject}.attr('${name}', '${prop.value}');
            `};
        }

        return {
            prop: prop.content
        }
    }
};
