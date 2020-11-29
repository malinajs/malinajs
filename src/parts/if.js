
import { assert, xNode } from '../utils.js'


export function makeifBlock(data, element) {
    let r = data.value.match(/^#if (.*)$/);
    let exp = r[1];
    assert(exp, 'Wrong binding: ' + data.value);
    this.detectDependency(exp);
    this.require('apply');

    let mainBlock, elseBlock, mainTpl, elseTpl;

    if(data.bodyMain) {
        mainBlock = this.buildBlock({body: data.bodyMain}, {protectLastTag: true, inline: true});
        elseBlock = this.buildBlock(data, {protectLastTag: true, inline: true});

        elseTpl = xNode('template', {
            inline: true,
            body: elseBlock.tpl,
            svg: elseBlock.svg
        });
    } else {
        mainBlock = this.buildBlock(data, {protectLastTag: true, inline: true});
    }

    mainTpl = xNode('template', {
        inline: true,
        body: mainBlock.tpl,
        svg: mainBlock.svg
    });

    const source = xNode('if:bind', {
        el: element.bindName(),
        exp,
        mainTpl,
        mainBlock: mainBlock.source,
        elseTpl,
        elseBlock: elseBlock && elseBlock.source
    },
    (ctx, data) => {
        ctx.writeLine(`$runtime.$$ifBlock($cd, ${data.el}, () => !!(${data.exp}),`);
        ctx.indent++;
        ctx.writeIndent();
        ctx.build(data.mainTpl);
        ctx.write(',\n');
        ctx.writeIndent();
        if(data.mainBlock) {
            ctx.build(xNode('function', {
                inline: true,
                arrow: true,
                args: ['$cd', '$parentElement'],
                body: [data.mainBlock]
            }));
        } else ctx.write('$runtime.noop');
        if(data.elseTpl) {
            ctx.write(',\n');
            ctx.writeIndent();
            ctx.build(data.elseTpl);
            ctx.write(',\n');
            ctx.writeIndent();
            if(data.elseBlock) {
                ctx.build(xNode('function', {
                    inline: true,
                    arrow: true,
                    args: ['$cd', '$parentElement'],
                    body: [data.elseBlock]
                }));
            } else ctx.write('$runtime.noop');
        }
        ctx.indent--;
        ctx.write(');\n');
    });

    return {source};
};
