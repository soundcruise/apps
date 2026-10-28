import {productTypes,validTypeEvidence,labelMatchesType} from './assisted-product-type.js';
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
export async function assistedProof(store,row,now){if(row.origin!==ASSISTED_ORIGIN||row.source_id!=='yamaha'||!assistedUrl(row.source_url))return false;const a=await store.db.prepare('SELECT * FROM news_assisted_edits WHERE candidate_id=? ORDER BY verified_at DESC,rowid DESC LIMIT 1').bind(row.id).first();let facts;try{facts=JSON.parse(row.product_facts);}catch{return false;}if(facts?.typeEvidence&&(!assistedLabel(facts)||!labelMatchesType(row.label,facts.productType)))return false;return !!a&&a.source_url===row.source_url&&a.published_at===row.published_at&&a.facts_json===row.product_facts&&a.label===row.label&&a.permission_ref===ASSISTED_PERMISSION&&a.verified_at<=now&&now-a.verified_at<90*86400000&&a.actor_type==='human_operator'&&row.facts_provenance===JSON.stringify({method:'human_official_article_confirmation',permissionRef:ASSISTED_PERMISSION,confirmationId:a.request_id,verifiedAt:a.verified_at,actor:a.actor_id,publisherHttpRequests:0});}
