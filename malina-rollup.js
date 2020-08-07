
const malina = require('malinajs');

module.exports = malinaRollup;

function malinaRollup(option = {}) {
    option.$context = {};
    if(option.displayVersion !== false) console.log('! Malina.js', malina.version);
    if(!option.extension) option.extension = ['html', 'ma'];
    return {
        name: 'malina',
        transform(code, id) {
            if(!option.extension.some(ext => id.endsWith('.' + ext))) return null;
            let result;

            let opts = Object.assign({
                exportDefault: true,
                name: id.match(/([^/\\]+)\.\w+$/)[1],
                warning: (w) => console.warn('!', w.message),
                inlineTemplate: false,
                hideLabel: false,
                compact: true,
                autoSubscribe: true
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