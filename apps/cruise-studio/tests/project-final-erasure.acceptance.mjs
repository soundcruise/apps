// Focused #192 + #193 boundary. Same disposable product Worker/DB and real
// scheduled entry; not a second Owner or synthetic purge implementation.
import assert from 'node:assert/strict';
export async function acceptFinalErasure({A,account,projectId,db,mf,check,activate,request}){
 const DAY=86400000;
 const query=(table,column)=>db.prepare(`SELECT * FROM ${table} WHERE ${column}=? ORDER BY rowid`).bind(account.accountId).all();
 async function payload(){return{chunks:(await query('studio_document_chunks','account_id')).results,heads:(await query('studio_document_records','user_id')).results,history:(await query('studio_document_changes','user_id')).results};}
 async function local(){return A.page.evaluate(async()=>{
  const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const projects=Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('cruiseStudio.project.')).sort().map(k=>[k,localStorage.getItem(k)]));
  const d=await new Promise((resolve,reject)=>{const q=indexedDB.open('cruiseStudio.isolatedCloud.v1');q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('expected existing Outbox'));};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  try{const rows=await new Promise((resolve,reject)=>{const tx=d.transaction('records','readonly'),q=tx.objectStore('records').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});return{projects:Object.keys(projects).length,projectHash:await hash(JSON.stringify(projects)),outboxRows:rows.length,outboxHash:await hash(JSON.stringify(rows))};}finally{d.close();}
 });}
 async function scheduled(){const result=await(await mf.getWorker()).scheduled({cron:'15 3 * * *'});assert.equal(result.outcome,'ok');}
 let retained;
 await check('integrated canary grace and native cancellation retain Project payload and local Outbox; native deleting Account cannot write',async()=>{
  await activate();await db.prepare('UPDATE studio_document_control SET enabled=1').run();await A.page.evaluate(()=>CruiseStudio.projectCloud.refresh());
  // Existing synthetic Account predates its seven-day deletion lifecycle.
  await db.prepare('UPDATE sync_accounts SET created_at=created_at-? WHERE id=?').bind(8*DAY,account.accountId).run();
  retained=await local();assert(retained.projects>0&&retained.outboxRows>0);const before=await payload();assert(before.chunks.length>0);
  const now=Date.now();await db.prepare("UPDATE sync_accounts SET state='deleting',delete_requested_at=?,purge_after=?,generation=generation+1 WHERE id=?").bind(now,now+7*DAY,account.accountId).run();
  const denied=await request(A.page,'begin',{operationId:'00000001-3333-4333-8333-333333333333',documentId:projectId,expectedRevision:1,manifest:{digest:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',bytes:0,chunks:[],deleted:true}});assert(denied.status>=400);assert.equal(denied.body.code,'account_required');
  await scheduled();assert.deepEqual(await payload(),before);assert.deepEqual(await local(),retained);
  await activate('off');await scheduled();assert.deepEqual(await payload(),before);
  await db.prepare("UPDATE sync_accounts SET state='active',delete_requested_at=NULL,purge_after=NULL,generation=generation+1 WHERE id=?").bind(account.accountId).run();await scheduled();assert.deepEqual(await payload(),before);assert.equal(await db.prepare('SELECT account_id FROM studio_document_erased_accounts WHERE account_id=?').bind(account.accountId).first(),null);
 });
 await check('actual activated entry Scheduled purges the mature Account and its Project payload atomically, retaining peer/shared data and local evidence',async()=>{
  await activate();const others=(await db.prepare('SELECT * FROM studio_document_records WHERE user_id<>? ORDER BY user_id,record_id').bind(account.accountId).all()).results;
  const shared=(await db.prepare('SELECT * FROM sync_records ORDER BY user_id,app_id,record_type,record_id').all()).results;
  const cutoff=Date.now()-1000;await db.prepare("UPDATE sync_accounts SET state='deleting',delete_requested_at=?,purge_after=? WHERE id=?").bind(cutoff-7*DAY,cutoff,account.accountId).run();
  // Native memberships have completed their separate lifecycle before final purge.
  await db.prepare("UPDATE sync_account_memberships SET state='deleted',deleted_at=?,updated_at=? WHERE account_id=?").bind(cutoff,cutoff,account.accountId).run();
  await scheduled();assert.equal(await db.prepare('SELECT id FROM sync_accounts WHERE id=?').bind(account.accountId).first(),null);const erased=await payload();assert.equal(erased.chunks.length,0);assert.equal(erased.heads.length,0);assert(erased.history.every(x=>x.payload_json===null));
  const receipt=await db.prepare('SELECT receipt_json FROM studio_document_erased_accounts WHERE account_id=?').bind(account.accountId).first();assert.equal(JSON.parse(receipt.receipt_json).authority,'native-account-purge-v1');assert(JSON.parse(receipt.receipt_json).payloadErased);
  assert.deepEqual((await db.prepare('SELECT * FROM studio_document_records WHERE user_id<>? ORDER BY user_id,record_id').bind(account.accountId).all()).results,others);assert.deepEqual((await db.prepare('SELECT * FROM sync_records ORDER BY user_id,app_id,record_type,record_id').all()).results,shared);assert.deepEqual(await local(),retained);
  await scheduled();assert.equal((await db.prepare('SELECT receipt_json FROM studio_document_erased_accounts WHERE account_id=?').bind(account.accountId).first()).receipt_json,receipt.receipt_json);assert.equal((await db.prepare('SELECT count(*) n FROM d1_migrations').first()).n,33);
  await activate('off');const r=await mf.dispatchFetch('https://isolated.invalid/v2/studio/document',{method:'POST',headers:{Origin:'https://soundcruise.jp','Content-Type':'application/json'},body:JSON.stringify({kind:'catalogue',payload:{limit:20,cursor:null}})});assert.equal(r.status,423);
 });
}
