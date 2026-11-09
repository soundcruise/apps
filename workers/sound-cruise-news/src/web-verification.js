import {assistedUrl} from './assisted-facts.js';
import {SOURCES,evidenceGate} from './registry.js';
import {runtimeSources} from './runtime.js';
import {sourceUrl} from './policy.js';
import {allowedArticlePath} from './metadata.js';
import {publicationValidation} from './decision-policy.js';
import {NewsStore} from './store.js';
import {nextDailyCollectionAt} from './collection-clock.js';
import {publicSearchUrl,searchDate,generalPage} from './web-discovery-quality.js';
import {inspectIkebeWebEvidence} from './web-evidence-bridge.js';

// A read-only join into the existing collector/lifecycle, NOT a new fetch or
// candidate-registration contract. No search value is promoted to provenance.
// Memoized and bounded per request, including while NEWS exploration is OFF.
export function webVerification(env,now,{registry=SOURCES}={}){
 const sources=runtimeSources(env,registry,now),store=new NewsStore(env.NEWS_DB),memo=new Map();
 let formalChecks=0;
 return url=>{
  if(memo.has(url))return memo.get(url);
  if(memo.size>=100)return Promise.resolve({path:'C',reason:'verification_view_limit',nextAction:'operator_source_review'});
  const result=resolve(url).catch(()=>({path:'C',reason:'verification_unavailable',nextAction:'operator_source_review'}));memo.set(url,result);return result;
 };
 async function resolve(raw){
  const url=publicSearchUrl(raw),base={publishedAt:null,checkedAt:now,registrationAllowed:false};
  if(!url)return {...base,path:'C',reason:'unsafe_url',nextAction:'none'};
  if(generalPage(url))return {...base,path:'C',reason:'individual_article_required',nextAction:'find_individual_article'};
  // A prior human-confirmed Topics candidate remains reachable even though
  // the separate Bot collection policy is OFF. This grants no new registration.
  if(assistedUrl(url)){
   const existing=await store.db.prepare("SELECT * FROM candidate_items WHERE source_id='yamaha' AND (source_url=? OR normalized_url=?) LIMIT 2").bind(url,url).all();
   if(existing.results.length===1){const row=existing.results[0],ref={...base,candidateId:row.id,revision:row.review_revision,sourceId:'yamaha',confirmationUrl:url};
    if(!['pending','reopened'].includes(row.review_status))return {...ref,path:'C',reason:'existing_decision_preserved',nextAction:'operator_candidate_review'};
    const validation=env.NEWS_HEADLINE_PEPPER&&formalChecks++<10&&await publicationValidation(store,row,now,sources,env.NEWS_HEADLINE_PEPPER);
    return {...ref,path:validation?.valid?'A':'C',reason:validation?.valid?'existing_formal_evidence':'existing_candidate_verification',nextAction:'operator_candidate_review',publishedAt:validation?.valid?row.published_at:null};
   }
   if(existing.results.length>1)return {...base,path:'C',reason:'ambiguous_existing_candidate',nextAction:'operator_candidate_review'};
  }
  const source=sources.find(s=>sourceUrl(url,s)===url);
  if(!source)return {...base,path:'C',reason:'source_not_registered',nextAction:'operator_source_permission',confirmationUrl:url};
  const info={...base,sourceId:source.id,confirmationUrl:url};
  // Includes CONTACT/DO_NOT_USE, stale policy, robots baseline and configured
  // path scope. In particular Yamaha Topics permission never covers newsroom.
  const gate=evidenceGate(source,now);
  if(gate||!allowedArticlePath(url,source))return {...info,path:'C',reason:gate||'outside_allowed_article_path',nextAction:'operator_source_permission'};
  if(source.id==='ikebe'){
   if(formalChecks++>=10)return {...info,path:'C',reason:'verification_view_limit',nextAction:'operator_candidate_review'};
   return {...(await inspectIkebeWebEvidence(store,url,now,sources,env.NEWS_HEADLINE_PEPPER)).view,automaticEvidenceEnabled:env.NEWS_WEB_EVIDENCE_ENABLED==='true'};
  }
  const rows=(await store.db.prepare('SELECT * FROM candidate_items WHERE source_id=? AND (source_url=? OR normalized_url=?) LIMIT 2').bind(source.id,url,url).all()).results;
  if(rows.length>1)return {...info,path:'C',reason:'ambiguous_existing_candidate',nextAction:'operator_candidate_review'};
  const row=rows[0];
  if(row){
   const ref={candidateId:row.id,revision:row.review_revision};
   if(await store.db.prepare('SELECT item_id FROM news_takedowns WHERE item_id=?').bind(row.id).first())return {...info,...ref,path:'C',reason:'candidate_takedown',nextAction:'none'};
   if(!['pending','reopened','approved'].includes(row.review_status))return {...info,...ref,path:'C',reason:'existing_decision_preserved',nextAction:'operator_candidate_review'};
   // Formal validation includes provenance, fingerprint, dates, duplicates,
   // takedown and current source conditions. No reduced search-side validator.
   const validation=env.NEWS_HEADLINE_PEPPER&&formalChecks++<10&&await publicationValidation(store,row,now,sources,env.NEWS_HEADLINE_PEPPER);
   if(validation?.valid&&searchDate(row.published_at))return {...info,...ref,path:'A',reason:'existing_formal_evidence',publishedAt:row.published_at,nextAction:'existing_candidate_review'};
   const state=await store.state(source.id);
   if(!source.enabled||!source.productionEnabled||state.disabled||state.publicationBlocked)return {...info,...ref,path:'C',reason:'source_collection_unavailable',nextAction:'operator_source_review'};
   const lifecycle=await store.db.prepare('SELECT next_recheck_at,recheck_status FROM news_pending_lifecycle WHERE candidate_id=?').bind(row.id).first();
   return {...info,...ref,path:'B',reason:'existing_candidate_verification',nextAction:lifecycle?.next_recheck_at?'existing_pending_recheck':'operator_candidate_review',nextAt:lifecycle?.next_recheck_at??null};
  }
  const state=await store.state(source.id),controls=await store.controls();
  if(!source.enabled||!source.productionEnabled||!controls.collection_enabled||state.disabled||state.publicationBlocked)return {...info,path:'C',reason:'source_collection_unavailable',nextAction:'operator_source_review'};
  const work=await store.db.prepare('SELECT processing_state,reason_code,next_at,next_action FROM news_discovery_work WHERE source_id=? AND normalized_url=?').bind(source.id,url).first();
  // Only the normal permission-scoped listing may introduce a new candidate.
  // This pointer follows its existing budget/backoff; it never inserts a fake
  // listing receipt, advances a retry or requests a detail URL.
  return {...info,path:'B',reason:work?'existing_collector_work':'listing_discovery_required',nextAction:work?.next_action||'normal_collector_listing',nextAt:work?work.next_at:Math.max(nextDailyCollectionAt(now),state.backoffUntil||0,state.nextAt||0),collectorState:work?.processing_state||'not_discovered',collectorReason:work?.reason_code||null,listingUrl:publicSearchUrl(source.discoveryUrl)};
 }
}
