
const malina = require('malinajs');

module.exports = malinaRollup;

function malinaRollup(option = {}) {
    if(option.displayVersion !== false) console.log('! Malina.js', malina.version);
    return {
        name: 'malina',
        transform(code, id) {
            if(!id.endsWith('.html')) return null;
            let result;

            let opts = Object.assign({
                exportDefault: true,
                name: id.match(/([^/\\]+).html$/)[1],
                warning: (w) => console.warn('!', w.message),
                inlineTemplate: false
            }, option);
            try {
                result = malina.compile(code, opts);
            } catch (e) {
                if(e.details) console.log(e.details);
                throw e;
            }
            return {code: result};
        }
    };
}