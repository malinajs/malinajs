import { unwrapExp, toCamelCase, assert, isNumber, Q } from './utils.js';
import { parseBinding } from './parser.js';


export function inspectProp(prop) {
  let { name, value } = prop, mod = {};
  if(name[0] == '{') {
    assert(!prop.value);
    value = name;
    name = unwrapExp(name);
  } else {
    const p = name.split('|');
    name = p[0];
    p.slice(1).forEach(n => mod[n] = true);
  }

  assert(name.match(/^([\w$_][\w\d$_.\-|]*)$/), `Wrong property: '${name}'`);
  name = toCamelCase(name);
  if(name == 'class') name = '_class';

  let statical = false;

  if(value && value.includes('{')) {
    const pe = parseBinding(value);
    const v = pe.value;
    this.detectDependency(v);

    if(isNumber(v)) {
      value = v;
      statical = true;
    } else if(v == 'true' || v == 'false') {
      value = v;
      statical = true;
    } else if(v == 'null') {
      value = 'null';
      statical = true;
    } else {
      value = v;
    }
  } else if(value) {
    value = '`' + Q(value) + '`';
    statical = true;
  } else {
    value = 'true';
    statical = true;
  }

  return { name, value, static: statical, mod };
}
