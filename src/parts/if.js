
import { assert, xNode } from '../utils.js'


export function makeifBlock(data, element) {
    let r = data.value.match(/^#if (.*)$/);
    let exp = r[1];
    assert(exp, 'Wrong binding: ' + data.value);
    this.detectDependency(exp);

    const source = xNode('function', {
        name: 'ifBlock' + (this.uniqIndex++),
        args: ['$cd', '$parentElement']
    })

    let mainBlock, elseBlock;

    if(data.bodyMain) {
        mainBlock = this.buildBlock({body: data.bodyMain}, {protectLastTag: true});
        elseBlock = this.buildBlock(data, {protectLastTag: true});

        source.push(xNode('if:else', ctx => {
            const convert = elseBlock.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
            let template = this.xBuild(elseBlock.tpl);
            ctx.writeLine(`let elsefr = ${convert}(\`${this.Q(template)}\`);`);
            ctx.build(elseBlock.source);
        }));
    } else {
        mainBlock = this.buildBlock(data, {protectLastTag: true});
    }

    source.push(xNode('if:main', ctx => {
        const convert = mainBlock.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
        let template = this.xBuild(mainBlock.tpl);
        ctx.writeLine(`let mainfr = ${convert}(\`${this.Q(template)}\`);`);
        ctx.build(mainBlock.source);
    }));

    source.push(xNode('if:bind', ctx => {
        if(elseBlock) {
            ctx.writeLine(`$runtime.$$ifBlock($cd, $parentElement, () => !!(${exp}), mainfr, ${mainBlock.name}, elsefr, ${elseBlock.name});`);
        } else {
            ctx.writeLine(`$runtime.$$ifBlock($cd, $parentElement, () => !!(${exp}), mainfr, ${mainBlock.name});`);
        }
    }))

    this.require('apply');
    
    return {
        source: xNode('if', {
            el: element.bindName()
        }, (ctx, data) => {
            ctx.build(xNode('block', {
                body: [
                    source,
                    `${source.name}($cd, ${data.el});`
                ]
            }))
        })
    };
};
