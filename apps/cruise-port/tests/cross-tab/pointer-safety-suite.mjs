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
  await call(primary,'raceHold');await call(primary,'raceTrace');await call(peer,'raceTrace');
  const a={kind:scenario==='same-publication'?'publication':'old',id:scenario==='same-publication'?'primary-pub':'primary-old'},b={kind:'publication',id:'peer-pub'};
  const first=scenario==='publish-first'?[peer,b]:[primary,a],second=scenario==='publish-first'?[primary,a]:[peer,b];
  await call(first[0],'raceDispatch',first[1]);await call(second[0],'raceDispatch',second[1]);
  let before;
  for(let n=0;n<100;n++) {before=[await call(primary,'raceState'),await call(peer,'raceState')];
   if(before.every(s=>s.events.some(e=>e.phase==='queued'&&e.mode==='readwrite'&&e.stores.includes('pointer'))))break;
   await new Promise(r=>setTimeout(r,10));}
  const queued=before.map(s=>s.events.filter(e=>e.phase==='queued'&&e.mode==='readwrite'&&e.stores.includes('pointer')));
  if(queued.some(q=>!q.length)||before.some(s=>s.events.some(e=>e.phase==='request-started'))) {
   await call(primary,'raceRelease');throw Error('inconclusive: both Store transactions were not blocked/queued');
  }
  assert.equal(await call(primary,'raceRelease'),true);
  let after;
  for(let n=0;n<200;n++){after=[await call(primary,'raceState'),await call(peer,'raceState')];
   if(after[0].results[a.id]&&!after[0].results[a.id].pending&&after[1].results[b.id]&&!after[1].results[b.id].pending)break;await new Promise(r=>setTimeout(r,10));}
  const av=after[0].results[a.id],bv=after[1].results[b.id];assert(av&&!av.pending&&!av.error);assert(bv&&!bv.pending&&!bv.error);
  for(let realm=0;realm<2;realm++)for(const q of queued[realm]) {
   assert(after[realm].events.some(e=>e.id===q.id&&e.phase==='request-started'));
   assert(after[realm].events.some(e=>e.id===q.id&&['completed','aborted'].includes(e.phase)));
  }
  if(scenario==='same-publication')assert.deepEqual([av.status,bv.status].sort(),['already-active','published']);
  else {assert.equal(bv.status,'published');assert(av.ok||av.reason==='generation-not-active');
   // Queue order is observed, not assumed from Promise dispatch ordering.
   const starts=after.map((s,i)=>s.events.find(e=>e.id===queued[i][0].id&&e.phase==='request-started').at);
   if(starts[0]<starts[1])assert.equal(av.ok,true);if(starts[1]<starts[0])assert.equal(av.reason,'generation-not-active');}
  record((scenario==='same-publication'?'F':'E')+' '+scenario+' native transaction contention',{round,queuedWhileBarrierHeld:queued,trace:after.map(s=>s.events),outcomes:[av.status??av.reason,bv.status??bv.reason],inconclusive:false});
  await call(primary,'raceReset');await call(peer,'raceReset');
 }
 return results;
}
