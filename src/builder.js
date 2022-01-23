import { svgElements, last, replaceElementKeyword, assert, Q } from './utils.js';
import { xNode } from './xnode.js';


export function buildRuntime() {
  this.module.head.push(xNode('$events', (ctx) => {
    if(this.inuse.$events) ctx.write(true, 'const $events = $option.events || {};');
  }));

  this.module.head.push(xNode(this.glob.$component, {
    $hold: ['componentFn']
  }, (ctx, n) => {
    if(n.value) {
      this.require('componentFn');
      ctx.write(true, 'const $component = $runtime.current_component;');
    }
  }));

  this.module.head.push(xNode('$context', {
    $hold: ['componentFn'],
  }, (ctx) => {
    if(this.inuse.$context) {
      this.require('componentFn');
      ctx.write(true, 'const $context = $runtime.$context;');
    }
  }));

  this.module.top.push(xNode(this.glob.$onMount, {
    $hold: ['componentFn']
  }, (ctx, n) => {
    if(n.value) {
      this.require('componentFn');
      ctx.write(true, `import { $onMount } from 'malinajs/runtime.js';`);
    }
  }));

  this.module.top.push(xNode('$onDestroy', (ctx) => {
    if(this.inuse.$onDestroy) ctx.write(true, `import { $onDestroy } from 'malinajs/runtime.js';`);
  }));

  this.module.head.push(xNode(this.glob.apply, {
    $hold: ['componentFn'],
    $wait: ['rootCD']
  }, (ctx, n) => {
    if(n.value || this.inuse.rootCD) {
      this.require('componentFn');
      if(n.value == 'readOnly') ctx.writeLine('const $$apply = $runtime.noop;');
      else ctx.writeLine('const $$apply = $runtime.makeApply();');
    }
  }));

  this.module.head.push(xNode('$emit', (ctx) => {
    if(this.inuse.$emit) ctx.write(true, 'const $emit = $runtime.$makeEmitter($option);');
  }));

  if(this.config.autoSubscribe && !this.script.readOnly) {
    this.module.head.push(xNode('autoSubscribe', {
      $hold: ['apply'],
      names: this.script.autosubscribeNames
    }, (ctx, n) => {
      if(!n.names.length) return;
      this.require('apply');
      ctx.write(true, `$runtime.autoSubscribe(${n.names.join(', ')});`);
    }));
  }

  let runtime = xNode('block', { scope: true, $compile: [] });
  this.module.body.push(runtime);

  let bb = this.buildBlock(this.DOM, {
    inline: true,
    template: {
      name: '$parentElement',
      cloneNode: true
    }
  });
  runtime.push(bb.template);
  runtime.push(xNode('root-event', (ctx) => {
    if(!this.inuse.rootEvent) return;
    ctx.write(true, 'const $$addRootEvent = $runtime.makeRootEvent($parentElement);');
  }));
  runtime.push(bb.source);

  if(this.script.onMount) runtime.push('$runtime.$onMount(onMount);');
  if(this.script.onDestroy) runtime.push('$runtime.$onDestroy(onDestroy);');
  if(this.script.watchers.length) {
    this.script.watchers.forEach(n => runtime.push(n));
  }

  runtime.push(xNode('addStyle', ctx => {
    if(!this.css.active()) return;
    let style = this.css.getContent();
    if(!style) return;
    if(this.config.css) {
      if(typeof this.config.css == 'function') this.config.css(style, this.config.path, this, ctx);
      else ctx.writeLine(`$runtime.addStyles('${this.css.id}', \`${Q(style)}\`);`);
    } else {
      this.css.result = style;
    }
  }));

  runtime.push(xNode('bind-component-element', {
    $wait: ['componentFn']
  }, (ctx) => {
    if(this.inuse.componentFn) ctx.writeLine('return $parentElement;');
    else ctx.writeLine('return {$dom: $parentElement};');
  }));

  if(!this.script.readOnly && this.css.active() && this.css.containsExternal()) this.require('apply', 'rootCD');

  this.module.head.push(xNode('resolveClass', (ctx) => {
    if(!this.inuse.resolveClass) return;
    if(this.css.active()) {
      let { classMap, metaClass, main } = this.css.getClassMap();
      if(main) main = `'${main}'`;
      else main = 'null';
      classMap = Object.entries(classMap).map(i => `'${i[0]}': '${i[1]}'`).join(', ');
      metaClass = Object.entries(metaClass).map(i => {
        let value = i[1] === true ? 'true' : `'${i[1]}'`;
        return `'${i[0]}': ${value}`;
      }).join(', ');

      ctx.writeLine('const $$resolveClass = $runtime.makeClassResolver(');
      ctx.indent++;
      ctx.writeLine(`$option, {${classMap}}, {${metaClass}}, ${main}`);
      ctx.indent--;
      ctx.writeLine(');');
    } else {
      ctx.writeLine('const $$resolveClass = $runtime.noop;');
    }
  }));
}


export function buildBlock(data, option = {}) {
  let rootTemplate = xNode('node', { inline: true });
  let rootSVG = false, requireFragment = option.template?.requireFragment;
  let binds = xNode('block');
  let result = {};
  let inuse = Object.assign({}, this.inuse);

  if(!option.parentElement) option.parentElement = '$parentElement';

  if(option.each?.blockPrefix) binds.push(option.each.blockPrefix);

  if(option.allowSingleBlock && data.body.length == 1) {
    let n = data.body[0];
    if(n.type == 'node' && n.name.match(/^[A-Z]/)) {
      let component = this.makeComponent(n);
      return {
        singleBlock: component.bind
      };
    }
  }

  const go = (data, isRoot, tpl) => {
    let body = data.body.filter(n => {
      if(n.type == 'script' || n.type == 'style' || n.type == 'slot') return false;
      if(n.type == 'comment' && !this.config.preserveComments) return false;
      if(n.type == 'fragment') {
        try {
          let f = this.makeFragment(n);
          f && binds.push(f);
        } catch (e) {
          wrapException(e, n);
        }
        return false;
      }
      return true;
    });

    if(tpl.name == 'table') {
      let result = [], tbody = null;
      body.forEach(n => {
        if(n.type == 'node' && ['thead', 'tbody', 'tfoot', 'colgroup'].includes(n.name)) {
          result.push(n);
          tbody = null;
          return;
        }

        if(!tbody) {
          tbody = { type: 'node', name: 'tbody', body: [], attributes: [], classes: new Set() };
          result.push(tbody);
        }
        tbody.body.push(n);
      });
      body = result;
    }

    {
      let i = 1;
      while(body[i]) {
        if(body[i].type == 'text' && body[i - 1].type == 'text') {
          body[i - 1].value += body[i].value;
          body.splice(i, 1);
        } else i++;
      }
    }

    if(isRoot) {
      let svg = false, other = false;
      body.some(node => {
        if(node.type != 'node') return;
        if(svgElements[node.name]) svg = true;
        else return other = true;
      });
      if(svg && !other) rootSVG = true;
    }

    let lastStatic;

    const placeLabel = name => {
      let el;
      if(lastStatic) {
        el = lastStatic;
        el.label = true;
        lastStatic = null;
      } else {
        el = xNode('node:comment', { label: true, value: name });
        tpl.push(el);
      }
      return el;
    };

    const bindNode = (n) => {
      if(n.type === 'text') {
        let prev = tpl.getLast();
        if(prev?.$type == 'node:text' && prev._boundName) tpl.push(xNode('node:comment', { label: true }));

        if(n.value.indexOf('{') >= 0) {
          const pe = this.parseText(n.value);
          this.detectDependency(pe);

          let textNode;
          if(pe.staticText != null) {
            textNode = tpl.push(pe.staticText);
          } else {
            textNode = tpl.push(' ');
            let bindText = xNode('bindText', {
              $wait: ['apply'],
              el: textNode.bindName(),
              exp: pe.result
            }, (ctx, n) => {
              if(this.inuse.apply) {
                ctx.writeLine(`$runtime.bindText(${n.el}, () => ${n.exp});`);
              } else ctx.writeLine(`${n.el}.textContent = ${n.exp};`);
            });
            binds.push(bindText);
          }

          pe.parts.forEach(p => {
            if(p.type != 'js') return;
            let exp = p.value;
            if(!exp.endsWith(';')) exp += ';';
            binds.push(xNode('block', {
              body: [
                replaceElementKeyword(exp, () => textNode.bindName())
              ]
            }));
          });

          lastStatic = textNode;
        } else {
          lastStatic = tpl.push(n.value);
        }
      } else if(n.type === 'template') {
        lastStatic = null;
        tpl.push(n.openTag);
        tpl.push(n.content);
        tpl.push('</template>');
      } else if(n.type === 'node') {
        if(n.name == 'malina' && !option.malinaElement) {
          let b;
          if(n.elArg == 'portal') b = this.attachPortal(n);
          else b = this.attachHead(n);
          b && binds.push(b);
          return;
        }
        if(n.name == 'component' || n.name.match(/^[A-Z]/)) {
          if(n.name == 'component' || !n.elArg) {
            // component
            if(isRoot) requireFragment = true;
            let el = placeLabel(n.name);

            if(n.name == 'component') {
              // dyn-component
              binds.push(this.makeComponentDyn(n, el));
            } else {
              let component = this.makeComponent(n);
              binds.push(xNode('attach-component', {
                component: component.bind,
                el: el.bindName()
              }, (ctx, n) => {
                ctx.write(true, `$runtime.attachBlock(${n.el}, `);
                ctx.add(n.component);
                ctx.write(')');
              }));
            }
          } else {
            let el = placeLabel(`exported ${n.elArg}`);
            let b = this.attchExportedFragment(n, el, n.name);
            b && binds.push(b);
          }
          return;
        }
        if(n.name == 'slot') {
          let slotName = n.elArg;
          if(!slotName) {
            if(option.context == 'fragment') {
              let el = placeLabel('fragment-slot');
              binds.push(this.attachFragmentSlot(el));
              return;
            } else slotName = 'default';
          }

          let el = placeLabel(slotName);
          let slot = this.attachSlot(slotName, n);

          binds.push(xNode('attach-slot', {
            $compile: [slot],
            el: el.bindName(),
            slot,
            requireCD
          }, (ctx, n) => {
            if(n.requireCD.value) ctx.write(true, `$runtime.attachBlock($cd, ${n.el}, `);
            else ctx.write(true, `$runtime.attachBlock($component, ${n.el}, `);
            ctx.add(n.slot);
            ctx.write(');', true);
          }));
          return;
        }
        if(n.name == 'fragment') {
          assert(n.elArg, 'Fragment name is required');
          let el = placeLabel(`fragment ${n.elArg}`);
          binds.push(xNode('attach-fragment', {
            el: el.bindName(),
            fragment: this.attachFragment(n)
          }, (ctx, n) => {
            ctx.write(true, `$runtime.attachBlock(${n.el}, `);
            ctx.add(n.fragment);
            ctx.write(')');
          }));
          return;
        }

        let el = xNode('node', { name: n.name });
        if(option.oneElement) el._boundName = option.oneElement;
        tpl.push(el);
        lastStatic = el;

        if(n.attributes.some(a => a.name.startsWith('{...'))) {
          this.require('rootCD');
          n.spreading = [];
          binds.push(xNode('spread-to-element', {
            el: el.bindName(),
            props: n.spreading
          }, (ctx, n) => {
            ctx.writeLine(`$runtime.spreadAttributes(${n.el}, () => ({${n.props.join(', ')}}));`);
          }));
        }
        let bindTail = [];
        n.attributes.forEach(p => {
          let b = this.bindProp(p, n, el);
          if(b) {
            if(b.bind) binds.push(b.bind);
            if(b.bindTail) bindTail.push(b.bindTail);
          }
        });
        n.classes.forEach(n => el.class.add(n));

        if(option.bindAttributes && (el.attributes.length || el.class.size)) {
          el.bindName();
          binds.push(xNode('bindAttributes', { el }, (ctx, n) => {
            let elName = n.el.bindName();
            n.el.attributes.forEach(a => {
              ctx.writeLine(`${elName}.setAttribute('${a.name}', \`${Q(a.value)}\`);`);
            });
          }));
          binds.push(xNode('bindClasses', { el }, (ctx, n) => {
            let el = n.el;
            let elName = el.bindName();
            if(el.class.size) {
              let className = Array.from(el.class.values()).join(' ');
              ctx.writeLine(`${elName}.className += ' ${className}';`);
            }
          }));
        }
        bindTail.forEach(b => binds.push(b));

        el.voidTag = n.voidTag;
        if(!n.closedTag) {
          go(n, false, el);
        }
      } else if(n.type === 'each') {
        if(data.type == 'node' && data.body.length == 1) {
          lastStatic = null;
          let eachBlock = this.makeEachBlock(n, {
            elName: tpl.bindName(),
            onlyChild: true
          });
          binds.push(eachBlock.source);
          return;
        } else {
          if(isRoot) requireFragment = true;
          let element = placeLabel(n.value);
          let eachBlock = this.makeEachBlock(n, { elName: element.bindName() });
          binds.push(eachBlock.source);
          return;
        }
      } else if(n.type === 'if') {
        if(isRoot) requireFragment = true;
        binds.push(this.makeifBlock(n, placeLabel(n.value)));
        return;
      } else if(n.type === 'systag') {
        let r = n.value.match(/^@(\w+)\s+(.*)$/s);
        let name = r[1];
        let exp = r[2];

        if(name == 'html') {
          if(isRoot) requireFragment = true;
          let el = placeLabel('html');
          binds.push(this.makeHtmlBlock(exp, el));
          return;
        } else throw 'Wrong tag';
      } else if(n.type === 'await') {
        if(isRoot) requireFragment = true;
        let el = placeLabel(n.value);
        let r = this.makeAwaitBlock(n, el);
        r && binds.push(r);
        return;
      } else if(n.type === 'comment') {
        lastStatic = tpl.push(n.content);
      }
    };
    body.forEach(node => {
      try {
        bindNode(node);
      } catch (e) {
        wrapException(e, node);
      }
    });
  };
  go(data, true, rootTemplate);
  if(option.protectLastTag) {
    let l = rootTemplate.getLast();
    if(l?.label) {
      rootTemplate.push(xNode('node:comment', { value: '' }));
    }
  }

  let innerBlock = null;
  if(binds.body.length) {
    innerBlock = xNode('block');
    if(!option.oneElement) {
      innerBlock.push(xNode('bindNodes', {
        tpl: rootTemplate,
        root: option.parentElement,
        single: rootTemplate.children.length == 1 && !requireFragment
      }, (ctx, n) => {
        const gen = (parent, parentName) => {
          for(let i = 0; i < parent.children.length; i++) {
            let node = parent.children[i];
            let diff = i == 0 ? '[$runtime.firstChild]' : `[$runtime.childNodes][${i}]`;

            if(node._boundName) ctx.write(true, `let ${node._boundName} = ${parentName() + diff};`);
            if(node.children) {
              gen(node, () => {
                if(node._boundName) return node._boundName;
                return parentName() + diff;
              });
            }
          }
        };
        if(n.single) {
          let node = n.tpl.children[0];
          if(node._boundName) ctx.write(true, `let ${node._boundName} = ${n.root};`);
          if(node.children) gen(node, () => n.root);
        } else {
          gen(n.tpl, () => n.root);
        }
      }));
    }
    innerBlock.push(binds);

    if(option.inline) {
      result.source = innerBlock;
    }
  } else {
    result.name = '$runtime.noop';
    result.source = null;
  }

  if(!option.inline) {
    let template = xNode('template', {
      body: rootTemplate,
      svg: rootSVG,
      requireFragment
    });
    if(option.template) Object.assign(template, option.template);
    else template.inline = true;

    result.block = xNode('block', {
      $compile: [innerBlock],
      innerBlock,
      tpl: template,
      each: option.each,
      parentElement: option.parentElement
    }, (ctx, n) => {
      if(n.each && !ctx.isEmpty(n.innerBlock)) {
        ctx.write('$runtime.makeEachBlock(');
      } else {
        ctx.write('$runtime.makeBlock(');
      }
      ctx.add(n.tpl);
      if(!ctx.isEmpty(n.innerBlock)) {
        if(n.each) {
          ctx.write(`, (${n.parentElement}, ${n.each.itemName}, ${n.each.indexName}) => {`, true);
        } else {
          let extra = option.extraArguments ? ', ' + option.extraArguments.join(', ') : '';
          ctx.write(`, (${n.parentElement}${extra}) => {`, true);
        }
        ctx.indent++;
        ctx.add(n.innerBlock);
        if(n.each?.rebind) {
          ctx.write(true, 'return ');
          ctx.add(n.each.rebind);
          ctx.write(';', true);
        }
        ctx.indent--;
        ctx.write(true, '}');
      }
      ctx.write(')');
    });
  } else {
    result.template = xNode('template', {
      body: rootTemplate,
      svg: rootSVG,
      requireFragment
    });
    if(option.template) Object.assign(result.template, option.template);
    else result.template.inline = true;
  }

  result.inuse = {};
  for(let k in this.inuse) {
    result.inuse[k] = this.inuse[k] - (inuse[k] || 0);
  }
  return result;
}

function wrapException(e, n) {
  if(typeof e === 'string') e = new Error(e);
  if(!e.details) {
    console.log('Node: ', n);
    if(n.type == 'text') e.details = n.value.trim();
    else if(n.type == 'node') e.details = n.openTag.trim();
    else if(n.type == 'each') e.details = n.value.trim();
    else if(n.type == 'if') e.details = n.value.trim();
  }
  throw e;
}
