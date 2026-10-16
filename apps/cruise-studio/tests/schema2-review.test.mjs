import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const require=createRequire(import.meta.url),E=require('../js/core/editing-session.js'),R=require('../js/core/project-repository.js'),A=require('../js/core/active-document.js'),CMD=require('../js/core/melody-commands.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function realm(){const window={CruiseStudio:{},ChordCruise:{},crypto:webcrypto};const context={window,TextEncoder};for(const f of ['../js/core/music-theory.js','../js/core/song-model.js','../../chord-cruise/js/core/music-theory.js'])vm.runInNewContext(readFileSync(new URL(f,import.meta.url),'utf8'),context);return {window,context,C:window.CruiseStudio};}
const f=realm(),C=f.C;C.schema2=require('../js/core/schema2.js');C.model.configureSchema2();const api=C.model.schema2;
function v1(){const p=clone(C.model.createLegacySampleProject());p.projectId='A';p.bars[0].melody=[{tick:240,durationTicks:180,step:0,alter:0,octave:0}];return p;}
function fixture({raw=JSON.stringify(v1()),maxBytes,fault=null}={}){
 const values=new Map([['cruiseStudio.project.A',raw]]);let writes=0,indexFailed=false,mode=fault,context={workspaceId:'sheetCruise',generation:1};
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){writes++;if(mode&&k==='cruiseStudio.projects.index'){indexFailed=true;throw Error('index quota');}if(mode==='unknown'&&indexFailed)throw Error('restore failed');values.set(k,v);},removeItem(k){if(mode==='unknown'&&indexFailed)throw Error('restore failed');values.delete(k);}};
 const repo=R.createRepository({storage,model:C.model,snapshot:E.snapshot,locks:{request:(_n,_o,fn)=>fn()},now:()=> '2026-10-15T12:00:00.000Z'});
 const registry=E.createRegistry({repository:repo,validate:C.model.validateProject,...(maxBytes?{historyLimits:{maxBytes}}:{})});let owner;
 const open=id=>{let s=registry.getOrCreateSession('structure',{type:'project',projectId:id});registry.activateSession(s);owner.bind(s);return true;};
 owner=A.createOwner({registry,repository:repo,validate:C.model.validateProject,snapshot:E.snapshot,openProject:open});open('A');
 const command=CMD.create({owner,schema:api,repository:repo,getContext:()=>context});
 function execute(type,payload={},gap=null){let b=owner.getSession().draft.bars[0];return command.execute(type,command.capture(b.id,b.melody[0]?.id,gap),payload);}
 return {values,repo,registry,owner,command,execute,s:()=>owner.getSession(),open,storage,writes:()=>writes,context:x=>context=x,fault:x=>mode=x};
}
const state=f=>JSON.stringify({draft:f.s().workingSnapshot(),base:f.s().baseSnapshot,revision:f.s().baseRevision,history:f.s().getHistory(),dirty:f.s().dirty,raw:[...f.values]});

const TEXT=require('../js/modules/sheet-cruise/text-adapter.js');
const stripPitch=bar=>({...clone(bar),melody:bar.melody.map(e=>{const x=clone(e);delete x.pitch;return x;})});
for(const [origin,confirmed] of [['legacy-unknown',false],['auto-assigned',false],['user-set',true],['legacy-unknown',true]])
 for(const rest of [false,true])test(`F1 pitch only retains all non-pitch content: ${origin}/${confirmed}, rest=${rest}`,async()=>{
 const initial=v1(),raw=JSON.stringify(initial),p=api.migrate(initial,raw).project;
 p.bars[0].melody[0].provenance=api.timing(origin,confirmed);
 if(rest)p.bars[0].melody.unshift({id:'explicit-rest',kind:'rest',onsetTick:0,durationTicks:120,provenance:api.timing('user-set',true)});
 const f=fixture({raw:JSON.stringify(p)}),s=f.s(),before=s.workingSnapshot(),base=s.baseSnapshot,revision=s.baseRevision;
 const adapter=TEXT.create({model:C.model,getSession:f.s});const result=adapter.apply({kind:'doremi',barNumber:1},'レ','discrete');assert(result.ok,JSON.stringify(result));
 const after=s.workingSnapshot();assert.deepEqual(stripPitch(after.bars[0]),stripPitch(before.bars[0]));
 const note=after.bars[0].melody.find(e=>e.kind==='note');assert.equal(note.onsetTick,240);assert.equal(note.durationTicks,180);assert.equal(note.pitch.step,'D');
 assert.deepEqual(s.baseSnapshot,base);assert.equal(s.baseRevision,revision);assert.equal(f.writes(),0);assert(s.dirty);
 assert(s.undo().ok);assert.deepEqual(s.workingSnapshot(),before);assert(s.redo().ok);assert.deepEqual(s.workingSnapshot(),after);
 let b=v1();b.projectId='B';f.values.set('cruiseStudio.project.B',JSON.stringify(b));f.open('B');assert.equal(f.s().getHistory().cursor,0);f.open('A');assert.deepEqual(f.s().workingSnapshot(),after);
 assert((await s.commit()).ok);assert.deepEqual(f.repo.read(s.target).snapshot.bars,after.bars);assert.equal(f.repo.read(s.target).snapshot.provenance.legacySource.raw,raw);
});
for(const value of ['ドレ','レ〜',''])test('F1 ambiguous count/extension refuses atomically: '+value,()=>{const f=fixture(),before=state(f),adapter=TEXT.create({model:C.model,getSession:f.s});assert(!adapter.apply({kind:'doremi',barNumber:1},value,'discrete').ok);assert.equal(state(f),before);});
test('F1 stable ID mapping rejects reordered, replaced or unidentified projection notes',()=>{
 for(const edit of [v=>v.bars[0].melody.reverse(),v=>v.bars[0].melody=v.bars[0].melody.map(e=>({...e,step:2}))]){
  const p=v1();p.bars[0].melody.push({tick:720,durationTicks:120,step:1,alter:0,octave:0});const f=fixture({raw:JSON.stringify(p)}),before=state(f);
  assert(!f.s().runOperation('ambiguous',p=>C.model.editLegacy(p,edit)).ok);assert.equal(state(f),before);
 }
});
test('F1 existing schema1 text placement and new empty v2 voice remain supported',()=>{
 const p=v1();C.model.setBarDoremiText(p,1,'ドレ〜');assert.equal(p.bars[0].melody.length,2);assert.equal(p.bars[0].melody[1].durationTicks,480);
 p.bars[0].melody=[];const f=fixture({raw:JSON.stringify(p)});assert(f.s().runOperation('new voice',p=>C.model.setBarDoremiText(p,1,'ドレ')).ok);
});
function hookCases(call){return [
 ['array inherited',p=>Object.setPrototypeOf(p.bars[0].melody,Object.assign(Object.create(Array.prototype),{toJSON:call}))],
 ['object inherited',p=>Object.setPrototypeOf(p.songInfo,{toJSON:call})],
 ['own toJSON',p=>p.toJSON=call],
 ['nested object',p=>p.extensions={nested:Object.assign(Object.create({toJSON:call}),{n:1})}],
 ['nested array',p=>{p.extensions={nested:[1]};Object.setPrototypeOf(p.extensions.nested,Object.assign(Object.create(Array.prototype),{toJSON:call}));}],
 ['deep prototype chain',p=>Object.setPrototypeOf(p.bars[0].melody,Object.create(Object.create(Object.assign(Object.create(Array.prototype),{toJSON:call}))))],
 ['own getter',p=>Object.defineProperty(p.songInfo,'title',{enumerable:true,get:call})],
 ['toJSON getter',p=>Object.setPrototypeOf(p.bars[0].melody,Object.create(Array.prototype,{toJSON:{get:call}}))],
 ['toStringTag getter',p=>Object.defineProperty(p.songInfo,Symbol.toStringTag,{get:call})],
 ['inherited getter',p=>Object.setPrototypeOf(p.songInfo,Object.create(Object.prototype,{future:{get:call}}))],
 ['inherited schemaVersion getter',p=>{delete p.schemaVersion;Object.setPrototypeOf(p,Object.create(Object.prototype,{schemaVersion:{get:call}}));}],
 ['projectId getter',p=>Object.defineProperty(p,'projectId',{enumerable:true,get:call})],
 ['foreign Array prototype hook',p=>{p.bars[0].melody=vm.runInNewContext('Array.prototype.toJSON=hook; JSON.parse(raw)',{hook:call,raw:JSON.stringify(p.bars[0].melody)});}],
 ['schemaVersion getter',p=>Object.defineProperty(p,'schemaVersion',{enumerable:true,get:call})],
 ];}
for(const [name,mutate] of hookCases(()=>{throw Error('case label only');}))test('F2 original memory rejects '+name+' without calling hook or writing',async()=>{
 let calls=0;const change=hookCases(()=>{calls++;return [];}).find(([n])=>n===name)[1],f=fixture(),s=f.s(),p=clone(s.workingSnapshot());change(p);
 const before=state(f),events=[];f.repo.subscribe(e=>events.push(e));
 assert(!C.model.validateProject(p).ok);assert(!api.migrate(p).ok);assert.throws(()=>E.snapshot(p));
 assert(!(await f.repo.save({target:s.target,baseRevision:s.baseRevision,snapshot:p})).ok);
 const ioRealm={window:{CruiseStudio:{model:C.model}},localStorage:f.storage};vm.runInNewContext(readFileSync(new URL('../js/core/storage.js',import.meta.url),'utf8'),ioRealm);const io=ioRealm.window.CruiseStudio.storage;
 assert.throws(()=>io.exportProjectJson(p));assert(!io.saveProject(p).ok);assert.throws(()=>s.replaceDraft(p));
 assert.equal(calls,0);assert.equal(f.writes(),0);assert.equal(state(f),before);assert.deepEqual(events,[]);
});
for(const [name] of hookCases(()=>{}))test('F2 staged operation rejects '+name+' atomically',()=>{
 let calls=0;const mutate=hookCases(()=>{calls++;return [];}).find(([n])=>n===name)[1],f=fixture(),s=f.s();assert(s.runTextOperation('title','title',p=>p.songInfo.title='draft').ok);const before=state(f);
 assert(!s.runOperation('bad memory',mutate).ok);assert.equal(calls,0);assert.equal(state(f),before);assert.equal(f.writes(),0);
});
test('F2 command payload, capacity path and legacy migration do not invoke inherited hooks',()=>{
 let calls=0;const f=fixture(),before=state(f),bad={durationTicks:240};Object.setPrototypeOf(bad,{toJSON(){calls++;return {};}});
 assert(!f.execute('melody.setDuration',bad).ok);assert.equal(state(f),before);
 const p=v1();Object.setPrototypeOf(p.bars[0].melody,Object.assign(Object.create(Array.prototype),{toJSON(){calls++;return [];}}));
 assert(!api.migrate(p,'{}').ok);assert.equal(calls,0);assert.equal(f.writes(),0);
});
test('F2 positive same/cross realm JSON including null prototype remains roundtrippable',async()=>{
 for(const foreign of [false,true]){
  const f=fixture(),s=f.s(),raw=JSON.stringify(s.workingSnapshot()),p=foreign?vm.runInNewContext('JSON.parse(raw)',{raw}):JSON.parse(raw);
  p.extensions=foreign?vm.runInNewContext('({nested:[1,null,true,"ok"]})'):Object.assign(Object.create(null),{nested:[1,null,true,'ok']});
  assert(api.validate(p).ok);assert(C.model.validateProject(p).ok);assert(api.migrate(p).ok);assert.deepEqual(clone(E.snapshot(p)),clone(p));assert((await f.repo.save({target:s.target,baseRevision:s.baseRevision,snapshot:p})).ok);
 }
});

test('F1 rounded display no-op does not reinterpret an irregular 180-tick note',()=>{
 const f=fixture(),before=state(f),text=C.model.getBarDoremiText(C.model.toLegacyView(f.s().draft).bars[0]);assert.equal(text,'ド〜');
 const adapter=TEXT.create({model:C.model,getSession:f.s});assert(adapter.apply({kind:'doremi',barNumber:1},text,'discrete').ok);assert.equal(state(f),before);
});
test('F1 explicit extensions preserve existing exact duration; changing them refuses atomically',()=>{
 const p=v1();C.model.setBarDoremiText(p,1,'ド〜');const f=fixture({raw:JSON.stringify(p)}),s=f.s(),before=s.workingSnapshot();
 const adapter=TEXT.create({model:C.model,getSession:f.s});assert(adapter.apply({kind:'doremi',barNumber:1},'レ〜','discrete').ok);
 assert.deepEqual(stripPitch(s.workingSnapshot().bars[0]),stripPitch(before.bars[0]));assert.equal(s.draft.bars[0].melody[0].pitch.step,'D');
 const unchanged=state(f);assert(!adapter.apply({kind:'doremi',barNumber:1},'ミ〜〜','discrete').ok);assert.equal(state(f),unchanged);
});
test('F1 multiple pitch/alter/octave edits keep exact IDs, rest order and gaps through Save/Load',async()=>{
 const p=v1();p.bars[0].melody.push({tick:960,durationTicks:240,step:1,alter:0,octave:0});const canonical=api.migrate(p,JSON.stringify(p)).project;
 canonical.bars[0].melody.splice(1,0,{id:'middle-rest',kind:'rest',onsetTick:600,durationTicks:120,provenance:api.timing('user-set',true)});
 const f=fixture({raw:JSON.stringify(canonical)}),s=f.s(),before=s.workingSnapshot(),adapter=TEXT.create({model:C.model,getSession:f.s});
 assert(adapter.apply({kind:'doremi',barNumber:1},'ミ♯↑ファ♭↓','discrete').ok);
 const after=s.workingSnapshot();assert.deepEqual(stripPitch(after.bars[0]),stripPitch(before.bars[0]));
 assert.deepEqual(after.bars[0].melody.filter(e=>e.kind==='note').map(e=>e.pitch),[{step:'E',alter:1,octave:5},{step:'F',alter:-1,octave:3}]);
 const unchanged=state(f);for(const text of ['ミ','ミファソ','ミ〜ファ']){assert(!adapter.apply({kind:'doremi',barNumber:1},text,'discrete').ok);assert.equal(state(f),unchanged);}
 assert(s.undo().ok);assert.deepEqual(s.workingSnapshot(),before);assert(s.redo().ok);assert((await s.commit()).ok);assert.deepEqual(f.repo.read(s.target).snapshot.bars,after.bars);
});
test('F2 raw Session schemaVersion getter rejects before commit and operation dispatch',async()=>{
 const f=fixture(),s=f.s(),before=state(f);let calls=0,success=0;f.registry.subscribe((_s,k)=>{if(k==='commit-success')success++;});
 Object.defineProperty(s.draft,'schemaVersion',{configurable:true,enumerable:true,get(){calls++;return 2;}});
 assert(!(await s.commit()).ok);assert(!s.runOperation('must not start',()=>{throw Error('must not run');}).ok);
 assert.equal(calls,0);assert.equal(f.writes(),0);assert.equal(success,0);
 Object.defineProperty(s.draft,'schemaVersion',{configurable:true,enumerable:true,writable:true,value:2});assert.equal(state(f),before);
});
test('F2 descriptor API cannot promise zero traps for arbitrary Proxy: boundary is explicit',()=>{
 let traps=0;const f=fixture(),before=state(f),proxy=new Proxy(clone(f.s().workingSnapshot()),{getOwnPropertyDescriptor(){traps++;throw Error('untrusted proxy introspection');}});
 assert.throws(()=>api.assertJson(proxy),/untrusted proxy/);assert(traps>0);assert.equal(state(f),before);assert.equal(f.writes(),0);
});

test('error precedence: unsafe JSON before protected identity before domain validation',()=>{
 for(const schemaVersion of [1,3,99]){
  const f=fixture(),before=state(f);assert.equal(f.s().runOperation('protected schema',p=>{p.schemaVersion=schemaVersion;p.songInfo.bpm=-1;}).code,'protected-field');assert.equal(state(f),before);
 }
 for(const hook of ['getter','toJSON']){
  const f=fixture(),before=state(f);let calls=0;
  const r=f.s().runOperation('mixed violations',p=>{p.projectId='other';if(hook==='getter')Object.defineProperty(p.songInfo,'bpm',{enumerable:true,get(){calls++;return -1;}});else Object.setPrototypeOf(p.songInfo,{toJSON(){calls++;return {};}});});
  assert.equal(r.code,'validation');assert.equal(calls,0);assert.equal(state(f),before);assert.equal(f.writes(),0);
 }
});
test('protected legacy source precedes malformed source content without executing getters',async()=>{
 const f=fixture(),s=f.s(),before=state(f),raw=Object.getOwnPropertyDescriptor(s.draft,'provenance').value,original=raw.legacySource;
 raw.legacySource={...original,raw:'not JSON'};assert.equal((await s.commit()).code,'protected-legacy-source');assert.equal(f.writes(),0);
 let calls=0;raw.legacySource={...original};Object.defineProperty(raw.legacySource,'raw',{enumerable:true,get(){calls++;return 'not JSON';}});
 assert.equal((await s.commit()).code,'validation');assert.equal(calls,0);assert.equal(f.writes(),0);
 raw.legacySource=original;assert.equal(state(f),before);
});
test('CMM private JSON DTO is fully validated; public read projection and prepared DTO remain non-persistable',async()=>{
 const M=require('../js/core/common-music-model.js'),f=fixture(),s=f.s();let validated=0;
 // Use the owner theory from the same VM as the Song Model, without loading another algorithm.
 const checked=M.createConverter({schema2:api,studioTheory:C.theory,chordTheory:globalChordTheory(),validate(p){api.assertJson(p);validated++;return C.model.validateProject(p);}});
 const frame={source:'working',project:s.workingSnapshot(),sessionId:s.sessionId,version:s.snapshotVersion,token:{sessionId:s.sessionId,projectId:s.target.projectId,generation:0},baseRevision:s.baseRevision};
 const before=state(f),result=checked.convert(frame);assert(result.ok,JSON.stringify(result.diagnostics));assert.equal(validated,1);assert.equal(state(f),before);
 const projection=api.readProjection(s.workingSnapshot()),dto=checked.prepare(s.workingSnapshot());assert(!C.model.validateProject(projection).ok);assert(!C.model.validateProject(dto).ok);
 for(const value of [projection,dto])assert(!(await f.repo.save({target:s.target,baseRevision:s.baseRevision,snapshot:value})).ok);
 assert.equal(f.writes(),0);assert.equal(state(f),before);
 let calls=0;const bad=clone(s.workingSnapshot());Object.setPrototypeOf(bad.bars[0].melody,Object.assign(Object.create(Array.prototype),{toJSON(){calls++;return [];}}));
 assert(!checked.convert({...frame,project:bad}).ok);assert.equal(calls,0);
});
function globalChordTheory(){return f.window.ChordCruise.theory;}

for(const empty of [false,true])for(const value of ['日本語','レ日本語','〜レ'])test(`syntax diagnostics precede count intent: empty=${empty}, input=${value}`,()=>{
 const p=v1();if(empty)p.bars[0].melody=[];const f=fixture({raw:JSON.stringify(p)}),before=state(f),adapter=TEXT.create({model:C.model,getSession:f.s});
 const result=adapter.apply({kind:'doremi',barNumber:1},value,'discrete');assert(!result.ok);
 assert.match(result.error,value==='〜レ'?/先頭の伸ばし記号/:/解釈できない/);assert.doesNotMatch(result.error,/音数変更/);assert.equal(state(f),before);assert.equal(f.writes(),0);
});
