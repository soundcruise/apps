import {productTypes,validTypeEvidence,labelMatchesType} from './assisted-product-type.js';
import {manualFactsPolicy,observationsMatchHuman} from './manual-facts-policy.js';
import {hash} from './policy.js';
// Human observation permission is independent of Bot acquisition permission.
export const ASSISTED_ORIGIN='operator_assisted';
export const ASSISTED_PERMISSION='yamaha-human-facts-20261028';
export const assistedSources=[{id:'yamaha',name:'ヤマハ / ヤマハミュージックジャパン',automatic:'not_allowed',manual:'permitted_topics_only'}];
export const assistedTypes={...productTypes,guitar_accessory:['ギター関連アクセサリー','acoustic_guitar']};
export const assistedActions={announcement:'を発表',release:'を発売',introduction:'を紹介',event_announcement:'の開催を案内',interview:'を公開'};
export function assistedUrl(raw){try{const u=new URL(raw);return u.href===raw&&u.origin==='https://jp.yamaha.com'&&!u.search&&!u.hash&&/^\/musical-instruments\/guitars-basses-amps\/explore\/topics\/20\d{2}\/[a-zA-Z0-9_-]+\.html$/.test(u.pathname)?raw:null;}catch{return null;}}
const safe=s=>typeof s==='string'&&s===s.trim()&&s.length>=2&&s.length<=100&&!/[<>\x00-\x1f]|https?:/.test(s);
export function assistedLabel(f){if(f?.kind!=='assisted_notice'||!safe(f.brand)||!safe(f.product)||!assistedTypes[f.productType]||!assistedActions[f.action]||f.category!==assistedTypes[f.productType][1])return null;
 if(f.typeEvidence&&!validTypeEvidence(f.typeEvidence,f.productType))return null;
 if(!f.typeEvidence&&!['acoustic_guitar','electro_acoustic','pickup','guitar_amp','guitar_accessory','interview','event'].includes(f.productType))return null;
 if(f.productType==='event'&&(f.action!=='event_announcement'||!/^20\d{2}-\d\d-\d\d$/.test(f.eventDate||'')||!safe(f.venue)))return null;
 if(f.productType==='interview'&&f.action!=='interview'||!['event','interview'].includes(f.productType)&&!['announcement','release','introduction'].includes(f.action))return null;
 return `${f.brand}、${assistedTypes[f.productType][0]}「${f.product}」${assistedActions[f.action]}`;}
export function assistedPredicate(alias='c'){if(!/^[a-z]$/.test(alias))throw Error('sql_alias_invalid');return `(${alias}.origin='operator_assisted' AND ${alias}.source_id='yamaha' AND EXISTS(SELECT 1 FROM news_assisted_edits a WHERE a.candidate_id=${alias}.id AND a.source_url=${alias}.source_url AND a.published_at=${alias}.published_at AND a.facts_json=${alias}.product_facts AND a.label=${alias}.label AND a.permission_ref='${ASSISTED_PERMISSION}'))`;}
export async function assistedProof(store,row,now,registry=[]){
 if(row.origin!==ASSISTED_ORIGIN)return false;
 const policy=row.source_id==='yamaha'?(assistedUrl(row.source_url)?{permissionRef:ASSISTED_PERMISSION}:null):manualFactsPolicy(registry.find(s=>s.id===row.source_id),row.source_url,now);if(!policy)return false;
 const a=await store.db.prepare('SELECT * FROM news_assisted_edits WHERE candidate_id=? ORDER BY verified_at DESC,rowid DESC LIMIT 1').bind(row.id).first();let facts;try{facts=JSON.parse(row.product_facts);}catch{return false;}
 if(facts?.typeEvidence&&(!assistedLabel(facts)||!labelMatchesType(row.label,facts.productType)))return false;
 if(!a||a.source_url!==row.source_url||a.published_at!==row.published_at||a.facts_json!==row.product_facts||a.label!==row.label||a.permission_ref!==policy.permissionRef||a.verified_at>now||now-a.verified_at>=90*86400000||a.actor_type!=='human_operator'||row.facts_provenance!==JSON.stringify({method:'human_official_article_confirmation',permissionRef:policy.permissionRef,confirmationId:a.request_id,verifiedAt:a.verified_at,actor:a.actor_id,publisherHttpRequests:0}))return false;
 if(row.source_id==='yamaha')return true;if(!policy.manufacturers.includes(facts.brand))return false;
 const receipt=await store.db.prepare('SELECT * FROM news_dot_admission_receipts WHERE request_id=? AND candidate_id=? AND actor_id=?').bind(a.request_id,row.id,a.actor_id).first();if(!receipt)return false;
 const c=await store.db.prepare('SELECT * FROM news_dot_confirmations WHERE request_id=? AND candidate_id=? AND actor_id=?').bind(receipt.confirmation_id,receipt.dot_candidate_id,a.actor_id).first();if(!c||c.outcome!=='confirmed'||c.confirmed_at>now||now-c.confirmed_at>=90*86400000||c.candidate_digest!==receipt.candidate_digest||c.staging_revision!==receipt.staging_revision||c.evidence_hash!==receipt.evidence_hash)return false;
 const evidenceHash=await hash(JSON.stringify({candidateId:c.candidate_id,digest:c.candidate_digest,revision:c.staging_revision,actor:c.actor_id,evidence:c.evidence_json}));if(evidenceHash!==c.evidence_hash)return false;
 let evidence;try{evidence=JSON.parse(c.evidence_json)}catch{return false}
 const stamp=Date.parse(row.published_at);if(!Number.isFinite(stamp))return false;const date=new Date(stamp+9*3600000).toISOString().slice(0,10);return evidence.outcome==='confirmed'&&observationsMatchHuman(evidence.observations,{url:row.source_url,brand:facts.brand,product:facts.product,action:facts.action,publishedAt:date,productType:facts.productType},policy.permissionRef);
}
