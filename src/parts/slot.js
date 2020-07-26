
import { unwrapExp, assert, isSimpleName } from '../utils';

export function attachSlot(slotName, label, node) {
    let placeholder = '';

    let bind = [];
    if(node.attributes && node.attributes.length) {
        node.attributes.forEach(prop => {
            let name = prop.name;
            let value = prop.value;
            if(name[0] == '{') {
                assert(value == null);
                value = name;
                name = unwrapExp(name);
            };
            assert(value != null);
            assert(isSimpleName(name));
            if(value[0] == '{') {
                value = unwrapExp(value);
                bind.push(`
                    if('set_${name}' in s) {
                        $watch($cd, () => (${value}), s.set_${name}, {ro: true, cmp: $$compareDeep});
                    }
                `);
            } else {
                bind.push(`
                    if('set_${name}' in s) s.set_${name}(\`${this.Q(value)}\`);
                `);
            }
        });
    };

    if(node.body && node.body.length) {
        let block = this.buildBlock(node);
        placeholder = ` else {
            ${block.source};
            let $tpl = $$htmlToFragment(\`${this.Q(block.tpl)}\`);
            ${block.name}($cd, $tpl);
            ${label}.parentNode.insertBefore($tpl, ${label}.nextSibling);
        }`;
    }
    
    return {source: `{
        let $slot = $option.slots && $option.slots.${slotName};
        if($slot) {
            let s = $slot(${label});
            $cd.d(s.destroy);
            ${bind.join('\n')}
        } ${placeholder};
    }`};
};
