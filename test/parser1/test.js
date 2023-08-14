
import assert from 'assert';
import {tick} from '../lib.js';


export async function main(build) {
    const {document} = await build();

    await tick();

    const divs = document.querySelectorAll('div');
    assert.strictEqual(divs[0].innerHTML, '0');
    assert.strictEqual(divs[1].innerHTML, '0');

    const buttons = document.querySelectorAll('button');
    buttons[0].click();
    buttons[1].click();

    await tick();

    assert.strictEqual(divs[0].innerHTML, '2');
    assert.strictEqual(divs[1].innerHTML, "'");
}
