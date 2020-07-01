
export default [{
	input: './src/main.js',
	output: {
		sourcemap: true,
		format: 'cjs',
		file: './compile.js',
		globals: ['acorn', 'astring']
    },
    external: ['fs', 'acorn', 'astring']
}, {
	input: './src/compiler.js',
	output: {
		sourcemap: true,
		format: 'umd',
		file: './malina.js',
		name: 'malina',
		globals: {
			acorn: 'acorn',
			astring: 'astring'
		}
    },
	external: ['acorn', 'astring']
}];
