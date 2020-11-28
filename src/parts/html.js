
export function makeHtmlBlock(exp, topElementName) {
    this.detectDependency(exp);
    return `$runtime.$$htmlBlock($cd, ${topElementName}, () => (${exp}));\n`;
}
