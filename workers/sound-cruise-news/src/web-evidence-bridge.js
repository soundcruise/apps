import {SOURCES,legalGate} from './registry.js';
import {runtimeSources} from './runtime.js';
import {NewsStore} from './store.js';
import {sourceUrl,hash,DAY} from './policy.js';
import {allowedArticlePath} from './metadata.js';
import {publicationValidation} from './decision-policy.js';
import {candidateSnapshot} from './operator-review.js';
import {verifiedSurface,recheckFacts} from './facts-recheck.js';
import {publicSearchUrl,searchDate,generalPage} from './web-discovery-quality.js';
const evidenceRequestId=async(row,surface)=>'web-evidence-'+await hash(await candidateSnapshot(row)+surface.proof_json+surface.items_json);

// No search/model input is accepted as proof. Registration remains owned by
// the ordinary listing collector. This connector only completes its existing
// candidate using that collector's bound proof, without any network fallback.
export async function inspectIkebeWebEvidence(store,raw,now,registry,pepper){
 const url=publicSearchUrl(raw),source=registry.find(s=>s.id==='ikebe');
 const view={path:'C',reason:'formal_listing_evidence_missing',nextAction:'normal_collector_listing',sourceId:'ikebe',publishedAt:null,formalReady:false,registrationAllowed:false,checkedAt:now};
 const result=(reason,extra={})=>({view:{...view,reason,...extra}});
 if(!url||!source||sourceUrl(url,source)!==url||!allowedArticlePath(url,source)||generalPage(url))return result('outside_allowed_article_path',{nextAction:'operator_source_permission'});
 view.confirmationUrl=url;view.listingUrl=publicSearchUrl(source.discoveryUrl);
 const state=await store.state(source.id),controls=await store.controls();
 const gate=legalGate(source,state,now,'production',registry,{requestMode:'operator_validation'});
 if(!controls.collection_enabled||gate)return result(gate||'source_collection_unavailable',{nextAction:'operator_source_review'});
 const rows=(await store.db.prepare('SELECT * FROM candidate_items WHERE source_id=? AND (source_url=? OR normalized_url=?) LIMIT 2').bind(source.id,url,url).all()).results;
 if(rows.length!==1)return result(rows.length?'ambiguous_existing_candidate':'formal_candidate_not_created');
 const row=rows[0];Object.assign(view,{candidateId:row.id,revision:row.review_revision});
 if(await store.db.prepare('SELECT item_id FROM news_takedowns WHERE item_id=?').bind(row.id).first())return result('candidate_takedown',{nextAction:'none'});
 const judgment=await store.db.prepare("SELECT verdict FROM news_decision_ledger WHERE candidate_id=? ORDER BY decided_at DESC LIMIT 1").bind(row.id).first();
 if(judgment||!['pending','reopened'].includes(row.review_status))return result('existing_decision_reference',{path:'A',decision:judgment?.verdict||row.review_status,nextAction:'existing_candidate_review'});
 const validation=pepper&&await publicationValidation(store,row,now,registry,pepper);
 if(validation?.valid)return {view:{...view,path:'A',reason:'existing_formal_evidence',nextAction:'existing_candidate_review',formalReady:true,publishedAt:row.published_at},row};
 if(!validation)return result('verification_credentials_unavailable',{nextAction:'operator_source_review'});
 if(validation.errors.some(e=>!['facts_incomplete','facts_provenance_invalid'].includes(e)))return result(validation.errors.includes('duplicate')?'duplicate_confirmed':'formal_validation_blocked',{nextAction:'operator_candidate_review',validationErrors:validation.errors});
 if(!searchDate(row.published_at)||Date.parse(row.published_at)>now||now-Date.parse(row.published_at)>=90*DAY)return result('publication_date_unconfirmed',{nextAction:'operator_candidate_review'});
 const receipt=await store.db.prepare('SELECT candidate_id,published_at FROM news_discovery_receipts WHERE source_id=? AND normalized_url=?').bind(source.id,url).first();
 if(receipt?.candidate_id!==row.id||receipt?.published_at!==row.published_at)return result('formal_listing_evidence_missing');
 let surface;try{surface=await verifiedSurface(store,source,registry,row,now,pepper,{cacheOnly:true,fetcher:()=>{throw Error('web_evidence_network_forbidden');}});}catch{return result('saved_evidence_source_gate',{nextAction:'operator_source_review'});}
 if(surface.outcome!=='verified_surface')return result(surface.outcome,{nextAction:'operator_candidate_review'});
 const previous=await store.db.prepare('SELECT outcome,patch_json FROM news_facts_rechecks WHERE request_id=?').bind(await evidenceRequestId(row,surface)).first();
 if(previous&&!previous.patch_json)return result(previous.outcome,{nextAction:'operator_candidate_review'});
 return {view:{...view,path:'B',reason:'saved_collector_evidence_ready',nextAction:'saved_evidence_recheck'},row,surface};
}

export async function reconcileWebEvidence(env,now=Date.now(),{registry=SOURCES,limit=5}={}){
 // Separate opt-in: viewing old hints or deploying this code never mutates NEWS.
 if(env.NEWS_WEB_EVIDENCE_ENABLED!=='true')return {disabled:true};
 if(!Number.isInteger(limit)||limit<1||limit>10)throw Error('web_evidence_limit_invalid');
 const store=new NewsStore(env.NEWS_DB),sources=runtimeSources(env,registry,now);
 const source=sources.find(s=>s.id==='ikebe');if(!source)return {items:[],publisherRequests:0};
 const hints=(await store.db.prepare('SELECT url FROM news_web_hints WHERE expires_at>? ORDER BY searched_at DESC,url LIMIT 100').bind(now).all()).results;
 const items=[];let attempted=0;
 for(const h of hints){if(sourceUrl(h.url,source)!==publicSearchUrl(h.url))continue;
  const plan=await inspectIkebeWebEvidence(store,h.url,now,sources,env.NEWS_HEADLINE_PEPPER);
  if(plan.view.path!=='B'){items.push(plan.view);continue;}
  if(attempted>=limit)break;attempted++;
  const snapshot=await candidateSnapshot(plan.row),requestId=await evidenceRequestId(plan.row,plan.surface);
  try{
   const r=await recheckFacts(store,{id:plan.row.id,revision:plan.row.review_revision,snapshot,requestId},now,sources,env.NEWS_HEADLINE_PEPPER,{type:'system_recheck',id:'web-evidence'},{cacheOnly:true,fetcher:()=>{throw Error('web_evidence_network_forbidden');}});
   const after=await inspectIkebeWebEvidence(store,h.url,now,sources,env.NEWS_HEADLINE_PEPPER);
   items.push({...after.view,...(after.view.path==='B'?{path:'C',reason:r.outcome,nextAction:'operator_candidate_review'}:{}),outcome:r.outcome,replayed:!!r.replayed});
  }catch(e){items.push({...plan.view,path:'C',reason:['candidate_changed','already_decided','facts_source_gate'].includes(e.message)?e.message:'saved_evidence_recheck_failed',nextAction:'operator_candidate_review'});}
 }
 return {items,attempted,publisherRequests:0};
}
