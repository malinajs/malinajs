
export default {
    input: 'src/runtime/index.js',
    output: {
        file: './runtime.js',
        format: 'es'
    },
    onwarn(w, warn) {
        if(w.code == 'ILLEGAL_NAMESPACE_REASSIGNMENT' && (w.id.endsWith('/parts/if.runtime.js') || w.id.endsWith('/parts/each.runtime.js'))) return;
		warn(w);
	}
}
