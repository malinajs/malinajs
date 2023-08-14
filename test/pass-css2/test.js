
import assert from 'assert';
import {tick, equalClass} from '../lib.js';


export async function main(build) {
    const {document, app} = await build();

    await tick();

    const styles = document.head.querySelectorAll('style');
    assert.strictEqual(2, styles.length);
    assert.strictEqual(styles[0].innerHTML, '.main.c4{color:red}');
    assert.strictEqual(styles[1].innerHTML, '.main.c2{border:1px solid green;padding:2px}.bold.c3{font-weight:bold}');

    const root = document.body.firstElementChild;
    const child = root.firstElementChild;

    equalClass(root, 'main c2');
    equalClass(child, 'bold c3 main c4');
}
