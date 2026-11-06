import {DAY,hash,sourceUrl} from './policy.js';
import {PRIMARY_ANNOUNCEMENT_PARSERS} from './primary-announcement.js';
import {SHIMAMURA_PRODUCT_PARSERS} from './shimamura-product-evidence.js';
import {IKEBE_PRODUCT_PARSER} from './ikebe-product-evidence.js';
// Human-primary evidence is separate from automatic parser proof. No HTML,
// publisher prose, URL substitution or canonical target fetch is needed here.
export const CANONICAL_TYPES=Object.freeze({instrument_cable:['楽器用シールドケーブル','electric_guitar_bass'],acoustic_guitar:['アコースティックギター','acoustic_guitar'],electro_acoustic:['エレアコ','acoustic_guitar'],guitar_amp:['ギターアンプ','amps_effects'],effect:['エフェクター','amps_effects'],strings:['ギター用弦','electric_guitar_bass'],guitar_case:['ギター用ケース','electric_guitar_bass']});
export const CANONICAL_ACTIONS=Object.freeze({introduction:'を紹介',announcement:'を発表',release:'を発売'});
export const CANONICAL_CHECKS=Object.freeze(['officialArticleChecked','canonicalTargetNotFound','sameArticleChecked','productFactsChecked','sourceConditionsChecked','noOriginalTextCopied']);
const safeName=s=>typeof s==='string'&&s===s.trim()&&s.length>=2&&s.length<=100&&!/[<>\x00-\x1f]|https?:\/\//.test(s);
const cleanUrl=raw=>{try{const u=new URL(raw);return raw.length<=512&&u.href===raw&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash?u:null;}catch{return null;}};
export function canonicalArticleIdentity(source,url){
 const u=cleanUrl(url);let origin;try{origin=new URL(source.baseUrl).origin;}catch{return null;}if(!u||u.origin!==origin||sourceUrl(url,source)!==url)return null;
 const match=source.id==='shimamura'?/^\/update\/(guitar-bass|amp-effector|dtm-recording)\/20\d{2}\/(?:0[1-9]|1[0-2])\/([1-9]\d*)\/$/.exec(u.pathname):source.id==='ikebe'?/^\/(new_product)\/([1-9]\d*)\/?$/.exec(u.pathname):null;
 return match?source.id+':'+match[1]+':'+match[2]:null;
}
export function canonicalMismatchAllowed(source,adoptedUrl,originalCanonical){
 if(!source)return false;
 const identity=canonicalArticleIdentity(source,adoptedUrl);
 return !!identity&&adoptedUrl!==originalCanonical&&identity===canonicalArticleIdentity(source,originalCanonical);
}
export function canonicalHumanFacts(input,row){
 if(!input||Object.keys(input).some(k=>!['brand','product','productType','action'].includes(k))||!safeName(input.brand)||!safeName(input.product)||!Object.hasOwn(CANONICAL_TYPES,input.productType||'')||!Object.hasOwn(CANONICAL_ACTIONS,input.action||''))return null;
 return {kind:'human_product_notice',evidence:'canonical_human_primary_v1',identifierBasis:'human_primary_article_confirmation',listingSource:row.source_id,articleUrl:row.source_url,brand:input.brand,product:input.product,models:[input.product],version:null,productType:input.productType,category:CANONICAL_TYPES[input.productType][1],action:input.action};
}
export function validCanonicalFacts(f){
 if(!f)return false;const expected=canonicalHumanFacts({brand:f.brand,product:f.product,productType:f.productType,action:f.action},{source_id:f.listingSource,source_url:f.articleUrl});
 return !!expected&&Object.keys(f).length===Object.keys(expected).length&&Object.keys(expected).every(k=>JSON.stringify(f[k])===JSON.stringify(expected[k]));
}
export const canonicalEvent=f=>f.action==='release'?'release':'new_product';
export function canonicalHumanLabel(f,event){return validCanonicalFacts(f)&&event===canonicalEvent(f)?`${f.brand}、${CANONICAL_TYPES[f.productType][0]}「${f.product}」${CANONICAL_ACTIONS[f.action]}`:null;}
export async function canonicalBaseEvidence(store,row,source,now){
 if(!source||!canonicalArticleIdentity(source,row.source_url))return null;
 const c=await store.db.prepare("SELECT * FROM news_facts_sources WHERE json_extract(CASE WHEN json_valid(proof_json) THEN proof_json ELSE '{}' END,'$.sourceUrl')=? ORDER BY checked_at DESC,source_id DESC LIMIT 1").bind(row.source_url).first();
 let p;try{p=JSON.parse(c?.proof_json);}catch{return null;}
 const parserOK=source.id==='shimamura'?p?.extractionMethod==='explicit_shimamura_product_fields'&&SHIMAMURA_PRODUCT_PARSERS.includes(p.parserVersion):source.id==='ikebe'&&p?.extractionMethod==='explicit_ikebe_product_fields'&&[IKEBE_PRODUCT_PARSER,'ikebe-product-fields-14','ikebe-product-fields-13'].includes(p.parserVersion);
 // This acquisition pipeline only constructs primary proof after an HTTP 200
 // HTML response, permitted robots, no opt-out and no redirected request.
 if(!c||typeof c.source_id!=='string'||!c.source_id.startsWith(source.id+':')||!parserOK||c.lease_until>now||!['facts_source_invalid','facts_parser_failure'].includes(c.outcome)||p.failureReason!==c.outcome||p.sourceId!==row.source_id||p.sourceUrl!==row.source_url||p.publishedAt!==row.published_at||p.evidenceKey!==await hash(row.title_fingerprint||'')||!PRIMARY_ANNOUNCEMENT_PARSERS.includes(p.pipelineVersion)||!Number.isSafeInteger(p.verifiedAt)||p.verifiedAt!==c.checked_at||p.verifiedAt>now||now-p.verifiedAt>7*DAY||!/^[a-f0-9]{64}$/.test(p.responseHash||''))return null;
 return {cache:c,proof:p};
}
export async function canonicalProofValid(store,row,now,source){
 let proof;try{proof=JSON.parse(row.facts_provenance);}catch{return false;}
 const p=Array.isArray(proof)&&proof.length===1?proof[0]:null;
 if(!p||p.method!=='human_canonical_confirmation_v1'||p.actorType!=='human_operator'||!/^access:[a-zA-Z0-9_-]{1,128}$/.test(p.actorId||'')||p.adoptedUrl!==row.source_url||p.sourceId!==row.source_id||p.publishedAt!==row.published_at||p.reason!=='same_article_stale_path'||p.targetObservation!=='not_found_page'||p.observationMethod!=='human_browser_confirmation'||!Number.isSafeInteger(p.confirmedAt)||p.confirmedAt>now||now-p.confirmedAt>=90*DAY||!p.checks||Object.keys(p.checks).length!==CANONICAL_CHECKS.length||CANONICAL_CHECKS.some(k=>p.checks[k]!==true))return false;
 if(!canonicalMismatchAllowed(source,row.source_url,p.originalCanonical))return false;
 const base=p.baseAcquisition;
 if(!/^[a-f0-9]{64}$/.test(p.confirmationHash||'')||!/^[-a-zA-Z0-9_]{16,100}$/.test(p.confirmationId||'')||!base||typeof base.key!=='string'||!base.key.startsWith(row.source_id+':')||base.httpStatus!==200||!Number.isSafeInteger(base.verifiedAt)||base.verifiedAt>p.confirmedAt||p.confirmedAt-base.verifiedAt>7*DAY||!/^[a-f0-9]{64}$/.test(base.responseHash||'')||!/^[a-f0-9]{64}$/.test(base.proofHash||''))return false;
 const saved=await store.db.prepare("SELECT * FROM news_facts_rechecks WHERE request_id=? AND candidate_id=? AND outcome='canonical_primary_facts_confirmed'").bind(p.confirmationId,row.id).first();
 let patch;try{patch=JSON.parse(saved?.patch_json);}catch{return false;}if(!patch||typeof patch!=='object'||Array.isArray(patch))return false;
 return !!saved&&saved.checked_at===p.confirmedAt&&saved.provenance_json===row.facts_provenance&&saved.request_payload_hash===p.confirmationHash&&patch.product_facts===row.product_facts&&patch.label===row.label&&patch.category===row.category&&patch.event_type===row.event_type&&patch.topic_key===row.topic_key;
}
// Called inside the final publication INSERT, in addition to the ordinary full
// row CAS, source, duplicate, takedown and policy checks. No additional authority.
export function canonicalReceiptFence(alias='c'){
 if(!/^[a-z]$/.test(alias))throw Error('sql_alias_invalid');
 const patch="CASE WHEN json_valid(cr.patch_json) THEN cr.patch_json ELSE '{}' END",proof=`CASE WHEN json_valid(${alias}.facts_provenance) THEN ${alias}.facts_provenance ELSE '[]' END`;
 return `EXISTS(SELECT 1 FROM news_facts_rechecks cr WHERE cr.candidate_id=${alias}.id AND cr.outcome='canonical_primary_facts_confirmed' AND cr.provenance_json IS ${alias}.facts_provenance AND cr.request_id=json_extract(${proof},'$[0].confirmationId') AND cr.request_payload_hash=json_extract(${proof},'$[0].confirmationHash') AND cr.checked_at=json_extract(${proof},'$[0].confirmedAt') AND json_extract(${patch},'$.product_facts') IS ${alias}.product_facts AND json_extract(${patch},'$.label') IS ${alias}.label AND json_extract(${patch},'$.category') IS ${alias}.category AND json_extract(${patch},'$.event_type') IS ${alias}.event_type AND json_extract(${patch},'$.topic_key') IS ${alias}.topic_key)`;
}
