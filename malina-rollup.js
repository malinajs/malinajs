
const malina = require('./malina.js')

export default function malinaRollup(option = {}) {
    if(!option.name) option.name = 'widget';
    return {
        name: 'malina',
        transform(code, id) {
            if(!id.endsWith('.html')) return null;
            let result;
            try {
                result = 'export default ' + malina.compile(code, option);
            } catch (e) {
                if(e.details) console.log(e.details);
                throw e;
            }
            return {code: result};
        }
    };
}