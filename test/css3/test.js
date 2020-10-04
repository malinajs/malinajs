
const assert = require('assert');
const {tick, equalClass} = require('../lib');


async function main(build) {
    const {document, app} = await build();

    await tick();

    equalClass(document.body.querySelectorAll('div')[0], '');
    equalClass(document.body.querySelectorAll('div')[1], 'c1');
    document.body.querySelectorAll('span').forEach(n => {
        equalClass(n, 'c1');
    });

    const styles = document.querySelectorAll('style');
    assert.strictEqual(styles.length, 1);
    assert.strictEqual(styles[0].innerHTML, 'div.c1>.c1:last-child{color:red}');

}

module.exports = {main};
