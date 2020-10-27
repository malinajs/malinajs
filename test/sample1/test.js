
var assert = require('assert');


async function main(build) {
    const {document} = await build();

    assert.strictEqual(document.body.innerHTML, ' <div class="c2 one">text</div> ');
    
    const styles = document.querySelectorAll('style');
    assert.strictEqual(styles.length, 1);
    assert.strictEqual(styles[0].innerHTML, '.one.c2{color:red}.notused.c3{color:black}');

}

module.exports = {main};
