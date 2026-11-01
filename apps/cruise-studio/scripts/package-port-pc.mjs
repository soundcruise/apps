/* Static release artifact. Never publish the repository/development tree as 1.0. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const RELEASE_FILES=Object.freeze([
 'index.html','entry.css','theme-projection.css','theme.css','shell.css','studio-home.css','studio-tools.css','port-tuner-surface.css','port-pc.css','assets/studio-icons.svg',
 'js/core/color-theme.js','js/core/port-frame-theme.js','js/core/command-router.js','js/core/focus-routing.js','js/core/keyboard-router.js','js/core/modal-manager.js','js/core/workspace-scroll.js','js/core/app-refresh.js','js/core/native-port-presentation.js','js/core/audio-coordinator.js','js/core/studio-entry.mjs','js/core/port-pro-boundary.mjs',
 'js/shell.js','js/port-pc.js','js/port-sync-status.mjs','js/modules/practice/port-surface.js','js/modules/tuner/port-surface.js','js/modules/metronome/port-surface.js','js/modules/library/port-surface.js',
 'js/modules/series/workspaces.js','js/modules/series/internal-app.mjs','js/modules/series/official-links.mjs','js/modules/series/presentation.mjs','js/modules/series/presentation.css'
]);
export function packagePortPC(output){
 const repo=path.resolve(studio,'../..'),out=path.resolve(output),parent=fs.realpathSync(path.dirname(out));
 if(parent===repo||parent.startsWith(repo+path.sep)||fs.existsSync(out))throw Error('new-external-output-directory-required');
 const destination=path.join(out,'apps/cruise-studio'),files={};
 for(const name of RELEASE_FILES){
  const source=path.join(studio,name),bytes=fs.readFileSync(source),target=path.join(destination,name);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);files['apps/cruise-studio/'+name]=createHash('sha256').update(bytes).digest('hex');
 }
 const manifest={product:'Cruise Studio Port PC',version:'1.0.1',sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),files,
  existingDeploymentDependencies:['apps/cruise-port/','apps/pitch-cruise/','apps/fretboard_cruise/','apps/rhythm-cruise/','apps/chord-cruise/','apps/shared/'],
  excluded:['development.html','Project model/repository/editor','Pre-DTM','Project Sync and Cloud clients','Worker and migrations','native app releases/themes'],
  productionReady:false};
 fs.writeFileSync(path.join(out,'RELEASE-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--out');if(i<0||!process.argv[i+1])throw Error('--out outside repository is required');
 const manifest=packagePortPC(process.argv[i+1]);console.log(JSON.stringify({files:Object.keys(manifest.files).length,sourceDirty:manifest.sourceDirty,productionReady:false}));
}
