/* Isolated Client v1. Not imported by normal Studio boot. Project remains localStorage-owned. */
import {studioCanonical as canonical,studioDigest as digest,studioDocumentUpload} from './document-codec.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const clone=x=>JSON.parse(JSON.stringify(x));
const terminal=new Set(['SYNCED','LOCAL_CHANGED','CONFLICT','REMOTE_ADVANCED','HISTORICAL_RECEIPT','ADOPTED']);
const BINDING=['audience','accountId','deviceId','generation','recoveryVersion','credentialVersion','proId','proGeneration','epoch'];
function validBinding(b){return b&&Object.keys(b).sort().join('|')===BINDING.slice().sort().join('|')&&b.audience==='studio-document-v1'&&['accountId','deviceId','proId'].every(k=>UUID.test(b[k]))&&['generation','recoveryVersion','credentialVersion','proGeneration','epoch'].every(k=>Number.isSafeInteger(b[k])&&b[k]>0);}
async function material(project){const p=clone(project);delete p.updatedAt;delete p.appVersion;return digest(canonical(p));}

// Integrity seals detect corruption; they are not signatures against a same-origin privileged attacker.
function createOutbox(indexedDB,name){
 if(!indexedDB||!name.startsWith('cruiseStudio.isolatedCloud.'))fail('outbox-unavailable');
 let opened;
 const db=()=>opened||(opened=new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('records',{keyPath:'key'});q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('outbox-blocked'));q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();resolve(q.result);};}));
 async function read(key){const d=await db();const row=await new Promise((resolve,reject)=>{const tx=d.transaction('records','readonly'),q=tx.objectStore('records').get(key);let result;q.onsuccess=()=>{result=q.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('outbox-abort'));});if(!row)return null;const {seal,...body}=row;if(await digest(canonical(body))!==seal||body.key!==key)fail('outbox-corrupt');return body;}
 async function write(key,value,expected){const d=await db(),next={...clone(value),key,version:(expected??0)+1},seal=await digest(canonical(next));return new Promise((resolve,reject)=>{const tx=d.transaction('records','readwrite'),store=tx.objectStore('records'),q=store.get(key);let conflict=false;q.onsuccess=()=>{if((q.result?.version??0)!==(expected??0)){conflict=true;tx.abort();return;}store.put({...next,seal});};tx.oncomplete=()=>resolve(next);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(Object.assign(Error(conflict?'outbox-cas':'outbox-abort'),{code:conflict?'outbox-cas':'outbox-abort'}));});}
 async function keys(){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('records','readonly'),q=tx.objectStore('records').getAllKeys();let keys;q.onsuccess=()=>{keys=q.result;};tx.oncomplete=()=>resolve(keys);tx.onerror=()=>reject(tx.error);});}
 return{read,write,keys,async close(){if(opened)(await opened).close();opened=null;}};
}

export function createIsolatedStudioSyncClient({enabled=false,endpoint,fetchImpl=globalThis.fetch,indexedDB=globalThis.indexedDB,locks=globalThis.navigator?.locks,repository,model,readSession,databaseName='cruiseStudio.isolatedCloud.v1',timeoutMs=15000,uploadBatchSize=4}={}){
 if(!repository?.read||!repository?.save||typeof model?.validateProject!=='function'||typeof readSession!=='function')fail('client-dependencies');
 const url=new URL(endpoint||'https://disabled.invalid/isolated/studio/document');
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/isolated/studio/document'||!(url.protocol==='https:'&&url.hostname.endsWith('.invalid')||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))fail('production-endpoint-forbidden');
 if(!Number.isSafeInteger(uploadBatchSize)||uploadBatchSize<1||uploadBatchSize>4)fail('upload-batch-config');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)fail('timeout-config');
 const box=createOutbox(indexedDB,databaseName);
 let disposed=false;
 function session(){if(enabled!==true||disposed)fail('client-off');const s=readSession();if(!s||typeof s.then==='function'||!validBinding(s.binding)||typeof s.sessionId!=='string'||!s.sessionId||typeof s.credential!=='string'||typeof s.proCredential!=='string'||!Number.isFinite(s.validUntil)||s.validUntil<=Date.now())fail('session-required');return{...s,binding:clone(s.binding),token:canonical({binding:s.binding,sessionId:s.sessionId,credential:s.credential,proCredential:s.proCredential})};}
 function current(c){try{return session().token===c.token;}catch{return false;}}
 const assertCurrent=c=>{if(!current(c))fail('session-changed');};
 const target=id=>({type:'project',projectId:id});
 function local(id){const r=repository.read(target(id));if(!r.ok)fail('local-read');return r;}
 function validate(p,id){if(p?.schemaVersion!==2||p.projectId!==id||model.validateProject(p)?.ok!==true)fail('project-invalid');}
 function lock(id,fn){if(typeof id!=='string'||!id||id.length>200)fail('document-id');if(!locks?.request)fail('locks-unavailable');return locks.request('cruiseStudio.cloud.document.'+id,{mode:'exclusive'},fn);}
 const linkKey=(c,id)=>'link:'+c.binding.accountId+':'+id,opKey=id=>'op:'+id;
 async function affinity(c,id){const a=await box.read('account:'+id);if(a&&a.accountId!==c.binding.accountId)fail('local-account-conflict');return a;}
 async function bindAffinity(c,id){let a=await affinity(c,id);assertCurrent(c);if(!a)a=await box.write('account:'+id,{accountId:c.binding.accountId},0);return a;}
 async function op(c,id){if(!UUID.test(id))fail('operation-id');const o=await box.read(opKey(id));if(!o||o.binding.accountId!==c.binding.accountId)fail('operation-owner');await verify(o);return o;}
 async function verify(o){if(!validBinding(o.binding)||o.request.operationId!==o.operationId||o.request.documentId!==o.documentId||o.requestDigest!==await digest(canonical({binding:o.binding,...o.request})))fail('operation-corrupt');const m=o.request.manifest;if(o.parts.length!==m.chunks.length)fail('operation-corrupt');for(let i=0;i<o.parts.length;i++){if(new TextEncoder().encode(o.parts[i]).length!==m.chunks[i].bytes||await digest(o.parts[i])!==m.chunks[i].digest)fail('operation-corrupt');}if(await digest(o.parts.join(''))!==m.digest)fail('operation-corrupt');}
 async function update(o,patch){return box.write(opKey(o.operationId),{...o,...patch},o.version);}
 async function call(c,kind,payload){assertCurrent(c);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetchImpl(url.href,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.credential,'X-Sound-Cruise-Pro-Authorization':'Bearer '+c.proCredential},body:JSON.stringify({kind,payload})});assertCurrent(c);const body=await response.json();assertCurrent(c);if(response.status!==200)throw Object.assign(Error(body.code||'owner-hold'),{code:body.code||'owner-hold',ownerHold:true});return body;}finally{clearTimeout(timer);}}
 function receipt(o,r){const expected={type:'studio-document-commit-v1',accountId:o.binding.accountId,deviceId:o.binding.deviceId,epoch:o.binding.epoch,generation:o.binding.generation,documentId:o.documentId,operationId:o.operationId,requestDigest:o.requestDigest,documentDigest:o.request.manifest.digest,revision:o.request.expectedRevision+1,deleted:o.request.manifest.deleted};const copy=clone(r);delete copy.historical;delete copy.authorizesNewOperation;if(canonical(copy)!==canonical(expected)||r.historical!==true||r.authorizesNewOperation!==false)fail('receipt-mismatch');return expected;}
 async function linkAfterCommit(c,o,r){
  const head=await call(c,'snapshot',{documentId:o.documentId});assertCurrent(c);
  const matches=head.revision===r.revision&&(r.deleted?head.status==='deleted':head.status==='ready'&&await digest(canonical(head.project))===r.documentDigest);
  if(!matches)return update(o,{state:'REMOTE_ADVANCED',receipt:r,observedHead:head.status,observedRevision:head.revision??null});
  if(!r.deleted)validate(head.project,o.documentId);
  const l=await box.read(linkKey(c,o.documentId));
  if(l?.active!==o.operationId||l?.intent)return update(o,{state:'HISTORICAL_RECEIPT',receipt:r});
  await box.write(linkKey(c,o.documentId),{accountId:c.binding.accountId,documentId:o.documentId,cloudRevision:r.revision,cloudDigest:r.documentDigest,deleted:r.deleted,lastLocalRevision:o.localRevision,lastOperation:o.operationId,active:o.operationId},l?.version??0);
  assertCurrent(c);return update(o,{receipt:r,state:local(o.documentId).revision===o.localRevision?'SYNCED':'LOCAL_CHANGED'});
 }
 async function uncertain(c,o,error){
  // Persist only this captured Account operation. Never change another Account's local Project.
  let state=error.code==='session-changed'?'PENDING_RECOVERY':error.ownerHold?'PENDING_RECOVERY':'UNKNOWN';
  const latest=await box.read(opKey(o.operationId));if(latest&&latest.version===o.version)await update(o,{state,error:typeof error.code==='string'?error.code:'transport-unknown'});
  throw Object.assign(Error(error.code||'transport-unknown'),{code:error.code||'transport-unknown',operationId:o.operationId,state});
 }
 async function enqueue(documentId,{deleted=false}={}){const c=session();return lock(documentId,async()=>{
  assertCurrent(c);await bindAffinity(c,documentId);const l=await box.read(linkKey(c,documentId));if(l?.intent)fail('local-apply-unknown');if(l?.deleted)fail('document-deleted');
  if(l?.active){const prior=await op(c,l.active);if(!terminal.has(prior.state))fail('operation-unresolved');}
  const here=local(documentId);if(!here.exists)fail('local-missing');validate(here.snapshot,documentId);const operationId=crypto.randomUUID(),cloudRevision=l?.cloudRevision??0;
  const u=deleted?{request:{operationId,documentId,expectedRevision:cloudRevision,manifest:{digest:await digest(''),bytes:0,chunks:[],deleted:true}},parts:[]}:await studioDocumentUpload(here.snapshot,cloudRevision,operationId);
  assertCurrent(c);const o=await box.write(opKey(operationId),{operationId,documentId,binding:c.binding,sessionId:c.sessionId,localRevision:here.revision,localDigest:await digest(here.revision),request:u.request,requestDigest:await digest(canonical({binding:c.binding,...u.request})),parts:u.parts,nextChunk:0,phase:'queued',state:'QUEUED',receipt:null},0);
  // If the next write fails, the sealed operation still exists, but is not sent. Explicit recoverIndex can attach it.
  try{await box.write(linkKey(c,documentId),{...(l||{}),accountId:c.binding.accountId,documentId,cloudRevision,active:operationId},l?.version??0);}catch(e){throw Object.assign(e,{operationId,state:'INDEX_UNCONFIRMED'});}return clone(o);
 });}
 async function send(operationId){const c=session(),initial=await op(c,operationId);return lock(initial.documentId,async()=>{
  let o=await op(c,operationId);assertCurrent(c);await affinity(c,o.documentId);const l=await box.read(linkKey(c,o.documentId));if(l?.active!==operationId)fail('operation-index-unconfirmed');
  if(canonical(o.binding)!==canonical(c.binding)||o.sessionId!==c.sessionId)fail('pending-recovery-required');if(!['QUEUED','UPLOADING'].includes(o.state))fail('explicit-reconcile-required');
  try{
   o=await update(o,{state:'UPLOADING',phase:'enroll'});await call(c,'enroll',{});
   o=await update(o,{phase:'begin'});const began=await call(c,'begin',o.request);if(began.status!=='pending'||began.operationId!==o.operationId)fail('begin-mismatch');
   for(let i=o.nextChunk;i<o.parts.length;){
    let end=Math.min(o.parts.length,i+uploadBatchSize),chunks,kind,payload;
    // Bound encoded wire bytes, including JSON escaping, below the existing HTTP limit.
    do{chunks=o.parts.slice(i,end).map((data,j)=>({index:i+j,data}));kind=chunks.length===1?'upload':'upload-batch';payload=chunks.length===1?{operationId,...chunks[0]}:{operationId,chunks};if(new TextEncoder().encode(JSON.stringify({kind,payload})).length<=900*1024)break;end--;}while(end>i);
    if(end<=i)fail('chunk-wire-limit');
    o=await update(o,{phase:'chunk'});const uploaded=await call(c,kind,payload);
    if(uploaded.status!=='staged'||uploaded.operationId!==operationId||uploaded.manifestDigest!==o.request.manifest.digest||canonical(uploaded.indexes)!==canonical(chunks.map(x=>x.index)))fail('chunk-response');
    o=await update(o,{nextChunk:end});i=end;
   }
   o=await update(o,{state:'COMMITTING',phase:'commit'});const r=await call(c,'commit',{operationId});if(r.status==='conflict')return update(o,{state:'CONFLICT',conflictRevision:o.request.expectedRevision});
   receipt(o,r);o=await update(o,{state:'RECEIPTED',receipt:r,phase:'readback'});return await linkAfterCommit(c,o,r);
  }catch(e){return uncertain(c,o,e);}
 });}
 async function reconcile(operationId){const c=session(),first=await op(c,operationId);return lock(first.documentId,async()=>{
  let o=await op(c,operationId);assertCurrent(c);try{
   const r=await call(c,'reconcile',{operationId,requestDigest:o.requestDigest});
   if(r.status==='absent'){if(r.requestDigest!==o.requestDigest||r.operationId!==o.operationId||r.accountId!==c.binding.accountId||!['enroll','begin','queued'].includes(o.phase)||canonical(o.binding)!==canonical(c.binding)||o.sessionId!==c.sessionId)fail('missing-pending-unknown');return update(o,{state:'QUEUED',phase:'queued'});}
   if(r.status==='pending-recovery-required')return update(o,{state:'PENDING_RECOVERY'});
   if(r.status==='pending')return update(o,{nextChunk:0,state:canonical(o.binding)===canonical(c.binding)&&o.sessionId===c.sessionId?'UPLOADING':'PENDING_RECOVERY'});
   receipt(o,r);o=await update(o,{state:'RECEIPTED',receipt:r});return await linkAfterCommit(c,o,r);
  }catch(e){return uncertain(c,o,e);}
 });}

 async function adoptOperation(sourceId,{proofOperationId=null}={}){const c=session(),first=await op(c,sourceId);return lock(first.documentId,async()=>{
  let old=await op(c,sourceId);assertCurrent(c);await affinity(c,old.documentId);const link=await box.read(linkKey(c,old.documentId));if(link?.intent||link?.active&&link.active!==sourceId&&link.active!==old.adoptionRequest?.operationId&&!terminal.has((await op(c,link.active)).state))fail('adoption-active-conflict');
  const input=old.adoptionRequest||{operationId:crypto.randomUUID(),sourceOperationId:sourceId,sourceDigest:old.requestDigest,documentId:old.documentId,proofOperationId};
  if(old.adoptionBinding&&canonical(old.adoptionBinding)!==canonical(c.binding))fail('adoption-generation-changed');if(input.proofOperationId!==proofOperationId)fail('adoption-proof-changed');
  old=await update(old,{state:'ADOPTION_UNKNOWN',adoptionRequest:input,adoptionBinding:c.binding});
  try{
   const r=await call(c,'adopt',input);if(r.status==='source-committed'){receipt(old,r.receipt);old=await update(old,{state:'RECEIPTED',receipt:r.receipt});return linkAfterCommit(c,old,r.receipt);}
   const request={...old.request,operationId:input.operationId};const requestDigest=await digest(canonical({binding:c.binding,...request}));
   const expected={type:'studio-pending-adoption-v1',accountId:c.binding.accountId,operationId:input.operationId,sourceOperationId:sourceId,sourceDigest:old.requestDigest,documentId:old.documentId,binding:c.binding,requestDigest,request,proofOperationId};const checked={...r};delete checked.historical;if(canonical(checked)!==canonical(expected)||typeof r.historical!=='boolean')fail('adoption-receipt-mismatch');
   let next=await box.read(opKey(input.operationId));if(next){if(next.requestDigest!==requestDigest||canonical(next.binding)!==canonical(c.binding))fail('adoption-local-mismatch');await verify(next);}else next=await box.write(opKey(input.operationId),{...old,operationId:input.operationId,request,requestDigest,binding:c.binding,sessionId:c.sessionId,state:'UPLOADING',phase:'begin',nextChunk:0,receipt:null,adoptionRequest:null,adoptionBinding:null,adoptedFrom:sourceId},0);
   assertCurrent(c);await box.write(linkKey(c,old.documentId),{...(link||{}),accountId:c.binding.accountId,documentId:old.documentId,cloudRevision:link?.cloudRevision??old.request.expectedRevision,active:next.operationId},link?.version??0);
   old=await update(old,{state:'ADOPTED',adoptionReceipt:r});return{state:'ADOPTED',operationId:next.operationId,receipt:r};
  }catch(e){throw Object.assign(Error(e.code||'adoption-unknown'),{code:e.code||'adoption-unknown',operationId:input.operationId,sourceOperationId:sourceId,state:'ADOPTION_UNKNOWN'});}
 });}

 async function recoverAdoption(sourceId){const c=session(),first=await op(c,sourceId);return lock(first.documentId,async()=>{let old=await op(c,sourceId);if(!old.adoptionRequest)fail('no-adoption-intent');const r=await call(c,'adoption-history',{operationId:old.adoptionRequest.operationId}),a=r.receipt;
  if(r.status!=='historical-adoption'||r.authorizesNewOperation!==false||a?.historical!==true||a.type!=='studio-pending-adoption-v1'||a.accountId!==c.binding.accountId||a.operationId!==old.adoptionRequest.operationId||a.sourceOperationId!==sourceId||a.sourceDigest!==old.requestDigest||a.proofOperationId!==old.adoptionRequest.proofOperationId||a.documentId!==old.documentId||!validBinding(a.binding)||a.binding.accountId!==c.binding.accountId||canonical(a.request)!==canonical({...old.request,operationId:a.operationId})||a.requestDigest!==await digest(canonical({binding:a.binding,...a.request})))fail('adoption-history-mismatch');
  const link=await box.read(linkKey(c,old.documentId));if(link?.intent||link?.active&&![sourceId,a.operationId].includes(link.active)&&!terminal.has((await op(c,link.active)).state))fail('adoption-active-conflict');
  let next=await box.read(opKey(a.operationId));if(!next)next=await box.write(opKey(a.operationId),{...old,operationId:a.operationId,binding:a.binding,request:a.request,requestDigest:a.requestDigest,state:'PENDING_RECOVERY',sessionId:'historical-adoption-only',phase:'begin',nextChunk:0,receipt:null,adoptionRequest:null,adoptionBinding:null,adoptedFrom:sourceId},0);else{await verify(next);if(next.requestDigest!==a.requestDigest)fail('adoption-history-mismatch');}
  assertCurrent(c);await box.write(linkKey(c,old.documentId),{...(link||{}),accountId:c.binding.accountId,documentId:old.documentId,cloudRevision:link?.cloudRevision??a.request.expectedRevision,active:a.operationId},link?.version??0);old=await update(old,{state:'ADOPTED',adoptionReceipt:a});return{state:'PENDING_RECOVERY',operationId:a.operationId,historical:true,authorizesNewOperation:false};
 });}
 async function observe(documentId){const c=session();return lock(documentId,async()=>{await affinity(c,documentId);const head=await call(c,'snapshot',{documentId});assertCurrent(c);if(head.status==='ready'){validate(head.project,documentId);return{state:'REMOTE_AVAILABLE',head};}if(head.status==='deleted')return{state:'REMOTE_DELETED',localPreserved:true,head};if(head.status==='absent')return{state:'REMOTE_ABSENT',head};fail('snapshot-invalid');});}
 async function applyRemote(documentId,expectedLocalRevision){const c=session();return lock(documentId,async()=>{
  assertCurrent(c);await bindAffinity(c,documentId);let l=await box.read(linkKey(c,documentId));if(l?.intent)fail('local-apply-unknown');if(l?.active&&!terminal.has((await op(c,l.active)).state))fail('operation-unresolved');
  if(local(documentId).revision!==expectedLocalRevision)fail('local-conflict');const head=await call(c,'snapshot',{documentId});assertCurrent(c);
  if(head.status==='deleted'){await box.write(linkKey(c,documentId),{...(l||{}),accountId:c.binding.accountId,documentId,cloudRevision:head.revision,deleted:true},l?.version??0);return{state:'REMOTE_DELETED',localPreserved:true};}
  if(head.status!=='ready')fail('remote-not-ready');validate(head.project,documentId);
  l=await box.write(linkKey(c,documentId),{...(l||{}),accountId:c.binding.accountId,documentId,intent:{headRevision:head.revision,cloudDigest:await digest(canonical(head.project)),materialDigest:await material(head.project),expectedLocalRevision}},l?.version??0);
  assertCurrent(c);const saved=await repository.save({target:target(documentId),baseRevision:expectedLocalRevision,snapshot:head.project,precondition:()=>current(c)});
  if(!saved.ok){if(saved.code!=='result-unknown')await box.write(linkKey(c,documentId),{...l,intent:null,lastLocalFailure:saved.code||'local-save'},l.version);fail(saved.code||'local-save');}assertCurrent(c);
  await box.write(linkKey(c,documentId),{accountId:c.binding.accountId,documentId,cloudRevision:head.revision,cloudDigest:l.intent.cloudDigest,lastLocalRevision:saved.revision,deleted:false,intent:null},l.version);return{state:'LOCAL_SAVED_FROM_CLOUD',cloudRevision:head.revision};
 });}
 async function recoverLocal(documentId){const c=session();return lock(documentId,async()=>{
  await affinity(c,documentId);const l=await box.read(linkKey(c,documentId));if(!l?.intent)fail('no-local-intent');const here=local(documentId);if(here.revision===l.intent.expectedLocalRevision){await call(c,'snapshot',{documentId});assertCurrent(c);await box.write(linkKey(c,documentId),{...l,intent:null,lastLocalFailure:'not-applied'},l.version);return{state:'LOCAL_NOT_APPLIED',localPreserved:true};}if(!here.exists||await material(here.snapshot)!==l.intent.materialDigest)fail('local-recovery-conflict');
  // Recheck currently authorized backend head; never treat local material as a current credential.
  const head=await call(c,'snapshot',{documentId});if(head.status!=='ready'||head.revision!==l.intent.headRevision||await digest(canonical(head.project))!==l.intent.cloudDigest)fail('remote-recovery-conflict');assertCurrent(c);
  await box.write(linkKey(c,documentId),{accountId:c.binding.accountId,documentId,cloudRevision:head.revision,cloudDigest:l.intent.cloudDigest,lastLocalRevision:here.revision,deleted:false,intent:null},l.version);return{state:'LOCAL_RECONCILED'};
 });}
 async function preserveLocal(documentId,expectedLocalRevision){const c=session();return lock(documentId,async()=>{await affinity(c,documentId);const l=await box.read(linkKey(c,documentId));if(!l?.intent)fail('no-local-intent');if(local(documentId).revision!==expectedLocalRevision)fail('local-conflict');await call(c,'snapshot',{documentId});assertCurrent(c);await box.write(linkKey(c,documentId),{...l,intent:null,lastLocalFailure:'explicit-local-conflict-preserved'},l.version);return{state:'LOCAL_CONFLICT_PRESERVED'};});}
 async function recoverIndex(operationId){const c=session(),o=await op(c,operationId);return lock(o.documentId,async()=>{assertCurrent(c);await affinity(c,o.documentId);const l=await box.read(linkKey(c,o.documentId));if(l?.active&&l.active!==operationId&&!terminal.has((await op(c,l.active)).state))fail('operation-index-conflict');if(l?.intent)fail('local-apply-unknown');if(canonical(o.binding)!==canonical(c.binding))fail('pending-recovery-required');await box.write(linkKey(c,o.documentId),{...(l||{}),accountId:c.binding.accountId,documentId:o.documentId,cloudRevision:l?.cloudRevision??o.request.expectedRevision,active:operationId},l?.version??0);return{state:'INDEX_RECONCILED'};});}
 return Object.freeze({enqueue,send,reconcile,adoptOperation,recoverAdoption,observe,applyRemote,recoverLocal,preserveLocal,recoverIndex,async inspect(operationId){const c=session();const o=await op(c,operationId);assertCurrent(c);return clone(o);},async list(documentId){const c=session(),items=[];for(const k of await box.keys()){if(k.startsWith('op:')){const o=await box.read(k);if(o.binding?.accountId===c.binding.accountId&&(!documentId||o.documentId===documentId)){await verify(o);items.push(clone(o));}}}assertCurrent(c);return items;},async dispose(){disposed=true;await box.close();}});
}
