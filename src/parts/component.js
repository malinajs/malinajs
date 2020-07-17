
import { parseElement } from '../parser.js'
import { assert, detectExpressionType } from '../utils'


export function makeComponent(node, makeEl) {
    let propList = parseElement(node.openTag);
    let binds = [];
    let props = [];
    propList.forEach(prop => {
        let name = prop.name;
        let value = prop.value;
        if(name[0] == '#') {
            assert(!value, 'Wrong ref');
            let name = name.substring(1);
            binds.push(`${name} = $component;`);
            return;
        }
        if(name[0] == '{') {
            assert(!value, 'Wrong prop');
            let rx = name.match(/^\{(.*)\}$/);
            assert(rx, 'Wrong prop');
            value = name;
            name = rx[1];
            assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
        }
        assert(value, 'Empty property');
        if(name.startsWith('bind:')) {
            let inner = name.substring(5);
            let rx = value.match(/^\{(.*)\}$/);
            assert(rx, 'Wrong property: ' + prop.content)
            let outer = rx[1];
            props.push(`props.${inner} = ${outer};`);
            binds.push(`
                if('${inner}' in $component) {
                    $watch($cd, () => (${outer}), (value) => {$component.${inner} = value}, {ro: true, value: ${outer}});
                    $watchReadOnly($component.$cd, () => ($component.${inner}), (value) => {
                        if(${outer} === value) return;
                        ${outer} = value; $$apply();
                    });
                } else console.error("Component ${node.name} doesn't have prop ${inner}");
        `);
        } else if(value.indexOf('{') >= 0) {
            let exp = this.parseText(value);
            let fname = 'pf' + (this.uniqIndex++);
            let valueName = 'v' + (this.uniqIndex++);
            props.push(`
                let ${fname} = () => (${exp});
                let ${valueName} = ${fname}()
                props.${name} = ${valueName};
            `);
            binds.push(`
                if('${name}' in $component) {
                    $watch($cd, ${fname}, (value) => {$component.${name} = value}, {ro: true, value: ${valueName}});
                } else console.error("Component ${node.name} doesn't have prop ${name}");
            `);
        } else {
            props.push(`props.${name} = \`${this.Q(value)}\``);
        }
    });

    return {
        bind:`
        {
            let props = {};
            ${props.join('\n')};
            let $component = ${node.name}(${makeEl()}, {afterElement: true, noMount: true, props});
            if($component) {
                if($component.destroy) $cd.d($component.destroy);
                ${binds.join('\n')};
                if($component.onMount) $cd.once($component.onMount);
            }
    }`};
};
