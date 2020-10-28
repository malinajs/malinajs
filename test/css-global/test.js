
const assert = require('assert');
const {tick, equalClass} = require('../lib');


async function main(build) {
    const {document} = await build();

    await tick();

    const divs = document.body.querySelectorAll('body > div');
    assert.strictEqual(divs.length, 2);

    equalClass('root', divs[1]);

    const styles = document.querySelectorAll('style');
    assert.strictEqual(1, styles.length);
    assert.strictEqual('h1{color:red}div b h2{color:green}.root span div h3{color:blue}', styles[0].innerHTML);

}

module.exports = {main};
