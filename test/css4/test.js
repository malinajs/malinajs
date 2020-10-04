
const assert = require('assert');
const {tick, equalClass} = require('../lib');


async function main(build) {
    const {document} = await build();

    await tick();

    const divs = document.body.querySelectorAll('body > div');
    assert.strictEqual(divs.length, 3);

    equalClass(divs[0], '');
    equalClass(divs[1], 'c1');
    equalClass(divs[1].firstElementChild, 'c1');
    equalClass(divs[2], 'root c1');
    equalClass(divs[2].firstElementChild, 'c1');

    const styles = document.querySelectorAll('style');
    assert.strictEqual(styles.length, 1);
    assert.strictEqual(styles[0].innerHTML, 'h1{color:red}div.c1 b.c1 h2{color:green}.root.c1 span.c1 div h3{color:blue}');

}

module.exports = {main};
