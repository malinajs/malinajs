
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
        source.push(`
            let elsefr = $$htmlToFragment(\`${this.Q(elseBlock.tpl)}\`, true);
            ${elseBlock.source}
        `);
    } else {
        mainBlock = this.buildBlock(data);
    }
    source.push(`
        let mainfr = $$htmlToFragment(\`${this.Q(mainBlock.tpl)}\`, true);
        ${mainBlock.source}
    `);

    if(elseBlock) {
        source.push(`
            $$ifBlock($cd, $parentElement, () => !!(${exp}), mainfr, ${mainBlock.name}, elsefr, ${elseBlock.name});
        `);
    } else {
        source.push(`
            $$ifBlock($cd, $parentElement, () => !!(${exp}), mainfr, ${mainBlock.name});
        `);
    }
    source.push(`};\n ${ifBlockName}($cd, ${topElementName});`);
    
    return {
        source: source.join('\n')
    }
};

// runtime
import { $watch, $$removeItem, $$removeElements } from '../runtime/base';

export function $$ifBlock($cd, $parentElement, fn, tpl, build, tplElse, buildElse) {
    let childCD;
    let first, last;

    function create(fr, builder) {
        childCD = $cd.new();
        let tpl = fr.cloneNode(true);
        builder(childCD, tpl);
        first = tpl.firstChild;
        last = tpl.lastChild;
        $parentElement.parentNode.insertBefore(tpl, $parentElement.nextSibling);
    };

    function destroy() {
        if(!childCD) return;
        $$removeItem($cd.children, childCD);
        childCD.destroy();
        childCD = null;
        $$removeElements(first, last);
        first = last = null;
    };

    $watch($cd, fn, (value) => {
        if(value) {
            destroy();
            create(tpl, build);
        } else {
            destroy();
            if(buildElse) create(tplElse, buildElse);
        }
    });
};
