
import { parseElement, parseText } from '../parser.js'
import { assert, Q } from '../utils'


export function makeComponent(node, makeEl) {
    let props = parseElement(node.openTag);
    let binds = [];
    props.forEach(prop => {
        assert(prop.value, 'Empty property');
        if(prop.value.indexOf('{') >= 0) {
            let exp = parseText(prop.value, true);
            binds.push(`
                if('${prop.name}' in $component) {
                    $watch($cd, () => (${exp}), (value) => {$component.${prop.name} = value}, {cmp: $$compareDeep, ro: true});
                } else console.error("Component ${node.name} doesn't have prop ${prop.name}");
            `);
        } else {
            let value = prop.value.match(/^['"]?(.*?)['"]?$/)[1];
            binds.push(`
                if('${prop.name}' in $component) {
                    $component.${prop.name} = \`${Q(value)}\`;
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
