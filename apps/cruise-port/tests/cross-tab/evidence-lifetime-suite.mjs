import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {observedTransactionRace} from './native-transaction-race.mjs';
export async function runEvidenceSuite({evaluate,primary,peer}){
 const results=[],call=(s,fn,arg)=>evaluate(s,`crossTab.${fn}(${arg===undefined?'':JSON.stringify(arg)})`),id=p=>p+'-'+randomUUID().slice(0,8);
 const reset=async()=>{const generation=id('lifetime');for(const [actor,role]of[[primary,'primary'],[peer,'peer']])await call(actor,'prepare',{role,generation,scenario:'save-save-same-key',iterations:1,controlBound:true,clock:{wall:100000,mono:0,origin:'fixture-origin'}});};
 const record=(name,details={})=>results.push({name,pass:true,...details});
 for(const action of ['resumeWrites','renewFence']){
  await reset();if(action==='resumeWrites'){await call(primary,'controlPacket',{id:'suspend',action:'suspendWrites'});assert((await call(primary,'controlPacketCommit','suspend')).ok);}
  const op=id(action),p=await call(primary,'evidencePacket',{id:op,action});assert(p.ok);
  const before=(await call(primary,'controlRead')).snapshot;
  await call(primary,'evidenceClockSet',{wall:170000});assert.equal((await call(primary,'controlPacketCommit',op)).reason,'control-evidence-stale');
  await call(primary,'evidenceClockSet',{wall:110000});assert.equal((await call(primary,'controlPacketCommit',op)).reason,'control-evidence-stale');
  assert.deepEqual((await call(primary,'controlRead')).snapshot,before);
  record(action+' expired → rollback → identical handle rejected');
  const reused=await call(peer,'evidencePacket',{id:id('reuse'),action,packet:p.packet});assert.equal(reused.ok,false);assert.equal(reused.reason,'control-evidence-runtime-mismatch');
  record(action+' expired evidence rejected by peer runtime',reused);
 }
 await reset();const old=id('old');assert((await call(peer,'evidencePacket',{id:old})).ok);
 await call(primary,'controlPacket',{id:'revoke',action:'revokeFence'});assert((await call(primary,'controlPacketCommit','revoke')).ok);
 assert.equal((await call(peer,'controlPacketCommit',old)).reason,'control-stale');record('revoke rejects peer old renewal');
 await reset();const clone=id('clone');assert((await call(primary,'evidencePacket',{id:clone})).ok);
 assert.equal((await call(primary,'evidenceClone',clone)).ok,false);assert.equal((await call(primary,'evidenceCloneToken',clone)).ok,false);
 const transferred=await call(primary,'evidenceTokenClone',clone);assert.equal((await call(peer,'evidenceForgedClone',transferred)).reason,'control-evidence-invalid');
 record('structuredClone transfers neither prepared handle nor evidence brand');
 for(const expiryFirst of [true,false]){
  await reset();const a=id('expired'),b=id('fresh');assert((await call(primary,'evidencePacket',{id:a})).ok);assert((await call(peer,'evidencePacket',{id:b})).ok);
  await call(primary,'evidenceClockSet',{wall:170000});const expired={actor:primary,id:a,kind:'control'},fresh={actor:peer,id:b,kind:'control'};
  const r=await observedTransactionRace({call,primary,peer,first:expiryFirst?expired:fresh,second:expiryFirst?fresh:expired});
  assert.equal((expiryFirst?r.first:r.second).reason,'control-evidence-stale');assert((expiryFirst?r.second:r.first).ok);
  await call(primary,'evidenceClockSet',{wall:110000});assert.equal((await call(primary,'controlPacketCommit',a)).reason,'control-evidence-stale');
  record('expiry / valid commit '+(expiryFirst?'expiry first':'commit first'),r);
 }
 await reset();const queue=id('queue'),stop=id('stop');assert((await call(primary,'evidencePacket',{id:queue})).ok);await call(peer,'controlPacket',{id:stop,action:'suspendWrites'});
 const queued=await observedTransactionRace({call,primary,peer,first:{actor:primary,id:queue,kind:'control'},second:{actor:peer,id:stop,kind:'control'},beforeRelease:()=>call(primary,'evidenceClockSet',{wall:170000})});
 assert.equal(queued.first.reason,'control-evidence-stale');assert(queued.second.ok);record('valid prepare expires while real transaction is queued',queued);
 await reset();const abort=id('abort'),ab=await call(primary,'evidencePacket',{id:abort});assert(ab.ok);await call(primary,'evidenceClockSet',{wall:170000});assert.equal((await call(primary,'evidenceAbort',abort)).ok,false);
 await call(primary,'evidenceClockSet',{wall:110000});assert.equal((await call(primary,'controlPacketCommit',abort)).reason,'control-evidence-stale');assert.equal((await call(peer,'evidencePacket',{id:id('peer-abort'),packet:ab.packet})).ok,false);
 record('transaction abort cannot reset private expiry or durable runtime ownership');
 await reset();const reopen=id('reopen'),saved=await call(primary,'evidencePacket',{id:reopen});assert(saved.ok);await call(primary,'reopen');
 assert.equal((await call(primary,'controlPacketCommit',reopen)).ok,false);assert.equal((await call(primary,'evidencePacket',{id:id('cache'),packet:saved.packet})).ok,false);
 record('dispose/reopen rejects old handle and re-attested cached identity');
 const fresh=id('new-runtime');assert((await call(primary,'evidencePacket',{id:fresh})).ok);assert((await call(primary,'controlPacketCommit',fresh)).ok);record('fresh evidence and new operation succeed after reopen');
 for(const renewalFirst of [true,false]){
  await reset();const renewal=id('renew'),publication=id('publication'),next=id('next'),migrationId=id('migration');assert((await call(primary,'evidencePacket',{id:renewal})).ok);
  await call(primary,'pointerStage',{generation:next,migrationId});await call(peer,'pointerPacket',{id:publication,generation:next,migrationId,operationId:publication,expectedPointerEpoch:(await call(peer,'pointerState')).pointer.pointerEpoch});
  const a={actor:primary,id:renewal,kind:'control'},b={actor:peer,id:publication,kind:'publication'},r=await observedTransactionRace({call,primary,peer,first:renewalFirst?a:b,second:renewalFirst?b:a});
  assert(r.first.ok);assert.equal(r.second.ok,renewalFirst);record('renew / pointer switch '+(renewalFirst?'renew first':'pointer first'),r);
 }
 return results;
}
export async function runEvidenceReproduction({evaluate,primary}){
 const results=[],call=(fn,arg)=>evaluate(primary,`crossTab.${fn}(${arg===undefined?'':JSON.stringify(arg)})`);
 for(const action of ['resumeWrites','renewFence']){
  const generation='lifetime-'+randomUUID(),id='evidence-'+randomUUID();
  await call('prepare',{role:'primary',generation,scenario:'save-save-same-key',iterations:1,controlBound:true,clock:{wall:100000,mono:0,origin:'fixture-clock'}});
  if(action==='resumeWrites'){await call('controlPacket',{id:'suspend',action:'suspendWrites'});assert((await call('controlPacketCommit','suspend')).ok);}
  assert((await call('evidencePacket',{id,action})).ok);
  await call('evidenceClockSet',{wall:170000});const expired=await call('controlPacketCommit',id);assert.equal(expired.reason,'control-evidence-stale');
  await call('evidenceClockSet',{wall:110000});const retried=await call('controlPacketCommit',id);
  assert.equal(retried.status,'control-committed');assert.equal(retried.changed,true);
  results.push({action,sameHandle:true,sameCapability:true,sameEvidence:true,sameOperationId:true,expired,retried,insecureConfirmed:true});
 }
 return results;
}
