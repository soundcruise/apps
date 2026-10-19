import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import {createRequire}from'node:module';import vm from'node:vm';import{webcrypto}from'node:crypto';
const require=createRequire(import.meta.url),RS=require('../js/core/rhythm-snapshot.js'),E=require('../js/core/editing-session.js'),R=require('../js/core/project-repository.js'),CMM=require('../js/core/common-music-model.js'),clone=x=>JSON.parse(JSON.stringify(x)),materials=JSON.parse(readFileSync(new URL('fixtures/rhythm-snapshots-v1.json',import.meta.url))).materials;
function setup(){const realm={window:{CruiseStudio:{},ChordCruise:{},crypto:webcrypto},TextEncoder};for(const f of['core/music-theory.js','core/song-model.js'])vm.runInNewContext(readFileSync(new URL('../js/'+f,import.meta.url),'utf8'),realm);vm.runInNewContext(readFileSync(new URL('../../chord-cruise/js/core/music-theory.js',import.meta.url),'utf8'),realm);const C=realm.window.CruiseStudio;C.schema2=require('../js/core/schema2.js');C.rhythmSnapshots=RS;C.model.configureSchema2();for(const f of['modules/pre-dtm-cruise/arrangement-engine.js','modules/pre-dtm-cruise/midi-export.js'])vm.runInNewContext(readFileSync(new URL('../js/'+f,import.meta.url),'utf8'),realm);const p=clone(C.model.createSampleProject());p.materials.rhythms.push(...clone(materials));p.performance.basicRhythmId=materials[0].id;return{C,p,realm,m:C.model,a:C.model.schema2};}
const rhythmState=p=>JSON.stringify({materials:p.materials.rhythms,basic:p.performance.basicRhythmId,bindings:p.performance.barRhythms});
for(const name of['title','chord','lyrics','canonical melody','section name','display'])test('unrelated '+name+' edit preserves native/legacy materials and references',()=>{const{m,p,a}=setup(),before=rhythmState(p);if(name==='title')a.editLegacy(p,v=>v.songInfo.title='Changed',{kind:'song',field:'title',barIds:[]});if(name==='chord')m.setBarChord(p,1,'G');if(name==='lyrics')m.setBarLyricsText(p,1,'歌詞');if(name==='canonical melody')p.bars[0].melody[0].durationTicks=120;if(name==='section name')m.renameSection(p,p.sections[0].id,'Verse');if(name==='display')a.editLegacy(p,v=>v.sheetSettings.showLyrics=false,{kind:'display',barIds:[]});assert(m.validateProject(p).ok);assert.equal(rhythmState(p),before);});
test('generic exporter refuses even unused rich; purpose reader is typed and never invents slots',()=>{const{p,m,a}=setup();assert.throws(()=>m.toLegacyView(p),/unsupported-legacy-rhythm/);const v=a.readStructureProjection(p);assert.equal(v.purpose,'structure-read');assert.equal(v.schemaVersion,'structure-projection');assert(!('slots'in v.basicRhythm));assert.equal(v.basicRhythm.projection.ppq,480);assert.equal(m.getBasicStrumSlots(p).ok,false);assert.equal(m.getBarEffectiveStrumSlots(p,1).ok,false);});
test('rich old stroke edits reject, explicit reset inherits; legacy override remains locally editable',()=>{const{p,m,a}=setup(),before=JSON.stringify(p);assert.throws(()=>m.setBasicStrumText(p,'↓'),/unsupported-rhythm-edit/);assert.throws(()=>m.setBasicStrumText(p,''),/unsupported-rhythm-edit/);assert.throws(()=>m.setBarStrumText(p,1,'↓'),/unsupported-rhythm-edit/);assert.equal(JSON.stringify(p),before);const old=p.materials.rhythms.find(m=>m.encoding==='studio-strum-v1');p.performance.barRhythms.push({id:'test-binding',barId:p.bars[0].id,materialId:old.id});m.setBarStrumText(p,1,'↓↑');assert.equal(p.performance.basicRhythmId,materials[0].id);assert.deepEqual(p.materials.rhythms.find(m=>m.id===materials[0].id),materials[0]);a.editLegacy(p,v=>{v.bars[0].strumOverride=null;},{kind:'resetStrum',barIds:[p.bars[0].id]});assert(!p.performance.barRhythms.some(x=>x.barId===p.bars[0].id));assert(p.materials.rhythms.some(m=>m.id===materials[0].id));});
test('stable bar move/duplicate/delete keep materials; duplicate binding IDs and events are fresh',()=>{const{p,m,a}=setup();const old=rhythmState(p),id=p.bars[0].id;p.performance.barRhythms.push({id:'source-binding',barId:id,materialId:materials[1].id});const newId=a.duplicateBar(p,id),b=p.performance.barRhythms.find(x=>x.barId===newId);assert.notEqual(newId,id);assert.notEqual(b.id,'source-binding');assert.equal(b.materialId,materials[1].id);const materialJSON=JSON.stringify(p.materials.rhythms);a.editLegacy(p,v=>{const b=v.bars.shift();v.bars.push(b);m.normalizeBarOrder(v);},{kind:'normalizeBarOrder',barIds:[]});assert(p.bars.some(b=>b.id===id));assert(p.performance.barRhythms.some(b=>b.barId===id&&b.id==='source-binding'));m.setSectionBarCount(p,p.sections[0].id,1);assert(p.performance.barRhythms.every(b=>p.bars.some(x=>x.id===b.barId)));assert.equal(JSON.stringify(p.materials.rhythms),materialJSON);assert(m.validateProject(p).ok);});
test('intent omissions/escalation, duplicate private bar mapping reject atomically',()=>{const{p,a}=setup();for(const [edit,intent]of[[v=>v.songInfo.title='Bad',undefined],[v=>v.strumPatterns[0].name='Illicit change',{kind:'song',field:'title',barIds:[]}],[v=>v.bars.push(v.bars[0]),{kind:'addSection',barIds:[]}],[v=>v.songInfo.artist='bad',{kind:'song',field:'title',barIds:[]}],[v=>v.bars[1].chords[0].symbol+='7',{kind:'chord',barIds:[p.bars[0].id]}]]){const before=JSON.stringify(p);assert.throws(()=>a.editLegacy(p,edit,intent),undefined,JSON.stringify(intent));assert.equal(JSON.stringify(p),before);}});
test('Session and Repository both reject same-ID native snapshot/provenance/encoding edits, key order is content-neutral',async()=>{const{p,m}=setup(),values=new Map([['cruiseStudio.project.'+p.projectId,JSON.stringify(p)]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},repo=R.createRepository({storage,model:m,snapshot:E.snapshot,locks:{request:(_n,_o,f)=>f()},now:()=>p.updatedAt}),reg=E.createRegistry({repository:repo,validate:m.validateProject}),s=reg.getOrCreateSession('structure',{type:'project',projectId:p.projectId});reg.activateSession(s);for(const patch of[m=>m.snapshot.name='Changed',m=>m.provenance.source.ownerAppVersion='9.0.0',m=>{const old=p.materials.rhythms[0];m.encoding=old.encoding;m.snapshot={name:'Legacy replacement',lengthTicks:1920,slots:[]};m.provenance={origin:'user-set',legacyId:'new-alias'};}]){const before=JSON.stringify({d:s.workingSnapshot(),h:s.getHistory(),raw:[...values]});const r=s.runOperation('invalid',d=>patch(d.materials.rhythms.find(m=>m.id===materials[0].id)),{requireUndo:true});assert(!r.ok);assert.equal(JSON.stringify({d:s.workingSnapshot(),h:s.getHistory(),raw:[...values]}),before);const q=clone(p);patch(q.materials.rhythms.find(m=>m.id===materials[0].id));const out=await repo.save({target:s.target,baseRevision:s.baseRevision,snapshot:q});assert.equal(out.code,'protected-rhythm-material');assert.equal(JSON.stringify({d:s.workingSnapshot(),h:s.getHistory(),raw:[...values]}),before);}
 const r=s.runOperation('key order',d=>{const i=d.materials.rhythms.findIndex(m=>m.id===materials[0].id);d.materials.rhythms[i]=Object.fromEntries(Object.entries(d.materials.rhythms[i]).reverse());});assert(r.ok);assert((await s.commit()).ok);
});
test('CMM keeps exact melody/rest/gap with local guitar unsupported; Pre-DTM rejects even disabled guitar; unused rich allows old output',()=>{const{p,m,a,C,realm}=setup();const before=JSON.stringify(p),converter=CMM.createConverter({schema2:a,studioTheory:C.theory,chordTheory:realm.window.ChordCruise.theory,validate:m.validateProject}),r=converter.convert({source:'working',project:p,sessionId:'s',version:'v',baseRevision:null,token:{projectId:p.projectId,sessionId:'s',generation:1}});assert(r.ok,JSON.stringify(r));assert.equal(r.model.measures[0].voices.guitar.status,'unsupported-legacy-rhythm');assert.equal(r.model.measures[0].voices.melody.events[0].sourceEventId,p.bars[0].melody[0].id);assert.equal(C.arrangement.generateArrangement(p,{parts:{guitar:false}}).ok,false);assert.equal(JSON.stringify(p),before);p.performance.basicRhythmId=p.materials.rhythms[0].id;assert(C.arrangement.generateArrangement(p).ok);assert.throws(()=>m.toLegacyView(p));});
test('repeated legacy stroke copy-on-write retains an independently shared old material',()=>{const{p,m}=setup(),bar=p.bars[0];const legacy=p.materials.rhythms.find(m=>m.encoding==='studio-strum-v1');p.performance.barRhythms.push({id:'copy-binding-1',barId:bar.id,materialId:legacy.id});m.setBarStrumText(p,1,'↓↑');const current=p.performance.barRhythms.find(b=>b.barId===bar.id).materialId;const original=clone(p.materials.rhythms.find(m=>m.id===current));p.performance.barRhythms.push({id:'copy-binding-2',barId:p.bars[1].id,materialId:current});m.setBarStrumText(p,1,'↑↓');assert.equal(p.performance.barRhythms.find(b=>b.barId===p.bars[1].id).materialId,current);assert.deepEqual(p.materials.rhythms.find(m=>m.id===current),original);assert.notEqual(p.performance.barRhythms.find(b=>b.barId===bar.id).materialId,current);m.setBarStrumText(p,1,'↓↑↓');assert(m.validateProject(p).ok);});
test('editing a legacy bar shared with basic changes only its binding; legacy basic still displays after repeated COW',()=>{const{p,m}=setup(),legacy=p.materials.rhythms.find(m=>m.encoding==='studio-strum-v1');p.performance.barRhythms.push({id:'basic-shared-binding',barId:p.bars[0].id,materialId:legacy.id});m.setBarStrumText(p,1,'↓↑');const id=p.performance.barRhythms[0].materialId;p.performance.basicRhythmId=id;const material=clone(p.materials.rhythms.find(m=>m.id===id));m.setBarStrumText(p,1,'↑↓');assert.equal(p.performance.basicRhythmId,id);assert.deepEqual(p.materials.rhythms.find(m=>m.id===id),material);m.setBasicStrumText(p,'↓↑↓');assert.equal(m.getBasicStrumText(p),'↓↑ ↓・ ・・ ・・');m.setBasicStrumText(p,'↑↓↑');assert.equal(m.getBasicStrumText(p),'↑↓ ↑・ ・・ ・・');assert(m.validateProject(p).ok);});

// R5 recovery: independent adversarial callbacks at the bridge, not UI-only guards.
const Operations=require('../js/modules/sheet-cruise/operation-adapter.js');
function renameFixture(){
 const {p,m,a}=setup();m.addSection(p,'Second',2);const other=clone(p);other.projectId='rename-project-B';
 const values=new Map([p,other].map(x=>['cruiseStudio.project.'+x.projectId,JSON.stringify(x)]));let writes=0;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes++;values.set(k,v);},removeItem:k=>{writes++;values.delete(k);}};
 const repo=R.createRepository({storage,model:m,snapshot:E.snapshot,locks:{request:(_n,_o,f)=>f()}});
 const reg=E.createRegistry({repository:repo,validate:m.validateProject});let session;
 const open=id=>{session=reg.getOrCreateSession('structure',{type:'project',projectId:id});reg.activateSession(session);return session;};open(p.projectId);
 const op=Operations.create({model:m,getSession:()=>session});
 return {p,m,a,op,open,s:()=>session,otherId:other.projectId,state:()=>JSON.stringify({draft:session.workingSnapshot(),history:session.getHistory(),version:session.snapshotVersion,dirty:session.dirty,base:session.baseSnapshot,revision:session.baseRevision,values:[...values],writes})};
}
for(const [name,mutate] of [
 ['other name',v=>{v.sections[1].name='Wrong';}],
 ['target plus other name',v=>{v.sections[0].name='Right';v.sections[1].name='Wrong';}],
 ['section ID',v=>{v.sections[0].id='replacement';}],
 ['section order',v=>{v.sections.reverse();}],
 ['other section content',v=>{v.sections[1].extra='forbidden';}],
 ['bar chord',v=>{v.bars[0].chords[0].symbol='G7';}],
 ['bar lyrics',v=>{v.bars[0].lyrics.push({tick:0,text:'injected'});}],
 ['bar melody',v=>{v.bars[0].melody[0].durationTicks=120;}],
 ['rhythm material',v=>{v.strumPatterns[0].name='forbidden';}],
 ['canonical rhythm injection',v=>{v.materials={rhythms:[]};}],
 ['form material injection',v=>{v.materials={forms:[]};}],
 ['performance injection',v=>{v.performance={};}],
 ['notation injection',v=>{v.notation={};}],
 ['instrument injection',v=>{v.instrument={capo:2};}],
 ['provenance injection',v=>{v.provenance={};}],
 ['delete top field',v=>{delete v.arrangement;}],
 ['getter',v=>{Object.defineProperty(v.sections[0],'name',{enumerable:true,get(){throw Error('must not invoke');}});}],
])test('rename intent rejects '+name+' and preserves Project/history/repository',()=>{
 const f=renameFixture(),s=f.s(),before=f.state();
 const result=s.runOperation('rename',d=>f.a.editLegacy(d,mutate,{kind:'renameSection',sectionId:d.sections[0].id,barIds:[]}),{requireUndo:true});
 assert.equal(result.ok,false,name);assert.equal(f.state(),before,name);
});
test('stable target rename changes only name and Undo/Redo, rejection preserves redo',()=>{
 const f=renameFixture(),s=f.s(),before=clone(s.workingSnapshot()),id=before.sections[0].id;
 assert(f.op.execute('renameSection',{sectionId:id,name:'Correct'},Operations.capture(s)).ok);
 const expected=clone(before);expected.sections[0].name='Correct';assert.deepEqual(clone(s.workingSnapshot()),expected);
 assert.equal(s.getHistory().entries.length,1);assert(s.undo().ok);assert.deepEqual(clone(s.workingSnapshot()),before);
 const state=f.state();assert.equal(s.runOperation('bad',d=>f.a.editLegacy(d,v=>{v.sections[1].name='Wrong';},{kind:'renameSection',sectionId:id}),{requireUndo:true}).ok,false);assert.equal(f.state(),state);
 assert(s.redo().ok);assert.deepEqual(clone(s.workingSnapshot()),expected);
});
test('rename old frames reject after target deletion, A/B switch and Undo',()=>{
 for(const cause of ['delete','switch','undo']){
  const f=renameFixture(),s=f.s(),frame=Operations.capture(s),sectionId=s.draft.sections[1].id;
  if(cause==='delete')assert(f.op.execute('removeSection',{sectionId}).ok);
  if(cause==='switch')f.open(f.otherId);
  if(cause==='undo'){assert(f.op.execute('renameSection',{sectionId,name:'New'}).ok);assert(s.undo().ok);}
  const before=f.state();assert.equal(f.op.execute('renameSection',{sectionId,name:'stale'},frame).code,'stale-target');assert.equal(f.state(),before);
 }
});
test('bridge rejects missing or deleted stable section ID before callback',()=>{
 const f=renameFixture(),p=clone(f.p);for(const sectionId of [undefined,'deleted-section']){let invoked=false;const before=JSON.stringify(p);assert.throws(()=>f.a.editLegacy(p,()=>{invoked=true;},{kind:'renameSection',...(sectionId?{sectionId}:{})}),/stale-section-target/);assert.equal(invoked,false);assert.equal(JSON.stringify(p),before);}
});

import {fixture as chordFixture} from './helpers/chord-form-fixture.mjs';
function materialProject(){const {p,m}=setup(),f=chordFixture();assert(f.adopt().ok);p.materials.forms.push(clone(f.s().workingSnapshot().materials.forms[0]));assert(m.validateProject(p).ok);return {p,m};}
const materialPatches=[
 ['pattern',p=>p.materials.rhythms[1].snapshot.patternId+='-wrong'],
 ['cell',p=>p.materials.rhythms[1].snapshot.cells[0].type='rest'],
 ['tick',p=>p.materials.rhythms[1].snapshot.cells[0].tick=1],
 ['direction',p=>p.materials.rhythms[1].snapshot.cells[0].direction='up'],
 ['provenance',p=>p.materials.rhythms[1].provenance.source.ownerAppVersion='9.0.0'],
 ['snapshot',p=>p.materials.rhythms[1].snapshot=clone(materials[1].snapshot)],
 ['form',p=>p.materials.forms[0].snapshot.strings[0].relativeFret=2],
 ['form provenance',p=>p.materials.forms[0].provenance.ownerVersion='9.0.0'],
 ['array replacement',p=>{p.materials.rhythms=clone(p.materials.rhythms);p.materials.rhythms[1].snapshot.name='Changed';}],
];
for(const [name,patch]of materialPatches)test('read-only snapshot reuse checks actual mutable content: '+name,()=>{
 const {p}=materialProject(),old=E.snapshot(p),original=JSON.stringify(old);patch(p);
 const next=E.snapshot(p);assert.deepEqual(clone(next),clone(p));assert.equal(JSON.stringify(old),original);
 assert.notEqual(JSON.stringify(next.materials),JSON.stringify(old.materials));
});
test('snapshot ownership: no caller freeze trust, no A/B identity alias, exact history bytes',()=>{
 const {p,m}=materialProject(),a=E.snapshot(p),b=E.snapshot(p);assert.equal(a.materials.rhythms[1],b.materials.rhythms[1]);assert.notEqual(a.materials.rhythms,b.materials.rhythms);
 Object.freeze(p.materials.rhythms[1]);p.materials.rhythms[1].snapshot.name='Changed nested';const c=E.snapshot(p);assert.equal(c.materials.rhythms[1].snapshot.name,'Changed nested');assert.notEqual(c.materials.rhythms[1],a.materials.rhythms[1]);
 const q=clone(p);q.projectId='separate';q.materials.rhythms[1].snapshot.name='Other project';assert.equal(E.snapshot(q).materials.rhythms[1].snapshot.name,'Other project');assert.equal(c.materials.rhythms[1].snapshot.name,'Changed nested');
 const f=renameFixture(),s=f.s();for(const title of ['🙂漢字','e\u0301','\ud800']){assert(s.runOperation('title',d=>d.songInfo.title=title).ok);for(const entry of s.getHistory().entries)assert.equal(entry.bytes,Buffer.byteLength(JSON.stringify(entry.before))+Buffer.byteLength(JSON.stringify(entry.after)));}
 assert(s.undo().ok);assert(s.redo().ok);assert(m.validateProject(p).ok);
});
test('warm material snapshot never reads hooks or accepts nonfinite input',()=>{
 for(const hook of ['getter','toJSON','NaN']){const {p}=materialProject();E.snapshot(p);let calls=0;const material=p.materials.rhythms[1];
  if(hook==='getter')Object.defineProperty(material.snapshot.cells[0],'tick',{enumerable:true,get(){calls++;return 0;}});
  if(hook==='toJSON')Object.setPrototypeOf(material.snapshot,{toJSON(){calls++;return {};}});
  if(hook==='NaN')material.snapshot.cells[0].tick=NaN;
  assert.throws(()=>E.snapshot(p));assert.equal(calls,0);
 }
});
for(const [name,patch]of materialPatches)test('same-ID material mutation stays atomic at Session and Repository: '+name,async()=>{
 const {p,m}=materialProject(),values=new Map([['cruiseStudio.project.'+p.projectId,JSON.stringify(p)]]);let writes=0;
 const repo=R.createRepository({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes++;values.set(k,v);},removeItem:k=>{writes++;values.delete(k);}},model:m,snapshot:E.snapshot,now:()=>p.updatedAt,locks:{request:(_n,_o,fn)=>fn()}});
 const reg=E.createRegistry({repository:repo,validate:m.validateProject}),s=reg.getOrCreateSession('structure',{type:'project',projectId:p.projectId});reg.activateSession(s);
 assert(s.runOperation('warm snapshots',d=>d.songInfo.title='Warm').ok);const saved=await s.commit();assert(saved.ok,JSON.stringify(saved));assert(s.undo().ok);assert(s.redo().ok);
 const state=()=>JSON.stringify({d:s.workingSnapshot(),h:s.getHistory(),base:s.baseSnapshot,rev:s.baseRevision,version:s.snapshotVersion,raw:[...values],writes}),before=state();
 assert.equal(s.runOperation('bad material',patch,{requireUndo:true}).ok,false);assert.equal(state(),before);
 const changed=clone(s.workingSnapshot());patch(changed);assert.equal((await repo.save({target:s.target,snapshot:changed,baseRevision:s.baseRevision})).ok,false);assert.equal(state(),before);
});

// Phase 2: cleanup is a targeted legacy operation, not unreferenced-material GC.
function cleanupFixture(configure=()=>{}) {
 const {p,m,a}=setup();p.performance.basicRhythmId=p.materials.rhythms[0].id;
 m.setBarStrumText(p,1,'↓↑');const materialId=p.performance.barRhythms[0].materialId;
 configure(p,materialId,m,a);const values=new Map([['cruiseStudio.project.'+p.projectId,JSON.stringify(p)]]);let writes=0;
 const repo=R.createRepository({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes++;values.set(k,v);},removeItem:k=>{writes++;values.delete(k);}},model:m,snapshot:E.snapshot,now:()=>p.updatedAt,locks:{request:(_n,_o,fn)=>fn()}});
 const reg=E.createRegistry({repository:repo,validate:m.validateProject}),s=reg.getOrCreateSession('structure',{type:'project',projectId:p.projectId});reg.activateSession(s);
 const op=Operations.create({model:m,getSession:()=>s});return {p,m,a,s,repo,materialId,values,reset:()=>op.execute('resetStrum',{barNumber:1},Operations.capture(s)),state:()=>JSON.stringify({p:s.workingSnapshot(),h:s.getHistory(),v:s.snapshotVersion,base:s.baseSnapshot,rev:s.baseRevision,raw:[...values],writes})};
}
for(const kind of ['single','other bar','basic','multiple bars','mixed native','identical different ID','chord forms','unrelated unused'])test('legacy cleanup ownership: '+kind,()=>{
 let protectedId;
 const f=cleanupFixture((p,id,m)=>{
  if(kind==='other bar'||kind==='multiple bars')for(let n=1;n<=(kind==='other bar'?1:3);n++)p.performance.barRhythms.push({id:'shared-binding-'+n,barId:p.bars[n].id,materialId:id});
  if(kind==='basic')p.performance.basicRhythmId=id;
  if(kind==='mixed native')p.performance.barRhythms.push({id:'native-binding',barId:p.bars[1].id,materialId:materials[0].id});
  if(kind==='identical different ID'||kind==='unrelated unused'){
   const other=clone(p.materials.rhythms.find(x=>x.id===id));other.id='unrelated-material';other.provenance.legacyId='strum_bar_unused';other.snapshot.slots.forEach((s,i)=>s.id='unused-slot-'+i);p.materials.rhythms.push(other);protectedId=other.id;
  }
  if(kind==='chord forms'){const c=chordFixture();assert(c.adopt().ok);p.materials.forms.push(clone(c.s().workingSnapshot().materials.forms[0]));}
  assert(m.validateProject(p).ok);
 });
 const before=clone(f.s.workingSnapshot()),result=f.reset();assert(result.ok,JSON.stringify(result));const after=clone(f.s.workingSnapshot());
 const retained=['other bar','basic','multiple bars'].includes(kind),expected=clone(before);
 expected.performance.barRhythms=expected.performance.barRhythms.filter(b=>b.barId!==expected.bars[0].id);
 if(!retained)expected.materials.rhythms=expected.materials.rhythms.filter(m=>m.id!==f.materialId);
 assert.deepEqual(after,expected);assert.equal(after.materials.rhythms.some(m=>m.id===f.materialId),retained);
 if(protectedId)assert.deepEqual(after.materials.rhythms.find(m=>m.id===protectedId),before.materials.rhythms.find(m=>m.id===protectedId));
 assert(f.m.validateProject(after).ok);assert.equal(f.s.getHistory().entries.length,1);
});
test('legacy cleanup Undo/Redo/Save/Load/JSON preserve exact materials and references',async()=>{
 const f=cleanupFixture(),before=clone(f.s.workingSnapshot());assert(f.reset().ok);const after=clone(f.s.workingSnapshot());
 assert(f.s.undo().ok);assert.deepEqual(clone(f.s.workingSnapshot()),before);
 assert(f.s.redo().ok);assert.deepEqual(clone(f.s.workingSnapshot()),after);
 assert((await f.s.commit()).ok);const loaded=JSON.parse(f.values.get('cruiseStudio.project.'+f.p.projectId));
 assert.deepEqual(loaded.materials,after.materials);assert.deepEqual(loaded.performance,after.performance);
 const exported=JSON.stringify(loaded,null,2),imported=JSON.parse(exported);assert(f.m.validateProject(imported).ok);assert.deepEqual(imported,loaded);
 const reg=E.createRegistry({repository:f.repo,validate:f.m.validateProject}),fresh=reg.getOrCreateSession('structure',{type:'project',projectId:f.p.projectId});assert.deepEqual(clone(fresh.workingSnapshot()),loaded);
});
test('binding-only clear and native clear retain material; no implicit global cleanup',()=>{
 const f=cleanupFixture(),p=clone(f.p);f.a.editLegacy(p,v=>{v.bars[0].strumOverride=null;},{kind:'resetStrum',barIds:[p.bars[0].id]});assert(p.materials.rhythms.some(m=>m.id===f.materialId));
 const n=cleanupFixture((p)=>{p.performance.barRhythms[0].materialId=materials[0].id;});const before=clone(n.s.workingSnapshot().materials);assert(n.reset().ok);assert.deepEqual(clone(n.s.workingSnapshot().materials),before);
});
for(const [name,patch]of [
 ['duplicate legacy alias',p=>{const other=clone(p.materials.rhythms.at(-1));other.id='duplicate-alias';other.snapshot.slots.forEach((s,i)=>s.id='duplicate-slot-'+i);p.materials.rhythms.push(other);}],
 ['dangling reference',p=>p.performance.barRhythms[0].materialId='absent'],
 ['wrong encoding',p=>p.materials.rhythms[1].encoding='unknown'],
 ['invalid native field',p=>p.materials.rhythms[1].snapshot.cells[0].tick=NaN],
])test('cleanup rejects '+name+' with Project/history/raw atomicity',()=>{
 const f=cleanupFixture(),before=f.state();let callback=false;
 const result=f.s.runOperation('invalid reset',p=>{patch(p);f.a.editLegacy(p,()=>{callback=true;},{kind:'resetStrum',barIds:[p.bars[0].id]});},{requireUndo:true});
 assert.equal(result.ok,false);assert.equal(callback,false);assert.equal(f.state(),before);
});
test('cleanup stable target: another bar intent cannot delete an unrelated managed material',()=>{
 const f=cleanupFixture(),p=clone(f.p),original=clone(p.materials.rhythms);
 assert.throws(()=>f.a.editLegacy(p,v=>f.m.setBarStrumSlots(v,1,[]),{kind:'resetStrum',barIds:[p.bars[1].id]}),/legacy-intent-mismatch/);assert.deepEqual(p.materials.rhythms,original);
});

test('schema-2 detached copy retains JSON semantics, aliases, null prototypes and Unicode',()=>{
 const {p,m}=materialProject(),shared={text:'🙂漢字\ud800',zero:-0,values:[null,true,false,1,'']};
 p.extensions={left:shared,right:shared,nullPrototype:Object.assign(Object.create(null),{value:'own'})};
 Object.defineProperty(p.extensions,'__proto__',{value:{kept:true},enumerable:true,writable:true,configurable:true});
 assert(m.validateProject(p).ok);const expected=JSON.parse(JSON.stringify(p)),actual=E.snapshot(p);assert.deepEqual(clone(actual),expected);
 assert.notEqual(actual.extensions.left,actual.extensions.right);assert.notEqual(actual.extensions.left,shared);assert.equal(Object.hasOwn(actual.extensions,'__proto__'),true);
 shared.text='later mutation';assert.equal(actual.extensions.left.text,'🙂漢字\ud800');assert.equal(Object.is(actual.extensions.left.zero,-0),false);
});
for(const kind of ['own toJSON','inherited toJSON','own getter','inherited getter','nonenumerable','symbol','tag getter','sparse','array property','cycle','undefined','infinity','bigint','date'])test('optimized descriptor walk rejects original unsafe input: '+kind,()=>{
 const {p,m}=materialProject();let calls=0;const x={value:1};p.extensions={x};
 if(kind==='own toJSON')x.toJSON=()=>{calls++;return {};};
 if(kind==='inherited toJSON')Object.setPrototypeOf(x,{toJSON(){calls++;return {};}});
 if(kind==='own getter')Object.defineProperty(x,'value',{enumerable:true,get(){calls++;return 1;}});
 if(kind==='inherited getter')Object.setPrototypeOf(x,Object.defineProperty({},'trap',{get(){calls++;return 1;}}));
 if(kind==='nonenumerable')Object.defineProperty(x,'hidden',{value:1});
 if(kind==='symbol')x[Symbol('hidden')]=1;
 if(kind==='tag getter')Object.defineProperty(x,Symbol.toStringTag,{get(){calls++;return 'Object';}});
 if(kind==='sparse')x.value=[,1];
 if(kind==='array property'){x.value=[];x.value.extra=1;}
 if(kind==='cycle')x.value=x;
 if(kind==='undefined')x.value=undefined;
 if(kind==='infinity')x.value=Infinity;
 if(kind==='bigint')x.value=1n;
 if(kind==='date')x.value=new Date();
 assert.throws(()=>E.snapshot(p));assert.equal(m.validateProject(p).ok,false);assert.equal(calls,0);
});
test('published draft owns its data: retained operation draft and source aliases cannot mutate it',()=>{
 const f=cleanupFixture();let retained;
 assert(f.s.runOperation('own copy',d=>{retained=d;d.songInfo.title='Published';}).ok);
 const before=f.state();assert.throws(()=>retained.songInfo.title='Late',/detached-draft/);const raw=Object.getOwnPropertyDescriptor(retained.materials,'rhythms').value;assert.throws(()=>raw[1].snapshot.name='Late native',/detached-draft/);
 assert.equal(f.state(),before);assert(f.s.undo().ok);assert(f.s.redo().ok);assert.equal(f.s.draft.songInfo.title,'Published');
});
test('JSON-equivalent payload copying never invokes inherited array map overrides',()=>{
 const {p}=setup();let calls=0;const values=[1,2,3];Object.setPrototypeOf(values,Object.assign(Object.create(Array.prototype),{map(){calls++;throw Error('not JSON semantics');}}));p.extensions={values};
 const result=E.snapshot(p);assert.deepEqual(clone(result.extensions.values),[1,2,3]);assert.equal(calls,0);
});

test('history reuse requires full current content; descriptor alias edits cannot resurrect old content',()=>{
 const f=cleanupFixture(),s=f.s;assert(s.runOperation('first',p=>p.songInfo.title='First').ok);const first=s.getHistory().entries[0].after;
 assert(s.runOperation('second',p=>p.songInfo.title='Second').ok);assert.equal(s.getHistory().entries[1].before,first);
 const rawInfo=Object.getOwnPropertyDescriptor(s.draft,'songInfo').value;rawInfo.artist='Descriptor alias change';
 assert.equal(s.workingSnapshot().songInfo.artist,'Descriptor alias change');
 assert.equal(s.getHistory().status,'invalidated');assert(s.runOperation('third',p=>p.songInfo.title='Third').ok);assert.equal(s.getHistory().entries.length,1);assert.notEqual(s.getHistory().entries[0].before,first);
 assert.equal(s.getHistory().entries[0].before.songInfo.artist,'Descriptor alias change');
 assert(s.undo().ok);assert.equal(s.workingSnapshot().songInfo.title,'Second');assert.equal(s.workingSnapshot().songInfo.artist,'Descriptor alias change');assert(s.redo().ok);
});
for(const[name,patch]of [
 ['material mutation',p=>p.materials.rhythms[1].snapshot.name='Live changed'],
 ['same-ID field addition',p=>p.materials.rhythms[1].snapshot.extra=true],
 ['reference replacement',p=>p.performance.barRhythms[0].materialId=materials[1].id],
 ['section array replacement',p=>p.sections=clone(p.sections).reverse()],
 ['bar array replacement',p=>p.bars=clone(p.bars).reverse()],
 ['material array replacement',p=>{p.materials.rhythms=clone(p.materials.rhythms);p.materials.rhythms[1].provenance.source.ownerAppVersion='9.0.0';}],
])test('history-backed working read reflects raw '+name,()=>{
 const f=cleanupFixture(),s=f.s;assert(s.runOperation('warm',p=>p.songInfo.title='Warm').ok);const previous=s.getHistory().entries[0].after;
 // Descriptor references are now tracked; reflective replacement is forbidden.
 const before=f.state(),version=s.snapshotVersion,raw=Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(s.draft)).map(([k,d])=>[k,d.value]));
 if(['material mutation','same-ID field addition','material array replacement'].includes(name)){
  if(name==='material array replacement'){raw.materials.rhythms=clone(raw.materials.rhythms);const stable=f.state();assert.throws(()=>raw.materials.rhythms[1].provenance.source.ownerAppVersion='9.0.0',/protected-material/);assert.equal(f.state(),stable);}
  else {assert.throws(()=>patch(raw),/protected-material/);assert.equal(f.state(),before);}
 }else{
  patch(raw);
  if(name==='reference replacement'){assert.notEqual(s.snapshotVersion,version);assert.equal(s.draft.performance.barRhythms[0].materialId,materials[1].id);}
 }
 const changed=f.state();for(const k of ['sections','bars','materials','performance'])assert.throws(()=>Object.defineProperty(s.draft,k,{value:raw[k],enumerable:true,writable:true,configurable:true}),/draft-reflection-write/);
 assert.equal(f.state(),changed);assert.notEqual(s.workingSnapshot(),previous);
});
test('history reuse after Save uses live metadata; external revisions, A/B and disposal remain separate',async()=>{
 const f=cleanupFixture(),s=f.s;assert(s.runOperation('first',p=>p.songInfo.title='First').ok);assert((await s.commit()).ok);const revision=s.baseRevision;
 assert(s.runOperation('second',p=>p.songInfo.title='Second').ok);assert(s.undo().ok);assert.equal(s.workingSnapshot().updatedAt,s.baseSnapshot.updatedAt);assert.equal(s.baseRevision,revision);assert(s.redo().ok);
 f.values.set('cruiseStudio.project.'+f.p.projectId,revision+' ');const before=f.state();assert.equal((await s.commit()).ok,false);assert.equal(s.workingSnapshot().songInfo.title,'Second');assert.equal(s.baseRevision,revision);assert.equal(s.getHistory().entries.length,2);
 const g=renameFixture(),a=g.s();assert(g.op.execute('renameSection',{sectionId:g.p.sections[0].id,name:'A changed'}).ok);const old=a.workingSnapshot();const b=g.open(g.otherId);assert.equal(b.workingSnapshot().projectId,g.otherId);assert.notEqual(b.workingSnapshot().sections[0].name,'A changed');g.open(g.p.projectId);assert.deepEqual(clone(a.workingSnapshot()),clone(old));assert((await g.open(g.otherId).destroy({discard:true})).ok);assert.deepEqual(clone(a.workingSnapshot()),clone(old));
});
test('history UTF-8 byte accounting stays exact for sparse and dense Unicode boundaries',()=>{
 const f=cleanupFixture(),s=f.s;
 for(const title of ['ASCII','\u007f\u0080\u07ff\u0800\uffff','🙂𐀀漢字e\u0301','\ud800\udc00\ud800x\udc00','漢'.repeat(5000),'🙂'.repeat(5000),'ascii'.repeat(10000)+'漢🙂']){
  assert(s.runOperation('unicode accounting',p=>p.songInfo.title=title).ok);
  const h=s.getHistory();for(const entry of h.entries)assert.equal(entry.bytes,Buffer.byteLength(JSON.stringify(entry.before),'utf8')+Buffer.byteLength(JSON.stringify(entry.after),'utf8'));
  assert.equal(h.bytes,h.entries.reduce((n,e)=>n+e.bytes,0));
 }
});
test('single-pass rebase preserves dirty paths across nested edits, deletion and restoration',()=>{
 const f=cleanupFixture(p=>{p.extensions={a:{b:{c:1}},list:[1,2],empty:{}};}),s=f.s;assert.equal(s.dirty,false);
 for(const change of [p=>p.extensions.a.b.c=2,p=>delete p.extensions.a.b.c,p=>p.extensions.list.push(3),p=>p.extensions.empty=[]]){
  const before=clone(s.workingSnapshot());assert(s.runOperation('nested',change).ok);
  const after=clone(s.workingSnapshot());if(!E.equal(before,after)){assert(s.dirty);assert(s.undo().ok);assert.deepEqual(clone(s.workingSnapshot()),before);assert(s.redo().ok);assert.deepEqual(clone(s.workingSnapshot()),after);}
 }
 while(s.getHistory().cursor)assert(s.undo().ok);assert.equal(s.dirty,false);
});
test('history-backed snapshots retain own restoration source only',()=>{
 const f=cleanupFixture(),s=f.s;assert(s.runOperation('warm',p=>p.songInfo.title='Warm').ok);
 const raw=Object.getOwnPropertyDescriptor(s.draft,'provenance').value;
 const before=f.state();if(Object.hasOwn(raw,'legacySource'))assert.throws(()=>delete raw.legacySource,/Immutable legacy source/);else assert.equal(delete raw.legacySource,true);assert.throws(()=>Object.setPrototypeOf(raw,{legacySource:{text:'inherited data must not be copied'}}),/draft-prototype-write/);assert.equal(f.state(),before);
});

// Phase 3 pre-optimization acceptance. These assertions are fixed before any
// production optimization and exercise real Session/Repository/consumer owners.
const Phase3Owner=require('../js/core/active-document.js'),Phase3Commands=require('../js/core/melody-commands.js'),Phase3Conversion=require('../js/core/structure-conversion.js');
function phase3Fixture(historyLimits){
 const {p,m,a,C,realm}=setup();m.addSection(p,'Second',2);
 const chord=chordFixture();assert(chord.adopt().ok);p.materials.forms.push(clone(chord.s().workingSnapshot().materials.forms[0]));
 const other=clone(p);other.projectId='phase3-B';const values=new Map([p,other].map(v=>['cruiseStudio.project.'+v.projectId,JSON.stringify(v)]));let writes=0;
 const repo=R.createRepository({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes++;values.set(k,v);},removeItem:k=>{writes++;values.delete(k);}},model:m,snapshot:E.snapshot,now:()=>p.updatedAt,locks:{request:(_n,_o,fn)=>fn()}});
 const registry=E.createRegistry({repository:repo,validate:m.validateProject,historyLimits});let owner;
 function open(id){const s=registry.getOrCreateSession('structure',{type:'project',projectId:id});registry.activateSession(s);owner.bind(s);return true;}
 owner=Phase3Owner.createOwner({registry,repository:repo,validate:m.validateProject,snapshot:E.snapshot,openProject:open});open(p.projectId);
 const context={workspaceId:'sheetCruise',generation:1,blocked:false},command=Phase3Commands.create({owner,schema:a,repository:repo,getContext:()=>context});
 const converter=CMM.createConverter({schema2:a,studioTheory:C.theory,chordTheory:realm.window.ChordCruise.theory,validate:m.validateProject});
 const service=Phase3Conversion.createService({owner,repository:repo,model:CMM,converter,getContext:()=>context});
 const s=owner.getSession();
 const capture=()=>command.capture(s.draft.bars[0].id,s.draft.bars[0].melody[0].id);
 const state=()=>JSON.stringify({sessions:registry.listSessions().map(x=>({draft:x.workingSnapshot(),history:x.getHistory(),version:x.snapshotVersion,base:x.baseSnapshot,revision:x.baseRevision,dirty:x.dirty,destroyed:x.destroyed})),raw:[...values],writes});
 return {p,m,a,repo,registry,owner,context,command,service,s,capture,state,open,values,writes:()=>writes};
}
for(const [id,name,patch]of[
 ['A','same Rhythm ID',p=>p.materials.rhythms[1].snapshot.name='Changed'],
 ['B','same Chord ID',p=>p.materials.forms[0].snapshot.strings[0].relativeFret=2],
 ['C','cell',p=>p.materials.rhythms[1].snapshot.cells[0].tick=1],
 ['D','pattern revision',p=>p.materials.rhythms[1].snapshot.patternRevision=2],
 ['E','encoding',p=>p.materials.rhythms[1].encoding='future'],
 ['F','provenance',p=>p.materials.rhythms[1].provenance.source.ownerAppVersion='9.0.0'],
 ['G','wrong-domain reference',p=>p.performance.basicRhythmId=p.materials.forms[0].id],
 ['H','Project ID',p=>p.projectId='changed-project'],
])test('Phase3 '+id+' rejects '+name+' atomically',t=>{
 const f=phase3Fixture(),before=f.state();const result=f.s.runOperation('counterexample '+id,patch,{requireUndo:true});
 t.diagnostic(JSON.stringify({id,ok:result.ok,code:result.code,unchanged:f.state()===before,writes:f.writes()}));
 assert.equal(result.ok,false);assert.equal(f.state(),before);
});
for(const [id,name,patch]of[
 ['I','section ID',v=>v.sections[0].id='wrong-section'],
 ['J','unrelated section',v=>v.sections[1].name='wrong-target'],
 ['K','bar ID',v=>v.bars[0].id='wrong-bar'],
 ['L','unrelated bar',v=>v.bars[1].lyrics.push({tick:0,text:'wrong-target'})],
])test('Phase3 '+id+' rename intent rejects '+name+' atomically',t=>{
 const f=phase3Fixture(),before=f.state(),result=f.s.runOperation('rename',p=>f.a.editLegacy(p,patch,{kind:'renameSection',sectionId:p.sections[0].id,barIds:[]}),{requireUndo:true});
 t.diagnostic(JSON.stringify({id,ok:result.ok,code:result.code,unchanged:f.state()===before,writes:f.writes()}));assert.equal(result.ok,false);assert.equal(f.state(),before);
});
for(const [id,kind]of[['M','undo'],['N','redo'],['O','save'],['P','project'],['Q','external'],['R','destroy'],['S','workspace']])test('Phase3 '+id+' stale consumer and command after '+kind,async t=>{
 const f=phase3Fixture(),s=f.s;
 if(kind==='undo'||kind==='redo'){assert(s.runOperation('title',p=>p.songInfo.title='Changed').ok);if(kind==='redo')assert(s.undo().ok);}
 const frame=f.capture(),rendered=f.service.convert();assert(rendered.ok,JSON.stringify(rendered.diagnostics));assert(f.service.isCurrent(rendered));
 if(kind==='undo')assert(s.undo().ok);
 if(kind==='redo')assert(s.redo().ok);
 if(kind==='save')assert((await s.commit()).ok);
 if(kind==='project')f.open('phase3-B');
 if(kind==='external')f.values.set('cruiseStudio.project.'+f.p.projectId,s.baseRevision+' ');
 if(kind==='destroy')assert((await s.destroy({discard:true})).ok);
 if(kind==='workspace'){f.context.workspaceId='preDtm';f.context.generation++;}
 const before=f.state(),current=f.service.isCurrent(rendered),result=f.command.execute('melody.setDuration',frame,{durationTicks:120});
 t.diagnostic(JSON.stringify({id,current,ok:result.ok,code:result.code,unchanged:f.state()===before,writes:f.writes()}));assert.equal(current,false);assert.equal(result.ok,false);assert.equal(f.state(),before);
});
test('Phase3 T invalid direct mutation is rejected before changing data or version',t=>{
 const f=phase3Fixture(),s=f.s,rendered=f.service.convert();assert(rendered.ok);
 const version=s.snapshotVersion,raw=Object.getOwnPropertyDescriptor(s.draft,'bars').value,before=f.state();
 assert.throws(()=>raw[0].melody[0].durationTicks=NaN,/non-json-number/);
 assert.equal(f.state(),before);assert.equal(s.snapshotVersion,version);assert.equal(f.service.isCurrent(rendered),true);
 assert(f.service.convert().ok);assert.equal(f.writes(),0);
 t.diagnostic(JSON.stringify({id:'T-invalid',rejectedBeforeMutation:true,unchanged:true,versionUnchanged:true,current:true,writes:0}));
});
test('Phase3 T valid unnotified direct mutation rejects stale command and consumer',t=>{
 const f=phase3Fixture(),s=f.s,rendered=f.service.convert(),frame=f.capture();assert(rendered.ok);
 const version=s.snapshotVersion,raw=Object.getOwnPropertyDescriptor(s.draft,'bars').value,oldDuration=raw[0].melody[0].durationTicks;
 raw[0].melody[0].durationTicks=oldDuration===240?120:240;assert(f.m.validateProject(s.workingSnapshot()).ok);
 const before=f.state(),versionUnchanged=s.snapshotVersion===version,current=f.service.isCurrent(rendered),result=f.command.execute('melody.setDuration',frame,{durationTicks:180});
 t.diagnostic(JSON.stringify({id:'T-valid',versionUnchanged,current,ok:result.ok,code:result.code,unchanged:f.state()===before,historyEntries:s.getHistory().entries.length,writes:f.writes()}));
 assert.equal(versionUnchanged,false);assert.equal(current,false,'changed raw content must invalidate previous result');assert.equal(result.ok,false,'previously captured command must not edit changed raw content');assert.equal(f.state(),before);
});
test('Phase3 U Project limit rejection retains all state',t=>{
 const f=phase3Fixture(),before=f.state(),result=f.s.runOperation('oversize',p=>p.extensions={padding:'x'.repeat(4*1024*1024)},{requireUndo:true});
 t.diagnostic(JSON.stringify({id:'U',ok:result.ok,code:result.code,unchanged:f.state()===before}));assert.equal(result.ok,false);assert.match(result.error,/budget/);assert.equal(f.state(),before);
});
test('Phase3 V History limit rejects normal valid edit before publication',t=>{
 const f=phase3Fixture({maxBytes:100}),before=f.state(),result=f.command.execute('melody.setDuration',f.capture(),{durationTicks:120});
 t.diagnostic(JSON.stringify({id:'V',ok:result.ok,code:result.code,unchanged:f.state()===before}));assert.equal(result.code,'undo-budget');assert.equal(f.state(),before);
});
test('Phase3 W cleanup remains exact and reversible',()=>{
 const f=cleanupFixture(),before=clone(f.s.workingSnapshot()),expected=clone(before);expected.performance.barRhythms=expected.performance.barRhythms.filter(x=>x.barId!==before.bars[0].id);expected.materials.rhythms=expected.materials.rhythms.filter(x=>x.id!==f.materialId);
 assert(f.reset().ok);assert.deepEqual(clone(f.s.workingSnapshot()),expected);assert(f.s.undo().ok);assert.deepEqual(clone(f.s.workingSnapshot()),before);assert(f.s.redo().ok);assert.deepEqual(clone(f.s.workingSnapshot()),expected);
});
test('Phase3 X target plus unrelated rename remains atomic',()=>{
 const f=phase3Fixture(),before=f.state(),result=f.s.runOperation('rename',p=>f.a.editLegacy(p,v=>{v.sections[0].name='Allowed';v.sections[1].name='Forbidden';},{kind:'renameSection',sectionId:p.sections[0].id,barIds:[]}),{requireUndo:true});assert.equal(result.ok,false);assert.equal(f.state(),before);
});
test('Phase3 Y normal Melody edit preserves materials and full Undo/Redo',()=>{
 const f=phase3Fixture(),before=clone(f.s.workingSnapshot()),result=f.command.execute('melody.setDuration',f.capture(),{durationTicks:120});assert(result.ok);
 const after=clone(f.s.workingSnapshot());assert.equal(after.bars[0].melody[0].durationTicks,120);assert.deepEqual(after.materials,before.materials);assert.deepEqual(after.performance,before.performance);assert.equal(f.s.getHistory().entries.length,1);
 assert(f.s.undo().ok);assert.deepEqual(clone(f.s.workingSnapshot()),before);assert(f.s.redo().ok);assert.deepEqual(clone(f.s.workingSnapshot()),after);assert.equal(f.writes(),0);
});
test('Phase3 G control: explicit valid reference replacement is legal in generic Session',()=>{
 const f=phase3Fixture(),before=clone(f.s.workingSnapshot().materials);assert(f.s.runOperation('explicit replacement',p=>p.performance.basicRhythmId=materials[1].id,{requireUndo:true}).ok);assert.deepEqual(clone(f.s.workingSnapshot().materials),before);assert.equal(f.writes(),0);
});

// Phase 4 ownership contract: read reflection tracks; write reflection rejects
// before mutation. Caller input remains untrusted, even if it is frozen.
for(const [name,access]of[
 ['nested object',s=>Object.getOwnPropertyDescriptor(s.draft,'songInfo').value],
 ['all descriptors',s=>Object.getOwnPropertyDescriptors(s.draft).songInfo.value],
 ['Reflect descriptor',s=>Reflect.getOwnPropertyDescriptor(s.draft,'songInfo').value],
 ['Object.values',s=>Object.values(s.draft)[Object.keys(s.draft).indexOf('songInfo')]],
 ['Object.entries',s=>Object.entries(s.draft).find(([k])=>k==='songInfo')[1]],
])test('Phase4 tracked reflection '+name,()=>{
 const f=phase3Fixture(),version=f.s.snapshotVersion,rendered=f.service.convert(),frame=f.capture(),info=access(f.s);assert(rendered.ok);
 info.artist='Descriptor edit';assert.equal(f.s.draft.songInfo.artist,'Descriptor edit');assert.notEqual(f.s.snapshotVersion,version);assert.equal(f.service.isCurrent(rendered),false);
 const before=f.state();assert.equal(f.command.execute('melody.delete',frame).ok,false);assert.equal(f.state(),before);assert.equal(f.writes(),0);
});
for(const [name,change]of[
 ['Object.defineProperty',o=>Object.defineProperty(o,'title',{value:'bad'})],
 ['Reflect.defineProperty',o=>Reflect.defineProperty(o,'title',{value:'bad'})],
 ['Object.defineProperties',o=>Object.defineProperties(o,{title:{value:'bad'},artist:{value:'bad'}})],
 ['accessor',o=>Object.defineProperty(o,'title',{get(){throw Error('getter executed');}})],
 ['nonconfigurable object',o=>Object.defineProperty(o,'nested',{value:{bad:true},configurable:false,writable:false})],
 ['Object.setPrototypeOf',o=>Object.setPrototypeOf(o,{bad:true})],
 ['Reflect.setPrototypeOf',o=>Reflect.setPrototypeOf(o,null)],
 ['Object.preventExtensions',o=>Object.preventExtensions(o)],
 ['Reflect.preventExtensions',o=>Reflect.preventExtensions(o)],
 ['Object.freeze',o=>Object.freeze(o)],
 ['Object.seal',o=>Object.seal(o)],
])test('Phase4 rejects reflective mutation '+name+' before changing data/version',()=>{
 const f=phase3Fixture(),before=f.state();for(const o of [f.s.draft,f.s.draft.songInfo,f.s.draft.bars]){assert.throws(()=>change(o),/draft-(reflection-write|prototype-write|prevent-extensions)/);assert.equal(Object.isExtensible(o),true);assert.equal(f.state(),before);}assert.equal(f.writes(),0);
});
test('Phase4 descriptors obey array length and mutable data invariants',()=>{
 const f=phase3Fixture(),bars=Object.getOwnPropertyDescriptor(f.s.draft,'bars').value,length=Object.getOwnPropertyDescriptor(bars,'length'),item=Object.getOwnPropertyDescriptor(bars,'0');
 assert.deepEqual(length,{value:bars.length,writable:true,enumerable:false,configurable:false});assert.equal(item.configurable,true);assert.equal(item.writable,true);assert.equal(item.value,bars[0]);
 const n=Object.getOwnPropertyDescriptor(bars[0],'melody').value[0],v=f.s.snapshotVersion;n.durationTicks=120;assert.notEqual(f.s.snapshotVersion,v);assert.equal(f.s.draft.bars[0].melody[0].durationTicks,120);
 const before=f.state();assert.throws(()=>Object.defineProperty(bars,'length',{writable:false}),/draft-reflection-write/);assert.equal(f.state(),before);
});
test('Phase4 normal assignment/delete/array methods and JSON remain tracked',()=>{
 const f=phase3Fixture(),s=f.s;const external={obj:{n:1},list:[1,2,3]};s.draft.extensions=external;external.obj.n=999;external.list.push(9);assert.equal(s.draft.extensions.obj.n,1);assert.deepEqual(clone(s.draft.extensions.list),[1,2,3]);
 for(const change of [d=>d.obj.n=2,d=>Reflect.set(d.obj,'n',3),d=>delete d.obj.n,d=>d.list.push(4),d=>d.list.pop(),d=>d.list.unshift(0),d=>d.list.shift(),d=>d.list.splice(1,1,8,9),d=>d.list.reverse(),d=>d.list.sort(),d=>d.list[0]=7,d=>d.list.length=1]){
  const v=s.snapshotVersion;change(s.draft.extensions);assert.notEqual(s.snapshotVersion,v);assert.deepEqual(JSON.parse(JSON.stringify(s.draft)),clone(s.workingSnapshot()));
 }
 assert.equal(f.writes(),0);
});
test('Phase4 retained references reject after replacement, publication, Undo/Redo and destroy',async()=>{
 const f=phase3Fixture(),s=f.s,info=s.draft.songInfo;s.draft.songInfo={...s.draft.songInfo,title:'Replacement'};let before=f.state();assert.throws(()=>info.title='stale',/detached-draft/);assert.equal(f.state(),before);
 let stage;assert(s.runOperation('publish',p=>{stage=p;p.songInfo.title='Published';}).ok);before=f.state();assert.throws(()=>stage.songInfo.title='stale',/detached-draft/);assert.equal(f.state(),before);
 const current=s.draft;assert(s.undo().ok);assert(s.redo().ok);before=f.state();assert.throws(()=>current.songInfo.title='stale',/detached-draft/);assert.equal(f.state(),before);
 const last=s.draft;assert((await s.destroy({discard:true})).ok);const frozen=s.workingSnapshot();assert.throws(()=>Object.getOwnPropertyDescriptor(last,'songInfo').value.title='stale',/detached-draft/);assert.deepEqual(s.workingSnapshot(),frozen);assert.equal(f.writes(),0);
});
test('Phase4 source prototype data cannot be mutated through an inherited draft path',()=>{
 const f=phase3Fixture(),before=f.state();assert.throws(()=>f.s.draft.__proto__.phase4Leak=1,/detached-draft/);assert.equal(Object.prototype.phase4Leak,undefined);assert.equal(f.state(),before);
 f.s.draft.extensions=JSON.parse('{"__proto__":{"kept":true}}');const d=f.s.draft.extensions;d.__proto__={safe:true};assert.equal(Object.getPrototypeOf(d),Object.prototype);assert.deepEqual(clone(d),JSON.parse('{"__proto__":{"safe":true}}'));
});
for(const kind of ['Rhythm snapshot','Rhythm provenance','Rhythm revision','Rhythm tick','Rhythm direction','Rhythm encoding','Chord snapshot','Chord provenance'])test('Phase4 descriptor mutation protects '+kind+' in live and staged draft',()=>{
 const f=phase3Fixture(),patch=d=>{const mat=Object.getOwnPropertyDescriptor(d,'materials').value;
  if(kind==='Rhythm snapshot')mat.rhythms[1].snapshot.name='Bad';
  if(kind==='Rhythm provenance')mat.rhythms[1].provenance.source.ownerAppVersion='9.0.0';
  if(kind==='Rhythm revision')mat.rhythms[1].snapshot.patternRevision=2;
  if(kind==='Rhythm tick')mat.rhythms[1].snapshot.cells[0].tick=1;
  if(kind==='Rhythm direction')mat.rhythms[1].snapshot.cells[0].direction='up';
  if(kind==='Rhythm encoding')mat.rhythms[1].encoding='future';
  if(kind==='Chord snapshot')mat.forms[0].snapshot.strings[0].relativeFret=2;
  if(kind==='Chord provenance')mat.forms[0].provenance.ownerVersion='9.0.0';
 };
 const before=f.state();assert.throws(()=>patch(f.s.draft),/protected-material/);assert.equal(f.state(),before);
 assert.equal(f.s.runOperation('bad descriptor',patch,{requireUndo:true}).ok,false);assert.equal(f.state(),before);assert.equal(f.writes(),0);
});
test('Phase4 getter/toJSON assignment and reflection reject without invoking hooks',()=>{
 const f=phase3Fixture(),before=f.state();let calls=0;
 for(const bad of [Object.defineProperty({},'n',{enumerable:true,get(){calls++;return 1;}}),{toJSON(){calls++;return {};}}])assert.throws(()=>f.s.draft.extensions=bad);
 assert.throws(()=>Object.defineProperty(f.s.draft.songInfo,'title',{get(){calls++;return 'bad';}}),/draft-reflection-write/);assert.equal(calls,0);assert.equal(f.state(),before);
});
test('Phase4 stale Structure and ActiveDocument frame after descriptor mutation',()=>{
 const f=phase3Fixture(),op=Operations.create({model:f.m,getSession:()=>f.owner.getSession()}),frame=Operations.capture(f.s),output=f.owner.capture();assert(output.ok);
 Object.getOwnPropertyDescriptor(f.s.draft,'songInfo').value.artist='Tracked';const before=f.state();assert.equal(f.owner.isCurrent(output),false);
 assert.equal(op.execute('renameSection',{sectionId:f.s.draft.sections[0].id,name:'stale'},frame).code,'stale-target');assert.equal(f.state(),before);
});
import {createRhythmAdoptionService as phase4RhythmService} from '../js/modules/rhythm/pattern-adoption.mjs';
test('Phase4 stale Rhythm reuse candidate after descriptor mutation',()=>{
 const f=phase3Fixture(),service=phase4RhythmService({owner:f.owner,schema:f.a,rhythmSnapshots:RS,repository:f.repo,getContext:()=>f.context});
 const h=service.prepareReuse({materialId:materials[1].id,target:{kind:'basic'}});assert(h.ok);Object.getOwnPropertyDescriptor(f.s.draft,'songInfo').value.artist='Tracked';
 const before=f.state();assert.equal(service.apply(h).ok,false);assert.equal(f.state(),before);assert.equal(f.writes(),0);
});
test('Phase4 stale Chord candidate after descriptor mutation',()=>{
 const f=chordFixture(),h=f.service.prepare(f.request());assert(h.ok);const s=f.s();Object.getOwnPropertyDescriptor(s.draft,'songInfo').value.artist='Tracked';
 const before=JSON.stringify({p:s.workingSnapshot(),h:s.getHistory(),v:s.snapshotVersion,raw:[...f.values]});assert.equal(f.service.apply(h).ok,false);assert.equal(JSON.stringify({p:s.workingSnapshot(),h:s.getHistory(),v:s.snapshotVersion,raw:[...f.values]}),before);assert.equal(f.ledger.length,0);
});
test('Phase4 changing the schema field cannot disable draft input or material protection',()=>{
 const f=phase3Fixture(),s=f.s;s.draft.schemaVersion=1;const v=s.snapshotVersion;
 assert.throws(()=>Object.getOwnPropertyDescriptor(s.draft,'materials').value.rhythms[1].snapshot.name='bypass',/protected-material/);
 assert.throws(()=>s.draft.extensions={n:NaN},/non-json-number/);assert.equal(s.snapshotVersion,v);s.draft.schemaVersion=2;assert(f.m.validateProject(s.workingSnapshot()).ok);assert.equal(f.writes(),0);
});
test('Phase4 JSON proof is invalidated by array holes and forbidden extra keys',()=>{
 for(const change of [d=>d.extensions.list.length=4,d=>delete d.extensions.list[0],d=>d.extensions.list.extra=1]){
  const f=phase3Fixture(),s=f.s;s.draft.extensions={list:[1,2]};s.workingSnapshot();const v=s.snapshotVersion;change(s.draft);assert.notEqual(s.snapshotVersion,v);
  assert.throws(()=>s.workingSnapshot(),/sparse-json-array|non-json-array-property/);assert.equal(s.runOperation('must reject',()=>{}).ok,false);assert.equal(f.writes(),0);
 }
});
test('Phase4 JSON proof does not replace schema validation or cross Session snapshots',()=>{
 const f=phase3Fixture(),s=f.s;s.workingSnapshot();s.draft.bars[0].melody[0].durationTicks=-1;assert.equal(f.m.validateProject(s.workingSnapshot()).ok,false);
 const v=s.snapshotVersion;assert.equal(f.command.execute('melody.delete',f.capture()).ok,false);assert.equal(s.snapshotVersion,v);
 f.open('phase3-B');assert(f.service.convert().ok);f.open(f.p.projectId);assert.equal(f.service.convert().ok,false);assert.equal(f.writes(),0);
});

for(const kind of ['forms','rhythms'])test('Phase5 equal-content nested '+kind+' assignment preserves immutable meaning and invalidates old handles',()=>{
 const f=phase3Fixture(),s=f.s,index=kind==='forms'?0:1,old=s.draft.materials[kind][index].provenance;
 const reversed=Object.fromEntries(Object.entries(clone(old)).reverse()),before=s.workingSnapshot(),history=s.getHistory(),version=s.snapshotVersion,output=f.service.convert(),frame=f.capture();
 s.draft.materials[kind][index].provenance=reversed;
 assert.deepEqual(clone(s.workingSnapshot()),clone(before));assert.deepEqual(s.getHistory(),history);assert.notEqual(s.snapshotVersion,version);assert.equal(f.service.isCurrent(output),false);
 assert.throws(()=>old.phase5='detached',/detached-draft/);const safe=f.state();assert.equal(f.command.execute('melody.delete',frame).ok,false);assert.equal(f.state(),safe);
 reversed.phase5='external';assert.equal(s.draft.materials[kind][index].provenance.phase5,undefined);
 assert(s.runOperation('normal after equal replacement',p=>p.songInfo.title='After equal').ok);assert(s.undo().ok);assert.deepEqual(clone(s.workingSnapshot()),clone(before));assert(s.redo().ok);assert.equal(f.writes(),0);
});

for(const [name,edit]of[
 ['property assignment',p=>p.extensions.obj.n=2],
 ['property deletion',p=>delete p.extensions.obj.n],
 ['array append',p=>p.extensions.list.push(4)],
 ['array replacement',p=>p.extensions.list[1]=9],
 ['array removal',p=>p.extensions.list.splice(1,1)],
 ['array length',p=>p.extensions.list.length=1],
 ['nested replacement',p=>p.extensions.obj={nested:{text:'日本語🙂'}}],
])test('Phase5 normal '+name+' publishes one independent Undo/Redo entry after a refused operation',()=>{
 const f=phase3Fixture(),s=f.s;assert(s.runOperation('setup extension',p=>p.extensions={obj:{n:1},list:[1,2,3]}).ok);
 const before=s.workingSnapshot(),safe=f.state(),version=s.snapshotVersion,frame=f.capture(),output=f.service.convert();
 assert.equal(s.runOperation('refused reflection',p=>Object.defineProperty(p.extensions,'bad',{value:1})).ok,false);assert.equal(f.state(),safe);assert.equal(f.service.isCurrent(output),true);
 assert(s.runOperation(name,edit).ok);const after=s.workingSnapshot();assert.notDeepEqual(clone(after),clone(before));assert.notEqual(s.snapshotVersion,version);assert.equal(f.service.isCurrent(output),false);assert.equal(s.getHistory().entries.length,2);assert.equal(s.getHistory().openGroup,null);
 const stable=f.state();assert.equal(f.command.execute('melody.delete',frame).ok,false);assert.equal(f.state(),stable);assert(s.undo().ok);assert.deepEqual(clone(s.workingSnapshot()),clone(before));assert(s.redo().ok);assert.deepEqual(clone(s.workingSnapshot()),clone(after));assert.equal(f.writes(),0);
});
test('Phase5 reflected refusal preserves open text group, bounded history and Redo; explicit Save still works',async()=>{
 const f=phase3Fixture({maxEntries:2}),s=f.s;assert(s.runTextOperation('title','title',p=>p.songInfo.title='First').ok);
 const before=f.state();assert(s.getHistory().textGroup);assert.equal(s.runOperation('unsafe callback',p=>Object.freeze(p.songInfo),{requireUndo:true,preserveAppliedUndo:true}).ok,false);assert.equal(f.state(),before);
 assert(s.runTextOperation('title','title',p=>p.songInfo.title='Second').ok);assert.equal(s.getHistory().entries.length,1);s.finishTextGroup();assert(s.runOperation('artist',p=>p.songInfo.artist='Edited').ok);assert(s.undo().ok);const redo=f.state();
 assert.equal(s.runOperation('unsafe callback',p=>Object.setPrototypeOf(p.songInfo,null),{requireUndo:true,preserveAppliedUndo:true}).ok,false);assert.equal(f.state(),redo);assert(s.canRedo());assert(s.redo().ok);assert.equal(f.writes(),0);
 const raw=s.baseRevision;assert((await s.commit()).ok);assert.notEqual(s.baseRevision,raw);assert.equal(s.dirty,false);const saved=s.baseRevision;assert(s.undo().ok);assert(s.dirty);assert.equal(s.baseRevision,saved);assert(s.redo().ok);assert.equal(s.dirty,false);assert.equal(s.baseRevision,saved);assert.equal(s.getHistory().entries.length,2);
});

for(const kind of ['forms','rhythms'])test('Phase5 material equality cannot disguise an array as a numeric-keyed object: '+kind,()=>{
 const f=phase3Fixture(),s=f.s,index=kind==='forms'?0:1,field=kind==='forms'?'strings':'cells',snapshot=s.draft.materials[kind][index].snapshot,impostor={...clone(snapshot[field])},before=f.state();
 assert.throws(()=>snapshot[field]=impostor,/protected-material/);assert.equal(f.state(),before);
 assert.equal(s.runOperation('invalid material shape',p=>p.materials[kind][index].snapshot[field]=impostor).ok,false);assert.equal(f.state(),before);assert.equal(f.writes(),0);
});
test('Phase5 ordinary object/array changes remain semantic edits with independent Undo',()=>{
 const f=phase3Fixture(),s=f.s;assert(s.runOperation('setup types',p=>p.extensions={empty:{},nested:{list:[1,2]}}).ok);const before=s.workingSnapshot(),v=s.snapshotVersion;
 assert(s.runOperation('change JSON container types',p=>{p.extensions.empty=[];p.extensions.nested.list={'0':1,'1':2};}).ok);const after=s.workingSnapshot();assert.notEqual(s.snapshotVersion,v);assert.equal(Array.isArray(after.extensions.empty),true);assert.equal(Array.isArray(after.extensions.nested.list),false);assert(s.undo().ok);assert.deepEqual(clone(s.workingSnapshot()),clone(before));assert(s.redo().ok);assert.deepEqual(clone(s.workingSnapshot()),clone(after));assert.equal(f.writes(),0);
});

// Independent fixed musical oracles: never derive expected strokes from the reader under test.
const TextAdapter=require('../js/modules/sheet-cruise/text-adapter.js');
const basicSlots=action=>[0,240,480,720].map(tick=>({tick,durationTicks:240,action,accent:false}));
function basicFixture(kind='schema2',mutate){
 const {m,C,realm}=setup();let p=clone(kind==='schema1'?m.createLegacySampleProject():m.createSampleProject());
 if(kind==='mixed'){p.materials.rhythms.push(...clone(materials));const f=chordFixture();assert(f.adopt().ok);p.materials.forms.push(clone(f.s().workingSnapshot().materials.forms[0]));}
 if(mutate)mutate(p,m);assert(m.validateProject(p).ok);
 vm.runInNewContext(readFileSync(new URL('../js/core/storage.js',import.meta.url),'utf8'),realm);
 const values=new Map([['cruiseStudio.project.'+p.projectId,JSON.stringify(p)]]),writes=[];
 const repository=R.createRepository({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes.push({key:k});values.set(k,v);},removeItem:k=>{writes.push({key:k,remove:true});values.delete(k);}},model:m,snapshot:E.snapshot,locks:{request:(_n,_o,f)=>f()},now:()=>p.updatedAt});
 const registry=E.createRegistry({repository,validate:m.validateProject});const session=registry.getOrCreateSession('structure',{type:'project',projectId:p.projectId});registry.activateSession(session);
 const adapter=TextAdapter.create({model:m,getSession:()=>session});
 return {m,C,p,s:session,repository,registry,values,writes,apply:value=>adapter.apply({kind:'basicStrum'},value,'discrete')};
}
function assertBasic(f,action,project=f.s.workingSnapshot()){
 const {m}=f,expected=action?basicSlots(action):null;
 assert.equal(m.getBasicStrumText(project),action==='down'?'↓↓ ↓↓ ・・ ・・':action==='up'?'↑↑ ↑↑ ・・ ・・':'');
 assert.deepEqual(clone(m.getBasicStrumSlots(project)),expected);
 assert.deepEqual(clone(m.getBarEffectiveStrumSlots(project,1)),expected);
 assert.deepEqual(clone(m.getBasicStrumSlots(m.toStructureView(project))),expected);
 if(project.schemaVersion===2){
  const current=project.materials.rhythms.find(x=>x.id===project.performance.basicRhythmId);assert(current,'non-dangling basicRhythmId');
  if(action)assert.deepEqual(current.snapshot.slots.map(({id,...s})=>s),expected);
  else assert.equal(current.provenance.legacyId,'strum_8beat_a');
 }
 assert(m.validateProject(project).ok);
}
for(const kind of ['schema2','mixed'])test('P2 exact current basic / clear / Undo / Save / export: '+kind,async()=>{
 const f=basicFixture(kind),s=f.s,initial=clone(s.workingSnapshot());assertBasic(f,null);assert.equal(s.dirty,false);
 for(const action of ['down','up']){
  const before=s.getHistory().cursor,v=s.snapshotVersion,r=f.apply(action==='down'?'↓↓↓↓':'↑↑↑↑');assert(r.ok);assert.equal(r.recorded,true);assert.equal(s.getHistory().cursor,before+1);assert.notEqual(s.snapshotVersion,v);assert(s.dirty);assertBasic(f,action);assert.equal(f.writes.length,0);
 }
 const up=clone(s.workingSnapshot()),id=kind==='schema1'?up.basicStrumPatternId:up.performance.basicRhythmId;
 if(kind!=='schema1'){const mat=up.materials.rhythms.find(x=>x.id===id);assert.match(mat.provenance.legacyId,/^strum_custom_basic:/);for(const prior of initial.materials.rhythms)assert.deepEqual(up.materials.rhythms.find(x=>x.id===prior.id),prior);}
 // Same content is an exact no-op, not an extra COW material / Undo entry.
 let state=JSON.stringify({p:s.workingSnapshot(),h:s.getHistory(),v:s.snapshotVersion,dirty:s.dirty});assert.equal(f.apply('↑↑↑↑').recorded,false);assert.equal(JSON.stringify({p:s.workingSnapshot(),h:s.getHistory(),v:s.snapshotVersion,dirty:s.dirty}),state);
 for(const action of ['up',null]){
  if(action===null){const n=s.getHistory().cursor;assert.equal(f.apply('').recorded,true);assert.equal(s.getHistory().cursor,n+1);assertBasic(f,null);assert.equal(f.writes.length,2);}
  const json=f.C.storage.exportProjectJson(s.workingSnapshot()),imported=f.C.storage.importProjectJson(json);assert(imported.ok,imported.error);assertBasic(f,action,imported.project);
  const writes=f.writes.length;assert((await s.commit()).ok);assert.equal(f.writes.length,writes+2,'only explicit project/index Save');assert.equal(s.dirty,false);assertBasic(f,action,f.repository.read(s.target).snapshot);
  const reopened=E.createRegistry({repository:f.repository,validate:f.m.validateProject}).getOrCreateSession('structure',s.target);assertBasic(f,action,reopened.workingSnapshot());
 }
 state=JSON.stringify({p:s.workingSnapshot(),h:s.getHistory(),v:s.snapshotVersion,dirty:s.dirty});assert.equal(f.apply('').recorded,false);assert.equal(JSON.stringify({p:s.workingSnapshot(),h:s.getHistory(),v:s.snapshotVersion,dirty:s.dirty}),state);
 assert(s.undo().ok);assertBasic(f,'up');assert(s.dirty);assertBasic(f,'up',f.C.storage.importProjectJson(f.C.storage.exportProjectJson(s.workingSnapshot())).project);assert((await s.commit()).ok);assertBasic(f,'up',f.repository.read(s.target).snapshot);
 assert(s.redo().ok);assertBasic(f,null);assert(s.dirty);assert((await s.commit()).ok);assertBasic(f,null,f.repository.read(s.target).snapshot);
 for(const action of ['down','up','down','up','down']){assert(f.apply(action==='down'?'↓↓↓↓':'↑↑↑↑').ok);assertBasic(f,action);}
});
test('P2 reference resolution follows arbitrary COW suffix and material ID, not array order/name',()=>{
 const f=basicFixture('schema2');assert(f.apply('↓↓↓↓').ok);assert(f.apply('↑↑↑↑').ok);const p=clone(f.s.workingSnapshot()),old=p.materials.rhythms.find(x=>x.id===p.performance.basicRhythmId);
 // A separate valid imported material can have a different ID and alias suffix, with identical music.
 const copy=clone(old);copy.id='independent-material';copy.provenance.legacyId='strum_custom_basic:imported:separate-id';copy.snapshot.slots.forEach((x,i)=>x.id='independent-slot-'+i);p.materials.rhythms.unshift(copy);p.performance.basicRhythmId=copy.id;old.snapshot.name=copy.snapshot.name;assertBasic(f,'up',p);
 f.m.setBasicStrumText(p,'');assertBasic(f,null,p);assert(p.materials.rhythms.some(x=>x.id===copy.id),'schema2 keeps historical materials');
});
for(const kind of ['schema1','schema2','mixed'])test('P2 basic replacement/clear retains two shared bar overrides: '+kind,()=>{
 const f=basicFixture(kind);assert(f.apply('↓↓↓↓').ok);const p=clone(kind==='schema1'?f.p:f.s.workingSnapshot());if(kind==='schema1')f.m.setBasicStrumText(p,'↓↓↓↓');
 if(kind==='schema1')p.bars.slice(0,2).forEach(b=>b.strumOverride=p.basicStrumPatternId);
 else p.bars.slice(0,2).forEach((b,i)=>p.performance.barRhythms.push({id:'shared-basic-binding-'+i,barId:b.id,materialId:p.performance.basicRhythmId}));
 const shared=kind==='schema1'?null:clone(p.materials.rhythms),forms=kind==='schema1'?null:clone(p.materials.forms);
 f.m.setBasicStrumText(p,'↑↑↑↑');assert.equal(f.m.getBasicStrumText(p),'↑↑ ↑↑ ・・ ・・');assert.deepEqual(clone(f.m.getBasicStrumSlots(p)),basicSlots('up'));
 for(const bar of [1,2])assert.deepEqual(clone(f.m.getBarEffectiveStrumSlots(p,bar)),basicSlots('down'),'overrides keep old down material');
 f.m.setBasicStrumText(p,'');assert.equal(f.m.getBasicStrumText(p),'');for(const bar of [1,2])assert.deepEqual(clone(f.m.getBarEffectiveStrumSlots(p,bar)),basicSlots('down'));
 if(shared){for(const m of shared)assert.deepEqual(p.materials.rhythms.find(x=>x.id===m.id),m);assert.deepEqual(p.materials.forms,forms);}assert(f.m.validateProject(p).ok);
});
test('P2 missing default is recreated by identity, unrelated first pattern never becomes basic',()=>{
 const f=basicFixture('schema2');assert(f.apply('↓↓↓↓').ok);assert(f.apply('↑↑↑↑').ok);const p=clone(f.s.workingSnapshot());p.materials.rhythms=p.materials.rhythms.filter(m=>m.provenance.legacyId!=='strum_8beat_a');assert(f.m.validateProject(p).ok);const unrelated=clone(p.materials.rhythms[0]);
 f.m.setBasicStrumText(p,'');assertBasic(f,null,p);assert.deepEqual(p.materials.rhythms.find(m=>m.id===unrelated.id),unrelated);
});
test('P2 native basic, duplicate material IDs and unknown encoding still reject atomically',()=>{
 const f=basicFixture('mixed');assert(f.s.runOperation('native setup',p=>p.performance.basicRhythmId=materials[0].id).ok);
 for(const value of ['↓↓↓↓','']){const before=JSON.stringify({p:f.s.workingSnapshot(),h:f.s.getHistory(),v:f.s.snapshotVersion,raw:[...f.values]});assert.equal(f.apply(value).ok,false);assert.equal(JSON.stringify({p:f.s.workingSnapshot(),h:f.s.getHistory(),v:f.s.snapshotVersion,raw:[...f.values]}),before);}
 for(const patch of [p=>p.materials.rhythms.push(clone(p.materials.rhythms[0])),p=>p.materials.rhythms[0].encoding='unknown-rhythm']){const p=clone(f.s.workingSnapshot());patch(p);assert.equal(f.m.validateProject(p).ok,false);}assert.equal(f.writes.length,0);
});

test('P2 schema1 direct legacy editing and JSON migration retain the R4 musical oracle',()=>{
 const f=basicFixture('schema1'),p=clone(f.p);assert.equal(p.schemaVersion,1);
 for(const [text,action] of [['↓↓↓↓','down'],['↑↑↑↑','up'],['↓↓↓↓','down'],['↑↑↑↑','up'],['',null]]){
  f.m.setBasicStrumText(p,text);assertBasic(f,action,p);const imported=f.C.storage.importProjectJson(f.C.storage.exportProjectJson(p));assert(imported.ok,imported.error);assert.equal(imported.project.schemaVersion,2);assertBasic(f,action,imported.project);
 }
 const before=JSON.stringify(p);f.m.setBasicStrumText(p,'');assert.equal(JSON.stringify(p),before);assert.equal(f.writes.length,0);
});

test('P2-02 independent clear oracle starts from an already-COW basic material',()=>{
 const f=basicFixture('mixed',(p,m)=>{m.setBasicStrumText(p,'↓↓↓↓');m.setBasicStrumText(p,'↑↑↑↑');});
 const before=f.s.workingSnapshot(),current=before.performance.basicRhythmId;
 assert.match(before.materials.rhythms.find(x=>x.id===current).provenance.legacyId,/^strum_custom_basic:/);
 const cursor=f.s.getHistory().cursor,r=f.apply('');assert.equal(r.ok,true);assert.equal(r.recorded,true,'clear must not be a successful no-op');assert.equal(f.s.getHistory().cursor,cursor+1);assert.notEqual(f.s.draft.performance.basicRhythmId,current);assertBasic(f,null);assert.equal(f.writes.length,0);
 for(const material of before.materials.rhythms)assert.deepEqual(f.s.workingSnapshot().materials.rhythms.find(x=>x.id===material.id),material);
 assert(f.s.undo().ok);assertBasic(f,'up');assert(f.s.redo().ok);assertBasic(f,null);
});
for(const value of ['↑↑↑↑',''])test('P2 basic change invalidates old Melody/consumer handles: '+JSON.stringify(value),()=>{
 const f=phase3Fixture();assert(f.s.runOperation('legacy basic',p=>p.performance.basicRhythmId=p.materials.rhythms.find(m=>m.encoding==='studio-strum-v1').id).ok);
 const adapter=TextAdapter.create({model:f.m,getSession:()=>f.s});assert(adapter.apply({kind:'basicStrum'},'↓↓↓↓','discrete').ok);
 const ticket=f.capture(),rendered=f.service.convert();assert(rendered.ok);assert(f.service.isCurrent(rendered));
 const result=adapter.apply({kind:'basicStrum'},value,'discrete');assert(result.ok&&result.recorded);assert.equal(f.service.isCurrent(rendered),false);
 const before=f.state();assert.equal(f.command.execute('melody.setDuration',ticket,{durationTicks:120}).ok,false);assert.equal(f.state(),before);assert.equal(f.writes(),0);
});
