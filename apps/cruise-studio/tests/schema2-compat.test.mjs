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
test('schema 1 initialization supplies a real identity reader and rejects uninitialized v2/future',()=>{let {C}=realm(),p=C.model.createSampleProject();assert.equal(C.model.toLegacyView(p),p);C.model.setBarChord(p,1,'Dm7');assert.equal(C.model.toLegacyView(p).bars[0].chords[0].symbol,'Dm7');for(const schemaVersion of [2,3,null])assert.throws(()=>C.model.toLegacyView({...p,schemaVersion}));});
for(const [name,edit] of [['move',f=>f.execute('melody.move',{onsetTick:480})],['duration',f=>f.execute('melody.setDuration',{durationTicks:240})],['rest',f=>f.execute('melody.insertRest',{onsetTick:720,durationTicks:240})],['kind',f=>f.execute('melody.setKind',{kind:'rest'})],['delete',f=>f.execute('melody.delete')],['event-confirm',f=>f.execute('melody.confirmEventTiming',{attributes:['onset']})],['gap-confirm',f=>f.execute('melody.confirmGap',{},CMD.gaps(f.s().draft.bars[0])[0])],['bar-confirm',f=>f.execute('melody.confirmBarTiming')]])test('command atomic Undo/Redo, stale snapshot, IME, capacity and raw: '+name,()=>{
 let f=fixture(),s=f.s(),before=s.workingSnapshot(),raw=f.values.get('cruiseStudio.project.A');assert(edit(f).ok);let after=s.workingSnapshot();assert(s.dirty);assert.equal(s.getHistory().cursor,1);assert.equal(f.values.get('cruiseStudio.project.A'),raw);assert.equal(f.writes(),0);assert(s.undo().ok);assert.deepEqual(s.workingSnapshot(),before);assert(s.redo().ok);assert.deepEqual(s.workingSnapshot(),after);
 let b=s.draft.bars[0],token=f.command.capture(b.id,b.melody[0]?.id);s.undo();s.redo();let unchanged=state(f);assert(!f.command.execute('melody.delete',token).ok);assert.equal(state(f),unchanged);
 f=fixture();f.s().setInputPending(true);unchanged=state(f);assert(!edit(f).ok);assert.equal(state(f),unchanged);
 f=fixture({maxBytes:32});unchanged=state(f);assert(!edit(f).ok);assert.equal(state(f),unchanged);
});
for(const [label,payload,type] of [['overlap',{onsetTick:240,durationTicks:480},'melody.insertRest'],['boundary',{onsetTick:1800},'melody.move'],['fraction',{onsetTick:.5},'melody.move'],['empty-kind',{kind:'note'},'melody.setKind'],['bad-pitch',{kind:'note',pitch:{step:'H',alter:0,octave:4}},'melody.setKind'],['bad-confirm',{attributes:['pitch']},'melody.confirmEventTiming']])test('command rejection is fully unchanged: '+label,()=>{let f=fixture();if(type==='melody.setKind')assert(f.execute(type,{kind:'rest'}).ok);let before=state(f);assert(!f.execute(type,payload).ok);assert.equal(state(f),before);});
test('no-op repeated confirmed command does not create a history entry',()=>{let f=fixture();assert(f.execute('melody.setDuration',{durationTicks:240}).ok);let before=state(f);assert.equal(f.execute('melody.setDuration',{durationTicks:240}).recorded,false);assert.equal(state(f),before);});
test('all command envelopes reject A/B/A, workspace, generation and forged targets',()=>{let f=fixture(),p=v1();p.projectId='B';f.values.set('cruiseStudio.project.B',JSON.stringify(p));let b=f.s().draft.bars[0],token=f.command.capture(b.id,b.melody[0].id);f.open('B');assert(f.execute('melody.setDuration',{durationTicks:120}).ok);f.open('A');let before=state(f);assert(!f.command.execute('melody.delete',token).ok);assert.equal(state(f),before);assert.equal(f.registry.getSession('structure',{type:'project',projectId:'B'}).getHistory().cursor,1);let fresh=f.command.capture(b.id,b.melody[0].id);assert(!f.command.execute('melody.delete',{...fresh,documentGeneration:99}).ok);f.context({workspaceId:'sheetCruise',generation:99});assert(!f.command.execute('melody.delete',fresh).ok);assert.equal(state(f),before);});
test('save failure and unknown result preserve draft/base/history without false success',async()=>{for(const mode of ['quota','unknown']){let f=fixture({fault:mode}),s=f.s();assert(f.execute('melody.setDuration',{durationTicks:240}).ok);let before=s.workingSnapshot(),base=s.baseRevision,history=s.getHistory();let result=await s.commit();assert(!result.ok);assert.equal(result.code,mode==='quota'?'storage-failure':'result-unknown');assert.equal(s.baseRevision,base);assert.deepEqual(s.workingSnapshot(),before);assert.deepEqual(s.getHistory().entries,history.entries);assert(s.dirty);if(mode==='quota')assert.equal(f.values.get('cruiseStudio.project.A'),base);else assert(s.externalUpdatePending);}});
test('direct v2 save/reload and JSON roundtrip retain IDs, pitch, timing, source, rest and extensions',async()=>{let original=v1(),raw=' \n'+JSON.stringify(original,null,2)+'\n',m=api.migrate(original,raw).project;m.extensions={preserved:[1,'x',null]};let f=fixture({raw:JSON.stringify(m)});assert(f.execute('melody.insertRest',{onsetTick:720,durationTicks:240}).ok);const before=f.s().workingSnapshot();assert((await f.s().commit()).ok);let saved=f.repo.read(f.s().target).snapshot;for(const k of ['bars','materials','performance','notation','extensions','provenance'])assert.deepEqual(saved[k],before[k]);let context={window:{CruiseStudio:{model:C.model}},localStorage:f.storage};vm.runInNewContext(readFileSync(new URL('../js/core/storage.js',import.meta.url),'utf8'),context);let io=context.window.CruiseStudio.storage;let exported=io.exportProjectJson(saved),round=io.importProjectJson(exported);assert(round.ok);assert.deepEqual(clone(round.project),clone(saved));assert.equal(round.project.provenance.legacySource.raw,raw);assert.throws(()=>io.exportProjectJson(C.model.toLegacyView(saved)),/Derived/);assert.equal((await f.repo.save({target:f.s().target,baseRevision:f.s().baseRevision,snapshot:C.model.toLegacyView(saved)})).code,'projection-not-persistable');});
test('restoration source cannot be changed through draft, normal Save or untracked mutation',async()=>{let f=fixture(),s=f.s(),before=state(f);assert.throws(()=>s.draft.provenance.legacySource.raw='x');assert.equal(state(f),before);let p=clone(s.workingSnapshot());delete p.provenance.legacySource;assert.equal((await f.repo.save({target:s.target,baseRevision:s.baseRevision,snapshot:p})).code,'protected-legacy-source');let raw=Object.getOwnPropertyDescriptor(s.draft,'provenance').value;assert.throws(()=>raw.legacySource.raw='x');assert.equal(state(f),before);assert.throws(()=>raw.legacySource={...raw.legacySource,raw:'x'},/Immutable legacy source/);assert.equal(state(f),before);});
test('v2 unknown nested structure, invalid extensions, duplicate aliases and future raw refuse write',async()=>{for(const change of [p=>p.notation.settings.future=1,p=>p.performance.arrangement.bass.future=1,p=>p.extensions={value:Infinity},p=>p.bars[0].melody[0].provenance.timing.duration.origin='guessed',p=>p.schemaVersion=3]){let f=fixture(),p=clone(f.s().workingSnapshot());change(p);assert(!C.model.validateProject(p).ok);const before=[...f.values];assert(!(await f.repo.save({target:f.s().target,baseRevision:f.s().baseRevision,snapshot:p})).ok);assert.deepEqual([...f.values],before);}});
test('stable IDs survive bar deletion, reordering, Undo and reload without renumbering',async()=>{let f=fixture(),s=f.s(),ids=s.draft.bars.map(b=>b.id);assert(s.runOperation('delete first',p=>C.model.setSectionBarCount(p,p.sections[0].id,2)).ok);assert.deepEqual(s.draft.bars.map(b=>b.id),ids.slice(0,2));assert(s.undo().ok);assert.deepEqual(s.draft.bars.map(b=>b.id),ids);assert(s.runOperation('reorder',p=>p.bars.reverse()).ok);assert.deepEqual(s.draft.bars.map(b=>b.id),ids.slice().reverse());assert((await s.commit()).ok);assert.deepEqual(f.repo.read(s.target).snapshot.bars.map(b=>b.id),ids.slice().reverse());});
test('unchanged text, metadata, display and workspace readers never re-time an irregular note',()=>{let f=fixture(),s=f.s(),before=s.workingSnapshot().bars[0].melody;let view=C.model.toLegacyView(s.draft),text=C.model.getBarDoremiText(view.bars[0]);assert(s.runOperation('title',p=>C.model.editLegacy(p,v=>v.songInfo.title='title')).ok);assert(s.runOperation('display',p=>C.model.editLegacy(p,v=>v.sheetSettings.showLyrics=false)).ok);assert.deepEqual(s.workingSnapshot().bars[0].melody,before);assert(C.model.getBarDoremiText(C.model.toLegacyView(s.draft).bars[0])===text);});
test('raw conflict, deletion and a future stored schema block output/save without overwriting',async()=>{for(const mode of ['conflict','deleted','future']){let f=fixture(),s=f.s();assert(f.execute('melody.setDuration',{durationTicks:240}).ok);let before=s.workingSnapshot();if(mode==='deleted')f.values.delete('cruiseStudio.project.A');else {let p=v1();if(mode==='future')p.schemaVersion=3;else p.songInfo.title='other';f.values.set('cruiseStudio.project.A',JSON.stringify(p));}let raw=f.values.get('cruiseStudio.project.A');assert(!(await s.commit()).ok);assert.deepEqual(s.workingSnapshot(),before);assert.equal(f.values.get('cruiseStudio.project.A'),raw);assert(!f.owner.capture().ok);}});
test('independent key/capo metadata leaves sounding pitch unchanged; solfege uses its own tonic',()=>{let f=fixture(),s=f.s(),before=clone(s.draft.bars[0].melody);assert(s.runOperation('display key',p=>p.songInfo.originalKey='G').ok);assert(s.runOperation('keep sound capo',p=>p.instrument.capo=2).ok);assert.deepEqual(clone(s.draft.bars[0].melody),before);assert(s.runOperation('solfege pitch',p=>C.model.setBarDoremiText(p,1,'レ')).ok);assert.equal(api.pitchMidi(s.draft.bars[0].melody[0].pitch),api.pitchMidi(s.draft.solfege.tonic)+2);});
test('unsupported 160 tick remains exact, confirmations refuse and values are not rounded',()=>{let p=v1();p.bars[0].melody[0].durationTicks=160;let f=fixture({raw:JSON.stringify(p)}),before=state(f);assert(!f.execute('melody.confirmBarTiming').ok);assert.equal(state(f),before);assert.equal(f.s().draft.bars[0].melody[0].durationTicks,160);});
test('same-count pitch edits retain ID/rest/time; changing note count rejects atomically',()=>{let f=fixture(),s=f.s();assert(f.execute('melody.confirmEventTiming',{attributes:['duration']}).ok);assert(f.execute('melody.insertRest',{onsetTick:720,durationTicks:240}).ok);let before=clone(s.draft.bars[0]);assert(s.runOperation('pitch',p=>C.model.setBarDoremiText(p,1,'ミ')).ok);let b=s.draft.bars[0];assert.equal(b.melody[0].id,before.melody[0].id);assert.equal(b.melody[0].onsetTick,240);assert.equal(b.melody[0].durationTicks,180);assert.deepEqual(clone(b.melody[1]),before.melody[1]);let unchanged=state(f);assert(!s.runOperation('unsafe auto placement',p=>C.model.setBarDoremiText(p,1,'ドレ')).ok);assert.equal(state(f),unchanged);});
test('rejected operation retains existing open text group and Redo boundary',()=>{let f=fixture({maxBytes:30000}),s=f.s();assert(s.runTextOperation('title','title',p=>p.songInfo.title='typing').ok);let before=state(f);assert(!s.runOperation('large',p=>p.extensions={large:'x'.repeat(40000)},{requireUndo:true}).ok);assert.equal(state(f),before);});
test('original backup counts toward payload budget and is never silently discarded',()=>{let p=v1(),raw=' '.repeat(5*1024*1024)+JSON.stringify(p);let result=api.migrate(p,raw);assert(!result.ok);assert.match(result.error,/budget/);assert.equal(p.schemaVersion,1);});
test('legacy source unknown fields, duplicate rhythm IDs and future input fail without mutation',()=>{for(const mutate of [p=>p.unknown={keep:true},p=>p.strumPatterns.push(clone(p.strumPatterns[0])),p=>p.bars[0].melody[0].extra='future',p=>p.strumPatterns[0].slots[0].id='experimental',p=>p.schemaVersion=3]){let p=v1();mutate(p);let raw=JSON.stringify(p);assert(!api.migrate(p,raw).ok);assert.equal(JSON.stringify(p),raw);}});
test('capo/key migration preserves Pre-DTM emitted pitches, onsets and lengths with custom strokes',()=>{vm.runInNewContext(readFileSync(new URL('../js/modules/pre-dtm-cruise/arrangement-engine.js',import.meta.url),'utf8'),f.context);for(const [key,capo] of [['C',0],['B',2],['F',5],['Cb',0],['C#',2],['B#',5]]){let p=v1();p.songInfo.playKey=key;p.songInfo.capo=capo;p.songInfo.originalKey=capo?C.theory.transposeNote(key,capo):key;C.model.setBarStrumSlots(p,1,[{tick:0,action:'down',durationTicks:720},{tick:960,action:'mute',durationTicks:240}]);let result=api.migrate(p,JSON.stringify(p));assert(result.ok,result.error);let a=clone(C.arrangement.generateArrangement(p)),b=clone(C.arrangement.generateArrangement(result.project));assert.deepEqual(b.generatedEvents,a.generatedEvents);}});

// Memory inputs, rather than serialized fixtures, are the subject of these regressions.
const invalidInputs=[
 ['Infinity',p=>p.extensions={n:Infinity}],['-Infinity',p=>p.extensions={n:-Infinity}],['NaN',p=>p.extensions={n:NaN}],
 ['undefined',p=>p.extensions={n:undefined}],['optional undefined',p=>p.bars[0].chords[0].durationTicks=undefined],
 ['fractional tick',p=>p.bars[0].melody[0].onsetTick=.5],['negative tick',p=>p.bars[0].melody[0].onsetTick=-1],
 ['zero duration',p=>p.bars[0].melody[0].durationTicks=0],['negative duration',p=>p.bars[0].melody[0].durationTicks=-1],
 ['fractional duration',p=>p.bars[0].melody[0].durationTicks=180.5],['fractional octave',p=>p.bars[0].melody[0].pitch.octave=4.5],
 ['duplicate event',p=>p.bars[0].melody.push(clone(p.bars[0].melody[0]))],['duplicate bar',p=>p.bars.push(clone(p.bars[0]))],
 ['unknown kind',p=>p.bars[0].melody[0].kind='future'],['future schema',p=>p.schemaVersion=3],
 ['cycle',p=>{p.extensions={};p.extensions.self=p.extensions;}],['huge',p=>p.extensions={text:'x'.repeat(5*1024*1024)}],
 ['array undefined',p=>p.extensions={a:[undefined]}],['sparse array',p=>p.extensions={a:new Array(1)}],
 ['nested number',p=>p.extensions={a:[{b:{n:Infinity}}]}],['toJSON',p=>p.extensions={toJSON(){return null;}}],
 ['accessor',p=>{p.extensions={};Object.defineProperty(p.extensions,'n',{enumerable:true,get(){throw Error('must not invoke getter');}});}],
 ['symbol',p=>p.extensions={[Symbol('hidden')]:1}]
];
for(const [label,mutate] of invalidInputs)test('serialization boundary rejects original '+label+' without storage/notification',async()=>{
 const f=fixture(),s=f.s(),p=clone(s.workingSnapshot());mutate(p);
 const before=state(f),events=[];f.repo.subscribe(e=>events.push(e));
 assert(!C.model.validateProject(p).ok,label);assert(!api.migrate(p).ok,label);
 const result=await f.repo.save({target:s.target,baseRevision:s.baseRevision,snapshot:p});assert(!result.ok,label);
 assert.equal(f.writes(),0);assert.equal(state(f),before);assert.deepEqual(events,[]);
 const ioRealm={window:{CruiseStudio:{model:C.model}},localStorage:f.storage};vm.runInNewContext(readFileSync(new URL('../js/core/storage.js',import.meta.url),'utf8'),ioRealm);
 const io=ioRealm.window.CruiseStudio.storage;assert.throws(()=>io.exportProjectJson(p));assert.equal(io.saveProject(p).ok,false);assert.equal(f.writes(),0);
 // A full invalid replacement is rejected before history, identity or draft publication.
 assert.throws(()=>s.replaceDraft(p));assert.equal(state(f),before);
});
test('staged draft rejects lossy nested assignments and original invalid scalars atomically',()=>{
 for(const mutate of [p=>p.extensions={n:Infinity},p=>p.extensions={n:undefined},p=>p.extensions=[NaN],p=>p.bars[0].melody[0].onsetTick=Infinity,p=>p.bars[0].melody[0].onsetTick=.5,p=>p.bars[0].melody[0].pitch.octave=4.5,p=>p.extensions={toJSON(){return null;}}]){
  const f=fixture(),s=f.s();assert(s.runTextOperation('title','title',p=>p.songInfo.title='typing').ok);let before=state(f);assert(!s.runOperation('invalid',mutate).ok);assert.equal(state(f),before);assert.equal(f.writes(),0);
 }
});
test('direct draft cannot swallow non-JSON values; raw bypass Save validates before snapshot',async()=>{
 const f=fixture(),s=f.s(),before=state(f);assert.throws(()=>s.draft.extensions={nested:[NaN]});assert.equal(state(f),before);
 const bar=Object.getOwnPropertyDescriptor(s.draft,'bars').value[0];assert.throws(()=>bar.melody[0].durationTicks=Infinity,/non-json-number/);assert.equal(state(f),before);
 const invalid=clone(s.workingSnapshot());invalid.bars[0].melody[0].durationTicks=Infinity;
 const result=await f.repo.save({target:s.target,baseRevision:s.baseRevision,snapshot:invalid});assert.equal(result.code,'validation');assert.equal(state(f),before);assert.equal(f.writes(),0);
});
test('absent optional JSON fields remain valid; explicit undefined and malformed command payloads reject',async()=>{
 const f=fixture(),p=clone(f.s().workingSnapshot());delete p.bars[0].chords[0].durationTicks;assert(api.validate(p).ok);assert((await f.repo.save({target:f.s().target,baseRevision:f.s().baseRevision,snapshot:p})).ok);
 for(const bad of [{durationTicks:240,n:Infinity},{durationTicks:240,n:undefined},{durationTicks:240,n:[NaN]}]){const x=fixture(),before=state(x);assert(!x.execute('melody.setDuration',bad).ok);assert.equal(state(x),before);}
});
test('rest duration and exact touching boundary remain non-ripple, undoable and stable',()=>{
 const f=fixture(),s=f.s();assert(f.execute('melody.setKind',{kind:'rest'}).ok);const id=s.draft.bars[0].melody[0].id;
 assert(f.execute('melody.insertRest',{onsetTick:720,durationTicks:240}).ok);assert(f.execute('melody.setDuration',{durationTicks:480}).ok);
 assert.equal(s.draft.bars[0].melody[0].id,id);assert.equal(s.draft.bars[0].melody[0].kind,'rest');assert.equal(s.draft.bars[0].melody[0].onsetTick,240);assert.equal(s.draft.bars[0].melody[1].onsetTick,720);
 const before=state(f);assert(!f.execute('melody.setDuration',{durationTicks:720}).ok);assert.equal(state(f),before);assert(s.undo().ok);assert.equal(s.draft.bars[0].melody[0].durationTicks,180);assert(s.redo().ok);assert.equal(s.draft.bars[0].melody[0].durationTicks,480);
});

test('invalid original memory cannot reach Active Document output or external adoption',()=>{
 const f=fixture(),s=f.s(),before=state(f),bad=clone(s.workingSnapshot());bad.extensions={n:Infinity};assert.equal(s.applyExternalSnapshot({target:s.target,snapshot:bad,revision:'external',source:'test'}),false);assert.equal(state(f),before);
 assert.throws(()=>Object.getOwnPropertyDescriptor(s.draft,'bars').value[0].melody[0].durationTicks=NaN,/non-json-number/);assert.equal(state(f),before);assert.equal(f.owner.capture().ok,true);assert.equal(f.writes(),0);
});

test('bar-only legacy readers refuse canonical bars and explicit v1/v2 projections retain correct solfege',()=>{
 const legacy=v1(),migrated=api.migrate(legacy,JSON.stringify(legacy)).project;
 for(const name of ['getBarDoremiText','getBarLyricsText','barNeedsSixteenthResolution']){
  assert.throws(()=>C.model[name](migrated.bars[0]),/canonical-bar-requires-read-projection/);
  assert.deepEqual(C.model[name](C.model.toLegacyView(migrated).bars[0]),C.model[name](legacy.bars[0]));
 }
 const a=C.model.toLegacyView(migrated).bars[0],b=C.model.toLegacyView(migrated).bars[0];
 assert.notEqual(a,b);assert.equal(a.sourceId,b.sourceId);assert.equal(a.sourceId,migrated.bars[0].id);
 assert(!JSON.stringify(a).includes('sourceId'));
});
test('invalid projection exposes typed validation diagnostics without changing its source',()=>{
 const source=v1(),p=api.migrate(source,JSON.stringify(source)).project;p.songInfo.bpm=-1;const before=JSON.stringify(p);
 assert.throws(()=>api.readProjection(p),e=>e.code==='invalid-project'&&e.diagnostics.includes('invalid-bpm'));
 assert.equal(JSON.stringify(p),before);
});
