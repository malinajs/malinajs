
var assert = require('assert');


async function main(build) {
    const {dom} = await build();

    assert.strictEqual(dom.window.document.body.innerHTML, ' <div class="one c1">text</div> ');
    
    const styles = dom.window.document.querySelectorAll('style');
    assert.strictEqual(styles.length, 1);
    assert.strictEqual(styles[0].innerHTML, '.one.c1{color:red}');

}

module.exports = {main};
