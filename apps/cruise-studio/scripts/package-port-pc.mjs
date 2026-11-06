/* Single Studio release. Project API admission stays operator-restricted on the server. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {PRO_DIRECTORY,renderProEntry,renderProManifest} from './edition-layout.mjs';
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const RELEASE_FILES=Object.freeze([
 'cloud-panel.css','js/cloud/document-codec.mjs','js/cloud/studio-transport.mjs','js/cloud/studio-session-adapter.mjs','js/cloud/studio-sync-client.mjs','js/cloud/cloud-panel.mjs','js/cloud/project-sync-host.mjs','js/cloud/canary-entry.mjs',
 PRO_DIRECTORY+'/manifest.webmanifest','assets/app-icons/pro/favicon-32.png','assets/app-icons/pro/apple-touch-icon-180.png','assets/app-icons/pro/icon-192.png','assets/app-icons/pro/icon-512.png','assets/app-icons/pro/icon-1024.png',
 PRO_DIRECTORY+'/index.html','entry.css','theme-projection.css','theme.css','shell.css','studio-home.css','studio-tools.css','port-tuner-surface.css','port-pc.css','assets/studio-icons.svg','assets/tool-calendar.svg','assets/tool-sync.svg',
 'js/core/studio-icon-theme.js',
 'assets/tool-sheet.svg','assets/tool-sheet-light.svg','assets/tool-predtm.svg','assets/tool-predtm-light.svg','assets/tool-home.svg','assets/tool-home-light.svg','assets/tool-myapps.svg','assets/tool-myapps-light.svg','assets/tool-calendar-light.svg','assets/tool-sync-light.svg',
 'js/score-workspace.js',
 'melody-staff.css',
 'melody-editor.css',
 'chord-form.css',
 'rhythm-panel.css',
 'print.css',
 'vendor/vexflow.js',
 'vendor/LICENSE-vexflow.txt',
 'vendor/LICENSE-bravura-OFL.txt',
 'vendor/LICENSE-leland-OFL.txt',
 'vendor/LICENSE-petaluma-OFL.txt',
 'vendor/NOTICE.md',
 'js/core/music-theory.js',
 'js/core/rhythm-snapshot.js',
 'js/core/schema2.js',
 'js/core/melody-commands.js',
 'js/core/song-model.js',
 'js/core/storage.js',
 'js/core/editing-session.js',
 'js/core/project-repository.js',
 'js/core/active-document.js',
 'js/core/common-music-model.js',
 'js/core/structure-conversion.js',
 'js/core/melody-notation.js',
 'js/core/component-metadata.mjs',
 'js/modules/sheet-cruise/history-commands.js',
 'js/modules/sheet-cruise/melody-editor.js',
 'js/modules/sheet-cruise/melody-staff.js',
 'js/modules/sheet-cruise/operation-adapter.js',
 'js/modules/sheet-cruise/sheet-cruise.js',
 'js/modules/sheet-cruise/sheet-renderer.js',
 'js/modules/sheet-cruise/text-adapter.js',
 'js/modules/pre-dtm-cruise/arrangement-engine.js',
 'js/modules/pre-dtm-cruise/guitar-voicing.mjs',
 'js/modules/pre-dtm-cruise/midi-export.js',
 'js/modules/pre-dtm-cruise/pre-dtm.js',
 'js/modules/chord/form-adapter.mjs',
 'js/modules/chord/form-adoption.mjs',
 'js/modules/chord/form-panel.mjs',
 'js/modules/chord/form-snapshot.mjs',
 'js/modules/chord/inspector.js',
 'js/modules/chord/read-model.js',
 'js/modules/rhythm/official-pattern-adapter.mjs',
 'js/modules/rhythm/owner-loader.mjs',
 'js/modules/rhythm/panel-controller.mjs',
 'js/modules/rhythm/panel.mjs',
 'js/modules/rhythm/pattern-adoption.mjs',
 'js/core/color-theme.js','js/core/port-frame-theme.js','js/core/command-router.js','js/core/focus-routing.js','js/core/keyboard-router.js','js/core/modal-manager.js','js/core/workspace-scroll.js','js/core/app-refresh.js','js/core/native-port-presentation.js','js/core/audio-coordinator.js','js/core/studio-entry.mjs','js/core/port-pro-boundary.mjs',
 'js/shell.js','js/port-pc.js','js/port-sync-status.mjs','js/modules/practice/port-surface.js','js/modules/tuner/port-surface.js','js/modules/metronome/port-surface.js','js/modules/library/port-surface.js',
 'js/modules/series/workspaces.js','js/modules/series/internal-app.mjs','js/modules/series/official-links.mjs','js/modules/series/presentation.mjs','js/modules/series/presentation.css'
]);
export function packagePortPC(output){
 const generated=fs.readFileSync(path.join(studio,PRO_DIRECTORY,'index.html'),'utf8');if(generated!==renderProEntry(fs.readFileSync(path.join(studio,'index.html'),'utf8')))throw Error('pro-entry-out-of-date');
 const repo=path.resolve(studio,'../..'),out=path.resolve(output),parent=fs.realpathSync(path.dirname(out));
 if(parent===repo||parent.startsWith(repo+path.sep)||fs.existsSync(out))throw Error('new-external-output-directory-required');
 const destination=path.join(out,'apps/cruise-studio'),files={};
 for(const name of RELEASE_FILES){
  const source=path.join(studio,name),bytes=fs.readFileSync(source),target=path.join(destination,name);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);files['apps/cruise-studio/'+name]=createHash('sha256').update(bytes).digest('hex');
 }
 // Legacy resources are frozen compatibility bytes for already-open tabs, not a second build.
 const legacy=path.join(repo,'apps/cruise-studio-canary');
 for(const name of fs.readdirSync(legacy,{recursive:true}).sort()){const source=path.join(legacy,name);if(!fs.statSync(source).isFile())continue;const bytes=fs.readFileSync(source),target=path.join(out,'apps/cruise-studio-canary',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);files['apps/cruise-studio-canary/'+name]=createHash('sha256').update(bytes).digest('hex');}
 const version=fs.readFileSync(path.join(studio,'js/port-pc.js'),'utf8').match(/CS\.portPC=Object\.freeze\(\{version:'([^']+)'\}\)/)?.[1];
 if(!version)throw Error('studio-release-version-missing');
 if(fs.readFileSync(path.join(studio,PRO_DIRECTORY,'manifest.webmanifest'),'utf8')!==renderProManifest(version))throw Error('pro-manifest-out-of-date');
 const manifest={product:'Cruise Studio',version,sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),files,
  existingDeploymentDependencies:['apps/cruise-port/','apps/pitch-cruise/','apps/fretboard_cruise/','apps/rhythm-cruise/','apps/chord-cruise/','apps/shared/'],
  excluded:['development.html','legacy app.js and developer UI','Worker and migrations','native app releases/themes'],
  channel:'single-studio-operator-owner',edition:'pro',entry:'apps/cruise-studio/'+PRO_DIRECTORY+'/',standardPublished:false,productionReady:false};
 fs.writeFileSync(path.join(out,'RELEASE-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--out');if(i<0||!process.argv[i+1])throw Error('--out outside repository is required');
 const manifest=packagePortPC(process.argv[i+1]);console.log(JSON.stringify({files:Object.keys(manifest.files).length,sourceDirty:manifest.sourceDirty,productionReady:false}));
}
