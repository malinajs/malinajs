
module.exports = function sassPlugin() {
    return {
        name: 'sass',
        dom: async ctx => {
            for(let node of ctx.DOM.body) {
                if(node.type != 'style') continue;
                let type = node.attributes.filter(a => a.name == 'type' || a.name == 'lang')[0];
                if(!type || type.value != 'sass' && type.value != 'scss') continue;

                const sass = require('sass');
                node.content = await (new Promise((resolve, reject) => {
                    sass.render({
                        file: ctx.config.path,
                        data: node.content,
                        indentedSyntax: type.value == 'sass'
                    }, function(e, result) {
                        if(e) return reject(e);
                        resolve(result.css.toString());
                        type.value = 'css';
                    });
                }));
            };
        }
    };
};
