
module.exports = function staticTextPlugin() {
  /*
    Build static text for text binding
    Usage: {=variable}
  */
  return {
    name: 'static-text',
    'build:before': (ctx) => {
      const walk = (n) => {
        if (!n) return;

        // Modify AST-node
        if (n.$type == 'bindText') {
          let hasStatic, hasDynamic;
          n.parsedExpression.parts.forEach(p => {
            if(p.type == 'exp') {
              if(p.value[0] == '=') {
                p.value = p.value.substring(1);
                hasStatic = true;
              } else hasDynamic = true;
            }
          });

          if(hasStatic) n.exp = n.parsedExpression.getResult();

          if(hasStatic && !hasDynamic) {
            n.$handler = function (ctx, n) {
              ctx.write(true, `${n.el}.textContent = ${n.exp};`);
            }
          }
        }

        // traversal AST
        if (Array.isArray(n)) n.forEach(walk);
        else if (n.$type) {
          for (let k in n) {
            if (k[0] == '$') continue;
            walk(n[k]);
          }
        }
      }
      walk(ctx.module.body);
    }
  };
};
