/* Materialize the reviewed, immutable Project Owner candidate outside the repo.
 * No new Worker/schema or remote operation. Never a Production deployment input. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
export const PROJECT_SOURCE='066780ffce9e09cb97762cd35e1b0bfff9fca9da';
export function prepareRetainedProjectSource(output){
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
 const out=path.resolve(output);if(!out.startsWith('/private/tmp/')||fs.existsSync(out))throw Error('new-disposable-output-required');
 fs.mkdirSync(out,{recursive:true});const bytes=execFileSync('git',['archive',PROJECT_SOURCE,'workers/sound-cruise-sync/src','workers/sound-cruise-sync/scripts/studio-fixture-backup.mjs','workers/sound-cruise-sync/test/fixtures/maintenance-v2-schema33.json','apps/cruise-studio/js/cloud','apps/cruise-studio/js/core','apps/chord-cruise/js/core','apps/shared'],{cwd:repo,maxBuffer:32*1024*1024});
 execFileSync('tar',['-x','-C',out],{input:bytes});return out;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(prepareRetainedProjectSource(process.argv[2]));
