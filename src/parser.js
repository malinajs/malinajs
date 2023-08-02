import acorn from 'acorn';
import { assert, last, Q, unwrapExp } from './utils.js';

class Reader {
  constructor(source) {
    if(source instanceof Reader) return source;
    this.index = 0;
    this.source = source;
  }

  read(pattern) {
    assert(!this.end(), 'EOF');
    if(pattern == null) {
      return this.source[this.index++];
    } else if(pattern instanceof RegExp) {
      assert(pattern.source[0] == '^');
      const rx = this.source.substring(this.index).match(pattern);
      assert(rx && rx.index == 0, 'Wrong syntax');
      let r = rx[rx.length-1];
      this.index += rx[0].length;
      return r;
    } else throw 'Not implemented';
  }

  probe(pattern) {
    if(pattern instanceof RegExp) {
      assert(pattern.source[0] == '^');
      const r = this.source.substring(this.index).match(pattern);
      if(r) return r[0];
    } else {
      if(this.source[this.index] == pattern[0] && this.source.substr(this.index, pattern.length) == pattern) return pattern;
    }
    return null;
  }

  probeQuote() {
    const a = this.source[this.index];
    return a == '"' || a == "'" || a == '`';
  }

  readIf(pattern) {
    const r = this.probe(pattern);
    if(r != null) this.index += r.length;
    return r;
  }

  end() {
    return this.index >= this.source.length;
  }

  skip() {
    while(!this.end()) {
      if(!this.source[this.index].match(/\s/)) break;
      this.index++;
    }
  }

  readString() {
    let q = this.read();
    assert(q == '"' || q == '`' || q == `'`, 'Wrong syntax');
    let a = null, p, result = q;
    while(true) {
      p = a;
      a = this.read()
      result += a;
      if(a == q && p != '\\') break;
    }
    return result;
  }

  readAttribute() {
    let name = '';
    while(true) {
      if(this.end()) break;
      let a = this.source[this.index];
      if(a == '=' || a == '/' || a == '>' || a == '\t' || a == '\n' || a == '\v' || a == '\f' || a == '\r' || a == ' ' || a == ' ') break;
      name += a;
      this.index++;
    }
    assert(name, 'Syntax error');
    return name;
  }

  sub(start, end) {
    return this.source.substring(start, end || this.index);
  }
};


export function parseHTML(source) {
  const reader = new Reader(source);

  const readScript = (reader) => {
    class ScriptParser extends acorn.Parser {
      readToken_lt_gt(code) {
        if (this.input.slice(this.pos, this.pos + 9) == '</script>') {
          return this.finishToken(acorn.tokTypes.eof);
        }
        return super.readToken_lt_gt(code);
      }

      scan() {
        this.nextToken();
        while (this.type !== acorn.tokTypes.eof) {
          this.parseStatement(null, true, null);
        }
        return this.end;
      }
    }

    let start = reader.index;
    let parser = new ScriptParser({ ecmaVersion: 'latest', sourceType: 'module' }, reader.source, start);
    let end = parser.scan();
    reader.index = end + 9;
    return reader.sub(start, end);
  }

  const readStyle = () => {
    return reader.read(/^(.*?)<\/style>/s);
  };

  const readComment = () => {
    return reader.read(/^<!--.*?-->/s);
  };

  const readTemplate = () => {
    return reader.read(/^(.*?)<\/template>/s);
  };

  const go = (parent, push) => {
    let textNode = null;
    if(!push) push = n => parent.body.push(n);

    const addText = v => {
      if(!textNode) {
        textNode = {
          type: 'text',
          value: ''
        };
      }
      textNode.value += v;
    };

    const flushText = () => {
      if(!textNode) return;
      push(textNode);
      textNode = null;
    };

    while(!reader.end()) {
      if(reader.probe('<') && reader.probe(/^<\S/)) {
        flushText();

        if(reader.probe('<!--')) {
          push({
            type: 'comment',
            content: readComment()
          });
          continue;
        }

        if(reader.readIf('</')) { // close tag
          let name = reader.read(/^([^>]*)>/);
          name = name.trim();
          if(name) {
            name = name.split(':')[0];
            assert(name === parent.name, 'Wrong close-tag: ' + parent.name + ' - ' + name);
          }
          return;
        }

        let tag = readTag(reader);
        push(tag);
        if(tag.name === 'script') {
          tag.type = 'script';
          tag.content = readScript(reader);
          continue;
        } else if(tag.name === 'template') {
          tag.type = 'template';
          tag.content = readTemplate();
          continue;
        } else if(tag.name === 'style') {
          tag.type = 'style';
          tag.content = readStyle();
          continue;
        } else {
          tag.classes = new Set();
        }

        if(tag.closedTag) continue;

        tag.body = [];
        try {
          go(tag);
        } catch (e) {
          if(typeof e == 'string') e = new Error(e);
          if(!e.details) e.details = tag.openTag;
          throw e;
        }
        continue;
      } else if(reader.probe('{')) {
        if(reader.probe(/^\{[#/:@*]/)) {
          let bind = parseBinding(reader);
          if(bind.value[0] != '*') flushText();
          if(bind.value[0] == '*') {
            addText(bind.raw);
          } else if(bind.value.match(/^@\w+/)) {
            let tag = {
              type: 'systag',
              value: bind.value
            };
            push(tag);
            continue;
          } else if(bind.value.startsWith('#each ')) {
            let tag = {
              type: 'each',
              value: bind.value,
              mainBlock: []
            };
            push(tag);
            go(tag, n => tag.mainBlock.push(n));
            continue;
          } else if(bind.value === ':else' && parent.type === 'each') {
            assert(!parent.elseBlock);
            parent.elseBlock = [];
            return go(parent, n => parent.elseBlock.push(n));
          } else if(bind.value === '/each') {
            assert(parent.type === 'each', 'Bind error: /each');
            return;
          } else if(bind.value.startsWith('#if ')) {
            let tag = {
              type: 'if',
              parts: [{
                value: bind.value,
                body: []
              }]
            };
            push(tag);
            go(tag, n => tag.parts[0].body.push(n));
            continue;
          } else if(bind.value.match(/^:elif\s|^:else\s+if\s/)) {
            assert(parent.type === 'if', 'Bind error: :else');
            let part = {
              value: bind.value,
              body: []
            };
            parent.parts.push(part);
            return go(parent, n => part.body.push(n));
          } else if(bind.value === ':else') {
            assert(parent.type === 'if', 'Bind error: :else');
            parent.elsePart = [];
            return go(parent, n => parent.elsePart.push(n));
          } else if(bind.value === '/if') {
            assert(parent.type === 'if', 'Bind error: /if');
            return;
          } else if(bind.value.startsWith('#await ')) {
            let tag = {
              type: 'await',
              value: bind.value,
              parts: { main: [] }
            };
            push(tag);
            go(tag, n => tag.parts.main.push(n));
            continue;
          } else if(bind.value.match(/^:then( |$)/)) {
            assert(parent.type === 'await', 'Bind error: await-then');
            parent.parts.then = [];
            parent.parts.thenValue = bind.value;
            return go(parent, n => parent.parts.then.push(n));
          } else if(bind.value.match(/^:catch( |$)/)) {
            assert(parent.type === 'await', 'Bind error: await-catch');
            parent.parts.catch = [];
            parent.parts.catchValue = bind.value;
            return go(parent, n => parent.parts.catch.push(n));
          } else if(bind.value == '/await') {
            assert(parent.type === 'await', 'Bind error: /await');
            return;
          } else if(bind.value.match(/^#slot(:| |$)/)) {
            let tag = {
              type: 'slot',
              value: bind.value,
              body: []
            };
            push(tag);
            go(tag);
            continue;
          } else if(bind.value == '/slot') {
            assert(parent.type === 'slot', 'Slot error: /slot');
            return;
          } else if(bind.value.startsWith('#fragment:')) {
            let tag = {
              type: 'fragment',
              value: bind.value,
              body: []
            };
            push(tag);
            go(tag);
            continue;
          } else if(bind.value == '/fragment') {
            assert(parent.type === 'fragment', 'Fragment error: /fragment');
            return;
          } else if(bind.value.match(/^#([\w\-]+)/)) {
            const name = bind.value.match(/^#([\w\-]+)/)[1];
            let tag = {
              type: 'block',
              value: bind.value,
              name,
              body: []
            };
            push(tag);
            go(tag);
            continue;
          } else if(bind.value.match(/^\/([\w\-]+)/)) {
            const name = bind.value.match(/^\/([\w\-]+)/)[1];
            assert(parent.type === 'block' && parent.name == name, `Fragment error: ${parent.name} - ${name}`);
            return;
          } else throw 'Error binding: ' + bind.value;
        } else {
          addText(parseBinding(reader).raw);
          continue;
        }
      }

      addText(reader.read());
    }
    flushText();
    assert(parent.type === 'root', 'File ends to early');
  };

  let root = {
    type: 'root',
    body: []
  };
  go(root);

  return root;
};


function readTag(reader) {
  const start = reader.index;
  assert(reader.read() === '<', 'Tag error');

  let name = reader.read(/^[\da-zA-Z^\-]+/);
  let elArg = null;

  if(reader.readIf(':')) {
    elArg = reader.read(/^[^\s>/]+/);
  }

  let attributes = parseAttibutes(reader, {closedByTag: true});

  let closedTag = false;
  if(reader.readIf('/>')) closedTag = true;
  else assert(reader.readIf('>'));

  const voidTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
  let voidTag = voidTags.indexOf(name) >= 0;
  if(voidTag) closedTag = true;
  return {
    type: 'node',
    name,
    elArg,
    openTag: reader.sub(start),
    start: start,
    end: reader.index,
    closedTag,
    voidTag,
    attributes
  };
};


export function parseText(source) {
  let i = 0;
  let step = 0;
  let text = '';
  let exp = '';
  let q;
  let len = source.length;
  let parts = [];
  let depth = 0;
  while(i < len) {
    let a = source[i++];
    if(step == 1) {
      if(q) {
        if(a === q) q = null;
        exp += a;
        continue;
      }
      if(a === '"' || a === "'" || a === '`') {
        q = a;
        exp += a;
        continue;
      }
      if(a === '{') depth++;
      else if(a === '}') {
        depth--;
        if(!depth) {
          step = 0;
          let js = exp[0] == '*';
          if(js) exp = exp.substring(1);
          exp = exp.trim();
          if(!exp) throw 'Wrong expression';
          parts.push({ value: exp, type: js ? 'js' : 'exp' });
          exp = '';
          continue;
        }
      }
      exp += a;
      continue;
    }
    if(a === '{') {
      depth++;
      if(text) {
        parts.push({ value: text, type: 'text' });
        text = '';
      }
      step = 1;
      continue;
    }
    text += a;
  }
  if(text) parts.push({ value: text, type: 'text' });
  assert(step == 0, 'Wrong expression: ' + source);
  let staticText = null;
  if(!parts.some(p => p.type == 'exp')) staticText = parts.map(p => p.type == 'text' ? p.value : '').join('');

  let pe = {
    parts,
    staticText,
    binding: parts.length == 1 && parts[0].type == 'exp' ? parts[0].value : null,
    getResult() {
      let result = [];
      this.parts.forEach(p => {
        if(p.type == 'js') return;
        if(p.type == 'exp') result.push(p);
        else {
          let l = last(result);
          if(l?.type == 'text') l.value += p.value;
          else result.push({ ...p });
        }
      });

      return '`' + result.map(p => p.type == 'text' ? Q(p.value) : '${' + p.value + '}').join('') + '`';
    }
  };
  pe.result = pe.getResult();
  return pe;
}


export const parseBinding = (source) => {
  const reader = new Reader(source);
  let start = reader.index;

  assert(reader.read() === '{', 'Bind error');
  let a = null, p, q;
  let bkt = 1;

  while(true) {
    p = a;
    a = reader.read();

    if(q) {
      if(a != q) continue;
      if(p == '\\') continue;
      q = null;
      continue;
    }
    if(a == '"' || a == "'" || a == '`') {
      q = a;
      continue;
    }
    if(a == '*' && p == '/') {
      // comment block
      while(true) {
        p = a;
        a = reader.read();
        if(a == '/' && p == '*') break;
      }
      continue;
    }

    if(a == '{') {
      bkt++;
      continue;
    }
    if(a == '}') {
      bkt--;
      if(bkt > 0) continue;
    } else continue;

    const raw = reader.sub(start);
    return {
      raw,
      value: raw.substring(1, raw.length - 1).trim(),
    };
  }
};


export const parseAttibutes = (source, option={}) => {
  const r = new Reader(source);
  let result = [];

  while(!r.end()) {
    r.skip();
    if(option.closedByTag) {
      if(r.probe('/>') || r.probe('>')) break;
    } else if(r.end()) break;
    let start = r.index;
    if(r.probe('{*')) {
      const {raw} = parseBinding(r);
      result.push({name: raw, content: raw});
    } else if(r.probe('*{')) {
      r.read();
      let {raw} = parseBinding(r);
      raw = '*' + raw;
      result.push({name: raw, content: raw});
    } else if(r.probe('{...')) {
      let {raw} = parseBinding(r);
      result.push({name: raw, content: raw});
    } else {
      let name = r.readAttribute();
      assert(name, 'Wrong syntax');
      if(r.readIf('=')) {
        if(r.probe('{')) {
          const {raw} = parseBinding(r);
          result.push({name, value: raw, raw, content: r.sub(start)});
        } else if(r.probeQuote()) {
          const raw = r.readString();
          const value = raw.substring(1, raw.length - 1);
          result.push({name, value, raw, content: r.sub(start)});
        } else {
          const value = r.readIf(/^[^\s<>]+/);
          result.push({name, value, raw: value, content: r.sub(start)});
        }
      } else {
        let value;
        if(name[0] == '{' && last(name) == '}' && !name.startsWith('{...')) {
          value = name;
          name = unwrapExp(name);
        }
        result.push({name, value, raw: value, content: r.sub(start)});
      }
    }
  }

  return result;
}
