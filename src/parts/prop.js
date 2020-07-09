
import { assert, Q } from '../utils.js'


export function bindProp(prop, makeEl) {
    let parts = prop.name.split(':');
    let name = parts[0];
    
    function getExpression() {
        let exp = prop.value.match(/^\{(.*)\}$/)[1];
        assert(exp, prop.content);
        return exp;
    }

    if(name == 'on') {
        let exp = getExpression();
        let mod = '', opt = parts[1].split('|');
        let event = opt[0];
        opt.slice(1).forEach(opt => {
            if(opt == 'preventDefault') mod += `$event.preventDefault();`;
            else if(opt == 'enter') mod += `if($event.keyCode != 13) return; $event.preventDefault();`;
            else if(opt == 'escape') mod += `if($event.keyCode != 27) return; $event.preventDefault();`;
            else throw 'Wrong modificator: ' + opt;
        });
        assert(event, prop.content);
        return {bind:`{
            let $element=${makeEl()};
            $cd.ev($element, "${event}", ($event) => { ${mod} $$apply(); ${Q(exp)}});
            }`};
    } else if(name == 'bind') {
        let exp = getExpression();
        let attr = parts[1];
        assert(attr, prop.content);
        if(attr === 'value') {
            return {bind: `{
                    let $element=${makeEl()};
                    $cd.ev($element, 'input', () => { ${exp}=$element.value; $$apply(); });
                    $cd.wf(() => (${exp}), (value) => { if(value != $element.value) $element.value = value; });
                }`};
        } else if(attr == 'checked') {
            return {bind: `{
                    let $element=${makeEl()};
                    $cd.ev($element, 'input', () => { ${exp}=$element.checked; $$apply(); });
                    $cd.wf(() => !!(${exp}), (value) => { if(value != $element.checked) $element.checked = value; });
                }`};
        } else throw 'Not supported: ' + prop.content;
    } else if(name == 'class' && parts.length > 1) {
        let exp = getExpression();
        let className = parts[1];
        assert(className, prop.content);
        return {bind: `{
                let $element = ${makeEl()};
                $cd.wf(() => !!(${exp}), (value) => { if(value) $element.classList.add("${className}"); else $element.classList.remove("${className}"); });
            }`};
    } else if(name == 'use') {
        if(parts.length == 2) {
            let args = prop.value?getExpression():'';
            let code = `{let useObject = ${parts[1]}(${makeEl()}${args?', '+args:''});\n if(useObject) {`;
            if(args) code += `
                if(useObject.update) {
                    let w = $cd.wa(() => [${args}], (args) => {useObject.update.apply(useObject, args);});
                    w.value = w.fn();
                }`;
            code += `if(useObject.destroy) $cd.d(useObject.destroy);}}`;
            return {bind: code};
        }
        assert(parts.length == 1, prop.content);
        let exp = getExpression();
        return {bind: `{
            let $element=${makeEl()};
            $cd.once(() => { $$apply(); ${exp}; });}`};
    } else {
        if(prop.value && prop.value.indexOf('{') >= 0) {
            let exp = parseText(prop.value, true);
            if(['hidden','checked','value','disabled','selected'].indexOf(name) >= 0) {
                return {bind: `{
                    let $element=${makeEl()};
                    $cd.wf(() => (${exp}), (value) => {$element.${name} = value;});
                }`};
            } else {
                return {bind: `{
                    let $element=${makeEl()};
                    $cd.wf(() => (${exp}), (value) => {
                        if(value) $element.setAttribute('${name}', value);
                        else $element.removeAttribute('${name}');
                    });
                }`};
            }
        }
        return {
            prop: prop.content
        }
    }
};
