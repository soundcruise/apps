import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PortDatasetRepository } from '../port-dataset-repository.js';
import { createIsolatedIDBAuthorityScope } from '../port-indexeddb-authority-store.mjs';
import { openIsolatedIDBRepositoryBackend } from '../port-indexeddb-repository-backend.mjs';
import { createFixtureLocks } from '../../shared/sync-account/test-fixtures/web-locks.mjs';
import { control } from './authority-store/fixture.mjs';
import { REF_KEYS as K, attachment, referenceValues, danglingAttachments } from './authority-store/reference-fixture.mjs';
const {IDBFactory}=createRequire(new URL('./authority-store/package.json',import.meta.url))('fake-indexeddb');
async function setup(t,{attached=false,initial=referenceValues({attached})}={}) {
 const factory=new IDBFactory(),scope=createIsolatedIDBAuthorityScope({indexedDB:factory,partitionId:'fixture-partition'});
 const a=await openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory:()=>null});t.after(()=>a.dispose());
 assert.equal((await a.store.initialize({generation:'g1',control:control(),values:initial,operationId:'seed'})).ok,true);
 await a.hydrate();const b=await openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory:()=>null});t.after(()=>b.dispose());await b.hydrate();
 return {a,b,factory,scope,ra:new PortDatasetRepository({backend:a,locks:null}),rb:new PortDatasetRepository({backend:b,locks:null})};
}
const change=(repo,key,mutate,extra={})=>repo.runWrite({expectedValues:{[key]:repo.inspect().values[key]},...extra},d=>{const v=JSON.parse(d.getItem(key));mutate(v);d.setItem(key,JSON.stringify(v));});
const prepare=(backend,key,id,mutate)=>backend.prepareWrite({expectedValues:{[key]:backend.inspect().values[key]},operationId:id},d=>{const v=JSON.parse(d.getItem(key));mutate(v);d.setItem(key,JSON.stringify(v));});
const removeMenu=v=>{v.items=v.items.filter(m=>m.id!=='menu-0');};

test('regression 1: attachment deletion generates individual + last-owner-set intents, matching legacy',async t=>{
 const original=referenceValues({attached:true}),map=new Map(Object.entries(original)),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const legacy=new PortDatasetRepository({storage,locks:createFixtureLocks()});assert.equal((await change(legacy,K.assets,v=>delete v.attachments['attachment-a'])).ok,true);
 const expected=['practice_attachment/attachment-a','practice_attachment_set/menu-0'];assert.deepEqual(Object.keys(JSON.parse(legacy.inspect().values[K.intents])).sort(),expected);
 const x=await setup(t,{attached:true});assert.equal((await change(x.ra,K.assets,v=>delete v.attachments['attachment-a'])).ok,true);
 assert.deepEqual(Object.keys(JSON.parse(x.ra.inspect().values[K.intents]||'{}')).sort(),expected);
});
test('regression 2: attachment add first / menu deletion second cannot publish dangling owner',async t=>{
 const x=await setup(t),del=await prepare(x.a,K.menus,'delete-menu',removeMenu),add=await prepare(x.b,K.assets,'add-attachment',v=>v.attachments['attachment-a']=attachment('menu-0'));
 assert.equal((await x.b.commitPreparedWrite(add)).ok,true);const result=await x.a.commitPreparedWrite(del);
 assert.equal(result.ok,false);assert.deepEqual(danglingAttachments((await x.ra.readDatasetState()).values),[]);
});
test('menu deletion first rejects later attachment publication from a stale cache',async t=>{
 const x=await setup(t),add=await prepare(x.b,K.assets,'add',v=>v.attachments.a=attachment('menu-0','a'));
 assert.equal((await change(x.ra,K.menus,removeMenu)).ok,true);const r=await x.b.commitPreparedWrite(add);assert.equal(r.reason,'attachment-owner-missing');assert.deepEqual(danglingAttachments((await x.ra.readDatasetState()).values),[]);
});
test('attached owner deletion alone refuses; explicit multi-key removal is atomic',async t=>{
 const x=await setup(t,{attached:true}),s=x.ra.inspect();assert.equal((await change(x.ra,K.menus,removeMenu)).reason,'attachment-owner-missing');
 const r=await x.ra.runWrite({expectedValues:{[K.menus]:s.values[K.menus],[K.assets]:s.values[K.assets]}},d=>{
  const menus=JSON.parse(d.getItem(K.menus)),assets=JSON.parse(d.getItem(K.assets));removeMenu(menus);assets.attachments={};d.setItem(K.menus,JSON.stringify(menus));d.setItem(K.assets,JSON.stringify(assets));
 });assert.equal(r.ok,true);const j=JSON.parse(r.state.values[K.intents]);assert(j['practice_attachment/attachment-a']);assert(j['practice_attachment_set/menu-0']);assert(j['practice_menu/menu-0']);assert.equal(Object.keys(r.state.values).length,15);
});
test('multiple attachments: individual intent always, owner-set intent only after last removal',async t=>{
 const x=await setup(t,{attached:true});await change(x.ra,K.assets,v=>v.attachments.b=attachment('menu-0','b'));
 await change(x.ra,K.assets,v=>delete v.attachments['attachment-a']);let j=JSON.parse(x.ra.inspect().values[K.intents]);assert(j['practice_attachment/attachment-a']);assert.equal(j['practice_attachment_set/menu-0'],undefined);
 await change(x.ra,K.assets,v=>delete v.attachments.b);j=JSON.parse(x.ra.inspect().values[K.intents]);assert(j['practice_attachment/b']);assert(j['practice_attachment_set/menu-0']);
});
test('attachment/set recreate clears only their current intents; old ACK cannot clear a later deletion',async t=>{
 const x=await setup(t,{attached:true});const first=await change(x.ra,K.assets,v=>v.attachments={},{operationId:'delete-1'});let j=JSON.parse(first.state.values[K.intents]);assert.equal(j['practice_attachment/attachment-a'].generation,'delete-1');assert.equal(j['practice_attachment_set/menu-0'].generation,'delete-1');
 await change(x.ra,K.assets,v=>v.attachments['attachment-a']=attachment('menu-0'));assert.equal(JSON.parse(x.ra.inspect().values[K.intents])['practice_attachment/attachment-a'],undefined);
 await change(x.ra,K.assets,v=>v.attachments={},{operationId:'delete-2'});
 for(const key of ['practice_attachment/attachment-a','practice_attachment_set/menu-0']){const r=await x.ra.acknowledgeDelete(key,'delete-1',x.ra.inspect().revision);assert.equal(r.ok,true);assert.equal(r.matched,false);}
 j=JSON.parse(x.ra.inspect().values[K.intents]);assert.equal(j['practice_attachment/attachment-a'].generation,'delete-2');assert.equal(j['practice_attachment_set/menu-0'].generation,'delete-2');
});
test('attachment delete vs owner-set update is same-key CAS, never partial membership',async t=>{
 const x=await setup(t,{attached:true}),del=await prepare(x.a,K.assets,'del',v=>delete v.attachments['attachment-a']),add=await prepare(x.b,K.assets,'add',v=>v.attachments.b=attachment('menu-0','b'));
 const r=await Promise.all([x.a.commitPreparedWrite(del),x.b.commitPreparedWrite(add)]);assert.equal(r.filter(v=>v.ok).length,1);assert.equal(r.filter(v=>v.reason==='stale').length,1);assert.deepEqual(danglingAttachments((await x.ra.readDatasetState()).values),[]);
});
test('independent menu edit + other menu attachment addition both commit from the same base',async t=>{
 const x=await setup(t),edit=await prepare(x.a,K.menus,'edit',v=>v.items[0].memo='retained'),add=await prepare(x.b,K.assets,'add',v=>v.attachments.a=attachment('menu-1','a'));
 const r=await Promise.all([x.a.commitPreparedWrite(edit),x.b.commitPreparedWrite(add)]);assert(r.every(v=>v.ok),JSON.stringify(r));const s=await x.ra.readDatasetState();assert.equal(JSON.parse(s.values[K.menus]).items[0].memo,'retained');assert(JSON.parse(s.values[K.assets]).attachments.a);
});
test('My Apps deletion and Practice soft link update do not resurrect the app or erase its tombstone',async t=>{
 const x=await setup(t),id=JSON.parse(x.ra.inspect().values[K.apps]).items[0].id,link=await prepare(x.a,K.menus,'link',v=>v.items[0].appId='myapp:'+id);
 assert.equal((await change(x.rb,K.apps,v=>v.items=[])).ok,true);assert.equal((await x.a.commitPreparedWrite(link)).ok,true);
 const s=await x.ra.readDatasetState();assert.deepEqual(JSON.parse(s.values[K.apps]).items,[]);assert.equal(JSON.parse(s.values[K.menus]).items[0].appId,'myapp:'+id);assert(JSON.parse(s.values[K.intents])['my_app/'+id]);
});
test('missing menu ids in sets, cumulative progress and history remain representable',async t=>{
 const x=await setup(t);const r=await change(x.ra,K.menus,removeMenu);assert.equal(r.ok,true);assert(JSON.parse(r.state.values['cruisePort.practiceMenuSets']).items[0].itemIds.includes('menu-0'));
});
for(const [name,mutate,reason] of [
 ['owner absent',e=>e.practiceId='missing','attachment-owner-missing'],
 ['owner invalid',e=>delete e.practiceId,'attachment-owner-invalid'],
 ['published source absent',e=>delete e.published.asset,'attachment-source-missing'],
 ['asset owner mismatch',e=>e.published.asset.ownerRecordId='menu-1','attachment-owner-mismatch']
])test('current candidate fails closed before publication: '+name,async t=>{
 const x=await setup(t),entry=attachment('menu-0');mutate(entry);const r=await change(x.ra,K.assets,v=>v.attachments.a=entry,{operationId:'bad'});
 assert.equal(r.reason,reason);assert.equal((await x.a.lookupOperation('bad')).result,null);assert.equal((await x.a.store.hydrate('g1')).snapshot.head.seq,1);
});
test('pending-only logical attachment is allowed without requiring external binary DB access',async t=>{
 const x=await setup(t);const r=await change(x.ra,K.assets,v=>v.attachments.a={practiceId:'menu-0',pending:{localId:'local-a'}});assert.equal(r.ok,true);
});
test('stable logical attachment identity cannot be silently reparented',async t=>{
 const x=await setup(t,{attached:true});const r=await change(x.ra,K.assets,v=>{v.attachments['attachment-a'].practiceId='menu-1';v.attachments['attachment-a'].published.asset.ownerRecordId='menu-1';});assert.equal(r.reason,'attachment-owner-change');
});
test('delete intent merge conflict aborts records/head/oplog together',async t=>{
 const x=await setup(t);const raw=x.a.inspect().values[K.assets],base=x.a.inspect();
 const a=await x.a.prepareWrite({expectedValues:{},operationId:'intent-a'},d=>d.setItem(K.intents,JSON.stringify({'practice_attachment/a':{generation:'a'}})));
 const b=await x.b.prepareWrite({expectedValues:{},operationId:'intent-b'},d=>d.setItem(K.intents,JSON.stringify({'practice_attachment/a':{generation:'b'}})));
 assert.equal((await x.a.commitPreparedWrite(a)).ok,true);assert.equal((await x.b.commitPreparedWrite(b)).reason,'delete-intent-conflict');assert.equal((await x.b.lookupOperation('intent-b')).result,null);assert.equal((await x.ra.readDatasetState()).values[K.assets],raw);
});
test('response-loss retry keeps generation and never repeats intent publication',async t=>{
 const x=await setup(t,{attached:true}),r=await change(x.ra,K.assets,v=>v.attachments={},{operationId:'response-loss'});
 const replay=await x.b.retryWrite(r.retryRequest);assert.equal(replay.replayed,true);assert.equal(replay.seq,r.seq);assert.deepEqual(replay.state.values,r.state.values);
});
for(const mode of ['abort','quota'])test('attachment records/intent/head/oplog remain atomic on '+mode,async t=>{
 const {IDBObjectStore}=createRequire(new URL('./authority-store/package.json',import.meta.url))('fake-indexeddb');const x=await setup(t,{attached:true}),original=IDBObjectStore.prototype.add;
 IDBObjectStore.prototype.add=function(...args){if(this.name==='records'){if(mode==='abort')this.transaction.abort();else throw new DOMException('full','QuotaExceededError');}return original.apply(this,args);};
 let r;try{r=await change(x.ra,K.assets,v=>v.attachments={},{operationId:'failure'});}finally{IDBObjectStore.prototype.add=original;}
 assert.equal(r.ok,false);assert.equal((await x.a.lookupOperation('failure')).result,null);const s=await x.ra.readDatasetState();assert.equal(s.seq,1);assert.equal(s.values[K.intents],null);assert(JSON.parse(s.values[K.assets]).attachments['attachment-a']);
});
const deletions=[
 ['settings','cruisePort.settings',null],['metronome','cruisePort.metronome',null],['tuner','cruisePort.tuner',null],['presets','cruisePort.metronomePresets','items'],
 ['menus','cruisePort.practiceMenus','items'],['progress','cruisePort.practiceProgress',null],['history','cruisePort.practiceHistory','events'],['Calendar','cruisePort.practiceCalendar','notes'],
 ['sets','cruisePort.practiceMenuSets','items'],['Gear','cruisePort.gearList','items'],['categories','cruisePort.gearCategories','categories'],['My Apps','cruisePort.myApps','items']
];
for(const [name,key,field]of deletions)test('logical delete intent key parity with legacy: '+name,async t=>{
 const initial=referenceValues(),map=new Map(Object.entries(initial)),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},legacy=new PortDatasetRepository({storage,locks:createFixtureLocks()}),x=await setup(t,{initial});
 const remove=d=>{if(!field)d.removeItem(key);else{const v=JSON.parse(d.getItem(key));v[field]=[];d.setItem(key,JSON.stringify(v));}};
 const old=await legacy.runWrite({expectedValues:{[key]:legacy.inspect().values[key]}},remove),current=await x.ra.runWrite({expectedValues:{[key]:x.ra.inspect().values[key]}},remove);
 assert.equal(old.ok,true);assert.equal(current.ok,true,JSON.stringify(current));const a=Object.keys(JSON.parse(old.state.values[K.intents]||'{}')).sort(),b=Object.keys(JSON.parse(current.state.values[K.intents]||'{}')).sort();assert.deepEqual(b,a);assert(b.length>0);
});
test('direct Store caller cannot bypass merged candidate owner validation',async t=>{
 const x=await setup(t),base=(await x.a.store.hydrate('g1')).snapshot;
 const metadata=JSON.parse(base.values[K.assets]);metadata.attachments.a=attachment('missing','a');
 const handle=x.a.store.prepare({base,operationId:'direct-store',changes:{[K.assets]:JSON.stringify(metadata)}});
 const r=await x.a.store.commit(handle);assert.equal(r.reason,'attachment-owner-missing');assert.equal((await x.a.lookupOperation('direct-store')).result,null);
});
test('accepted old-schema but invalid reference head is blocked on hydrate, never silently repaired',async t=>{
 const {digest}=await import('../port-idb-authority-contract.mjs');const x=await setup(t,{attached:true}),s=(await x.a.store.hydrate('g1')).snapshot;
 // Corrupt referential content while keeping all physical digest evidence valid.
 const invalid=JSON.parse(s.values[K.menus]);removeMenu(invalid);const raw=JSON.stringify(invalid),version=s.versions[K.menus];
 // Inject through fake IDB request hooks only, simulating an older buggy writer.
 const {IDBObjectStore}=createRequire(new URL('./authority-store/package.json',import.meta.url))('fake-indexeddb'),get=IDBObjectStore.prototype.get;
 IDBObjectStore.prototype.get=function(key){const r=get.call(this,key);const isRecord=this.name==='records'&&Array.isArray(key)&&key[1]===K.menus;
  if(isRecord)r.addEventListener('success',()=>{Object.defineProperty(r,'result',{value:{...r.result,raw,digest:digest({generation:'g1',logicalKey:K.menus,version,raw})}});},{once:true});
  if(this.name==='manifests')r.addEventListener('success',()=>{const m=structuredClone(r.result);m.recordDigests[K.menus]=digest({generation:'g1',logicalKey:K.menus,version,raw});const {digest:old,...body}=m;m.digest=digest(body);Object.defineProperty(r,'result',{value:m});},{once:true});
  return r;
 };
 try{await assert.rejects(x.a.hydrate(),/attachment-owner-missing/);assert.throws(()=>x.ra.inspect(),/attachment-owner-missing/);}finally{IDBObjectStore.prototype.get=get;}
 await x.a.hydrate();assert.equal((await x.a.lookupOperation('seed')).result.seq,1);
});
test('L2b original operation fingerprint remains compatible after inferred CAS refinement',async t=>{
 const {digest}=await import('../port-idb-authority-contract.mjs'),x=await setup(t),r=await change(x.ra,K.assets,v=>v.attachments.a=attachment('menu-0','a'),{operationId:'compat'}),request=r.retryRequest,base=request.base;
 const expected=digest({schemaVersion:1,generation:'g1',operationId:'compat',action:'local',base:{manifestId:base.head.manifestId,seq:base.head.seq,versions:base.versions,control:base.control},changes:request.changes,
  dependencyKeys:[...new Set([...request.dependencyKeys,'cruisePort.gearList','cruisePort.myApps','cruisePort.practiceMenus'])],acknowledgements:[],initialControl:null});
 const db=await new Promise(ok=>{const open=x.factory.open(x.scope.name,1);open.onsuccess=()=>ok(open.result);});
 const stored=await new Promise(ok=>{const tx=db.transaction('oplog'),get=tx.objectStore('oplog').get(['g1','compat']);tx.oncomplete=()=>ok(get.result);});db.close();assert.equal(stored.fingerprint,expected);
 assert.equal((await x.b.retryWrite(request)).replayed,true);
});
