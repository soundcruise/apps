/* Test-only profile for the existing native Port product suites. */
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const releaseMode=process.env.STUDIO_RELEASE1==='1';
export const studioPage=releaseMode?'index.html':'development.html';
export function workerWithoutProject(entry,src){
 if(!releaseMode)return entry;
 const a=entry.indexOf('env={'),b=entry.indexOf('const path=',a),c=entry.indexOf('return createStudioActivatedWorker(',b);
 if(a<0||b<0||c<0)throw Error('native-fixture-shape-changed');
 const pinned=process.env.STUDIO_PINNED_WORKER;
 if(pinned&&createHash('sha256').update(fs.readFileSync(pinned)).digest('hex')!=='9d880d845b22d7905a5fe5be5b453f074ee28956ce2044ac769c9ee726bbe0b5')throw Error('pinned-worker-artifact-mismatch');
 return `import legacy from ${JSON.stringify(pinned||src+'/index.js')};import {handleAccountApiRequest} from '${src}/account-app.js';import {handleProAuthRequest} from '${src}/pro-auth-app.js';export default {fetch(request,env){${entry.slice(a,b)}${entry.slice(b,c)}return legacy.fetch(request,env,{});},scheduled:legacy.scheduled};`;
}
export function removeProjectFixture(run){
 if(!releaseMode)return;
 if(!fs.realpathSync(run).startsWith('/private/tmp/'))throw Error('disposable-fixture-only');
 for(const name of fs.readdirSync(run,{recursive:true}).filter(x=>x.endsWith('.sqlite'))){
  const db=new DatabaseSync(path.join(run,name));db.exec('PRAGMA foreign_keys=OFF');
  for(const {name}of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND sql LIKE '%studio_%'").all())db.exec('DROP TRIGGER "'+name.replaceAll('"','""')+'"');
  for(const {name}of db.prepare("SELECT name FROM sqlite_master WHERE type='view' AND name LIKE 'studio_%'").all())db.exec('DROP VIEW "'+name.replaceAll('"','""')+'"');
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'studio_%'").all();
  for(const {name}of tables){if(!/^studio_[a-z0-9_]+$/.test(name))throw Error('unexpected-fixture-table');db.exec(`DROP TABLE "${name}"`);}
  db.close();
 }
}
export function fixtureFile(repo,pathname){
 const relative=decodeURIComponent(pathname).slice(1)+(pathname.endsWith('/')?'index.html':'');
 if(releaseMode&&relative.startsWith('apps/cruise-studio/')){
  const artifact=process.env.STUDIO_RELEASE_ARTIFACT;if(!artifact)throw Error('release-artifact-required');
  const root=fs.realpathSync(artifact),file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('path');return fs.readFileSync(file);
 }
 const nativeRoot=process.env.STUDIO_NATIVE_ROOT;
 if(releaseMode&&nativeRoot&&/^apps\/(cruise-port|pitch-cruise|fretboard_cruise|rhythm-cruise|chord-cruise|shared)\//.test(relative)){
  const root=fs.realpathSync(nativeRoot),file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('native-path');
  return fs.readFileSync(file);
 }
 const revision=process.env.STUDIO_APP_REVISION;
 if(releaseMode&&revision&&/^apps\/(pitch-cruise|fretboard_cruise|rhythm-cruise|chord-cruise)\//.test(relative)){
  if(!/^[0-9a-f]{40}$/.test(revision))throw Error('fixed-app-revision-required');return execFileSync('git',['show',revision+':'+relative],{cwd:repo,stdio:['ignore','pipe','ignore']});
 }
 const file=path.resolve(repo,relative);if(!file.startsWith(repo+path.sep))throw Error('path');return fs.readFileSync(file);
}
