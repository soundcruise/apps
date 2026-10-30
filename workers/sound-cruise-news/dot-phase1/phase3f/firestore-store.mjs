import {createHash} from 'node:crypto';
import {validateInput,assessEvidence} from '../engine.mjs';
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const canonical=x=>JSON.stringify(stable(x));
const key=x=>sha(x);
const isText=x=>typeof x==='string'&&x.length>0&&x.length<=512;
const validAttempt=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(x);
const HASH=/^[a-f0-9]{64}$/;

// A Firestore transaction never performs Drive I/O. Stable attempt IDs make an
// ambiguous commit safe to repeat without inventing additional audit records.
export async function saveDelivery(db,{input,delivery,attemptId,now}){
 if(!validAttempt(attemptId)||!isText(now)||!delivery||!isText(delivery.fileId)||!isText(delivery.version)||!isText(delivery.noticeId)||!HASH.test(delivery.bodySha256)||delivery.hashVerified!==true)throw Error('invalid_delivery');
 const checked=validateInput(input);
 if(!checked.valid){await recordFailure(db,{attemptId,status:'invalid',noticeId:delivery.noticeId,now});return {status:'invalid',errors:checked.errors};}
 const c=checked.data.candidate;
 const payloadDigest=sha(canonical(checked.data));
 const receipt=db.collection('receipts').doc(key(c.idempotency_key));
 const candidate=db.collection('candidates').doc(key(c.candidate_id));
 const attempt=db.collection('attempts').doc(key(attemptId));
 const validation=assessEvidence(c,[],now);
 return db.runTransaction(async tx=>{
  const [prior,r,old]=await Promise.all([tx.get(attempt),tx.get(receipt),tx.get(candidate)]);
  if(prior.exists){const a=prior.data();if(a.attemptId!==attemptId||a.payloadDigest!==payloadDigest||a.fileId!==delivery.fileId||a.version!==delivery.version||a.noticeId!==delivery.noticeId||a.bodySha256!==delivery.bodySha256)throw Error('attempt_conflict');return {status:a.status,payloadDigest};}
  let status;
  if(r.exists){const a=r.data();if(a.idempotencyKey!==c.idempotency_key)throw Error('receipt_hash_collision');status=a.payloadDigest===payloadDigest&&a.candidateId===c.candidate_id?'replay':'conflict';}
  else if(old.exists){const a=old.data();if(a.candidateId!==c.candidate_id)throw Error('candidate_hash_collision');status='candidate_conflict';}
  else status='created';
  if(status==='created'){
   tx.create(candidate,{candidateId:c.candidate_id,runId:checked.data.run.run_id,input:checked.data,validation,createdAt:now});
   tx.create(receipt,{idempotencyKey:c.idempotency_key,candidateId:c.candidate_id,payloadDigest,createdAt:now});
  }
  tx.create(attempt,{attemptId,status,candidateId:c.candidate_id,runId:checked.data.run.run_id,idempotencyKey:c.idempotency_key,payloadDigest,fileId:delivery.fileId,version:delivery.version,noticeId:delivery.noticeId,bodySha256:delivery.bodySha256,hashVerified:true,schemaValid:true,processedAt:now});
  return {status,payloadDigest};
 });
}
export async function readReview(db,candidateId){
 if(!isText(candidateId))throw Error('invalid_candidate');
 const doc=await db.collection('candidates').doc(key(candidateId)).get();
 if(!doc.exists)return null;
 const v=doc.data();if(v.candidateId!==candidateId)throw Error('candidate_hash_collision');
 return {input:v.input,validation:v.validation,demo_verdict:null};
}

export async function recordFailure(db,{attemptId,status,noticeId,now}){
 if(!validAttempt(attemptId)||!isText(now)||!isText(noticeId)||!['invalid','hash_mismatch','invalid_notice','auth_failed','transient_error','changed_during_read','notice_missing_or_duplicate','provider_or_storage_error','invalid_target','target_mismatch','notice_changed','notice_not_in_folder','invalid_size','invalid_json','not_published','wrong_folder'].includes(status))throw Error('invalid_failure');
 const ref=db.collection('attempts').doc(key(attemptId));
 return db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists){const v=old.data();if(v.attemptId!==attemptId||v.status!==status||v.noticeId!==noticeId)throw Error('attempt_conflict');return {status};}tx.create(ref,{attemptId,status,noticeId,processedAt:now});return {status};});
}
