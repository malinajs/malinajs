
import { parseElement } from '../parser.js'
import { assert } from '../utils'


export function makeComponent(node, makeEl) {
    let propList = parseElement(node.openTag);
    let binds = [];
    let props = [];
    propList.forEach(prop => {
        if(prop.name[0] == '#') {
            assert(!prop.value, node.openTag);
            let name = prop.name.substring(1);
            binds.push(`${name} = $component;`);
            return;
        }
        assert(prop.value, 'Empty property');
        if(prop.name.startsWith('bind:')) {
            let inner = prop.name.substring(5);
            let rx = prop.value.match(/^\{(.*)\}$/);
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
        } else if(prop.value.indexOf('{') >= 0) {
            let exp = this.parseText(prop.value);
            let fname = 'pf' + (this.uniqIndex++);
            let valueName = 'v' + (this.uniqIndex++);
            props.push(`
                let ${fname} = () => (${exp});
                let ${valueName} = ${fname}()
                props.${prop.name} = ${valueName};
            `);
            binds.push(`
                if('${prop.name}' in $component) {
                    $watch($cd, ${fname}, (value) => {$component.${prop.name} = value}, {ro: true, value: ${valueName}});
                } else console.error("Component ${node.name} doesn't have prop ${prop.name}");
            `);
        } else {
            props.push(`props.${prop.name} = \`${this.Q(prop.value)}\``);
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
