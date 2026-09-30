// No HTTP entry point. The CLI's Cloudflare OAuth account is the operator identity.
import {legalGate} from './registry.js';
import {factualLabel,allowedArticlePath} from './metadata.js';
import {validatedFingerprint} from './fingerprint.js';
import {DAY,sourceUrl} from './policy.js';
import {reviewCandidate} from './review.js';
export const FEEDBACK_REASONS=Object.freeze(['facts_identifier_missing','date_uncertain','category_uncertain','not_relevant','duplicate','useful_product','policy_concern','operator_review']);
export async function reviewQueue(store){return (await store.candidates()).filter(i=>i.origin!=='legacy_fixture_backfill'&&['pending','reopened'].includes(i.review_status)).map(i=>({id:i.id,label:i.label,source:i.source_name,category:i.category,publishedAt:i.published_at,facts:i.product_facts?JSON.parse(i.product_facts):null,reason:i.decision_reason,sourceUrl:i.source_url,decision:i.publication_decision}));}
export async function operatorDecision(store,input,now,registry,pepper){
 if(!['approve','reject'].includes(input.action)||!FEEDBACK_REASONS.includes(input.reason||'operator_review'))throw Error('operator_decision_invalid');
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();
 if(!row||row.origin==='legacy_fixture_backfill'||!['pending','reopened'].includes(row.review_status))throw Error('review_pending_required');
 if(input.action==='reject')await reviewCandidate(store,{id:input.id,action:'reject',reviewedBy:'operator'},now,registry,pepper);
 else{
  const source=registry.find(s=>s.id===row.source_id),state=await store.state(row.source_id),health=(await store.sourceHealth()).find(h=>h.source_id===row.source_id);
  if(legalGate(source,{...state,nextAt:0,lastPublisherRequestAt:0},now,'production',registry)||health?.status!=='healthy'||!source.discoveryValid||!sourceUrl(row.source_url,source)||!allowedArticlePath(row.source_url,source))throw Error('operator_source_gate');
  let facts;try{facts=JSON.parse(row.product_facts);}catch{}
  const label=factualLabel(facts,row.event_type);
  if(!label||label!==input.label||row.category!==facts.category||input.category!==row.category||row.published_at!==input.publishedAt||!await validatedFingerprint(row.title_fingerprint,pepper))throw Error('verified_factual_label_required');
  const stamp=Date.parse(row.published_at);if(!Number.isFinite(stamp)||stamp>now||now-stamp>=90*DAY||row.expires_at<=now)throw Error('expired_candidate');
  if(input.checks?.factsChecked!==true||input.checks?.relevanceChecked!==true||input.checks?.duplicateChecked!==true||input.checks?.independentLabelChecked!==true)throw Error('operator_checks_required');
  const result=await store.db.batch([
   store.db.prepare(`UPDATE candidate_items SET review_status='approved',reviewed_by='operator',reviewed_at=?,review_reason='operator_surface_verified',review_checks=? WHERE id=? AND review_status=? AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND publication_enabled=1) AND EXISTS(SELECT 1 FROM source_health WHERE source_id=? AND status='healthy') AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR takedown=1)) AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?) AND NOT EXISTS(SELECT 1 FROM candidate_items WHERE topic_key=? AND review_status='approved' AND id<>?)`)
    .bind(new Date(now).toISOString(),JSON.stringify({basis:'validated_official_surface',factsChecked:true,relevanceChecked:true,duplicateChecked:true,independentLabelChecked:true}),row.id,row.review_status,row.source_id,row.source_id,row.id,row.topic_key,row.id),
   store.db.prepare('UPDATE news_controls SET revision=revision+1 WHERE id=1'),
   store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'review-approve',row.id,now,input.reason||'operator_review')
  ]);if(result[0].meta.changes!==1)throw Error('review_state_changed');
 }
 await store.db.prepare('INSERT INTO news_operator_feedback VALUES(?,?,?,?)').bind(crypto.randomUUID(),row.id,now,input.reason||'operator_review').run();
 return {id:row.id,action:input.action,reason:input.reason||'operator_review',at:now,publisherRequests:0};
}
