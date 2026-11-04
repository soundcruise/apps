// Opt-in static artifact only. No publish, API call, targets, credentials or flags.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {packagePortPC} from './package-port-pc.mjs';
export const CANARY_FILES=Object.freeze(['js/cloud/document-codec.mjs','js/cloud/studio-transport.mjs','js/cloud/studio-session-adapter.mjs','js/cloud/studio-sync-client.mjs','js/cloud/cloud-panel.mjs','js/cloud/project-sync-host.mjs','cloud-panel.css','js/cloud/canary-entry.mjs']);
export function packageProjectCanary(output){
 const manifest=packagePortPC(output),studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),prefix='apps/cruise-studio-canary/';
 fs.renameSync(path.join(output,'apps/cruise-studio'),path.join(output,'apps/cruise-studio-canary'));manifest.files=Object.fromEntries(Object.entries(manifest.files).map(([name,hash])=>[name.replace('apps/cruise-studio/','apps/cruise-studio-canary/'),hash]));
 for(const name of CANARY_FILES){const b=fs.readFileSync(path.join(studio,name));fs.mkdirSync(path.dirname(path.join(output,prefix,name)),{recursive:true});fs.writeFileSync(path.join(output,prefix,name),b);manifest.files[prefix+name]=createHash('sha256').update(b).digest('hex');}
 const normal=fs.readFileSync(path.join(studio,'index.html'),'utf8'),entry=normal.replace('</body>','<script type="module" src="js/cloud/canary-entry.mjs?v='+manifest.version+'"></script>\n</body>');
 fs.writeFileSync(path.join(output,prefix,'project-canary.html'),entry);manifest.files[prefix+'project-canary.html']=createHash('sha256').update(entry).digest('hex');
 manifest.channel='operator-canary';manifest.productionReady=false;manifest.authorization='native Account/Device/Pro plus server canary activation and dataset targets';manifest.excluded=manifest.excluded.filter(x=>x!=='Project Sync and Cloud clients');manifest.excluded.push('identity host/development entry/test injection','targets and credentials','automatic public rollout');
 fs.writeFileSync(path.join(output,'RELEASE-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const i=process.argv.indexOf('--out');if(i<0)throw Error('--out required');console.log(JSON.stringify({files:Object.keys(packageProjectCanary(process.argv[i+1]).files).length,productionReady:false}));}
