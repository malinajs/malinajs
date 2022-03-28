function loadConfig(filename, option) {
  const fs = require('fs');

  let result = Object.assign({}, option);
  if(result.plugins) result.plugins = result.plugins.slice();

  let localConfig;
  let parts = filename.split(/[/\\]/);
  for(let i = parts.length - 1; i > 1; i--) {
    let local = parts.slice(0, i).join('/') + '/malina.config.js';
    if(fs.existsSync(local)) {
      localConfig = local;
      break;
    }
  }

  if(localConfig) {
    const confFn = require(localConfig);
    if(typeof(confFn) == 'function') result = confFn(result, filename);
    else result = confFn;
  }
  if(!result.path) result.path = filename;
  if(!result.name) result.name = filename.match(/([^/\\]+)\.\w+$/)[1];

  return result;
}

module.exports = { loadConfig }