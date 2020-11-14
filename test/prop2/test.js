
const assert = require('assert');
const {tick} = require('../lib');


async function main(build) {
    const {document, app} = await build({hideLabel: true});

    await tick();
    const text = () => document.getElementById('result').textContent.trim().replace(/\s+/g, ' ');
    assert.strictEqual(text(), '[ubuntu:20] [$props={"name":"ubuntu","value":"20","ext":"info"}] [$attrs={"ext":"info"}]');

    app.value = '20.04 LTS';
    await tick(10);
    assert.strictEqual(app.name, 'ubuntu');
    assert.strictEqual(text(), '[ubuntu:20.04 LTS] [$props={"name":"ubuntu","value":"20.04 LTS","ext":"info"}] [$attrs={"ext":"info"}]');

    app.name = 'Debian';
    await tick(10);
    assert.strictEqual(app.name, 'Debian');
    assert.strictEqual(text(), '[Debian:20.04 LTS] [$props={"name":"Debian","value":"20.04 LTS","ext":"info"}] [$attrs={"ext":"info"}]');

    app.ext = 'unix';
    await tick(10);
    assert.strictEqual(app.name, 'Debian');
    assert.strictEqual(text(), '[Debian:20.04 LTS] [$props={"name":"Debian","value":"20.04 LTS","ext":"unix"}] [$attrs={"ext":"unix"}]');

    document.__fix('system');
    await tick(10);
    assert.strictEqual(app.name, 'system');
    assert.strictEqual(text(), '[system:20.04 LTS] [$props={"name":"system","value":"20.04 LTS","ext":"unix"}] [$attrs={"ext":"unix"}]');
}

module.exports = {main};
