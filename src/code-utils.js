import { unwrapExp, toCamelCase, assert, isNumber, Q } from './utils.js';


export function inspectProp(prop) {
  let { name, value } = prop;
  if(name[0] == '{') {
    assert(!prop.value);
    value = name;
    name = unwrapExp(name);
  }

  assert(name.match(/^([\w$_][\w\d$_.\-]*)$/), `Wrong property: '${name}'`);
  name = toCamelCase(name);
  if(name == 'class') name = '_class';

  let rawValue, statical = false;

  if(value && value.includes('{')) {
    const pe = this.parseText(value);
    this.detectDependency(pe);

    if(pe.parts.length == 1 && pe.parts[0].type == 'exp') {
      let v = pe.parts[0].value;

      if(isNumber(v)) {
        value = v;
        rawValue = Number(v);
        statical = true;
      } else if(v == 'true' || v == 'false') {
        value = v;
        rawValue = v == 'true';
        statical = true;
      } else if(v == 'null') {
        value = 'null';
        rawValue = null;
        statical = true;
      }
    }

    if(!statical) value = pe.result;
  } else if(value) {
    rawValue = value;
    value = '`' + Q(value) + '`';
    statical = true;
  } else {
    rawValue = true;
    value = 'true';
    statical = true;
  }

  return { name, value, rawValue, static: statical };
}
