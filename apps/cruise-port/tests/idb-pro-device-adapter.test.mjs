import test from 'node:test';
import assert from 'node:assert/strict';
import {proFixture,IDBObjectStore,dump} from './authority-store/pro-device-fixture.mjs';
import {createAuthorityProDeviceAdapter} from '../port-authority-pro-device-adapter.mjs';
import {claimPortAuthorityIssuer,openIDBAuthorityStore} from '../port-indexeddb-authority-store.mjs';
import {digest} from '../port-idb-authority-contract.mjs';
import {openIsolatedIDBRepositoryBackend} from '../port-indexeddb-repository-backend.mjs';
const settings='cruisePort.metronome',presets='cruisePort.metronomePresets';
const commit=(x,p)=>x.store.commit(p.handle,{commitGuard:p.proof.commitGuard});
test('formal shared gate / encrypted receipt / real Worker authorize Account-free advanced save',async t=>{
 const x=await proFixture(t),p=await x.prepare();assert(p.reserved.ok);assert.equal(p.identity.authorizationIdentity.sessionVersion,3);assert.equal(p.identity.authorizationIdentity.credentialFingerprint,digest(x.auth().credential));
 const r=await commit(x,p);assert(r.ok);assert.equal(r.publish,false);assert.equal((await x.store.hydrate('g1')).snapshot.control.identity.ownership,'unbound-local');
 const rows=JSON.stringify(await dump(x));assert(!rows.includes(x.auth().credential));assert(!rows.includes('privateKey'));assert(!rows.includes('ciphertext'));
});
for(const action of ['createPreset','applyPresetAdvanced'])test('formal Pro '+action,async t=>{
 const x=await proFixture(t),s=(await x.store.hydrate('g1')).snapshot,old=JSON.parse(s.values[presets]);
 const item={id:'new-preset',name:'Fixture',...JSON.parse(s.values[settings]),createdAt:1,updatedAt:1};delete item.version;
 let changes,operationData=null,dependencyKeys=[];
 if(action==='createPreset')changes={[presets]:JSON.stringify({...old,items:[...old.items,item]})};
 else{const preset=old.items[0];operationData={presetId:preset.id};dependencyKeys=[presets];const {settingsFromMetronomePreset}=await import('../metronome-presets-store.js');changes={[settings]:JSON.stringify({...JSON.parse(s.values[settings]),...settingsFromMetronomePreset(preset)})};}
 const p=await x.prepare({action,changes,operationData,dependencyKeys});assert((await commit(x,p)).ok);
});
for(const action of ['saveBpm','deletePreset','applyPresetStandard'])test('Standard '+action+' needs neither Account nor Pro and retains raw advanced',async t=>{
 const x=await proFixture(t);x.storage.removeItem('soundCruiseProAuth');const base=(await x.store.hydrate('g1')).snapshot,old=JSON.parse(base.values[settings]),ps=JSON.parse(base.values[presets]);
 let changes,operationData=null,dependencyKeys=[];
 if(action==='deletePreset')changes={[presets]:JSON.stringify({...ps,items:ps.items.slice(1)})};
 else{const bpm=action==='saveBpm'?145:ps.items[0].bpm;changes={[settings]:JSON.stringify({...old,bpm})};if(action==='applyPresetStandard'){operationData={presetId:ps.items[0].id};dependencyKeys=[presets];}}
 const h=x.store.prepare({base,operationId:action,action,changes,operationData,dependencyKeys});assert((await x.store.commit(h)).ok);const after=JSON.parse((await x.store.hydrate('g1')).snapshot.values[settings]);for(const k of ['volume','sound','meter','rhythm','accents'])assert.deepEqual(after[k],old[k]);
});
for(const kind of ['missing','plain','boolean','clone','Control'])test('direct Store rejects '+kind+' proof / guard',async t=>{
 const x=await proFixture(t),base=(await x.store.hydrate('g1')).snapshot;
 let token=kind==='plain'?Object.freeze({authorized:true,isPro:true,expiresAt:Infinity}):kind==='boolean'?true:undefined;
 if(kind==='clone')token=Object.freeze(structuredClone((await x.adapter.authorize({generation:'g1',operationId:'bypass',action:'saveAdvanced'})).authorizationContext));
 if(kind==='Control')token=claimPortAuthorityIssuer(x.scope).issue('control:renew',{generation:'g1'});
 let h;try{h=x.store.prepare({base,operationId:'bypass',action:'saveAdvanced',changes:{[settings]:JSON.stringify({...JSON.parse(base.values[settings]),volume:85})},authorizationContext:token});}catch(e){assert.equal(kind,'boolean');assert.equal(e.code,'operation-context-invalid');return;}
 assert.equal((await x.store.commit(h,{commitGuard:()=>({ok:true,policy:'pro',generation:1,credentialFingerprint:'a'.repeat(64),wallMarginMs:60000,monoMarginMs:60000})})).ok,false);
});
test('caller source/client/clock injection is not an Adapter proof source',async t=>{const x=await proFixture(t);await assert.rejects(createAuthorityProDeviceAdapter({scope:x.scope,source:()=>({isPro:true}),client:{validate:()=>true}}));});
test('UI/fake source validation with no verified receipt cannot grant Pro',async t=>{
 const x=await proFixture(t),auth=x.auth();const db=await new Promise(r=>{const q=x.factory.open('sound-cruise-pro-device-session-v1');q.onsuccess=()=>r(q.result);});await new Promise(r=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').clear();tx.oncomplete=r;});db.close();
 SoundCruiseProOperationSource=Object.freeze({read:()=>({auth,revoked:false,revision:'fake-ui'}),validate:async()=>({ok:true,generation:auth.generation,offlineRemainingMs:60000})});const a=await createAuthorityProDeviceAdapter({scope:x.scope});await assert.rejects(a.authorize({generation:'g1',operationId:'ui',action:'saveAdvanced'}));
});
for(const source of ['wall','mono'])for(const seconds of [29,30,31])test(source+' margin '+seconds+' seconds',async t=>{
 const x=await proFixture(t),p=await x.prepare(),grace=7*86400000;
 if(source==='wall')x.clock.wall+=grace-seconds*1000;else{x.clock.wall+=grace-60000;x.clock.mono+=grace-seconds*1000;}
 const r=await commit(x,p);assert.equal(r.ok,seconds>=30,r.reason);
});
for(const kind of ['reset','pending','revoke','generation','sessionVersion','revision','credential','mono-expired','wall-expired','origin','mono-backward','wall-large-rollback'])test('stale prepared proof rejects '+kind+' and never revives',async t=>{
 const x=await proFixture(t),p=await x.prepare(),auth=x.auth(),wall=x.clock.wall,mono=x.clock.mono;
 if(['reset','revoke'].includes(kind))x.storage.removeItem('soundCruiseProAuth');
 if(kind==='pending')x.storage.setItem('soundCruiseProRevokePending',JSON.stringify([auth.credential]));
 if(kind==='generation')x.change({generation:2});if(kind==='sessionVersion')x.change({sessionVersion:2});if(kind==='revision')x.storage.setItem('soundCruiseProOperationEpoch','new-epoch');
 if(kind==='credential')x.change({credential:auth.credential.slice(0,-1)+'B'});if(kind==='mono-expired')x.clock.mono+=7*86400000;if(kind==='wall-expired')x.clock.wall+=7*86400000;
 if(kind==='origin')x.clock.origin='changed-origin';if(kind==='mono-backward')x.clock.mono=-1;if(kind==='wall-large-rollback')x.clock.wall-=300001;
 const before=(await x.store.hydrate('g1')).snapshot;assert.equal((await commit(x,p)).ok,false);
 x.storage.setItem('soundCruiseProAuth',JSON.stringify(auth));x.storage.removeItem('soundCruiseProRevokePending');x.clock.wall=wall;x.clock.mono=mono;x.clock.origin='pro-origin';
 assert.equal((await commit(x,p)).ok,false);assert.deepEqual((await x.store.hydrate('g1')).snapshot,before);
});
test('Pro keeps existing small wall correction tolerance',async t=>{const x=await proFixture(t),p=await x.prepare();x.clock.wall-=30000;assert((await commit(x,p)).ok);});
test('dispose/reopen rejects old proof; newly authorized operation succeeds',async t=>{
 const x=await proFixture(t),p=await x.prepare();x.store.dispose();x.store=await openIDBAuthorityStore(x.scope);assert.equal((await x.store.commit(p.handle,{commitGuard:p.proof.commitGuard})).ok,false);
 const adapter=await createAuthorityProDeviceAdapter({scope:x.scope}),auth=await adapter.authorize({generation:'g1',operationId:'fresh-reopen',action:'saveAdvanced'}),base=(await x.store.hydrate('g1')).snapshot;
 const h=x.store.prepare({base,operationId:'fresh-reopen',action:'saveAdvanced',changes:{[settings]:JSON.stringify({...JSON.parse(base.values[settings]),volume:85})},authorizationContext:auth.authorizationContext});assert((await x.store.commit(h,{commitGuard:auth.commitGuard})).ok);adapter.dispose();
});
test('offline valid receipt succeeds; known revoke and expired grant refuse',async t=>{
 const x=await proFixture(t);x.offline=true;const p=await x.prepare();assert((await commit(x,p)).ok);x.storage.setItem('soundCruiseProRevokePending',JSON.stringify([x.auth().credential]));await assert.rejects(x.adapter.authorize({generation:'g1',operationId:'offline-revoked',action:'saveAdvanced'}));
 x.storage.removeItem('soundCruiseProRevokePending');x.clock.wall+=8*86400000;x.clock.mono+=8*86400000;await assert.rejects(x.adapter.authorize({generation:'g1',operationId:'offline-expired',action:'saveAdvanced'}));
});
test('retry reauthorizes only original identity; historic replay ignores current Pro',async t=>{
 const x=await proFixture(t),p=await x.prepare(),identity=p.identity.authorizationIdentity;
 const renewed=await x.adapter.authorize({generation:'g1',operationId:'advanced',action:'saveAdvanced',expectedIdentity:identity});
 const next=await x.prepare({authorization:renewed,base:p.base});assert(next.reserved.ok);assert((await commit(x,next)).ok);
 x.storage.removeItem('soundCruiseProAuth');const replay=await commit(x,p);assert(replay.ok&&replay.replayed);assert.equal(replay.publish,false);assert.notEqual(replay.operationAuthorized,true);
});
for(const change of ['action','payload','target','credential','revision'])test('same operationId cannot retag '+change,async t=>{
 const x=await proFixture(t),p=await x.prepare();if(change==='credential')await x.login();if(change==='revision')x.storage.setItem('soundCruiseProOperationEpoch','new-revision');
 const action=change==='action'?'createPreset':'saveAdvanced',proof=await x.adapter.authorize({generation:'g1',operationId:'advanced',action});
 const changes=change==='target'?{[presets]:p.base.values[presets]}:change==='payload'?{[settings]:JSON.stringify({...JSON.parse(p.base.values[settings]),volume:75})}:{[settings]:JSON.stringify({...JSON.parse(p.base.values[settings]),volume:85})};
 const h=x.store.prepare({base:p.base,operationId:'advanced',action,changes,authorizationContext:proof.authorizationContext});assert.equal((await x.store.reserveOperation(h)).reason,'operation-id-payload-conflict');
});
test('abort preserves reservation, response loss recovers exact historical fact',async t=>{
 const x=await proFixture(t),p=await x.prepare(),before=(await x.store.hydrate('g1')).snapshot,add=IDBObjectStore.prototype.add;
 IDBObjectStore.prototype.add=function(...a){if(this.name==='records')this.transaction.abort();return add.apply(this,a);};try{assert.equal((await commit(x,p)).ok,false);}finally{IDBObjectStore.prototype.add=add;}
 assert.deepEqual((await x.store.hydrate('g1')).snapshot,before);assert((await commit(x,p)).ok);assert((await x.store.lookupOperation('g1','advanced')).ok);assert((await commit(x,p)).replayed);
});
test('Account present cannot substitute for absent Pro qualification',async t=>{
 const x=await proFixture(t,{bound:true});x.storage.removeItem('soundCruiseProAuth');await assert.rejects(x.adapter.authorize({generation:'g1',operationId:'account-only',action:'saveAdvanced'}));
 const base=(await x.store.hydrate('g1')).snapshot,h=x.store.prepare({base,operationId:'account-only',action:'saveAdvanced',changes:{[settings]:JSON.stringify({...JSON.parse(base.values[settings]),volume:85})}});assert.equal((await x.store.commit(h)).ok,false);
});
test('same branded context cannot bind a different payload or Authority generation',async t=>{
 const x=await proFixture(t),p=await x.prepare();assert.throws(()=>x.store.prepare({base:p.base,operationId:'advanced',action:'saveAdvanced',changes:{[settings]:JSON.stringify({...JSON.parse(p.base.values[settings]),volume:95})},authorizationContext:p.proof.authorizationContext}),/pro-operation-binding-changed/);
 const wrong=await x.adapter.authorize({generation:'other-generation',operationId:'wrong-generation',action:'saveAdvanced'});
 assert.throws(()=>x.store.prepare({base:p.base,operationId:'wrong-generation',action:'saveAdvanced',changes:{[settings]:JSON.stringify({...JSON.parse(p.base.values[settings]),volume:85})},authorizationContext:wrong.authorizationContext}),/pro-operation-binding-changed/);
});
for(const kind of ['expiry','revision','pending'])test('final synchronous guard catches '+kind+' after manifest read begins',async t=>{
 const x=await proFixture(t),p=await x.prepare(),before=(await x.store.hydrate('g1')).snapshot,get=IDBObjectStore.prototype.get;let crossed=false;
 IDBObjectStore.prototype.get=function(...a){const r=get.apply(this,a);if(this.name==='records')r.addEventListener('success',()=>{crossed=true;if(kind==='expiry')x.clock.wall+=7*86400000;else if(kind==='revision')x.storage.setItem('soundCruiseProOperationEpoch','during-manifest');else x.storage.setItem('soundCruiseProRevokePending',JSON.stringify([x.auth().credential]));},{once:true});return r;};
 try{assert.equal((await commit(x,p)).ok,false);}finally{IDBObjectStore.prototype.get=get;}
 assert(crossed);assert.deepEqual((await x.store.hydrate('g1')).snapshot,before);
});
test('real Repository backend captures formal Adapter context and commits with structured guard',async t=>{
 const x=await proFixture(t),backend=await openIsolatedIDBRepositoryBackend({scope:x.scope,generation:'g1',channelFactory:()=>null});t.after(()=>backend.dispose());await backend.hydrate();
 const proof=await x.adapter.authorize({generation:'g1',operationId:'backend-pro',action:'saveAdvanced'}),state=backend.inspect();
 const p=await backend.prepareWrite({source:'saveAdvanced',operationId:'backend-pro',expectedValues:{[settings]:state.values[settings]},authorizationContext:proof.authorizationContext},d=>{d.setItem(settings,JSON.stringify({...JSON.parse(d.getItem(settings)),volume:85}));return {ok:true};});
 const r=await backend.commitPreparedWrite(p,{commitGuard:proof.commitGuard});assert(r.ok);assert.equal(r.publish,false);assert.equal(JSON.parse(r.state.values[settings]).volume,85);
});
test('serialized backend retry reacquires same identity; changed Pro revision cannot retag',async t=>{
 const x=await proFixture(t),backend=await openIsolatedIDBRepositoryBackend({scope:x.scope,generation:'g1',channelFactory:()=>null});t.after(()=>backend.dispose());await backend.hydrate();
 const proof=await x.adapter.authorize({generation:'g1',operationId:'backend-retry',action:'saveAdvanced'}),state=backend.inspect();
 const p=await backend.prepareWrite({source:'saveAdvanced',operationId:'backend-retry',expectedValues:{[settings]:state.values[settings]},authorizationContext:proof.authorizationContext},d=>{d.setItem(settings,JSON.stringify({...JSON.parse(d.getItem(settings)),volume:85}));return {ok:true};});
 assert.equal((await backend.commitPreparedWrite(p)).ok,false);
 const renewed=await x.adapter.authorize({generation:'g1',operationId:'backend-retry',action:'saveAdvanced',expectedIdentity:p.request.authorizationIdentity});
 assert((await backend.retryWrite(p.request,renewed)).ok);x.storage.setItem('soundCruiseProOperationEpoch','after-commit');
 await assert.rejects(x.adapter.authorize({generation:'g1',operationId:'backend-retry',action:'saveAdvanced',expectedIdentity:p.request.authorizationIdentity}),/pro-operation-identity-changed/);
});
