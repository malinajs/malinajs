
import { parseElement, parseText } from '../parser.js'

export function makeComponent(node, makeEl) {
    let props = parseElement(node.openTag);
    let binds = [];
    props.forEach(prop => {
        if(prop.value.indexOf('{') >= 0) {
            let exp = parseText(prop.value, true);
            binds.push(`
                if($component.setProp_${prop.name}) {
                    $watch($cd, () => (${exp}), $component.setProp_${prop.name}, {cmp: $$compareDeep, ro: true});
                } else console.error("Component ${node.name} doesn't have prop ${prop.name}");
            `);
        } else {
            // bind as text
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
