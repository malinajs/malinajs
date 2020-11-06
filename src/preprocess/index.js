
import sassPlugin from './sass.js';


export default function(ctx) {
    if(!ctx.config.plugins.some(p => p.name == 'sass')) {
        ctx.config.plugins.push(sassPlugin());
    }
};
