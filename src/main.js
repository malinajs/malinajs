
const fs = require('fs');
const {parse, assert} = require('./parser');
const { transformJS } = require('./code');
const { buildRuntime } = require('./runtime');


(function main() {
    let inputFile = process.argv[2] || './example/example.html';
    const src = fs.readFileSync(inputFile, {encoding:'utf8', flag:'r'}); 

    const data = parse(src);
    let script;
    data.body.forEach(d => {
        if(d.type !== 'script') return;
        assert(!script, 'Multi script');
        script = d;
    });

    script = transformJS(script.content);

    const runtime = buildRuntime(data);
    const result = script.split('$$runtime()').join(runtime);
    fs.writeFileSync('./bin/output.js', result, {encoding:'utf8', flag:'w'}); 
})();
