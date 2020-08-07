
import fs from 'fs';
import { compile } from './compiler';

if(process.argv.length < 3) {
    console.log('node compile.js input.html -o output.js -n widgetName -innerOption')
    process.exit();
}

let opt, option = {};
process.argv.slice(2).forEach(s => {
    if(s[0] == '-') {
        if(opt) option[opt] = true;
        opt = s.substring(1);
        return;
    }
    if(opt) {
        option[opt] = s;
        opt = null;
    } else {
        if(option.i) throw 'Wrong options: ' + s;
        option.i = s;
    }
});
if(opt) option[opt] = true;

let inputFile = option.i;
let outputFile = option.o || './bin/output.js';
option.name = option.n || 'widget';
option.$context = {};

if(!inputFile) throw 'No input file';
const src = fs.readFileSync(inputFile, {encoding:'utf8', flag:'r'}); 
const result = compile(src, option);
fs.writeFileSync(outputFile, result, {encoding:'utf8', flag:'w'}); 
