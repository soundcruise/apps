import {legalGate} from './registry.js';
import {factualLabel,allowedArticlePath,CATEGORIES,validLabel} from './metadata.js';
import {validatedFingerprint} from './fingerprint.js';
import {DAY,sourceUrl} from './policy.js';
import {saleEndsAt,saleAuthorized,isSaleRecord} from './sale.js';
import {eventEndsAt} from './event.js';
import {independentTopicUrls,labelInformationScore} from './label-quality.js';
export const DECISION_POLICY_VERSION='operator-publication-1';
export const REASONS=Object.freeze({approve:['useful_product','operator_review'],reject:['facts_identifier_missing','date_uncertain','category_uncertain','not_relevant','duplicate','policy_concern','minor_update','operator_review']});
export const CHECKS=Object.freeze(['factsChecked','relevanceChecked','duplicateChecked','independentLabelChecked']);
export const parseFacts=row=>{try{return JSON.parse(row.product_facts);}catch{return null;}};
// Same publication identities as AUTO: topic, immutable independent article, product + version + launch family.
// Artist/event identities additionally retain performer, venue and actual event date, never just a scalar label.
export function duplicatePredicate(row,facts,alias='d'){
 const paths=independentTopicUrls(row),j=key=>`json_extract(CASE WHEN json_valid(${alias}.product_facts) THEN ${alias}.product_facts ELSE '{}' END,'$.${key}')`;
 const clauses=[`${alias}.topic_key=?`,`${alias}.normalized_url=?`,`${alias}.source_url=?`],args=[row.topic_key,row.normalized_url,row.source_url];
 if(paths.length){clauses.push(`${alias}.source_url IN (${paths.map(()=>'?').join(',')})`);args.push(...paths);}
 if(facts?.product){clauses.push(`((? IS NULL OR ${j('brand')}=? OR (?='official_manufacturer_model' AND ${j('brand')} IS NULL AND ${j('identifierBasis')}='distinctive_software_model')) AND ${alias}.category=? AND ${j('product')}=? AND COALESCE(${j('version')},'')=? AND (${alias}.event_type=? OR ${alias}.event_type IN ('other','new_product','release') AND ? IN ('other','new_product','release')))`);args.push(facts.brand||null,facts.brand||null,facts.identifierBasis||'',row.category,facts.product,facts.version||'',row.event_type,row.event_type);}
 // Multi-model primary evidence must not evade the existing product duplicate boundary.
 if(['explicit_article_product_fields','explicit_shimamura_product_fields'].includes(facts?.identifierBasis)&&Array.isArray(facts.models)&&facts.models.length>0&&facts.models.length<=4&&facts.models.every(m=>typeof m==='string')){
  clauses.push(`(${j('brand')}=? AND ${alias}.category=? AND COALESCE(${j('version')},'')=? AND ${alias}.event_type IN ('other','new_product','release') AND (${j('product')} IN (${facts.models.map(()=>'?').join(',')}) OR EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(${alias}.product_facts) THEN ${alias}.product_facts ELSE '{}' END,'$.models') member WHERE member.value IN (${facts.models.map(()=>'?').join(',')}))))`);
  args.push(facts.brand,row.category,facts.version||'',...facts.models,...facts.models);
 }
 if(facts?.kind&&['guitar_artist','guitar_event','artist_live','sale'].includes(facts.kind)){
  const keys=facts.kind==='sale'?['seller','event','endDate']:['kind','artist','performer','event','venue','eventDate','endDate','eventType','action','topic'];
  clauses.push(`(${alias}.category=? AND ${alias}.event_type=? AND ${keys.map(k=>`COALESCE(${j(k)},'')=?`).join(' AND ')})`);args.push(row.category,row.event_type,...keys.map(k=>facts[k]||''));
 }
 return {sql:`${alias}.review_status='approved' AND ${alias}.id<>? AND (${clauses.join(' OR ')})`,args:[row.id,...args]};
}
export async function publicationValidation(store,row,now,registry,pepper){
 const errors=[],source=registry.find(s=>s.id===row.source_id),facts=parseFacts(row),label=factualLabel(facts,row.event_type),controls=await store.controls(),state=await store.state(row.source_id),health=(await store.sourceHealth()).find(h=>h.source_id===row.source_id);
 if(row.publication_decision==='REJECT')errors.push('publication_policy_rejected');
 const sourceGate=legalGate(source,{...state,nextAt:0,lastPublisherRequestAt:0},now,'production',registry);
 if(sourceGate||!source?.discoveryValid||health?.status!=='healthy'||!Number.isSafeInteger(health?.last_successful_run_at)||health.last_successful_run_at>now||!controls.publication_enabled)errors.push('operator_source_gate');
 if(!source||!sourceUrl(row.source_url,source)||!allowedArticlePath(row.source_url,source))errors.push('source_url_invalid');
 if(!facts||!label||facts.scopeUncertain||row.event_type==='other'||!validLabel(label)||facts.category!==row.category||!CATEGORIES.includes(row.category))errors.push('facts_incomplete');
 if(facts?.evidence==='assessed_domestic_acoustic_interview'&&source?.id!=='agm'||facts?.evidence==='assessed_named_guitar_event'&&source?.id!=='ikebe-event'||facts?.identifierBasis==='assessed_recording_listing'&&source?.id!=='at-distribution'||facts?.manufacturerSource&&facts.manufacturerSource!==row.source_id||facts?.listingSource&&facts.listingSource!==row.source_id)errors.push('facts_provenance_invalid');
 if(facts?.evidence==='guitar_exhibition_article_v1'&&(row.source_id!=='kikutani'||facts.articleUrl!==row.source_url||facts.listingSource!==row.source_id))errors.push('facts_provenance_invalid');
 if(facts?.kind==='agm_editorial'&&(row.source_id!=='agm'||facts.articleUrl!==row.source_url))errors.push('facts_provenance_invalid');
 if(facts?.identifierBasis==='explicit_article_product_fields'&&(row.source_id!=='ikebe'||facts.articleUrl!==row.source_url))errors.push('facts_provenance_invalid');
 if(facts?.identifierBasis==='explicit_shimamura_product_fields'&&(row.source_id!=='shimamura'||facts.articleUrl!==row.source_url)||facts?.evidence==='explicit_named_workshop_v1'&&(row.source_id!=='ikebe-event'||facts.articleUrl!==row.source_url))errors.push('facts_provenance_invalid');
 if(!await validatedFingerprint(row.title_fingerprint,pepper))errors.push('label_provenance_invalid');
 const stamp=Date.parse(row.published_at);
 if(!Number.isFinite(stamp)||stamp>now||now-stamp>=90*DAY||!Number.isSafeInteger(row.expires_at)||row.expires_at<=now)errors.push('expired_candidate');
 const sale=isSaleRecord(row,facts),saleDeadline=saleEndsAt(facts?.endDate,facts?.endTime),eventDeadline=eventEndsAt(facts);
 if(sale&&(!saleAuthorized(source)||row.category!=='sale'||row.event_type!=='sale'||facts?.kind!=='sale'||facts.seller!==source?.name||facts.scope!=='broad'||facts.nature!=='sale'||!facts.equipment?.length||!Number.isFinite(saleDeadline)||saleDeadline<now||row.sale_ends_at!==saleDeadline))errors.push('sale_validation_failed');
 if((row.event_ends_at!=null&&row.event_ends_at<now)||(eventDeadline!==null&&(!Number.isSafeInteger(eventDeadline)||eventDeadline<now||eventDeadline!==row.event_ends_at)))errors.push('event_validation_failed');
 if(facts?.kind==='guitar_event'&&eventDeadline===null)errors.push('event_date_missing');
 const predicate=duplicatePredicate(row,facts);
 const duplicates=(await store.db.prepare(`SELECT d.id,d.label,d.source_name,d.source_url,d.topic_key FROM candidate_items d WHERE ${predicate.sql} ORDER BY d.id LIMIT 20`).bind(...predicate.args).all()).results;
 if(duplicates.length)errors.push('duplicate');
 if(await store.db.prepare('SELECT item_id FROM news_takedowns WHERE item_id=?').bind(row.id).first())errors.push('candidate_takedown');
 return {valid:!errors.length,errors:[...new Set(errors)],publishableLabel:label||null,facts,duplicates,quality:{labelInformationScore:labelInformationScore(label||row.label)},policyVersion:DECISION_POLICY_VERSION,healthSuccessfulAt:health?.last_successful_run_at??null};
}
