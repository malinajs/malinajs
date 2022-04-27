import { trimEmptyNodes, unwrapExp } from '../utils.js';
import { xNode } from '../xnode.js';


export function attachPortal(node) {
  let body = trimEmptyNodes(node.body || []);
  if(!body.length) return;

  let bb = this.buildBlock({ body }, {
    inline: true,
    template: {
      name: '$parentElement',
      cloneNode: true,
      requireFragment: true
    }
  });

  let mount = node.attributes.find(a => a.name == 'mount')?.value;
  if(mount) mount = unwrapExp(mount);

  const result = xNode('portal', {
    $compile: [bb.source],
    mount,
    source: bb.source,
    template: bb.template
  }, (ctx, n) => {
    let label = n.mount || 'document.body';
    ctx.writeLine('{');
    ctx.indent++;
    ctx.add(n.template);
    ctx.add(n.source);
    ctx.writeLine('let $$first = $parentElement.firstChild;');
    ctx.writeLine('let $$last = $parentElement.lastChild;');
    ctx.writeLine(`$runtime.$onDestroy(() => $runtime.$$removeElements($$first, $$last));`);
    ctx.writeLine(`$tick(() => ${label}.appendChild($parentElement));`);
    ctx.indent--;
    ctx.writeLine('}');
  });
  return result;
}
