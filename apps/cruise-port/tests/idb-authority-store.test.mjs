import { createTestAuthorityScope as createIsolatedIDBAuthorityScope } from './authority-store/test-authority.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openIDBAuthorityStore } from '../port-indexeddb-authority-store.mjs';
import { AUTHORITY_DB_NAME, AUTHORITY_DB_VERSION, STORE_KEYS, PORT_DATASET_KEYS, PORT_DELETE_INTENTS, hashText, digest, canonical } from '../port-idb-authority-contract.mjs';
import { values, control, patch } from './authority-store/fixture.mjs';
const require=createRequire(new URL('./authority-store/package.json',import.meta.url));
const {IDBFactory,IDBObjectStore,forceCloseDatabase}=require('fake-indexeddb');
const met='cruisePort.metronome',tuner='cruisePort.tuner',presets='cruisePort.metronomePresets';
const openRaw=(factory,name=AUTHORITY_DB_NAME,version=1,upgrade=()=>{})=>new Promise((ok,no)=>{
 const r=factory.open(name,version);r.onupgradeneeded=()=>upgrade(r.result,r.transaction);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);
});
async function raw(factory,stores,mode,build){const db=await openRaw(factory);try{return await new Promise((ok,no)=>{
 const tx=db.transaction(stores,mode);let result;tx.oncomplete=()=>ok(result);tx.onabort=()=>no(tx.error||Error('aborted'));
 build(tx,v=>result=v);
 });}finally{db.close();}}
const allRows=factory=>raw(factory,Object.keys(STORE_KEYS),'readonly',(tx,done)=>{
 const result={};let pending=Object.keys(STORE_KEYS).length;
 for(const name of Object.keys(STORE_KEYS)){const r=tx.objectStore(name).getAll();r.onsuccess=()=>{result[name]=r.result;if(!--pending)done(result);};}
});
async function setup(t,{seed=true,factory=new IDBFactory(),now=()=>1000000}={}){
 const events=[],scope=createIsolatedIDBAuthorityScope({indexedDB:factory,partitionId:'fixture-partition',now,onLifecycle:e=>events.push(e)});
 const store=await openIDBAuthorityStore(scope);t.after(()=>store.dispose());
 const initialValues=values();
 if(seed)assert.equal((await store.initialize({generation:'g1',control:control(),values:initialValues,operationId:'initial'})).ok,true);
 return {factory,scope,store,events,initialValues};
}
const load=async store=>{const r=await store.hydrate('g1');assert.equal(r.ok,true,r.reason);return r.snapshot;};
const prepare=(store,base,id,key=met,fields={bpm:140},extra={})=>store.prepare({base,operationId:id,changes:patch(base,key,fields),...extra});

for(const text of ['', 'abc', 'あ😀\ud800',...'012345'.split('').map((_,i)=>'x'.repeat([55,56,63,64,65,1000][i])), '音楽'.repeat(70000)])
 test('sync SHA-256 matches native crypto UTF-8 / padding: '+text.length,()=>assert.equal(hashText(text),createHash('sha256').update(text).digest('hex')));
test('factory/import creates no database until explicit open',async()=>{
 const f=new IDBFactory();const scope=createIsolatedIDBAuthorityScope({indexedDB:f,partitionId:'fixture'});
 assert.deepEqual(await f.databases(),[]);assert.equal(scope.name,AUTHORITY_DB_NAME);
 await assert.rejects(openIDBAuthorityStore({...scope}),/isolated-scope-required/);assert.deepEqual(await f.databases(),[]);
});
test('fresh DB / exact store inventory / key structure / physical version',async t=>{
 const x=await setup(t,{seed:false}),db=await openRaw(x.factory);
 assert.equal(db.version,AUTHORITY_DB_VERSION);assert.deepEqual([...db.objectStoreNames].sort(),Object.keys(STORE_KEYS).sort());
 const tx=db.transaction(Object.keys(STORE_KEYS));for(const [name,keyPath]of Object.entries(STORE_KEYS)){assert.deepEqual(tx.objectStore(name).keyPath,keyPath);assert.equal(tx.objectStore(name).autoIncrement,false);}
 db.close();assert.equal((await x.store.hydrate('g1')).status,'absent');
});
test('unsupported future physical version remains untouched',async()=>{
 const f=new IDBFactory(),db=await openRaw(f,AUTHORITY_DB_NAME,2,d=>d.createObjectStore('future'));db.close();
 const scope=createIsolatedIDBAuthorityScope({indexedDB:f,partitionId:'fixture'});
 await assert.rejects(openIDBAuthorityStore(scope),/future-schema/);const after=await openRaw(f,AUTHORITY_DB_NAME,2);assert.deepEqual([...after.objectStoreNames],['future']);after.close();
});
for(const corruption of ['missing store','wrong key','auto increment','unexpected index','extra store'])test('corrupt physical schema rejected: '+corruption,async()=>{
 const f=new IDBFactory(),db=await openRaw(f,AUTHORITY_DB_NAME,1,d=>{
  for(const [name,keyPath]of Object.entries(STORE_KEYS)){
   if(corruption==='missing store'&&name==='roots')continue;
   const s=d.createObjectStore(name,{keyPath:corruption==='wrong key'&&name==='head'?'wrong':keyPath,autoIncrement:corruption==='auto increment'&&name==='head'});
   if(corruption==='unexpected index'&&name==='head')s.createIndex('unknown','seq');
  }
  if(corruption==='extra store')d.createObjectStore('unknown');
 });db.close();const scope=createIsolatedIDBAuthorityScope({indexedDB:f,partitionId:'fixture'});
 await assert.rejects(openIDBAuthorityStore(scope),/schema-invalid/);const after=await openRaw(f);assert.equal(after.version,1);after.close();
});
test('blocked open rejects promptly and late success cannot leak/modify schema',async()=>{
 const f=new IDBFactory();
 // IndexedDB version must be an integer; use a proxy to expose the native blocked
 // path at requested version2 while this v1 connection remains open.
 const blocker=await openRaw(f,AUTHORITY_DB_NAME,1,d=>Object.entries(STORE_KEYS).forEach(([name,keyPath])=>d.createObjectStore(name,{keyPath})));
 const factory={open(name){return f.open(name,2);}},events=[];
 const scope=createIsolatedIDBAuthorityScope({indexedDB:factory,partitionId:'fixture',onLifecycle:e=>events.push(e)});
 await assert.rejects(openIDBAuthorityStore(scope),/open-blocked/);assert.deepEqual(events,['blocked']);blocker.close();
 await new Promise(r=>setTimeout(r,20));const after=await openRaw(f);assert.equal(after.version,1);after.close();
});
test('versionchange closes old connection and old handle refuses operations',async t=>{
 const x=await setup(t);const upgraded=await openRaw(x.factory,AUTHORITY_DB_NAME,2);
 assert.equal(x.store.status,'versionchange');assert.equal((await x.store.hydrate('g1')).ok,false);assert.deepEqual(x.events,['versionchange']);upgraded.close();
});
test('unexpected close / unavailable connection fail closed',async t=>{
 const f=new IDBFactory();let connection;const proxy={open(...args){const r=f.open(...args);r.addEventListener('success',()=>{connection=r.result;});return r;}};
 const x=await setup(t,{factory:proxy});forceCloseDatabase(connection);await new Promise(r=>setImmediate(r));
 assert.equal(x.store.status,'connection-lost');assert.equal((await x.store.hydrate('g1')).ok,false);assert.deepEqual(x.events,['unexpected-close']);
});
test('dispose is idempotent and rejects new transaction',async t=>{
 const x=await setup(t);x.store.dispose();x.store.dispose();assert.equal(x.store.status,'disposed');assert.equal((await x.store.lookupOperation('g1','initial')).reason,'disposed');
});
test('unavailable factory open throws, no fallback',async()=>{
 await assert.rejects(openIDBAuthorityStore(createIsolatedIDBAuthorityScope({indexedDB:{open(){throw Error('blocked storage');}},partitionId:'fixture'})),/database-unavailable/);
});
test('initial head / full manifest / explicit absent keys / hydrate / unknown field',async t=>{
 const x=await setup(t),s=await load(x.store);assert.equal(s.head.seq,1);assert.equal(s.head.controlEpoch,1);
 assert.deepEqual(Object.keys(s.versions).sort(),[...PORT_DATASET_KEYS].sort());assert.equal(s.values[PORT_DELETE_INTENTS],null);assert.equal(s.versions[PORT_DELETE_INTENTS],null);
 assert.deepEqual(s.values,x.initialValues);assert.equal(JSON.parse(s.values['cruisePort.settings']).futurePreference.retained,true);
 assert(Object.isFrozen(s.values));const rows=await allRows(x.factory);assert.equal(rows.oplog.length,1);assert.equal(rows.head.length,1);assert.equal(rows.manifests.length,1);
 assert.equal(rows.records.length,PORT_DATASET_KEYS.length-1);
});
test('immutable versions / unchanged reuse / atomic multiple-key snapshot',async t=>{
 const x=await setup(t),base=await load(x.store),before=await allRows(x.factory);
 const h=x.store.prepare({base,operationId:'multi',changes:{...patch(base,met,{bpm:140}),...patch(base,tuner,{thresholdDb:-75})}});
 const r=await x.store.commit(h);assert.equal(r.ok,true);const s=await load(x.store);
 assert.equal(s.head.seq,2);assert.equal(s.versions[met],2);assert.equal(s.versions[tuner],2);assert.equal(s.versions['cruisePort.settings'],1);
 const rows=await allRows(x.factory);assert.equal(rows.records.length,before.records.length+2);assert.deepEqual(rows.records.filter(v=>v.logicalKey===met&&v.version===1),before.records.filter(v=>v.logicalKey===met));
 assert.equal(rows.manifests.length,2);assert.equal(rows.oplog.length,2);assert.equal(rows.head[0].manifestId,r.manifestId);
});
for(const phase of ['before head update','after record success','after head success','quota first record','quota second record','transaction request error','partial record failure'])test('atomic abort / no partial record-manifest-head-oplog: '+phase,async t=>{
 const x=await setup(t),base=await load(x.store),before=await allRows(x.factory),handle=x.store.prepare({base,operationId:'aborted',changes:{...patch(base,met,{bpm:141}),...patch(base,tuner,{thresholdDb:-76})}});
 const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;let recordCalls=0;
 IDBObjectStore.prototype.add=function(value,...rest){
  if(this.name==='records'){
   recordCalls++;
   if(phase==='quota first record'||phase==='quota second record'&&recordCalls===2)throw new DOMException('fixture quota','QuotaExceededError');
   if(phase==='transaction request error')return add.call(this,{...value,raw:()=>{}},...rest);
   if(phase==='partial record failure'&&recordCalls===2)value={...value,logicalKey:met};
  }
  const r=add.call(this,value,...rest);if(phase==='after record success'&&this.name==='records')r.addEventListener('success',()=>this.transaction.abort(),{once:true});return r;
 };
 IDBObjectStore.prototype.put=function(value,...rest){
  if(phase==='before head update'&&this.name==='head')throw new DOMException('fixture','AbortError');
  const r=put.call(this,value,...rest);if(phase==='after head success'&&this.name==='head')r.addEventListener('success',()=>this.transaction.abort(),{once:true});return r;
 };
 let result;try{result=await x.store.commit(handle);}finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;}
 assert.equal(result.ok,false);if(phase.startsWith('quota'))assert.equal(result.reason,'quota-exceeded');assert.deepEqual(await allRows(x.factory),before);
 assert.equal((await x.store.lookupOperation('g1','aborted')).result,null);
});
for(const guard of [()=>false,()=>({ok:false}),()=>({allowed:false}),()=>{throw Error('rejected');},()=>Promise.resolve(true),()=>Promise.reject(Error('rejected')),()=>({then(){}})])test('synchronous operation guard rejects entire tx: '+String(guard),async t=>{
 const x=await setup(t),before=await allRows(x.factory),base=await load(x.store);const h=prepare(x.store,base,'guarded',met,{bpm:144},{authorizationContext:Object.freeze({operationId:'guarded'})});
 assert.equal((await x.store.commit(h,{commitGuard:guard})).ok,false);assert.deepEqual(await allRows(x.factory),before);
});
test('operation context requires guard; foreign handle rejected',async t=>{
 const x=await setup(t),base=await load(x.store);const h=prepare(x.store,base,'required',met,{bpm:144},{authorizationContext:Object.freeze({})});
 assert.equal((await x.store.commit(h)).reason,'operation-commit-guard-required');assert.equal((await x.store.commit({...h})).reason,'prepared-handle-invalid');
});
test('guard evaluation is authorization point, thirty-second margin is not a completion deadline',async t=>{
 let now=1000000;const x=await setup(t,{now:()=>now}),base=await load(x.store),deadline=now+60000;
 const h=prepare(x.store,base,'margin');const add=IDBObjectStore.prototype.add;
 IDBObjectStore.prototype.add=function(...args){const r=add.apply(this,args);if(this.name==='records')r.addEventListener('success',()=>{now=deadline+1;});return r;};
 let result;try{result=await x.store.commit(h,{commitGuard:(_c,d)=>{assert.equal(d.authorizationMarginMs,30000);return deadline-d.authorizedAt>=d.authorizationMarginMs;}});}finally{IDBObjectStore.prototype.add=add;}
 assert.equal(result.ok,true);assert.equal(result.authorizedAt,1000000);assert(now>deadline);
});
test('snapshot fields must survive changed raw; no normalize or future-schema coercion',async t=>{
 const x=await setup(t),base=await load(x.store);
 assert.throws(()=>prepare(x.store,base,'future',met,{version:999}),/forward-incompatible/);
 const changed=JSON.parse(base.values['cruisePort.settings']);delete changed.futurePreference;
 assert.throws(()=>x.store.prepare({base,operationId:'lost-field',changes:{'cruisePort.settings':JSON.stringify(changed)}}),/field-loss/);
 const r=await x.store.commit(prepare(x.store,base,'retained','cruisePort.settings',{theme:'dark'}));assert.equal(r.ok,true);
 assert.equal(JSON.parse((await load(x.store)).values['cruisePort.settings']).futurePreference.retained,true);
});
for(const invalid of ['partial dataset','invalid raw','boolean intent'])test('invalid initial dataset rejected without control or head: '+invalid,async t=>{
 const x=await setup(t,{seed:false}),v=values();if(invalid==='partial dataset')delete v[met];if(invalid==='invalid raw')v[met]={bpm:120};if(invalid==='boolean intent')v[PORT_DELETE_INTENTS]=JSON.stringify({'preset/x':true});
 assert.equal((await x.store.initialize({generation:'g1',control:control(),values:v,operationId:'invalid'})).ok,false);assert.equal((await x.store.hydrate('g1')).status,'absent');
 assert.equal((await allRows(x.factory)).records.length,0);
});
test('same-key concurrent writes from independent DB connections: exactly one commits',async t=>{
 const x=await setup(t),peer=await openIDBAuthorityStore(x.scope);t.after(()=>peer.dispose());
 const [a,b]=await Promise.all([load(x.store),load(peer)]);const results=await Promise.all([x.store.commit(prepare(x.store,a,'a')),peer.commit(prepare(peer,b,'b',met,{bpm:160}))]);
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.reason==='stale').length,1);assert.equal((await load(peer)).head.seq,2);
});
test('different-key concurrent writes merge current head without false global conflict',async t=>{
 const x=await setup(t),peer=await openIDBAuthorityStore(x.scope);t.after(()=>peer.dispose());const [a,b]=await Promise.all([load(x.store),load(peer)]);
 const results=await Promise.all([x.store.commit(prepare(x.store,a,'a',met,{bpm:160})),peer.commit(prepare(peer,b,'b',tuner,{thresholdDb:-76}))]);
 assert(results.every(r=>r.ok));const s=await load(peer);assert.equal(s.head.seq,3);assert.equal(JSON.parse(s.values[met]).bpm,160);assert.equal(JSON.parse(s.values[tuner]).thresholdDb,-76);
});
test('stale base rejected after a completed write',async t=>{
 const x=await setup(t),base=await load(x.store),stale=prepare(x.store,base,'stale');assert((await x.store.commit(prepare(x.store,base,'first'))).ok);
 assert.equal((await x.store.commit(stale)).reason,'stale');
});
test('dependency conflict rejects a different target key',async t=>{
 const x=await setup(t),base=await load(x.store),h=prepare(x.store,base,'dependent',met,{bpm:140},{dependencyKeys:[tuner]});
 assert((await x.store.commit(prepare(x.store,base,'dependency-changed',tuner,{thresholdDb:-76}))).ok);assert.equal((await x.store.commit(h)).reason,'stale');
});
test('inferred referential dependencies include Practice ownership and asset owners',async t=>{
 const x=await setup(t),base=await load(x.store);const sets=JSON.parse(base.values['cruisePort.practiceMenuSets']);
 const h=x.store.prepare({base,operationId:'sets',changes:{'cruisePort.practiceMenuSets':JSON.stringify(sets)}});
 const menus=JSON.parse(base.values['cruisePort.practiceMenus']);menus.items[0].memo='changed';
 assert((await x.store.commit(x.store.prepare({base,operationId:'menus',changes:{'cruisePort.practiceMenus':JSON.stringify(menus)}}))).ok);
 assert.equal((await x.store.commit(h)).reason,'stale');
});
test('delete intent merge retains a concurrent new intent from another key',async t=>{
 const x=await setup(t),base=await load(x.store),a=prepare(x.store,base,'intent-a',met,{bpm:145},{acknowledgements:[]});
 const b=x.store.prepare({base,operationId:'intent-b',changes:{[PORT_DELETE_INTENTS]:JSON.stringify({'metronome_preset/other':{generation:'new-intent'}})}});
 assert((await x.store.commit(b)).ok);assert((await x.store.commit(a)).ok);
 assert.equal(JSON.parse((await load(x.store)).values[PORT_DELETE_INTENTS])['metronome_preset/other'].generation,'new-intent');
});
test('old snapshot intent never overwrites new generation; old ACK cannot clear it',async t=>{
 const x=await setup(t),base=await load(x.store),first=x.store.prepare({base,operationId:'old-intent',changes:{[PORT_DELETE_INTENTS]:JSON.stringify({'metronome_preset/x':{generation:'old'}})}});
 assert((await x.store.commit(first)).ok);const old=await load(x.store);
 assert((await x.store.commit(x.store.prepare({base:old,operationId:'new-intent',changes:{[PORT_DELETE_INTENTS]:JSON.stringify({'metronome_preset/x':{generation:'new'}})}}))).ok);
 const ack=prepare(x.store,old,'old-ack',met,{bpm:150},{acknowledgements:[{key:'metronome_preset/x',generation:'old'}]});assert((await x.store.commit(ack)).ok);
 assert.equal(JSON.parse((await load(x.store)).values[PORT_DELETE_INTENTS])['metronome_preset/x'].generation,'new');
});
test('delete/recreate keeps monotonic key versions and rejects pre-create null base',async t=>{
 const x=await setup(t,{seed:false}),v=values();v[met]=null;assert((await x.store.initialize({generation:'g1',control:control(),values:v,operationId:'initial'})).ok);
 const absent=await load(x.store),stale=x.store.prepare({base:absent,operationId:'stale-null',changes:{[met]:values()[met]}});
 assert((await x.store.commit(x.store.prepare({base:absent,operationId:'create',changes:{[met]:values()[met]}}))).ok);
 let base=await load(x.store);assert((await x.store.commit(x.store.prepare({base,operationId:'delete',changes:{[met]:null}}))).ok);base=await load(x.store);
 assert.equal(base.versions[met],2);assert.equal((await x.store.commit(stale)).reason,'stale');
 assert.equal(JSON.parse(base.values[PORT_DELETE_INTENTS])['metronome_settings/default'].generation,'delete');
 assert((await x.store.commit(x.store.prepare({base,operationId:'recreate',changes:{[met]:values()[met]}}))).ok);base=await load(x.store);
 assert.equal(base.versions[met],3);assert.equal(JSON.parse(base.values[PORT_DELETE_INTENTS])['metronome_settings/default'],undefined);
});
test('collection delete creates versioned intent, recreate clears only that intent',async t=>{
 const x=await setup(t),base=await load(x.store),list=JSON.parse(base.values[presets]),removed=list.items[0];
 const change={...list,items:list.items.slice(1)};assert((await x.store.commit(x.store.prepare({base,operationId:'delete-preset',changes:{[presets]:JSON.stringify(change)}}))).ok);
 const deleted=await load(x.store);assert.equal(JSON.parse(deleted.values[PORT_DELETE_INTENTS])['metronome_preset/'+removed.id].generation,'delete-preset');
 assert((await x.store.commit(x.store.prepare({base:deleted,operationId:'recreate-preset',changes:{[presets]:base.values[presets]}}))).ok);
 assert.equal(JSON.parse((await load(x.store)).values[PORT_DELETE_INTENTS])['metronome_preset/'+removed.id],undefined);
});
test('same operationId/same payload replays; different payload rejects; committed result persists after suspension',async t=>{
 const x=await setup(t),base=await load(x.store),h=prepare(x.store,base,'once');const result=await x.store.commit(h);assert(result.ok);
 const before=await allRows(x.factory);assert.equal((await x.store.commit(h)).replayed,true);assert.deepEqual(await allRows(x.factory),before);
 assert.equal((await x.store.commit(prepare(x.store,base,'once',met,{bpm:170}))).reason,'operation-id-payload-conflict');
 assert((await x.store.updateControl('g1',{expectedEpoch:1,patch:{suspended:true}})).ok);assert.equal((await x.store.commit(h)).seq,result.seq);
});
test('response loss and reopen retry from serialized original request never commits twice',async t=>{
 const x=await setup(t),base=await load(x.store),h=prepare(x.store,base,'lost-response');await x.store.commit(h);x.store.dispose();
 const reopened=await openIDBAuthorityStore(x.scope);t.after(()=>reopened.dispose());const fact=await reopened.lookupOperation('g1','lost-response');assert.equal(fact.result.seq,2);
 const retry=prepare(reopened,structuredClone(base),'lost-response');assert.equal((await reopened.commit(retry)).replayed,true);assert.equal((await load(reopened)).head.seq,2);
});
for(const patchValue of [{suspended:true},{fenceRevoked:true},{identityInvalidated:true},{state:'superseded'},{recoveryRequired:true}])test('control transition fences old handle: '+canonical(patchValue),async t=>{
 const x=await setup(t),base=await load(x.store),h=prepare(x.store,base,'old');assert((await x.store.updateControl('g1',{expectedEpoch:1,patch:patchValue})).ok);
 assert.equal((await x.store.commit(h)).ok,false);assert.equal((await x.store.hydrate('g1')).readOnly,true);
});
test('control suspend/resume ABA increases epoch; binding never retags',async t=>{
 const x=await setup(t),base=await load(x.store),h=prepare(x.store,base,'aba');
 assert((await x.store.updateControl('g1',{expectedEpoch:1,patch:{suspended:true}})).ok);assert((await x.store.updateControl('g1',{expectedEpoch:2,patch:{suspended:false}})).ok);
 assert.equal((await x.store.commit(h)).reason,'control-stale');assert.equal((await x.store.updateControl('g1',{expectedEpoch:3,patch:{identity:{accountId:'B'}}})).reason,'control-patch-invalid');
});
test('journal CAS, unknown evidence retention, same-ID different generation rejection',async t=>{
 const x=await setup(t),j={schemaVersion:1,revision:1,migrationId:'m1',generation:'g1',state:'staging',binaryManifest:[],futureEvidence:{kept:true}};
 assert((await x.store.writeJournal(j)).ok);assert.deepEqual((await x.store.readJournal('m1')).journal,j);
 assert.equal((await x.store.writeJournal({...j,revision:2})).reason,'journal-stale');
 assert((await x.store.writeJournal({...j,revision:2,state:'prepared'},{expectedRevision:1})).ok);
 assert.equal((await x.store.writeJournal({...j,revision:3,generation:'g2'},{expectedRevision:2})).reason,'journal-identity-conflict');
});
test('journal plus root are atomic; invalid reference rolls both back',async t=>{
 const x=await setup(t),s=await load(x.store),root={schemaVersion:1,generation:'g1',rootId:'pin',kind:'migration-evidence',manifestIds:[s.head.manifestId],recordRefs:[],journalIds:['m1']};
 const j={schemaVersion:1,migrationId:'m1',generation:'g1',revision:1,state:'prepared',sealHash:'verified',binaryManifest:[]};
 assert((await x.store.writeJournal(j,{roots:[root]})).ok);assert.deepEqual((await x.store.readRoot('g1','pin')).root,root);
 const bad={...root,rootId:'bad',manifestIds:['missing']};assert.equal((await x.store.writeJournal({...j,revision:2},{expectedRevision:1,roots:[bad]})).ok,false);
 assert.equal((await x.store.readJournal('m1')).journal.revision,1);assert.equal((await x.store.readRoot('g1','bad')).root,null);
});
test('roots pin manifest/record/outbox base without deleting anything; immutable root reuse',async t=>{
 const x=await setup(t),s=await load(x.store),root={schemaVersion:1,generation:'g1',rootId:'outbox-base',kind:'sync-base',manifestIds:[s.head.manifestId],recordRefs:[{logicalKey:met,version:1}],journalIds:[]};
 const before=await allRows(x.factory);assert((await x.store.writeRoot(root)).ok);assert((await x.store.writeRoot(root)).ok);
 assert.equal((await x.store.writeRoot({...root,manifestIds:[]})).reason,'root-identity-conflict');const after=await allRows(x.factory);
 for(const name of ['records','manifests','head','oplog'])assert.deepEqual(after[name],before[name]);
});
for(const corruption of ['missing head','missing control','both head and control missing','missing manifest','missing record','corrupt manifest','partial manifest','corrupt record','future control','future journal'])test('recovery fail closed: '+corruption,async t=>{
 const x=await setup(t),s=await load(x.store);
 if(corruption==='future journal'){
  await raw(x.factory,['journal'],'readwrite',tx=>tx.objectStore('journal').put({schemaVersion:99,migrationId:'m1',generation:'g1',revision:1,state:'staging'}));
  assert.equal((await x.store.readJournal('m1')).ok,false);return;
 }
 await raw(x.factory,['head','control','manifests','records'],'readwrite',tx=>{
  if(corruption==='missing head'||corruption==='both head and control missing')tx.objectStore('head').delete('g1');
  if(corruption==='missing control'||corruption==='both head and control missing')tx.objectStore('control').delete('g1');
  if(corruption==='missing manifest')tx.objectStore('manifests').delete(['g1',s.head.manifestId]);
  if(corruption==='missing record')tx.objectStore('records').delete(['g1',met,1]);
  if(corruption==='corrupt manifest'||corruption==='partial manifest'){const m=structuredClone(s.manifest);if(corruption==='partial manifest')delete m.versions[met];else m.seq=999;tx.objectStore('manifests').put(m);}
  if(corruption==='corrupt record')tx.objectStore('records').put({schemaVersion:1,generation:'g1',logicalKey:met,version:1,raw:s.values[met],digest:'0'.repeat(64)});
  if(corruption==='future control')tx.objectStore('control').put({...s.control,schemaVersion:99});
 });const recovery=await x.store.hydrate('g1');assert.equal(recovery.ok,false);assert.equal(recovery.status,'recovery-required');
 const candidate=prepare(x.store,s,'after-corruption');assert.equal((await x.store.commit(candidate)).ok,false);
});
test('dangling immutable next version collision aborts without overwriting record',async t=>{
 const x=await setup(t),s=await load(x.store),record={schemaVersion:1,generation:'g1',logicalKey:met,version:2,raw:s.values[met]};record.digest=digest({generation:'g1',logicalKey:met,version:2,raw:record.raw});
 await raw(x.factory,['records'],'readwrite',tx=>tx.objectStore('records').add(record));const before=await allRows(x.factory);
 assert.equal((await x.store.commit(prepare(x.store,s,'collision'))).ok,false);assert.deepEqual(await allRows(x.factory),before);
});
test('normal product graph does not import/open the new store',()=>{
 for(const path of ['../practice-menu-app.js','../pro-app-boot.js','../../cruise-studio/js/port-data/connection.mjs','../../cruise-studio/js/app.js']){
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  assert.doesNotMatch(source,/port-indexeddb-authority-store/);
 }
});
test('journal cannot copy binary or credentials into Authority DB',async t=>{
 const x=await setup(t),j={schemaVersion:1,revision:1,migrationId:'m1',generation:'g1',state:'staging'};
 for(const unsafe of [{blob:new Blob(['binary'])},{credential:'scp1.fixture.secret'},{binary:new Uint8Array([1,2])}]){
  assert.equal((await x.store.writeJournal({...j,...unsafe})).ok,false);assert.equal((await x.store.readJournal('m1')).journal,null);
 }
});
test('invalid journal state is not adopted as a current journal',async t=>{
 const x=await setup(t);assert.equal((await x.store.writeJournal({schemaVersion:1,revision:1,migrationId:'m1',generation:'g1',state:'future-state'})).ok,false);
});
test('control metadata cannot write a Blob into the commit transaction',async t=>{
 const x=await setup(t,{seed:false});assert.equal((await x.store.initialize({generation:'g1',control:{...control(),fenceEvidence:new Blob(['binary'])},values:values(),operationId:'invalid-control'})).ok,false);
 assert.equal((await x.store.hydrate('g1')).status,'absent');
});
test('oplog result must reference an existing matching immutable manifest',async t=>{
 const x=await setup(t),s=await load(x.store);
 await raw(x.factory,['oplog'],'readwrite',tx=>{const r=tx.objectStore('oplog').get(['g1','initial']);r.onsuccess=()=>tx.objectStore('oplog').put({...r.result,result:{...r.result.result,seq:999}});});
 assert.equal((await x.store.lookupOperation('g1','initial')).status,'recovery-required');
 assert.equal((await x.store.initialize({generation:'g1',control:control(),values:x.initialValues,operationId:'initial'})).ok,false);
 assert.equal((await load(x.store)).head.seq,s.head.seq);
});
test('oplog-only orphan is recovery-required and never silently reseeded',async t=>{
 const x=await setup(t);
 await raw(x.factory,['head','control','records','manifests'],'readwrite',tx=>{for(const name of ['head','control','records','manifests'])tx.objectStore(name).clear();});
 assert.equal((await x.store.hydrate('g1')).status,'recovery-required');
 assert.equal((await x.store.initialize({generation:'g1',control:control(),values:x.initialValues,operationId:'reseed'})).ok,false);
});
test('bound Account/membership control is separate from Pro; unbound requires no Account',async t=>{
 const x=await setup(t,{seed:false}),c=control();c.identity={...c.identity,ownership:'bound-account',accountId:'A',accountGeneration:2,membershipId:'port-a',membershipGeneration:3};
 assert((await x.store.initialize({generation:'g1',control:c,values:x.initialValues,operationId:'bound-initial'})).ok);
 const base=await load(x.store);assert.equal(base.control.identity.accountId,'A');assert((await x.store.commit(prepare(x.store,base,'bound-save'))).ok);
 assert.equal((await x.store.updateControl('g1',{expectedEpoch:1,patch:{identity:{...c.identity,accountId:'B'}}})).ok,false);
});
test('different generations remain physically separated inside the same database',async t=>{
 const x=await setup(t),second=control('g2');assert((await x.store.initialize({generation:'g2',control:second,values:values(),operationId:'initial'})).ok);
 const g1=await load(x.store),g2=(await x.store.hydrate('g2')).snapshot;
 const h=x.store.prepare({base:g2,operationId:'g2-save',changes:patch(g2,met,{bpm:185})});assert((await x.store.commit(h)).ok);
 assert.equal((await load(x.store)).head.seq,g1.head.seq);assert.equal((await x.store.lookupOperation('g1','g2-save')).result,null);
 assert.equal(JSON.parse((await x.store.hydrate('g2')).snapshot.values[met]).bpm,185);
});
test('caller mutation after prepare cannot alter records or captured dependencies',async t=>{
 const x=await setup(t),base=structuredClone(await load(x.store)),changes=patch(base,met,{bpm:155}),deps=[tuner];
 const h=x.store.prepare({base,operationId:'immutable-draft',changes,dependencyKeys:deps});changes[met]=JSON.stringify({version:999});base.control.epoch=999;deps.length=0;
 assert((await x.store.commit(h)).ok);assert.equal(JSON.parse((await load(x.store)).values[met]).bpm,155);
});
test('unknown physical head/manifest fields are preserved on disk and fail closed',async t=>{
 const x=await setup(t),s=await load(x.store);await raw(x.factory,['head'],'readwrite',tx=>tx.objectStore('head').put({...s.head,futureRule:'unrecognized'}));
 assert.equal((await x.store.hydrate('g1')).status,'recovery-required');assert.equal((await x.store.commit(prepare(x.store,s,'future-head'))).ok,false);
 const rows=await allRows(x.factory);assert.equal(rows.head[0].futureRule,'unrecognized');
});
for(const clock of ['wall','monotonic'])test('fixture guard can enforce thirty-second margin on '+clock,async t=>{
 const x=await setup(t),base=await load(x.store),h=prepare(x.store,base,'short-'+clock);let calls=0;
 const r=await x.store.commit(h,{commitGuard:(_c,d)=>{calls++;const remaining={wall:60000,monotonic:60000};remaining[clock]=29999;return remaining.wall>=d.authorizationMarginMs&&remaining.monotonic>=d.authorizationMarginMs;}});
 assert.equal(calls,1);assert.equal(r.ok,false);assert.equal((await load(x.store)).head.seq,1);
});
