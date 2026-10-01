import {factualLabel,validatedProductFacts} from './metadata.js';
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
