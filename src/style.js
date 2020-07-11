
import css from 'css';
import { assert } from './utils.js'


export function transformStyle(data) {
    debugger;
    var options = void 0;
    var obj = css.parse(data.content, options);
    css.stringify(obj, options);

}

