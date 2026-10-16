import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
const R=fileURLToPath(new URL('../../../',import.meta.url));
function setup(){
 const ctx={console,performance,TextEncoder,crypto:crypto.webcrypto,CruiseStudio:{},ChordCruise:{}};ctx.window=ctx;vm.createContext(ctx);
 for(const rel of ['core/music-theory.js','core/song-model.js','../chord-cruise/js/core/music-theory.js','core/schema2.js','core/editing-session.js','core/project-repository.js','core/active-document.js','core/melody-commands.js','core/common-music-model.js','core/structure-conversion.js','core/melody-notation.js']){
  const p=rel.startsWith('../')?'apps/'+rel.slice(3):'apps/cruise-studio/js/'+rel;
  let code=fs.readFileSync(R+'/'+p,'utf8');
  vm.runInContext(code,ctx,{filename:p});
 }
 const C=ctx.CruiseStudio;C.model.configureSchema2();
 function fixture(n){const p=JSON.parse(JSON.stringify(C.model.createLegacySampleProject()));p.projectId='size-'+n;p.createdAt=p.updatedAt='2026-10-16T00:00:00.000Z';p.sections=[{...p.sections[0],id:'section-1',name:'A'}];const b=p.bars[0];p.bars=Array.from({length:n},(_,i)=>({...JSON.parse(JSON.stringify(b)),barNumber:i+1,sectionId:'section-1',lineBreakAfter:false,chords:[{tick:0,symbol:'C'}],melody:Array.from({length:4},(_,j)=>({tick:j*480,durationTicks:480,step:j,alter:0,octave:0})),lyrics:Array.from({length:4},(_,j)=>({tick:j*480,text:'ら'})),strumOverride:null}));return p;}
 function session(p){const raw=JSON.stringify(p),values=new Map([['cruiseStudio.project.'+p.projectId,raw]]),repo=C.projectRepository.createRepository({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},model:C.model,snapshot:C.editing.snapshot,locks:{request:(_n,_o,f)=>f()},now:()=>p.updatedAt}),registry=C.editing.createRegistry({repository:repo,validate:C.model.validateProject});let owner;const open=id=>{let s=registry.getOrCreateSession('structure',{type:'project',projectId:id});registry.activateSession(s);owner.bind(s);return true;};owner=C.activeDocument.createOwner({registry,repository:repo,validate:C.model.validateProject,snapshot:C.editing.snapshot,openProject:open});open(p.projectId);const context={workspaceId:'sheetCruise',generation:1},converter=C.commonMusic.createConverter({schema2:C.model.schema2,studioTheory:C.theory,chordTheory:ctx.ChordCruise.theory,validate:C.model.validateProject}),service=C.structureConversion.createService({owner,repository:repo,model:C.commonMusic,converter,getContext:()=>context}),cmd=C.melodyCommands.create({owner,schema:C.model.schema2,repository:repo,getContext:()=>context});return{raw,values,repo,registry,owner,service,converter,cmd,s:owner.getSession()};}
 return{C,ctx,fixture,session};
}

const sizes=[];
for(const count of [8,32,64,128])test('bounded immutable conversion before/after Save, reload, Undo and A/B: '+count,async()=>{
 const f=setup(),q=f.session(f.fixture(count)),s=q.s,raw=q.raw,hash=x=>crypto.createHash('sha256').update(x).digest('hex');
 const before=s.workingSnapshot(),originalHash=hash(before.provenance.legacySource.raw),backup=before.provenance.legacySource;
 assert(Object.isFrozen(backup));assert.throws(()=>backup.raw='changed');
 function inspect(){const r=q.service.convert();assert(r.ok,JSON.stringify(r.diagnostics));assert(q.service.isCurrent(r));const json=JSON.stringify(r);assert(!json.includes('baseRevision'));assert(!json.includes('legacySource'));assert(!json.includes('legacyPitchBasis'));assert(Object.isFrozen(r.model.measures[0].voices.melody.events[0].pitch));assert.throws(()=>r.model.measures[0].voices.melody.events[0].pitch.midi=0);const n=f.C.melodyNotation.project(r);assert(n.ok);assert(!JSON.stringify(n).includes('baseRevision'));return {r,size:Buffer.byteLength(json)};}
 const first=inspect();assert.equal(q.values.get('cruiseStudio.project.'+before.projectId),raw);
 const dto=q.converter.prepare(before);assert(Object.isFrozen(dto));assert(!JSON.stringify(dto).includes('legacySource'));assert(!f.C.model.validateProject(dto).ok,'DTO cannot be saved as a Project');assert.throws(()=>dto.bars[0].melody[0].pitch.step='G');
 let b=s.draft.bars[0],r=q.cmd.execute('melody.setDuration',q.cmd.capture(b.id,b.melody[0].id),{durationTicks:240});assert(r.ok);assert(!q.service.isCurrent(first.r));assert.equal(s.workingSnapshot().provenance.legacySource,backup,'immutable backup reused across operations');assert(!JSON.stringify(s.getHistory()).includes('legacySource'));
 const changed=inspect();assert(s.undo().ok);assert(!q.service.isCurrent(changed.r));assert.deepEqual(s.workingSnapshot(),before);assert(s.redo().ok);inspect();
 const preSave=q.service.convert();assert((await s.commit()).ok);assert(!q.service.isCurrent(preSave));const saved=inspect();assert.equal(hash(s.workingSnapshot().provenance.legacySource.raw),originalHash);assert.equal(hash(q.repo.read(s.target).snapshot.provenance.legacySource.raw),originalHash);
 const reloaded=f.session(JSON.parse(s.baseRevision));assert(reloaded.service.convert().ok);assert(!reloaded.service.isCurrent(saved.r));assert.deepEqual(reloaded.s.workingSnapshot().bars,s.workingSnapshot().bars);
 const other=f.fixture(count);other.projectId='B';q.values.set('cruiseStudio.project.B',JSON.stringify(other));q.owner.select('B');assert(!q.service.isCurrent(saved.r));const cb=q.service.convert();q.owner.select(before.projectId);assert(!q.service.isCurrent(cb));assert(!q.service.isCurrent(saved.r));inspect();
 q.values.set('cruiseStudio.project.'+before.projectId,s.baseRevision+' ');assert(!q.service.isCurrent(q.service.convert()));assert(!q.service.isCurrent(saved.r));
 assert.deepEqual(s.workingSnapshot().bars[0].melody[0].pitch,before.bars[0].melody[0].pitch);assert.equal(s.workingSnapshot().bars[0].melody[0].onsetTick,before.bars[0].melody[0].onsetTick);
 sizes.push({count,bytes:saved.size});assert(saved.size/count<24000,'linear output budget per measure');
});
test('8/32/64/128 size growth remains linear',()=>{for(let i=1;i<sizes.length;i++)assert(sizes[i].bytes/sizes[i-1].bytes < sizes[i].count/sizes[i-1].count*1.15);});
test('large exact restoration text is excluded from conversion and history but included in capacity checks',async()=>{
 const f=setup(),p=f.fixture(8),raw=' '.repeat(512*1024)+JSON.stringify(p),m=f.C.model.schema2.migrate(p,raw);assert(m.ok);const q=f.session(m.project),before=q.s.workingSnapshot();const r=q.service.convert();assert(r.ok);assert(JSON.stringify(r).length<250000);let b=q.s.draft.bars[0];assert(q.cmd.execute('melody.setDuration',q.cmd.capture(b.id,b.melody[0].id),{durationTicks:240}).ok);assert(q.s.getHistory().bytes<100000);assert.equal(q.s.workingSnapshot().provenance.legacySource,before.provenance.legacySource);assert((await q.s.commit()).ok);assert.equal(q.repo.read(q.s.target).snapshot.provenance.legacySource.raw,raw);
 const bad=JSON.parse(JSON.stringify(before));bad.provenance.legacySource.raw=' '.repeat(5*1024*1024)+JSON.stringify(p);assert(!f.C.model.validateProject(bad).ok);const stored=q.s.baseRevision;assert(!(await q.repo.save({target:q.s.target,baseRevision:stored,snapshot:bad})).ok);assert.equal(q.s.baseRevision,stored);
});

test('retention is distinct from adoption and privately checks exact raw and generation',async()=>{
 const f=setup(),q=f.session(f.fixture(8)),r=q.service.convert();q.s.setInputPending(true);assert(q.service.canRetain(r));assert(!q.service.isCurrent(r));q.s.setInputPending(false);assert(q.s.runOperation('title',p=>p.songInfo.title='new').ok);assert(q.service.canRetain(r));assert(!q.service.isCurrent(r));assert((await q.s.commit()).ok);assert(!q.service.canRetain(r));const next=q.service.convert();assert(q.service.canRetain(next));q.values.set('cruiseStudio.project.'+q.s.target.projectId,q.s.baseRevision+' ');assert(!q.service.canRetain(next));assert(!q.service.isCurrent(next));
});
