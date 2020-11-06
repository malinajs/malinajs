
const malina = require('malinajs');

module.exports = malinaRollup;

function malinaRollup(option = {}) {
    if(option.displayVersion !== false) console.log('! Malina.js', malina.version);
    if(!option.extension) option.extension = ['html', 'ma', 'xht'];
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
                result = await malina.compile(code, opts);
            } catch (e) {
                if(e.details) console.log(e.details);
                throw e;
            }
            return {code: result};
        }
    };
}