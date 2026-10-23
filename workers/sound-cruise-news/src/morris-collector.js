import {morrisNoticeLabel,MORRIS_FACT_CHECKS} from './morris-editorial-policy.js';
import {observePreparation} from './preparation-metrics.js';
import {legalGate} from './registry.js';
import {boundedFetch,hash,DAY,optOut,BOT,robotsPolicy} from './policy.js';
import {requirePepper,validatedFingerprint} from './fingerprint.js';
import {MORRIS_PERMISSION,MORRIS_LISTING,morrisParserSupported,MORRIS_FRESH_MS,morrisDay,morrisArticleUrl,morrisUrlDate,morrisPermissionValid} from './morris-policy.js';
import {parseMorrisListing,parseMorrisArticle,morrisLabel,MORRIS_LISTING_PARSER} from './morris-evidence.js';
import {eventEndsAt} from './event.js';
import {healthForOutcome} from './source-health.js';
import {summarizeMorrisDiagnostics} from './morris-diagnostics.js';
import {MORRIS_PRIMARY_REVIEW,MORRIS_PRIMARY_CHECKS} from './morris-primary-review.js';
const activeSQL="EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1) AND EXISTS(SELECT 1 FROM source_state WHERE source_id='morris' AND disabled=0 AND takedown=0 AND publication_blocked=0)";
export async function morrisReceipt(store,url){return await store.db.prepare("SELECT * FROM news_morris_acquisition WHERE scope='article' AND source_url=?").bind(url).first();}
// A verified listing is a primary surface. Its stored URL/day/facts/proof must
// match exactly; legacy/transcribed entries without a real receipt cannot qualify.
export async function morrisListingEvidence(store,url,now,{expected=null,requireFacts=false,anchor=null}={}){
 if(!morrisArticleUrl(url))return null;
 const listings=(await store.db.prepare(`SELECT DISTINCT r.* FROM news_morris_acquisition r JOIN json_each(CASE WHEN json_valid(r.entries_json) THEN r.entries_json ELSE '[]' END) entry
 WHERE r.scope='listing' AND r.outcome='verified' AND r.discovered_at>? AND json_array_length(r.entries_json)<=100 AND json_extract(CASE WHEN json_valid(entry.value) THEN entry.value ELSE '{}' END,'$.url')=? ORDER BY r.discovered_at DESC LIMIT 90`).bind(now-90*DAY,url).all()).results;
 for(const r of listings){
  if(anchor&&(r.response_hash!==anchor.hash||r.attempted_at!==anchor.at))continue;
  if(r.request_key!=='listing:'+r.jst_day||r.source_url!==MORRIS_LISTING||r.permission_ref!==MORRIS_PERMISSION||r.actual_requests!==2||!Number.isSafeInteger(r.attempted_at)||r.attempted_at>now||!Number.isSafeInteger(r.discovered_at)||r.discovered_at>r.attempted_at||!/^[a-f0-9]{64}$/.test(r.response_hash||''))continue;
  let entries,listingProof;try{entries=JSON.parse(r.entries_json);listingProof=JSON.parse(r.proof_json);}catch{continue;}
  if(!listingProof||listingProof.sourceId!=='morris'||listingProof.sourceUrl!==MORRIS_LISTING||listingProof.responseHash!==r.response_hash||listingProof.verifiedAt!==r.attempted_at||!morrisParserSupported(listingProof.parserVersion,true)||listingProof.permissionRef!==MORRIS_PERMISSION||listingProof.canonicalBasis!=='canonical'||listingProof.entryCount!==entries?.length)continue;
  if(!Array.isArray(entries)||entries.length>100)continue;
  const matches=entries.filter(e=>e.url===url);if(matches.length!==1)continue;
  const e=matches[0],p=e.proof;
  if(requireFacts&&(!e.facts||!morrisLabel(e.facts,e.eventType)||e.facts.articleUrl!==url))continue;
  if(morrisUrlDate(url)!==e.publishedAt||!p||p.sourceId!=='morris'||p.sourceUrl!==MORRIS_LISTING||p.articleUrl!==url||p.publishedAt!==e.publishedAt||p.permissionRef!==MORRIS_PERMISSION||p.parserVersion!==listingProof.parserVersion||p.extractionMethod!=='morris_explicit_listing_fields'||p.canonicalBasis!=='canonical'||p.responseHash!==r.response_hash||p.verifiedAt!==r.attempted_at||morrisDay(p.verifiedAt)!==r.jst_day)continue;
  if(expected&&!requireFacts&&(expected.title_fingerprint!==JSON.stringify(e.fingerprint)||expected.published_at!==e.publishedAt))continue;
  if(expected&&requireFacts){let fields;try{fields=JSON.parse(expected.facts_provenance);}catch{continue;}if(expected.product_facts!==JSON.stringify(e.facts)||expected.title_fingerprint!==JSON.stringify(e.fingerprint)||expected.published_at!==e.publishedAt||!Array.isArray(fields)||!fields.some(f=>f.responseHash===p.responseHash&&f.verifiedAt===p.verifiedAt))continue;}
  return {entry:e,listing:r,proof:p};
 }
 return null;
}
export async function morrisEvidenceReceipt(store,url,now,expected=null){
 const article=await morrisReceipt(store,url);
 if(article?.outcome==='verified'&&article.facts_json)return article;
 const found=await morrisListingEvidence(store,url,now,{expected,requireFacts:true});
 if(found){const {entry:e,listing:r,proof:p}=found;
  return {outcome:'verified_listing',published_at:e.publishedAt,facts_json:JSON.stringify(e.facts),proof_json:JSON.stringify(p),fingerprint_json:JSON.stringify(e.fingerprint),response_hash:r.response_hash,attempted_at:r.attempted_at,actual_requests:0,permission_ref:r.permission_ref};
 }
 return article;
}
export async function morrisReviewEvidence(store,row,now,anchor=null){
 const listing=await morrisListingEvidence(store,row.source_url,now,{anchor});
 if(!listing||listing.entry.publishedAt!==row.published_at)return null;
 if(JSON.stringify(listing.entry.fingerprint)===row.title_fingerprint)return listing;
 const article=await morrisReceipt(store,row.source_url);let p;try{p=JSON.parse(article?.proof_json);}catch{return null;}
 return article?.outcome==='verified'&&article.permission_ref===MORRIS_PERMISSION&&article.actual_requests===1&&article.published_at===row.published_at&&article.fingerprint_json===row.title_fingerprint&&p?.sourceId==='morris'&&p.sourceUrl===row.source_url&&p.responseHash===article.response_hash&&p.verifiedAt===article.attempted_at&&article.attempted_at<=now&&morrisParserSupported(p.parserVersion)?listing:null;
}
export async function morrisRecoveryView(store,row,now){
 const listing=await morrisListingEvidence(store,row.source_url,now),article=await morrisReceipt(store,row.source_url);let analysis=null;
 try{const p=JSON.parse(article?.proof_json);if(article?.outcome==='verified'&&p?.sourceId==='morris'&&p.sourceUrl===row.source_url&&p.responseHash===article.response_hash&&morrisParserSupported(p.parserVersion))analysis=p.recoveryAnalysis;}catch{}
 analysis=analysis||listing?.entry.recoveryAnalysis;
 const code=v=>typeof v==='string'&&/^[A-Za-z_0-9]{1,90}$/.test(v)?v:null;
 const candidates=Array.isArray(analysis?.candidates)?analysis.candidates.filter(c=>c?.triggered===true&&code(c.type)).slice(0,8).map(c=>({type:c.type,eligible:c.eligible===true,missingFields:Array.isArray(c.missingFields)?c.missingFields.map(code).filter(Boolean).slice(0,16):[],reason:code(c.reason)})):[];
 const historicalBlocked=!row.product_facts&&article?.outcome==='baseline_old'&&!listing?.entry.facts;
 return {state:row.product_facts?'FACTS_PRESENT':'NEEDS_CONFIRMATION',recoveryStatus:historicalBlocked?'PERMISSION_BLOCKED_HISTORICAL':'AWAITING_VERIFIED_FACTS',articleType:code(analysis?.articleType)||'unresolved',reason:code(analysis?.reason)||'SAVED_PRIMARY_FACTS_MISSING',candidates};
}
export async function markMorrisEvidenceWait(store,row,now){
 if(row.source_id!=='morris'||!['pending','reopened'].includes(row.review_status)||(await morrisRecoveryView(store,row,now)).recoveryStatus!=='PERMISSION_BLOCKED_HISTORICAL')return false;
 const old=await store.db.prepare('SELECT * FROM news_pending_lifecycle WHERE candidate_id=?').bind(row.id).first();
 if(old?.recheck_status==='AWAITING_PERMITTED_EVIDENCE'&&old.assessed_revision===row.review_revision&&old.next_recheck_at===null)return false;
 const history=JSON.stringify([...JSON.parse(old?.history_json||'[]'),{at:now,actor:'system_recovery',result:'AWAITING_PERMITTED_EVIDENCE',reason:'historical_detail_outside_permission',revision:row.review_revision}].slice(-20)),keys=Object.keys(row);
 const saved=await store.db.prepare(`INSERT INTO news_pending_lifecycle(candidate_id,assessed_revision,next_recheck_at,recheck_status,unresolved_reason,last_recheck_result,recheck_policy_version,history_json)
 SELECT ?,?,NULL,'AWAITING_PERMITTED_EVIDENCE','historical_detail_outside_permission','saved_primary_facts_missing','pending-recheck-1',?
 WHERE EXISTS(SELECT 1 FROM candidate_items WHERE ${keys.map(k=>k+' IS ?').join(' AND ')}) AND NOT EXISTS(SELECT 1 FROM news_decision_ledger WHERE candidate_id=?)
 ON CONFLICT(candidate_id) DO UPDATE SET assessed_revision=excluded.assessed_revision,next_recheck_at=NULL,recheck_status=excluded.recheck_status,unresolved_reason=excluded.unresolved_reason,last_recheck_result=excluded.last_recheck_result,history_json=excluded.history_json,lease_token=NULL,lease_until=0
 WHERE news_pending_lifecycle.history_json=? AND news_pending_lifecycle.lease_until<=?`)
 .bind(row.id,row.review_revision,history,...keys.map(k=>row[k]),row.id,old?.history_json||'[]',now).run();
 return saved.meta.changes===1;
}
export async function morrisProofValid(store,row,now){
 let rowFacts;try{rowFacts=JSON.parse(row.product_facts||'null');}catch{return false;}
 if(row.event_type==='morris_notice'&&rowFacts?.evidence==='morris_human_primary_v1'){
  let facts,fields;try{facts=JSON.parse(row.product_facts);fields=JSON.parse(row.facts_provenance);}catch{return false;}
  if(!morrisNoticeLabel(facts,row.event_type)||facts.articleUrl!==row.source_url||!Array.isArray(fields))return false;
  const p=fields[0],entry=await morrisReviewEvidence(store,row,now,{hash:p?.listingResponseHash,at:p?.listingVerifiedAt});
  if(!entry||p?.verificationMethod!=='human_primary_confirmation'||p.sourceId!=='morris'||p.sourceUrl!==row.source_url||p.publishedAt!==row.published_at||p.permissionRef!==MORRIS_PERMISSION||p.listingResponseHash!==entry.listing.response_hash||p.listingVerifiedAt!==entry.listing.attempted_at||!Number.isSafeInteger(p.verifiedAt)||p.verifiedAt>now||!MORRIS_FACT_CHECKS.every(k=>p.checks?.[k]===true))return false;
  const saved=await store.db.prepare("SELECT * FROM news_facts_rechecks WHERE request_id=? AND candidate_id=? AND outcome='morris_primary_facts_confirmed'").bind(p.confirmationId,row.id).first();
  if(!saved||saved.checked_at!==p.verifiedAt||saved.request_payload_hash!==p.confirmationHash||saved.provenance_json!==row.facts_provenance)return false;
  let patch;try{patch=JSON.parse(saved.patch_json);}catch{return false;}
  return patch?.product_facts===row.product_facts&&patch.label===row.label&&patch.category===row.category&&patch.event_type===row.event_type&&patch.topic_key===row.topic_key&&patch.event_ends_at===row.event_ends_at&&Object.keys(facts).every(k=>fields.some(f=>f.factField===k&&JSON.stringify({...f,factField:''})===JSON.stringify({...p,factField:''})));
 }
 const r=await morrisEvidenceReceipt(store,row.source_url,now,row);if(!r||!['verified','verified_listing'].includes(r.outcome)||r.permission_ref!==MORRIS_PERMISSION||r.published_at!==row.published_at||!Number.isSafeInteger(r.attempted_at)||r.attempted_at>now||r.actual_requests!==(r.outcome==='verified_listing'?0:1)||r.fingerprint_json!==row.title_fingerprint||r.facts_json!==row.product_facts)return false;
 let proof,fields,facts;try{proof=JSON.parse(r.proof_json);fields=JSON.parse(row.facts_provenance);facts=JSON.parse(row.product_facts);}catch{return false;}
 const listing=r.outcome==='verified_listing',proofUrl=listing?MORRIS_LISTING:row.source_url,parser=proof?.parserVersion;
 if(parser===MORRIS_PRIMARY_REVIEW&&(listing||proof.extractionMethod!=='morris_system_primary_review'||proof.reviewActor!=='system_primary_review'||!MORRIS_PRIMARY_CHECKS.every(k=>proof.primaryAuditChecks?.[k]===true)))return false;
 if(!morrisParserSupported(parser,listing))return false;
 if(!facts||!Array.isArray(fields)||!Object.keys(facts).every(factField=>fields.some(f=>f.factField===factField&&f.sourceUrl===proofUrl&&f.sourceId==='morris'&&f.responseHash===r.response_hash&&f.parserVersion===parser&&f.verifiedAt===proof.verifiedAt&&f.extractionMethod===proof.extractionMethod&&f.permissionRef===MORRIS_PERMISSION&&f.publishedAt===row.published_at&&(!listing||f.articleUrl===row.source_url))))return false;
 return proof?.sourceId==='morris'&&proof.sourceUrl===proofUrl&&(!listing||proof.articleUrl===row.source_url)&&proof.publishedAt===row.published_at&&proof.permissionRef===MORRIS_PERMISSION&&proof.parserVersion===parser&&proof.responseHash===r.response_hash&&/^[a-f0-9]{64}$/.test(proof.responseHash)&&Number.isSafeInteger(proof.verifiedAt)&&proof.verifiedAt<=now&&proof.verifiedAt>=r.attempted_at&&['canonical','og:url'].includes(proof.canonicalBasis);
}
async function reserve(store,{key,scope,url,now,publishedAt=null,outcome='reserved'}){
 const r=await store.db.prepare(`INSERT OR IGNORE INTO news_morris_acquisition(request_key,scope,source_url,jst_day,published_at,discovered_at,outcome,permission_ref) SELECT ?,?,?,?,?,?,?,? WHERE ${activeSQL}`)
 .bind(key,scope,url,morrisDay(now),publishedAt,now,outcome,MORRIS_PERMISSION).run();return r.meta.changes===1;
}
async function currentGate(store,source,now,mode,registry){
 if(!morrisPermissionValid(source)||legalGate(source,{...await store.state('morris'),nextAt:0,lastPublisherRequestAt:0},now,mode,registry,{requestMode:'operator_validation'})||!(await store.controls()).collection_enabled)throw Error('access_stopped');
}
export async function collectMorris(store,{source,now,mode,registry,pepper,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),requestMode='normal'}){
 const day=morrisDay(now),key='listing:'+day,report={sourceId:'morris',startedAt:now,requestMode,requests:0,candidates:0,pending:0,rejected:0,duplicates:0,durationMs:0,outcome:'backoff',requestCounts:{robots:0,listing:0,article:0},baseline:0};
 try{requirePepper(pepper);}catch{report.outcome='headline_pepper_required';return report;}
 if(!(await store.controls()).collection_enabled){report.outcome='global_collection_off';return report;}
 await store.db.prepare("INSERT OR IGNORE INTO source_state(source_id) VALUES('morris')").run();
 let entries=[],robots=null,completed=false;
 const request=async(url,key,kind)=>{
  await currentGate(store,source,now,mode,registry);
  if(url!==source.robotsUrl&&url!==MORRIS_LISTING&&!morrisArticleUrl(url))throw Error('url_blocked');
  const claimed=await store.db.prepare(`UPDATE news_morris_acquisition SET attempted_at=COALESCE(attempted_at,?),actual_requests=actual_requests+1 WHERE request_key=? AND ${activeSQL} AND actual_requests<?`)
  .bind(now,key,kind==='article'?1:2).run();if(claimed.meta.changes!==1)throw Error('access_stopped');
  await store.publisherAttempt('morris',now,DAY);report.requests++;report.requestCounts[kind]++;
  const response=await boundedFetch(url,{fetcher,maxBytes:128000,headers:{Accept:kind==='robots'?'text/plain':'text/html','Cache-Control':'no-store'}});
  if([401,403,451,429].includes(response.status)||response.status>=500)throw Error(response.status===429?'rate_limited':'http_'+response.status);
  if(kind!=='robots'&&optOut(response.headers.get('x-robots-tag')||''))throw Error('header_optout');return response;
 };
 try{
  await currentGate(store,source,now,mode,registry);
  const previous=await store.db.prepare('SELECT * FROM news_morris_acquisition WHERE request_key=?').bind(key).first();
  if(previous){
   if(previous.outcome!=='verified'||previous.permission_ref!==MORRIS_PERMISSION)return report;
   // Same-day replay processes only stored bounded facts; no publisher requests.
   entries=JSON.parse(previous.entries_json||'[]');report.cachedListing=true;
   let diagnosticProof=null;try{diagnosticProof=JSON.parse(previous.proof_json);}catch{}
   report.parserDiagnostics=summarizeMorrisDiagnostics(entries,diagnosticProof);
  }else if(await reserve(store,{key,scope:'listing',url:MORRIS_LISTING,now})){
   let rr=await request(source.robotsUrl,key,'robots');
   // Reviewed 404. A newly installed robots policy is a change requiring review.
   if(rr.status!==404)throw Error('robots_changed_review');robots=robotsPolicy('',source,404);rr=null;
   await sleep(1000);let listing=await request(MORRIS_LISTING,key,'listing');
   if(listing.status!==200||!/text\/html/i.test(listing.headers.get('content-type')||''))throw Error('discovery_unavailable');
   const responseHash=await hash(listing.text);try{entries=await parseMorrisListing(listing.text,pepper,{verifiedAt:now});}finally{listing.text='';listing=null;}
   const listingProof={sourceId:'morris',sourceUrl:MORRIS_LISTING,verifiedAt:now,responseHash,parserVersion:MORRIS_LISTING_PARSER,permissionRef:MORRIS_PERMISSION,canonicalBasis:'canonical',entryCount:entries.length};
   listingProof.diagnostics=summarizeMorrisDiagnostics(entries,listingProof);report.parserDiagnostics=listingProof.diagnostics;
   await store.db.prepare("UPDATE news_morris_acquisition SET outcome='verified',response_hash=?,entries_json=?,proof_json=? WHERE request_key=? AND outcome='reserved' AND actual_requests=2 AND attempted_at=? AND permission_ref=?").bind(responseHash,JSON.stringify(entries),JSON.stringify(listingProof),key,now,MORRIS_PERMISSION).run();
  }else return report;
  if(!Array.isArray(entries)||entries.length>100)throw Error('listing_structure_changed');
  for(const entry of entries){
   await currentGate(store,source,now,mode,registry);
   if(!morrisArticleUrl(entry.url)||morrisUrlDate(entry.url)!==entry.publishedAt||!await validatedFingerprint(entry.fingerprint,pepper))throw Error('listing_structure_changed');
   report.candidates++;
   observePreparation(report,entry,{reason:'receipt_evaluation'});
   const articleKey='article:'+await hash(entry.url),stamp=Date.parse(entry.publishedAt),historical=stamp<=now&&now-stamp>MORRIS_FRESH_MS;
   let receipt=await morrisEvidenceReceipt(store,entry.url,now),failure=null;
   // Never revive old/ended articles, change their publication day, or fetch a
   // detail merely to backfill. Non-event reading value is assessed separately.
   if(receipt?.outcome==='verified_listing'){const end=eventEndsAt(JSON.parse(receipt.facts_json));if(stamp>now||now-stamp>=90*DAY||end!==null&&(!Number.isSafeInteger(end)||end<now)){report.baseline++;continue;}}
   if(!receipt){
    const fresh=stamp<=now&&now-stamp<=MORRIS_FRESH_MS;
    // Freshness and date binding, not merely an unseen URL. Old URLs remain known forever.
    if(!fresh){report.historicalFactsInsufficient=(report.historicalFactsInsufficient||0)+1;await reserve(store,{key:articleKey,scope:'article',url:entry.url,now,publishedAt:entry.publishedAt,outcome:'baseline_old'});report.baseline++;continue;}
    const used=await store.db.prepare("SELECT COUNT(*) AS n FROM news_morris_acquisition WHERE scope='article' AND jst_day=? AND outcome<>'baseline_old'").bind(day).first();
    if(used.n>=3){report.deferred=(report.deferred||0)+1;continue;}
    if(!robots){report.deferred=(report.deferred||0)+1;continue;}
    if(!await reserve(store,{key:articleKey,scope:'article',url:entry.url,now,publishedAt:entry.publishedAt}))continue;
    // Cached-listing replay never starts missing detail requests: its robots evidence is unavailable.
    if(!robots){await store.db.prepare("UPDATE news_morris_acquisition SET outcome='facts_once_only_unavailable' WHERE request_key=?").bind(articleKey).run();continue;}
    if(robots.isAllowed(entry.url,BOT)!==true)throw Error('robots_disallow');
    try{
     await sleep(1000);let article=await request(entry.url,articleKey,'article'),parsed;
     if(article.status!==200||!/text\/html/i.test(article.headers.get('content-type')||''))throw Error('facts_unavailable');
     try{parsed=await parseMorrisArticle(article.text,entry,now,pepper);}finally{article.text='';article=null;}
     await store.db.prepare("UPDATE news_morris_acquisition SET outcome='verified',response_hash=?,facts_json=?,proof_json=?,fingerprint_json=? WHERE request_key=?").bind(parsed.proof.responseHash,parsed.facts?JSON.stringify(parsed.facts):null,JSON.stringify(parsed.proof),JSON.stringify(parsed.fingerprint),articleKey).run();
    }catch(error){await store.db.prepare('UPDATE news_morris_acquisition SET outcome=? WHERE request_key=?').bind(/^facts_/.test(error.message)?error.message:'facts_acquisition_failed',articleKey).run();failure=error;}
    receipt=await morrisEvidenceReceipt(store,entry.url,now);
   }
   if(receipt.outcome==='baseline_old'){report.baseline++;report.historicalFactsInsufficient=(report.historicalFactsInsufficient||0)+1;continue;}
   // Replaying failed evidence creates/retains a safe pending card, never another request.
   const facts=['verified','verified_listing'].includes(receipt.outcome)&&receipt.facts_json?JSON.parse(receipt.facts_json):null,eventType=facts?.kind==='guitar_event'?'guitar_event':facts?.kind==='morris_notice'?'morris_notice':facts?.kind==='morris_editorial'?'morris_editorial':facts?.action||'other',label=morrisLabel(facts,eventType);
   const factsProvenance=receipt.proof_json&&facts?JSON.stringify(Object.keys(facts).map(factField=>({...JSON.parse(receipt.proof_json),recoveryAnalysis:undefined,factField}))):null;
   const item={factsProvenance,id:await hash(entry.url),sourceId:'morris',sourceName:'Morris Guitars',sourceUrl:entry.url,normalizedUrl:entry.url,publishedAt:entry.publishedAt,feedPublishedAt:entry.publishedAt,collectedAt:new Date(now).toISOString(),category:facts?.category||'media_other',label:label||'審査待ち（一次情報の事実確認が必要）',topicKey:facts?.kind==='morris_notice'?`morris:notice:${entry.url}`:facts?.kind==='morris_editorial'?`morris:editorial:${entry.url}`:facts?`morris:${JSON.stringify([facts.kind,facts.product||facts.eventName,facts.eventDate,facts.endDate,facts.exhibitor||facts.performer||'',facts.action,facts.productEvent?.action||''])}`:await hash(entry.url),eventType,productFacts:facts,titleFingerprint:receipt.fingerprint_json||JSON.stringify(entry.fingerprint),publicationDecision:'PUBLISH_REVIEW',decisionReason:label?'factual_label_ready':'label_required',reviewReason:'structured_review_required'};
   // The once-only evidence is immutable; never rewrite an already-created candidate on rediscovery.
   const exists=await store.db.prepare('SELECT 1 FROM candidate_items WHERE id=?').bind(item.id).first();
   if(exists){report.duplicates++;continue;}
   const created=await store.put(item);observePreparation(report,entry,{item,created});if(created){report.pending++;if(historical&&receipt.outcome==='verified_listing')report.historicalRecovered=(report.historicalRecovered||0)+1;}else report.duplicates++;
   if(failure)throw failure;
  }
  const review=await materializeMorrisReviewCandidates(store,{source,now,pepper});report.reviewCandidatesAdded=review.added;report.pending+=review.added;report.reviewExcluded=review.excluded;
  for(const id of review.ids){const row=await store.db.prepare('SELECT source_url,published_at FROM candidate_items WHERE id=?').bind(id).first();if(row)observePreparation(report,{url:row.source_url,publishedAt:row.published_at},{created:true,reason:'historical_evidence_review'});}
  report.outcome='collected';completed=true;
 }catch(error){
  report.outcome=['access_stopped','robots_changed_review','robots_disallow','rate_limited','http_401','http_403','http_451','redirect_blocked','header_optout','listing_structure_changed','listing_too_large','discovery_unavailable'].includes(error.message)?error.message:error.name==='AbortError'||error.name==='TimeoutError'?'request_timeout':'network_or_internal_error';
  if(report.outcome==='access_stopped'&&(await store.state('morris')).disabled)report.outcome='source_disabled';
  // No general-source retry: explicit intervention is required for a failed acquisition.
  await store.db.prepare("UPDATE source_state SET disabled=1,failures=failures+1,lease_until=0 WHERE source_id='morris'").run();
  await store.db.prepare("UPDATE news_morris_acquisition SET outcome=? WHERE request_key=? AND outcome='reserved'").bind(report.outcome,key).run();
 }finally{
  if(report.outcome!=='backoff'){
   const state=await store.state('morris');if(completed)await store.db.prepare("UPDATE source_state SET last_discovery_at=?,failures=0 WHERE source_id='morris' AND disabled=0").bind(now).run();
   await store.recordHealth({sourceId:'morris',...healthForOutcome(report.outcome,state.failures||0),checkedAt:now,nextEligibleAt:Date.parse(day+'T00:00:00+09:00')+DAY,failureCount:state.failures||0,successfulAt:completed?now:null});
   await store.log(report);
  }
 }
 if(completed){const {reconcileMorrisReady}=await import('./facts-recheck.js');report.automaticReview=await reconcileMorrisReady(store,now,registry,pepper);}
 return report;
}

// Receipt-only repair, also used after scheduled collection. No fetcher exists in
// this API. A facts-null historical listing entry is reviewable, never publishable.
export async function materializeMorrisReviewCandidates(store,{source,now,pepper}){
 const result={added:0,excluded:0,existing:0,ids:[]};requirePepper(pepper);
 const state=await store.state('morris');if(!morrisPermissionValid(source)||state.disabled||state.takedown||state.publicationBlocked||!(await store.controls()).collection_enabled)throw Error('facts_source_gate');
 const saved=await store.db.prepare("SELECT * FROM news_morris_acquisition WHERE scope='listing' AND outcome='verified' ORDER BY discovered_at DESC LIMIT 1").first();
 if(!saved)return result;
 let entries;try{entries=JSON.parse(saved.entries_json);}catch{throw Error('facts_listing_structure_changed');}
 if(!Array.isArray(entries)||entries.length>100)throw Error('facts_listing_structure_changed');
 for(const entry of entries){
  const proof=await morrisListingEvidence(store,entry.url,now);if(!proof||proof.listing.request_key!==saved.request_key||!await validatedFingerprint(entry.fingerprint,pepper))throw Error('facts_provenance_invalid');
  const stamp=Date.parse(entry.publishedAt),id=await hash(entry.url);
  if(stamp>now||now-stamp>=90*DAY){result.excluded++;continue;}
  if(await store.db.prepare('SELECT 1 FROM candidate_items WHERE id=? OR normalized_url=?').bind(id,entry.url).first()){result.existing++;continue;}
  const receipt=await morrisEvidenceReceipt(store,entry.url,now),facts=receipt?.facts_json&&['verified','verified_listing'].includes(receipt.outcome)?JSON.parse(receipt.facts_json):null;
  const end=eventEndsAt(facts);if(end!==null&&(!Number.isSafeInteger(end)||end<now)){result.excluded++;continue;}
  const historical=now-stamp>MORRIS_FRESH_MS,eventType=facts?.kind==='guitar_event'?'guitar_event':facts?.kind==='morris_notice'?'morris_notice':facts?.kind==='morris_editorial'?'morris_editorial':facts?.action||'other',label=morrisLabel(facts,eventType);
  const item={id,sourceId:'morris',sourceName:'Morris Guitars',sourceUrl:entry.url,normalizedUrl:entry.url,publishedAt:entry.publishedAt,feedPublishedAt:entry.publishedAt,collectedAt:new Date(Math.min(receipt?.discovered_at||saved.discovered_at,saved.discovered_at)).toISOString(),category:facts?.category||'media_other',label:label||'Morris Guitarsの公式お知らせ（要確認）',topicKey:id,eventType,productFacts:facts,titleFingerprint:receipt?.fingerprint_json||JSON.stringify(entry.fingerprint),factsProvenance:facts?JSON.stringify(Object.keys(facts).map(factField=>({...JSON.parse(receipt.proof_json),recoveryAnalysis:undefined,factField}))):null,publicationDecision:'PUBLISH_REVIEW',decisionReason:label?'factual_label_ready':'morris_primary_confirmation_required',reviewReason:historical?'morris_historical_confirmation_required':'morris_primary_confirmation_required'};
  if(await store.put(item)){result.added++;result.ids.push(id);}else result.existing++;
 }
 return result;
}
