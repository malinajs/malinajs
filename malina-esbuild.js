const { build } = require('esbuild');
const { derver } = require('derver');
const malina = require('malinajs');
const fsp = require('fs/promises');
const fs = require('fs');
const path = require('path');

process.argv.includes('-w') ? process.env.WATCH = 1 : null;

// Configs 

const esbuildConfigPath = path.join(process.cwd(),'esbuild.config.js');
const derverConfigPath = path.join(process.cwd(),'derver.config.js');
const malinaConfigPath = path.join(process.cwd(),'malina.config.js');

const esbuildConfig = fs.existsSync(esbuildConfigPath) ? require(esbuildConfigPath) : {};
const derverConfig = fs.existsSync(derverConfigPath) ? require(derverConfigPath) : {};
const malinaConfig = fs.existsSync(malinaConfigPath) ? require(malinaConfigPath) : {};

// Executable

if(!module.parent){

    if(process.env.WATCH){
        esbuild({
            minify: false,
            incremental: true
        }).then( bundle =>{
            derver({
                dir: 'public',
                watch: ['public','src'],
                onwatch: async (lr,item)=>{
                    if(item === 'src'){
                        lr.prevent();
                        try{
                            await bundle.rebuild();
                        }catch(err){
                            console.log(err.message);
                            lr.error(err.toString(),'Build error');
                        }
                    }
                },
                ...derverConfig
            })
        })
    }else{
        esbuild();
    }
    
}

// Module

module.exports = {
    malinaPlugin,
    esbuild
}

function malinaPlugin(options={}){

    const cssModules = new Map();

    options = {
        ...malinaConfig,
        ...options
    }

    if(options.displayVersion !== false) console.log('! Malina.js', malina.version);
    
    return {
        name: 'malina-plugin',
        setup(build) {        
            build.onLoad(
                { filter: /\.(xht|ma|html)$/ }, 
                async (args) => {

                    let source = await fsp.readFile(args.path, 'utf8');

                    let ctx = await malina.compile(source,{
                        name: args.path.match(/([^/\\]+)\.\w+$/)[1],
                        ...options
                    });

                    let code = ctx.result;
                    
                    if(!options.css && ctx.css.result){
                        const cssPath = args.path.replace(/\.\w+$/, ".malina.css").replace(/\\/g, "/");
                        cssModules.set(cssPath,ctx.css.result);
                        code += `\nimport "${cssPath}";`
                    }
                    
                    return { contents: code }
                }
            );

            build.onResolve({ filter: /\.malina\.css$/ }, ({ path }) => {
                return { path, namespace: 'malinacss' }
            })

            build.onLoad({ filter: /\.malina\.css$/, namespace: 'malinacss' }, ({ path }) => {
                const css = cssModules.get(path);
                return css ? { contents: css, loader: "css" } : null;
            })
        }
    }
}

async function esbuild(options={}){

    options = {
        entryPoints: ['src/main.js'],
        outfile: 'public/bundle.js',
        minify: true,
        bundle: true,
        plugins: [malinaPlugin()],
        ...esbuildConfig,
        ...options
    };

    return build(options);
}