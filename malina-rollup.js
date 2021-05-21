
const malina = require('malinajs');

module.exports = malinaRollup;

function malinaRollup(option = {}) {
    if(option.displayVersion !== false) console.log('! Malina.js', malina.version);
    if(!option.extension) option.extension = ['html', 'ma', 'xht'];
    let content_cache = {};

    return {
        name: 'malina',
        async transform(code, id) {
            if(!option.extension.some(ext => id.endsWith('.' + ext))) return null;
            let result;

            let opts = Object.assign({
                path: id,
                name: id.match(/([^/\\]+)\.\w+$/)[1]
            }, option);
            try {
                opts._get_ctx = true;
                let ctx = await malina.compile(code, opts);
                result = ctx.result;
                if(ctx.css.result) {
                    let name = id + '.css';
                    content_cache[name] = ctx.css.result;
                    result += `\nimport "${name}";\n`;
                }
            } catch (e) {
                if(e.details) console.log(e.details);
                throw e;
            }
            return {code: result};
        },
        async resolveId(name, importer) {
            if(content_cache[name]) return name;
            if(name == 'malinajs') return await this.resolve('malinajs/runtime.js', importer, {skipSelf: true});
            return null;
        },
        load(id) {
            return content_cache[id] || null;
        }
    };
}