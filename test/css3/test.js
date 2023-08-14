
import assert from 'assert';
import {tick, equalClass} from '../lib.js';


export async function main(build) {
    const {document, app} = await build();

    await tick();

    equalClass('', document.body.querySelectorAll('div')[0]);
    equalClass('c1', document.body.querySelectorAll('div')[1]);
    document.body.querySelectorAll('span').forEach(n => {
        equalClass('c1', n);
    });

    const styles = document.querySelectorAll('style');
    assert.strictEqual(1, styles.length);
    assert.strictEqual('div.c1>.c1:last-child{color:red}', styles[0].innerHTML);
}
