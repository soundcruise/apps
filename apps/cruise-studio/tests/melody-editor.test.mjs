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
 return {values,repo,registry,owner,command,execute,s:()=>owner.getSession(),open,storage,writes:()=>writes,context:x=>x===undefined?context:context=x,fault:x=>mode=x};
}
const state=f=>JSON.stringify({draft:f.s().workingSnapshot(),base:f.s().baseSnapshot,revision:f.s().baseRevision,history:f.s().getHistory(),dirty:f.s().dirty,raw:[...f.values]});

const UI=require('../js/modules/sheet-cruise/melody-editor.js');
function editor(options){const f=fixture(options),c=UI.createController({owner:f.owner,commands:f.command,gaps:CMD.gaps,getContext:()=>f.context()});
 f.registry.subscribe((s,k)=>c.changed(s,k));
 const select=(event=true,gap=undefined)=>{const s=f.s(),bar=s.draft.bars[0],t=f.owner.ticket(),ctx=f.context();return c.select({barId:bar.id,eventId:event?bar.melody[0]?.id:null,gap,source:{projectId:s.target.projectId,sessionId:s.sessionId,snapshotVersion:s.snapshotVersion,generation:t.generation,workspaceId:ctx.workspaceId,workspaceGeneration:ctx.generation}});};
 return {...f,c,select,run:(type,payload={})=>c.execute(c.view()?.handle,type,payload)};
}
for(const [duration,label] of UI.durations)test('Inspector routes supported '+label+' to one Session operation',()=>{
 const f=editor();assert(f.select().ok);const before=f.s().workingSnapshot(),r=f.run('melody.setDuration',{durationTicks:duration});
 if(duration>1680){assert(!r.ok);assert.deepEqual(f.s().workingSnapshot(),before);return;}
 assert(r.ok,JSON.stringify(r));assert.equal(f.s().draft.bars[0].melody[0].durationTicks,duration);assert.equal(f.s().getHistory().cursor,1);assert.equal(f.writes(),0);
 assert(f.s().undo().ok);assert.deepEqual(f.s().workingSnapshot(),before);assert(f.s().redo().ok);assert.equal(f.s().draft.bars[0].melody[0].durationTicks,duration);
});
test('canonical stable selection, fragment aliases and copied handle rejection',()=>{
 const f=editor();assert(f.select().ok);const v=f.c.view(),before=state(f);assert(!f.c.execute({...v.handle},'melody.delete',{}).ok);assert.equal(state(f),before);
 const first=v.handle;assert(f.select().ok);assert.equal(f.c.view().eventId,v.eventId);assert(!f.c.execute(first,'melody.delete',{}).ok);
});
for(const kind of ['conflict','externalUpdatePending','inputPending','commitInFlight'])test('Inspector blocks '+kind+' without draft/history/raw change',()=>{
 const f=editor();let guard=null;
 const c=UI.createController({owner:{getSession:()=>guard||f.s(),ticket:()=>f.owner.ticket()},commands:f.command,gaps:CMD.gaps,getContext:()=>f.context()});
 const s=f.s(),bar=s.draft.bars[0],ticket=f.owner.ticket();assert(c.select({barId:bar.id,eventId:bar.melody[0].id,source:{projectId:'A',sessionId:s.sessionId,snapshotVersion:s.snapshotVersion,generation:ticket.generation,workspaceId:'sheetCruise',workspaceGeneration:1}}).ok);
 guard={...s,[kind]:kind==='conflict'?{code:'conflict'}:true};const before=state(f);assert(!c.execute(c.view().handle,'melody.delete',{}).ok);assert.equal(state(f),before);assert(c.view().blocked);
});
for(const mutate of [f=>f.context({workspaceId:'preDtm',generation:1}),f=>f.context({workspaceId:'sheetCruise',generation:2}),f=>f.context({...f.context(),blocked:true})])test('workspace generation / modal / IME guard blocks commands',()=>{
 const f=editor();assert(f.select().ok);const h=f.c.view().handle;mutate(f);const before=state(f);assert(!f.c.execute(h,'melody.delete',{}).ok);assert.equal(state(f),before);
});
test('unrelated mutation invalidates Inspector until reselected',()=>{
 const f=editor();assert(f.select().ok);assert(f.s().runOperation('title',p=>p.songInfo.title='new').ok);assert(f.c.view().blocked);const before=state(f);assert(!f.run('melody.delete').ok);assert.equal(state(f),before);assert(f.select().ok);assert(f.run('melody.setDuration',{durationTicks:120}).ok);
});
test('A/B stale handle cannot edit either project, A history remains separate',()=>{
 const f=editor();assert(f.select().ok);const h=f.c.view().handle;let p=v1();p.projectId='B';f.values.set('cruiseStudio.project.B',JSON.stringify(p));f.open('B');const before=state(f);assert(!f.c.execute(h,'melody.delete',{}).ok);assert.equal(state(f),before);assert.equal(f.c.view(),null);f.open('A');assert(f.select().ok);assert(!f.c.execute(h,'melody.delete',{}).ok);
});
test('gap is derived only; explicit confirmation inserts rest and binds created ID',()=>{
 const f=editor(),gap=CMD.gaps(f.s().draft.bars[0])[0],raw=[...f.values];assert(f.select(false,gap).ok);assert.equal(f.s().draft.bars[0].melody.length,1);assert.deepEqual([...f.values],raw);
 assert(f.run('melody.confirmGap').ok);assert.equal(f.c.view().event.kind,'rest');assert.equal(f.c.view().event.onsetTick,0);assert(f.c.view().event.provenance.timing.onset.confirmed);assert(f.s().undo().ok);assert.equal(f.s().draft.bars[0].melody.length,1);
});
test('partial confirmation never confirms gaps; whole bar fills and confirms once',()=>{
 const f=editor();assert(f.select().ok);assert(f.run('melody.confirmEventTiming',{attributes:['onset']}).ok);assert(!f.c.view().confirmed);assert(!f.c.view().event.provenance.timing.duration.confirmed);
 assert(f.run('melody.confirmBarTiming').ok);assert(f.c.view().confirmed);assert.equal(CMD.gaps(f.c.view().bar).length,0);assert.equal(f.s().getHistory().cursor,2);assert(f.s().undo().ok);assert(!f.c.view().confirmed);assert(f.s().redo().ok);assert(f.c.view().confirmed);
});
test('note/rest conversion has no hidden pitch; explicit pitch preserves timing and IDs',()=>{
 const f=editor();f.select();const ev=clone(f.c.view().event);assert(f.run('melody.setKind',{kind:'rest'}).ok);assert(!('pitch'in f.c.view().event));const before=state(f);assert(!f.run('melody.setKind',{kind:'note'}).ok);assert.equal(state(f),before);
 assert(f.run('melody.setKind',{kind:'note',pitch:{step:'F',alter:1,octave:5}}).ok);assert.deepEqual({...clone(f.c.view().event),pitch:ev.pitch},ev);
});
for(const payload of [{durationTicks:NaN},{durationTicks:Infinity},{durationTicks:160},{durationTicks:1920}])test('invalid / unsupported / bar crossing rejection is atomic '+String(payload.durationTicks),()=>{
 const f=editor();f.select();const before=state(f);assert(!f.run('melody.setDuration',payload).ok);assert.equal(state(f),before);
});
test('overlap rejected; shortening leaves gap and does not move later event',()=>{
 const p=v1();p.bars[0].melody.push({tick:600,durationTicks:240,step:1,alter:0,octave:0});const f=editor({raw:JSON.stringify(p)});f.select();let before=state(f);assert(!f.run('melody.setDuration',{durationTicks:480}).ok);assert.equal(state(f),before);const next=clone(f.s().draft.bars[0].melody[1]);assert(f.run('melody.setDuration',{durationTicks:120}).ok);assert.deepEqual(f.s().draft.bars[0].melody[1],next);assert(CMD.gaps(f.s().draft.bars[0]).some(g=>g.onsetTick===360));
});
test('Undo capacity rejection happens before Inspector mutation',()=>{
 const f=editor({maxBytes:1});f.select();const before=state(f);assert(!f.run('melody.delete').ok);assert.equal(state(f),before);
});
test('raw external revision is not hidden by Inspector reselection',()=>{
 const f=editor();f.select();f.values.set('cruiseStudio.project.A',' '+f.values.get('cruiseStudio.project.A'));const before=state(f);assert(!f.run('melody.delete').ok);assert.equal(state(f),before);
});
test('explicit Save/Load retains exact edited event, legacy raw and Undo save point',async()=>{
 const f=editor(),raw=f.values.get('cruiseStudio.project.A');f.select();assert(f.run('melody.move',{onsetTick:480}).ok);assert(f.run('melody.setDuration',{durationTicks:360}).ok);assert(f.run('melody.confirmBarTiming').ok);const edited=f.s().workingSnapshot();assert.equal(f.writes(),0);
 assert((await f.s().commit()).ok);assert(!f.s().dirty);assert.deepEqual(f.repo.read(f.s().target).snapshot.bars,edited.bars);assert.equal(f.repo.read(f.s().target).snapshot.provenance.legacySource.raw,raw);
 assert(f.s().undo().ok);assert(f.s().dirty);assert(f.s().redo().ok);assert(!f.s().dirty);const reloaded=editor({raw:f.values.get('cruiseStudio.project.A')});assert.deepEqual(reloaded.s().draft.bars,edited.bars);
});
test('delete returns gap, no-op confirmation retains one history owner',()=>{
 const f=editor();f.select();assert(f.run('melody.confirmEventTiming',{attributes:['onset']}).ok);const before=state(f);assert(f.run('melody.confirmEventTiming',{attributes:['onset']}).ok);assert.equal(state(f),before);assert(f.run('melody.delete').ok);assert.equal(f.c.view(),null);assert(f.s().undo().ok);assert.equal(f.s().draft.bars[0].melody.length,1);
});
