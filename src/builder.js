import { Q } from "./utils.js";
import { parseElement, parseText } from "./parser.js";
import { makeComponent } from "./parts/component.js";
import { bindProp } from "./parts/prop.js";
import { makeifBlock } from "./parts/if.js";
import { makeEachBlock } from "./parts/each.js";
import { makeHtmlBlock } from "./parts/html.js";

let uniqIndex = 0;

export function buildRuntime(data, config, script) {
  let runtime = [
    `
        function $$apply() {
            if($$apply._p) return;
            if($$apply.planned) return;
            $$apply.planned = true;
            setTimeout(() => {
                $$apply.planned = false;
                $$apply.go();
            }, 1);
        };
        return (function() {
            let $cd = new $ChangeDetector();

            let $component = {};
            $component.destroy = () => {
                $cd.destroy();
            };

            $$apply.go = () => {
                $$apply._p = true;
                try {
                    $digest($cd, () => $$apply._p = false);
                } finally {
                    $$apply._p = false;
                }
            };
    `,
  ];

  const ctx = {
    config,
    script,
    buildBlock,
    bindProp,
    makeEachBlock,
    makeifBlock,
    makeComponent,
    makeHtmlBlock,
  };

  let bb = ctx.buildBlock(data);
  runtime.push(bb.source);
  runtime.push(`
        const rootTemplate = \`${Q(bb.tpl)}\`;
        if($option.afterElement) {
            let tag = $element;
            $element = $$htmlToFragment(rootTemplate);
            ${bb.name}($cd, $element);
            tag.parentNode.insertBefore($element, tag.nextSibling);
        } else {
            $element.innerHTML = rootTemplate;
            ${bb.name}($cd, $element);
        }
    `);
  if (script.onMount)
    runtime.push(`
        if($option.noMount) $component.onMount = onMount;
        else $cd.once(onMount);
    `);
  if (script.onDestroy) runtime.push(`$cd.d(onDestroy);`);
  if (script.watchers.length) {
    runtime.push(
      "$cd.once(() => {\n" + script.watchers.join("\n") + "\n$$apply();\n});"
    );
  }
  if (script.props.length) {
    script.props.forEach((prop) => {
      let valueName = prop == "value" ? "_value" : "value";
      runtime.push(`
                Object.defineProperty($component, '${prop}', {
                    get: function() { return ${prop}; },
                    set: function(${valueName}) {
                        if(${prop} == ${valueName}) return;
                        ${prop} = ${valueName};
                        $$apply();
                    }
                });
            `);
    });
  }

  runtime.push(`
            $$apply();
            return $component;
        })();`);
  return runtime.join("");
}

function buildBlock(data, option = {}) {
  let tpl = [];
  let lvl = [];
  let binds = [];
  let targets = [];
  let targetMap = {};

  const go = (level, data) => {
    let index = 0;
    const setLvl = () => {
      lvl[level] = index++;
    };

    const getElementName = () => {
      let l = lvl;
      if (option.top0) l = l.slice(1);
      let name = "$parentElement";
      l.forEach((n) => {
        name += `[$$childNodes][${n}]`;
      });

      let tname = targetMap[name];
      if (!tname) {
        tname = `el${uniqIndex++}`;
        targets.push(`let ${tname} = ${name};`);
        targetMap[name] = tname;
      }
      return tname;
    };

    let body = data.body.filter((n) => n.type != "script");
    let lastText;
    const bindNode = (n) => {
      if (n.type === "text") {
        if (lastText !== tpl.length) setLvl();
        if (n.value.indexOf("{") >= 0) {
          tpl.push(" ");
          let exp = parseText(n.value);
          binds.push(`{
                        let $element=${getElementName()};
                        $watchReadOnly($cd, () => ${exp}, (value) => {$element.textContent=value;});}`);
        } else tpl.push(n.value);
        lastText = tpl.length;
      } else if (n.type === "style") {
        setLvl();
        tpl.push(n.openTag);
        tpl.push(n.content);
        tpl.push("</style>");
      } else if (n.type === "template") {
        setLvl();
        tpl.push(n.openTag);
        tpl.push(n.content);
        tpl.push("</template>");
      } else if (n.type === "node") {
        setLvl();
        if (
          n.name.match(/^[A-Z]/) &&
          this.script.imports.indexOf(n.name) >= 0
        ) {
          // component
          tpl.push(`<!-- ${n.name} -->`);
          let b = this.makeComponent(n, getElementName);
          binds.push(b.bind);
          return;
        }
        if (n.openTag.indexOf("{") || n.openTag.indexOf("use:")) {
          let r = parseElement(n.openTag);
          let el = ["<" + n.name];
          r.forEach((p) => {
            let b = this.bindProp(p, getElementName);
            if (b.prop) el.push(b.prop);
            if (b.bind) binds.push(b.bind);
          });
          el = el.join(" ");
          el += n.closedTag ? "/>" : ">";
          tpl.push(el);
        } else tpl.push(n.openTag);
        if (!n.closedTag) {
          go(level + 1, n);
          tpl.push(`</${n.name}>`);
        }
      } else if (n.type === "each") {
        setLvl();
        tpl.push(`<!-- ${n.value} -->`);
        n.parent = data;
        let eachBlock = this.makeEachBlock(n, getElementName());
        binds.push(eachBlock.source);
      } else if (n.type === "if") {
        setLvl();
        tpl.push(`<!-- ${n.value} -->`);
        let ifBlock = this.makeifBlock(n, getElementName());
        binds.push(ifBlock.source);
      } else if (n.type === "systag") {
        let r = n.value.match(/^@(\w+)\s+(.*)$/);
        let name = r[1];
        let exp = r[2];

        if (name == "html") {
          setLvl();
          tpl.push(`<!-- html -->`);
          binds.push(this.makeHtmlBlock(exp, getElementName()));
        } else throw "Wrong tag";
      } else if (n.type === "comment") {
        if (!this.config.preserveComments) return;
        setLvl();
        tpl.push(n.content);
      }
    };
    body.forEach((n) => {
      try {
        bindNode(n);
      } catch (e) {
        if (typeof e === "string") e = new Error(e);
        if (!e.details) {
          console.log("Node: ", n);
          if (n.type == "text") e.details = n.value.trim();
          else if (n.type == "node") e.details = n.openTag.trim();
          else if (n.type == "each") e.details = n.value.trim();
          else if (n.type == "if") e.details = n.value.trim();
        }
        throw e;
      }
    });

    lvl.length = level;
  };
  go(0, data);

  let source = [];

  let buildName = "$$build" + uniqIndex++;
  tpl = Q(tpl.join(""));
  source.push(`function ${buildName}($cd, $parentElement) {\n`);
  source.push(targets.join("\n"));
  source.push(binds.join("\n"));
  source.push(`};`);

  return {
    name: buildName,
    tpl: tpl,
    source: source.join(""),
  };
}
