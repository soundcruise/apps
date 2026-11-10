import {saveAssisted} from './assisted-entry.js';
import {assistedSource,assistedProvenance} from './assisted-facts.js';
import {candidateSnapshot,operatorDecision} from './operator-review.js';
import {publicationValidation,CHECKS,REASONS} from './decision-policy.js';
import {effectiveCategory} from './category-editor.js';

export const FINAL_CONFIRMATION='reviewed-and-decided-v1';
// Compose existing facts-save and Ledger operations. A failed publication leaves
// the audited pending candidate; it is never presented as a completed decision.
export async function decideAssisted(store,input,now,registry,pepper,actor){
 if(actor?.type!=='human_operator')throw Error('operator_denied');
 if(!input||Object.keys(input).some(k=>!['entry','action','reason','requestId','confirmation'].includes(k))||!['approve','reject'].includes(input.action)||!REASONS[input.action].includes(input.reason)||!/^[-a-zA-Z0-9_]{16,64}$/.test(input.requestId||'')||!input.entry||typeof input.entry!=='object'||Array.isArray(input.entry)||['id','snapshot','requestId'].some(k=>Object.hasOwn(input.entry,k)))throw Error('assisted_decision_invalid');
 if(input.confirmation!==FINAL_CONFIRMATION||input.entry.confirmed!==true)throw Error('assisted_decision_confirmation_required');
 const saveId=input.requestId+'-'+input.action+'-'+input.reason,decisionId=input.requestId+'-decision';
 const saved=await saveAssisted(store,{...input.entry,requestId:saveId},now,registry,pepper,actor);
 if(!saved.saved){const existing=await store.db.prepare('SELECT id,review_status FROM candidate_items WHERE normalized_url=?').bind(input.entry.url).first();return {...saved,completed:false,...(existing?{existingId:existing.id,existingStatus:existing.review_status}:{})};}
 try{
  const audit=await store.db.prepare('SELECT * FROM news_assisted_edits WHERE request_id=?').bind(saveId).first();
  if(!audit)throw Error('assisted_decision_changed');
  const prior=await store.db.prepare('SELECT * FROM news_decision_ledger WHERE request_id=?').bind(decisionId).first();
  const checks=Object.fromEntries(CHECKS.map(k=>[k,true]));
  if(prior){
   // Replay the original CAS frame, not a new snapshot of the now-decided row.
   const replay={id:saved.id,action:input.action,reason:input.reason,requestId:decisionId,snapshot:prior.candidate_snapshot,revision:prior.candidate_revision,...(input.action==='approve'?{label:prior.persisted_label,category:prior.category,publishedAt:audit.published_at,checks}:{})};
   const result=await operatorDecision(store,replay,now,registry,pepper,actor),current=await store.db.prepare('SELECT review_status FROM candidate_items WHERE id=?').bind(saved.id).first();
   return {...result,completed:true,replayed:true,currentStatus:current?.review_status||'unavailable'};
  }
  const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(saved.id).first(),source=assistedSource(input.entry.url);
  if(row&&!['pending','reopened'].includes(row.review_status))return {completed:false,existingId:row.id,existingStatus:row.review_status,errors:['既に判断済みです。既存の判断は変更していません。']};
  if(!row||row.source_url!==audit.source_url||row.published_at!==audit.published_at||row.product_facts!==audit.facts_json||row.label!==audit.label||row.facts_provenance!==assistedProvenance(source,saveId,audit.verified_at,actor.id)||await effectiveCategory(store,row)!==JSON.parse(audit.facts_json).category)throw Error('assisted_decision_changed');
  const validation=input.action==='approve'?await publicationValidation(store,row,now,registry,pepper):null;
  if(validation&&!validation.valid)throw Error(validation.errors[0]);
  const decision={id:row.id,action:input.action,reason:input.reason,requestId:decisionId,snapshot:await candidateSnapshot(row),revision:row.review_revision,...(validation?{label:validation.publishableLabel,category:await effectiveCategory(store,row),publishedAt:row.published_at,checks}:{})};
  return {...await operatorDecision(store,decision,now,registry,pepper,actor),completed:true};
 }catch(error){error.pendingCandidateId=saved.id;throw error;}
}
