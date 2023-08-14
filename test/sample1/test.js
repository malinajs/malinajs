
import assert from 'assert';


export async function main(build) {
    const {document} = await build();

    assert.strictEqual(document.body.innerHTML, '<div class="c1 one">text</div>');
    
    const styles = document.querySelectorAll('style');
    assert.strictEqual(styles.length, 1);
    assert.strictEqual(styles[0].innerHTML, '.one.c1{color:red}.notused.c1{color:black}');

}
