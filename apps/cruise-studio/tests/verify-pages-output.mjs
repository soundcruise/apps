/* Run after a real local Jekyll --safe build; never a substitute for building. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {RELEASE_FILES} from '../scripts/package-port-pc.mjs';
const output=path.resolve(process.argv[2]),native=process.argv[3]&&path.resolve(process.argv[3]);
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=directory=>fs.readdirSync(directory,{recursive:true,withFileTypes:true}).filter(d=>d.isFile()).map(d=>path.relative(directory,path.join(d.parentPath,d.name)));
const actual=files(path.join(output,'apps/cruise-studio')).sort();
assert.deepEqual(actual,[...RELEASE_FILES].sort(),'Pages must contain exactly the release files, not just hide menu entries');
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const name of RELEASE_FILES)assert.equal(digest(path.join(output,'apps/cruise-studio',name)),digest(path.join(studio,name)),name);
let unchanged=0;
if(native)for(const app of ['cruise-port','pitch-cruise','fretboard_cruise','rhythm-cruise','chord-cruise','shared']){
 const directory=path.join(output,'apps',app);
 for(const name of files(directory)){assert.equal(digest(path.join(directory,name)),digest(path.join(native,'apps',app,name)),app+'/'+name);unchanged++;}
}
console.log(JSON.stringify({production:false,studioFiles:actual.length,releaseBytesMatch:true,nativeOutputFilesByteIdentical:unchanged}));
