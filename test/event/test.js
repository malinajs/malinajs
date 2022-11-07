
const assert = require('assert');
const {tick} = require('../lib');


async function main(build) {
    let context = {
        click: 0,
        click2: 0,
        click4: 0,
        click5: 0,
        btn5: null,
        click6: 0,
        input: 0
    };

    const check = v => {
        assert.strictEqual(v[0], context.click);
        assert.strictEqual(v[1], context.click2);
        assert.strictEqual(v[2], context.click4);
        assert.strictEqual(v[3], context.click5);
        assert.strictEqual(v[4], context.btn5);
        assert.strictEqual(v[5], context.click6);
        assert.strictEqual(v[6], context.input);
    }

    const {window, document} = await build({context});

    await tick();

    const [btn1, btn2, btn3, btn4, btn5, btn6] = document.querySelectorAll('button');

    check([0, 0, 0, 0, null, 0, 0]);

    btn1.click();
    await tick();
    check([1, 0, 0, 0, null, 0, 0]);

    btn1.click();
    await tick();
    check([2, 0, 0, 0, null, 0, 0]);

    btn2.click();
    await tick();
    check([2, 1, 0, 0, null, 0, 0]);

    btn3.click();
    await tick();
    check([3, 1, 0, 0, null, 0, 0]);

    btn4.click();
    await tick();
    check([3, 1, 1, 0, null, 0, 0]);

    btn5.click();
    await tick();
    check([3, 1, 1, 1, 'btn-5', 0, 0]);

    btn6.click();
    await tick();
    check([3, 1, 1, 1, 'btn-5', 1, 0]);

    const input = document.querySelector('input');
    let e = new window.Event("keyup");
    e.key = '0';
    input.dispatchEvent(e);
    await tick();
    check([3, 1, 1, 1, 'btn-5', 1, 0]);

    e = new window.Event("keyup");
    e.key = 'Enter';
    input.dispatchEvent(e);
    await tick();

    check([3, 1, 1, 1, 'btn-5', 1, 1]);
}

module.exports = {main};
