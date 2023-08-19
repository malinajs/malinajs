import { assert, detectExpressionType, isSimpleName, unwrapExp, trimEmptyNodes } from '../utils';
import { xNode } from '../xnode.js';


export function makeComponent(node, option={}) {
  let propList = node.attributes;

  this.require('$context');

  let deepChecking = this.config.deepCheckingProps;
  let reference = null;
  let propsFn = [], propsSetter = [], $class = [], staticProps = true;
  let slotBlocks = [];
  let anchorBlocks = [];

  let componentName = option.self ? '$$selfComponent' : node.name;
  if(componentName != 'component' && this.config.autoimport && !option.self) {
    let imported = this.script.autoimport[componentName] || this.script.importedNames.includes(componentName) ||
      this.script.rootVariables[componentName] || this.script.rootFunctions[componentName];

    if(!imported) {
      let r = this.config.autoimport(componentName, this.config.path, this);
      if(r) this.script.autoimport[componentName] = r;
    }
  }

  // events
  let forwardAllEvents = false;
  let events = {};
  const passEvent = (name, bind) => {
    if(!events[name]) events[name] = [];
    events[name].push(bind);
  };

  if(node.body && node.body.length) {
    let slots = {};
    let anchors = [];
    let defaultSlot = {
      name: 'default',
      type: 'slot'
    };
    defaultSlot.body = trimEmptyNodes(node.body.filter(n => {
      if(n.type == 'node' && n.name[0] == '^') {
        anchors.push(n);
        return false;
      }
      if(n.type != 'slot') return true;
      let rx = n.value.match(/^#slot:(\S+)/);
      if(rx) n.name = rx[1];
      else n.name = 'default';
      assert(!slots[n], 'double slot');
      slots[n.name] = n;
    }));

    if(!slots.default && defaultSlot.body.length) slots.default = defaultSlot;

    Object.values(slots).forEach(slot => {
      if(!slot.body.length) return;
      assert(isSimpleName(slot.name));

      let props;
      let rx = slot.value && slot.value.match(/^#slot\S*\s+(.*)$/s);
      if(rx) {
        props = rx[1].trim().split(/[\s,]+/);
        assert(props.length);
        props.forEach(n => {
          assert(isSimpleName(n), 'Wrong prop for slot');
        });
      }

      let contentNodes = trimEmptyNodes(slot.body);
      if(contentNodes.length == 1 && contentNodes[0].type == 'node' && contentNodes[0].name == 'slot') {
        let parentSlot = contentNodes[0];
        if(!parentSlot.body || !parentSlot.body.length) {
          slotBlocks.push(xNode('empty-slot', {
            childName: slot.name,
            parentName: parentSlot.elArg || 'default'
          }, (ctx, n) => {
            ctx.write(true, `${n.childName}: $option.slots?.${n.parentName}`);
          }));
          return;
        }
      }

      if(props) this.require('apply');

      let block = this.buildBlock(slot, { inline: true });

      slotBlocks.push(xNode('slot', {
        $wait: ['apply'],
        name: slot.name,
        template: block.template,
        bind: block.source,
        componentName,
        props
      }, (ctx, n) => {
        if(n.bind) {
          ctx.write(true, `${n.name}: $runtime.makeSlot(`);
          ctx.add(n.template);
          ctx.write(`, ($parentElement, $context, $instance_${n.componentName}`);
          if(n.props) ctx.write(', $localProps');
          ctx.write(') => {', true);
          ctx.indent++;
          if(n.props) ctx.write(true, `let {${n.props.join(', ')}} = $localProps || {};`);
          ctx.add(n.bind);

          if(n.props && this.inuse.apply) ctx.write(true, `return ($localProps) => ({${n.props.join(', ')}} = $localProps, $$apply());`);
          ctx.indent--;
          ctx.writeLine('})');
        } else {
          ctx.write(true, `${n.name}: $runtime.makeBlock(`);
          ctx.add(n.template);
          ctx.write(')');
        }
      }));
    });

    anchors.forEach(n => {
      let bb = this.buildBlock({ body: [n] }, { inline: true, oneElement: 'el', bindAttributes: true });
      let block = bb.source;
      let name = n.name.slice(1) || 'default';
      assert(isSimpleName(name));

      anchorBlocks.push(xNode('anchor', {
        $compile: [block],
        name,
        block
      }, (ctx, n) => {
        ctx.write(`${n.name}: $runtime.makeAnchor((el) => {`);
        ctx.indent++;
        ctx.build(n.block);
        ctx.indent--;
        ctx.write(true, '})');
      }));
    });
  }

  propList = propList.filter(({ name }) => {
    if(name == '@@') {
      forwardAllEvents = true;
      this.require('$events');
      return false;
    } else if(name == 'this') {
      return false;
    }
    return true;
  });

  propList.forEach(prop => {
    let name = prop.name;
    let value = prop.value;
    if(name[0] == '#') {
      assert(!value, 'Wrong ref');
      name = name.substring(1);
      assert(detectExpressionType(name) == 'identifier', name);
      reference = name;
      return;
    } else if(name[0] == ':' || name.startsWith('bind:')) {
      let inner, outer;
      if(name[0] == ':') inner = name.substring(1);
      else inner = name.substring(5);
      let mods = inner.split('|');
      inner = mods.shift();
      mods.forEach(mod => {
        if (mod == 'deep') deepChecking = true;
        else throw new Error('Wrong modifier: ' + mod);
      });
      if(value) outer = unwrapExp(value);
      else outer = inner;
      assert(isSimpleName(inner), `Wrong property: '${inner}'`);
      assert(detectExpressionType(outer) == 'identifier', 'Wrong bind name: ' + outer);
      this.detectDependency(outer);

      if(this.script.readOnly) this.warning('Conflict: read-only and 2-way binding to component');
      this.require('apply');
      staticProps = false;

      if(inner == outer) propsFn.push(`${inner}`);
      else propsFn.push(`${inner}: ${outer}`);
      propsSetter.push(`${inner}: ${outer} = ${outer}`);

      return;
    } else if(name[0] == '{') {
      value = name;
      name = unwrapExp(name);
      if(name.startsWith('...')) {
        name = name.substring(3);
        assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
        this.detectDependency(name);
        staticProps = false;
        propsFn.push(`...${name}`);
        return;
      }
      assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
    } else if(name[0] == '@' || name.startsWith('on:')) {
      if(name.startsWith('@@')) {
        let event = name.substring(2);
        assert(!value);
        this.require('$events');
        passEvent(event, xNode('forwardEvent', {
          event
        }, (ctx, n) => {
          ctx.write(`$events.${n.event}`);
        }));
        return;
      }

      let { event, fn } = this.makeEventProp(prop, () => {
        throw new Error('$element is not available for component, use $event instead');
      });

      passEvent(event, xNode('passEvent', {
        fn
      }, (ctx, n) => {
        ctx.add(n.fn);
      }));
      return;
    } else if(this.config.passClass && (name == 'class' || name.startsWith('class:'))) {
      let metaClass, args = name.split(':');
      if(args.length == 1) {
        metaClass = '$$main';
      } else {
        assert(args.length == 2);
        metaClass = args[1];
        assert(metaClass);
      }
      assert(value);
      this.css.passingClass = true;

      const parsed = this.parseText(prop.value);
      this.detectDependency(parsed);
      let exp = parsed.result;
      $class.push(`${metaClass}: $$resolveClass(${exp})`);

      this.require('resolveClass');
      return;
    }

    let ip = this.inspectProp(prop);
    if(ip.name == ip.value) propsFn.push(`${ip.name}`);
    else propsFn.push(`${ip.name}: ${ip.value}`);
    if(!ip.static) staticProps = false;
    if(ip.mod.deep) deepChecking = true;
  });


  if(Object.keys(events).length == 0) events = null;

  let result = xNode('component', {
    $wait: ['apply'],
    componentName,
    staticProps,
    props: propsFn,
    propsSetter,
    $class,
    forwardAllEvents,
    events,
    slots: slotBlocks.length ? slotBlocks : null,
    anchors: anchorBlocks.length ? anchorBlocks : null,
    deepChecking
  }, (ctx, n) => {
    let comma = false;

    if(this.inuse.apply && (n.$class.length || n.propsSetter.length || n.props.length && !n.staticProps)) {
      ctx.write(`$runtime.callComponentDyn(${n.componentName}, $context, {`);
    } else ctx.write(`$runtime.callComponent(${n.componentName}, $context, {`);

    if(n.props.length && (n.staticProps || !this.inuse.apply)) {
      ctx.write(`props: {${n.props.join(', ')}}`);
      comma = true;
      n.props = [];
    }
    ctx.indent++;
    if(n.forwardAllEvents && !n.events) {
      if(comma) ctx.write(', ');
      comma = true;
      ctx.write('events: $events');
    } else if(n.events) {
      if(comma) ctx.write(',', true);
      comma = true;
      if(n.forwardAllEvents) ctx.write('events: $runtime.mergeAllEvents($events, {');
      else ctx.write('events: {');
      ctx.indent++;
      ctx.write(true);
      Object.entries(n.events).forEach(([event, list], index) => {
        if(index) ctx.write(',', true);
        ctx.write(event + ': ');
        if(list.length == 1) ctx.add(list[0]);
        else {
          ctx.write('$runtime.mergeEvents(');
          list.forEach((b, i) => {
            if(i) ctx.write(', ');
            ctx.add(b);
          });
          ctx.write(')');
        }
      });
      ctx.indent--;
      if(n.forwardAllEvents) ctx.write(true, '})');
      else ctx.write(true, '}');
    }
    if(n.slots) {
      if(comma) ctx.write(', ');
      comma = true;
      ctx.write('slots: {');
      ctx.indent++;
      n.slots.forEach((slot, i) => {
        if(i) ctx.write(',');
        ctx.write(true);
        ctx.add(slot);
      });
      ctx.indent--;
      ctx.write(true, '}');
    }
    if(n.anchors) {
      if(comma) ctx.write(', ');
      comma = true;
      ctx.write('anchor: {');
      ctx.indent++;
      n.anchors.forEach((anchor, i) => {
        if(i) ctx.write(',');
        ctx.write(true);
        ctx.add(anchor);
      });
      ctx.indent--;
      ctx.write(true, '}');
    }
    if(n.$class.length && !ctx.inuse.apply) {
      if(comma) ctx.write(', ');
      comma = true;
      ctx.write(`$class: {${n.$class.join(', ')}}`);
    }
    ctx.write('}');

    let other = '';
    if(n.props.length) ctx.write(',\n', true, `() => ({${n.props.join(', ')}})`);
    else other = ', null';

    if(this.inuse.apply && n.props.length) {
      if(other) ctx.write(other);
      other = '';
      ctx.write(',');
      if(n.props.length) ctx.write('\n', true);
      if(n.deepChecking) ctx.write('$runtime.compareDeep');
      else ctx.write('$runtime.keyComparator');
    } else other += ', null';

    if(n.propsSetter.length && this.inuse.apply) {
      if(other) ctx.write(other);
      other = '';
      ctx.write(',\n', true, `($$_value) => ({${n.propsSetter.join(', ')}} = $$_value)`);
    } else other += ', null';

    if(n.$class.length && ctx.inuse.apply) {
      if(other) ctx.write(other);
      other = '';
      ctx.write(',\n', true, `() => ({${n.$class.join(', ')}})`);
    } else other += ', null';

    ctx.indent--;
    ctx.write(true, ')');
  });

  return { bind: result, reference };
}

export function makeComponentDyn(node, label) {
  let dynamicComponent;

  if(node.elArg) {
    dynamicComponent = node.elArg[0] == '{' ? unwrapExp(node.elArg) : node.elArg;
  } else {
    node.props.some(({ name, value }) => {
      if(name == 'this') {
        dynamicComponent = unwrapExp(value);
        return true;
      }
    });
  }

  assert(dynamicComponent);
  this.require('apply');
  this.detectDependency(dynamicComponent);

  let { bind: component, reference } = this.makeComponent(node);

  component.componentName = '$ComponentConstructor';
  return xNode('dyn-component', {
    label,
    exp: dynamicComponent,
    component,
    reference
  }, (ctx, n) => {
    ctx.write(true, `$runtime.attachDynComponent(${n.label.name}, () => ${n.exp}, ($ComponentConstructor) => `);
    if(n.reference) ctx.write(`${n.reference} = `);
    ctx.add(n.component);
    if(n.label.node) ctx.write(')');
    else ctx.write(', true)');
  });
}
