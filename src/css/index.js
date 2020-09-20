
import csstree from 'css-tree';
import { assert, genId as utilsGenId } from '../utils.js';
import nwsapi from './ext/nwsapi';


class SelectorObject {
    constructor(fullSelector, config) {
        this._id = config.id;
        this._genId = config.genId;

        this.fullSelector = fullSelector;
        this.clearSelector = null;
        this.nodes = [];
        this.simpleClass = null;
        this.bound = false;
        this.notBound = false;
        this.used = false;

        this.localHash = null;
        this.boundHash = null;
        this.passedHashes = [];
    }
    useAsLocal() {
        this.used = true;
        this.localHash = this._id;
        return this.localHash;
    }
    useAsBound() {
        this.used = true;
        if(!this.boundHash) this.boundHash = this._genId();
        return this.boundHash;
    }
    useAsPassed(childName, hash) {
        this.used = true;
        this.passedHashes.push({childName, hash});
    }
}


export function processCSS(styleNode, config) {
    const genId = () => config.cssGenId ? config.cssGenId() : utilsGenId();

    let self = {element: {}, cls: {}, passed: [], simpleClasses: {}, id: genId()};
    let selectors = {};

    function transform() {
        let content = styleNode.content;

        self.ast = csstree.parse(content);

        const convert = (node, parent) => {
            if(!node) return node;
            if(typeof node != 'object') return node;
            if(Array.isArray(node)) return node.map(i => convert(i, parent));
            if(node.toArray) return node.toArray().map(i => convert(i, parent));
            let r = {parent};
            let newParent = node.type ? r : parent;
            for(let k in node) r[k] = convert(node[k], newParent);
            return r;
        }
        self.ast = convert(self.ast, null);

        csstree.walk(self.ast, function(node) {
            if(node.type == 'Declaration') {
                if(node.property == 'animation' || node.property == 'animation-name') {
                    let c = node.value.children[0];
                    if(!c) return;
                    if(c.type == 'Identifier') {
                        c.name += '-' + self.id;
                    } else {
                        c = node.value.children[node.value.children.length - 1];
                        if(c.type == 'Identifier') c.name += '-' + self.id;
                    }
                }
            } else if(node.type === 'Atrule') {
                if(node.name == 'keyframes') {
                    node.prelude.children[0].name += '-' + self.id;
                }
            } else if(node.type === 'Rule') {
                if(node.parent.parent && node.parent.parent.type == 'Atrule') {
                    if(node.parent.parent.name == 'keyframes') return;
                }

                assert(node.prelude.type=='SelectorList');

                let selectorList = node.prelude.children;
                for(let i=0; i < selectorList.length; i++) {
                    processSelector(selectorList[i]);
                }

                function processSelector(fullSelector) {
                    assert(fullSelector.type == 'Selector');
                    let selector = [];
                    let fullSelectorChildren = fullSelector.children;
                    fullSelectorChildren.forEach(sel => {
                        if(sel.type == 'PseudoClassSelector' && sel.name == 'export') {
                            assert(fullSelectorChildren.length == 1);
                            sel = sel.children.first();
                            assert(sel.type == 'Raw');
                            let sl = csstree.parse(sel.value, {context: 'selectorList'})
                            assert(sl.type == 'SelectorList');
                            sl.children.forEach(selNode => {
                                let sel = selNode.children;
                                if(sel.length != 1 || sel[0].type != 'ClassSelector') {
                                    let selName = csstree.generate(selNode);
                                    throw Error(`Wrong class for export '${selName}'`);
                                }
                                selNode.bound = true;
                                selectorList.push(selNode);
                            });
                        } else if(sel.type == 'PseudoClassSelector' && sel.name == 'global') {
                            sel = sel.children.first();
                            assert(sel.type == 'Raw');
                            let a = csstree.parse(sel.value, {context: 'selector'});
                            assert(a.type == 'Selector');
                            a.children.forEach(sel => {
                                sel.global = true;
                                selector.push(sel);
                            })
                        } else {
                            selector.push(sel);
                        }
                    });

                    if(!selector.length) {
                        fullSelector.removed = true;
                        fullSelector.children = [];
                        return;
                    }

                    let fullSelectorName = csstree.generate({
                        type: 'Selector',
                        children: selector
                    });

                    let selectorObject = selectors[fullSelectorName];
                    
                    if(!selectorObject) {
                        selectorObject = new SelectorObject(fullSelectorName, {id: self.id, genId});
                        selectors[fullSelectorName] = selectorObject;
                        if(selector.length == 1 && selector[0].type == 'ClassSelector' && !selector[0].global) {
                            selectorObject.simpleClass = selector[0].name;
                            self.simpleClasses[selectorObject.simpleClass] = selectorObject;
                        }
                    }

                    if(fullSelector.bound && !selectorObject.bound) {
                        selectorObject.bound = true;
                    } else if(!selectorObject.notBound) {
                        selectorObject.notBound = true;
                    }

                    selectorObject.nodes.push({
                        rule: node,
                        selector: fullSelector,
                        bound: fullSelector.bound
                    });

                    let proc = [];
                    let result = [];
                    let inserted = false;
                    for(let i=0;i<selector.length;i++) {
                        let sel = selector[i];
                        if(sel.global) inserted = true;
                        if(sel.type == 'PseudoClassSelector' || sel.type == 'PseudoElementSelector') {
                            if(!inserted) result.push({type: "ClassSelector", loc: null, name: '', __hash: true});
                            inserted = true;
                        } else {
                            proc.push(sel);
                        }
                        if(sel.type == 'Combinator' || sel.type == 'WhiteSpace') {
                            if(!inserted) result.push({type: "ClassSelector", loc: null, name: '', __hash: true});
                            inserted = false;
                        }
                        result.push(sel);
                    }
                    if(!inserted) {
                        result.push({type: "ClassSelector", loc: null, name: '', __hash: true});
                    }
                    fullSelector.children = result;

                    if(!selectorObject.clearSelector) {
                        selectorObject.clearSelector = csstree.generate({
                            type: 'Selector',
                            children: proc,
                            selectorNodes: result
                        });
                    }

                };
            }
        });
    }

    self.process = function(data) {
        let dom = makeDom(data);
        const nw = nwsapi({
            document: dom,
            DOMException: function() {}
        });

        Object.values(selectors).forEach(sel => {
            if(sel.simpleClass) return;
            let selected;
            try {
                selected = nw.select([sel.clearSelector]);
            } catch (_) {
                let e = new Error(`CSS error: '${sel.fullSelector}'`);
                e.details = `selector: '${sel.fullSelector}'`;
                throw e;
            }
            if(selected.length) {
                sel.useAsLocal();
                selected.forEach(s => {
                    assert(!sel.bound);
                    s.node.__node.injectCssHash = true;
                    s.lvl.forEach(l => l.__node.injectCssHash = true);
                })
            }
        });
    };

    self.getContent = function() {
        Object.values(selectors).forEach(sel => {
            if(sel.used) {
                sel.nodes.forEach(node => {
                    let selectorChildren = node.selector.children.map(i => Object.assign({}, i));

                    let hash = [];
                    if(sel.localHash && !node.bound) hash.push(sel.localHash);
                    if(sel.boundHash && node.bound) hash.push(sel.boundHash);

                    if(!hash.length) node.selector.removed = true;

                    let id = hash.shift();
                    if(id) {
                        node.selector.children.forEach(i => {
                            if(i.__hash) i.name = id;
                        })
                    }
                    id = hash.shift();
                    if(id) {
                        selectorChildren.forEach(i => {
                            if(i.__hash) i.name = id;
                        })
                        node.rule.prelude.children.push({
                            type: 'Selector',
                            children: selectorChildren
                        });
                    }

                    sel.passedHashes.forEach(p => {
                        node.rule.prelude.children.push({
                            type: 'Selector',
                            children: [{
                                type: 'ClassSelector',
                                name: p.childName
                            }, {
                                type: 'ClassSelector',
                                name: p.hash
                            }]
                        });
                    })
                })
            } else {
                sel.nodes.forEach(node => {
                    let i = node.rule.prelude.children.indexOf(node.selector);
                    assert(i >= 0);
                    node.rule.prelude.children.splice(i, 1);
                });
                config.warning({message: 'No used css-class: ' + sel.fullSelector});
            }
        });

        // removed selectors
        csstree.walk(self.ast, (node) => {
            if(node.type != 'Rule') return;
            node.prelude.children = node.prelude.children.filter(s => !s.removed);
            let parent = node.parent;
            if(!node.prelude.children.length && parent) {
                let i = parent.children.indexOf(node);
                if(i >= 0) parent.children.splice(i, 1);
            }
        });

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
            //if(e.name[0].match(/[A-Z]/)) return;
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
