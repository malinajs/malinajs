
import commonjs from '@rollup/plugin-commonjs';

export default [{
	input: './src/main.js',
	output: {
		sourcemap: true,
		format: 'cjs',
		file: './compile.js',
		globals: ['acorn', 'astring', 'css-tree']
    },
	external: ['fs', 'acorn', 'astring', 'css-tree'],
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
			'css-tree': 'css-tree'
		}
    },
	external: ['acorn', 'astring', 'css-tree'],
	plugins: [commonjs()]
}];
