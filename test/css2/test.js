
const assert = require('assert');
const {tick, equalClass} = require('../lib');


async function main(build) {
    const {document, app} = await build();

    await tick();

    equalClass('bold c2 c3 red test', document.body.firstElementChild.className);

    const styles = document.querySelectorAll('style');
    assert.strictEqual(1, styles.length);
    assert.strictEqual('.bold.c2{font-weight:bold}.red.c3{color:red}', styles[0].innerHTML);

}

module.exports = {main};
