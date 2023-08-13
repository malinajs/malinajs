
import * as malina from 'malinajs/malina.mjs';

export default function malinaRollup(option = {}) {
    if(option.displayVersion !== false) console.log('! Malina.js', malina.version);
    if(!option.extension) option.extension = ['html', 'ma', 'xht'];
    let content_cache = {};

    return {
        name: 'malina',
        async transform(code, id) {
            if(!option.extension.some(ext => id.endsWith('.' + ext))) return null;
            let result;
            let opts = await loadConfig(id, {
                ...option,
                path: id,
                name: id.match(/([^/\\]+)\.\w+$/)[1]
            });
            try {
                let ctx = await malina.compile(code, opts);
                result = ctx.result;
                if(ctx.css.result) {
                    let name = id.replace(/[^\w.\-]/g, '') + '.css';
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
            return null;
        },
        load(id) {
            return content_cache[id] || null;
        }
    };
}


async function loadConfig(filename, option) {
  const fs = await import('fs');
  let localConfig, parts = filename.split(/[/\\]/);
  for(let i = parts.length - 1; i > 1; i--) {
    let local = parts.slice(0, i).join('/') + '/malina.config.js';
    if(fs.existsSync(local)) {
      localConfig = local;
      break;
    }
  }

  if(localConfig) {
    const confFn = (await import(localConfig)).default;
    if(typeof (confFn) == 'function') option = await confFn(option, filename);
    else option = confFn;
  }
  if(!option.path) option.path = filename;
  if(!option.name) option.name = option.path.match(/([^/\\]+)\.\w+$/)[1];

  return option;
}
