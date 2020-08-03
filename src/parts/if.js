
import { assert } from '../utils.js'


export function makeifBlock(data, topElementName) {
    let source = [];

    let r = data.value.match(/^#if (.*)$/);
    let exp = r[1];
    assert(exp, 'Wrong binding: ' + data.value);

    let ifBlockName = 'ifBlock' + (this.uniqIndex++);
    source.push(`function ${ifBlockName}($cd, $parentElement) {`);
    let mainBlock, elseBlock;
    if(data.bodyMain) {
        mainBlock = this.buildBlock({body: data.bodyMain});
        elseBlock = this.buildBlock(data);

        const convert = elseBlock.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
        source.push(`
            let elsefr = ${convert}(\`${this.Q(elseBlock.tpl)}\`, true);
            ${elseBlock.source}
        `);
    } else {
        mainBlock = this.buildBlock(data);
    }
    const convert = mainBlock.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
    source.push(`
        let mainfr = ${convert}(\`${this.Q(mainBlock.tpl)}\`, true);
        ${mainBlock.source}
    `);

    if(elseBlock) {
        source.push(`
            $runtime.$$ifBlock($cd, $parentElement, () => !!(${exp}), mainfr, ${mainBlock.name}, elsefr, ${elseBlock.name});
        `);
    } else {
        source.push(`
            $runtime.$$ifBlock($cd, $parentElement, () => !!(${exp}), mainfr, ${mainBlock.name});
        `);
    }
    source.push(`};\n ${ifBlockName}($cd, ${topElementName});`);
    
    return {
        source: source.join('\n')
    }
};
