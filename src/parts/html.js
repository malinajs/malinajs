
export function makeHtmlBlock(exp, topElementName) {
    return `$$htmlBlock($cd, ${topElementName}, () => (${exp}));\n`;
}

