
import { assert, Q } from '../utils.js'
import { parseText } from '../parser.js'


export function bindProp(prop, makeEl, node) {
    let arg, name;
    if(prop.name[0] == '@') {
        arg = prop.name.substring(1);
        name = 'on';
    } else {
        let r = prop.name.match(/^(\w+)\:(.*)$/)
        if(r) {
            name = r[1];
            arg = r[2];
        } else name = prop.name;
    }

    function getExpression() {
        let exp = prop.value.match(/^\{(.*)\}$/)[1];
        assert(exp, prop.content);
        return exp;
    }

    if(name == 'on') {
        let exp = getExpression();
        let mod = '', opt = arg.split('|');
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
        let attr = arg;
        assert(attr, prop.content);
        if(attr === 'value') {
            return {bind: `{
                    let $element=${makeEl()};
                    $cd.ev($element, 'input', () => { ${exp}=$element.value; $$apply(); });
                    $watchReadOnly($cd, () => (${exp}), (value) => { if(value != $element.value) $element.value = value; });
                }`};
        } else if(attr == 'checked') {
            return {bind: `{
                    let $element=${makeEl()};
                    $cd.ev($element, 'input', () => { ${exp}=$element.checked; $$apply(); });
                    $watchReadOnly($cd, () => !!(${exp}), (value) => { if(value != $element.checked) $element.checked = value; });
                }`};
        } else throw 'Not supported: ' + prop.content;
    } else if(name == 'class' && arg) {
        let exp = getExpression();
        let className = arg;
        assert(className, prop.content);
        return {bind: `{
                let $element = ${makeEl()};
                $watchReadOnly($cd, () => !!(${exp}), (value) => { if(value) $element.classList.add("${className}"); else $element.classList.remove("${className}"); });
            }`};
    } else if(name == 'use') {
        if(arg) {
            let args = prop.value?getExpression():'';
            let code = `$cd.once(() => {
                let useObject = ${arg}(${makeEl()}${args?', '+args:''});\n if(useObject) {`;
            if(args) code += `
                if(useObject.update) {
                    let w = $watch($cd, () => [${args}], (args) => {useObject.update.apply(useObject, args);}, {cmp: $$compareArray});
                    w.value = w.fn();
                }`;
            code += `if(useObject.destroy) $cd.d(useObject.destroy);}});`;
            return {bind: code};
        }
        let exp = getExpression();
        return {bind: `{
            let $element=${makeEl()};
            $cd.once(() => { $$apply(); ${exp}; });}`};
    } else {
        if(prop.value && prop.value.indexOf('{') >= 0) {
            let exp = parseText(prop.value);
            if(['hidden','checked','value','disabled','selected'].indexOf(name) >= 0) {
                return {bind: `{
                    let $element=${makeEl()};
                    $watchReadOnly($cd, () => (${exp}), (value) => {$element.${name} = value;});
                }`};
            } else {
                let suffix = this.css?`+' ${this.css.id}'`:'';
                return {bind: `{
                    let $element=${makeEl()};
                    $watchReadOnly($cd, () => (${exp})${suffix}, (value) => {
                        if(value) $element.setAttribute('${name}', value);
                        else $element.removeAttribute('${name}');
                    });
                }`};
            }
        }
        if(name == 'class' && node.scopedClass) {
            let classList = prop.value.trim();
            if(classList) classList += ' ';
            classList += this.css.id;

            return {
                prop: `class="${classList}"`
            }
        }
        return {
            prop: prop.content
        }
    }
};
