import {ASSISTED_ORIGIN,assistedProof,assistedLabel} from './assisted-facts.js';
import {validPrimaryAnnouncement,PRIMARY_ANNOUNCEMENT_PARSER,PRIMARY_ANNOUNCEMENT_PARSERS} from './primary-announcement.js';
import {productBrandVariants} from './product-brand-identity.js';
import {validKikutaniListingFacts,KIKUTANI_LISTING_PARSER,KIKUTANI_LISTING_PARSERS} from './kikutani-listing-evidence.js';
import {PRODUCT_FAMILY_PARSER,validProductFamily} from './product-family-evidence.js';
import {AGM_ARTICLE_PARSER} from './agm-article-evidence.js';
import {validAgmPerformance} from './agm-performance-evidence.js';
import {morrisProofValid} from './morris-collector.js';
import {IKEBE_PRODUCT_PARSER} from './ikebe-product-evidence.js';
import {validOfficialIdentity} from './official-identity.js';
import {SHIMAMURA_PRODUCT_PARSERS} from './shimamura-product-evidence.js';
import {SHIMAMURA_REVIEW_PARSERS,validatedShimamuraReview} from './shimamura-review-evidence.js';
import {PRODUCT_ARTICLE_PARSER} from './product-article-evidence.js';
import {legalGate} from './registry.js';
import {factualLabel,allowedArticlePath,CATEGORIES,validLabel} from './metadata.js';
import {validatedFingerprint} from './fingerprint.js';
import {DAY,sourceUrl,hash} from './policy.js';
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
 const brands=productBrandVariants(facts?.brand),brandValues=brands.length?brands:['__no_verified_brand__'],brandMatch=`${j('brand')} IN (${brandValues.map(()=>'?').join(',')})`;
 const clauses=[`${alias}.topic_key=?`,`${alias}.normalized_url=?`,`${alias}.source_url=?`],args=[row.topic_key,row.normalized_url,row.source_url];
 if(facts?.kind==='assisted_notice'&&!['event','interview'].includes(facts.productType)&&['release','announcement'].includes(facts.action)){clauses.push(`(${brandMatch} AND ${j('product')}=? AND ${alias}.event_type IN ('new_product','release') AND ${j('productEvent')} IS NULL)`);args.push(...brandValues,facts.product);}
 if(facts?.kind==='assisted_notice'&&facts.productType==='event'){clauses.push(`(${j('kind')}='guitar_event' AND COALESCE(${j('eventName')},${j('event')})=? AND ${j('eventDate')}=? AND ${j('venue')}=?)`);args.push(facts.product,facts.eventDate,facts.venue);}
 if(facts?.kind==='product_family'){
  const familyClauses=[`${alias}.normalized_url=?`,`${alias}.source_url=?`];
  const familyArgs=[row.normalized_url,row.source_url];
  if(validProductFamily(facts)){
   familyClauses.push(`(${j('brand')}=? AND ${alias}.category=? AND COALESCE(${j('version')},'')='' AND ${j('productEvent')} IS NULL AND ${alias}.event_type IN ('new_product','release') AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(${alias}.product_facts) THEN ${alias}.product_facts ELSE '{}' END,'$.models') member WHERE member.value IN (${facts.models.map(()=>'?').join(',')})))`);
   familyArgs.push(facts.brand,row.category,...facts.models);
  }
  return {sql:`${alias}.review_status='approved' AND ${alias}.id<>? AND (${familyClauses.join(' OR ')})`,args:[row.id,...familyArgs]};
 }
 if(validAgmPerformance(facts)){
  clauses.push(`(${j('kind')}='agm_editorial' AND ${j('articleType')}='performance_event' AND ${j('eventName')}=? AND ${j('eventDate')}=? AND ${j('performer')}=? AND ${j('venues')}=?)`);
  args.push(facts.eventName,facts.eventDate,facts.performer,JSON.stringify(facts.venues));
 }
 if(paths.length){clauses.push(`${alias}.source_url IN (${paths.map(()=>'?').join(',')})`);args.push(...paths);}
 if(facts?.product&&!['product_article','assisted_notice'].includes(facts.kind)&&facts.evidence!=='morris_explicit_article_v1'){clauses.push(`((? IS NULL OR ${brandMatch} OR (?='official_manufacturer_model' AND ${j('brand')} IS NULL AND ${j('identifierBasis')}='distinctive_software_model')) AND ${alias}.category=? AND ${j('product')}=? AND COALESCE(${j('version')},'')=? AND (${alias}.event_type=? OR ${alias}.event_type IN ('other','new_product','release') AND ? IN ('other','new_product','release')))`);args.push(facts.brand||null,...brandValues,facts.identifierBasis||'',row.category,facts.product,facts.version||'',row.event_type,row.event_type);}
 if(facts?.articleIdentity?.basis==='explicit_primary_definition'&&facts.identifierBasis==='explicit_article_product_fields'){clauses.push(`(${j('brand')}=? AND ${j('product')} IN (${facts.articleIdentity.models.map(()=>'?').join(',')}) AND ${alias}.category=? AND COALESCE(${j('version')},'')=? AND ${alias}.event_type IN ('new_product','release') AND ? IN ('new_product','release') AND COALESCE(${j('productEvent.action')},'')=?)`);args.push(facts.articleIdentity.brand,...facts.articleIdentity.models,row.category,facts.version||'',row.event_type,facts.productEvent?.action||'');}
 if(facts?.evidence==='morris_explicit_article_v1'&&facts.kind==='product'){
  clauses.push(`(${j('brand')} IN ('Morris','MORRIS','Morris Guitars','モーリス') AND ${alias}.category=? AND ${j('product')}=? AND COALESCE(CASE WHEN json_type(CASE WHEN json_valid(${alias}.product_facts) THEN ${alias}.product_facts ELSE '{}' END,'$.productEvent')='object' THEN ${j('productEvent.action')} ELSE ${j('productEvent')} END,'')=? AND ${alias}.event_type IN ('new_product','release') AND ? IN ('new_product','release'))`);args.push(row.category,facts.product,facts.productEvent?.action||'',row.event_type);
 }
 // Informational articles duplicate the same verified subject, article type and theme,
 // never an accessory overlap or an independent launch event about that equipment.
 if(facts?.kind==='product_article'){
  const keys=['kind','brand','product','articleType','theme','models'];
  clauses.push(`(${alias}.category=? AND ${alias}.event_type='product_article' AND ${keys.map(k=>`COALESCE(${j(k)},'')=?`).join(' AND ')})`);
  args.push(row.category,...keys.map(k=>k==='models'?JSON.stringify(facts.models):facts[k]||''));
 }
 // A shared broad theme is not a duplicate identity for two independent essays.
 if(facts?.kind==='morris_notice'&&facts.subject){
  if(['new_product','product_release','signature_model','limited_model'].includes(facts.articleType)){
   clauses.push(`(${j('brand')} IN ('Morris','MORRIS','Morris Guitars','モーリス') AND ${j('product')}=? AND ${alias}.event_type IN ('new_product','release') AND COALESCE(${j('productEvent.action')},'')=?)`);args.push(facts.subject,{signature_model:'signature',limited_model:'limited_edition'}[facts.articleType]||'');
  }
  if(['event_announcement','exhibition'].includes(facts.articleType)){
   clauses.push(`(${j('kind')}='guitar_event' AND COALESCE(${j('eventName')},${j('event')})=? AND (?='' OR ${j('eventDate')}=?) AND (?='' OR ${j('venue')}=?) AND (?<>'exhibition' OR ${j('exhibitor')}='Morris Guitars'))`);args.push(facts.subject,facts.eventDate||'',facts.eventDate||'',facts.venue||'',facts.venue||'',facts.articleType);
  }
  if(['report','catalog'].includes(facts.articleType)){clauses.push(`(${j('kind')}='morris_editorial' AND ${j('articleType')}=? AND ${j('subject')}=?)`);args.push(facts.articleType==='report'?'event_report':'catalog',facts.subject);}
  if(facts.articleType==='recruitment'){clauses.push(`(${j('kind')}='guitar_event' AND ${j('eventType')}='competition' AND ${j('action')}='entry_open' AND COALESCE(${j('eventName')},${j('event')})=?)`);args.push(facts.subject);}
  const keys=['kind','articleType','subject','eventDate','endDate','serviceAction'];clauses.push(`(${keys.map(k=>`COALESCE(${j(k)},'')=?`).join(' AND ')})`);args.push(...keys.map(k=>facts[k]||''));
 }
 if(facts?.kind==='morris_editorial'&&facts.subject&&['event_report','catalog'].includes(facts.articleType)){
  const keys=['kind','articleType','subject','topic'];
  clauses.push(`(${alias}.category=? AND ${alias}.event_type='morris_editorial' AND ${keys.map(k=>`COALESCE(${j(k)},'')=?`).join(' AND ')})`);
  args.push(row.category,...keys.map(k=>facts[k]||''));
 }
 // Multi-model primary evidence must not evade the existing product duplicate boundary.
 if(['explicit_article_product_fields','explicit_shimamura_product_fields','verified_primary_announcement'].includes(facts?.identifierBasis)&&Array.isArray(facts.models)&&facts.models.length>0&&facts.models.length<=4&&facts.models.every(m=>typeof m==='string')){
  clauses.push(`(${brandMatch} AND ${alias}.category=? AND COALESCE(${j('version')},'')=? AND ${alias}.event_type IN ('other','new_product','release') AND (${j('product')} IN (${facts.models.map(()=>'?').join(',')}) OR EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(${alias}.product_facts) THEN ${alias}.product_facts ELSE '{}' END,'$.models') member WHERE member.value IN (${facts.models.map(()=>'?').join(',')}))))`);
  args.push(...brandValues,row.category,facts.version||'',...facts.models,...facts.models);
 }
 // Exact multi-model signature launch identity, allowing only explicit color suffixes.
 // A series qualifier is not a different manufacturer; new color/edition events stay separate.
 if(['explicit_article_product_fields','explicit_shimamura_product_fields','verified_primary_announcement'].includes(facts?.identifierBasis)&&facts.signatureModel===true&&!facts.productEvent&&typeof facts.brand==='string'&&Array.isArray(facts.models)&&facts.models.length>=2&&facts.models.length<=4&&new Set(facts.models).size===facts.models.length&&facts.models.every(m=>typeof m==='string'&&/^[A-Za-z0-9][A-Za-z0-9 .&'/-]{1,99}$/.test(m))){
  const colors=['Black','White','Arctic White','Red','Blue','Natural','Sunburst'],modelArgs=[];
  const comparisons=facts.models.map(m=>{const variants=[m,...colors.map(c=>`${m} (${c})`)];modelArgs.push(...variants);return `EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(${alias}.product_facts) THEN ${alias}.product_facts ELSE '{}' END,'$.models') signature_model WHERE signature_model.value IN (${variants.map(()=>'?').join(',')}))`;});
  clauses.push(`(${j('identifierBasis')} IN ('explicit_article_product_fields','explicit_shimamura_product_fields') AND ${j('signatureModel')}=1 AND ${j('productEvent')} IS NULL AND ${j('brand')} IN (?,?) AND ${alias}.category=? AND COALESCE(${j('version')},'')=? AND ${alias}.event_type IN ('new_product','release') AND ? IN ('new_product','release') AND json_array_length(${j('models')})=? AND ${comparisons.join(' AND ')})`);
  args.push(facts.brand,facts.brand+' Standard Series',row.category,facts.version||'',row.event_type,facts.models.length,...modelArgs);
 }
 if(facts?.kind&&['guitar_artist','guitar_event','artist_live','sale'].includes(facts.kind)){
  const keys=facts.kind==='sale'?['seller','event','endDate']:['kind','artist','performer','event','venue','eventDate','endDate','eventType','action','topic',...(facts.evidence==='morris_explicit_article_v1'&&facts.exhibitor?['exhibitor']:[])];
  clauses.push(`(${alias}.category=? AND ${alias}.event_type=? AND ${keys.map(k=>`COALESCE(${j(k)},'')=?`).join(' AND ')})`);args.push(row.category,row.event_type,...keys.map(k=>facts[k]||''));
 }
 return {sql:`${alias}.review_status='approved' AND ${alias}.id<>? AND (${clauses.join(' OR ')})`,args:[row.id,...args]};
}
export async function publicationValidation(store,row,now,registry,pepper){
 const assisted=row.origin===ASSISTED_ORIGIN,verifiedAssisted=assisted&&await assistedProof(store,row,now);
 const errors=[],source=registry.find(s=>s.id===row.source_id),facts=parseFacts(row),label=verifiedAssisted?row.label:factualLabel(facts,row.event_type),controls=await store.controls(),state=await store.state(row.source_id),health=(await store.sourceHealth()).find(h=>h.source_id===row.source_id);
 if(row.publication_decision==='REJECT')errors.push('publication_policy_rejected');
 const sourceGate=legalGate(source,{...state,nextAt:0,lastPublisherRequestAt:0},now,'production',registry);
 if(!controls.publication_enabled||state.publicationBlocked||(assisted?!verifiedAssisted:sourceGate||!source?.discoveryValid||health?.status!=='healthy'||!Number.isSafeInteger(health?.last_successful_run_at)||health.last_successful_run_at>now))errors.push('operator_source_gate');
 if(!source||!sourceUrl(row.source_url,source)||(!assisted&&!allowedArticlePath(row.source_url,source)))errors.push('source_url_invalid');
 if(facts?.kind==='assisted_notice'&&(!verifiedAssisted||!assistedLabel(facts)))errors.push('facts_provenance_invalid');
 if(!facts||!label||facts.scopeUncertain||row.event_type==='other'||!validLabel(label)||facts.category!==row.category||!CATEGORIES.includes(row.category))errors.push('facts_incomplete');
 if(facts?.evidence==='assessed_domestic_acoustic_interview'&&source?.id!=='agm'||facts?.evidence==='assessed_named_guitar_event'&&source?.id!=='ikebe-event'||facts?.identifierBasis==='assessed_recording_listing'&&source?.id!=='at-distribution'||facts?.manufacturerSource&&facts.manufacturerSource!==row.source_id||facts?.listingSource&&facts.listingSource!==row.source_id)errors.push('facts_provenance_invalid');
 if(facts?.evidence==='guitar_exhibition_article_v1'&&(row.source_id!=='kikutani'||facts.articleUrl!==row.source_url||facts.listingSource!==row.source_id))errors.push('facts_provenance_invalid');
 if(facts?.kind==='agm_editorial'&&(row.source_id!=='agm'||facts.articleUrl!==row.source_url))errors.push('facts_provenance_invalid');
 if(facts?.kind==='agm_editorial'&&(facts.author||facts.focus)){let proof=[];try{proof=JSON.parse(row.facts_provenance);}catch{}if(!Array.isArray(proof)||['author','focus'].filter(k=>facts[k]).some(field=>!proof.some(p=>p.factField===field&&p.sourceId==='agm'&&p.sourceUrl===row.source_url&&[AGM_ARTICLE_PARSER,'agm-article-5'].includes(p.parserVersion)&&p.extractionMethod==='explicit_agm_article_fields'&&p.verifiedAt<=now&&Number.isSafeInteger(p.verifiedAt)&&/^[a-f0-9]{64}$/.test(p.responseHash||''))))errors.push('facts_provenance_invalid');}
 if(facts?.kind==='agm_editorial'&&(facts.releaseDate||facts.performanceScope)){let proof=[];try{proof=JSON.parse(row.facts_provenance);}catch{}if(!Array.isArray(proof)||!['person','works','releaseType',...(facts.releaseDate?['releaseDate','releaseEvidence']:[]),...(facts.performanceScope?['performanceScope']:[]),'event_type'].every(field=>proof.some(p=>p.factField===field&&p.sourceId==='agm'&&p.sourceUrl===row.source_url&&p.parserVersion===AGM_ARTICLE_PARSER&&p.extractionMethod==='explicit_agm_article_fields'&&Number.isSafeInteger(p.verifiedAt)&&p.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(p.responseHash||''))))errors.push('facts_provenance_invalid');}
 if(facts?.articleType==='performance_event'){
  let proof=[];try{proof=JSON.parse(row.facts_provenance);}catch{}
  if(!validAgmPerformance(facts)||!Array.isArray(proof)||!['eventName','eventDate','performer','venues','performanceEvidence'].every(field=>proof.some(p=>p.factField===field&&p.sourceId===row.source_id&&p.sourceUrl===row.source_url&&[AGM_ARTICLE_PARSER,'agm-article-5','agm-article-4'].includes(p.parserVersion)&&p.extractionMethod==='explicit_agm_article_fields'&&Number.isSafeInteger(p.verifiedAt)&&p.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(p.responseHash||''))))errors.push('facts_provenance_invalid');
 }
 if(facts?.kind==='primary_product_notice'){
  const evidenceKey=await hash(row.title_fingerprint||'');let proof=[];try{proof=JSON.parse(row.facts_provenance);}catch{}
  if(!validPrimaryAnnouncement(facts)||row.event_type!==(['release','scheduled_release','release_notice'].includes(facts.announcement?.action)?'release':'new_product')||facts.listingSource!==row.source_id||facts.articleUrl!==row.source_url||!Array.isArray(proof)||![...Object.keys(facts),'event_type'].every(field=>proof.some(p=>p.factField===field&&p.sourceId===row.source_id&&p.sourceUrl===row.source_url&&p.evidenceKey===evidenceKey&&p.publishedAt===row.published_at&&(facts.announcement.action==='release_notice'?['primary-announcement-2',PRIMARY_ANNOUNCEMENT_PARSER]:PRIMARY_ANNOUNCEMENT_PARSERS).includes(p.parserVersion)&&p.extractionMethod==='explicit_primary_announcement_fields'&&Number.isSafeInteger(p.verifiedAt)&&p.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(p.responseHash||''))))errors.push('facts_provenance_invalid');
 }
 if(facts?.kind==='product_family'){
  let proof=[];try{proof=JSON.parse(row.facts_provenance);}catch{}
  if(!validProductFamily(facts)||facts.listingSource!==row.source_id||facts.articleUrl!==row.source_url||row.event_type!=='new_product'||!Array.isArray(proof)||!['brand','family','models','familyEvidence','event_type'].every(field=>proof.some(p=>p.factField===field&&p.sourceId===row.source_id&&p.sourceUrl===row.source_url&&p.parserVersion===PRODUCT_FAMILY_PARSER&&p.extractionMethod==='explicit_product_family_fields'&&Number.isSafeInteger(p.verifiedAt)&&p.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(p.responseHash||''))))errors.push('facts_provenance_invalid');
 }
 if(row.source_id==='morris'&&!await morrisProofValid(store,row,now)||facts?.evidence==='morris_explicit_article_v1'&&row.source_id!=='morris')errors.push('facts_provenance_invalid');
 if(facts?.kind==='morris_notice'&&(row.source_id!=='morris'||row.event_type!=='morris_notice'))errors.push('facts_provenance_invalid');
 if(facts?.kind==='morris_editorial'&&(row.source_id!=='morris'||row.event_type!=='morris_editorial'))errors.push('facts_provenance_invalid');
 if(facts?.kind==='product_article'){
  let proof=[];try{proof=JSON.parse(row.facts_provenance);}catch{}
  if(!Array.isArray(proof)||!['kind','articleType','models','theme','relevance','event_type'].every(field=>proof.some(p=>p.factField===field&&p.sourceId===row.source_id&&p.sourceUrl===row.source_url&&(validatedShimamuraReview(facts)?SHIMAMURA_REVIEW_PARSERS:[PRODUCT_ARTICLE_PARSER]).includes(p.parserVersion)&&p.extractionMethod==='explicit_product_article_fields'&&Number.isSafeInteger(p.verifiedAt)&&p.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(p.responseHash||''))))errors.push('facts_provenance_invalid');
 }
 if(facts?.kind==='product_article'&&(row.event_type!=='product_article'||!['ikebe','shimamura'].includes(row.source_id)||facts.listingSource!==row.source_id||facts.articleUrl!==row.source_url))errors.push('facts_provenance_invalid');
 if(facts?.identifierBasis==='explicit_kikutani_listing_product'){
  let proof=[];try{proof=JSON.parse(row.facts_provenance);}catch{}
  if(row.source_id!=='kikutani'||facts.articleUrl!==row.source_url||row.event_type!=='new_product'||!validKikutaniListingFacts(facts)||!Array.isArray(proof)||![...Object.keys(facts).filter(k=>k!=='headlineQuality'),'event_type'].every(field=>proof.some(p=>p.factField===field&&p.sourceId==='kikutani'&&p.sourceUrl==='https://www.kikutani.co.jp/news/'&&p.articleUrl===row.source_url&&(field==='guitarConstruction'?p.parserVersion===KIKUTANI_LISTING_PARSER:field==='listingNotice'?['kikutani-listing-product-2',KIKUTANI_LISTING_PARSER].includes(p.parserVersion):KIKUTANI_LISTING_PARSERS.includes(p.parserVersion))&&p.extractionMethod==='explicit_kikutani_listing_card'&&Number.isSafeInteger(p.verifiedAt)&&p.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(p.responseHash||''))))errors.push('facts_provenance_invalid');
 }
 if(facts?.identifierBasis==='explicit_article_product_fields'&&(row.source_id!=='ikebe'||facts.articleUrl!==row.source_url))errors.push('facts_provenance_invalid');
 if(facts?.kind!=='primary_product_notice'&&(facts?.editionEvidence||facts?.subjectEvidence||facts?.productType==='contact_cleaner')){let proof=[];try{proof=JSON.parse(row.facts_provenance);}catch{}
  if(!Array.isArray(proof)||!['brand','models','productType','event_type',...(facts.editionEvidence?['editionEvidence','productEvent']:[]),...(facts.articleIdentity?['articleIdentity']:[]),...(facts.subjectEvidence?['subjectEvidence']:[]),...(facts.referencedModels?['referencedModels']:[])].every(field=>proof.some(p=>p.factField===field&&p.sourceId===row.source_id&&p.sourceUrl===row.source_url&&(facts.subjectEvidence?[IKEBE_PRODUCT_PARSER,'ikebe-product-fields-11',...(['synthesizer','room_correction'].includes(facts.productType)?['ikebe-product-fields-10']:[])]:[IKEBE_PRODUCT_PARSER,'ikebe-product-fields-11','ikebe-product-fields-10','ikebe-product-fields-9','ikebe-product-fields-8','ikebe-product-fields-7']).includes(p.parserVersion)&&p.extractionMethod==='explicit_ikebe_product_fields'&&Number.isSafeInteger(p.verifiedAt)&&p.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(p.responseHash||''))))errors.push('facts_provenance_invalid');
 }
 if(facts?.productType==='software_instrument'&&facts.identifierBasis==='explicit_shimamura_product_fields'){let proof=[];try{proof=JSON.parse(row.facts_provenance);}catch{}
  if(!Array.isArray(proof)||!['brand','models','productType','event_type'].every(field=>proof.some(p=>p.factField===field&&p.sourceId==='shimamura'&&p.sourceUrl===row.source_url&&['shimamura-product-fields-7','shimamura-product-fields-8'].includes(p.parserVersion)&&p.extractionMethod==='explicit_shimamura_product_fields'&&Number.isSafeInteger(p.verifiedAt)&&p.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(p.responseHash||''))))errors.push('facts_provenance_invalid');
 }
 if(facts?.identifierBasis==='explicit_shimamura_product_fields'&&(row.source_id!=='shimamura'||facts.articleUrl!==row.source_url)||facts?.evidence==='explicit_named_workshop_v1'&&(row.source_id!=='ikebe-event'||facts.articleUrl!==row.source_url))errors.push('facts_provenance_invalid');
 if(facts?.officialIdentity){
  let proof=[];try{proof=JSON.parse(row.facts_provenance);}catch{}
  if(!validOfficialIdentity(facts.officialIdentity,row.source_url,facts.brand,facts.product)||facts.officialIdentity.verifiedAt>now||!Array.isArray(proof)||!proof.some(p=>p.factField==='officialIdentity'&&p.sourceId===row.source_id&&p.sourceUrl===row.source_url&&SHIMAMURA_PRODUCT_PARSERS.includes(p.parserVersion)&&p.extractionMethod==='explicit_shimamura_product_fields'&&p.verifiedAt>=facts.officialIdentity.verifiedAt&&p.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(p.responseHash||'')))errors.push('facts_provenance_invalid');
 }
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
