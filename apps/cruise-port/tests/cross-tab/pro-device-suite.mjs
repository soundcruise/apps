import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {observedProTransactionRace as observedTransactionRace} from './pro-transaction-race.mjs';
export async function runProDeviceSuite({evaluate,primary,peer}){
 const results=[],call=(s,fn,arg)=>evaluate(s,`crossTab.${fn}(${arg===undefined?'':JSON.stringify(arg)})`),record=(name,details={})=>results.push({name,pass:true,...details});
 async function reset(){const generation='pro-'+randomUUID();for(const [s,role]of[[primary,'primary'],[peer,'peer']]){await call(s,'prepare',{role,generation,scenario:'save-save-same-key',iterations:1,clock:{wall:100000,mono:0,origin:'pro-origin'}});await call(s,'proBoot',role==='primary');}}
 await reset();assert((await call(primary,'proPacket',{id:'valid'})).ok);assert((await call(primary,'proCommit','valid')).ok);record('A: formal shared source and encrypted native receipt authorize Pro without Account');
 for(const kind of ['pending','reset','generation','revision']){
  await reset();assert((await call(primary,'proPacket',{id:'stale'})).ok);const before=(await call(primary,'controlRead')).snapshot;
  await call(peer,'proChange',kind);assert.equal((await call(primary,'proCommit','stale')).ok,false);assert.deepEqual((await call(primary,'controlRead')).snapshot,before);record('peer '+kind+' rejects prepared proof');
 }
 await reset();assert((await call(primary,'proPacket',{id:'same-id'})).ok);await call(peer,'proChange','credential');
 assert.equal((await call(peer,'proPacket',{id:'same-id'})).reason,'operation-id-payload-conflict');record('E: same operation cannot acquire a different credential');
 for(const source of ['wall','mono'])for(const seconds of [29,30,31]){
  await reset();assert((await call(primary,'proPacket',{id:'margin'})).ok);await call(primary,'evidenceClockSet',{[source]:(source==='wall'?100000:0)+(60-seconds)*1000});
  assert.equal((await call(primary,'proCommit','margin')).ok,seconds>=30);record('F: cached/offline grant '+source+' margin '+seconds+' sec');
 }
 await reset();assert((await call(primary,'proPacket',{id:'expired'})).ok);await call(primary,'evidenceClockSet',{wall:170000});assert.equal((await call(primary,'proCommit','expired')).ok,false);
 await call(primary,'evidenceClockSet',{wall:110000});assert.equal((await call(primary,'proCommit','expired')).ok,false);record('B: observed expiry cannot revive on rollback / same handle retry');
 await reset();await call(peer,'proChange','pending');assert((await call(primary,'proPacket',{id:'standard',action:'saveBpm'})).ok);assert((await call(primary,'proCommit','standard')).ok);record('G: Standard BPM needs no Pro and retains raw advanced');
 for(const proFirst of [true,false]){
  await reset();assert((await call(primary,'proPacket',{id:'switch'})).ok);const next='next-'+randomUUID(),migrationId='migration-'+randomUUID();await call(primary,'pointerStage',{generation:next,migrationId});
  await call(peer,'pointerPacket',{id:'publication',generation:next,migrationId,operationId:'publication',expectedPointerEpoch:(await call(peer,'pointerState')).pointer.pointerEpoch});
  const a={actor:primary,id:'switch',kind:'pro'},b={actor:peer,id:'publication',kind:'publication'},r=await observedTransactionRace({call,primary,peer,first:proFirst?a:b,second:proFirst?b:a});
  assert(r.first.ok);assert.equal(r.second.ok,proFirst);record('H: Pro / Pointer switch '+(proFirst?'Pro first':'Pointer first'),r);
 }
 await reset();assert((await call(primary,'proPacket',{id:'queued'})).ok);assert((await call(peer,'proPacket',{id:'queued-standard',action:'saveBpm'})).ok);
 const q=await observedTransactionRace({call,primary,peer,first:{actor:primary,id:'queued',kind:'pro'},second:{actor:peer,id:'queued-standard',kind:'pro'},beforeRelease:()=>call(primary,'evidenceClockSet',{wall:170000})});
 assert.equal(q.first.ok,false);assert(q.second.ok);record('valid proof expires while actual Authority transaction waits',q);
 for(const kind of ['expiry','revision']){
  await reset();assert((await call(primary,'proPacket',{id:'final'})).ok);const before=(await call(primary,'controlRead')).snapshot;
  const r=await evaluate(primary,`(async()=>{const get=IDBObjectStore.prototype.get;let crossed=false;IDBObjectStore.prototype.get=function(...a){const r=get.apply(this,a);if(this.name==='records')r.addEventListener('success',()=>{crossed=true;${kind==='expiry'?'crossTab.evidenceClockSet({wall:170000})':'crossTab.proChange("revision")'}},{once:true});return r};try{return {result:await crossTab.proCommit('final'),get crossed(){return crossed}}}finally{IDBObjectStore.prototype.get=get}})()`);
  assert(r.crossed);assert.equal(r.result.ok,false);assert.deepEqual((await call(primary,'controlRead')).snapshot,before);record('final admission observes '+kind+' during native manifest read');
 }
 await reset();assert((await call(primary,'proPacket',{id:'origin'})).ok);await call(primary,'evidenceClockSet',{origin:'new-origin'});assert.equal((await call(primary,'proCommit','origin')).ok,false);
 assert((await call(primary,'proPacket',{id:'fresh-origin'})).ok);assert((await call(primary,'proCommit','fresh-origin')).ok);record('clock origin invalidates old proof; fresh operation succeeds');
 await reset();assert((await call(primary,'proPacket',{id:'reopen'})).ok);await call(primary,'reopen');assert.equal((await call(primary,'proCommit','reopen')).ok,false);await call(primary,'proBoot',false);
 assert((await call(primary,'proPacket',{id:'fresh-reopen'})).ok);assert((await call(primary,'proCommit','fresh-reopen')).ok);record('runtime reopen rejects old handle and accepts newly verified proof');
 await reset();assert((await call(primary,'proPacket',{id:'abort'})).ok);const before=(await call(primary,'controlRead')).snapshot;assert.equal((await call(primary,'proAbort','abort')).ok,false);assert.deepEqual((await call(primary,'controlRead')).snapshot,before);
 assert((await call(primary,'proCommit','abort')).ok);assert((await call(primary,'proFact','abort')).ok);await call(peer,'proChange','pending');const replay=await call(primary,'proCommit','abort');assert(replay.ok&&replay.replayed&&replay.publish===false);record('abort preserves reservation; response loss/replay returns historical fact only');
 return results;
}
