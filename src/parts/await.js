import { isSimpleName, assert } from "../utils";

export function makeAwaitBlock(node, elementName) {
    let source = [];
    let valueForThen, exp;
    let rx = node.value.match(/^#await\s+(\S+)\s+then\s+(\S+)\s*$/);
    if(rx) {
        assert(!node.parts.then);
        node.parts.then = node.parts.main;
        node.parts.main = null;
        exp = rx[1];
        valueForThen = rx[2];
    } else {
        rx = node.value.match(/^#await\s+(\S+)\s*$/);
        assert(rx);
        exp = rx[1].trim();
    }

    let block_main, block_then, block_catch;
    let build_main, build_then, build_catch;
    let tpl_main, tpl_then, tpl_catch;
    if(node.parts.main && node.parts.main.length) {
        block_main = this.buildBlock({body: node.parts.main});
        source.push(block_main.source);
        build_main = block_main.name;
        const convert = block_main.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
        source.push(`const tpl_main = ${convert}(\`${this.Q(block_main.tpl)}\`, true);`);
        tpl_main = 'tpl_main';
    } else tpl_main = 'null';
    if(node.parts.then && node.parts.then.length) {
        let args = [];
        if(valueForThen) {
            assert(isSimpleName(valueForThen));
            args.push(valueForThen);
        } else {
            let rx = node.parts.thenValue.match(/^[^ ]+\s+(.*)$/);
            if(rx) {
                assert(isSimpleName(rx[1]));
                args.push(rx[1]);
            }
        }

        block_then = this.buildBlock({body: node.parts.then, args});
        source.push(block_then.source);
        build_then = block_then.name;
        const convert = block_then.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
        source.push(`const tpl_then = ${convert}(\`${this.Q(block_then.tpl)}\`, true);`);
        tpl_then = 'tpl_then';
    } else tpl_then = 'null';
    if(node.parts.catch && node.parts.catch.length) {
        let args = [];
        let rx = node.parts.catchValue.match(/^[^ ]+\s+(.*)$/);
        if(rx) {
            assert(isSimpleName(rx[1]));
            args.push(rx[1]);
        }

        block_catch = this.buildBlock({body: node.parts.catch, args});
        source.push(block_catch.source);
        build_catch = block_catch.name;
        const convert = block_catch.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
        source.push(`const tpl_catch = ${convert}(\`${this.Q(block_catch.tpl)}\`, true);`);
        tpl_catch = 'tpl_catch';
    } else tpl_catch = 'null';

    source.push(`
        $runtime.$$awaitBlock($cd, ${elementName}, () => ${exp}, $$apply, ${build_main}, ${build_then}, ${build_catch}, ${tpl_main}, ${tpl_then}, ${tpl_catch});
    `);

    return {source: `{
        ${source.join('\n')}
    }`};
};
