
const { tokContexts } = require('acorn');
const assert = require('assert');
const {tick, equalClass} = require('../lib');


async function main(build) {
    const {document, app} = await build();

    await tick();

    const styles = document.head.querySelectorAll('style');
    assert.strictEqual(3, styles.length);
    assert.strictEqual('.btn.c14{cursor:pointer}.color.c15{color:rgba(0,0,0,0.87);border:1px solid rgba(0,0,0,0.23)}.color.c15:hover{background-color:rgba(0,0,0,0.04)}', styles[0].innerHTML);
    assert.strictEqual('.box.c9{border:1px solid blue;padding:4px;margin:4px}.red.c10{color:rgb(220,0,78);border:1px solid rgba(220,0,78,0.5)}.red.c10:hover{border:1px solid rgb(220,0,78);background-color:rgba(220,0,78,0.04)}.blue.c11{color:#1976d2;border:1px solid rgba(25,118,210,0.5)}.blue.c11:hover{border:1px solid #1976d2;background-color:rgba(25,118,210,0.04)}.header.c12{color:blueviolet}', styles[1].innerHTML);
    assert.strictEqual('.box.c2{border:1px solid blue}.red.c3{color:red}.bold.c4{font-weight:bold}.hovered.c5{background-color:#e9f9ff}.hovered.c5:hover{background-color:#d4f3ff}.subtext.c6 small{color:brown}.green.c7{color:rgb(0,150,78)}.green.c7:hover{border:1px solid rgb(0,150,78)}', styles[2].innerHTML);

    const root = document.body.firstElementChild;
    const child = root.firstElementChild;
    const header = child.firstElementChild;
    const buttons = document.querySelectorAll('button');
    assert.strictEqual(4, buttons.length);

    equalClass('box c2', root);
    equalClass('box c9', child);
    equalClass('c3 red', header);
    equalClass('btn c14 color c15', buttons[0]);
    equalClass('btn c14 blue c11', buttons[1]);
    equalClass('btn c14 red c10', buttons[2]);
    equalClass('btn c14 color c15', buttons[3]);

    app.checked = true;
    await tick(10);

    equalClass('box c2', root);
    equalClass('box c9', child);
    equalClass('c3 red', header);
    equalClass('btn c14 color c15', buttons[0]);
    equalClass('btn c14 blue c11', buttons[1]);
    equalClass('btn c14 red c10', buttons[2]);
    equalClass('btn c14 green c7', buttons[3]);


    app.classList = 'glob bold';
    await tick(10);

    equalClass('box c2', root);
    equalClass('box c9', child);
    equalClass('red c3 glob bold c4', header);
    equalClass('btn c14 color c15', buttons[0]);
    equalClass('btn c14 blue c11', buttons[1]);
    equalClass('btn c14 red c10', buttons[2]);
    equalClass('btn c14 green c7', buttons[3]);


    app.classList = 'hovered subtext';
    await tick(10);

    equalClass('box c2', root);
    equalClass('box c9', child);
    equalClass('red c3 hovered c5 subtext c6', header);
    equalClass('btn c14 color c15', buttons[0]);
    equalClass('btn c14 blue c11', buttons[1]);
    equalClass('btn c14 red c10', buttons[2]);
    equalClass('btn c14 green c7', buttons[3]);

}

module.exports = {main};
