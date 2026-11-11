import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const require=createRequire(import.meta.url), E=require('../js/core/editing-session.js'),R=require('../js/core/project-repository.js'),O=require('../js/modules/sheet-cruise/operation-adapter.js'),M=require('../js/core/common-music-model.js');
const realm={window:{CruiseStudio:{},ChordCruise:{},crypto:webcrypto},TextEncoder};
for(const file of ['core/music-theory.js','core/song-model.js','core/storage.js'])vm.runInNewContext(readFileSync(new URL('../js/'+file,import.meta.url),'utf8'),realm);
vm.runInNewContext(readFileSync(new URL('../../chord-cruise/js/core/music-theory.js',import.meta.url),'utf8'),realm);
const C=realm.window.CruiseStudio;C.schema2=require('../js/core/schema2.js');C.model.configureSchema2();
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(legacy=false){
 const p=legacy?C.model.createLegacySampleProject():C.model.createSampleProject();C.model.setBasicStrumText(p,'↓ ↑');const values=new Map([['cruiseStudio.project.'+p.projectId,JSON.stringify(p)]]);let writes=0;
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){writes++;values.set(k,v);},removeItem:k=>values.delete(k)};
 const repo=R.createRepository({storage,model:C.model,snapshot:E.snapshot,now:()=> '2026-11-11T04:00:00.000Z',locks:{request:(_n,_o,fn)=>fn()}}),registry=E.createRegistry({repository:repo,validate:C.model.validateProject});
 const s=registry.getOrCreateSession('structure',{type:'project',projectId:p.projectId});registry.activateSession(s);
 const op=O.create({model:C.model,getSession:()=>s});return {s,op,repo,values,writes:()=>writes};
}
for(const legacy of [false,true])test('explicit empty override differs from reset; default empty API still resets: '+(legacy?'v1':'v2'),async()=>{
 if(legacy){const direct=C.model.createLegacySampleProject();C.model.setBasicStrumText(direct,'↓ ↑');C.model.setBarStrumSlots(direct,1,[],{keepEmpty:true});assert.equal(direct.schemaVersion,1);assert.deepEqual(copy(C.model.getBarEffectiveStrumSlots(direct,1)),[]);C.model.setBarStrumSlots(direct,1,[]);assert.equal(direct.bars[0].strumOverride,null);}
 const f=fixture(legacy),before=f.s.workingSnapshot(),basic=copy(C.model.getBarEffectiveStrumSlots(before,1));assert(basic.length);
 const result=f.op.execute('strum',{barNumber:1,slots:[],keepEmpty:true});assert(result.ok,result.error);const blank=f.s.workingSnapshot();
 assert.deepEqual(copy(C.model.getBarEffectiveStrumSlots(blank,1)),[]);assert.deepEqual(copy(C.model.getBarEffectiveStrumSlots(blank,2)),basic);assert.equal(f.writes(),0);
 assert.equal(f.op.execute('strum',{barNumber:1,slots:[],keepEmpty:true}).recorded,false);
 assert(f.s.undo().ok);assert.deepEqual(f.s.workingSnapshot(),before);assert(f.s.redo().ok);assert.deepEqual(f.s.workingSnapshot(),blank);
 const commit=await f.s.commit();assert(commit.ok,JSON.stringify(commit));const saved=f.repo.read(f.s.target).snapshot;assert.deepEqual(copy(C.model.getBarEffectiveStrumSlots(saved,1)),[]);
 const json=C.storage.exportProjectJson(saved),round=C.storage.importProjectJson(json);assert(round.ok,round.error);assert.deepEqual(copy(C.model.getBarEffectiveStrumSlots(round.project,1)),[]);
 assert(f.op.execute('resetStrum',{barNumber:1}).ok);assert.deepEqual(copy(C.model.getBarEffectiveStrumSlots(f.s.draft,1)),basic);
 assert(f.op.execute('strum',{barNumber:1,slots:[],keepEmpty:true}).ok);assert(f.s.runOperation('legacy default reset',p=>C.model.setBarStrumSlots(p,1,[])).ok);assert.deepEqual(copy(C.model.getBarEffectiveStrumSlots(f.s.draft,1)),basic);
});
test('explicit rests and extended strokes reach Common Music with their exact meanings and durations',()=>{
 const f=fixture(),slots=[{tick:0,action:'rest',durationTicks:240,accent:false},{tick:240,action:'down',durationTicks:480,accent:false},{tick:960,action:'rest',durationTicks:120,accent:false}];
 assert(f.op.execute('strum',{barNumber:1,slots,keepEmpty:true}).ok);const before=f.s.workingSnapshot();
 const converter=M.createConverter({schema2:C.model.schema2,studioTheory:C.theory,chordTheory:realm.window.ChordCruise.theory,validate:C.model.validateProject});
 const converted=converter.convert({source:'working',project:before,sessionId:'synthetic',version:'s:0:1',baseRevision:null,token:{projectId:before.projectId,sessionId:'synthetic',generation:1}});assert(converted.ok,JSON.stringify(converted.diagnostics));
 const events=converted.model.measures[0].voices.guitar.events;assert.deepEqual(events.map(e=>[e.onsetTick,e.durationTicks,e.hit,e.rest]),[[0,240,false,true],[240,480,true,false],[960,120,false,true]]);assert(!events.some(e=>e.onsetTick===720));assert.deepEqual(f.s.workingSnapshot(),before);
});
