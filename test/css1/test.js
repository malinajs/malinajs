
const assert = require('assert');
const {tick, equalClass} = require('../lib');


async function main(build) {
    const {document, app} = await build();

    await tick();

    equalClass(document.body.firstElementChild, 'c1 bold');

    app.cond = true;

    await tick();

    equalClass(document.body.firstElementChild, 'c1 bold red');

    const styles = document.querySelectorAll('style');
    assert.strictEqual(styles.length, 1);
    assert.strictEqual(styles[0].innerHTML, '.bold.c1{font-weight:bold}.red.c1{color:red}');

}

module.exports = {main};
