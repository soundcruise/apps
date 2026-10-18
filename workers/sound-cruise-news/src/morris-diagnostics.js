// Counts, booleans and closed codes only. Never retain source text/attributes.
import {MORRIS_LISTING,MORRIS_PERMISSION} from './morris-policy.js';
export const MORRIS_DIAGNOSTICS_VERSION='morris-listing-diagnostics-1';
const tags=['p','div','span','li','dt','dd','blockquote','section','article','small','strong','em','other'];
export const MORRIS_DIAGNOSTIC_REASONS=Object.freeze(['NONE','NO_DESCRIPTION_ELEMENT','DESCRIPTION_SCOPE_AMBIGUOUS','DESCRIPTION_ELEMENTS_EMPTY','DESCRIPTION_OUTSIDE_SUPPORTED_SELECTOR','DESCRIPTION_OUTSIDE_SELECTED_WINDOW','DESCRIPTION_EXTRACTED_BUT_UNCLASSIFIED','IDENTITY_NOT_RECOVERED','ARTICLE_TYPE_NOT_RECOVERED','EVENT_FACTS_INSUFFICIENT','EXCLUDED_WORDING','LABEL_NOT_SUPPORTED','LABEL_EQUALS_ORIGINAL_HEADLINE','PROVENANCE_INVALID']);
const missingCodes=['model','typed_model_binding','manufacturer','article_type','event_name','event_date','venue','acoustic_context','event_action','performer'];
const branches=['notice','event','product','editorial_guard','event_report','craftsmanship','feature','support','catalog','artist_activity','support_notice','unclassified'];
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=128000;
export function morrisCardDiagnostics(structure,trace,recovered){
 const input=structure.extractedCharacterCount>0,model=trace.modelCandidate===true,event=trace.eventCandidate===true;
 const missing=[];
 if(model&&!trace.typedModelBinding)missing.push('typed_model_binding');
 if(model&&!trace.manufacturer)missing.push('manufacturer');
 if(event){for(const [key,code] of [['eventName','event_name'],['eventDate','event_date'],['venue','venue'],['eventContext','acoustic_context'],['eventAction','event_action']])if(trace[key]!==true)missing.push(code);if(trace.performerRequired&&!trace.performer)missing.push('performer');}
 if(!recovered.facts&&!trace.articleType)missing.push('article_type');
 if(recovered.facts)missing.length=0;
 let reason='NONE';
 if(!recovered.facts){
  if(!structure.descriptionCandidateCount&&!structure.supportedElementCount)reason=structure.scopeAmbiguous?'DESCRIPTION_SCOPE_AMBIGUOUS':'NO_DESCRIPTION_ELEMENT';
  else if(!input&&!structure.outsideSupportedCharacterCount&&!structure.outsideSelectedWindowCharacterCount)reason='DESCRIPTION_ELEMENTS_EMPTY';
  else if(!input&&structure.outsideSupportedCharacterCount>0)reason='DESCRIPTION_OUTSIDE_SUPPORTED_SELECTOR';
  else if(!input&&structure.outsideSelectedWindowCharacterCount>0)reason='DESCRIPTION_OUTSIDE_SELECTED_WINDOW';
  else if(trace.originalHeadlineCollision)reason='LABEL_EQUALS_ORIGINAL_HEADLINE';
  else if(trace.labelUnsupported)reason='LABEL_NOT_SUPPORTED';
  else if(trace.excludedWording)reason='EXCLUDED_WORDING';
  else if(event&&missing.some(x=>x.startsWith('event_')||x==='venue'||x==='acoustic_context'||x==='performer'))reason='EVENT_FACTS_INSUFFICIENT';
  else if(model&&(!trace.typedModelBinding||!trace.manufacturer))reason='IDENTITY_NOT_RECOVERED';
  else if(trace.typedModelBinding||trace.editorialGuardPassed)reason='ARTICLE_TYPE_NOT_RECOVERED';
  else reason='DESCRIPTION_EXTRACTED_BUT_UNCLASSIFIED';
 }
 const supporting=[];if(!recovered.facts&&input&&reason!=='DESCRIPTION_EXTRACTED_BUT_UNCLASSIFIED')supporting.push('DESCRIPTION_EXTRACTED_BUT_UNCLASSIFIED');
 return {version:MORRIS_DIAGNOSTICS_VERSION,...structure,factsInputPresent:input,productIdentityCandidate:model,articleTypeCandidate:!!trace.articleType,eventCandidate:event,
  relevantSignal:trace.relevance===true||model||event,excluded:trace.excludedWording===true,
  parserBranch:branches.includes(trace.branch)?trace.branch:'unclassified',articleType:recovered.facts?.articleType||(recovered.facts?.kind==='product'?'product_announcement':recovered.facts?.kind==='guitar_event'?'event_announcement':'unresolved'),
  primaryReason:reason,supportingReasons:supporting,missingFields:[...new Set(missing)]};
}
function valid(d){
 const numbers=['descriptionCandidateCount','supportedElementCount','selectedParagraphCount','fieldElementCount','extractedCharacterCount','outsideSupportedCharacterCount','outsideSelectedWindowCharacterCount'];
 const bools=['cardRecognized','articleLinkPresent','publishedDatePresent','headingPresent','scopeAmbiguous','factsInputPresent','productIdentityCandidate','articleTypeCandidate','eventCandidate','relevantSignal','excluded'];
 return d?.version===MORRIS_DIAGNOSTICS_VERSION&&numbers.every(k=>count(d[k]))&&bools.every(k=>typeof d[k]==='boolean')&&d.cardRecognized&&d.articleLinkPresent&&d.publishedDatePresent&&d.headingPresent&&['card','single_article_parent'].includes(d.descriptionScope)&&d.descriptionCandidateTypes&&Object.entries(d.descriptionCandidateTypes).every(([k,v])=>tags.includes(k)&&count(v))&&Object.values(d.descriptionCandidateTypes).reduce((a,b)=>a+b,0)===d.descriptionCandidateCount&&branches.includes(d.parserBranch)&&['product_announcement','event_announcement','event_report','craftsmanship','feature','support','catalog','artist_activity','support_notice','new_product','product_release','signature_model','limited_model','recruitment','competition','exhibition','artist','interview','maintenance','service','report','official_notice','unresolved'].includes(d.articleType)&&MORRIS_DIAGNOSTIC_REASONS.includes(d.primaryReason)&&Array.isArray(d.supportingReasons)&&d.supportingReasons.every(k=>MORRIS_DIAGNOSTIC_REASONS.includes(k))&&Array.isArray(d.missingFields)&&d.missingFields.every(k=>missingCodes.includes(k));
}
// Recompute a read-only diagnostic summary; never changes collection/publication health.
export function summarizeMorrisDiagnostics(entries,proof){
 if(!Array.isArray(entries)||entries.length>100)return {version:MORRIS_DIAGNOSTICS_VERSION,status:'provenance_invalid',reason:'PROVENANCE_INVALID'};
 const base={version:MORRIS_DIAGNOSTICS_VERSION,status:'not_instrumented',entryCount:entries.length};
 if(!entries.length||entries.every(e=>!e?.diagnostics))return base;
 if(!proof||!Number.isSafeInteger(proof.verifiedAt)||proof.sourceId!=='morris'||proof.sourceUrl!==MORRIS_LISTING||proof.permissionRef!==MORRIS_PERMISSION||! /^[a-f0-9]{64}$/.test(proof.responseHash||'')||!entries.every(e=>valid(e?.diagnostics)&&e.proof?.responseHash===proof.responseHash&&e.proof?.verifiedAt===proof.verifiedAt&&e.proof?.sourceId===proof.sourceId&&e.proof?.sourceUrl===proof.sourceUrl&&e.proof?.permissionRef===proof.permissionRef&&e.proof?.parserVersion===proof.parserVersion&&e.proof?.articleUrl===e.url&&e.proof?.publishedAt===e.publishedAt)||new Set(entries.map(e=>e.url)).size!==entries.length)return {...base,status:'provenance_invalid',reason:'PROVENANCE_INVALID'};
 const described=entries.filter(e=>e.diagnostics.extractedCharacterCount+e.diagnostics.outsideSupportedCharacterCount+e.diagnostics.outsideSelectedWindowCharacterCount>0),targets=described.filter(e=>e.diagnostics.relevantSignal&&!e.diagnostics.excluded),recovered=entries.filter(e=>!!e.facts),reasons={};
 for(const e of entries){const k=e.diagnostics.primaryReason;reasons[k]=(reasons[k]||0)+1;}
 // Multiple independently described target cards with zero recovered facts is a
 // parser-quality observation, not an HTTP failure or permission/disable signal.
 const warning=targets.length>=3&&recovered.length===0;
 return {...base,status:warning?'parser_quality_warning':!described.length?'sparse_listing':targets.length<3&&!recovered.length?'insufficient_sample':'ok',describedCount:described.length,targetCandidateCount:targets.length,recoveredCount:recovered.length,reasons};
}
export async function morrisDiagnosticsHealth(store,now){
 const state=await store.state('morris');
 if(state.disabled||state.takedown||state.publicationBlocked)return {sourceId:'morris',status:'paused'};
 const row=await store.db.prepare("SELECT * FROM news_morris_acquisition WHERE scope='listing' AND outcome='verified' AND attempted_at<=? ORDER BY attempted_at DESC LIMIT 1").bind(now).first();
 if(!row)return {sourceId:'morris',status:'not_instrumented'};
 let entries,proof;try{entries=JSON.parse(row.entries_json);proof=JSON.parse(row.proof_json);}catch{return {sourceId:'morris',status:'provenance_invalid',reason:'PROVENANCE_INVALID'};}
 if(!Array.isArray(entries)||entries.length>100||row.source_url!==MORRIS_LISTING||row.permission_ref!==MORRIS_PERMISSION||row.actual_requests!==2||proof?.verifiedAt!==row.attempted_at||proof?.responseHash!==row.response_hash||proof?.entryCount!==entries.length)return {sourceId:'morris',status:'provenance_invalid',reason:'PROVENANCE_INVALID'};
 return {sourceId:'morris',checkedAt:row.attempted_at,...summarizeMorrisDiagnostics(entries,proof)};
}
