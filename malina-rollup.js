
const malina = require('./malina.js')

export default function malinaRollup(option = {}) {
    return {
        name: 'malina',
        transform(code, id) {
            if(!id.endsWith('.html')) return null;
            let result;

            let opts = Object.assign({
                exportDefault: true,
                name: id.match(/([^/]+).html$/)[1]
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