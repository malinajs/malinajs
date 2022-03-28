const { build } = require("esbuild");

const emojis = ['😺','🥺','🍓','💋','💀'];
const emoji = emojis[Math.floor(Math.random() * emojis.length)];

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    entryPoints: ["./src/compiler.js"],
    format: "cjs",
    outfile: "./malina.js",
    bundle: true,
    platform: "neutral",
    external: ["acorn", "astring", "css-tree"],
  },
  {
    entryPoints: ["./src/runtime/index.js"],
    format: "esm",
    outfile: "./runtime.js",
    bundle: true,
  },
];

Promise.all(builds.map(build)).then(() => {
  console.log(`${emoji}  \x1b[32mBundled!\x1b[39m`);
})

