
import { parseElement, parseText } from '../parser.js'

export function makeComponent(node, makeEl) {
    let props = parseElement(node.openTag);
    let binds = [];
    props.forEach(prop => {
        if(prop.value.indexOf('{') >= 0) {
            let exp = parseText(prop.value, true);
            binds.push(`
                if($component.setProp_${prop.name}) {
                    $watch($cd, () => (${exp}), $component.setProp_${prop.name}, {d: true, ro: true});
                } else console.error("Component ${node.name} doesn't have prop ${prop.name}");
            `);
        } else {
            // bind as text
        }
    });

    return {bind:`{
        let $component = ${node.name}(${makeEl()}, {afterElement: true});
        if($component) {
            if($component.destroy) $cd.d($component.destroy);
            ${binds.join('\n')};
        }
    }`};
};
