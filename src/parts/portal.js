import { trimEmptyNodes, unwrapExp } from '../utils.js';
import { xNode } from '../xnode.js';


export function attachPortal(node, requireCD) {
  const body = trimEmptyNodes(node.body || []);
  if (!body.length) return;

  const bb = this.buildBlock({ body }, {
    inline: true,
    template: {
      name: '$parentElement',
      cloneNode: true,
      requireFragment: true
    }
  });

  this.require('$component');

  let mount = node.attributes.find((a) => a.name == 'mount')?.value;
  if (mount) mount = unwrapExp(mount);

  const result = xNode('portal', {
    $compile: [bb.source],
    $deps: [bb.requireCD],
    mount,
    source: bb.source,
    template: bb.template,
    requireCD
  }, (ctx, n) => {
    if (n.$deps[0].value) n.requireCD.$value(true);
    const label = n.mount || 'document.body';
    ctx.writeLine('{');
    ctx.indent++;
    ctx.add(n.template);
    ctx.add(n.source);
    ctx.writeLine('let $$first = $parentElement[$runtime.firstChild];');
    ctx.writeLine('let $$last = $parentElement.lastChild;');
    ctx.writeLine(`$runtime.cd_onDestroy(${n.$deps[0].value ? '$cd' : '$component'}, () => $runtime.$$removeElements($$first, $$last));`);
    ctx.writeLine(`$tick(() => ${label}.appendChild($parentElement));`);
    ctx.indent--;
    ctx.writeLine('}');
  });
  requireCD.$depends(result);
  return result;
}
