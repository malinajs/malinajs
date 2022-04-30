import { assert, last, Q } from './utils.js';


export function parse() {
  let source = this.source;
  let index = 0;

  const readNext = () => {
    assert(index < source.length, 'EOF');
    return source[index++];
  };

  const readTag = () => {
    let start = index;
    let a = readNext();
    assert(a === '<', 'Tag error');
    let attributes = [];
    let begin = true;
    let name = '';
    let eq, attr_start;
    let elArg = null;

    const error = (name) => {
      let e = new Error(name);
      e.details = source.substring(start, index);
      throw e;
    };

    function flush(shift) {
      if(!attr_start) return;
      shift = shift || 0;
      let end = index - 1 + shift;
      if(elArg === true) {
        elArg = source.substring(attr_start, end);
        attr_start = null;
        eq = null;
        return;
      }
      let a = {
        content: source.substring(attr_start, end)
      };
      if(eq) {
        a.name = source.substring(attr_start, eq);
        a.value = source.substring(eq + 1, end);
        if(a.value[0] == '"' || a.value[0] == '\'') a.value = a.value.substring(1);
        let i = a.value.length - 1;
        if(a.value[i] == '"' || a.value[i] == '\'') a.value = a.value.substring(0, i);
      } else a.name = a.content;
      attributes.push(a);
      attr_start = null;
      eq = null;
    }

    while(true) {
      a = readNext();
      if(!begin && !attr_start && a.match(/\S/) && a != '/' && a != '>') attr_start = index - 1;
      if(a == '"' || a == "'" || a == '`') {
        while(a != readNext());
        continue;
      }
      if(a == '{') {
        index--;
        readBinding();
        flush(1);
        continue;
      }
      if(a == '}') error('Wrong attr');
      if(a == '<') error('Wrong tag');
      if(a == '/') {
        a = readNext();
        assert(a == '>');
        flush(-1);
      }
      if(a == '>') {
        flush();
        const voidTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
        let voidTag = voidTags.indexOf(name) >= 0;
        let closedTag = voidTag || source[index - 2] == '/';
        return {
          type: 'node',
          name,
          elArg,
          openTag: source.substring(start, index),
          start: start,
          end: index,
          closedTag,
          voidTag,
          attributes
        };
      }
      if(begin) {
        if(a.match(/[\da-zA-Z^\-]/)) {
          name += a;
          continue;
        } else {
          begin = false;
          if(a == ':') {
            elArg = true;
            attr_start = index;
          }
        }
      } else if(attr_start) {
        if(a == '=' && !eq) eq = index - 1;
        else if(a.match(/\s/)) flush();
      }
    }
  };

  const readScript = (tag) => {
    let endTag = `</${tag}>`;
    let q, a, p, start = index;
    while(true) {
      p = a;
      a = readNext();
      if(q) {
        if(a != q) continue;
        if(p == '\\') continue;
        q = null;
        continue;
      }
      if(a == '"' || a == '\'' || a == '`') {
        q = a;
        continue;
      }
      if(a == '<') {
        if(source.substring(index - 1, index + endTag.length - 1) == endTag) {
          let end = index - 1;
          index += endTag.length - 1;
          return source.substring(start, end);
        }
      }
    }
  };

  const readStyle = () => {
    let start = index;
    let end = source.substring(start).indexOf('</style>') + start;
    assert(end >= 0, '<style> is not closed');
    index = end + 9;
    return source.substring(start, end);
  };

  const readBinding = () => {
    let start = index;
    assert(readNext() === '{', 'Bind error');
    let a = null, p, q;
    let bkt = 1;

    while(true) {
      p = a;
      a = readNext();

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
          a = readNext();
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

      return {
        value: source.substring(start + 1, index - 1),
        raw: source.substring(start, index)
      };
    }
  };

  const readComment = () => {
    let start = index;
    let end = source.indexOf('-->', start);
    assert(end >= 0, 'Comment is not closed');
    end += 3;
    index = end;
    return source.substring(start, end);
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

    while(index < source.length) {
      let a = source[index];
      if(a === '<' && source[index+1].match(/\S/)) {
        flushText();

        if(source.substring(index, index + 4) === '<!--') {
          push({
            type: 'comment',
            content: readComment()
          });
          continue;
        }

        if(source[index + 1] === '/') { // close tag
          let name = '';
          index += 2;
          while(true) {
            a = readNext();
            if(a === '>') break;
            name += a;
          }
          name = name.trim();
          if(name) {
            name = name.split(':')[0];
            assert(name === parent.name, 'Wrong close-tag: ' + parent.name + ' - ' + name);
          }
          return;
        }

        let tag = readTag();
        push(tag);
        if(tag.name === 'script') {
          tag.type = 'script';
          tag.content = readScript('script');
          continue;
        } else if(tag.name === 'template') {
          tag.type = 'template';
          tag.content = readScript('template');
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
      } else if(a === '{') {
        if(['#', '/', ':', '@', '*'].indexOf(source[index + 1]) >= 0) {
          let bind = readBinding();
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
              parts: {main: []}
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
          } else throw 'Error binding: ' + bind.value;
        }
      }

      addText(readNext());
    }
    flushText();
    assert(parent.type === 'root', 'File ends to early');
  };

  let root = {
    type: 'root',
    body: []
  };
  go(root);

  this.DOM = root;
}


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
  let result = [];
  parts.forEach(p => {
    if(p.type == 'js') return;
    if(p.type == 'exp') result.push(p);
    else {
      let l = last(result);
      if(l?.type == 'text') l.value += p.value;
      else result.push({ ...p });
    }
  });
  result = result.map(p => p.type == 'text' ? '`' + Q(p.value) + '`' : '(' + p.value + ')').join('+');
  return { result, parts, staticText };
}
