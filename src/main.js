
import fs from 'fs';
import { compile } from './compiler';

let opt, inputFile, outputFile = './bin/output.js', widgetName = 'widget';
process.argv.slice(2).forEach(s => {
    if(s[0] == '-') {
        opt = s;
        return;
    }
    if(opt == '-o') {
        outputFile = s;
        opt = null;
        return;
    }
    if(opt == '-n') {
        widgetName = s;
        opt = null;
        return;
    }
    if(opt == '-i') {
        inputFile = s;
        opt = null;
        return;
    }
    if(inputFile) throw 'Wrong options';
    inputFile = s;
});

if(!inputFile) throw 'No input file';
const src = fs.readFileSync(inputFile, {encoding:'utf8', flag:'r'}); 
const result = compile(src, {name: widgetName});
fs.writeFileSync(outputFile, result, {encoding:'utf8', flag:'w'}); 
