
const assert = require('assert');
const {tick, equalClass} = require('../lib');


async function main(build) {
    const {document, app} = await build();

    await tick();

    equalClass('bold c1 red test', document.body.firstElementChild.className);

    const styles = document.querySelectorAll('style');
    assert.strictEqual(1, styles.length);
    assert.strictEqual('.bold.c1{font-weight:bold}.red.c1{color:red}', styles[0].innerHTML);

}

module.exports = {main};
