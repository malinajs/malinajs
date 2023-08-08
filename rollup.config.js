
// import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';


export default [{
  input: './src/runtime/index.js',
  output: {
    file: './runtime.js',
    format: 'es'
  },
  onwarn(w, warn) {
    if(w.code == 'ILLEGAL_REASSIGNMENT' && w.message.includes('import "share"')) return;
    warn(w);
  }
}, {
	input: './src/compiler.js',
	output: {
    file: './malina.mjs',
		format: 'es'
	},
	plugins: [resolve()]
}];
