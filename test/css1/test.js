
const assert = require('assert');
const {tick, equalClass} = require('../lib');


async function main(build) {
    const {document, app} = await build();

    await tick();

    equalClass('bold c2 c3', document.body.firstElementChild.className);

    app.cond = true;

    await tick();

    equalClass('bold c2 c3 red', document.body.firstElementChild.className);

    const styles = document.querySelectorAll('style');
    assert.strictEqual(styles.length, 1);
    assert.strictEqual(styles[0].innerHTML, '.bold.c2{font-weight:bold}.red.c3{color:red}');

}

module.exports = {main};
