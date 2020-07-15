
import { parseElement } from '../parser.js'
import { assert } from '../utils'


export function makeComponent(node, makeEl) {
    let props = parseElement(node.openTag);
    let binds = [];
    props.forEach(prop => {
        assert(prop.value, 'Empty property');
        if(prop.name.startsWith('bind:')) {
            let inner = prop.name.substring(5);
            let rx = prop.value.match(/^\{(.*)\}$/);
            assert(rx, 'Wrong property: ' + prop.content)
            let outer = rx[1];
            binds.push(`
                if('${inner}' in $component) {
                    $watchReadOnly($cd, () => (${outer}), (value) => {$component.${inner} = value});
                    $watchReadOnly($component.$cd, () => ($component.${inner}), (value) => {
                        if(${outer} === value) return;
                        ${outer} = value; $$apply();
                    });
                } else console.error("Component ${node.name} doesn't have prop ${inner}");
            `);
        } else if(prop.value.indexOf('{') >= 0) {
            let exp = this.parseText(prop.value);
            binds.push(`
                if('${prop.name}' in $component) {
                    $watch($cd, () => (${exp}), (value) => {$component.${prop.name} = value}, {cmp: $$compareDeep, ro: true});
                } else console.error("Component ${node.name} doesn't have prop ${prop.name}");
            `);
        } else {
            let value = prop.value.match(/^['"]?(.*?)['"]?$/)[1];
            binds.push(`
                if('${prop.name}' in $component) {
                    $component.${prop.name} = \`${this.Q(value)}\`;
                } else console.error("Component ${node.name} doesn't have prop ${prop.name}");
            `);
        }
    });

    return {bind:`{
        let $component = ${node.name}(${makeEl()}, {afterElement: true, noMount: true});
        if($component) {
            if($component.destroy) $cd.d($component.destroy);
            ${binds.join('\n')};
            if($component.onMount) $cd.once($component.onMount);
        }
    }`};
};
