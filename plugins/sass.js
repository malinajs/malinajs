
module.exports = function sassPlugin() {
    return {
        name: 'sass',
        dom: async ctx => {
            for(let node of ctx.DOM.body) {
                if(node.type != 'style') continue;
                let type = node.attributes.filter(a => a.name == 'type' || a.name == 'lang')[0];
                if(!type || type.value != 'sass' && type.value != 'scss') continue;

                let sass;
                try {
                    sass = require('sass');
                } catch (e) {
                    if(e.code == 'MODULE_NOT_FOUND') sass = require('node-sass');
                    else throw e;
                }
                node.content = await (new Promise((resolve, reject) => {
                    if(sass.render) {
                        sass.render({  // node-sass
                            file: ctx.config.path,
                            data: node.content,
                            indentedSyntax: type.value == 'sass'
                        }, function(e, result) {
                            if(e) return reject(e);
                            resolve(result.css.toString());
                            type.value = 'css';
                        });
                    } else {
                        sass.compileStringAsync(node.content, {
                            syntax: type.value == 'sass' ? 'indented' : 'scss',
                            url: 'file://' + ctx.config.path
                        }).then((r) => {
                            resolve(r.css);
                        }, (e) => {
                            console.error('SCSS Error', e);
                            reject(e);
                        })
                    }
                }));
            };
        }
    };
};
