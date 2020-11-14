
const lib = require('./lib');

async function main() {
    let tests = [
        'sample1',
        'each1',
        'each2',
        'prop1',
        'prop2',
        'css1',
        'css2',
        'css3',
        'css4',
        'pass-css',
        'css-global'
    ];

    for(let i=0; i<tests.length; i++) {
        describe(tests[i], function () {
            it(tests[i], async function() {
                await check(tests[i]);
            });
        });
    }
}

main();


async function check(name) {
    const test = require(`./${name}/test`);

    async function build(option) {
        return await lib.build(name, option);
    }

    await test.main(build);
}
