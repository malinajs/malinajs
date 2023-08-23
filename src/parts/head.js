import { assert } from '../utils.js';
import { xNode } from '../xnode.js';


export function attachHead(n) {
  if(n.elArg == 'window' || n.elArg == 'body') {
    let name = 'el' + (this.uniqIndex++);
    let block = this.buildBlock({ body: [n] }, { malinaElement: true, inline: true, oneElement: name, bindAttributes: true });
    if(block.source) {
      return xNode('block', {
        name,
        target: n.elArg,
        source: block.source
      }, (ctx, n) => {
        if(n.target == 'window') ctx.writeLine(`let ${n.name} = window;`);
        else ctx.writeLine(`let ${n.name} = document.body;`);
        ctx.add(n.source);
      });
    }
  } else if(n.elArg == 'head') {
    let title;
    let body = (n.body || []).filter(n => {
      if(n.type == 'text') return false;
      if(n.name == 'title') {
        title = n;
        return false;
      }
      return true;
    });

    let d = {
      $wait: ['apply']
    };
    if(title?.body?.[0]) {
      assert(title.body[0].type == 'text');
      let r = this.parseText(title.body[0].value);
      if(r.parts.some(i => i.type == 'exp')) {
        d.dynTitle = r.result;
      } else {
        d.title = r.result;
      }
    }
    if(body.length) {
      let bb = this.buildBlock({ body }, {
        inline: true,
        template: {
          name: '$parentElement',
          cloneNode: true,
          requireFragment: true
        }
      });
      d.source = bb.source;
      d.template = bb.template;

      this.require('$onDestroy');
    }

    const result = xNode('malina:head', d, (ctx, n) => {
      if(n.title != null) ctx.writeLine(`document.title = ${n.title};`);
      if(n.dynTitle) {
        if(this.inuse.apply) {
          ctx.writeLine(`$watch(() => (${n.dynTitle}), (value) => {document.title = value;});`);
        } else ctx.writeLine(`document.title = ${n.dynTitle};`);
      }

      if(n.template) {
        ctx.writeLine('{');
        ctx.indent++;
        ctx.add(n.template);
        ctx.add(n.source);
        ctx.writeLine('let a=$parentElement.firstChild, b=$parentElement.lastChild;');
        ctx.writeLine('$onDestroy(() => {$runtime.removeElements(a, b)});');
        ctx.writeLine('document.head.appendChild($parentElement);');
        ctx.indent--;
        ctx.writeLine('}');
      }
    });
    return result;
  } else throw 'Wrong tag';
}
