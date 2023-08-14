
import assert from 'assert';
import {tick} from '../lib.js';


export async function main(build) {
    const {document} = await build({hideLabel: true});

    await tick();

    let text = document.body.textContent.trim().replace(/\s+/g, ' ');
    assert.strictEqual(text, '1: [Child: undefined, default] 2: [Child: true, true] 3: [Child: 123, abc]');
}
