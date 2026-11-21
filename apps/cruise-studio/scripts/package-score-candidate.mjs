/* Local preview with isolated Port news and account configuration. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packagePortPC} from './package-port-pc.mjs';

export function packageScoreCandidate(output) {
    return packagePortPC(output, {localCandidate:true});
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const flag=process.argv.indexOf('--out');
    if(flag<0||!process.argv[flag+1])throw Error('Specify --out with a new external directory');
    const m=packageScoreCandidate(path.resolve(process.argv[flag+1]));console.log(m.version,Object.keys(m.files).length,'files');
}
