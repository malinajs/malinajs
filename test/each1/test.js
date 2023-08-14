
import assert from 'assert';

function tick() {
    return new Promise(resolve => {
        setTimeout(resolve, 1);
    });
}


export async function main(build) {
    const {document} = await build({hideLabel: true});

    await tick();

    assert.strictEqual(document.body.innerHTML.trim(), '<p>No.0 One</p><p>No.1 Two</p><p>No.2 Three</p><!---->');
    
}
