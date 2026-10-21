import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fixture,clone,state} from './helpers/chord-form-fixture.mjs';
import {contentKey,basisKey} from '../js/modules/chord/form-snapshot.mjs';
const require=createRequire(import.meta.url),E=require('../js/core/editing-session.js');
const ok=r=>assert(r.ok,JSON.stringify(r));
function adopted(){const f=fixture();ok(f.adopt());return f;}
function binding(f){return f.s().draft.performance.formBindings[0];}
function legacy(f,edit){return f.s().runOperation('legacy',p=>f.api.editLegacy(p,edit));}
function setChord(f,symbol){ok(f.s().runOperation('chord',p=>f.C.model.setBarChord(p,1,symbol)));}
const cases=[['C',0,[1,2,3,4,5],[48,52,55,60,64]],['C/E',0,[1,2,3,4],[52,55,60,64]],['C/G',0,[1,2,3],[55,60,64]],['D/F#',2,[1,2,3,4],[54,57,62,66]],['F',0,[1,2,3,4,5,6],[41,48,53,57,60,65]]];
for(const [symbol,capo,strings,midi]of cases)test('snapshot/repository slash and barre oracle '+symbol,async()=>{
 const f=fixture();ok(f.s().runOperation('fixture',p=>{p.bars[0].chords[0].symbol=symbol;p.instrument.capo=capo;}));
 const before=f.s().workingSnapshot(),raw=JSON.stringify([...f.values]),n=f.s().getHistory().cursor;
 ok(f.adopt({playedStrings:strings}));const p=f.s().workingSnapshot(),m=p.materials.forms[0],b=p.performance.formBindings[0];
 assert.equal(m.encoding,'studio-chord-form-v1');assert.equal(m.provenance.externalMaterialId,null);assert.equal(m.provenance.adapterVersion,'2');assert.equal(m.snapshot.strings.length,6);
 assert.equal(f.s().getHistory().cursor,n+1);assert.equal(JSON.stringify([...f.values]),raw);assert.equal(f.ledger.length,0);
 assert.deepEqual(f.service.evaluate(p,b).soundingMidi,midi);assert(f.service.evaluate(p,b).ready);
 assert.equal(b.chordEventId,before.bars[0].chords[0].id);assert.equal(p.instrument.tuning[0],64);
 for(const x of ['absoluteFret','soundingMidi','pitchClass','formRoot','formBass','contentKey','completeness'])assert(!JSON.stringify(m).includes('"'+x+'"'));
 assert(f.s().undo().ok);assert.deepEqual(f.s().workingSnapshot(),before);ok(f.s().redo());ok(await f.s().commit());
 const loaded=f.repository.read(f.s().target).snapshot;assert.deepEqual(loaded.materials,p.materials);assert.deepEqual(loaded.performance.formBindings,p.performance.formBindings);assert(f.service.evaluate(loaded,loaded.performance.formBindings[0]).ready);assert.equal(loaded.schemaVersion,2);
});
test('one adoption, replacement, removal each one Undo; immutable materials retained',()=>{
 const f=adopted(),first=f.s().workingSnapshot(),h=f.s().getHistory().cursor;
 ok(f.adopt({playedStrings:[2,3,4,5]}));assert.equal(f.s().draft.materials.forms.length,1);assert.equal(f.s().getHistory().cursor,h+1);
 const replaced=f.s().workingSnapshot();ok(f.service.apply(f.service.prepareRemoval(f.request())));assert.equal(f.s().draft.performance.formBindings.length,0);assert.equal(f.s().draft.materials.forms.length,1);
 ok(f.s().undo());assert.deepEqual(f.s().workingSnapshot(),replaced);ok(f.s().undo());assert.deepEqual(f.s().workingSnapshot(),first);ok(f.s().redo());
 ok(f.adopt({generation:{minRelativeFret:0,maxRelativeFret:12}}));assert.equal(f.s().draft.materials.forms.length,2);assert.deepEqual(f.s().draft.materials.forms[0],first.materials.forms[0]);
 const before=state(f);assert(!f.s().runOperation('mutate material',p=>p.materials.forms[0].snapshot.strings[0].relativeFret++).ok);assert.equal(state(f),before);
});
test('local event adoption never affects same-symbol events; content/provenance reuse is exact',()=>{
 const f=fixture();ok(f.s().runOperation('add other C',p=>p.bars[1].chords[0].symbol='C'));
 ok(f.adopt());assert.equal(f.s().draft.performance.formBindings.length,1);const b=f.s().draft.bars[1];ok(f.adopt({barId:b.id,chordEventId:b.chords[0].id}));assert.equal(f.s().draft.materials.forms.length,1);assert.equal(f.s().draft.performance.formBindings.length,2);
 const m=clone(f.s().draft.materials.forms[0]),other=clone(m);other.provenance.ownerVersion='1.21.1';assert.notEqual(contentKey(m),contentKey(other));other.provenance.ownerVersion=m.provenance.ownerVersion;other.provenance.generation.maxRelativeFret--;assert.notEqual(contentKey(m),contentKey(other));
});
const bad=[
 ['encoding',p=>p.materials.forms[0].encoding='future'],['future schema',p=>p.schemaVersion=3],['material ID collision',p=>p.materials.forms[0].id=p.projectId],
 ['duplicate binding',p=>p.performance.formBindings.push({...clone(p.performance.formBindings[0]),id:'other'})],['binding ID collision',p=>p.performance.formBindings[0].id=p.projectId],
 ['missing chord',p=>p.performance.formBindings[0].chordEventId='missing'],['wrong material type',p=>p.performance.formBindings[0].materialId=p.materials.rhythms[0].id],
 ['wrong string',p=>p.performance.formBindings[0].playedStrings=[6]],['duplicate strings',p=>p.performance.formBindings[0].playedStrings=[1,1]],['empty strings',p=>p.performance.formBindings[0].playedStrings=[]],
 ['auto mode',p=>p.performance.formBindings[0].mode='auto'],['bad confirmation',p=>p.performance.formBindings[0].confirmation.status='ready'],['confirmed null key',p=>p.performance.formBindings[0].confirmation.basisKey=null],
 ['unknown string',p=>p.materials.forms[0].snapshot.strings[0].kind='unknown'],['missing string',p=>p.materials.forms[0].snapshot.strings.pop()],['string order',p=>p.materials.forms[0].snapshot.strings.reverse()],
 ['muted fret',p=>p.materials.forms[0].snapshot.strings[5].relativeFret=0],['negative fret',p=>p.materials.forms[0].snapshot.strings[0].relativeFret=-1],['beyond bound',p=>p.materials.forms[0].snapshot.strings[0].relativeFret=25],
 ['capo',p=>p.materials.forms[0].snapshot.capo=12],['alternate tuning',p=>p.materials.forms[0].snapshot.tuningMidi[5]=38],['instrument tuning',p=>p.instrument.tuning=[1,2,3,4,5,6]],
 ['fret bound',p=>p.instrument.maxAbsoluteFret=37],['finger',p=>p.materials.forms[0].snapshot.strings[0].finger=5],['derived value',p=>p.materials.forms[0].snapshot.strings[0].soundingMidi=64],
 ['adapter future',p=>p.materials.forms[0].provenance.adapterVersion='3'],['fake external ID',p=>p.materials.forms[0].provenance.externalMaterialId='fabricated'],['bad generation',p=>p.materials.forms[0].provenance.generation.maxRelativeFret=40],
 ['barre ends',p=>p.materials.forms[0].snapshot.barres=[{finger:1,relativeFret:1,fromString:1,toString:6}]],
 ['NaN',p=>p.materials.forms[0].snapshot.maxAbsoluteFret=NaN],['Infinity',p=>p.instrument.maxAbsoluteFret=Infinity],['cycle',p=>p.materials.forms[0].snapshot.loop=p],
];
for(const [name,patch]of bad)test('invalid form/binding refuses before write: '+name,async()=>{
 const f=adopted(),p=clone(f.s().workingSnapshot());patch(p);const before=state(f),writes=f.ledger.length;assert(!f.api.validate(p).ok);assert(!(await f.repository.save({target:f.s().target,snapshot:p,baseRevision:f.s().baseRevision})).ok);assert.equal(f.ledger.length,writes);assert.equal(state(f),before);
});
for(const hook of ['getter','toJSON','inherited-toJSON'])test('original descriptor rejects '+hook+' without executing',async()=>{
 const f=adopted(),p=clone(f.s().workingSnapshot());let called=0;
 if(hook==='getter')Object.defineProperty(p.materials.forms[0].snapshot,'capo',{get(){called++;return 0;},enumerable:true});
 else if(hook==='toJSON')p.materials.forms[0].toJSON=()=>{called++;return {};};
 else Object.setPrototypeOf(p.materials.forms[0].snapshot,{toJSON(){called++;return {};}});
 assert(!f.api.validate(p).ok);assert(!(await f.repository.save({target:f.s().target,snapshot:p,baseRevision:f.s().baseRevision})).ok);assert.equal(called,0);assert.equal(f.ledger.length,0);
});
test('musical mismatch remains structurally savable; basisKey does not grant readiness',async()=>{
 const f=adopted(),material=clone(f.s().draft.materials.forms),id=binding(f).id;setChord(f,'Dm');const p=f.s().workingSnapshot();assert(f.api.validate(p).ok);assert.deepEqual(p.materials.forms,material);assert.equal(binding(f).id,id);assert(!f.service.evaluate(p,binding(f)).ready);ok(await f.s().commit());assert(!f.service.evaluate(f.repository.read(f.s().target).snapshot,binding(f)).ready);
 const q=clone(p);q.performance.formBindings[0].confirmation.basisKey=basisKey(q,q.bars[0].chords[0],q.materials.forms[0],q.performance.formBindings[0].playedStrings);assert(!f.service.evaluate(q,q.performance.formBindings[0]).ready);
});
for(const change of ['instrument','basis','unconfirmed'])test('readiness independently rejects '+change,()=>{const f=adopted(),p=clone(f.s().workingSnapshot());if(change==='instrument')p.instrument.capo=2;else if(change==='basis')p.performance.formBindings[0].confirmation.basisKey='forged';else p.performance.formBindings[0].confirmation.status='unconfirmed';assert(f.api.validate(p).ok);assert(!f.service.evaluate(p,p.performance.formBindings[0]).ready);assert.equal(p.materials.forms[0].snapshot.capo,0);});
test('legacy leading deletion/addition/reorder and event move preserve persistent chord IDs',()=>{
 const f=adopted(),p=f.s().workingSnapshot(),a=p.bars[0].chords[0].id,target=p.bars[0].id;
 ok(legacy(f,v=>v.bars[0].chords.unshift({tick:480,symbol:'G'})));assert.equal(f.s().draft.bars[0].chords[1].id,a);const added=f.s().draft.bars[0].chords[0].id;assert.notEqual(added,a);
 ok(legacy(f,v=>v.bars[0].chords.shift()));assert.equal(f.s().draft.bars[0].chords[0].id,a);assert.equal(binding(f).chordEventId,a);
 ok(legacy(f,v=>v.bars[0].chords.push({tick:480,symbol:'G'})));const b=f.s().draft.bars[0].chords[1].id;
 ok(legacy(f,v=>v.bars[0].chords.reverse()));assert.deepEqual(f.s().workingSnapshot().bars[0].chords.map(e=>e.id),[b,a]);
 ok(legacy(f,v=>v.bars[1].chords.push(v.bars[0].chords.pop())));assert.equal(binding(f).chordEventId,a);assert(f.s().draft.bars[1].chords.some(e=>e.id===a));
 ok(legacy(f,v=>{v.bars.reverse();f.C.model.normalizeBarOrder(v);}));assert(f.s().draft.bars.some(x=>x.id===target));assert.equal(binding(f).chordEventId,a);
});
test('identical-symbol reorder tracks object identity rather than JSON equality',()=>{
 const f=fixture();ok(legacy(f,v=>v.bars[0].chords.push({...v.bars[0].chords[0]})));const ids=f.s().workingSnapshot().bars[0].chords.map(e=>e.id);ok(legacy(f,v=>v.bars[0].chords.reverse()));assert.deepEqual(f.s().workingSnapshot().bars[0].chords.map(e=>e.id),ids.reverse());
});
test('ambiguous replacement and duplicated object refuse with full state unchanged',()=>{
 const f=adopted();for(const edit of [v=>v.bars[0].chords=[{tick:0,symbol:'Dm'}],v=>v.bars[0].chords.push(v.bars[0].chords[0])]){const before=state(f);assert(!legacy(f,edit).ok);assert.equal(state(f),before);}
});
test('target deletion removes just its binding in one Undo; unused material remains',()=>{
 const f=adopted(),before=f.s().workingSnapshot();ok(legacy(f,v=>v.bars[0].chords.shift()));assert.equal(f.s().draft.performance.formBindings.length,0);assert.equal(f.s().draft.materials.forms.length,1);ok(f.s().undo());assert.deepEqual(f.s().workingSnapshot(),before);
 ok(f.s().runOperation('duplicate bar',p=>f.api.duplicateBar(p,p.bars[0].id)));const p=f.s().workingSnapshot();assert.equal(p.performance.formBindings.length,2);assert.notEqual(p.bars[0].chords[0].id,p.bars[1].chords[0].id);assert.equal(p.performance.formBindings[1].confirmation.status,'unconfirmed');assert.equal(p.materials.forms.length,1);
});
test('section deletion only removes owned targets; Undo restores IDs and bindings',()=>{
 const f=adopted();ok(legacy(f,v=>f.C.model.addSection(v,'B',1)));const before=f.s().workingSnapshot();ok(legacy(f,v=>f.C.model.removeSection(v,v.sections[0].id)));assert.equal(f.s().draft.performance.formBindings.length,0);assert.equal(f.s().draft.materials.forms.length,1);ok(f.s().undo());assert.deepEqual(f.s().workingSnapshot(),before);
});
for(const kind of ['lyric','doremi','display','bpm','section','bar-move'])test('legacy consumer retains forms and exact IDs: '+kind,()=>{
 const f=adopted(),p=f.s().workingSnapshot(),forms=p.materials.forms,binds=p.performance.formBindings;
 ok(legacy(f,v=>{if(kind==='lyric')f.C.model.setBarLyricsText(v,1,'test');if(kind==='doremi')f.C.model.setBarDoremiText(v,1,'ドレミファソラ');if(kind==='display')v.sheetSettings.showLyrics=false;if(kind==='bpm')v.songInfo.bpm=123;if(kind==='section')v.sections[0].name='new';if(kind==='bar-move')v.bars.reverse();}));
 assert.deepEqual(f.s().workingSnapshot().materials.forms,forms);assert.deepEqual(f.s().workingSnapshot().performance.formBindings,binds);
});
test('Pre-DTM and JSON/Print read projection never become a second save source',()=>{
 const f=adopted(),p=f.s().workingSnapshot(),before=state(f);assert(f.C.arrangement.generateArrangement(p));const view=f.C.model.toLegacyView(p);assert.equal(view.sourceSchemaVersion,2);
 vm.runInNewContext(readFileSync(new URL('../js/core/storage.js',import.meta.url),'utf8'),f.realm);const json=f.C.storage.exportProjectJson(p),r=f.C.storage.importProjectJson(json);ok(r);assert.deepEqual(clone(r.project),p);assert.throws(()=>f.C.storage.exportProjectJson(view));assert.equal(state(f),before);assert.equal(f.ledger.length,0);
});
for(const kind of ['input','workspace','undo','redo','code','instrument','raw','otherSession','tampered','A-B-A','save'])test('stale candidate rejected atomically: '+kind,async()=>{
 const f=fixture();ok(f.s().runOperation('edit',p=>p.songInfo.title='dirty'));const handle=f.service.prepare(f.request());ok(handle);
 if(kind==='input')f.s().setInputPending(true);if(kind==='workspace')f.context({workspaceId:'sheetCruise',generation:3});if(kind==='undo')ok(f.s().undo());if(kind==='redo'){ok(f.s().undo());ok(f.s().redo());}if(kind==='code')setChord(f,'Dm');if(kind==='instrument')ok(f.s().runOperation('capo',p=>p.instrument.capo=1));
 if(kind==='raw')f.values.set('cruiseStudio.project.A',JSON.stringify({...f.s().baseSnapshot,updatedAt:'external'}));
 if(kind==='otherSession'||kind==='A-B-A'){const b=clone(f.s().workingSnapshot());b.projectId='B';f.values.set('cruiseStudio.project.B',JSON.stringify(b));f.open('B');if(kind==='A-B-A')f.open('A');}
 if(kind==='save')ok(await f.s().commit());const before=state(f),writes=f.ledger.length;assert(!f.service.apply(kind==='tampered'?{...handle}:handle).ok);assert.equal(state(f),before);assert.equal(f.ledger.length,writes);
});
test('preview, rejection and Undo/Redo have no writes; only explicit Save writes project/index',async()=>{
 const f=fixture(),raw=JSON.stringify([...f.values]);for(const extra of [{instrument:{confirmed:false}}, {playedStrings:[6]}, {instrument:{confirmed:true,tuningMidi:[64,59,55,50,45,38],maxAbsoluteFret:24}}]){assert(!f.service.prepare(f.request(extra)).ok);assert.equal(f.ledger.length,0);assert.equal(JSON.stringify([...f.values]),raw);}
 ok(f.adopt());ok(f.s().undo());ok(f.s().redo());assert.equal(f.ledger.length,0);ok(await f.s().commit());assert.deepEqual(f.ledger.map(x=>x.key),['cruiseStudio.project.A','cruiseStudio.projects.index']);
 const saved=f.s().workingSnapshot();ok(f.s().undo());assert(f.s().dirty);ok(f.s().redo());assert(!f.s().dirty);assert.deepEqual(f.s().workingSnapshot(),saved);
});
test('100-entry adoption boundary preserves all applied history and failure preserves Redo',()=>{
 const f=fixture();for(let i=0;i<99;i++)ok(f.s().runOperation('edit',p=>p.songInfo.title='T'+i));ok(f.adopt());assert.equal(f.s().getHistory().cursor,100);assert.equal(f.s().getHistory().evictedCount,0);
 const h=f.service.prepare(f.request({playedStrings:[2,3,4,5]})),before=state(f);assert.equal(f.service.apply(h).code,'undo-budget');assert.equal(state(f),before);
 ok(f.s().undo());assert(f.s().canRedo());const old=f.s().getHistory();const candidate=f.service.prepare(f.request());ok(f.service.apply(candidate));assert.equal(f.s().getHistory().cursor,100);assert(!f.s().canRedo());assert.equal(f.s().getHistory().evictedCount,old.evictedCount);
});
test('cumulative 8MiB admission refuses without evicting existing Undo or changing state',()=>{
 const seed=fixture(),p=clone(seed.s().workingSnapshot());p.extensions={padding:'x'.repeat(2100000)};const f=fixture({project:p});ok(f.s().runOperation('existing undo',d=>d.songInfo.title='before'));
 assert.equal(f.s().getHistory().limits.maxBytes,8*1024*1024);assert(f.s().getHistory().bytes<8*1024*1024);const before=state(f);assert.equal(f.adopt().code,'undo-budget');assert.equal(state(f),before);assert.equal(f.s().getHistory().evictedCount,0);
});
test('exact entry byte budget accepts equality and rejects one byte less without losing Redo',()=>{
 const f=adopted(),bytes=f.s().getHistory().entries[0].bytes;const exact=fixture({limits:{maxBytes:bytes}});ok(exact.adopt());const less=fixture({limits:{maxBytes:bytes-1}}),before=state(less);assert.equal(less.adopt().code,'undo-budget');assert.equal(state(less),before);
});
for(const mode of ['quota','unknown'])test('Save '+mode+' never claims success and preserves draft/base/history',async()=>{
 const f=adopted(),before=f.s().workingSnapshot(),base=f.s().baseRevision,h=f.s().getHistory();f.mode(mode);const result=await f.s().commit();assert(!result.ok);if(mode==='unknown')assert.equal(result.code,'result-unknown');assert.deepEqual(f.s().workingSnapshot(),before);assert.equal(f.s().baseRevision,base);assert.deepEqual(f.s().getHistory(),h);assert(f.s().dirty);
});
test('raw conflict refuses Save and candidate without silently overriding external data',async()=>{
 const f=adopted(),external=JSON.stringify({...f.s().baseSnapshot,updatedAt:'external'});f.values.set('cruiseStudio.project.A',external);const draft=f.s().workingSnapshot();const r=await f.s().commit();assert.equal(r.code,'conflict');assert.deepEqual(f.s().workingSnapshot(),draft);assert.equal(f.values.get('cruiseStudio.project.A'),external);assert.equal(f.ledger.length,0);assert(f.s().externalUpdatePending);
});
test('old 0.41.0 schema rejects nonempty form data, existing empty forms/tuning null migrate unchanged',()=>{
 const f=fixture(),old=JSON.stringify(f.s().workingSnapshot());assert.equal(f.s().draft.instrument.tuning,null);assert.equal(f.s().draft.materials.forms.length,0);assert.equal(JSON.stringify(f.api.migrate(f.s().workingSnapshot()).project),old);ok(f.adopt());
 const prior=require('node:child_process').execFileSync('git',['show','7a8f8c1d0ba8aab6e9a94f7c064f89c20c59fb41:apps/cruise-studio/js/core/schema2.js'],{encoding:'utf8'});const sandbox={module:{exports:{}}};vm.runInNewContext(prior,sandbox);const oldApi=sandbox.module.exports.create({theory:f.C.theory,spelling:f.realm.window.ChordCruise.theory,legacy:{validateProject:f.oldValidator}});assert(!oldApi.validate(f.s().workingSnapshot()).ok);assert.equal(f.s().draft.provenance.legacySource.raw,JSON.stringify(f.legacy));
});
test('explicit bar-wide chord replacement remains usable without bindings; bound ambiguity refuses',()=>{
 const f=fixture();ok(legacy(f,v=>v.bars[0].chords.push({tick:480,symbol:'G'})));ok(legacy(f,v=>f.C.model.setBarChord(v,1,'Dm')));assert.equal(f.s().draft.bars[0].chords.length,1);assert.equal(f.s().draft.bars[0].chords[0].symbol,'Dm');
 const g=adopted();ok(legacy(g,v=>v.bars[0].chords.push({tick:480,symbol:'G'})));const before=state(g);assert(!legacy(g,v=>g.C.model.setBarChord(v,1,'Dm')).ok);assert.equal(state(g),before);
});
test('final saved metadata cannot exceed project budget after forms have passed original validation',async()=>{
 const f=adopted(),p=clone(f.s().workingSnapshot());p.appVersion='x';p.updatedAt='x';p.extensions={padding:''};const room=4*1024*1024-JSON.stringify(p).length;p.extensions.padding='x'.repeat(room);assert(f.api.validate(p).ok);const before=state(f);assert(!(await f.repository.save({target:f.s().target,snapshot:p,baseRevision:f.s().baseRevision})).ok);assert.equal(f.ledger.length,0);assert.equal(state(f),before);
});
for(const symbol of ['C6','Am6','Cadd9'])test('unresolved owner material is never adopted: '+symbol,()=>{const f=fixture();setChord(f,symbol);const before=state(f);assert(!f.service.prepare(f.request()).ok);assert.equal(state(f),before);assert.equal(f.ledger.length,0);});
test('readiness binding getter is rejected without executing caller hooks',()=>{const f=adopted();let called=0;const b={get id(){called++;return binding(f).id;}};assert(!f.service.evaluate(f.s().workingSnapshot(),b).ready);assert.equal(called,0);});
test('untrusted owner version and material ID collision refuse without publication',async()=>{
 const {createFormAdoptionService}=await import('../js/modules/chord/form-adoption.mjs');const f=fixture(),options={owner:f.owner,schema:f.api,adapter:f.adapter,repository:f.repository,getContext:()=>({workspaceId:'sheetCruise',generation:1}),...f.deps};
 const wrong=createFormAdoptionService({...options,ownerVersion:'1.21.1'}),before=state(f);assert(!wrong.prepare(f.request()).ok);assert.equal(state(f),before);
 const collide=createFormAdoptionService({...options,schema:{...f.api,newId:()=>f.s().target.projectId}});assert(!collide.apply(collide.prepare(f.request())).ok);assert.equal(state(f),before);assert.equal(f.ledger.length,0);
});
test('failed cumulative budget preserves an open native text group and Redo',()=>{
 const f=fixture({limits:{maxEntries:1}});ok(f.s().runTextOperation('title','title',p=>p.songInfo.title='changed'));const before=state(f);assert(f.s().getHistory().textGroup);assert.equal(f.adopt().code,'undo-budget');assert.equal(state(f),before);
});

test('content comparison preserves independent history and detached operation ownership',()=>{
 const f=adopted(),s=f.s(),before=s.workingSnapshot(),n=s.getHistory().cursor;
 const begun=s.beginOperation('duration');ok(begun);const draft=begun.operation.draft;
 draft.bars[0].melody[0].durationTicks=240;ok(s.commitOperation(begun.operation));
 const after=s.workingSnapshot();assert.equal(s.getHistory().cursor,n+1);
 const stable=state(f);assert.throws(()=>draft.songInfo.title='late detached edit',/detached-draft-reference/);assert.equal(state(f),stable);assert.deepEqual(s.workingSnapshot(),after);
 ok(s.undo());assert.deepEqual(s.workingSnapshot(),before);ok(s.redo());assert.deepEqual(s.workingSnapshot(),after);assert.equal(f.ledger.length,0);
});
test('content comparison rejects reflective live material drift before mutation and preserves staged edit ownership',async()=>{
 const f=adopted(),s=f.s(),original=s.workingSnapshot(),begun=s.beginOperation('staged title');ok(begun);begun.operation.draft.songInfo.title='must not publish';
 const stable=state(f),material=s.draft.materials.forms[0];
 assert.throws(()=>Object.defineProperty(material.provenance,'ownerVersion',{value:'1.21.1',enumerable:true,writable:true,configurable:true}),/draft-reflection-write/);
 assert.equal(state(f),stable);assert.equal(s.getHistory().openGroup,begun.operation.operationId);assert.notEqual(s.draft.songInfo.title,'must not publish');assert.equal(f.ledger.length,0);
 ok(s.cancelOperation(begun.operation));assert.equal(s.getHistory().openGroup,null);assert.throws(()=>begun.operation.draft.songInfo.title='late',/detached-draft/);
 ok(s.runOperation('recovery',p=>p.songInfo.title='recovered'));const after=s.workingSnapshot();ok(s.undo());assert.deepEqual(s.workingSnapshot(),original);ok(s.redo());assert.deepEqual(s.workingSnapshot(),after);assert.equal(f.ledger.length,0);
 ok(await s.commit());assert.equal(s.dirty,false);assert.equal(f.ledger.length,2);assert.deepEqual(f.repository.read(s.target).snapshot.materials,original.materials);
});
for(const hook of ['getter','inherited-toJSON','NaN'])test('content comparison retains original input defense: '+hook,()=>{
 const f=adopted(),s=f.s(),original=s.workingSnapshot(),begun=s.beginOperation('staged title');ok(begun);begun.operation.draft.songInfo.title='must not publish';
 const target=s.draft.materials.forms[0].snapshot,stable=state(f);let calls=0;
 const inject=o=>{
  if(hook==='getter')Object.defineProperty(o,'capo',{get(){calls++;return 0;},enumerable:true,configurable:true});
  else if(hook==='inherited-toJSON')Object.setPrototypeOf(o,{toJSON(){calls++;return {};}});
  else Object.defineProperty(o,'capo',{value:NaN,enumerable:true,configurable:true,writable:true});
 };
 assert.throws(()=>inject(target),hook==='inherited-toJSON'?/draft-prototype-write/:/draft-reflection-write/);
 assert.equal(calls,0);assert.equal(state(f),stable);assert.equal(s.getHistory().openGroup,begun.operation.operationId);
 // External caller data remains untrusted: early Proxy refusal must not replace
 // the independent descriptor/JSON validation of inputs entering the Session.
 const invalid=clone(target);inject(invalid);assert.throws(()=>s.draft.extensions=invalid);assert.equal(calls,0);assert.equal(state(f),stable);
 ok(s.cancelOperation(begun.operation));assert.equal(s.getHistory().openGroup,null);assert.deepEqual(s.workingSnapshot(),original);
 ok(s.runOperation('valid after refusal',p=>p.songInfo.artist='Recovery'));const after=s.workingSnapshot();ok(s.undo());assert.deepEqual(s.workingSnapshot(),original);ok(s.redo());assert.deepEqual(s.workingSnapshot(),after);assert.equal(f.ledger.length,0);
});
test('content comparison ignores metadata and object key order without normalizing content',()=>{
 const f=adopted(),s=f.s(),begun=s.beginOperation('title');ok(begun);begun.operation.draft.songInfo.title='accepted';
 const stable=state(f),material=s.draft.materials.forms[0],ordered=clone(material.provenance),reversed=Object.fromEntries(Object.entries(ordered).reverse()),key=contentKey(clone(material));
 assert.throws(()=>Object.defineProperty(s.draft,'updatedAt',{value:'2026-10-17T00:00:00.000Z',enumerable:true,writable:true,configurable:true}),/draft-reflection-write/);
 assert.throws(()=>Object.defineProperty(material,'provenance',{value:reversed,enumerable:true,writable:true,configurable:true}),/draft-reflection-write/);assert.equal(state(f),stable);
 // Ordinary writes stay available and tracked, including semantically identical
 // material replacement. The pending handle still becomes stale after a write.
 const history=s.getHistory(),version=s.snapshotVersion,base=s.baseSnapshot,revision=s.baseRevision;
 s.draft.updatedAt='2026-10-17T00:00:00.000Z';material.provenance=reversed;
 assert.notEqual(s.snapshotVersion,version);assert.deepEqual(s.getHistory(),history);assert.equal(contentKey(clone(s.draft.materials.forms[0])),key);
 assert.deepEqual(Object.keys(s.draft.materials.forms[0].provenance),Object.keys(reversed));assert.equal(s.baseSnapshot,base);assert.equal(s.baseRevision,revision);
 assert.equal(s.commitOperation(begun.operation).code,'stale-operation');ok(s.cancelOperation(begun.operation));
 const before=s.workingSnapshot();ok(s.runOperation('fresh title',p=>p.songInfo.title='accepted'));const after=s.workingSnapshot();assert.equal(s.draft.songInfo.title,'accepted');ok(s.undo());assert.deepEqual(s.workingSnapshot(),before);ok(s.redo());assert.deepEqual(s.workingSnapshot(),after);assert.equal(f.ledger.length,0);
});

test('owned history exact UTF-8 sizes survive Unicode edits, text merging and Redo branching',()=>{
 const f=adopted(),s=f.s();
 const exact=()=>{const h=s.getHistory();for(const e of h.entries)assert.equal(e.bytes,Buffer.byteLength(JSON.stringify(e.before),'utf8')+Buffer.byteLength(JSON.stringify(e.after),'utf8'));assert.equal(h.bytes,h.entries.reduce((n,e)=>n+e.bytes,0));};
 for(const title of ['漢🙂','e\u0301\n"\\','\ud800','\udc00','𠮷🎸']){ok(s.runTextOperation('title','Unicode',p=>p.songInfo.title=title));exact();}
 s.finishTextGroup();ok(s.runOperation('branch source',p=>p.songInfo.artist='山田'));exact();ok(s.undo());exact();ok(s.runOperation('new branch',p=>p.songInfo.artist='𠮷'));assert(!s.canRedo());exact();ok(s.undo());exact();ok(s.redo());exact();
 assert(Object.isFrozen(s.getHistory().entries[0].after.materials.forms[0].snapshot.strings[0]));assert.equal(f.ledger.length,0);
});
test('Unicode history byte equality accepts exact budget and refuses one byte below atomically',()=>{
 const seed=fixture(),project=clone(seed.s().workingSnapshot());project.songInfo.title='漢🙂\ud800';
 const measured=fixture({project});ok(measured.adopt());const bytes=measured.s().getHistory().entries[0].bytes;
 const equal=fixture({project,limits:{maxBytes:bytes}});ok(equal.adopt());
 const below=fixture({project,limits:{maxBytes:bytes-1}}),before=state(below);assert.equal(below.adopt().code,'undo-budget');assert.equal(state(below),before);
});
test('history content sizing preserves complete independent content including extensions',()=>{
 const f=adopted(),s=f.s();const data={nested:['保存🙂',{text:'\ud800'}]};ok(s.runOperation('extension',p=>p.extensions=clone(data)));
 const content=s.getHistory().entries.at(-1).after,bytes=Buffer.byteLength(JSON.stringify(content),'utf8');assert(bytes>0);assert.deepEqual(content.extensions,data);data.nested[1].text='caller mutation';assert.notEqual(content.extensions.nested[1].text,data.nested[1].text);
 assert.throws(()=>{content.extensions.nested[0]='history mutation';},TypeError);ok(s.undo());assert(!s.draft.extensions);ok(s.redo());assert.equal(s.draft.extensions.nested[0],'保存🙂');assert.equal(f.ledger.length,0);
});

// P2-01: material identity ignores object insertion order, never raw revisions.
function reverseKeys(value){
 if(Array.isArray(value))return value.map(reverseKeys);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverseKeys(v)]));
 return value;
}
for(const part of ['snapshot','nested','provenance','export-import'])test('P2-01 legitimate Save after key reorder: '+part,async()=>{
 const f=adopted();ok(await f.s().commit());const original=f.s().workingSnapshot(),p=clone(original),m=p.materials.forms[0];
 if(part==='snapshot')m.snapshot=Object.fromEntries(Object.entries(m.snapshot).reverse());
 if(part==='nested')m.snapshot.strings=m.snapshot.strings.map(reverseKeys);
 if(part==='provenance')m.provenance=reverseKeys(m.provenance);
 if(part==='export-import')p.materials.forms=reverseKeys(p.materials.forms);
 p.songInfo.title='imported title';
 vm.runInNewContext(readFileSync(new URL('../js/core/storage.js',import.meta.url),'utf8'),f.realm);
 const imported=f.C.storage.importProjectJson(f.C.storage.exportProjectJson(p));ok(imported);
 const writes=f.ledger.length,r=await f.repository.save({target:f.s().target,snapshot:imported.project,baseRevision:f.s().baseRevision});ok(r);
 assert.deepEqual(f.ledger.slice(writes).map(x=>x.key),['cruiseStudio.project.A','cruiseStudio.projects.index']);
 const loaded=f.repository.read(f.s().target);ok(loaded);assert.deepEqual(clone(loaded.snapshot.materials),original.materials);assert.deepEqual(clone(loaded.snapshot.performance.formBindings),original.performance.formBindings);assert.equal(loaded.snapshot.songInfo.title,'imported title');
});
const materialChanges=[
 ['fret',m=>m.snapshot.strings[0].relativeFret=1],['finger',m=>m.snapshot.strings[0].finger=4],
 ['capo',m=>m.snapshot.capo=1],['tuning',m=>m.snapshot.tuningMidi[0]=65],
 ['ownerVersion',m=>m.provenance.ownerVersion='1.21.1'],['adapterVersion',m=>m.provenance.adapterVersion='3'],
 ['provenance',m=>m.provenance.sourceSymbol='Dm'],['generation',m=>m.provenance.generation.maxRelativeFret=12],
 ['array order',m=>m.snapshot.strings.reverse()],['missing field',m=>delete m.snapshot.ownerWarning],
 ['additional field',m=>m.snapshot.extra=true],['nested field',m=>m.snapshot.strings[0].extra=true]
];
for(const [name,change]of materialChanges)test('P2-01 same-ID substantive change refused atomically: '+name,async()=>{
 const f=adopted();ok(await f.s().commit());ok(f.s().runOperation('pending edit',p=>p.songInfo.title='keep draft'));ok(f.s().undo());
 const p=clone(f.s().workingSnapshot());change(p.materials.forms[0]);const before=state(f),writes=f.ledger.length;
 const r=await f.repository.save({target:f.s().target,snapshot:p,baseRevision:f.s().baseRevision});assert(!r.ok);assert(['validation','protected-form-material'].includes(r.code),JSON.stringify(r));assert.equal(state(f),before);assert.equal(f.ledger.length,writes);assert(f.s().canRedo());
});
test('P2-01 raw key reorder is still a conflict, legacy raw remains protected',async()=>{
 const f=adopted();ok(await f.s().commit());const p=clone(f.s().workingSnapshot()),base=f.s().baseRevision;
 const external=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(base)).reverse()));assert.notEqual(external,base);f.values.set('cruiseStudio.project.A',external);
 let before=state(f),writes=f.ledger.length,r=await f.repository.save({target:f.s().target,snapshot:p,baseRevision:base});assert.equal(r.code,'conflict');assert.equal(state(f),before);assert.equal(f.ledger.length,writes);
 p.provenance.legacySource.raw=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(p.provenance.legacySource.raw)).reverse()));
 before=state(f);r=await f.repository.save({target:f.s().target,snapshot:p,baseRevision:external});assert.equal(r.code,'protected-legacy-source');assert.equal(state(f),before);assert.equal(f.ledger.length,writes);
});

// P2-02: exhaust every required form/binding record field, not just capo.
function formRecords(p){const m=p.materials.forms[0],b=p.performance.formBindings[0];return [
 ['material',m],['snapshot',m.snapshot],['provenance',m.provenance],['generation',m.provenance.generation],
 ['binding',b],['confirmation',b.confirmation],...m.snapshot.strings.map((s,i)=>['string'+i,s])
 ];}
const requiredCases=formRecords(adopted().s().workingSnapshot()).flatMap(([record,value])=>Object.keys(value).map(key=>[record,key]));
for(const [record,key]of requiredCases)test('P2-02 required own enumerable data: '+record+'.'+key,async()=>{
 const f=adopted(),before=state(f);
 for(const kind of ['inherited','missing','non-enumerable']){
  const p=clone(f.s().workingSnapshot()),value=formRecords(p).find(([name])=>name===record)[1],old=value[key];delete value[key];
  if(kind==='inherited')Object.setPrototypeOf(value,{[key]:old});
  if(kind==='non-enumerable')Object.defineProperty(value,key,{value:old,enumerable:false});
  assert(!f.api.validate(p).ok,kind);const migrated=f.api.migrate(p);assert(!migrated.ok,kind);assert.equal(migrated.project,null);
  const r=await f.repository.save({target:f.s().target,snapshot:p,baseRevision:f.s().baseRevision});assert(!r.ok,kind);assert.equal(r.code,'validation');assert.equal(f.ledger.length,0);assert.equal(state(f),before);
 }
});
for(const kind of ['getter','inherited getter','toJSON','inherited toJSON','NaN','Infinity','cycle','Date','class instance','null-root class instance'])test('P2-02 invalid original remains rejected with hooks zero: '+kind,async()=>{
 const f=adopted(),p=clone(f.s().workingSnapshot()),m=p.materials.forms[0];let calls=0;
 if(kind==='getter')Object.defineProperty(m.snapshot,'capo',{get(){calls++;return 0;},enumerable:true});
 if(kind==='inherited getter'){delete m.snapshot.capo;Object.setPrototypeOf(m.snapshot,{get capo(){calls++;return 0;}});}
 if(kind==='toJSON')m.snapshot.toJSON=()=>{calls++;return {};};
 if(kind==='inherited toJSON')Object.setPrototypeOf(m.snapshot,{toJSON(){calls++;return {};}});
 if(kind==='NaN'||kind==='Infinity')m.snapshot.capo=kind==='NaN'?NaN:Infinity;
 if(kind==='cycle')m.snapshot.cycle=m.snapshot;
 if(kind==='Date')m.snapshot=new Date();
 if(kind==='class instance')m.snapshot=Object.assign(new(class Snapshot {})(),m.snapshot);
 if(kind==='null-root class instance'){class Snapshot extends null {constructor(){return Object.create(new.target.prototype);}}m.snapshot=Object.assign(new Snapshot(),m.snapshot);}
 const before=state(f);assert(!f.api.validate(p).ok);assert(!f.api.migrate(p).ok);assert(!(await f.repository.save({target:f.s().target,snapshot:p,baseRevision:f.s().baseRevision})).ok);assert.equal(calls,0);assert.equal(state(f),before);assert.equal(f.ledger.length,0);
});
for(const kind of ['JSON','cross-realm','null-prototype'])test('P2-02 valid data migration and Save/Load: '+kind,async()=>{
 const f=adopted();let p=clone(f.s().workingSnapshot());
 if(kind==='cross-realm')p=vm.runInNewContext('JSON.parse(raw)',{raw:JSON.stringify(p)});
 if(kind==='null-prototype'){const nullData=x=>Array.isArray(x)?x.map(nullData):x&&typeof x==='object'?Object.assign(Object.create(null),Object.fromEntries(Object.entries(x).map(([k,v])=>[k,nullData(v)]))):x;p=nullData(p);}
 ok(f.api.validate(p));const r=f.api.migrate(p);ok(r);ok(f.api.validate(r.project));assert.deepEqual(clone(r.project),clone(p));ok(await f.repository.save({target:f.s().target,snapshot:p,baseRevision:f.s().baseRevision}));ok(f.api.validate(f.repository.read(f.s().target).snapshot));
 const legacy=f.api.migrate(f.legacy,JSON.stringify(f.legacy));ok(legacy);ok(f.api.validate(legacy.project));
});

test('P2-01 ordered barre arrays and substantive barre claims remain immutable',async()=>{
 const f=fixture();ok(f.s().runOperation('F',p=>p.bars[0].chords[0].symbol='F'));ok(f.adopt({playedStrings:[1,2,3,4,5,6]}));
 // Both claims satisfy schema; their sequence is still material content.
 const seed=clone(f.s().workingSnapshot());seed.materials.forms[0].snapshot.barres.push({...seed.materials.forms[0].snapshot.barres[0],toString:2});
 ok(f.api.validate(seed));ok(await f.repository.save({target:f.s().target,snapshot:seed,baseRevision:f.s().baseRevision}));const base=f.repository.read(f.s().target).revision;
 for(const change of [m=>m.snapshot.barres.reverse(),m=>m.snapshot.barres[0].toString=2]){
  const p=clone(seed);change(p.materials.forms[0]);const writes=f.ledger.length,before=state(f);assert(!(await f.repository.save({target:f.s().target,snapshot:p,baseRevision:base})).ok);assert.equal(state(f),before);assert.equal(f.ledger.length,writes);
 }
 for(const key of Object.keys(seed.materials.forms[0].snapshot.barres[0])){
  const p=clone(seed),b=p.materials.forms[0].snapshot.barres[0],v=b[key];delete b[key];Object.setPrototypeOf(b,{[key]:v});assert(!f.api.validate(p).ok);assert(!f.api.migrate(p).ok);const writes=f.ledger.length;assert(!(await f.repository.save({target:f.s().target,snapshot:p,baseRevision:base})).ok);assert.equal(f.ledger.length,writes);
 }
});
