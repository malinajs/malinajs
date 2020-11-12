
export default function shaking() {
    let src = this.runtime.header + this.runtime.body;

    const remove = (name) => {
        let root = this.script.rootLevel;
        for(let i=root.length - 1; i >= 0; i--) {
            if(root[i]._name == name) {
                root.splice(i, 1);
            }
        }
    }

    if(src.indexOf('$attributes') < 0) {
        remove('$attributes');
        if(src.indexOf('$props') < 0) {
            remove('$props');
        }
    }

    if(src.indexOf('$emit') < 0) {
        remove('$emit');
    }
};
