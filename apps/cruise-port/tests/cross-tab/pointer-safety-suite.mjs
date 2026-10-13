import {observedTransactionRace} from './native-transaction-race.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runPointerSafetySuite({evaluate,primary,peer,rounds=3}) {
 const results=[],call=(s,fn,arg)=>evaluate(s,`crossTab.${fn}(${arg===undefined?'':JSON.stringify(arg)})`),id=p=>p+'-'+randomUUID().slice(0,8);
 async function fresh(){const generation=id('old');await call(primary,'prepare',{role:'primary',generation,scenario:'save-save-same-key',iterations:1});await call(peer,'prepare',{role:'peer',generation,scenario:'save-save-same-key',iterations:1});return generation;}
 async function packet(s,{id:packetId,generation,migrationId,operationId}){const expectedPointerEpoch=(await call(s,'pointerState')).pointer.pointerEpoch;
  await call(s,'pointerPacket',{id:packetId,generation,migrationId,operationId,expectedPointerEpoch});}
 const record=(name,detail={})=>results.push({name,pass:true,...detail});
 for(const field of ['migrationId','operationId','previousGeneration']) {
  const g=await fresh(),saved=(await call(primary,'pointerState')).pointer;await call(peer,'policyPrepare',{id:'bpm-'+field,action:'saveBpm',fields:{bpm:146}});
  await call(primary,'pointerDamage',{store:'pointer',key:'active',patch:{[field]:'invalid-identity'}});
  assert.equal((await call(peer,'pointerState',g)).hydrate.status,'recovery-required');
  assert.equal((await call(peer,'policyCommit','bpm-'+field)).ok,false);record('A '+field+' corruption: peer hydrate/Standard save denied');
  await call(primary,'pointerRaw',saved); // Explicit fixture cleanup of injected corruption only.
 }
 {
  await fresh();const g=id('pub'),m=id('m'),op=id('operation');await call(primary,'pointerStage',{generation:g,migrationId:m});
  await packet(primary,{id:'first',generation:g,migrationId:m,operationId:op});assert.equal((await call(primary,'pointerPacketCommit','first')).status,'published');
  await packet(peer,{id:'duplicate',generation:g,migrationId:m,operationId:op});
  const next=id('next'),mn=id('mn');await call(primary,'pointerStage',{generation:next,migrationId:mn});await packet(peer,{id:'next',generation:next,migrationId:mn,operationId:id('next-op')});
  const saved=(await call(primary,'pointerSnapshot',g)).snapshot.head;
  await call(primary,'pointerDamage',{store:'head',key:g,remove:true});
  assert.equal((await call(peer,'pointerPacketCommit','duplicate')).status,'recovery-required');record('B missing active head: duplicate publication denied');
  assert.equal((await call(peer,'pointerPacketCommit','next')).status,'recovery-required');record('C missing active head: new generation publication denied');
  const fact=await call(peer,'pointerFact',{generation:g,operationId:op});assert.equal(fact.result.historical,true);assert.equal(fact.result.currentAuthorityVerified,false);
  await call(primary,'pointerDamage',{store:'head',key:g,patch:saved});
 }
 {
  await fresh();const g=id('collision'),m=id('mc');await call(primary,'pointerStage',{generation:g,migrationId:m});
  await packet(peer,{id:'collision',generation:g,migrationId:m,operationId:'stage-'+g});
  assert.equal((await call(peer,'pointerPacketCommit','collision')).reason,'operation-id-payload-conflict');record('D dataset initialization ID cannot become publication ID');
 }
 for(let round=0;round<rounds;round++)for(const scenario of ['old-first','publish-first','same-publication']) {
  await call(primary,'raceReset');await call(peer,'raceReset');await fresh();const g=id('race'),m=id('mr'),op=id('pr');
  await call(primary,'pointerStage',{generation:g,migrationId:m});
  await packet(peer,{id:'peer-pub',generation:g,migrationId:m,operationId:op});
  if(scenario==='same-publication')await packet(primary,{id:'primary-pub',generation:g,migrationId:m,operationId:op});
  else await call(primary,'pointerPrepareOld','primary-old');
  const a={actor:primary,kind:scenario==='same-publication'?'publication':'old',id:scenario==='same-publication'?'primary-pub':'primary-old'},b={actor:peer,kind:'publication',id:'peer-pub'};
  const first=scenario==='publish-first'?b:a,second=scenario==='publish-first'?a:b;
  const r=await observedTransactionRace({call,primary,peer,first,second});
  if(scenario==='same-publication')assert.deepEqual([r.first.status,r.second.status],['published','already-active']);
  else if(scenario==='old-first'){assert.equal(r.first.ok,true);assert.equal(r.second.status,'published');}
  else{assert.equal(r.first.status,'published');assert.equal(r.second.reason,'generation-not-active');}
  record((scenario==='same-publication'?'F':'E')+' '+scenario+' native transaction contention',{round,...r,outcomes:[r.first.status??r.first.reason,r.second.status??r.second.reason]});
  await call(primary,'raceReset');await call(peer,'raceReset');
 }
 return results;
}
