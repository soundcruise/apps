import {dotSnapshot} from './dot-human-confirmation.js';
import {prepareAssisted,saveAssisted} from './assisted-entry.js';
import {assistedUrl,ASSISTED_PERMISSION} from './assisted-facts.js';
import {readDotNewsSnapshot} from './dot-news-snapshot.js';
import {hash,sourceUrl} from './policy.js';
import {manualFactsPolicy,observationsMatchHuman} from './manual-facts-policy.js';

// Only Yamaha's separately authorized manual Topics route is currently supported.
// Observation strings are an explicit human attestation, never a new permission.
export async function admitDotCandidate(store,reader,input,actor,now,registry,pepper){
 if(actor?.type!=='human_operator')throw Error('operator_denied');
 if(!input||Object.keys(input).sort().join(',')!=='candidateId,confirmationId,human,requestId'||!/^[-A-Za-z0-9_]{1,128}$/.test(input.candidateId||'')||!/^[-A-Za-z0-9_]{16,100}$/.test(input.confirmationId||'')||!/^[-A-Za-z0-9_]{16,100}$/.test(input.requestId||'')||!input.human||typeof input.human!=='object'||Array.isArray(input.human)||Object.keys(input.human).sort().join(',')!=='action,brand,product,productType,publishedAt,url'||Object.values(input.human).some(x=>typeof x!=='string'||x.length>2048))throw Error('operator_query_invalid');
 const h=input.human;
 const confirmation=await store.db.prepare('SELECT * FROM news_dot_confirmations WHERE request_id=? AND candidate_id=? AND actor_id=?').bind(input.confirmationId,input.candidateId,actor.id).first();
 if(!confirmation||confirmation.outcome!=='confirmed'||confirmation.confirmed_at>now||now-confirmation.confirmed_at>=90*86400000)return {status:'needs_confirmation',reasons:['human_confirmation_required']};
 const verifiedEvidenceHash=await hash(JSON.stringify({candidateId:confirmation.candidate_id,digest:confirmation.candidate_digest,revision:confirmation.staging_revision,actor:confirmation.actor_id,evidence:confirmation.evidence_json}));if(verifiedEvidenceHash!==confirmation.evidence_hash)return {status:'needs_confirmation',reasons:['human_confirmation_invalid']};
 const admissionHash=await hash(JSON.stringify({candidateId:input.candidateId,confirmationId:input.confirmationId,human:{url:h.url,brand:h.brand,product:h.product,productType:h.productType,action:h.action,publishedAt:h.publishedAt},actor:actor.id,digest:confirmation.candidate_digest,revision:confirmation.staging_revision,evidenceHash:confirmation.evidence_hash}));
 const receipt=await store.db.prepare('SELECT * FROM news_dot_admission_receipts WHERE request_id=? OR dot_candidate_id=?').bind(input.requestId,input.candidateId).first();
 if(receipt){if(receipt.request_id!==input.requestId||receipt.admission_hash!==admissionHash)throw Error('idempotency_payload_changed');const current=await store.db.prepare('SELECT review_status FROM candidate_items WHERE id=?').bind(receipt.candidate_id).first();if(!current)throw Error('operator_unavailable');return {status:'registered',id:receipt.candidate_id,replayed:true,reviewStatus:current.review_status};}
 const sources=assistedUrl(h.url)?registry.filter(s=>s.id==='yamaha'):registry.filter(s=>manualFactsPolicy(s,h.url,now));if(sources.length!==1){const matches=registry.filter(s=>sourceUrl(h.url,s)===h.url);const kind=matches.length===1?matches[0].sourceKind:null;return {status:'needs_confirmation',reasons:[kind==='retailer_editorial'?'retailer_primary_or_permission_unconfirmed':kind==='media'?'media_primary_or_permission_unconfirmed':matches.length===0?'source_identity_unconfirmed':'source_policy_unconfirmed']};}const source=sources[0],manualPolicy=source.id==='yamaha'?null:manualFactsPolicy(source,h.url,now),permissionRef=manualPolicy?.permissionRef||ASSISTED_PERMISSION;if(manualPolicy&&!manualPolicy.manufacturers.includes(h.brand))return {status:'needs_confirmation',reasons:['manufacturer_source_unbound']};
 let evidence;try{evidence=JSON.parse(confirmation.evidence_json)}catch{return {status:'needs_confirmation',reasons:['human_confirmation_invalid']}}
 if(evidence?.outcome!=='confirmed'||!observationsMatchHuman(evidence.observations,h,permissionRef))return {status:'needs_confirmation',reasons:['human_evidence_unbound']};
 const detail=await reader.detail(input.candidateId),snapshot=await dotSnapshot(detail,input.candidateId),c=detail.candidate;
 if(snapshot.digest!==confirmation.candidate_digest||snapshot.revision!==confirmation.staging_revision)throw Error('candidate_changed');if(!/^[a-f0-9]{64}$/.test(detail.deliveryKeyHash||''))return {status:'needs_confirmation',reasons:['delivery_identity_unavailable']};
 if(!Array.isArray(c.sources)||!c.sources.some(s=>s.url===h.url&&s.canonical_url===h.url)||![c.entity?.brand,c.entity?.manufacturer].includes(h.brand)||![c.entity?.product,...(Array.isArray(c.entity?.models)?c.entity.models:[])].includes(h.product)||(c.event?.type!=='unknown'&&c.event?.type!==h.action)||(c.dates?.article_published?.precision==='day'&&c.dates.article_published.value!==h.publishedAt))return {status:'needs_confirmation',reasons:['candidate_evidence_mismatch']};
 const humanFacts={...h,sourceId:source.id,confirmed:true,requestId:input.requestId};const prepared=await prepareAssisted(store,humanFacts,now,registry,pepper,{allowGeneric:source.id!=='yamaha'});if(prepared.duplicates?.length)return {status:'duplicate',reasons:['formal_same'],matches:prepared.duplicates.map(d=>d.id)};if(!prepared.valid)return {status:'needs_confirmation',reasons:prepared.errors||['formal_validation_failed']};
 const scopes=await readDotNewsSnapshot(store.db,c);if(!scopes||Object.values(scopes).some(x=>!x.complete))return {status:'needs_confirmation',reasons:['history_search_incomplete']};
 if(Object.values(scopes).some(x=>x.items.length))return {status:'needs_confirmation',reasons:['existing_news_or_history']};
 // Re-read immediately before the atomic D1 operation; this still cannot provide
 // a cross-database transaction, so later use must revalidate the snapshot too.
 const latestDetail=await reader.detail(input.candidateId),latest=await dotSnapshot(latestDetail,input.candidateId);if(latest.digest!==snapshot.digest||latest.revision!==snapshot.revision||latestDetail.deliveryKeyHash!==detail.deliveryKeyHash)throw Error('candidate_changed');
 const saved=await saveAssisted(store,humanFacts,now,registry,pepper,actor,{dotCandidateId:input.candidateId,confirmationId:input.confirmationId,digest:snapshot.digest,revision:snapshot.revision,evidenceHash:confirmation.evidence_hash,deliveryKeyHash:detail.deliveryKeyHash,permissionRef,admissionHash});
 if(!saved.saved)return {status:'needs_confirmation',reasons:saved.errors||['formal_validation_failed']};
 return {status:'registered',id:saved.id,replayed:!!saved.replayed,validation:saved.validation};
}
