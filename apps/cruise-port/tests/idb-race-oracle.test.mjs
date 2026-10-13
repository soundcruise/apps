import test from 'node:test';
import assert from 'node:assert/strict';
import {observedTransactionRace} from './cross-tab/native-transaction-race.mjs';
import {observedProTransactionRace} from './cross-tab/pro-transaction-race.mjs';
// Deliver first-renderer completion only after the second renderer's request is
// observed. An earlier first snapshot is stale even though IDB already serialized.
function fixture(pro,{missing=false}={}){
 let released=false,firstReleased=false,secondObserved=false,secondReleased=false;
 const states={A:{events:[],results:{},gate:null},B:{events:[],results:{},gate:null}},reads=[];
 const queued=id=>({id,phase:'queued',mode:'readwrite',stores:['pointer']});
 const started=id=>({id,phase:'request-started',mode:'readwrite',stores:['pointer']});
 async function call(actor,fn,arg){const s=states[actor];
  if(fn==='raceDispatch'){s.events.push(queued(actor));s.results[arg.id]={pending:true};if(pro&&actor==='A')s.gate={id:actor,active:true};return true;}
  if(fn==='raceRelease'){released=true;states.A.gate={id:'A',active:true};return true;}
  if(fn==='raceGateRelease'){
   if(actor==='A'){firstReleased=true;states.A.gate.active=false;states.B.gate={id:'B',active:true};}
   else{secondReleased=true;states.B.gate.active=false;states.B.events.push({id:'B',phase:'completed'});states.A.results.first={ok:true};states.B.results.second={ok:true};}
   return true;
  }
  if(fn==='raceState'){
   if(actor==='B'&&firstReleased){secondObserved=true;if(!s.events.some(e=>e.phase==='request-started'))s.events.push(started('B'));}
   if(actor==='A'&&(released||pro)&&s.gate?.active&&!s.events.some(e=>e.phase==='request-started'))s.events.push(started('A'));
   const snapshot=structuredClone(s);
   if(actor==='A'&&firstReleased&&secondObserved&&!missing)snapshot.events.push({id:'A',phase:'completed'});
   reads.push({actor,firstReleased,secondObserved,completed:snapshot.events.some(e=>e.phase==='completed')});return snapshot;
  }
  return true;
 }
 return {call,reads,get secondReleased(){return secondReleased;}};
}
for(const [name,run,pro]of[['native',observedTransactionRace,false],['Pro',observedProTransactionRace,true]]){
 test(name+' oracle reacquires first snapshot only after observing second request start',async()=>{
  const x=fixture(pro),r=await run({call:x.call,primary:'A',peer:'B',first:{actor:'A',kind:'pro',id:'first'},second:{actor:'B',kind:'pro',id:'second'}});
  assert(r.orderProven);assert.equal(r.inconclusive,false);assert(x.reads.some(s=>s.actor==='A'&&s.firstReleased&&s.secondObserved&&s.completed));assert(x.secondReleased);
 });
 test(name+' oracle reports inconclusive when fresh first completion is absent',async()=>{
  const x=fixture(pro,{missing:true});await assert.rejects(run({call:x.call,primary:'A',peer:'B',first:{actor:'A',kind:'pro',id:'first'},second:{actor:'B',kind:'pro',id:'second'}}),/inconclusive: first.*completion not observed after second request/);assert.equal(x.secondReleased,false);
 });
}
