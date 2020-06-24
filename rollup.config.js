
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';


export default {
	input: './src/compiler.js',
	output: {
		sourcemap: true,
		format: 'umd',
		file: './bin/malina.js',
		name: 'malina'
    },
    external: ['fs', 'acorn', 'astring'],
	plugins: [
		commonjs(),
		babel({ presets: ['@babel/preset-env'] })
	]
};
