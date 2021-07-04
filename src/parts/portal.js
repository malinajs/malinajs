
import { trimEmptyNodes, xNode, unwrapExp } from '../utils.js';


export function attachPortal(node) {
    let body = trimEmptyNodes(node.body || []);
    if(!body.length) return;
    let block = this.buildBlock({body}, {inline: true});

    let mount = node.attributes.find(a => a.name == 'mount')?.value;
    if(mount) mount = unwrapExp(mount);

    this.require('$cd');

    return xNode('portal', {
        mount,
        source: block.source,
        template: xNode('template', {
            name: '$parentElement',
            body: block.tpl,
            svg: block.svg
        })
    }, (ctx, n) => {
        let label = n.mount || 'document.body';
        ctx.writeLine('{');
        ctx.indent++;
        ctx.build(n.template);
        ctx.build(n.source);
        ctx.writeLine(`let $$first = $parentElement[$runtime.firstChild];`);
        ctx.writeLine(`let $$last = $parentElement.lastChild;`);
        ctx.writeLine(`$runtime.cd_onDestroy($cd, () => $runtime.$$removeElements($$first, $$last));`);
        ctx.writeLine(`$tick(() => ${label}.appendChild($parentElement));`);
        ctx.indent--;
        ctx.writeLine('}');
    });
}
