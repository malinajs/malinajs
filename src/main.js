
import fs from 'fs';
import { compile } from './compiler';

let inputFile = process.argv[2] || './example/example.html';
const src = fs.readFileSync(inputFile, {encoding:'utf8', flag:'r'}); 
const result = compile(src, {name: 'widget'});
fs.writeFileSync('./bin/output.js', result, {encoding:'utf8', flag:'w'}); 
