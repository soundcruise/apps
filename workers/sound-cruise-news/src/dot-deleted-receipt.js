import {hash} from './policy.js';

// The independent D1 receipt owns ACK recovery after payload/evidence erasure.
export async function deletedDotReceipt(db,input,actor){
 let row;
 try{
  // Request identity takes precedence over a different candidate or URL match.
  row=await db.prepare(`SELECT * FROM news_dot_deleted_receipts
   WHERE request_id=? OR dot_candidate_id=?
   ORDER BY CASE WHEN request_id=? THEN 0 ELSE 1 END LIMIT 1`)
   .bind(input.requestId,input.candidateId,input.requestId).first();
  if(!row){
   const denied=await db.prepare('SELECT 1 AS found FROM news_dot_deleted_receipts WHERE source_url=? OR normalized_url=? LIMIT 1')
    .bind(input.human.url,input.human.url).first();
   return denied?{status:'excluded',reasons:['deleted_article']}:null;
  }
 }catch(error){
  // Only the additive, not-yet-migrated schema is compatible with older installs.
  // SQL outages/corruption must never become permission to register again.
  if(/no such table:\s*(?:main\.)?news_dot_deleted_receipts\b/i.test(String(error?.message)))return null;
  throw error;
 }
 const h=input.human;
 const admissionHash=await hash(JSON.stringify({
  candidateId:input.candidateId,confirmationId:input.confirmationId,
  human:{url:h.url,brand:h.brand,product:h.product,productType:h.productType,action:h.action,publishedAt:h.publishedAt},
  actor:actor.id,digest:row.candidate_digest,revision:row.staging_revision,evidenceHash:row.evidence_hash
 }));
 if(row.request_id!==input.requestId||row.dot_candidate_id!==input.candidateId||row.confirmation_id!==input.confirmationId||row.admission_hash!==admissionHash)throw Error('idempotency_payload_changed');
 return {status:'deleted',id:row.candidate_id,replayed:true,reviewStatus:'deleted'};
}
