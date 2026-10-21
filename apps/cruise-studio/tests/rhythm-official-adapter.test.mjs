import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash, webcrypto} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {decodeOfficialPattern, createOfficialRhythmAdapter} from '../js/modules/rhythm/official-pattern-adapter.mjs';
const require=createRequire(import.meta.url),ROOT=new URL('../../..',import.meta.url).pathname;
const COMMIT='c1f99ff68e61da57f52a8dfe14ebcfa298659120';
const MODULE_HASH='e2f89b27261035b80d6eb4b50e810456b3446c714c5f32b62622418f354c97cd';
const hash=x=>createHash('sha256').update(x).digest('hex');
const ownerDir=process.env.RHYTHM_OWNER_DIR||mkdtempSync(join(tmpdir(),'rhythm-r4-node-owner-'));
if(!process.env.RHYTHM_OWNER_DIR){
 const paths={'official-patterns.mjs':'js/official-patterns.mjs','script.js':'script.js','oracle.json':'tests/fixtures/official-patterns-v1.json'};
 for(const [local,path] of Object.entries(paths))writeFileSync(join(ownerDir,local),execFileSync('git',['show',COMMIT+':apps/rhythm-cruise/'+path],{cwd:ROOT,maxBuffer:8*1024*1024}));
}
const ownerSource=readFileSync(join(ownerDir,'official-patterns.mjs'));
assert.equal(hash(ownerSource),MODULE_HASH,'actual fixed owner module bytes');
const versionBytes=execFileSync('git',['show',COMMIT+':apps/rhythm-cruise/script.js'],{cwd:ROOT,maxBuffer:8*1024*1024});
assert.equal(hash(readFileSync(join(ownerDir,'script.js'))),hash(versionBytes));
const ownerVersion=/const RHYTHM_CRUISE_VERSION = '([^']+)';/.exec(versionBytes.toString())[1];
const evidence={ownerApp:'rhythm-cruise',ownerAppVersion:ownerVersion,commit:COMMIT,tree:'7d1bcf9bee610ba809c4808d7c48eb067dc6984d',modulePath:'apps/rhythm-cruise/js/official-patterns.mjs',moduleSha256:MODULE_HASH,versionSource:{path:'apps/rhythm-cruise/script.js',symbol:'RHYTHM_CRUISE_VERSION',sha256:hash(versionBytes)},verification:'fixed-git-object'};
const golden=JSON.parse(readFileSync(join(ownerDir,'oracle.json')));
assert.equal(hash(readFileSync(join(ownerDir,'oracle.json'))),'4b978d0eb6bf4c74bdd3a55aff6f998b8dcdbc781f508991eedeaba226862f77');
const owner=await import(pathToFileURL(join(ownerDir,'official-patterns.mjs')).href);
const config=()=>({listOfficialPatterns:owner.listOfficialPatterns,getOfficialPattern:owner.getOfficialPattern,ownerVersion,sourceEvidence:evidence,expectedSource:{commit:COMMIT,moduleSha256:MODULE_HASH}});
const adapter=createOfficialRhythmAdapter(config());assert(adapter.ok);
const clone=x=>JSON.parse(JSON.stringify(x));
const id=golden.patterns[0].proposedPublicId;
const response=()=>clone(owner.getOfficialPattern(id));
const decode=p=>decodeOfficialPattern(p,adapter.sourceContext);
const checkFrozen=x=>{if(x&&typeof x==='object'){assert(Object.isFrozen(x));Object.values(x).forEach(checkFrozen);}};
test('real pinned R3 API lists exactly 5 eighth and 4 sixteenth; version evidence is separate from production mirror',()=>{
 const r=adapter.listOfficialPatterns();assert(r.ok);assert.equal(r.patterns.length,9);assert.equal(r.patterns.filter(p=>p.grid==='eighth').length,5);assert.equal(r.patterns.filter(p=>p.grid==='sixteenth').length,4);assert.equal(adapter.sourceEvidence.ownerAppVersion,ownerVersion);assert.equal(adapter.sourceEvidence.commit,COMMIT);
 const metadata=readFileSync(new URL('../js/core/component-metadata.mjs',import.meta.url),'utf8');assert(metadata.includes("'RHYTHM_CRUISE_VERSION', '1.21.0'"));
});
for(const p of golden.patterns)test('independent 104-cell oracle: '+p.name,()=>{
 const r=adapter.getOfficialPattern(p.proposedPublicId);assert(r.ok,JSON.stringify(r));assert.equal(r.nativeSnapshot.name,p.name);assert.equal(r.source.ownerAppVersion,ownerVersion);assert.equal(r.nativeSnapshot.tpq,24);assert.equal(r.nativeSnapshot.lengthTicks,96);assert.equal(r.projection.ppq,480);assert.equal(r.projection.lengthTicks,1920);
 for(const [i,c] of p.cells.entries()){
  const e=r.projection.events[i];assert.equal(e.sourceCellId,'c'+String(i).padStart(2,'0'));assert.equal(e.sourceTick,c.tick24);assert.equal(e.sourceSpanTicks,c.span24);assert.equal(e.onsetTick,c.tick480);assert.equal(e.spanTicks,c.span480);assert.equal(e.sound,{hit:'attack',rest:'rest',tie:'sustain'}[c.type]);assert.equal(e.direction,c.dir);assert.equal(e.directionBasis,p.presetDirs?'preset-explicit':c.hit?'stage-default':'none');assert.equal(e.legacyDirManual,c.dirManual??null);assert.equal(e.motion,c.hit?'stroke':'none');assert.equal(e.accent,null);assert.equal(e.playedStrings,null);assert.equal(e.voicing,null);
 }
 assert.equal(r.projection.events.at(-1).onsetTick+r.projection.events.at(-1).spanTicks,1920);assert.equal(r.projection.performanceReady,false);assert.equal(r.projection.completeScore,false);checkFrozen(r);
});
test('notation spans and continuation IDs use fixed independent musical expectations',()=>{
 const examples=[['one-three-eighth',[0,480,720,960,1440,1680],[480,240,240,480,240,240]],['eighth-two-sixteenths',[0,240,360,480,720,840,960,1200,1320,1440,1680,1800],[240,120,120,240,120,120,240,120,120,240,120,120]],['standard-sixteenth',[0,480,720,840,1080,1200,1440,1680,1800],[480,240,120,240,120,240,240,120,120]]];
 for(const [suffix,ticks,durations]of examples){const r=adapter.getOfficialPattern('rhythm:create-basic:'+suffix),attacks=r.projection.events.filter(e=>e.sound==='attack');assert.deepEqual(attacks.map(e=>e.onsetTick),ticks);assert.deepEqual(attacks.map(e=>e.notationDurationTicks),durations);}
 const r=adapter.getOfficialPattern('rhythm:create-basic:standard-sixteenth');assert.equal(r.projection.events[1].continuationOf,'c00');assert.equal(r.projection.events[2].continuationOf,'c00');assert.equal(r.projection.events[3].continuationOf,'c00');assert.equal(r.projection.events[1].notationDurationTicks,null);
});
test('orphan tie and tie after rest reject without publishing any partial/past projection',()=>{
 for(const afterRest of [false,true]){const p=response(),i=afterRest?1:0;if(afterRest){p.pattern.cells[0]={...p.pattern.cells[0],type:'rest',direction:null,directionBasis:'none',legacyDirManual:null};}p.pattern.cells[i]={...p.pattern.cells[i],type:'tie',direction:null,directionBasis:'none',legacyDirManual:null};const r=decode(p);assert.equal(r.error.code,'unresolved-orphan-sustain');assert(!Object.hasOwn(r,'projection'));assert(!Object.hasOwn(r,'nativeSnapshot'));}
 assert(adapter.getOfficialPattern(id).ok);
});
const invalidCases=[
 ['API',r=>r.apiVersion=2,'unsupported-api-version'],['encoding',r=>r.pattern.encoding='future','unsupported-encoding'],['profile',r=>r.pattern.semanticProfile='future','unsupported-profile'],['meter',r=>r.pattern.meter.beats=3,'unsupported-meter'],['grid',r=>r.pattern.grid='eighthTriplet','unsupported-grid'],['swing',r=>r.pattern.feel='swing','unsupported-feel'],['multiple bars',r=>r.pattern.patternBars=2,'unsupported-pattern'],['revision',r=>r.pattern.patternRevision=2,'unsupported-pattern'],['unknown ID',r=>r.pattern.patternId='toString','unsupported-pattern'],['TPQ',r=>r.pattern.tpq=480,'invalid-owner-response'],['length',r=>r.pattern.lengthTicks=1920,'invalid-owner-response'],['duplicate tick',r=>r.pattern.cells[1].tick=0,'invalid-owner-response'],['fraction',r=>r.pattern.cells[1].tick=12.5,'invalid-owner-response'],['NaN',r=>r.pattern.cells[1].tick=NaN,'invalid-owner-response'],['Infinity',r=>r.pattern.cells[1].tick=Infinity,'invalid-owner-response'],['unsafe integer',r=>r.pattern.cells[1].tick=Number.MAX_SAFE_INTEGER+1,'invalid-owner-response'],['negative',r=>r.pattern.cells[0].tick=-1,'invalid-owner-response'],['bar end attack',r=>r.pattern.cells[7].tick=96,'invalid-owner-response'],['cell id',r=>r.pattern.cells[1].id='c00','invalid-owner-response'],['missing cell',r=>r.pattern.cells.pop(),'invalid-owner-response'],['sparse',r=>delete r.pattern.cells[1],'invalid-owner-response'],['direction',r=>r.pattern.cells[0].direction='left','invalid-owner-response'],['direction source contradiction',r=>r.pattern.cells[0].direction='up','invalid-owner-response'],['basis',r=>r.pattern.cells[0].directionBasis='user-confirmed','invalid-owner-response'],['dirManual',r=>r.pattern.cells[0].legacyDirManual=false,'invalid-owner-response'],['extra field',r=>r.pattern.chords=[],'invalid-owner-response'],['dead',r=>r.pattern.cells[0].type='dead','invalid-owner-response'],['stop',r=>r.pattern.cells[0].type='stop','invalid-owner-response'],['ghost',r=>r.pattern.cells[0].type='ghost','invalid-owner-response'],['huge array',r=>r.pattern.cells=Array(100000),'invalid-owner-response']];
for(const[name,patch,code]of invalidCases)test('strict rejection / no repair: '+name,()=>{const p=response();patch(p);const r=decode(p);assert.equal(r.ok,false);assert.equal(r.error.code,code);assert(!r.projection);});
test('non-attack direction cannot manufacture a formal air stroke',()=>{const p=response();p.pattern.sourceDirections.preset=p.pattern.cells.map(c=>c.direction);p.pattern.cells.forEach(c=>c.directionBasis='preset-explicit');p.pattern.cells[0]={...p.pattern.cells[0],type:'rest',legacyDirManual:null};assert.equal(decode(p).error.code,'unsupported-pattern');});
test('version/source mismatch and raw version strings do not establish a verified source',()=>{
 for(const patch of [c=>c.ownerVersion='1.20.0',c=>c.ownerVersion='9.9.9',c=>c.sourceEvidence={...evidence,commit:'a'.repeat(40)},c=>c.sourceEvidence={...evidence,moduleSha256:'0'.repeat(64)},c=>c.sourceEvidence={...evidence,verification:'unverified'}]){const c=config();patch(c);assert.equal(createOfficialRhythmAdapter(c).ok,false);}
 assert.equal(decodeOfficialPattern(response(),{ownerApp:'rhythm-cruise',ownerAppVersion:ownerVersion}).error.code,'unverified-owner-source');assert.equal(decodeOfficialPattern(response(),clone(adapter.sourceContext)).ok,false);
});
test('unknown queries/revisions reject before invoking owner; real owner failures preserve explicit reason',()=>{
 assert.equal(adapter.getOfficialPattern('constructor').error.code,'unsupported-pattern');assert.equal(adapter.getOfficialPattern(id,{patternRevision:2}).ok,false);assert.equal(adapter.getOfficialPattern(id,{apiVersion:2}).error.code,'unsupported-api-version');assert.equal(adapter.listOfficialPatterns({collection:'my-rhythms'}).ok,false);
 const a=createOfficialRhythmAdapter({...config(),getOfficialPattern:()=>owner.getOfficialPattern('unknown')});assert.equal(a.getOfficialPattern(id).error.code,'owner-error');
 const wrong=createOfficialRhythmAdapter({...config(),getOfficialPattern:()=>owner.getOfficialPattern(golden.patterns[1].proposedPublicId)});assert.equal(wrong.getOfficialPattern(id).error.code,'invalid-owner-response');
});
test('hooks/throwing Proxy and owner exceptions do not execute input getters/toJSON or expose stale results',()=>{
 let hooks=0;for(const patch of [r=>Object.defineProperty(r,'pattern',{enumerable:true,get(){hooks++;throw Error('getter');}}),r=>r.toJSON=()=>{hooks++;},r=>Object.setPrototypeOf(r,{get toJSON(){hooks++;}}),r=>r[Symbol()]=1]){const r=response();patch(r);assert(!decode(r).ok);}assert.equal(hooks,0);
 const hostile=new Proxy({},{get(){hooks++;throw Error('read');},getPrototypeOf(){throw Error('trap');}});assert(!decode(hostile).ok);assert.equal(hooks,0);
 const q={get apiVersion(){hooks++;return 1;}};assert(!adapter.listOfficialPatterns(q).ok);assert(!adapter.getOfficialPattern(id,q).ok);assert.equal(hooks,0);
 let fail=false;const a=createOfficialRhythmAdapter({...config(),getOfficialPattern:(...args)=>{if(fail)throw hostile;return owner.getOfficialPattern(...args);}});assert(a.getOfficialPattern(id).ok);fail=true;const rejected=a.getOfficialPattern(id);assert.equal(rejected.error.code,'owner-error');assert(!rejected.projection);fail=false;assert(a.getOfficialPattern(id).ok);
});
test('independent, deeply frozen native/projection records never mutate owner inputs',()=>{
 const raw=response(),before=JSON.stringify(raw),a=decode(raw),b=decode(raw);assert(a.ok&&b.ok);assert.notEqual(a.nativeSnapshot,b.nativeSnapshot);assert.notEqual(a.projection.events,b.projection.events);assert.throws(()=>a.projection.events[0].onsetTick=999);assert.throws(()=>a.nativeSnapshot.cells.push({}));assert.equal(JSON.stringify(raw),before);assert.equal(owner.getOfficialPattern(id).pattern.cells[0].tick,0);checkFrozen(adapter.listOfficialPatterns());
});
test('actual Studio schema2 Project, repository raw, Session/Undo/base/dirty remain unchanged',()=>{
 const realm={window:{CruiseStudio:{},ChordCruise:{},crypto:webcrypto},TextEncoder};for(const p of ['core/music-theory.js','core/song-model.js'])vm.runInNewContext(readFileSync(new URL('../js/'+p,import.meta.url),'utf8'),realm);const C=realm.window.CruiseStudio,v1=clone(C.model.createSampleProject());vm.runInNewContext(readFileSync(new URL('../../chord-cruise/js/core/music-theory.js',import.meta.url),'utf8'),realm);C.schema2=require('../js/core/schema2.js');C.model.configureSchema2();const project=C.model.schema2.migrate(v1,JSON.stringify(v1)).project;project.projectId='r4-fixture';
 const E=require('../js/core/editing-session.js'),R=require('../js/core/project-repository.js'),values=new Map([['cruiseStudio.project.r4-fixture',JSON.stringify(project)]]);let writes=0;
 const storage={getItem:k=>values.get(k)??null,setItem(){writes++;throw Error('write');},removeItem(){writes++;throw Error('write');}};const repo=R.createRepository({storage,model:C.model,snapshot:E.snapshot,locks:{request:(_n,_o,fn)=>fn()}}),registry=E.createRegistry({repository:repo,validate:C.model.validateProject}),s=registry.getOrCreateSession('structure',{type:'project',projectId:'r4-fixture'});registry.activateSession(s);s.runOperation('fixture dirty title',p=>p.songInfo.title='未保存');
 const state=()=>JSON.stringify({project,raw:[...values],draft:s.workingSnapshot(),history:s.getHistory(),dirty:s.dirty,base:s.baseSnapshot,revision:s.baseRevision,pending:s.externalUpdatePending,conflict:s.conflict});const before=state();for(let i=0;i<20;i++){assert(adapter.getOfficialPattern(golden.patterns[i%9].proposedPublicId).ok);adapter.getOfficialPattern('unknown');}assert.equal(state(),before);assert.equal(writes,0);assert.equal(s.draft.schemaVersion,2);
 const rhythm=adapter.getOfficialPattern('rhythm:create-basic:one-three-eighth');s.runOperation('fixture chord changed',p=>p.bars[0].chords[0].symbol='G');assert.equal(rhythm.projection.events[1].sound,'sustain');assert.equal(rhythm.projection.events[1].continuationOf,'c00');
});
test('pure import / real owner acquisition / decoder uses no DOM, storage, network, Audio, Clock or Random',()=>{
 const adapterPath=new URL('../js/modules/rhythm/official-pattern-adapter.mjs',import.meta.url).pathname;
 const code=`const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');(async()=>{const c=vm.createContext({});vm.runInContext(\`for(const k of ['document','window','navigator','localStorage','sessionStorage','indexedDB','AudioContext','fetch','XMLHttpRequest','Date','setTimeout','setInterval','crypto'])Object.defineProperty(globalThis,k,{get(){throw Error(k)}});Math.random=()=>{throw Error('random')};\`,c);const a=new vm.SourceTextModule(fs.readFileSync(${JSON.stringify(adapterPath)},'utf8'),{context:c}),o=new vm.SourceTextModule(fs.readFileSync(${JSON.stringify(join(ownerDir,'official-patterns.mjs'))},'utf8'),{context:c});const keys=Reflect.ownKeys(c);for(const m of[a,o]){await m.link(()=>{throw Error('dependency')});await m.evaluate();}assert.deepEqual(Reflect.ownKeys(c),keys);c.a=a.namespace;c.o=o.namespace;c.evidenceText=${JSON.stringify(JSON.stringify(evidence))};vm.runInContext(\`const e=JSON.parse(evidenceText);const r=a.createOfficialRhythmAdapter({listOfficialPatterns:o.listOfficialPatterns,getOfficialPattern:o.getOfficialPattern,ownerVersion:e.ownerAppVersion,sourceEvidence:e,expectedSource:{commit:e.commit,moduleSha256:e.moduleSha256}});if(!r.ok)throw Error(JSON.stringify(r));for(const p of r.listOfficialPatterns().patterns)if(!r.getOfficialPattern(p.patternId).ok)throw Error('conversion');\`,c);})().catch(e=>{console.error(e);process.exitCode=1})`;
 const r=spawnSync(process.execPath,['--experimental-vm-modules','-e',code],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});
