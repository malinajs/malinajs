
import css from 'css';
import { assert } from '../utils.js'
import nwsapi from './ext/nwsapi';


export function processCSS(styleNode, config) {
    // TODO: make hash
    let id = 'm' + Math.floor(Date.now() * Math.random()).toString(36);

    let self = {element: {}, cls: {}, id};
    let selectors = [];

    function transform() {
        self.raw = css.parse(styleNode.content);
        self.raw.stylesheet.rules.forEach(d => {
            assert(d.type == 'rule');
            d.selectors = d.selectors.map(fullSelector => {
                let result = [];
                let forProcess = [];

                fullSelector.split(/\s+/).forEach(sel => {
                    let virtual = '', rx = sel.match(/^([^:]*)(:.*)$/)
                    if(rx) {
                        sel = rx[1];
                        virtual = rx[2];
                    };
                    forProcess.push(sel);
                    result.push(sel + '.' + id + virtual);
                });

                selectors.push(forProcess.join(' '));
                return result.join(' ');
            })
        });
    }

    self.process = function(data) {
        let dom = makeDom(data);

        const nw = nwsapi({
            document: dom,
            DOMException: function() {}
        });

        selectors.forEach(s => {
            let selected = nw.select([s]);
            if(selected.length) {
                selected.forEach(s => {
                    s.node.__node.scopedClass = true;
                    s.lvl.forEach(l => l.__node.scopedClass = true);
                })
            } else config.warning({message: 'No used css-class: ' + s});
        });
    };

    self.getContent = function() {
        return css.stringify(self.raw, {compress: true});
    }

    transform();
    return self;
}


function makeDom(data) {

    function build(parent, list) {
        list.forEach(e => {
            if(e.type == 'each' || e.type == 'if') {
                if(e.body && e.body.length) build(parent, e.body);
                return;
            }
            if(e.type != 'node') return;
            let n = new Node(e.name, {__node: e});
            e.attributes.forEach(a => {
                if(a.name == 'class') n.className = a.value;
                else if(a.name == 'id') n.id = a.value;
                else n.attributes[a.name] = a.value;
            });
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
