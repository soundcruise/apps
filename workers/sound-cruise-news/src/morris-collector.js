import {legalGate} from './registry.js';
import {boundedFetch,hash,DAY,optOut,BOT,robotsPolicy} from './policy.js';
import {requirePepper,validatedFingerprint} from './fingerprint.js';
import {MORRIS_PERMISSION,MORRIS_LISTING,MORRIS_PARSER,MORRIS_FRESH_MS,morrisDay,morrisArticleUrl,morrisUrlDate,morrisPermissionValid} from './morris-policy.js';
import {parseMorrisListing,parseMorrisArticle,morrisLabel,MORRIS_LISTING_PARSER} from './morris-evidence.js';
import {eventEndsAt} from './event.js';
import {healthForOutcome} from './source-health.js';
const activeSQL="EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1) AND EXISTS(SELECT 1 FROM source_state WHERE source_id='morris' AND disabled=0 AND takedown=0 AND publication_blocked=0)";
export async function morrisReceipt(store,url){return await store.db.prepare("SELECT * FROM news_morris_acquisition WHERE scope='article' AND source_url=?").bind(url).first();}
// A verified listing is a primary surface. Its stored URL/day/facts/proof must
// match exactly; legacy/transcribed entries without a real receipt cannot qualify.
export async function morrisEvidenceReceipt(store,url,now,expected=null){
 const article=await morrisReceipt(store,url);
 if(article?.outcome==='verified'&&article.facts_json)return article;
 const listings=(await store.db.prepare(`SELECT DISTINCT r.* FROM news_morris_acquisition r JOIN json_each(CASE WHEN json_valid(r.entries_json) THEN r.entries_json ELSE '[]' END) entry
 WHERE r.scope='listing' AND r.outcome='verified' AND r.discovered_at>? AND json_array_length(r.entries_json)<=100 AND json_extract(CASE WHEN json_valid(entry.value) THEN entry.value ELSE '{}' END,'$.url')=? ORDER BY r.discovered_at DESC LIMIT 90`).bind(now-90*DAY,url).all()).results;
 for(const r of listings){
  if(r.request_key!=='listing:'+r.jst_day||r.source_url!==MORRIS_LISTING||r.permission_ref!==MORRIS_PERMISSION||r.actual_requests!==2||!Number.isSafeInteger(r.attempted_at)||r.attempted_at>now||!Number.isSafeInteger(r.discovered_at)||r.discovered_at>r.attempted_at||!/^[a-f0-9]{64}$/.test(r.response_hash||''))continue;
  let entries,listingProof;try{entries=JSON.parse(r.entries_json);listingProof=JSON.parse(r.proof_json);}catch{continue;}
  if(!listingProof||listingProof.sourceId!=='morris'||listingProof.sourceUrl!==MORRIS_LISTING||listingProof.responseHash!==r.response_hash||listingProof.verifiedAt!==r.attempted_at||listingProof.parserVersion!==MORRIS_LISTING_PARSER||listingProof.permissionRef!==MORRIS_PERMISSION||listingProof.canonicalBasis!=='canonical'||listingProof.entryCount!==entries?.length)continue;
  if(!Array.isArray(entries)||entries.length>100)continue;
  const matches=entries.filter(e=>e.url===url);if(matches.length!==1)continue;
  const e=matches[0],p=e.proof;
  if(!e.facts||!morrisLabel(e.facts,e.eventType)||e.facts.articleUrl!==url||morrisUrlDate(url)!==e.publishedAt||!p||p.sourceId!=='morris'||p.sourceUrl!==MORRIS_LISTING||p.articleUrl!==url||p.publishedAt!==e.publishedAt||p.permissionRef!==MORRIS_PERMISSION||p.parserVersion!==MORRIS_LISTING_PARSER||p.extractionMethod!=='morris_explicit_listing_fields'||p.canonicalBasis!=='canonical'||p.responseHash!==r.response_hash||p.verifiedAt!==r.attempted_at||morrisDay(p.verifiedAt)!==r.jst_day)continue;
  if(expected){let fields;try{fields=JSON.parse(expected.facts_provenance);}catch{continue;}if(expected.product_facts!==JSON.stringify(e.facts)||expected.title_fingerprint!==JSON.stringify(e.fingerprint)||expected.published_at!==e.publishedAt||!Array.isArray(fields)||!fields.some(f=>f.responseHash===p.responseHash&&f.verifiedAt===p.verifiedAt))continue;}
  return {outcome:'verified_listing',published_at:e.publishedAt,facts_json:JSON.stringify(e.facts),proof_json:JSON.stringify(p),fingerprint_json:JSON.stringify(e.fingerprint),response_hash:r.response_hash,attempted_at:r.attempted_at,actual_requests:0,permission_ref:r.permission_ref};
 }
 return article;
}
export async function morrisProofValid(store,row,now){
 const r=await morrisEvidenceReceipt(store,row.source_url,now,row);if(!r||!['verified','verified_listing'].includes(r.outcome)||r.permission_ref!==MORRIS_PERMISSION||r.published_at!==row.published_at||!Number.isSafeInteger(r.attempted_at)||r.attempted_at>now||r.actual_requests!==(r.outcome==='verified_listing'?0:1)||r.fingerprint_json!==row.title_fingerprint||r.facts_json!==row.product_facts)return false;
 let proof,fields,facts;try{proof=JSON.parse(r.proof_json);fields=JSON.parse(row.facts_provenance);facts=JSON.parse(row.product_facts);}catch{return false;}
 const listing=r.outcome==='verified_listing',proofUrl=listing?MORRIS_LISTING:row.source_url,parser=listing?MORRIS_LISTING_PARSER:MORRIS_PARSER;
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
  }else if(await reserve(store,{key,scope:'listing',url:MORRIS_LISTING,now})){
   let rr=await request(source.robotsUrl,key,'robots');
   // Reviewed 404. A newly installed robots policy is a change requiring review.
   if(rr.status!==404)throw Error('robots_changed_review');robots=robotsPolicy('',source,404);rr=null;
   await sleep(1000);let listing=await request(MORRIS_LISTING,key,'listing');
   if(listing.status!==200||!/text\/html/i.test(listing.headers.get('content-type')||''))throw Error('discovery_unavailable');
   const responseHash=await hash(listing.text);try{entries=await parseMorrisListing(listing.text,pepper,{verifiedAt:now});}finally{listing.text='';listing=null;}
   const listingProof={sourceId:'morris',sourceUrl:MORRIS_LISTING,verifiedAt:now,responseHash,parserVersion:MORRIS_LISTING_PARSER,permissionRef:MORRIS_PERMISSION,canonicalBasis:'canonical',entryCount:entries.length};
   await store.db.prepare("UPDATE news_morris_acquisition SET outcome='verified',response_hash=?,entries_json=?,proof_json=? WHERE request_key=? AND outcome='reserved' AND actual_requests=2 AND attempted_at=? AND permission_ref=?").bind(responseHash,JSON.stringify(entries),JSON.stringify(listingProof),key,now,MORRIS_PERMISSION).run();
  }else return report;
  if(!Array.isArray(entries)||entries.length>100)throw Error('listing_structure_changed');
  for(const entry of entries){
   await currentGate(store,source,now,mode,registry);
   if(!morrisArticleUrl(entry.url)||morrisUrlDate(entry.url)!==entry.publishedAt||!await validatedFingerprint(entry.fingerprint,pepper))throw Error('listing_structure_changed');
   report.candidates++;
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
   const facts=['verified','verified_listing'].includes(receipt.outcome)&&receipt.facts_json?JSON.parse(receipt.facts_json):null,eventType=facts?.kind==='guitar_event'?'guitar_event':facts?.kind==='morris_editorial'?'morris_editorial':facts?.action||'other',label=morrisLabel(facts,eventType);
   const factsProvenance=receipt.proof_json&&facts?JSON.stringify(Object.keys(facts).map(factField=>({...JSON.parse(receipt.proof_json),factField}))):null;
   const item={factsProvenance,id:await hash(entry.url),sourceId:'morris',sourceName:'Morris Guitars',sourceUrl:entry.url,normalizedUrl:entry.url,publishedAt:entry.publishedAt,feedPublishedAt:entry.publishedAt,collectedAt:new Date(now).toISOString(),category:facts?.category||'media_other',label:label||'審査待ち（一次情報の事実確認が必要）',topicKey:facts?.kind==='morris_editorial'?`morris:editorial:${entry.url}`:facts?`morris:${JSON.stringify([facts.kind,facts.product||facts.eventName,facts.eventDate,facts.endDate,facts.exhibitor||facts.performer||'',facts.action,facts.productEvent?.action||''])}`:await hash(entry.url),eventType,productFacts:facts,titleFingerprint:receipt.fingerprint_json||JSON.stringify(entry.fingerprint),publicationDecision:'PUBLISH_REVIEW',decisionReason:label?'factual_label_ready':'label_required',reviewReason:'structured_review_required'};
   // The once-only evidence is immutable; never rewrite an already-created candidate on rediscovery.
   const exists=await store.db.prepare('SELECT 1 FROM candidate_items WHERE id=?').bind(item.id).first();
   if(exists){report.duplicates++;continue;}
   if(await store.put(item)){report.pending++;if(historical&&receipt.outcome==='verified_listing')report.historicalRecovered=(report.historicalRecovered||0)+1;}else report.duplicates++;
   if(failure)throw failure;
  }
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
 }return report;
}
