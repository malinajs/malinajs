import { assert, isSimpleName, trimEmptyNodes } from '../utils';
import { xNode } from '../xnode.js';


export function makeFragment(node) {
  let rx = node.value.match(/#fragment:(\S+)(.*)$/s);
  assert(rx);
  let name = rx[1], external = false;
  assert(isSimpleName(name));
  let props = rx[2] ? rx[2].trim() : null;
  if(props) {
    props = props.split(/[\s,]+/).filter(p => {
      if(p == 'export') {
        external = true;
        return false;
      }
      return true;
    });
  }

  let block;
  if(node.body && node.body.length) {
    block = this.buildBlock({ body: trimEmptyNodes(node.body) }, { inline: true, context: 'fragment', parentElement: '$dom' });
  } else {
    this.warning(`Empty fragment: '${node.value}'`);
    return xNode('empty-fragment', { name }, (ctx, n) => {
      ctx.writeLine(`function $fragment_${n.name}() {};`);
    });
  }

  if(external) {
    this.require('$component');
    if(props?.length) this.require('apply');
  }

  return xNode('fragment', {
    $compile: [block.source],
    name,
    props,
    external,
    block
  }, (ctx, n) => {
    if(ctx.isEmpty(n.block.source)) {
      ctx.write(true, `let $fragment_${n.name} = $runtime.makeBlock(`);
      ctx.add(n.block.template);
      ctx.write(');');
    } else {
      ctx.write(true, `function $fragment_${n.name}($props, $events={}, $$fragmentSlot) {`);
      ctx.indent++;

      if(n.props?.length) {
        if(this.inuse.apply) {
          ctx.writeLine('let ' + n.props.join(', ') + ';');
          ctx.writeLine(`$runtime.unwrapProps($props, ($$) => ({${n.props.join(', ')}} = $$));`);
        } else {
          ctx.writeLine('let ' + n.props.join(', ') + ';');
          ctx.writeLine(`$props && ({${n.props.join(', ')}} = ($runtime.isFunction($props) ? $props() : $props));`);
        }
      }

      ctx.write(true, 'let $dom = ');
      n.block.template.cloneNode = true;
      ctx.add(n.block.template);
      ctx.write(';');

      ctx.add(n.block.source);
      ctx.write(true, 'return $dom;');

      ctx.indent--;
      ctx.writeLine('}');
    }
    if(n.external) ctx.writeLine(`$runtime.exportFragment($component, '${n.name}', $fragment_${n.name});`);
  });
}


function parseAttibutes(attributes) {
  let props = [];
  let events = [];
  let forwardAllEvents;
  let staticProps = true;
  let deepChecking = false;

  attributes.forEach(prop => {
    let name = prop.name;

    if(name[0] == '@' || name.startsWith('on:')) {
      if(name.startsWith('@@')) {
        this.require('$events');
        if(name == '@@') forwardAllEvents = true;
        else {
          name = name.substring(2);
          events.push({
            name,
            callback: `$events.${name}`
          });
        }
        return;
      }

      let { event, fn } = this.makeEventProp(prop);
      events.push({ name: event, fn });
    } else {
      let ip = this.inspectProp(prop);
      props.push(ip);
      if(!ip.static) staticProps = false;
      if(ip.mod.deep) deepChecking = true;
    }
  });

  return { props, events, forwardAllEvents, staticProps, deepChecking };
}


export function attachFragment(node) {
  let name = node.elArg;
  assert(isSimpleName(name));

  let slot = null;
  if(node.body?.length) slot = this.buildBlock({ body: trimEmptyNodes(node.body) }, { inline: true });

  let { props, events, forwardAllEvents, staticProps } = parseAttibutes.call(this, node.attributes);

  return xNode('call-fragment', {
    $compile: [slot?.source],
    forwardAllEvents,
    name,
    events,
    props,
    slot,
    staticProps
  }, (ctx, n) => {
    ctx.write(`$fragment_${n.name}(`);
    let missed = '';
    ctx.indent++;

    if(n.props.length) {
      ctx.write(true);

      const writeProps = () => ctx.write('{' + n.props.map(p => p.name == p.value ? p.name : `${p.name}: ${p.value}`).join(', ') + '}');

      if(n.staticProps || !this.inuse.apply) writeProps();
      else {
        ctx.write('() => (');
        writeProps();
        ctx.write(')');
      }
    } else missed = 'null';

    if(n.forwardAllEvents) {
      if(n.events.length) this.warning(`Fragment: mixing binding and forwarding is not supported: '${node.openTag}'`);
      ctx.write(missed, ', $events');
      missed = '';
    } else if(n.events.length) {
      ctx.write(missed, ',', true, '{');
      missed = '';

      n.events.forEach((e, i) => {
        if(i) ctx.write(', ');
        if(e.callback) {
          if(e.name == e.callback) ctx.write(e.name);
          ctx.write(`${e.name}: ${e.callback}`);
        } else {
          assert(e.fn);
          ctx.write(`${e.name}: `);
          ctx.build(e.fn);
        }
      });
      ctx.write('}');
    } else missed += ', 0';

    if(n.slot) {
      ctx.write(missed, ',', true);
      missed = '';
      if(ctx.isEmpty(n.slot.source)) {
        ctx.write('$runtime.makeBlock(');
        ctx.add(n.slot.template);
        ctx.write(')');
      } else {
        ctx.write('$runtime.makeBlock(');
        ctx.add(n.slot.template);
        ctx.write(', ($parentElement) => {', true);
        ctx.indent++;
        ctx.add(n.slot.source);
        ctx.indent--;
        ctx.write(true, '})');
      }
    }

    ctx.indent--;
    if(n.props.length || n.events.length || n.slot) ctx.write(true, ')');
    else ctx.write(')');
  });
}


export function attachFragmentSlot(label) {
  return xNode('fragment-slot', {
    el: label.bindName()
  }, (ctx, n) => {
    ctx.write(true, `$runtime.attachBlock(${n.el}, $$fragmentSlot?.())`);
  });
}


export function attchExportedFragment(node, label, componentName) {
  let data = {
    name: node.elArg,
    componentName,
    label: label.bindName()
  };

  let body = trimEmptyNodes(node.body || []);
  if(body.length) {
    data.slot = this.buildBlock({ body }, { inline: true });
    data.$compile = [data.slot.source];
    data.$wait = [data.slot.requireCD];
    // assert(!data.slot.template.svg, 'SVG is not supported for exported fragment');
  }

  let pa = parseAttibutes.call(this, node.attributes);
  data = { ...pa, ...data };

  return xNode('attach-exported-fragment', data, (ctx, n) => {
    ctx.write(true, `$runtime.attachBlock(${n.label}, $runtime.callExportedFragment($instance_${n.componentName}, '${n.name}'`);
    ctx.indent++;
    let missed = '';

    if(n.slot) {
      ctx.write(',', true);

      if(ctx.isEmpty(n.slot.source)) {
        ctx.write('$runtime.makeBlock(');
        ctx.add(n.slot.template);
        ctx.write(')');
      } else {
        ctx.write('$runtime.makeBlockBound(');
        ctx.add(n.slot.template);
        ctx.write(', ($parentElement) => {', true);
        ctx.indent++;
        ctx.add(n.slot.source);
        ctx.indent--;
        ctx.write(true, '})');
      }
    } else missed = ', null';

    if(n.forwardAllEvents) {
      if(n.events.length) this.warning(`Fragment: mixing binding and forwarding is not supported: '${node.openTag}'`);
      ctx.write(missed, ', $events');
      missed = '';
    } else if(n.events.length) {
      ctx.write(missed, ',', true, '{');
      missed = '';

      n.events.forEach((e, i) => {
        if(i) ctx.write(', ');
        if(e.callback) {
          if(e.name == e.callback) ctx.write(e.name);
          ctx.write(`${e.name}: ${e.callback}`);
        } else {
          assert(e.fn);
          ctx.write(`${e.name}: `);
          ctx.build(e.fn);
        }
      });
      ctx.write('}');
    } else missed += ', null';

    if(n.props.length) {
      if(missed) ctx.write(missed);
      missed = '';
      ctx.write(',', true);

      const writeProps = () => ctx.write('{' + n.props.map(p => p.name == p.value ? p.name : `${p.name}: ${p.value}`).join(', ') + '}');

      if(n.staticProps) writeProps();
      else {
        ctx.write('() => (');
        writeProps();
        ctx.write('), ');
        if(n.deepChecking) ctx.write('$runtime.compareDeep');
        else ctx.write('$runtime.keyComparator');
      }
    }

    ctx.indent--;
    ctx.write('));');
  });
}
