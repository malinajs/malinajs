
const malina = require('malinajs');

module.exports = malinaRollup;

function malinaRollup(options = {}) {
    if(options.displayVersion !== false) console.log('! Malina.js', malina.version);
    if(!options.extension) options.extension = ['html', 'ma', 'xht'];
    let content_cache = {};

    return {
        name: 'malina',
        async transform(code, id) {
            if(!options.extension.some(ext => id.endsWith('.' + ext))) return null;
            let result;

            let opts = Object.assign({
                path: id,
                name: id.match(/([^/\\]+)\.\w+$/)[1]
            }, options);
            try {
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