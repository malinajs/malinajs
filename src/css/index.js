
import csstree from 'css-tree';
import { assert } from '../utils.js'
import nwsapi from './ext/nwsapi';


export function processCSS(styleNode, config) {
    // TODO: make hash
    let id = Math.floor(Date.now() * Math.random()).toString(36);
    if(id.length > 6) id = id.substring(id.length - 6)
    id = 'm' + id;

    let self = {element: {}, cls: {}, id};
    let selectors = [];

    function transform() {
        self.ast = csstree.parse(styleNode.content);

        csstree.walk(self.ast, function(node) {
            if (node.type === 'Rule') {
                assert(node.prelude.type=='SelectorList');

                node.prelude.children.forEach(fullSelector => {
                    assert(fullSelector.type == 'Selector');
                    let proc = [];
                    let selector = [];
                    fullSelector.children.toArray().forEach(sel => {
                        if(sel.type == 'PseudoClassSelector' && sel.name == 'global') {
                            sel = sel.children.first()
                            assert(sel.type == 'Raw');
                            let a = csstree.parse(sel.value, {context: 'selector'})
                            assert(a.type == 'Selector');
                            a.children.forEach(sel => {
                                selector.push(Object.assign({__global: true}, sel));
                            })
                        } else selector.push(sel);
                    });

                    let result = [];
                    let inserted = false;
                    for(let i=0;i<selector.length;i++) {
                        let sel = selector[i];
                        if(sel.__global) inserted = true;
                        if(sel.type == 'PseudoClassSelector' || sel.type == 'PseudoElementSelector') {
                            if(!inserted) result.push({type: "ClassSelector", loc: null, name: id});
                            inserted = true;
                        } else {
                            proc.push(Object.assign({}, sel));
                        }
                        if(sel.type == 'Combinator' || sel.type == 'WhiteSpace') {
                            if(!inserted) result.push({type: "ClassSelector", loc: null, name: id});
                            inserted = false;
                        }
                        result.push(sel);
                    }
                    if(!inserted) result.push({type: "ClassSelector", loc: null, name: id});

                    fullSelector.children = result;
                    proc = csstree.generate({
                        type: 'Selector',
                        children: proc
                    });
                    selectors.push(proc);
                });
            }
        });
    }

    self.process = function(data) {
        let dom = makeDom(data);
        const nw = nwsapi({
            document: dom,
            DOMException: function() {}
        });

        selectors.forEach(s => {
            let selected;
            try {
                selected = nw.select([s]);
            } catch (_) {
                let e = new Error(`CSS error: '${s}'`);
                e.details = `selector: '${s}'`;
                throw e;
            }
            if(selected.length) {
                selected.forEach(s => {
                    s.node.__node.scopedClass = true;
                    s.lvl.forEach(l => l.__node.scopedClass = true);
                })
            } else config.warning({message: 'No used css-class: ' + s});
        });
    };

    self.getContent = function() {
        return csstree.generate(self.ast);
    }

    transform();
    return self;
}


function makeDom(data) {

    function build(parent, list) {
        list.forEach(e => {
            if(e.type == 'each' || e.type == 'fragment' || e.type == 'slot') {
                if(e.body && e.body.length) build(parent, e.body);
                return;
            } else if(e.type == 'if') {
                if(e.bodyMain && e.bodyMain.length) build(parent, e.bodyMain);
                if(e.body && e.body.length) build(parent, e.body);
                return;
            } else if(e.type == 'await') {
                if(e.parts.main && e.parts.main.length) build(parent, e.parts.main);
                if(e.parts.then && e.parts.then.length) build(parent, e.parts.then);
                if(e.parts.catch && e.parts.catch.length) build(parent, e.parts.catch);
            } else if(e.type != 'node') return;
            let n = new Node(e.name, {__node: e});
            e.attributes.forEach(a => {
                if(a.name == 'class') n.className += ' ' + a.value;
                else if(a.name == 'id') n.id = a.value;
                else if(a.name.startsWith('class:')) {
                    n.className += ' ' + a.name.substring(6);
                } else n.attributes[a.name] = a.value;
            });
            n.className = n.className.trim();
            parent.appendChild(n);
            if(e.body && e.body.length) build(n, e.body);
        });
    };

    let body = new Node('body', {
        nodeType: 9,
        contentType: 'text/html',
        compatMode: '',
        _extraNodes: true
    });
    body.documentElement = body;
    build(body, data.body);

    return body;
};

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
};

Node.prototype.getAttribute = function(n) {
    if(n == 'class') return this.className;
    if(n == 'id') return this.id;
    return this.attributes[n];
}

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

    let result = [];
    this.childNodes.forEach(n => {
        let rx = RegExp('(^|\\s)' + cls + '(\\s|$)', 'i');
        if(rx.test(n.className)) result.push(n);
        result.push.apply(result, n.getElementsByClassName(cls));
    });
    return result;
};
