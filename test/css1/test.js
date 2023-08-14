
import assert from 'assert';
import {tick, equalClass} from '../lib.js';


export async function main(build) {
    const {document, app} = await build();

    await tick();

    equalClass('bold c1', document.body.firstElementChild.className);

    app.cond = true;

    await tick();

    equalClass('bold c1 red', document.body.firstElementChild.className);

    const styles = document.querySelectorAll('style');
    assert.strictEqual(styles.length, 1);
    assert.strictEqual(styles[0].innerHTML, '.bold.c1{font-weight:bold}.red.c1{color:red}');

}
