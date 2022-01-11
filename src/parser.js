import { assert, last } from './utils.js';


export function parse() {
  const source = this.source;
  let index = 0;

  const readNext = () => {
    assert(index < source.length, 'EOF');
    return source[index++];
  };

  const readTag = () => {
    const start = index;
    let a = readNext();
    assert(a === '<', 'Tag error');
    const attributes = [];
    let begin = true;
    let name = '';
    let eq, attr_start;
    let elArg = null;

    const error = (name) => {
      const e = new Error(name);
      e.details = source.substring(start, index);
      throw e;
    };

    function flush(shift) {
      if (!attr_start) return;
      shift = shift || 0;
      const end = index - 1 + shift;
      if (elArg === true) {
        elArg = source.substring(attr_start, end);
        attr_start = null;
        eq = null;
        return;
      }
      const a = {
        content: source.substring(attr_start, end)
      };
      if (eq) {
        a.name = source.substring(attr_start, eq);
        a.value = source.substring(eq + 1, end);
        if (a.value[0] == '"' || a.value[0] == '\'') a.value = a.value.substring(1);
        const i = a.value.length - 1;
        if (a.value[i] == '"' || a.value[i] == '\'') a.value = a.value.substring(0, i);
      } else a.name = a.content;
      attributes.push(a);
      attr_start = null;
      eq = null;
    }

    while (true) {
      a = readNext();
      if (!begin && !attr_start && a.match(/\S/) && a != '/' && a != '>') attr_start = index - 1;
      if (a == '"' || a == "'" || a == '`') {
        while (a != readNext());
        continue;
      }
      if (a == '{') {
        index--;
        readBinding();
        flush(1);
        continue;
      }
      if (a == '}') error('Wrong attr');
      if (a == '<') error('Wrong tag');
      if (a == '/') {
        a = readNext();
        assert(a == '>');
        flush(-1);
      }
      if (a == '>') {
        flush();
        const voidTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
        const voidTag = voidTags.indexOf(name) >= 0;
        const closedTag = voidTag || source[index - 2] == '/';
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
      if (begin) {
        if (a.match(/[\da-zA-Z^]/)) {
          name += a;
          continue;
        } else {
          begin = false;
          if (a == ':') {
            elArg = true;
            attr_start = index;
          }
        }
      } else if (attr_start) {
        if (a == '=' && !eq) eq = index - 1;
        else if (a.match(/\s/)) flush();
      }
    }
  };

  const readScript = (tag) => {
    const endTag = `</${tag}>`;
    let q; let a; let p; const start = index;
    while (true) {
      p = a;
      a = readNext();
      if (q) {
        if (a != q) continue;
        if (p == '\\') continue;
        q = null;
        continue;
      }
      if (a == '"' || a == '\'' || a == '`') {
        q = a;
        continue;
      }
      if (a == '<') {
        if (source.substring(index - 1, index + endTag.length - 1) == endTag) {
          const end = index - 1;
          index += endTag.length - 1;
          return source.substring(start, end);
        }
      }
    }
  };

  const readStyle = () => {
    const start = index;
    const end = source.substring(start).indexOf('</style>') + start;
    assert(end >= 0, '<style> is not closed');
    index = end + 9;
    return source.substring(start, end);
  };

  const readBinding = () => {
    const start = index;
    assert(readNext() === '{', 'Bind error');
    let a = null; let p; let q;
    let bkt = 1;

    while (true) {
      p = a;
      a = readNext();

      if (q) {
        if (a != q) continue;
        if (p == '\\') continue;
        q = null;
        continue;
      }
      if (a == '"' || a == "'" || a == '`') {
        q = a;
        continue;
      }
      if (a == '*' && p == '/') {
        // comment block
        while (true) {
          p = a;
          a = readNext();
          if (a == '/' && p == '*') break;
        }
        continue;
      }

      if (a == '{') {
        bkt++;
        continue;
      }
      if (a == '}') {
        bkt--;
        if (bkt > 0) continue;
      } else continue;

      return {
        value: source.substring(start + 1, index - 1)
      };
    }
  };

  const readComment = () => {
    const start = index;
    let end = source.indexOf('-->', start);
    assert(end >= 0, 'Comment is not closed');
    end += 3;
    index = end;
    return source.substring(start, end);
  };

  const go = (parent) => {
    let textNode = null;

    const flushText = () => {
      if (!textNode) return;
      parent.body.push(textNode);
      textNode = null;
    };

    while (index < source.length) {
      let a = source[index];
      if (a === '<') {
        flushText();

        if (source.substring(index, index + 4) === '<!--') {
          parent.body.push({
            type: 'comment',
            content: readComment()
          });
          continue;
        }

        if (source[index + 1] === '/') { // close tag
          let name = '';
          index += 2;
          while (true) {
            a = readNext();
            if (a === '>') break;
            name += a;
          }
          name = name.trim();
          if (name) {
            name = name.split(':')[0];
            assert(name === parent.name, 'Wrong close-tag: ' + parent.name + ' - ' + name);
          }
          return;
        }

        const tag = readTag();
        parent.body.push(tag);
        if (tag.name === 'script') {
          tag.type = 'script';
          tag.content = readScript('script');
          continue;
        } else if (tag.name === 'template') {
          tag.type = 'template';
          tag.content = readScript('template');
          continue;
        } else if (tag.name === 'style') {
          tag.type = 'style';
          tag.content = readStyle();
          continue;
        } else {
          tag.classes = new Set();
        }

        if (tag.closedTag) continue;

        tag.body = [];
        try {
          go(tag);
        } catch (e) {
          if (typeof e == 'string') e = new Error(e);
          if (!e.details) e.details = tag.openTag;
          throw e;
        }
        continue;
      } else if (a === '{') {
        if (['#', '/', ':', '@'].indexOf(source[index + 1]) >= 0) {
          flushText();
          const bind = readBinding();
          if (bind.value.match(/^@\w+/)) {
            const tag = {
              type: 'systag',
              value: bind.value
            };
            parent.body.push(tag);
            continue;
          } else if (bind.value.startsWith('#each ')) {
            const tag = {
              type: 'each',
              value: bind.value,
              body: []
            };
            parent.body.push(tag);
            go(tag);
            continue;
          } else if (bind.value === '/each') {
            assert(parent.type === 'each', 'Bind error: /each');
            return;
          } else if (bind.value.startsWith('#if ')) {
            const tag = {
              type: 'if',
              value: bind.value,
              body: []
            };
            parent.body.push(tag);
            go(tag);
            continue;
          } else if (bind.value === '/if') {
            assert(parent.type === 'if', 'Bind error: /if');
            return;
          } else if (bind.value === ':else') {
            assert(parent.type === 'if', 'Bind error: :else');
            parent.bodyMain = parent.body;
            parent.body = [];
          } else if (bind.value.startsWith('#await ')) {
            const mainPart = [];
            const tag = {
              type: 'await',
              value: bind.value,
              body: mainPart,
              parts: {
                main: mainPart,
                mainValue: bind.value
              }
            };
            parent.body.push(tag);
            go(tag);
            continue;
          } else if (bind.value.match(/^\:then( |$)/)) {
            assert(parent.type === 'await', 'Bind error: await-then');
            const thenPart = [];
            parent.parts.then = thenPart;
            parent.parts.thenValue = bind.value;
            parent.body = thenPart;
          } else if (bind.value.match(/^\:catch( |$)/)) {
            assert(parent.type === 'await', 'Bind error: await-catch');
            const catchPart = [];
            parent.parts.catch = catchPart;
            parent.parts.catchValue = bind.value;
            parent.body = catchPart;
          } else if (bind.value == '/await') {
            assert(parent.type === 'await', 'Bind error: /await');
            return;
          } else if (bind.value.match(/^\#slot(\:| |$)/)) {
            const tag = {
              type: 'slot',
              value: bind.value,
              body: []
            };
            parent.body.push(tag);
            go(tag);
            continue;
          } else if (bind.value == '/slot') {
            assert(parent.type === 'slot', 'Slot error: /slot');
            return;
          } else if (bind.value.startsWith('#fragment:')) {
            const tag = {
              type: 'fragment',
              value: bind.value,
              body: []
            };
            parent.body.push(tag);
            go(tag);
            continue;
          } else if (bind.value == '/fragment') {
            assert(parent.type === 'fragment', 'Fragment error: /fragment');
            return;
          } else throw new Error('Error binding: ' + bind.value);
        }
      }

      if (!textNode) {
        textNode = {
          type: 'text',
          value: ''
        };
      }
      textNode.value += readNext();
    }
    flushText();
    assert(parent.type === 'root', 'File ends to early');
  };

  const root = {
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
  const len = source.length;
  const parts = [];
  let depth = 0;
  while (i < len) {
    const a = source[i++];
    if (step == 1) {
      if (q) {
        if (a === q) q = null;
        exp += a;
        continue;
      }
      if (a === '"' || a === "'" || a === '`') {
        q = a;
        exp += a;
        continue;
      }
      if (a === '{') depth++;
      else if (a === '}') {
        depth--;
        if (!depth) {
          step = 0;
          const js = exp[0] == '*';
          if (js) exp = exp.substring(1);
          exp = exp.trim();
          if (!exp) throw new Error('Wrong expression');
          parts.push({ value: exp, type: js ? 'js' : 'exp' });
          exp = '';
          continue;
        }
      }
      exp += a;
      continue;
    }
    if (a === '{') {
      depth++;
      if (text) {
        parts.push({ value: text, type: 'text' });
        text = '';
      }
      step = 1;
      continue;
    }
    text += a;
  }
  if (text) parts.push({ value: text, type: 'text' });
  assert(step == 0, 'Wrong expression: ' + source);
  let staticText = null;
  if (!parts.some((p) => p.type == 'exp')) staticText = parts.map((p) => p.type == 'text' ? p.value : '').join('');
  let result = [];
  parts.forEach((p) => {
    if (p.type == 'js') return;
    if (p.type == 'exp') result.push(p);
    else {
      const l = last(result);
      if (l?.type == 'text') l.value += p.value;
      else result.push({ ...p });
    }
  });
  result = result.map((p) => p.type == 'text' ? '`' + this.Q(p.value) + '`' : '(' + p.value + ')').join('+');
  return { result, parts, staticText };
}
