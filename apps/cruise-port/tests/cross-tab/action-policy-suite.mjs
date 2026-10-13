import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runActionPolicySuite({evaluate,primary,peer}) {
 const cases=[];const record=name=>cases.push({name,pass:true});
 const opts=role=>JSON.stringify({role,generation,policy:true});let generation=randomUUID();
 await evaluate(primary,`crossTab.prepare(${opts('primary')})`);await evaluate(peer,`crossTab.prepare(${opts('peer')})`);
 const call=(s,name,arg)=>evaluate(s,`crossTab.${name}(${JSON.stringify(arg)})`);
 const p=await call(primary,'policyPrepare',{id:'pro-no-guard'});
 assert.equal((await evaluate(primary,"crossTab.policyCommit('pro-no-guard',false)")).reason,'operation-commit-guard-required');record('Pro policy denies missing guard in native transaction');
 const flip=structuredClone(p);flip.requiresAuthorization=false;
 assert.equal((await call(peer,'policyRetry',flip)).reason,'operation-commit-guard-required');record('peer retry cannot remove Pro requirement');
 const altered=structuredClone(p);altered.action='saveBpm';delete altered.authorizationPolicy;
 assert.equal((await call(peer,'policyRetry',altered)).reason,'operation-id-payload-conflict');record('different renderer cannot substitute uncommitted action');
 const evil=await call(peer,'policyPrepare',{id:'spoof',action:'saveBpm',fields:{volume:98}});
 assert.equal((await evaluate(peer,"crossTab.policyCommit('spoof')")).reason,'action-semantics-invalid');record('Standard action cannot write advanced fields');
 assert.equal((await evaluate(peer,`crossTab.policyRetry(${JSON.stringify(p)},{authorized:true})`)).ok,true);record('peer retries original Pro identity with fresh trusted guard');
 const replay=await call(primary,'policyRetry',p);assert.equal(replay.replayed,true);assert.equal(replay.publish,false);record('oplog replay has no current authorization or publish permission');
 await call(primary,'policyPrepare',{id:'standard',action:'saveBpm',fields:{bpm:146}});
 assert.equal((await evaluate(primary,"crossTab.policyCommit('standard')")).ok,true);record('local Standard BPM needs no Account/device/Pro');
 await call(peer,'policyPrepare',{id:'revoked'});await evaluate(peer,'crossTab.policyRevoke()');
 assert.equal((await evaluate(peer,"crossTab.policyCommit('revoked')")).reason,'operation-authorization-rejected');record('synchronous fixture revoke before final commit denies');
 assert.equal((await call(primary,'lookup','revoked')).result,null);const s=await evaluate(primary,'crossTab.snapshot()');assert.equal(s.head.seq,3);
 const integrity=await evaluate(primary,'crossTab.integrity()');assert.equal(integrity.logs,integrity.seq);assert.equal(integrity.logs,integrity.unique);assert.equal(integrity.partial,0);record('denials create no commit fact or partial manifest');
 return {cases,integrity};
}
