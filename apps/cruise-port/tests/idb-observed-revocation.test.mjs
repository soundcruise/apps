import test from 'node:test';
import assert from 'node:assert/strict';
import {proFixture} from './authority-store/pro-device-fixture.mjs';
const commit=(x,p)=>x.store.commit(p.handle,{commitGuard:p.proof.commitGuard});
async function retire(x){
 x.db.raw.prepare('UPDATE pro_credentials SET revoked_at=? WHERE id=?').run(x.clock.wall,x.auth().credential.split('.')[1]);
 x.clock.wall+=13*3600000;x.clock.mono+=13*3600000;
 await assert.rejects(x.adapter.authorize({generation:'g1',operationId:'observed-denial',action:'saveAdvanced'}),/pro-required/);
}
test('regression: observed real Worker terminal denial rejects old prepared handle',async t=>{
 const x=await proFixture(t),p=await x.prepare();await retire(x);const r=await commit(x,p);
 assert.equal(r.ok,false,JSON.stringify({terminalObserved:true,sameAdapter:true,samePreparedHandle:true,oldCommitOk:r.ok,oldCommitStatus:r.status}));
});
test('regression: observed terminal denial prevents fresh offline proof',async t=>{
 const x=await proFixture(t);await retire(x);x.offline=true;
 let proof;try{proof=await x.adapter.authorize({generation:'g1',operationId:'offline-after-denial',action:'saveAdvanced'});}catch(e){assert.equal(e.code,'pro-required');return;}
 const p=await x.prepare({id:'offline-after-denial',authorization:proof}),r=await commit(x,p);
 assert.equal(r.ok,false,JSON.stringify({terminalObserved:true,offline:true,newProofIssued:true,commitOk:r.ok,commitStatus:r.status}));
});
test('regression: nonfinite wall observed before guard invalidates the old proof',async t=>{
 const x=await proFixture(t),p=await x.prepare(),wall=x.clock.wall;x.clock.wall=NaN;assert.equal((await commit(x,p)).ok,false);x.clock.wall=wall;
 const r=await commit(x,p);assert.equal(r.ok,false,JSON.stringify({nonfiniteObserved:true,sameHandle:true,normalizedClock:true,commitOk:r.ok,commitStatus:r.status}));
});

import {createAuthorityProDeviceAdapter} from '../port-authority-pro-device-adapter.mjs';
import {openIDBAuthorityStore} from '../port-indexeddb-authority-store.mjs';
import {IDBObjectStore} from './authority-store/pro-device-fixture.mjs';
const AUTH='soundCruiseProAuth',EPOCH='soundCruiseProOperationEpoch',PENDING='soundCruiseProRevokePending';
const advance=x=>{x.clock.wall+=13*3600000;x.clock.mono+=13*3600000;};
const authorize=(x,id,adapter=x.adapter)=>adapter.authorize({generation:'g1',operationId:id,action:'saveAdvanced'});
for(const mode of ['same-adapter','new-adapter','offline-reload-source'])test('terminal denial rejects '+mode,async t=>{
 const x=await proFixture(t);await retire(x);x.offline=true;
 if(mode==='offline-reload-source'){x.reloadSource();x.store.dispose();x.store=await openIDBAuthorityStore(x.scope);}
 const a=mode==='same-adapter'?x.adapter:await createAuthorityProDeviceAdapter({scope:x.scope});t.after(()=>a.dispose());
 await assert.rejects(authorize(x,mode,a),/pro-required/);
});
test('actual Worker generation retirement is terminal; pending identity and receipt cleanup are awaited',async t=>{
 const x=await proFixture(t),old=x.auth(),p=await x.prepare();x.db.raw.prepare('UPDATE pro_auth_state SET generation=generation+1').run();advance(x);
 const r=await SoundCruiseProOperationSource.validate(old);assert.equal(r.denial.reason,'reauth_required');assert(r.propagated);assert(!r.propagationFailed);
 assert.equal(x.auth(),null);assert(JSON.parse(x.storage.getItem(PENDING)).includes(old.credential));assert.equal((await x.client.allowance(old)).ok,false);assert.equal((await commit(x,p)).ok,false);
});
test('concurrent duplicate terminal validation is idempotent and binds request / receipt / revision',async t=>{
 const x=await proFixture(t),a=x.auth();advance(x);x.transport.setResponse({status:401,body:{ok:false,code:'invalid_credential'}});
 const [one,two]=await Promise.all([SoundCruiseProOperationSource.validate(a),SoundCruiseProOperationSource.validate(a)]);
 assert(one.propagated&&two.propagated);assert.equal(one.denial.validationId,two.denial.validationId);assert.match(one.denial.credentialFingerprint,/^[a-f0-9]{64}$/);assert.match(one.denial.operationRevisionFingerprint,/^[a-f0-9]{64}$/);assert.match(one.denial.receiptIdentity,/^receipt:[A-Za-z0-9_-]{43}$/);
 assert.equal(JSON.parse(x.storage.getItem(PENDING)).filter(v=>v===a.credential).length,1);assert(!JSON.stringify(one).includes(a.credential));
});
for(const mode of ['503','429','network','timeout'])test(mode+' retains a bounded valid grant without shared invalidation',async t=>{
 const x=await proFixture(t),a=x.auth(),epoch=x.storage.getItem(EPOCH);advance(x);
 x.transport.setResponse(mode==='network'||mode==='timeout'?{throw:mode}:{status:Number(mode),body:{ok:false,code:'invalid_credential'}});
 const p=await x.prepare({id:mode});assert((await commit(x,p)).ok);assert.deepEqual(x.auth(),a);assert.equal(x.storage.getItem(EPOCH),epoch);assert.equal(x.storage.getItem(PENDING),null);
});
for(const response of [
 {status:401,body:{ok:false,code:'device_session_mismatch'}},
 {status:401,body:{ok:false,code:'invalid_session_proof'}},
 {status:401,body:{ok:false}},
 {status:401,body:{ok:true,code:'invalid_credential'}},
 {status:403,body:{ok:false,code:'invalid_credential'}},
 {status:200,body:{ok:false,code:'invalid_credential'}},
 {status:401,body:null}
])test('ambiguous denial refuses new authorization but never revokes unrelated qualification '+JSON.stringify(response),async t=>{
 const x=await proFixture(t),a=x.auth(),epoch=x.storage.getItem(EPOCH);advance(x);x.transport.setResponse(response);
 await assert.rejects(authorize(x,'ambiguous'),/pro-required/);assert.deepEqual(x.auth(),a);assert.equal(x.storage.getItem(EPOCH),epoch);assert.equal(x.storage.getItem(PENDING),null);
});
test('late A terminal denial preserves already-issued B epoch, receipt and prepared proof',async t=>{
 const x=await proFixture(t),a=x.auth(),old=await x.prepare({id:'A'});advance(x);
 const gate=x.transport.delay();x.transport.setResponse({status:401,body:{ok:false,code:'invalid_credential'}});
 const delayed=SoundCruiseProOperationSource.validate(a);await gate.begun;
 const b=await x.login();x.transport.setResponse(null);const fresh=await x.prepare({id:'B'}),epoch=x.storage.getItem(EPOCH);
 x.transport.setResponse({status:401,body:{ok:false,code:'invalid_credential'}});gate.release();const denial=await delayed;
 assert(denial.propagated);assert(denial.stale);assert.deepEqual(x.auth(),b);assert.equal(x.storage.getItem(EPOCH),epoch);assert((await x.client.allowance(b)).ok);assert.equal((await x.client.allowance(a)).ok,false);
 assert.equal((await commit(x,old)).ok,false);assert((await commit(x,fresh)).ok);
});
for(const fault of ['pending-write','auth-delete','receipt-delete'])test('shared cleanup '+fault+' failure fails closed without reporting propagation complete',async t=>{
 const x=await proFixture(t),a=x.auth(),p=await x.prepare();advance(x);x.transport.setResponse({status:401,body:{ok:false,code:'invalid_credential'}});
 const set=x.storage.setItem,remove=x.storage.removeItem,del=IDBObjectStore.prototype.delete;
 if(fault==='pending-write')x.storage.setItem=(k,v)=>{if(k===PENDING)throw Error('isolated storage failure');return set(k,v);};
 if(fault==='auth-delete')x.storage.removeItem=k=>{if(k===AUTH)throw Error('isolated storage failure');return remove(k);};
 if(fault==='receipt-delete')IDBObjectStore.prototype.delete=function(...args){if(this.name==='state')throw Error('isolated IDB failure');return del.apply(this,args);};
 let r;try{r=await SoundCruiseProOperationSource.validate(a);}finally{x.storage.setItem=set;x.storage.removeItem=remove;IDBObjectStore.prototype.delete=del;}
 if(fault==='auth-delete')assert(r.propagated);else assert(r.propagationFailed);
 assert.equal((await commit(x,p)).ok,false);x.offline=true;await assert.rejects(authorize(x,'cleanup-failure'),/pro-required/);
 x.reloadSource();const adapter=await createAuthorityProDeviceAdapter({scope:x.scope});t.after(()=>adapter.dispose());await assert.rejects(authorize(x,'after-crash',adapter),/pro-required/);
});
test('terminal retry cannot reauthorize old identity; committed replay remains a historical non-publishing fact',async t=>{
 const x=await proFixture(t),committed=await x.prepare({id:'committed'});assert((await commit(x,committed)).ok);const pending=await x.prepare({id:'pending'});await retire(x);
 await assert.rejects(x.adapter.authorize({generation:'g1',operationId:'pending',action:'saveAdvanced',expectedIdentity:pending.identity.authorizationIdentity}),/pro-required/);
 assert.equal((await commit(x,pending)).ok,false);const replay=await commit(x,committed);assert(replay.ok&&replay.replayed);assert.equal(replay.publish,false);assert.notEqual(replay.operationAuthorized,true);
});
for(const kind of ['wall-infinity','mono-nan','mono-infinity','wall-throws','mono-throws'])test('invalid clock '+kind+' irreversibly closes old proof even after normalization',async t=>{
 const x=await proFixture(t),p=await x.prepare(),field=kind.startsWith('wall')?'wall':'mono',value=x.clock[field];
 if(kind.endsWith('throws'))x.clock[field==='wall'?'throwWall':'throwMono']=true;else x.clock[field]=kind.endsWith('nan')?NaN:Infinity;
 let result,error;try{result=await commit(x,p);}catch(e){error=e;}finally{x.clock[field]=value;delete x.clock.throwWall;delete x.clock.throwMono;}
 assert.equal(error,undefined);assert.equal(result.ok,false);assert.equal((await commit(x,p)).ok,false);
});
test('full five minute wall correction remains accepted',async t=>{const x=await proFixture(t),p=await x.prepare();x.clock.wall-=300000;assert((await commit(x,p)).ok);});
test('tampered raw receipt cannot authorize offline or replace the formal encrypted proof',async t=>{
 const x=await proFixture(t);const db=await new Promise((ok,no)=>{const q=x.factory.open('sound-cruise-pro-device-session-v1');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
 await new Promise((ok,no)=>{const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),q=store.openCursor();q.onsuccess=()=>{const c=q.result;if(!c)return;if(String(c.key).startsWith('receipt:')){const v=c.value;v.ciphertext=new Uint8Array([1,2,3]);store.put(v,c.key);}c.continue();};tx.oncomplete=ok;tx.onabort=tx.onerror=()=>no(tx.error);});db.close();
 x.offline=true;await assert.rejects(authorize(x,'tampered-receipt'),/pro-required/);
});
for(const endpoint of ['challenge','renew','session'])for(const code of ['invalid_credential','reauth_required'])test('formal '+endpoint+' '+code+' binds and propagates only the requested qualification',async t=>{
 const x=await proFixture(t),a=x.auth();advance(x);
 x.transport.setResponse(url=>endpoint==='session'&&url.endsWith('/challenge')?{status:404,body:{ok:false,code:'not_found'}}:url.endsWith('/'+endpoint)?{status:401,body:{ok:false,code}}:null);
 const r=await SoundCruiseProOperationSource.validate(a);assert(r.terminal&&r.propagated);assert.equal(r.denial.endpoint,endpoint);assert.equal(r.denial.reason,code);assert.equal(x.auth(),null);
});
test('inflight UI validation cannot supply a denial tagged to a different operation revision',async t=>{
 const x=await proFixture(t),a=x.auth();x.transport.setResponse({status:401,body:{ok:false,code:'invalid_credential'}});const gate=x.transport.delay();
 const ui=x.client.validate(a,{force:true});await gate.begun;const operation=await x.client.validate({...a,operationRevision:'formal-operation-revision'},{force:true});gate.release();const old=await ui;
 assert(old.terminal&&operation.terminal);assert.notEqual(old.denial.validationId,operation.denial.validationId);assert.equal(old.denial.operationRevisionFingerprint,null);assert.match(operation.denial.operationRevisionFingerprint,/^[a-f0-9]{64}$/);
});
test('same A revision change cannot prevent terminal cleanup or leave a peer proof usable',async t=>{
 const x=await proFixture(t),a=x.auth();advance(x);const gate=x.transport.delay();x.transport.setResponse({status:401,body:{ok:false,code:'invalid_credential'}});
 const delayed=SoundCruiseProOperationSource.validate(a);await gate.begun;x.storage.setItem(EPOCH,'same-credential-next-revision');x.transport.setResponse(null);
 const later=await x.prepare({id:'same-A-next-revision'});x.transport.setResponse({status:401,body:{ok:false,code:'invalid_credential'}});gate.release();assert((await delayed).propagated);
 assert.equal(x.auth(),null);assert.equal((await commit(x,later)).ok,false);x.storage.removeItem(PENDING);x.reloadSource();const adapter=await createAuthorityProDeviceAdapter({scope:x.scope});t.after(()=>adapter.dispose());x.offline=true;await assert.rejects(authorize(x,'after-pending-flush',adapter),/pro-required/);
});
