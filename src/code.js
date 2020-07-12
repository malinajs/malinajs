import acorn from "acorn";
import astring from "astring";
import { assert } from "./utils.js";

export function transformJS(code, option = {}) {
  let result = {
    watchers: [],
    imports: [],
    props: [],
  };
  var ast;
  if (code) {
    ast = acorn.parse(code, { sourceType: "module" });
  } else {
    ast = {
      body: [],
      sourceType: "module",
      type: "Program",
    };
  }

  const funcTypes = {
    FunctionDeclaration: 1,
    FunctionExpression: 1,
    ArrowFunctionExpression: 1,
  };

  const fix = (node) => {
    if (funcTypes[node.type] && node.body.body && node.body.body.length) {
      node.body.body.unshift({
        type: "ExpressionStatement",
        expression: {
          callee: {
            type: "Identifier",
            name: "$$apply",
          },
          type: "CallExpression",
        },
      });
    } else if (node.type === "ArrowFunctionExpression") {
      if (node.body.type !== "BlockStatement") {
        node.body = {
          type: "BlockStatement",
          body: [
            {
              type: "ReturnStatement",
              argument: node.body,
            },
          ],
        };
        fix(node);
      }
    }
  };

  const transform = function (node, skipTop) {
    if (
      node.type === "CallExpression" &&
      node.callee &&
      node.callee.property &&
      ["map", "forEach", "filter"].indexOf(node.callee.property.name) >= 0
    ) {
      node.arguments.forEach((n) => {
        transform(n, true);
      });
    } else {
      for (let key in node) {
        let value = node[key];
        if (typeof value === "object") {
          if (Array.isArray(value)) {
            value.forEach((n) => transform(n));
          } else if (value && value.type) {
            transform(value);
          }
        }
      }
    }
    if (!skipTop) fix(node);
  };

  transform(ast.body);

  function makeVariable(name) {
    return {
      type: "VariableDeclaration",
      declarations: [
        {
          type: "VariableDeclarator",
          id: {
            type: "Identifier",
            name: name,
          },
          init: null,
        },
      ],
      kind: "var",
    };
  }

  function makeWatch(n) {
    function assertExpression(n) {
      if (n.type == "Identifier") return;
      if (n.type.endsWith("Expression")) return;
      throw "Wrong expression";
    }

    if (n.body.type != "ExpressionStatement") throw "Error";
    if (n.body.expression.type == "AssignmentExpression") {
      const ex = n.body.expression;
      if (ex.operator != "=") throw "Error";
      let target;
      if (ex.left.type == "Identifier") {
        target = ex.left.name;
        if (!(target in rootVariables)) resultBody.push(makeVariable(target));
      } else if (ex.left.type == "MemberExpression") {
        target = code.substring(ex.left.start, ex.left.end);
      } else throw "Error";
      assertExpression(ex.right);
      const exp = code.substring(ex.right.start, ex.right.end);
      result.watchers.push(
        `$watch($cd, () => (${exp}), ($value) => {${target}=$value;}, {cmp: $$compareArray});`
      );
    } else if (n.body.expression.type == "SequenceExpression") {
      const ex = n.body.expression.expressions;
      const handler = ex[ex.length - 1];
      if (
        ["ArrowFunctionExpression", "FunctionExpression"].indexOf(
          handler.type
        ) < 0
      )
        throw "Error function";
      let callback = code.substring(handler.start, handler.end);

      if (ex.length == 2) {
        assertExpression(ex[0]);
        let exp = code.substring(ex[0].start, ex[0].end);
        result.watchers.push(`$watch($cd, () => (${exp}), ${callback});`);
      } else if (ex.length > 2) {
        for (let i = 0; i < ex.length - 1; i++) assertExpression(ex[i]);
        let exp = code.substring(ex[0].start, ex[ex.length - 2].end);
        result.watchers.push(
          `$watch($cd, () => [${exp}], ($args) => { (${callback}).apply(null, $args); }, {cmp: $$compareArray});`
        );
      } else throw "Error";
    } else throw "Error";
  }

  let imports = [];
  let resultBody = [];
  let rootVariables = {};
  ast.body.forEach((n) => {
    if (n.type !== "VariableDeclaration") return;
    n.declarations.forEach((i) => (rootVariables[i.id.name] = true));
  });

  ast.body.forEach((n) => {
    if (n.type == "ImportDeclaration") {
      imports.push(n);
      n.specifiers.forEach((s) => {
        if (s.type != "ImportDefaultSpecifier") return;
        if (s.local.type != "Identifier") return;
        result.imports.push(s.local.name);
      });
      return;
    } else if (n.type == "ExportNamedDeclaration") {
      assert(n.declaration.type == "VariableDeclaration", "Wrong export");
      n.declaration.declarations.forEach((d) => {
        assert(d.type == "VariableDeclarator", "Wrong export");
        result.props.push(d.id.name);
      });
      resultBody.push(n.declaration);
      return;
    }

    if (n.type == "FunctionDeclaration" && n.id.name == "onMount")
      result.onMount = true;
    if (n.type == "FunctionDeclaration" && n.id.name == "onDestroy")
      result.onDestroy = true;
    if (n.type == "LabeledStatement" && n.label.name == "$") {
      try {
        makeWatch(n);
        return;
      } catch (e) {
        throw new Error(e + ": " + code.substring(n.start, n.end));
      }
    }
    resultBody.push(n);
  });

  resultBody.push({
    type: "ExpressionStatement",
    expression: {
      callee: {
        type: "Identifier",
        name: "$$runtime",
      },
      type: "CallExpression",
    },
  });

  resultBody.unshift({
    type: "IfStatement",
    test: {
      type: "BinaryExpression",
      left: { type: "Identifier", name: "$option" },
      operator: "==",
      right: { type: "Literal", value: null },
    },
    consequent: {
      type: "ExpressionStatement",
      expression: {
        type: "AssignmentExpression",
        operator: "=",
        left: { type: "Identifier", name: "$option" },
        right: { type: "ObjectExpression", properties: [] },
      },
    },
  });
  let widgetFunc = {
    body: {
      type: "BlockStatement",
      body: resultBody,
    },
    id: {
      type: 'Identifier"',
      name: option.name,
    },
    params: [
      {
        type: "Identifier",
        name: "$element",
      },
      {
        type: "Identifier",
        name: "$option",
      },
    ],
    type: "FunctionDeclaration",
  };

  if (option.exportDefault) {
    widgetFunc = {
      type: "ExportDefaultDeclaration",
      declaration: widgetFunc,
    };
  }

  ast.body = [widgetFunc];
  ast.body.unshift.apply(ast.body, imports);

  result.code = astring.generate(ast);
  return result;
}
