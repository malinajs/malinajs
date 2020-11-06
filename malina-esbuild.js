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
       
        esbuild({minify: false});

        derver({
            dir: 'public',
            watch: ['public','src'],
            onwatch:(lr,item)=>{
                if(item === 'src'){
                    lr.prevent();
                    esbuild({minify: false}, e => lr.error(e.toString(),'Build error'));
                }
            },
            ...derverConfig
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

                    let result = await malina.compile(source,{
                        name: args.path.match(/([^/\\]+)\.\w+$/)[1],
                        ...options
                    });
                    
                    return { contents: result }
                }
            );
        }
    }
}

async function esbuild(options={},onerror){

    options = {
        entryPoints: ['src/main.js'],
        outfile: 'public/bundle.js',
        minify: true,
        bundle: true,
        plugins: [malinaPlugin()],
        ...esbuildConfig,
        ...options
    };

    try{
        await build(options)
    }catch(e){
        onerror ? onerror(e) :  process.exit(1);
    }
}