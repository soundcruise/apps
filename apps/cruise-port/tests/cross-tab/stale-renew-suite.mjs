import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Actual shared gate/helper and native IDB; synthetic auth transport only.
// No Worker or production identity is contacted by this suite.
export async function runStaleRenewSuite({evaluate,primary,peer,reloadPeer}){
 const results=[],record=(name,facts={})=>results.push({name,pass:true,...facts});
 const call=(actor,fn,arg)=>evaluate(actor,`crossTab.${fn}(${JSON.stringify(arg)??''})`);
 const generation='stale-renew-'+randomUUID();
 for(const [actor,role]of [[primary,'primary'],[peer,'peer']]){
  await call(actor,'prepare',{role,generation,scenario:'save-save-same-key',iterations:1,clock:{wall:100000,mono:0,origin:'stale-renew'}});
  await call(actor,'proBoot',{primary:role==='primary',budget:60000,revalidateBudget:1000});
 }
 assert(await call(primary,'proReady'));assert(await call(peer,'proReady'));
 assert((await call(primary,'proPacket',{id:'old'})).ok);
 await call(primary,'evidenceClockSet',{wall:102000,mono:2000});
 await call(peer,'evidenceClockSet',{wall:102000,mono:2000});
 const held=await evaluate(primary,`(async()=>{
  const a=JSON.parse(localStorage.getItem('soundCruiseProAuth'));
  let release,begin;const begun=new Promise(r=>begin=r),held=new Promise(r=>release=r);
  const client=SoundCruiseProDeviceSession.createClient({isCurrent:x=>JSON.parse(localStorage.getItem('soundCruiseProAuth')||'null')?.credential===x.credential,
   request:async(path,options)=>{const r=await fetch('/v2/pro-auth'+path,options),body=await r.json();if(path.endsWith('/renew')&&r.status===200){begin();await held;}return {status:r.status,body};}});
  const delayed=client.validate(a,{force:true});
  window.staleRenewFixture={a,client,delayed,release};await begun;return true;
 })()`);
 assert(held);record('successful synthetic renew response held before formal client acceptance');
 await call(primary,'proServer','terminal');
 await evaluate(primary,`(()=>{const remove=Storage.prototype.removeItem;staleRenewFixture.remove=remove;
  Storage.prototype.removeItem=function(key){if(key==='soundCruiseProAuth')throw Error('isolated auth-delete failure');return remove.call(this,key);};return true;})()`);
 const terminal=await evaluate(primary,`SoundCruiseProOperationSource.validate(staleRenewFixture.a).then(r=>({terminal:r.terminal,propagated:r.propagated}))`);
 assert(terminal.terminal&&terminal.propagated);assert((await call(primary,'proServerState')).terminalResponses>0);
 assert.equal((await call(primary,'proPacket',{id:'after-terminal'})).ok,false);
 assert.equal((await call(primary,'proCommit','old')).ok,false);
 const marked=await evaluate(primary,`JSON.parse(localStorage.getItem('soundCruiseProRevokePending')).includes(staleRenewFixture.a.credential)`);
 assert(marked);record('terminal observed / Adapter rejects / old prepared operation rejects / pending persisted',terminal);
 const delayed=await evaluate(primary,`(async()=>{const x=staleRenewFixture;x.release();const r=await x.delayed;return {ok:r.ok,receiptRecreated:(await x.client.allowance(x.a)).ok,durable:await x.client.isRevoked(x.a)};})()`);
 assert.equal(delayed.ok,false);assert.equal(delayed.receiptRecreated,false);assert(delayed.durable);
 record('released renew Promise completed without recreating revoked receipt',delayed);
 // Persistent auth-delete failure must keep pending. The normal online handler
 // is used, not extracted flushPending code. Then recover only the injected fault.
 await evaluate(primary,"dispatchEvent(new Event('online'));true");
 assert(await evaluate(primary,"JSON.parse(localStorage.getItem('soundCruiseProRevokePending')||'[]').includes(staleRenewFixture.a.credential)"));
 record('pending retained while auth removal fails');
 await evaluate(primary,"Storage.prototype.removeItem=staleRenewFixture.remove;dispatchEvent(new Event('online'));true");
 let flushed=false;for(let i=0;i<200;i++){
  if(await evaluate(primary,"localStorage.getItem('soundCruiseProRevokePending')===null")){flushed=true;break;}
  await new Promise(r=>setTimeout(r,5));
 }
 assert(flushed,'inconclusive: formal online flush did not finish');
 assert(await evaluate(primary,'staleRenewFixture.client.isRevoked(staleRenewFixture.a)'));
 record('formal online / revoke ACK clears pending only after local recovery; durable fence remains');
 await call(peer,'proServer','offline');await call(peer,'proFreshAdapter');
 const proof=await call(peer,'proPacket',{id:'offline-peer'});
 const newCommit=proof.ok?(await call(peer,'proCommit','offline-peer')).ok:false;
 assert.equal(proof.ok,false);assert.equal(newCommit,false);
 const fresh=await evaluate(primary,`(async()=>{const c=SoundCruiseProDeviceSession.createClient({isCurrent:()=>true});return {durable:await c.isRevoked(staleRenewFixture.a),allowance:(await c.allowance(staleRenewFixture.a)).ok};})()`);
 assert(fresh.durable);assert.equal(fresh.allowance,false);record('fresh client / distinct renderer offline denial after pending ACK',fresh);
 const oldIdentity=await evaluate(primary,'staleRenewFixture.a');
 await reloadPeer();
 const afterReload=await evaluate(peer,`(async()=>{await import('/apps/shared/pro-device-session.js');const a=${JSON.stringify(oldIdentity)},c=SoundCruiseProDeviceSession.createClient({isCurrent:()=>true});const databases=await indexedDB.databases();return {durable:await c.isRevoked(a),allowance:(await SoundCruiseProDeviceSession.createReadOnlyClient().allowance(a)).ok,proSchema:databases.find(d=>d.name==='sound-cruise-pro-device-session-v1')?.version};})()`);
 assert(afterReload.durable);assert.equal(afterReload.allowance,false);assert.equal(afterReload.proSchema,1);
 record('fresh document reload retains revocation with unchanged Pro DB schema',afterReload);
 // A new synthetic qualification uses the same browser key, never the old receipt.
 await call(primary,'proBoot',{primary:true,budget:60000,revalidateBudget:1000});assert(await call(primary,'proReady'));
 assert((await call(primary,'proPacket',{id:'new-B'})).ok);assert((await call(primary,'proCommit','new-B')).ok);
 record('new qualification B still authorizes and commits normally');
 return results;
}
