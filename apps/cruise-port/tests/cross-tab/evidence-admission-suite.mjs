// Formalized from the L3b-2 independent audit; exact safety assertions retained.
export async function runEvidenceAdmissionSuite({evaluate,primary,peer}){
 const assert=(await import('node:assert/strict')).default,results=[];
 const call=(s,fn,arg)=>evaluate(s,`crossTab.${fn}(${arg===undefined?'':JSON.stringify(arg)})`);
 const poll=async fn=>{for(let n=0;n<250;n++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,5))}throw Error('inconclusive audit checkpoint')};
 const reset=async()=>{const gen='audit-'+crypto.randomUUID();for(const [s,role] of [[primary,'primary'],[peer,'peer']])await call(s,'prepare',{role,generation:gen,scenario:'save-save-same-key',iterations:1,controlBound:true,clock:{wall:100000,mono:0,origin:'audit-origin'}})};
 for(const action of ['resumeWrites','renewFence']){
  await reset();if(action==='resumeWrites'){await call(primary,'controlPacket',{id:'stop',action:'suspendWrites'});assert((await call(primary,'controlPacketCommit','stop')).ok)}
  const p=await call(primary,'evidencePacket',{id:'expired',action});assert(p.ok);const before=(await call(primary,'controlRead')).snapshot;
  await call(primary,'evidenceClockSet',{wall:170000});assert.equal((await call(primary,'evidenceAbort','expired')).ok,false);
  await call(primary,'reopen');await call(primary,'evidenceClockSet',{wall:110000});assert.equal((await call(primary,'controlPacketCommit','expired')).ok,false);
  assert.equal((await call(primary,'evidencePacket',{id:'expired',action,packet:p.packet})).reason,'control-evidence-runtime-mismatch');
  assert.equal((await call(peer,'evidencePacket',{id:'peer-reuse',action,packet:p.packet})).reason,'control-evidence-runtime-mismatch');
  assert.deepEqual((await call(primary,'controlRead')).snapshot,before);
  assert((await call(primary,'evidencePacket',{id:'fresh',action})).ok);assert((await call(primary,'controlPacketCommit','fresh')).ok);
  results.push({name:action+' expiry write abort → reopen before retry → rollback → cached identity denied / fresh succeeds',pass:true});
  await reset();if(action==='resumeWrites'){await call(primary,'controlPacket',{id:'stop',action:'suspendWrites'});assert((await call(primary,'controlPacketCommit','stop')).ok)}
  assert((await call(primary,'evidencePacket',{id:'late',action})).ok);const state=(await call(primary,'controlRead')).snapshot;
  const r=await evaluate(primary,`(async()=>{const get=IDBObjectStore.prototype.get;let crossed=false;IDBObjectStore.prototype.get=function(...a){const r=get.apply(this,a);if(this.name==='records')r.addEventListener('success',()=>{crossed=true;crossTab.evidenceClockSet({wall:170000})},{once:true});return r};try{return {result:await crossTab.controlPacketCommit('late'),get crossed(){return crossed}}}finally{IDBObjectStore.prototype.get=get}})()`);
  assert(r.crossed);assert.equal(r.result.reason,'control-evidence-stale');assert.deepEqual((await call(primary,'controlRead')).snapshot,state);results.push({name:action+' expiry after first lifetime check during manifest read rejected at final admission',pass:true});
 }
 for(const source of ['wall','mono'])for(const seconds of [29,30,31]){
  await reset();assert((await call(primary,'evidencePacket',{id:'margin'})).ok);await call(primary,'evidenceClockSet',{[source]:(source==='wall'?100000:0)+(60-seconds)*1000});
  const r=await call(primary,'controlPacketCommit','margin');assert.equal(r.ok,seconds>=30);results.push({name:source+' margin '+seconds+' sec',pass:true,outcome:r.reason||r.status});
 }
 for(let round=0;round<3;round++)for(const expiryFirst of [true,false]){
  await reset();const p=await call(primary,'evidencePacket',{id:'shared-operation'});assert(p.ok);
  await evaluate(peer,`(async()=>{const {createTestAuthorityScope}=await import('/apps/cruise-port/tests/authority-store/test-authority.mjs');const {openIDBAuthorityStore,claimPortAuthorityIssuer}=await import('/apps/cruise-port/port-indexeddb-authority-store.mjs');const packet=${JSON.stringify(p.packet)};const name=(await indexedDB.databases()).find(x=>x.name.startsWith('sound-cruise-port-authority-v1-fixture-')).name;const scope=createTestAuthorityScope({indexedDB,name,partitionId:packet.identity.partitionId,now:()=>110000,monotonicNow:()=>987654,clockIdentity:()=>performance.timeOrigin});const store=await openIDBAuthorityStore(scope),issuer=claimPortAuthorityIssuer(scope);globalThis.auditPeer={store,raw:{generation:packet.generation,operationId:'shared-operation',identity:packet.identity,expectedEpoch:packet.controlEpoch,expectedPointerEpoch:packet.pointerEpoch,capability:issuer.issue('control:renew',{generation:packet.generation}),evidence:issuer.attestFixtureFence(packet)},seen:[]};return true})()`);
  await call(primary,'evidenceClockSet',{wall:170000});for(const s of [primary,peer])await call(s,'raceReset');await call(primary,'raceHold');for(const s of [primary,peer])await call(s,'raceTrace');await call(primary,'raceGate');
  await evaluate(peer,`(()=>{const get=IDBObjectStore.prototype.get;auditPeer.restore=()=>IDBObjectStore.prototype.get=get;IDBObjectStore.prototype.get=function(...a){const r=get.apply(this,a);if(this.name==='reservations')r.addEventListener('success',()=>{if(r.result?.kind==='evidence-lifetime')auditPeer.seen.push(r.result.evidenceLifetime.expired)},{once:true});return r};return true})()`);
  const startA=async()=>{await call(primary,'raceDispatch',{kind:'control',id:'shared-operation'});await poll(async()=>(await call(primary,'raceState')).events.some(e=>e.phase==='queued'&&e.mode==='readwrite'&&e.stores.includes('pointer')))};
  const startB=async()=>{await evaluate(peer,`(()=>{auditPeer.store.renewFence(auditPeer.raw).then(r=>auditPeer.result=r);return true})()`);await poll(async()=>(await call(peer,'raceState')).events.some(e=>e.phase==='queued'&&e.mode==='readwrite'))};
  if(expiryFirst){await startA();await startB()}else{await startB();await startA()}
  for(const s of [primary,peer])assert(!(await call(s,'raceState')).events.some(e=>e.phase==='request-started'));
  assert(await call(primary,'raceRelease'));await poll(async()=>(await call(primary,'raceState')).gate?.active);
  if(expiryFirst)assert(!(await call(peer,'raceState')).events.some(e=>e.phase==='request-started'));else{await poll(()=>evaluate(peer,'!!auditPeer.result'));assert((await call(peer,'raceState')).events.some(e=>e.phase==='aborted'))}
  await call(primary,'raceGateRelease');await poll(async()=>(await call(primary,'raceState')).results['shared-operation']?.ok===false);await poll(()=>evaluate(peer,'!!auditPeer.result'));
  const a=await call(primary,'raceState'),b=await call(peer,'raceState'),seen=await evaluate(peer,'({result:auditPeer.result,seen:auditPeer.seen})');assert.equal(a.results['shared-operation'].reason,'control-evidence-stale');assert.equal(seen.result.reason,'control-evidence-runtime-mismatch');assert.deepEqual(seen.seen,[expiryFirst]);assert(a.events.some(e=>e.phase==='completed'));assert(b.events.some(e=>e.phase==='aborted'));assert(![...a.events,...b.events].some(e=>e.phase==='gate-expired'||e.phase==='barrier-expired'));
  await evaluate(peer,'auditPeer.restore();auditPeer.store.dispose();true');for(const s of [primary,peer])await call(s,'raceReset');results.push({name:'same operation / same evidence ownership vs expiry, '+(expiryFirst?'expiry first':'peer first'),round,pass:true,orderProven:true,inconclusive:false,peerSawExpired:seen.seen[0]});
 }
 return results;
}
