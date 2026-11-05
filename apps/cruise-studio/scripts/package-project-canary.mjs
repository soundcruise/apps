// Compatibility command: one Studio package, no independent canary generation.
import {packagePortPC} from './package-port-pc.mjs';
import {fileURLToPath} from 'node:url';
export const packageProjectCanary=packagePortPC;
if(process.argv[1]===fileURLToPath(import.meta.url)){const i=process.argv.indexOf('--out');if(i<0)throw Error('--out required');console.log(JSON.stringify({files:Object.keys(packagePortPC(process.argv[i+1]).files).length,productionReady:false}));}
