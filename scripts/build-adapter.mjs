import {build} from 'esbuild';
await build({entryPoints:['adapter/browser.ts'],bundle:true,format:'iife',target:'safari15',outfile:'adapter/dist/browser.js'});
await build({entryPoints:['adapter/index.ts'],bundle:true,format:'esm',target:'es2022',outfile:'adapter/dist/index.mjs'});
