import { assert, detectExpressionType, isSimpleName, unwrapExp, last, toCamelCase, replaceKeyword, Q } from '../utils.js';
import { xNode } from '../xnode.js';


export function bindProp(prop, node, element) {
  let name, arg;

  if (prop.content.startsWith('{*')) {
    const pe = this.parseText(prop.content);
    assert(pe.parts[0].type == 'js');
    let exp = pe.parts[0].value;
    if (!exp.endsWith(';')) exp += ';';
    return {
      bind: xNode('inline-js', {
        exp: replaceKeyword(exp, (name) => name == '$element' ? element.bindName() : null, true)
      }, (ctx, n) => {
        ctx.write(true, n.exp);
      })
    };
  }

  if (prop.name[0] == '@' || prop.name.startsWith('on:')) name = 'event';
  else if (prop.name[0] == ':') {
    name = 'bind';
    arg = prop.name.substring(1);
  } else if (prop.name[0] == '*') {
    let rx = prop.name.match(/^\*\{.*\}$/);
    if (rx) {
      assert(prop.value == null, 'wrong binding: ' + prop.content);
      name = 'use';
      prop.value = prop.name.substring(1);
    } else {
      name = 'use';
      arg = prop.name.substring(1);
    }
  } else if (prop.value == null) {
    let rx = prop.name.match(/^\{(.*)\}$/);
    if (rx) {
      name = rx[1];
      if (name.startsWith('...')) {
        // spread operator
        name = name.substring(3);
        assert(detectExpressionType(name) == 'identifier');
        this.detectDependency(name);
        return node.spreading.push(`...${name}`);
      } else {
        prop.value = prop.name;
      }
    }
  }
  if (!name) {
    let r = prop.name.match(/^(\w+):(.*)$/);
    if (r) {
      name = r[1];
      arg = r[2];
    } else name = prop.name;
  }

  const isExpression = s => s[0] == '{' && last(s) == '}';

  if (name[0] == '#') {
    let target = name.substring(1);
    assert(detectExpressionType(target) == 'identifier', name);
    return {
      bind: xNode('reference-to-element', {
        target,
        el: element.bindName()
      }, (ctx, n) => {
        ctx.write(true, `${n.target} = ${n.el};`);
        ctx.write(true, `$runtime.$onDestroy(() => ${n.target} = null);`);
      })
    };
  } else if (name == 'event') {
    if (prop.name.startsWith('@@')) {
      assert(!prop.value);
      this.require('$events');
      if (prop.name == '@@') {
        return {
          bind: xNode('forwardAllEvents', {
            el: element.bindName()
          }, (ctx, data) => {
            ctx.write(true, 'for(let event in $events)');
            this.indent++;
            ctx.write(true, `$runtime.addEvent(${data.el}, event, $events[event]);`);
            this.indent--;
          })
        };
      }

      return {
        bind: xNode('forwardEvent', {
          event: prop.name.substring(2),
          el: element.bindName()
        }, (ctx, n) => {
          ctx.writeLine(`$events.${n.event} && $runtime.addEvent(${n.el}, '${n.event}', $events.${n.event});`);
        })
      };
    }

    let { event, fn, rootModifier } = this.makeEventProp(prop, () => element.bindName());
    if (rootModifier) this.require('rootEvent');

    return {
      bind: xNode('bindEvent', {
        event,
        fn,
        el: element.bindName(),
        rootModifier
      }, (ctx, n) => {
        if (n.rootModifier) ctx.write(true, `$$addRootEvent(${n.el}, '${n.event}', `);
        else ctx.write(true, `$runtime.addEvent(${n.el}, '${n.event}', `);
        ctx.add(n.fn);
        ctx.write(');');
      })
    };
  } else if (name == 'bind' && arg) {
    this.require('apply');
    let exp;
    arg = arg.split(/[:|]/);
    let attr = arg.shift();
    assert(attr, prop.content);

    if (prop.value) exp = unwrapExp(prop.value);
    else {
      if (arg.length) exp = arg.pop();
      else exp = attr;
    }
    let inputType = null;
    if (node.name == 'input') {
      node.attributes.some(a => {
        if (a.name == 'type') {
          inputType = a.value;
          return true;
        }
      });
    }

    assert(['value', 'checked', 'valueAsNumber', 'valueAsDate', 'selectedIndex'].includes(attr), 'Not supported: ' + prop.content);
    assert(detectExpressionType(exp) == 'identifier', 'Wrong bind name: ' + prop.content);
    assert(arg.length == 0);
    this.detectDependency(exp);
    let argName = '$$a' + (this.uniqIndex++);

    if (node.name == 'select' && attr == 'value') {
      return {
        bind: xNode('bindInput', {
          el: element.bindName(),
          exp,
          attr,
          argName
        }, (ctx, n) => {
          ctx.write(true, `$runtime.selectElement(${n.el}, () => ${n.exp}, ${n.argName} => {${n.exp} = ${n.argName}; $$apply();});`);
        })
      };
    }

    if (attr == 'value' && ['number', 'range'].includes(inputType)) attr = 'valueAsNumber';

    return {
      bind: xNode('bindInput', {
        el: element.bindName(),
        exp,
        attr,
        argName
      }, (ctx, n) => {
        ctx.write(true, `$runtime.bindInput(${n.el}, '${n.attr}', () => ${n.exp}, ${n.argName} => {${n.exp} = ${n.argName}; $$apply();});`);
      })
    };
  } else if (name == 'style' && arg) {
    let styleName = arg;
    let exp;
    if (prop.value) {
      if (isExpression(prop.value)) {
        exp = unwrapExp(prop.value);
        this.detectDependency(exp);
      } else {
        if (prop.value.includes('{')) {
          const parsed = this.parseText(prop.value);
          this.detectDependency(parsed);
          exp = parsed.result;
        } else {
          return {
            bind: xNode('staticStyle', {
              el: element.bindName(),
              name: styleName,
              value: prop.value
            }, (ctx, n) => {
              ctx.writeLine(`${n.el}.style.${toCamelCase(n.name)} = \`${Q(n.value)}\`;`);
            })
          };
        }
      }
    } else {
      exp = toCamelCase(styleName);
    }

    let hasElement = exp.includes('$element');
    return {
      bind: xNode.block({
        scope: hasElement,
        body: [xNode('bindStyle', {
          el: element.bindName(),
          styleName,
          exp,
          hasElement
        }, (ctx, n) => {
          if (n.hasElement) ctx.writeLine(`let $element=${n.el};`);
          if (this.inuse.apply) {
            ctx.writeLine(`$runtime.bindStyle(${n.el}, '${n.styleName}', () => (${n.exp}));`);
          } else {
            ctx.writeLine(`${n.el}.style.${toCamelCase(n.styleName)} = ${n.exp};`);
          }
        })]
      })
    };
  } else if (name == 'use') {
    if (arg) {
      assert(isSimpleName(arg), 'Wrong name: ' + arg);
      this.checkRootName(arg);
      let args = prop.value ? `, () => [${unwrapExp(prop.value)}]` : '';
      this.detectDependency(args);
      return {
        bind: xNode('action', {
          $wait: ['apply'],
          name: arg,
          args,
          el: element.bindName()
        }, (ctx, n) => {
          if (this.inuse.apply && n.args) {
            ctx.writeLine(`$runtime.bindAction(${n.el}, ${n.name}${n.args}, $runtime.__bindActionSubscribe);`);
          } else {
            ctx.writeLine(`$runtime.bindAction(${n.el}, ${n.name}${n.args});`);
          }
        })
      };
    }
    let exp = unwrapExp(prop.value);
    this.detectDependency(exp);
    let hasElement = exp.includes('$element');
    return {
      bind: xNode('inline-action', {
        exp,
        el: hasElement && element.bindName(),
        element,
        hasElement
      }, (ctx, n) => {
        ctx.writeLine('$runtime.$tick(() => {');
        this.indent++;
        if (n.hasElement) ctx.writeLine(`let $element=${n.el};`);
        ctx.writeLine(n.exp);
        if (this.inuse.apply) ctx.writeLine('$$apply();');
        this.indent--;
        ctx.writeLine('});');
      })
    };
  } else if (name == 'class') {
    if (node.__skipClass) return {};
    node.__skipClass = true;

    let props = node.attributes.filter(a => a.name == 'class' || a.name.startsWith('class:'));

    let compound = false;
    props.forEach(prop => {
      let classes = [];
      if (prop.name == 'class') {
        if (!prop.value) return;
        let parsed = this.parseText(prop.value);
        for (let p of parsed.parts) {
          if (p.type == 'text') {
            classes = classes.concat(p.value.trim().split(/\s+/));
          } else if (p.type == 'exp') compound = true;
        }
      } else {
        classes = [prop.name.slice(6)];
      }
      return this.config.passClass && classes.some(name => {
        if (this.css.isExternalClass(name)) {
          compound = true;
          this.require('apply');
        } else if (name[0] == '$') {
          this.css.markAsExternal(name.substring(1));
          compound = true;
          this.require('apply');
        }
      });
    });

    if (compound) {
      let classes = Array.from(node.classes);
      node.classes.clear();
      if (this.config.passClass) this.require('resolveClass');
      let exp = props.map(prop => {
        if (prop.name == 'class') {
          return this.parseText(prop.value).result;
        } else {
          let className = prop.name.slice(6);
          assert(className);
          let exp = prop.value ? unwrapExp(prop.value) : className;
          this.detectDependency(exp);
          return `(${exp}) ? \`${Q(className)}\` : ''`;
        }
      }).join(') + \' \' + (');
      const bind = xNode('compound-class', {
        $wait: ['apply'],
        el: element.bindName(),
        exp,
        classes
      }, (ctx, n) => {
        let base = '';
        if (n.classes.length) {
          if (this.css.passingClass) {
            base = [];
            n.classes.forEach(c => {
              if (c.local) base.push(this.css.resolve(c));
            });
            base = base.join(' ');
            if (base) base = `, '${base}'`;
          } else {
            if (n.classes.some(c => c.local)) base = `,'${this.css.id}'`;
          }
        }

        if (this.inuse.resolveClass) {
          if (this.inuse.apply) {
            ctx.write(true, `$runtime.bindClassExp(${n.el}, () => $$resolveClass((${n.exp})${base}))`);
          } else {
            ctx.write(true, `$runtime.setClassToElement(${n.el}, $$resolveClass((${n.exp})${base}));`);
          }
        } else {
          if (this.inuse.apply) {
            ctx.write(true, `$runtime.bindClassExp(${n.el}, () => (${n.exp})${base})`);
          } else {
            ctx.write(true, `$runtime.setClassToElement(${n.el}, ${n.exp}${base});`);
          }
        }
      });
      return { bind };
    } else {
      let bind = xNode.block();
      props.forEach(prop => {
        if (prop.name == 'class') {
          prop.value && prop.value.trim().split(/\s+/).forEach(name => {
            node.classes.add(name);
          });
        } else {
          let className = prop.name.slice(6);
          assert(className);
          let exp = prop.value ? unwrapExp(prop.value) : className;
          this.detectDependency(exp);

          let n = xNode('bindClass', {
            $wait: ['apply'],
            el: element.bindName(),
            className,
            exp,
            $element: exp.includes('$element')
          }, (ctx, n) => {
            if (n.$element) {
              ctx.writeLine('{');
              ctx.indent++;
              ctx.writeLine(`let $element = ${n.el};`);
            }
            if (this.inuse.apply) {
              ctx.writeLine(`$runtime.bindClass(${n.el}, () => !!(${n.exp}), '${n.className}');`);
            } else {
              ctx.writeLine(`(${n.exp}) && $runtime.addClass(${n.el}, '${n.className}');`);
            }
            if (n.$element) {
              ctx.indent--;
              ctx.writeLine('}');
            }
          });
          bind.push(n);
        }
      });
      return { bind: bind.body.length ? bind : null };
    }
  } else if (name[0] == '^') {
    return {
      bindTail: xNode('bindAnchor', {
        name: name.slice(1) || 'default',
        el: element.bindName()
      }, (ctx, n) => {
        ctx.write(true, `$runtime.attachAnchor($option, ${n.el}`);
        if (n.name == 'default') ctx.write(');');
        else ctx.write(`, '${n.name}');`);
      })
    };
  } else {
    if (prop.raw && prop.raw.includes('{') || prop.type == 'word') {
      let exp;
      if (prop.type == 'text') {
        const parsed = this.parseText(prop.value);
        this.detectDependency(parsed);
        exp = parsed.result;
      } else if (prop.type == 'exp') {
        exp = unwrapExp(prop.raw);
        this.detectDependency(exp);
      } else {
        assert(prop.type == 'word', 'Wrong prop type: ' + prop.type);
        exp = prop.value;
        this.detectDependency(exp);
      }

      let el = element.bindName();
      exp = replaceKeyword(exp, (name) => name == '$element' ? el : null, true);

      if (node.spreading) return node.spreading.push(`${name}: ${exp}`);

      if (node.name == 'option' && name == 'value' && (prop.type == 'exp' || prop.type == 'word')) {
        return {
          bind: xNode('bindOptionValue', {
            el: element.bindName(),
            value: exp
          }, (ctx, n) => {
            ctx.write(true, `$runtime.selectOption(${n.el}, () => (${n.value}));`);
          })
        };
      }

      const propList = {
        hidden: true,
        checked: true,
        value: true,
        disabled: true,
        selected: true,
        innerHTML: true,
        innerText: true,
        multiple: node.name == 'select',
        src: true,
        readonly: 'readOnly'
      };

      return {
        bind: xNode('bindAttribute', {
          $wait: ['apply'],
          name,
          exp,
          el
        }, (ctx, data) => {
          if (propList[name]) {
            let propName = propList[name] === true ? name : propList[name];
            if (this.inuse.apply) {
              ctx.writeLine(`$watch(() => (${data.exp}), (value) => {${data.el}.${propName} = value;});`);
            } else {
              ctx.writeLine(`${data.el}.${propName} = ${data.exp};`);
            }
          } else {
            if (this.inuse.apply) {
              ctx.writeLine(`$runtime.bindAttribute(${data.el}, '${data.name}', () => (${data.exp}));`);
            } else {
              ctx.writeLine(`$runtime.bindAttributeBase(${data.el}, '${data.name}', ${data.exp});`);
            }
          }
        })
      };
    }

    if (node.spreading) return node.spreading.push(`${name}: \`${Q(prop.value)}\``);

    element.attributes.push({
      name: prop.name,
      value: prop.value
    });
  }
}
