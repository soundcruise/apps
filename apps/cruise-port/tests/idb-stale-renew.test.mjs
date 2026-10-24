import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proFixture,IDBObjectStore} from './authority-store/pro-device-fixture.mjs';
import {createAuthorityProDeviceAdapter} from '../port-authority-pro-device-adapter.mjs';

// Real Worker response, held AFTER successful processing, never a production request.
test('revoked A cannot regain a receipt or fresh offline proof after delayed success and pending ACK',async t=>{
 const x=await proFixture(t),a=x.auth(),old=await x.prepare({id:'old-A'});
 const original=Response.prototype.json,remove=x.storage.removeItem;
 let release,begin,holding=true;const begun=new Promise(r=>begin=r),held=new Promise(r=>release=r);
 t.after(()=>{Response.prototype.json=original;x.storage.removeItem=remove;release?.();});
 x.clock.wall+=13*3600000;x.clock.mono+=13*3600000;
 Response.prototype.json=async function(){const b=await original.call(this);if(holding&&this.status===200&&b.session?.version===3){holding=false;begin();await held;}return b;};
 const delayed=x.client.validate(a,{force:true});await begun;
 x.db.raw.prepare('UPDATE pro_credentials SET revoked_at=?').run(x.clock.wall);
 x.storage.removeItem=k=>{if(k==='soundCruiseProAuth')throw Error('isolated auth-delete failure');return remove(k);};
 const denial=await SoundCruiseProOperationSource.validate(a);
 assert(denial.terminal);assert(denial.propagated);assert(x.auth());
 assert.equal((await x.store.commit(old.handle,{commitGuard:old.proof.commitGuard})).ok,false);
 release();await delayed;
 const receiptRecreated=(await x.client.allowance(a)).ok;
 // The isolated auth-delete fault ends before normal recovery/ACK. Its RED
 // version and bytes are preserved outside the repo. No safety assertion removed.
 x.storage.removeItem=remove;
 const source=readFileSync(new URL('../../shared/pro-gate.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('async function flushPending()'),source.indexOf('    async function reset()'));
 let acks=0;
 await new Function('get','put','remove','request','PENDING_KEY','forget','AUTH_KEY','observedTerminalCredentials',`return (${body})()`)(
  x.storage.getItem,x.storage.setItem,x.storage.removeItem,async(path)=>{assert.equal(path,'/revoke');acks++;return {status:200,body:{ok:true}};},
  'soundCruiseProRevokePending',async(auth,options)=>{try{await x.client.forget(auth,options);return await x.client.isRevoked(auth);}catch{return false;}},
  'soundCruiseProAuth',new Set());
 assert.equal(acks,1);assert.equal(x.storage.getItem('soundCruiseProRevokePending'),null);
 x.offline=true;x.reloadSource();const fresh=await createAuthorityProDeviceAdapter({scope:x.scope});t.after(()=>fresh.dispose());
 let newProof=false,newCommit=false;
 try{const proof=await fresh.authorize({generation:'g1',operationId:'revived-A',action:'saveAdvanced'});newProof=true;
  const p=await x.prepare({id:'revived-A',authorization:proof});newCommit=(await x.store.commit(p.handle,{commitGuard:proof.commitGuard})).ok;
 }catch(e){assert.equal(e.code,'pro-required');}
 t.diagnostic(JSON.stringify({terminalObserved:true,authDeleteFailed:true,receiptRecreated,newProof,newCommit,pendingAckCompleted:true}));
 assert.equal(receiptRecreated,false,'revoked receipt resurrected');assert.equal(newProof,false);assert.equal(newCommit,false);
});

// Unit execution of the unchanged production cleanup body. Full event-driven
// flushPending is covered separately by the native suite.
async function cleanupUnit(x, reply) {
 const source=readFileSync(new URL('../../shared/pro-gate.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('async function flushPending()'),source.indexOf('    async function reset()'));
 let acks=0;
 await new Function('get','put','remove','request','PENDING_KEY','forget','AUTH_KEY','observedTerminalCredentials',`return (${body})()`)(
  x.storage.getItem,x.storage.setItem,x.storage.removeItem,async path=>{assert.equal(path,'/revoke');acks++;return reply;},
  'soundCruiseProRevokePending',async(a,o)=>{try{await x.client.forget(a,o);return await x.client.isRevoked(a);}catch{return false;}},
  'soundCruiseProAuth',new Set());
 return acks;
}
for(const mode of ['auth-delete','fence-read','503','429','ambiguous-401','ambiguous-403'])test('pending is retained when cleanup is incomplete: '+mode,async t=>{
 const x=await proFixture(t),a=x.auth();x.clock.wall+=13*3600000;x.clock.mono+=13*3600000;
 const remove=x.storage.removeItem,get=IDBObjectStore.prototype.get;
 t.after(()=>{x.storage.removeItem=remove;IDBObjectStore.prototype.get=get;});
 if(mode==='auth-delete')x.storage.removeItem=k=>{if(k==='soundCruiseProAuth')throw Error('isolated removal failure');return remove(k);};
 x.transport.setResponse({status:401,body:{ok:false,code:'invalid_credential'}});
 assert((await SoundCruiseProOperationSource.validate(a)).propagated);
 if(mode==='fence-read')IDBObjectStore.prototype.get=function(...args){if(this.name==='state'&&String(args[0]).startsWith('receipt:'))throw Error('isolated fence failure');return get.apply(this,args);};
 const status=mode==='503'?503:mode==='429'?429:mode==='ambiguous-401'?401:mode==='ambiguous-403'?403:200;
 const count=await cleanupUnit(x,{status,body:status===200?{ok:true}:{ok:false,code:'unknown_denial'}});
 assert.equal(count,mode==='auth-delete'||mode==='fence-read'?0:1);
 assert(JSON.parse(x.storage.getItem('soundCruiseProRevokePending')).includes(a.credential));
 IDBObjectStore.prototype.get=get;x.storage.removeItem=remove;x.offline=true;x.reloadSource();
 const adapter=await createAuthorityProDeviceAdapter({scope:x.scope});t.after(()=>adapter.dispose());
 await assert.rejects(adapter.authorize({generation:'g1',operationId:'after-'+mode,action:'saveAdvanced'}),/pro-required/);
});
test('successful A pending cleanup preserves B identity, epoch, receipt and prepared operation',async t=>{
 const x=await proFixture(t),a=x.auth();x.clock.wall+=13*3600000;x.clock.mono+=13*3600000;
 x.transport.setResponse({status:401,body:{ok:false,code:'invalid_credential'}});
 assert((await SoundCruiseProOperationSource.validate(a)).propagated);x.transport.setResponse(null);
 const b=await x.login(),p=await x.prepare({id:'B-before-A-cleanup'}),epoch=x.storage.getItem('soundCruiseProOperationEpoch');
 assert.equal(await cleanupUnit(x,{status:200,body:{ok:true}}),1);
 assert.equal(x.storage.getItem('soundCruiseProRevokePending'),null);assert.deepEqual(x.auth(),b);
 assert.equal(x.storage.getItem('soundCruiseProOperationEpoch'),epoch);assert((await x.client.allowance(b)).ok);
 assert(await x.client.isRevoked(a));assert.equal(await x.client.isRevoked(b),false);
 assert((await x.store.commit(p.handle,{commitGuard:p.proof.commitGuard})).ok);
});
