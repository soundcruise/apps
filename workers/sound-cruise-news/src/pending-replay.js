import {hash,sourceUrl} from './policy.js';
import {factualLabel,validatedProductFacts,factualTopicKey,allowedArticlePath} from './metadata.js';
import {validatedFingerprint} from './fingerprint.js';
import {legalGate} from './registry.js';
// Stored facts are the entire evidence boundary: no title reconstruction, no dictionary guesses.
export async function replayPendingFacts(store,source,registry,now,pepper){
 if(legalGate(source,{...await store.state(source.id),nextAt:0,lastPublisherRequestAt:0},now,'production',registry))throw Error('replay_source_gate');
 const rows=(await store.candidates()).filter(r=>r.source_id===source.id&&r.review_status==='pending'),results=[];
 for(const row of rows){let facts;try{facts=JSON.parse(row.product_facts);}catch{}
  const label=factualLabel(facts,row.event_type);
  const ready=validatedProductFacts(facts)&&facts.identifierBasis==='explicit_listing_facts'&&facts.listingSource==='ikebe'&&row.category===facts.category&&['new_product','release'].includes(row.event_type)&&!['label_required','relevance_uncertain'].includes(row.decision_reason)&&!!label&&row.expires_at>now&&await validatedFingerprint(row.title_fingerprint,pepper);
  if(!ready){results.push({id:row.id,promoted:false,reason:!facts?'stored_identifier_missing':'stored_context_uncertain'});continue;}
  const r=await store.db.batch([store.db.prepare("UPDATE candidate_items SET label=?,publication_decision='AUTO_PUBLISHABLE',decision_reason='factual_label_ready' WHERE id=? AND review_status='pending' AND product_facts=? AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR publication_blocked=1 OR takedown=1))").bind(label,row.id,row.product_facts,source.id),store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'facts-replay',row.id,now,'quality_review')]);results.push({id:row.id,promoted:r[0].meta.changes===1,reason:'stored_explicit_facts'});
 }
 return {sourceId:source.id,publisherRequests:0,results};
}

// Authenticated operator path for a bounded official listing recheck. Only existing
// pending rows are updated; this cannot ingest new rows or revive decisions.
export async function recoverPendingCandidates(store,source,registry,now,pepper,candidates,proof){
 if(source.id!=='ikebe'||proof?.sourceUrl!==source.discoveryUrl||proof.status!==200||proof.headerOptOut!==false||!/^([a-f0-9]{64})$/.test(proof.hash||'')||!Number.isFinite(Date.parse(proof.at))||Date.parse(proof.at)>now||now-Date.parse(proof.at)>3600000)throw Error('recovery_proof_invalid');
 if(legalGate(source,{...await store.state(source.id),nextAt:0,lastPublisherRequestAt:0},now,'production',registry))throw Error('replay_source_gate');
 if(!Array.isArray(candidates)||candidates.length>9||new Set(candidates.map(c=>c.id)).size!==candidates.length)throw Error('recovery_budget_invalid');
 const results=[];
 for(const c of candidates){
  const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(c.id).first();
  if(!row||row.source_id!==source.id||row.review_status!=='pending'){results.push({id:c.id,recovered:false,reason:'decision_preserved'});continue;}
  if(c.sourceId!==source.id||c.sourceUrl!==row.source_url||c.id!==await hash(c.sourceUrl)||!sourceUrl(c.sourceUrl,source)||!allowedArticlePath(c.sourceUrl,source)||c.publishedAt!==row.published_at||c.publishedAt!==row.feed_published_at||row.expires_at<=now){results.push({id:c.id,recovered:false,reason:'identity_date_or_expiry'});continue;}
  const f=c.productFacts,label=factualLabel(f,c.eventType);
  if(!validatedProductFacts(f)||f.identifierBasis!=='reviewed_listing_model'||f.listingSource!=='ikebe'||f.category!==c.category||!label||!await validatedFingerprint(c.titleFingerprint,pepper)||!await validatedFingerprint(row.title_fingerprint,pepper)){results.push({id:c.id,recovered:false,reason:'facts_context_uncertain'});continue;}
  const auto=c.publicationDecision==='AUTO_PUBLISHABLE'&&['new_product','release'].includes(c.eventType)&&['factual_label_ready','factual_label_similarity'].includes(c.decisionReason)&&c.label===label;
  const result=await store.db.batch([
   store.db.prepare(`UPDATE candidate_items SET product_facts=?,label=?,category=?,event_type=?,topic_key=?,title_fingerprint=?,publication_decision=?,decision_reason=? WHERE id=? AND review_status='pending' AND published_at=? AND product_facts IS ? AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR publication_blocked=1 OR takedown=1)) AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?)`)
    .bind(JSON.stringify(f),label,c.category,c.eventType,factualTopicKey(f,c.eventType),c.titleFingerprint,auto?'AUTO_PUBLISHABLE':'PUBLISH_REVIEW',auto?'factual_label_ready':'classification_uncertain',c.id,row.published_at,row.product_facts,source.id,c.id),
   store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'facts-listing-recovery',c.id,now,'quality_review')
  ]);
  results.push({id:c.id,recovered:result[0].meta.changes===1,auto:result[0].meta.changes===1&&auto,reason:auto?'explicit_listing_facts':'event_review_required'});
 }
 return {sourceId:source.id,newCandidates:0,results};
}
