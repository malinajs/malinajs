
import assert from 'assert';
import {tick, equalClass} from '../lib.js';


export async function main(build) {
    const {document, app} = await build();

    await tick();

    const styles = document.head.querySelectorAll('style');
    assert.strictEqual(3, styles.length);
    assert.strictEqual(styles[0].innerHTML, 'button.c14{padding:4px}.btn.c14{margin:0px}.btn.c15{cursor:pointer}.color.c16{color:rgba(0,0,0,0.87);border:1px solid rgba(0,0,0,0.23)}.color.c16:hover{background-color:rgba(0,0,0,0.04)}');
    assert.strictEqual(styles[1].innerHTML, '.box.c10{border:1px solid blue;padding:4px;margin:4px}.btn-two.c11{cursor:auto}.red.c12{color:rgb(220,0,78);border:1px solid rgba(220,0,78,0.5)}.red.c12:hover{border:1px solid rgb(220,0,78);background-color:rgba(220,0,78,0.04)}.blue.c13{color:#1976d2;border:1px solid rgba(25,118,210,0.5)}.blue.c13:hover{border:1px solid #1976d2;background-color:rgba(25,118,210,0.04)}.header.c9{color:blueviolet}');
    assert.strictEqual(styles[2].innerHTML, '.box.c2{border:1px solid blue}.red.c3{color:red}.bold.c4{font-weight:bold}.hovered.c5{background-color:#e9f9ff}.hovered.c5:hover{background-color:#d4f3ff}.subtext.c6 small{color:brown}.green.c7{color:rgb(0,150,78)}.green.c7:hover{border:1px solid rgb(0,150,78)}');

    const root = document.body.firstElementChild;
    const child = root.firstElementChild;
    const header = child.firstElementChild;
    const buttons = document.querySelectorAll('button');
    assert.strictEqual(4, buttons.length);

    equalClass(root, 'box c2');
    equalClass(child, 'box c10');
    equalClass(header, 'c3 red');
    equalClass(buttons[0], 'c14  btn  c15  color c16');          // button.c14 .btn.c14 .btn.c15 .color.c16 .color.c16:hover
    equalClass(buttons[1], 'c14  btn  c15  blue c13');           // button.c14 .btn.c14 .btn.c15 .blue.c13 .blue.c13:hover
    equalClass(buttons[2], 'c14  btn  btn-two c11  red c12');    // button.c14 .btn.c14 .btn-two.c11 .red.c12 .red.c12:hover
    equalClass(buttons[3], 'c14  btn  c15  color c16');          // button.c14 .btn.c14 .btn.c15 .color.c16 .color.c16:hover

    app.checked = true;
    await tick(10);

    equalClass(root, 'box c2');
    equalClass(child, 'box c10');
    equalClass(header, 'red c3');
    equalClass(buttons[0], 'c14  btn  c15  color c16');          // button.c14 .btn.c14 .btn.c15 .color.c16 .color.c16:hover
    equalClass(buttons[1], 'c14  btn  c15  blue c13');           // button.c14 .btn.c14 .btn.c15 .blue.c13 .blue.c13:hover
    equalClass(buttons[2], 'c14  btn  btn-two c11  red c12');    // button.c14 .btn.c14 .btn-two.c11 .red.c12 .red.c12:hover
    equalClass(buttons[3], 'c14  btn  c15  green c7');          // button.c14 .btn.c14 .btn.c15 .green.c7 .green.c7:hover


    app.classList = 'glob bold';
    await tick(10);

    equalClass(root, 'box c2');
    equalClass(child, 'box c10');
    equalClass(header, 'red c3  glob  bold c4');
    equalClass(buttons[0], 'c14  btn  c15  color c16');
    equalClass(buttons[1], 'c14  btn  c15  blue c13');
    equalClass(buttons[2], 'c14  btn  btn-two c11  red c12');
    equalClass(buttons[3], 'c14  btn  c15  green c7');


    app.classList = 'hovered subtext';
    await tick(10);

    equalClass(root, 'box c2',);
    equalClass(child, 'box c10');
    equalClass(header, 'red c3  hovered c5  subtext c6');
    equalClass(buttons[0], 'c14  btn  c15  color c16');
    equalClass(buttons[1], 'c14  btn  c15  blue c13');
    equalClass(buttons[2], 'c14  btn  btn-two c11  red c12');
    equalClass(buttons[3], 'c14  btn  c15  green c7');

}
