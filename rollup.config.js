
import commonjs from '@rollup/plugin-commonjs';

export default [{
	input: './src/main.js',
	output: {
		sourcemap: true,
		format: 'cjs',
		file: './compile.js',
		globals: ['acorn', 'astring', 'css']
    },
	external: ['fs', 'acorn', 'astring', 'css'],
	plugins: [commonjs()]
}, {
	input: './src/compiler.js',
	output: {
		sourcemap: true,
		format: 'umd',
		file: './malina.js',
		name: 'malina',
		globals: {
			acorn: 'acorn',
			astring: 'astring',
			css: 'css'
		}
    },
	external: ['acorn', 'astring', 'css'],
	plugins: [commonjs()]
}];
