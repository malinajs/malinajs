
const assert = require('assert');
const {tick, equalClass} = require('../lib');


async function main(build) {
    const {document} = await build();

    await tick();

    const divs = document.body.querySelectorAll('body > div');
    assert.strictEqual(divs.length, 3);

    equalClass('', divs[0]);
    equalClass('c1', divs[1]);
    equalClass('c1', divs[1].firstElementChild);
    equalClass('root c1', divs[2]);
    equalClass('c1', divs[2].firstElementChild);

    const styles = document.querySelectorAll('style');
    assert.strictEqual(1, styles.length);
    assert.strictEqual('h1{color:red}div.c1 b.c1 h2{color:green}.root.c1 span.c1 div h3{color:blue}', styles[0].innerHTML);

}

module.exports = {main};
