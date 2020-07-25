
export function attachSlot(slotName, label, node) {
    let placeholder = '';
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
        } ${placeholder};
    }`};
};
