import { unwrapExp, assert as _assert, detectExpressionType, replaceKeyword, last } from './utils.js';
import { xNode } from './xnode.js';


export function makeEventProp(prop, requireElement) {
  const assert = x => {
    _assert(x, `Wrong event prop: ${prop.content}`);
  };

  let name = prop.name;
  if (name.startsWith('@@')) {
    assert(!prop.raw);
    return { forward: true, name };
  }
  if (name.startsWith('on:')) name = name.substring(3);
  else {
    assert(name[0] == '@');
    name = name.substring(1);
  }

  // parse event
  let modList = name.split('|');
  let event = modList.shift();
  let globalFunction = false;

  let handler, exp;
  if (prop.type == 'attribute') {
    assert(!prop.raw);
    handler = event;
    globalFunction = !!this.script.rootFunctions[handler];
  } else if (prop.type == 'word') {
    handler = prop.raw;
    assert(detectExpressionType(handler) == 'identifier');
    globalFunction = !!this.script.rootFunctions[handler];
  } else if (prop.type == 'exp') {
    exp = unwrapExp(prop.raw);
    this.detectDependency(exp);
    let type = detectExpressionType(exp);
    if (type == 'identifier') {
      handler = exp;
      exp = null;
    } else if (type?.type == 'function-call') {
      globalFunction = !!this.script.rootFunctions[type.name];
      exp = replaceKeyword(exp, (name) => {
        if (name == '$element') return requireElement();
      }, true);
    } else {
      assert(!type);
      exp = replaceKeyword(exp, (name) => {
        if (name == '$element') return requireElement();
      }, true);
      this.require('apply');
    }
  } else assert(false);

  // modifiers

  let keyEvent = ['keydown', 'keypress', 'keyup'].includes(event);
  let keyCodes = {
    enter: 'Enter',
    tab: 'Tab',
    esc: 'Escape',
    escape: 'Escape',
    space: ' ',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight'
  };

  let mods = [];
  let rootModifier = false;
  modList.forEach(opt => {
    if (opt == 'root') {
      rootModifier = true;
      return;
    }
    if (opt == 'preventDefault' || opt == 'prevent') {
      mods.push('$event.preventDefault();');
      return;
    } else if (opt == 'stopPropagation' || opt == 'stop') {
      mods.push('$event.stopPropagation();');
      return;
    }

    if (keyEvent) {
      if (opt === 'delete') {
        mods.push('if($event.key != \'Backspace\' && $event.key != \'Delete\') return;');
        return;
      }
      let keyCode = keyCodes[opt];
      if (keyCode) {
        mods.push(`if($event.key != '${keyCode}') return;`);
        return;
      }
    }

    if (opt == 'ctrl') { mods.push('if(!$event.ctrlKey) return;'); return; }
    if (opt == 'alt') { mods.push('if(!$event.altKey) return;'); return; }
    if (opt == 'shift') { mods.push('if(!$event.shiftKey) return;'); return; }
    if (opt == 'meta') { mods.push('if(!$event.metaKey) return;'); return; }

    throw 'Wrong modificator: ' + opt;
  });
  mods = mods.join(' ');

  let fn = xNode('event-callback', {
    exp,
    handlerName: handler,
    mods,
    globalFunction
  }, (ctx, n) => {
    if (n.handlerName && !n.mods && (n.globalFunction || !this.inuse.apply)) return ctx.write(n.handlerName);
    ctx.write('($event) => { ');
    if (n.mods) ctx.write(n.mods, ' ');
    if (n.handlerName) ctx.write(`${n.handlerName}($event);`);
    else {
      assert(n.exp);
      ctx.write(n.exp);
      if (last(n.exp) != ';') ctx.write(';');
    }
    if (this.inuse.apply && !n.globalFunction) ctx.write(' $$apply();');
    ctx.write('}');
  });

  return { event, fn, rootModifier };
}
