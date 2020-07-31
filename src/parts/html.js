
export function makeHtmlBlock(exp, topElementName) {
    return `$runtime.$$htmlBlock($cd, ${topElementName}, () => (${exp}));\n`;
}
