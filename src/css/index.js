
import csstree from 'css-tree';
import { assert, genId } from '../utils.js'
import nwsapi from './ext/nwsapi';


export function processCSS(styleNode, config) {
    // TODO: make hash
    let id = genId();

    let simpleClasses = {};
    let self = {element: {}, cls: {}, id, passed: [], simpleClasses};
    let selectors = [];

    function transform() {
        let content = styleNode.content;

        let exportBlocks = Array.from(content.matchAll(/\:export\(([^\(\)]+)\)/g));
        for(let i = exportBlocks.length - 1; i>=0; i--) {
            let rx = exportBlocks[i];
            content = content.substring(0, rx.index) + content.substring(rx.index + rx[0].length);
            rx[1].split(/\s*,\s*/).forEach(sel => {
                assert(sel.match(/^\.[\w\-]+$/), 'Wrong exported class');
                selectors.push({
                    name: sel,
                    exported: true
                });
            })
        }

        self.ast = csstree.parse(content);

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
                        } else {
                            selector.push(sel);
                        }
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
                    let selectorName = csstree.generate({
                        type: 'Selector',
                        children: proc
                    });
                    selectors.push({
                        name: selectorName
                    });
                    let rx = selectorName.match(/^\.([\w\-]+)$/);
                    if(rx) simpleClasses[rx[1]] = node;
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

        selectors.forEach(sel => {
            let selected;
            try {
                selected = nw.select([sel.name]);
            } catch (_) {
                let e = new Error(`CSS error: '${sel.name}'`);
                e.details = `selector: '${sel.name}'`;
                throw e;
            }
            if(selected.length) {
                selected.forEach(s => {
                    if(sel.exported) {
                        s.node.__node.scopedClassParent = true;
                        assert(s.lvl.length == 1);
                    } else {
                        s.node.__node.scopedClass = true;
                        s.lvl.forEach(l => l.__node.scopedClass = true);
                    }
                })
            } else config.warning({message: 'No used css-class: ' + sel.name});
        });
    };

    self.getContent = function() {
        if(self.passed.length) {
            self.passed.forEach(item => {
                let node = simpleClasses[item.parent];
                assert(node, 'No clas to pass ' + item.parent);

                let children = node.prelude.children.toArray ? node.prelude.children.toArray() : node.prelude.children;
                children.push({
                    type: 'Selector',
                    children: [{
                        type: 'ClassSelector',
                        name: item.child
                    }, {
                        type: 'ClassSelector',
                        name: item.id
                    }]
                });
                node.prelude.children = children;
            });
        }
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
