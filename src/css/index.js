import csstree from 'css-tree';
import { assert, genId as utilsGenId, last } from '../utils.js';
import nwsapi from './ext/nwsapi';
import { xNode } from '../xnode.js';


export function processCSS() {
  let styleNodes = this.styleNodes;
  const genId = () => this.config.cssGenId ? this.config.cssGenId() : utilsGenId();

  let self = this.css = { id: genId(), externalMainName: null };
  let astList = [];
  let selectors = {};
  let removeBlocks = [];
  let active = false;

  const selector2str = (sel) => {
    if(!sel.children) sel = { type: 'Selector', children: sel };
    return csstree.generate(sel);
  };

  const convertAst = (node, parent) => {
    if(!node) return node;
    if(typeof node != 'object') return node;
    if(Array.isArray(node)) return node.map(i => convertAst(i, parent));
    if(node.toArray) return node.toArray().map(i => convertAst(i, parent));
    let r = { parent };
    let newParent = node.type ? r : parent;
    for(let k in node) r[k] = convertAst(node[k], newParent);
    return r;
  };

  const parseCSS = (content, option) => {
    let ast = csstree.parse(content, option);
    return convertAst(ast, null);
  };

  const isKeyframes = (name) => name == 'keyframes' || name == '-webkit-keyframes' || name == '-moz-keyframes' || name == '-o-keyframes';

  styleNodes.forEach(transform);

  function transform(styleNode) {
    active = true;
    let external = false;
    let globalBlock = false;
    styleNode.attributes.forEach(a => {
      if(a.name == 'external') self.hasExternal = external = true;
      else if(a.name == 'main') self.externalMainName = a.value;
      else if(a.name == 'global') globalBlock = true;
    });

    let ast = parseCSS(styleNode.content);
    astList.push(ast);

    csstree.walk(ast, function(node) {
      if(node.type == 'Declaration') {
        if(node.property == 'animation' || node.property == 'animation-name') {
          let c = node.value.children[0];
          if(!c) return;
          if(c.type == 'Identifier') {
            c.name += '-' + self.id;
          } else {
            c = last(node.value.children);
            if(c.type == 'Identifier') c.name += '-' + self.id;
          }
        }
      } else if(node.type === 'Atrule') {
        if(isKeyframes(node.name)) {
          node.prelude.children[0].name += '-' + self.id;
        }
      } else if(node.type === 'Rule') {
        if(node.parent.parent && node.parent.parent.type == 'Atrule') {
          if(isKeyframes(node.parent.parent.name)) return;
        }

        assert(node.prelude.type == 'SelectorList');

        let emptyBlock = node.block.children.length == 0;
        if(emptyBlock) removeBlocks.push(node);

        let selectorList = node.prelude.children;
        for(let i = 0; i < selectorList.length; i++) {
          processSelector(selectorList[i]);
        }

        function processSelector(fullSelector) {
          assert(fullSelector.type == 'Selector');
          let origin = [];
          fullSelector.children.forEach(sel => {
            if(sel.type == 'PseudoClassSelector' && sel.name == 'global') {
              sel = sel.children[0];
              assert(sel.type == 'Raw');
              let a = parseCSS(sel.value, { context: 'selector' });
              assert(a.type == 'Selector');
              a.children.forEach(sel => {
                sel.global = true;
                origin.push(sel);
              });
            } else {
              origin.push(sel);
            }
          });

          assert(origin.length);

          let cleanSelectorItems = [];
          for(let i = 0; i < origin.length; i++) {
            let s = origin[i];
            if(s.global) continue;
            if(s.type == 'PseudoClassSelector' || s.type == 'PseudoElementSelector') {
              let prev = origin[i - 1];
              if(!prev || prev.type == 'Combinator' || prev.type == 'WhiteSpace') {
                cleanSelectorItems.push({ type: 'TypeSelector', name: '*' });
              }
            } else cleanSelectorItems.push(s);
          }
          while(cleanSelectorItems.length && ['WhiteSpace', 'Combinator'].includes(cleanSelectorItems[0].type)) cleanSelectorItems.shift();
          while(cleanSelectorItems.length && ['WhiteSpace', 'Combinator'].includes(last(cleanSelectorItems).type)) cleanSelectorItems.pop();
          if(!cleanSelectorItems.length || globalBlock) { // fully global?
            assert(origin.length);
            fullSelector.children = origin;
            return;
          }
          let cleanSelector = selector2str(cleanSelectorItems);

          let sobj = selectors[cleanSelector];
          if(!sobj) {
            let isSimple = false;
            if(cleanSelectorItems[0].type == 'ClassSelector') {
              isSimple = true;
              for(let i = 1; i < cleanSelectorItems.length; i++) {
                if(cleanSelectorItems[i].type != 'AttributeSelector') {
                  isSimple = false;
                  break;
                }
              }
            }

            selectors[cleanSelector] = sobj = {
              cleanSelector,
              isSimple,
              source: [],
              fullyGlobal: origin.every(i => i.global),
              hashedSelectors: []
            };
          }

          if(external) {
            assert(sobj.isSimple);
            if(!sobj.external) sobj.external = emptyBlock ? true : genId();
          } else if(!sobj.local) {
            sobj.local = true;
          }

          if(emptyBlock) fullSelector.emptyBlock = true;
          sobj.source.push(fullSelector);

          let hashed = origin.slice();
          hashed._external = external;
          sobj.hashedSelectors.push(hashed);

          const insert = (i) => {
            hashed.splice(i, 0, { type: 'ClassSelector', loc: null, name: null, __hash: true });
          };

          for(let i = hashed.length - 1; i >= 0; i--) {
            let sel = hashed[i];
            let left = hashed[i - 1];
            let right = hashed[i + 1];
            if(sel.global) continue;
            if(sel.type == 'PseudoClassSelector' || sel.type == 'PseudoElementSelector') {
              if(!left || left.type == 'Combinator' || left.type == 'WhiteSpace') insert(i);
              continue;
            } else if(sel.type == 'Combinator' || sel.type == 'WhiteSpace') continue;
            if(!right || ['PseudoClassSelector', 'PseudoElementSelector', 'Combinator', 'WhiteSpace'].includes(right.type)) insert(i + 1);
          }

          fullSelector.children = hashed;
        }
      }
    });
  }

  self.isExternalClass = (name) => {
    let sobj = selectors['.' + name];
    return sobj && sobj.external;
  };

  self.markAsExternal = (name) => {
    let sobj = selectors['.' + name];
    if(!sobj) selectors['.' + name] = sobj = { isSimple: true, cleanSelector: '.' + name };
    assert(!sobj.resolved);
    if(!sobj.external) sobj.external = true;
    active = true;
  };

  self.active = () => active;

  self.containsExternal = () => {
    return Object.values(selectors).some(sel => {
      if(!sel.isSimple) return;
      return sel.external;
    });
  };

  let _hashesResolved = false;
  const resolveHashes = () => {
    if(_hashesResolved) return;
    _hashesResolved = true;
    Object.values(selectors).forEach(sel => {
      if(!sel.hashedSelectors) return;
      if(sel.resolved) return;
      sel.resolved = true;
      if(sel.external) {
        if(sel.local === true) {
          if(self.passingClass) sel.local = genId();
          else sel.local = self.id;
        }
      } else {
        assert(sel.local === true);
        if(self.passingClass) sel.local = genId();
        else sel.local = self.id;
      }
      sel.hashedSelectors.forEach(hashed => {
        let hash = hashed._external ? sel.external : sel.local;
        assert(hash);
        hashed.forEach(n => {
          if(!n.__hash) return;
          n.name = hash;
        });
      });
    });
  };

  self.getClassMap = () => {
    resolveHashes();
    let classMap = {};
    let metaClass = {};
    Object.values(selectors).forEach(sel => {
      if(!sel.isSimple) return;

      let className = sel.source ? sel.source[0].children[0].name : sel.cleanSelector.substring(1);
      if(sel.external) {
        metaClass[className] = sel.external;
      }
      if(sel.local) {
        classMap[className] = sel.local;
      }
    });
    return { classMap, metaClass, main: self.externalMainName };
  };

  self.process = function(data) {
    let dom = makeDom(data);
    const nw = nwsapi({
      document: dom,
      DOMException: function() {}
    });

    Object.values(selectors).forEach(sel => {
      sel.$selector = true;
      if(sel.fullyGlobal || !sel.local) return;
      let selected;
      try {
        selected = nw.select([sel.cleanSelector]);
      } catch (_) {
        let e = new Error(`CSS error: '${selector2str(sel.source[0])}'`);
        e.details = `selector: '${selector2str(sel.source[0])}'`;
        throw e;
      }
      selected.forEach(s => {
        s.node.__node.classes.add(sel);
        s.lvl.forEach(l => l.__node.classes.add(sel));
      });
    });
  };

  self.resolve = sel => {
    resolveHashes();
    assert(sel.resolved);
    if(sel.external) {
      assert(sel.external !== true);
      return sel.external;
    }
    assert(sel.local && sel.local !== true);
    return sel.local;
  };

  self.resolveAsNode = function(classList, wrap) {
    return xNode('resolve-class', { classList, wrap }, (ctx, n) => {
      let className = {};
      n.classList.forEach(sel => {
        if(sel.$selector) sel = this.resolve(sel);
        className[sel] = true;
      });
      className = Object.keys(className).join(' ');
      if(className) ctx.write(`${n.wrap[0]}${className}${n.wrap[1]}`);
    });
  };

  self.getContent = function() {
    removeBlocks.forEach(node => {
      let i = node.parent.children.indexOf(node);
      if(i >= 0) node.parent.children.splice(i, 1);
    });
    resolveHashes();

    return astList.map(ast => csstree.generate(ast)).join('');
  };
}


function makeDom(data) {
  function build(parent, list) {
    list.forEach(e => {
      if(e.type == 'fragment' || e.type == 'slot' || e.type == 'block') {
        if(e.body && e.body.length) build(parent, e.body);
        return;
      } else if(e.type == 'each') {
        build(parent, e.mainBlock);
        e.elseBlock?.length && build(parent, e.elseBlock);
        return;
      } else if(e.type == 'if') {
        e.parts.forEach(p => build(parent, p.body));
        e.elsePart?.length && build(parent, e.elsePart);
        return;
      } else if(e.type == 'await') {
        if(e.parts.main && e.parts.main.length) build(parent, e.parts.main);
        if(e.parts.then && e.parts.then.length) build(parent, e.parts.then);
        if(e.parts.catch && e.parts.catch.length) build(parent, e.parts.catch);
        return;
      } else if(e.type != 'node') return;
      // if(e.name[0].match(/[A-Z]/)) return;
      let n = new Node(e.name, { __node: e });
      e.attributes.forEach(a => {
        if(a.name == 'class') {
          if(a.value != null) {
            if(a.value.includes('{')) n.dynClass = true;
            else n.className += ' ' + a.value;
          }
          n.attributes[a.name] = a.value;
        } else if(a.name == 'id') {
          if (a.value?.includes('{')) n.dynId = true;
          n.attributes.id = n.id = a.value;
        } else if(a.name.startsWith('class:')) {
          n.className += ' ' + a.name.substring(6);
        } else n.attributes[a.name] = a.value;
      });
      n.className = n.className.trim();
      parent.appendChild(n);
      if(e.body && e.body.length) build(n, e.body);
    });
  }

  let body = new Node('body', {
    nodeType: 9,
    contentType: 'text/html',
    compatMode: '',
    _extraNodes: true
  });
  body.documentElement = body;
  build(body, data.body);

  return body;
}

function Node(name, data, children) {
  this.nodeName = name;
  this.childNodes = [];
  this.className = '';
  this.attributes = {};

  this.parentElement = null;
  this.firstElementChild = null;
  this.lastElementChild = null;
  this.nextElementSibling = null;
  this.previousElementSibling = null;

  if(data) Object.assign(this, data);
  if(children) children.forEach(c => this.appendChild(c));
}

Node.prototype.getAttribute = function(n) {
  if(n == 'class') return this.className;
  if(n == 'id') return this.id;
  return this.attributes[n];
};

Node.prototype.hasAttribute = function(n) {
  return n in this.attributes;
};

Node.prototype.appendChild = function(n) {
  n.parentElement = this;
  this.childNodes.push(n);
  if(!this.firstElementChild) this.firstElementChild = n;
  if(this.lastElementChild) {
    this.lastElementChild.nextElementSibling = n;
    n.previousElementSibling = this.lastElementChild;
    this.lastElementChild = n;
  } else this.lastElementChild = n;
};

Node.prototype.getElementsByTagNameNS = function(ns, name) {
  return this.getElementsByTagName(name);
};

Node.prototype.getElementsByTagName = function(name) {
  let result = [];
  this.childNodes.forEach(n => {
    if(name == '*' || n.nodeName == name) result.push(n);
    result.push.apply(result, n.getElementsByTagName(name));
  });
  return result;
};

Node.prototype.getElementsByClassName = function(names) {
  names = names.split(/\s+/);
  if(names.length != 1) throw 'Not supported';
  let cls = names[0];

  let rx = RegExp('(^|\\s)' + cls + '(\\s|$)', 'i');
  let result = [];
  const walk = (node) => {
    node.childNodes.forEach(n => {
      if(n.dynClass) result.push(n);
      else if(rx.test(n.className)) result.push(n);
      walk(n);
    });
  };
  walk(this);
  return result;
};
