
import { unwrapExp, assert as _assert, detectExpressionType, xNode, replaceElementKeyword, last } from './utils.js';


export function makeEventProp(prop, requireElement) {
    const assert = x => {
        _assert(x, `Wrong event prop: ${prop.content}`)
    }

    let name = prop.name;
    if(name.startsWith('@@')) {
        assert(!prop.value);
        return {forward: true, name};
    }
    if(name.startsWith('on:')) name = name.substring(3);
    else {
        assert(name[0] == '@');
        name = name.substring(1);
    }

    let event = '';
    let modList = [], _mod = '';
    let handler = '', exp, func;
    let step = 0;
    for(let a of name) {
        if(a == '|') {
            assert(step <= 1);
            step = 1;
            if(_mod) modList.push(_mod);
            _mod = '';
            continue;
        }
        if(a == ':') {
            assert(step < 2);
            step = 2;
            continue;
        }
        if(step == 0) event += a;
        else if(step == 1) _mod += a;
        else if(step == 2) handler += a;
    }
    if(_mod) modList.push(_mod);

    if(prop.value) {
        assert(!handler);
        exp = unwrapExp(prop.value);
        exp = replaceElementKeyword(exp, requireElement);
    } else if(!handler) handler = event;

    this.detectDependency(exp || handler);

    if(exp) {
        let type = detectExpressionType(exp);
        if(type == 'identifier') {
            handler = exp;
            exp = null;
        } else if(type == 'function') {
            func = exp;
            exp = null;
        };
    }

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
    let needPrevent, preventInserted;
    modList.forEach(opt => {
        if(opt == 'preventDefault' || opt == 'prevent') {
            if(preventInserted) return;
            mods.push('$event.preventDefault();');
            preventInserted = true;
            return;
        } else if(opt == 'stopPropagation' || opt == 'stop') {
            mods.push('$event.stopPropagation();');
            return;
        };

        if(keyEvent) {
            if(opt === 'delete') {
                mods.push(`if($event.key != 'Backspace' && $event.key != 'Delete') return;`);
                return;
            }
            let keyCode = keyCodes[opt];
            if(keyCode) {
                mods.push(`if($event.key != '${keyCode}') return;`);
                return;
            }
        }

        if(opt == 'ctrl') {mods.push(`if(!$event.ctrlKey) return;`); return;}
        if(opt == 'alt') {mods.push(`if(!$event.altKey) return;`); return;}
        if(opt == 'shift') {mods.push(`if(!$event.shiftKey) return;`); return;}
        if(opt == 'meta') {mods.push(`if(!$event.metaKey) return;`); return;}

        throw 'Wrong modificator: ' + opt;
    });
    if(needPrevent && !preventInserted) mods.push('$event.preventDefault();');
    mods = mods.join(' ');

    if(!this.script.readOnly) this.require('apply');

    // this.checkRootName(handler);

    let fn = xNode('event-callback', {
        exp,
        handlerName: handler,
        func,
        mods
    }, (ctx, n) => {
        if(n.handlerName && !ctx.inuse.apply && !n.mods) return ctx.write(n.handlerName);
        ctx.write(`($event) => { `);
        if(n.mods) ctx.write(n.mods, ' ');
        if(n.handlerName) ctx.write(`${n.handlerName}($event);`);
        else if(n.exp) {
            if(last(n.exp) != ';') n.exp += ';';
            ctx.write(`${n.exp}`);
        } else if(n.func) ctx.write(`(${n.func})($event);`);
        if(ctx.inuse.apply) ctx.write(` $$apply();`);
        ctx.write(`}`);
    });

    return {event, fn};
}
