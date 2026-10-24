import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runRevocationReproduction({evaluate,primary}){
 const results=[],call=(fn,arg)=>evaluate(primary,`crossTab.${fn}(${arg===undefined?'':JSON.stringify(arg)})`);
 const reset=async()=>{await call('prepare',{role:'primary',generation:'observed-'+randomUUID(),scenario:'save-save-same-key',iterations:1,clock:{wall:100000,mono:0,origin:'observed-origin'}});await call('proBoot',{primary:true,revalidateBudget:1000});};
 await reset();assert((await call('proPacket',{id:'old'})).ok);await call('proServer','terminal');await call('evidenceClockSet',{wall:102000,mono:2000});assert.equal((await call('proPacket',{id:'deny'})).ok,false);
 assert((await call('proCommit','old')).ok);results.push({name:'observed terminal / old handle wrongly commits',insecureConfirmed:true});
 await reset();await call('proServer','terminal');await call('evidenceClockSet',{wall:102000,mono:2000});assert.equal((await call('proPacket',{id:'deny'})).ok,false);await call('proServer','offline');assert((await call('proPacket',{id:'offline'})).ok);assert((await call('proCommit','offline')).ok);results.push({name:'observed terminal / offline new proof wrongly commits',insecureConfirmed:true});
 await reset();assert((await call('proPacket',{id:'nan'})).ok);await evaluate(primary,'crossTab.evidenceClockSet({wall:NaN})');assert.equal((await call('proCommit','nan')).ok,false);await call('evidenceClockSet',{wall:100000});assert((await call('proCommit','nan')).ok);results.push({name:'NaN wall / normalization wrongly revives old proof',insecureConfirmed:true});
 return results;
}

import {observedProTransactionRace} from './pro-transaction-race.mjs';
export async function runObservedRevocationSuite({evaluate,primary,peer}){
 const results=[],call=(actor,fn,arg)=>evaluate(actor,`crossTab.${fn}(${arg===undefined?'':JSON.stringify(arg)})`);
 const record=(name,details={})=>{results.push({name,pass:true,...details});console.error('observed-revocation: '+name);};
 async function reset(){const generation='revocation-'+randomUUID();for(const [actor,role]of[[primary,'primary'],[peer,'peer']]){
  await call(actor,'prepare',{role,generation,scenario:'save-save-same-key',iterations:1,clock:{wall:100000,mono:0,origin:'revocation-origin'}});
  await call(actor,'proBoot',{primary:role==='primary',budget:60000,revalidateBudget:1000});
 }}
 async function deny(){await call(primary,'proServer','terminal');await call(primary,'evidenceClockSet',{wall:102000,mono:2000});assert.equal((await call(primary,'proPacket',{id:'denied'})).ok,false);}
 await reset();assert((await call(primary,'proPacket',{id:'old'})).ok);await deny();assert.equal((await call(primary,'proCommit','old')).ok,false);record('A: observed terminal rejects same prepared handle');
 await call(primary,'proServer','offline');assert.equal((await call(primary,'proPacket',{id:'offline'})).ok,false);await call(primary,'proFreshAdapter');assert.equal((await call(primary,'proPacket',{id:'new-adapter'})).ok,false);record('B: offline same / fresh Adapter cannot issue a proof');
 assert.equal((await call(peer,'proPacket',{id:'peer'})).ok,false);record('C: distinct renderer refuses known terminal');
 await call(primary,'reopen');await call(primary,'proFreshAdapter');assert.equal((await call(primary,'proPacket',{id:'reopen'})).ok,false);record('offline runtime reopen refuses old qualification');
 await reset();const oldA=await call(primary,'proPacket',{id:'old-A'});assert(oldA.ok);await call(primary,'evidenceClockSet',{wall:102000,mono:2000});await call(primary,'proServer',{mode:'delayed-terminal',serverTime:102000});
 await evaluate(primary,"window.observedPending=crossTab.proPacket({id:'delayed-A'});true");
 let waiting=false;for(let i=0;i<250;i++){if((await call(primary,'proServerState')).waiting){waiting=true;break;}await new Promise(r=>setTimeout(r,5));}if(!waiting)throw Error('inconclusive: old A validation request not observed');
 const heldA=(await call(primary,'proServerState')).requests.find(r=>r.held&&!r.delivered);assert(heldA&&heldA.pinnedQualification);assert.equal(heldA.issuedServerTime,102000);
 await call(peer,'proBoot',{primary:true,budget:60000,revalidateBudget:1000,preservePending:true,serverTime:102000});assert(await call(primary,'proReady'));assert(await call(peer,'proReady'));
 const newB=await call(peer,'proPacket',{id:'new-B'});assert(newB.ok,JSON.stringify(newB));
 assert.notDeepEqual(newB.identity,oldA.identity);assert.equal(newB.identity.generation,1);assert.equal(newB.identity.sessionVersion,3);
 const checkpoint=actor=>evaluate(actor,"import('./pro-device-native-fixture.mjs').then(f=>f.proQualificationCheckpoint())");
 const receiptBefore=await checkpoint(peer);assert(receiptBefore.valid&&receiptBefore.receiptPresent);assert.equal(receiptBefore.operationCredentialFingerprint,newB.identity.credentialFingerprint);assert.equal(receiptBefore.operationRevisionFingerprint,newB.identity.operationRevisionFingerprint);assert.equal(receiptBefore.serverTime,102000);assert.equal(receiptBefore.clientWall,100000);
 const primaryServer=await call(primary,'proServerState'),peerServer=await call(peer,'proServerState');assert.equal(primaryServer.clientWall,102000);assert.equal(peerServer.clientWall,100000);
 assert([...primaryServer.requests,...peerServer.requests].some(r=>r.endpoint.endsWith('/renew')&&r.delivered&&!r.pinnedQualification));
 const before=await evaluate(peer,"JSON.stringify([localStorage.getItem('soundCruiseProAuth'),localStorage.getItem('soundCruiseProOperationEpoch')])");
 await call(primary,'proServerRelease');assert.equal((await evaluate(primary,'window.observedPending')).ok,false);
 assert.equal(await evaluate(peer,"JSON.stringify([localStorage.getItem('soundCruiseProAuth'),localStorage.getItem('soundCruiseProOperationEpoch')])"),before);
 const receiptAfter=await checkpoint(peer);assert(receiptAfter.valid&&receiptAfter.receiptPresent);assert.equal(receiptAfter.credentialFingerprint,receiptBefore.credentialFingerprint);assert.equal(receiptAfter.receiptDigest,receiptBefore.receiptDigest);
 const releasedA=(await call(primary,'proServerState')).requests.find(r=>r.id===heldA.id);assert(releasedA.delivered);assert.equal(releasedA.issuedServerTime,heldA.issuedServerTime);assert.equal(releasedA.generation,heldA.generation);
 const oldCommit=await call(primary,'proCommit','old-A'),newCommit=await call(peer,'proCommit','new-B');assert.equal(oldCommit.ok,false);assert(newCommit.ok);
 record('D: old A response preserves B auth / epoch / encrypted receipt / prepared proof',{
  heldA,releasedA,primaryClientWall:primaryServer.clientWall,peerClientWall:peerServer.clientWall,
  receiptBefore,receiptAfter,oldIdentity:oldA.identity,newIdentity:newB.identity,oldCommit,newCommit,
  renewResponses:[...primaryServer.requests,...peerServer.requests].filter(r=>r.endpoint.endsWith('/renew')&&r.delivered)});
 for(const [field,value]of[['wall','NaN'],['wall','Infinity'],['mono','NaN']]){
  await reset();assert((await call(primary,'proPacket',{id:'clock'})).ok);await evaluate(primary,`crossTab.evidenceClockSet({${field}:${value}})`);assert.equal((await call(primary,'proCommit','clock')).ok,false);
  await call(primary,'evidenceClockSet',{wall:100000,mono:0});assert.equal((await call(primary,'proCommit','clock')).ok,false);record('E: '+value+' '+field+' normalization cannot revive proof');
 }
 for(const proFirst of [true,false]){
  await reset();assert((await call(primary,'proPacket',{id:'pro'})).ok);assert((await call(peer,'proPacket',{id:'standard',action:'saveBpm'})).ok);
  const a={actor:primary,id:'pro',kind:'pro'},b={actor:peer,id:'standard',kind:'pro'};
  const race=await observedProTransactionRace({call,primary,peer,first:proFirst?a:b,second:proFirst?b:a,beforeRelease:deny});
  const pro=proFirst?race.first:race.second,standard=proFirst?race.second:race.first;assert.equal(pro.ok,false);assert(standard.ok);record('F: terminal final admission / '+(proFirst?'Pro':'Standard')+' mutation held first',race);
 }
 for(const mode of ['503','429','offline']){
  await reset();await call(primary,'evidenceClockSet',{wall:102000,mono:2000});await call(primary,'proServer',mode);assert((await call(primary,'proPacket',{id:'temporary'})).ok);assert((await call(primary,'proCommit','temporary')).ok);record(mode+' retains bounded healthy allowance');
 }
 return results;
}
