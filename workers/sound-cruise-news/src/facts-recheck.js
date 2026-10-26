import {recordDiscoveryResult,discoveryState} from './discovery-work.js';
import {parsePrimaryAnnouncement,PRIMARY_ANNOUNCEMENT_PARSER,PRIMARY_ANNOUNCEMENT_PARSERS,validPrimaryAnnouncement} from './primary-announcement.js';
import {initialPrimarySource,recoveryBudget} from './recovery-budget.js';
import {parseProductFamilyEvidence,PRODUCT_FAMILY_PARSER} from './product-family-evidence.js';
import {validatedFingerprint} from './fingerprint.js';
import {morrisEvidenceReceipt,markMorrisEvidenceWait} from './morris-collector.js';
import {structuredIkebeEvidence} from './ikebe-structured-recovery.js';
import {recoverOfficialIdentity,validOfficialIdentity} from './official-identity.js';
import {parseShimamuraReviewEvidence} from './shimamura-review-evidence.js';
import {parseSourcePolicyEvidence} from './source-policy-evidence.js';
import {parseIkebeInformationalEvidence,productArticleIdentityRefinement} from './product-article-evidence.js';
import {parseShimamuraProductEvidence,validatedShimamuraProductFacts,SHIMAMURA_PRODUCT_PARSERS} from './shimamura-product-evidence.js';
import {parseNamedWorkshopEvidence} from './named-workshop-evidence.js';
import {parseGuitarExhibition} from './guitar-exhibition-evidence.js';
import {acquireAgmArticle,inspectAgmArticle,agmProof,agmProvenance} from './agm-acquisition.js';
import {fingerprint} from './fingerprint.js';
import {AGM_SECTIONS,agmArticleUrl} from './agm-sections.js';
import {parseAgmArticleEvidence,agmEvidenceMetadata} from './agm-article-evidence.js';
import {parseShimamuraEventEvidence} from './shimamura-event-evidence.js';
import {parseTargetEvidence,targetIdentityRefinement} from './target-evidence.js';
import {parseIkebeProductEvidence,ikebeIdentityRefinement,IKEBE_PRODUCT_PARSER} from './ikebe-product-evidence.js';
import {healthForOutcome} from './source-health.js';
import {legalGate} from './registry.js';
import {boundedFetch,robotsPolicy,hash,optOut,BOT,DAY,robotsEvidence,retryAt} from './policy.js';
import {parseShimamuraListing} from './shimamura-listing.js';
import {parseOfficialListing} from './official-listing.js';
import {parseEventArticle} from './high-value.js';
import {candidateFrom,factualLabel,factualTopicKey,allowedArticlePath} from './metadata.js';
import {sourceUrl} from './policy.js';
import {eventEndsAt} from './event.js';
import {candidateSnapshot,reviewDetail} from './operator-review.js';
import {publicationValidation} from './decision-policy.js';
import {recoverySurface,recoveryCacheKey,resolvedRecoverySurface} from './facts-readiness.js';
// A validated, versioned fact projection can outlive the one-day transport cache.
// It never reconstructs discarded HTML or supplies missing facts.
export async function reusablePrimaryEvidence(previous,row,source,now){
 if(!initialPrimarySource(source)||previous?.outcome!=='verified_surface'||previous.lease_until>now)return false;
 try{const p=JSON.parse(previous.proof_json),items=JSON.parse(previous.items_json),f=items[0]?.productFacts;
 const typed=p.extractionMethod==='explicit_primary_announcement_fields'&&PRIMARY_ANNOUNCEMENT_PARSERS.includes(p.parserVersion)&&validPrimaryAnnouncement(f)&&(f.announcement.action!=='release_notice'||p.parserVersion!=='primary-announcement-1')||p.extractionMethod==='explicit_shimamura_product_fields'&&source.id==='shimamura'&&SHIMAMURA_PRODUCT_PARSERS.includes(p.parserVersion)&&validatedShimamuraProductFacts(f);
 return !!typed&&p.sourceId===source.id&&p.sourceUrl===row.source_url&&p.publishedAt===row.published_at&&PRIMARY_ANNOUNCEMENT_PARSERS.includes(p.pipelineVersion)&&p.evidenceKey===await hash(row.title_fingerprint||'')&&Number.isSafeInteger(p.verifiedAt)&&p.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(p.responseHash)&&items.length===1&&items[0].id===row.id&&items[0].sourceUrl===row.source_url&&items[0].publishedAt===row.published_at;
 }catch{return false;}
}
// Recheck receipts retain facts/proofs for the existing 90-day lifetime even
// after the short transport cache is purged. Never rebuild publisher text.
export async function retainedPrimaryEvidence(store,row,source,now){
 if(!initialPrimarySource(source))return null;
 const receipt=await store.db.prepare("SELECT * FROM news_facts_rechecks WHERE candidate_id=? AND provenance_json<>'[]' ORDER BY checked_at DESC,rowid DESC LIMIT 1").bind(row.id).first();
 try{const fields=JSON.parse(receipt?.provenance_json||'[]'),proof=fields[0],patch=JSON.parse(receipt?.patch_json||'null');
  if(!proof||proof.sourceId!==source.id||proof.sourceUrl!==row.source_url||proof.publishedAt!==row.published_at||!PRIMARY_ANNOUNCEMENT_PARSERS.includes(proof.pipelineVersion)||proof.evidenceKey!==await hash(row.title_fingerprint||'')||!/^[a-f0-9]{64}$/.test(proof.responseHash||'')||!Number.isSafeInteger(proof.verifiedAt)||proof.verifiedAt>now)return null;
  const base={checked_at:receipt.checked_at,lease_until:0,proof_json:JSON.stringify(proof)};
  if(proof.failureReason)return {...base,outcome:'facts_primary_evidence_unchanged',items_json:'[]'};
  const facts=JSON.parse(patch?.product_facts||'null');if(!(validPrimaryAnnouncement(facts)||validatedShimamuraProductFacts(facts))||![...Object.keys(facts),'event_type'].every(k=>fields.some(p=>p.factField===k&&p.responseHash===proof.responseHash&&(PRIMARY_ANNOUNCEMENT_PARSERS.includes(p.parserVersion)&&p.extractionMethod==='explicit_primary_announcement_fields'||SHIMAMURA_PRODUCT_PARSERS.includes(p.parserVersion)&&p.extractionMethod==='explicit_shimamura_product_fields'))))return null;
  const candidate={...base,outcome:'verified_surface',items_json:JSON.stringify([{id:row.id,sourceUrl:row.source_url,publishedAt:row.published_at,eventType:patch.event_type,productFacts:facts}])};
  return await reusablePrimaryEvidence(candidate,row,source,now)?candidate:null;
 }catch{return null;}
}
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);

async function gate(store,source,registry,now,row){
 if(!source)throw Error('facts_source_gate');
 const state=await store.state(source.id),controls=await store.controls();
 if(!controls.collection_enabled||legalGate(source,state,now,'production',registry,{requestMode:'operator_validation'})||!source.discoveryValid||!recoverySurface(row,source)||!sourceUrl(row.source_url,source)||sourceUrl(row.source_url,source)!==row.source_url||!allowedArticlePath(row.source_url,source)||await store.db.prepare('SELECT 1 FROM news_takedowns WHERE item_id=?').bind(row.id).first())throw Error('facts_source_gate');
 return state;
}

function agmSurface(cached,row){const i=cached.item;return i?{outcome:'verified_surface',items_json:JSON.stringify([{id:row.id,sourceUrl:i.sourceUrl,publishedAt:i.publishedAt,eventType:i.eventType,productFacts:i.productFacts}]),proof_json:JSON.stringify(cached.proof)}:{outcome:'facts_not_recovered',items_json:'[]',proof_json:null};}

export async function verifiedSurface(store,source,registry,row,now,pepper,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),serverRepair=false,forceRevalidate=false,cachedRobots=null,robotCache=null,onPrimaryResponse=null,dailyOnly=false}={}){
 if(source.id==='morris'){
  await gate(store,source,registry,now,row);const receipt=await morrisEvidenceReceipt(store,row.source_url,now);
  if(!['verified','verified_listing'].includes(receipt?.outcome)||!receipt.facts_json||!await validatedFingerprint(receipt.fingerprint_json,pepper))return {outcome:'facts_not_on_current_surface',items_json:'[]',proof_json:null};
  const facts=JSON.parse(receipt.facts_json),eventType=facts.kind==='guitar_event'?'guitar_event':facts.kind==='morris_notice'?'morris_notice':facts.kind==='morris_editorial'?'morris_editorial':facts.action||'other';
  return {outcome:'verified_surface',items_json:JSON.stringify([{id:row.id,sourceUrl:row.source_url,publishedAt:receipt.published_at,eventType,productFacts:facts,titleFingerprint:receipt.fingerprint_json}]),proof_json:JSON.stringify({...JSON.parse(receipt.proof_json),recoveryAnalysis:undefined})};
 }
 if(source.id==='agm'){
  await gate(store,source,registry,now,row);
  const cached=await inspectAgmArticle(store,source,row.source_url,now,pepper,{expectedPublishedAt:row.published_at,forceRevalidate});
  if(cached.busy)throw Error('facts_recheck_busy');
  if(cached.hit)return agmSurface(cached.payload,row);
  if(cached.attempted&&!forceRevalidate)return {outcome:'facts_not_recovered',items_json:'[]',proof_json:null};
 }
 const surface=await resolvedRecoverySurface(store,row,source),cacheKey=recoveryCacheKey(row,source,surface,{serverRepair});let previous=await store.db.prepare('SELECT * FROM news_facts_sources WHERE source_id=?').bind(cacheKey).first();
 previous??=await retainedPrimaryEvidence(store,row,source,now);
 const work=await store.db.prepare('SELECT * FROM news_discovery_work WHERE source_id=? AND normalized_url=?').bind(source.id,row.source_url).first();
 if(!previous&&work?.evidence_json){try{const e=JSON.parse(work.evidence_json);previous={checked_at:e.proof.verifiedAt,lease_until:0,outcome:e.outcome,items_json:JSON.stringify(e.items),proof_json:JSON.stringify(e.proof)};}catch{}}
 const evidenceKey=await hash(row.title_fingerprint||'');
 const previousProof=(()=>{try{return JSON.parse(previous?.proof_json||'null');}catch{return null;}})();
 if(await reusablePrimaryEvidence(previous,row,source,now))return previous;
 if(initialPrimarySource(source)&&previousProof?.sourceId===source.id&&previousProof?.sourceUrl===row.source_url&&/^[a-f0-9]{64}$/.test(previousProof?.responseHash||'')&&previousProof?.failureReason&&previousProof.pipelineVersion===PRIMARY_ANNOUNCEMENT_PARSER&&previousProof.evidenceKey===evidenceKey)return {...previous,outcome:'facts_primary_evidence_unchanged'};
 const budget=await recoveryBudget(store,source,now),freshSince=initialPrimarySource(source)?budget.since-1:now-DAY;
 if(previous?.checked_at>freshSince){if(previous.lease_until>now)throw Error('facts_recheck_busy');return previous;}
 if(dailyOnly&&initialPrimarySource(source)&&work)return {outcome:'facts_daily_budget_deferred',items_json:'[]',proof_json:null};
 // Parser-version keys are not permission to fetch the same article twice today.
 if(initialPrimarySource(source)){
  const sameUrl=await store.db.prepare("SELECT * FROM news_facts_sources WHERE instr(source_id,?)=1 AND checked_at>=? AND (substr(source_id,-?)=? OR json_extract(CASE WHEN json_valid(proof_json) THEN proof_json ELSE '{}' END,'$.sourceUrl')=?) ORDER BY checked_at DESC LIMIT 1").bind(source.id+':',budget.since,row.id.length+1,':'+row.id,row.source_url).first();
  if(sameUrl){if(sameUrl.lease_until>now)throw Error('facts_recheck_busy');return sameUrl.outcome==='verified_surface'?sameUrl:{outcome:'facts_daily_budget_deferred',items_json:'[]',proof_json:null};}
 }
 if(initialPrimarySource(source)&&budget.used>=budget.limit)return {outcome:'facts_daily_budget_deferred',items_json:'[]',proof_json:null};
 const token=crypto.randomUUID();
 const claimed=await store.db.prepare(`INSERT INTO news_facts_sources(source_id,lease_token,lease_until,checked_at,outcome) SELECT ?,?,?,?,'in_progress' WHERE NOT ? OR (SELECT COUNT(*) FROM news_facts_sources WHERE (source_id=? OR instr(source_id,?)=1) AND checked_at>=?)<?
 ON CONFLICT(source_id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until,checked_at=excluded.checked_at,outcome='in_progress',items_json=NULL,proof_json=NULL WHERE lease_until<=? AND checked_at<=?`)
 .bind(cacheKey,token,now+60000,now,+initialPrimarySource(source),initialPrimarySource(source)?'':source.id,source.id+':',budget.since,budget.limit,now,freshSince).run();
 if(claimed.meta.changes!==1)throw Error('facts_recheck_busy');
 let acquired=false,items=[],proof=null,outcome='facts_unavailable',publisherBackoff=0;
 try{
  const state=await gate(store,source,registry,now,row);
  acquired=await store.lease(source.id,now,DAY,{requestMode:'operator_validation'});if(!acquired)throw Error('facts_recheck_busy');
  const request=async(url,maxBytes,headers={})=>{
   await gate(store,source,registry,now,row);
   // The server chooses exactly two URLs, never a caller-supplied URL or redirect.
   if(![source.robotsUrl,surface.url].includes(url)||!sourceUrl(url,source)||sourceUrl(url,source)!==url)throw Error('facts_source_invalid');
   await store.publisherAttempt(source.id,now,DAY);
   let r;try{r=await boundedFetch(url,{fetcher,maxBytes,headers:{Accept:url===source.robotsUrl?'text/plain':'text/html','Cache-Control':'no-store',...headers}});}catch(error){if(error.redirectEvidence){await store.recordRedirect(source.id,error.redirectEvidence);publisherBackoff=error.redirectEvidence.retryAfterAt||0;if(publisherBackoff>now)await store.db.prepare('UPDATE source_state SET backoff_until=MAX(backoff_until,?) WHERE source_id=?').bind(publisherBackoff,source.id).run();}throw error;}
   if(r.status===429||r.status>=500)publisherBackoff=retryAt(r.status,r.headers.get('retry-after'),0,now);
   if([401,403,451,429].includes(r.status)||r.status>=500)throw Error('facts_http_'+r.status);
   if(url!==source.robotsUrl&&optOut(r.headers.get('x-robots-tag')||''))throw Error('facts_optout');return r;
  };
  cachedRobots??=initialPrimarySource(source)?robotCache?.get(source.id):null;
  const useCached=cachedRobots?.id===source.id&&cachedRobots.checkedAt<=now&&now-cachedRobots.checkedAt<3600000;
  let robotResponse=useCached?{text:cachedRobots.text,status:cachedRobots.status??200}:await request(source.robotsUrl,512000),robots=robotsPolicy(robotResponse.text,source,robotResponse.status),evidence=await robotsEvidence(robotResponse.text);robotCache?.set(source.id,{id:source.id,url:source.robotsUrl,text:robotResponse.text,status:robotResponse.status,checkedAt:now});robotResponse=null;
  if(!evidence.matches(state.robotsHash)||!evidence.matches(source.robotsHash))throw Error('facts_robots_changed');
  if(robots.isAllowed(surface.url,BOT)!==true)throw Error('facts_robots_disallow');
  const delay=Math.max(1000,(robots.getCrawlDelay(BOT)||0)*1000);if(delay>10000)throw Error('facts_crawl_delay_review');await sleep(delay);
  if(source.id==='agm'&&surface.method==='explicit_agm_article_fields'){
   const acquired=await acquireAgmArticle({store,source,url:row.source_url,now,pepper,expectedPublishedAt:row.published_at,forceRevalidate,
    request:(url,options)=>request(url,options.maxBytes,options.headers),
    parse:async html=>{
     const parsed=parseAgmArticleEvidence(html,source,row),proof=agmProof(row.source_url,now,await hash(html));
     const section=AGM_SECTIONS.find(s=>agmArticleUrl(row.source_url,s)),meta=agmEvidenceMetadata(html,row.source_url,section),fp=await fingerprint(meta.title,pepper);
     return {proof,listingFingerprint:fp,item:{id:row.id,sourceId:'agm',sourceName:source.name,sourceUrl:row.source_url,normalizedUrl:row.normalized_url,publishedAt:parsed.publishedAt,
      category:parsed.category,label:factualLabel(parsed.productFacts,parsed.eventType),topicKey:row.topic_key,collectedAt:row.collected_at,eventType:parsed.eventType,productFacts:parsed.productFacts,
      factsProvenance:agmProvenance(parsed.productFacts,proof),titleFingerprint:JSON.stringify(fp),feedPublishedAt:row.feed_published_at,publicationDecision:'PUBLISH_REVIEW',decisionReason:'agm_editorial_review',reviewReason:'agm_editorial_review'}};
    }});
   const result=agmSurface(acquired,row);outcome=result.outcome;items=JSON.parse(result.items_json);proof=JSON.parse(result.proof_json||'null');return result;
  }
  let response=await request(surface.url,surface.method==='explicit_agm_article_fields'?1000000:512000);
  if([404,410].includes(response.status))throw Error('facts_http_'+response.status);
  if(response.status!==200||!/text\/html/i.test(response.headers.get('content-type')||''))throw Error('facts_source_unavailable');
  if(onPrimaryResponse)await onPrimaryResponse(response.text,row,source);
  proof={sourceId:source.id,sourceUrl:surface.url,verifiedAt:now,extractionMethod:surface.method,parserVersion:surface.parser,responseHash:await hash(response.text),...(initialPrimarySource(source)?{pipelineVersion:PRIMARY_ANNOUNCEMENT_PARSER,evidenceKey,publishedAt:row.published_at}:{})};
  try{
   if(surface.method==='targeted_explicit_primary_fields')items=[{id:row.id,sourceUrl:row.source_url,...(surface.parser==='shimamura-intro-event-3'?parseShimamuraEventEvidence(response.text,source,row):parseTargetEvidence(response.text,source,row))}];
   else if(surface.method==='explicit_shimamura_product_fields'){
    let parsed;try{parsed=parseShimamuraProductEvidence(response.text,source,row);}catch(error){
     if(error.message!=='facts_identity_changed')throw error;
     const officialIdentity=await recoverOfficialIdentity(store,response.text,row,now,{fetcher,sleep});
     parsed=parseShimamuraProductEvidence(response.text,source,row,{officialIdentity});
    }
    items=[{id:row.id,sourceUrl:row.source_url,...parsed}];
   }
   else if(surface.method==='explicit_named_workshop_fields')items=[{id:row.id,sourceUrl:row.source_url,...parseNamedWorkshopEvidence(response.text,source,row)}];
   else if(surface.method==='explicit_agm_article_fields')items=[{id:row.id,sourceUrl:row.source_url,...parseAgmArticleEvidence(response.text,source,row)}];
   else if(surface.method==='explicit_source_policy_fields')items=[{id:row.id,sourceUrl:row.source_url,...parseSourcePolicyEvidence(response.text,source,row)}];
   else if(surface.method==='explicit_product_article_fields'){
    if(source.id==='shimamura'){items=[{id:row.id,sourceUrl:row.source_url,...parseShimamuraReviewEvidence(response.text,source,row)}];}else{
    let parsed;
    try{parsed=parseIkebeInformationalEvidence(response.text,source,row);}catch(error){
     // Preserve the established event route using the same bounded response. A launch
     // can never become an informational article merely because it failed validation.
     if(error.message!=='facts_scope_uncertain'||row.event_type==='product_article')throw error;
     try{parsed=parseIkebeProductEvidence(response.text,source,row);}catch(error){if(!['facts_scope_uncertain','facts_identity_changed'].includes(error.message))throw error;parsed=structuredIkebeEvidence(response.text,row);}
     proof.extractionMethod='explicit_ikebe_product_fields';proof.parserVersion=IKEBE_PRODUCT_PARSER;
    }
    items=[{id:row.id,sourceUrl:row.source_url,...parsed}];
    }
   }
   else if(surface.method==='explicit_ikebe_product_fields'){let parsed;try{parsed=parseIkebeProductEvidence(response.text,source,row);}catch(error){if(!['facts_scope_uncertain','facts_identity_changed'].includes(error.message))throw error;parsed=structuredIkebeEvidence(response.text,row);}items=[{id:row.id,sourceUrl:row.source_url,...parsed}];}
   else if(surface.method==='explicit_guitar_exhibition_fields')items=[{id:row.id,sourceUrl:row.source_url,...parseGuitarExhibition(response.text,source,row)}];
   else if(surface.method==='explicit_event_fields')items=[{id:row.id,sourceUrl:row.source_url,publishedAt:row.published_at,eventType:'guitar_event',productFacts:parseEventArticle(response.text,source,row.source_url)}];
   else{
    const entries=(source.id==='shimamura'?parseShimamuraListing(response.text,surface.url):parseOfficialListing(response.text,source)).entries;
    try{for(const entry of entries){const {item}=await candidateFrom(entry,source,robots,now,pepper);if(item)items.push({id:item.id,sourceUrl:item.sourceUrl,publishedAt:item.publishedAt,category:item.category,eventType:item.eventType,productFacts:item.productFacts?{...item.productFacts,...(['relevance_uncertain','category_mismatch'].includes(item.decisionReason)?{scopeUncertain:true}:{})}:null});}}
    finally{for(const e of entries){e.title='';e.eventTitle='';}entries.length=0;}
   }
  }catch(error){
   if(!['facts_scope_uncertain','facts_identity_changed','facts_event_missing','facts_parser_failure','facts_date_changed'].includes(error.message)||!['ikebe','shimamura'].includes(source.id))throw error;
   proof.parserFailures=[{parser:surface.parser,reason:error.message}];
   let parsed;try{parsed=parseProductFamilyEvidence(response.text,source,row);proof.extractionMethod='explicit_product_family_fields';proof.parserVersion=PRODUCT_FAMILY_PARSER;}catch(familyError){proof.parserFailures.push({parser:PRODUCT_FAMILY_PARSER,reason:/^facts_[a-z_]+$/.test(familyError.message)?familyError.message:'facts_parser_failure'});parsed=parsePrimaryAnnouncement(response.text,source,row);proof.extractionMethod='explicit_primary_announcement_fields';proof.parserVersion=PRIMARY_ANNOUNCEMENT_PARSER;}
   items=[{id:row.id,sourceUrl:row.source_url,...parsed}];
  }finally{response.text='';response=null;}
  outcome='verified_surface';
 }catch(error){
  outcome=/^facts_/.test(error.message)?error.message:['redirect_blocked','response_too_large','listing_optout','listing_structure_changed','robots_unavailable','robots_unparseable'].includes(error.message)?'facts_'+error.message:error.name==='AbortError'||error.name==='TimeoutError'?'facts_timeout':'facts_parser_failure';
  items=[];if(proof){const d=error.primaryDiagnostics,fields=d?.stage==='facts_schema'&&Array.isArray(d.missingFields)?d.missingFields.filter(v=>typeof v==='string'&&/^[A-Za-z_]{1,60}$/.test(v)).slice(0,24):[];proof={...proof,failureReason:outcome,...(fields.length?{diagnostics:{stage:'facts_schema',missingFields:fields}}:{})};}
 }finally{
  if(acquired){
   // Match the collector's fail-closed stop/backoff boundary, without claiming a new
   // successful source-health run. Existing publication health is not fabricated.
   if(['facts_http_401','facts_http_403','facts_http_451','facts_optout','facts_listing_optout','facts_robots_changed','facts_robots_disallow'].includes(outcome))await store.db.prepare('UPDATE source_state SET disabled=1,lease_until=0 WHERE source_id=?').bind(source.id).run();
   else if(outcome==='facts_http_429'||/^facts_http_5/.test(outcome))await store.db.prepare('UPDATE source_state SET backoff_until=MAX(backoff_until,?),lease_until=0 WHERE source_id=?').bind(Math.max(publisherBackoff,now+(outcome==='facts_http_429'?DAY:6*3600000)),source.id).run();
   else await store.db.prepare('UPDATE source_state SET lease_until=0 WHERE source_id=?').bind(source.id).run();
   const healthCode=({'facts_http_401':'http_401','facts_http_403':'http_403','facts_http_451':'http_451','facts_http_429':'rate_limited','facts_robots_changed':'robots_changed_review','facts_robots_disallow':'robots_disallow','facts_optout':'header_optout','facts_redirect_blocked':'maintenance_redirect'})[outcome]||(/^facts_http_5/.test(outcome)?'upstream_error':null);
   if(healthCode)await store.recordHealth({sourceId:source.id,...healthForOutcome(healthCode),checkedAt:now,nextEligibleAt:Math.max(publisherBackoff,now+DAY)});
  }
  await store.db.prepare('UPDATE news_facts_sources SET lease_until=0,outcome=?,items_json=?,proof_json=? WHERE source_id=? AND lease_token=?').bind(outcome,JSON.stringify(items),proof?JSON.stringify(proof):null,cacheKey,token).run();
  if(initialPrimarySource(source)&&proof)await discoveryState(store,source.id,row.source_url,now,{state:outcome==='verified_surface'?'evidence_insufficient':'parser_failed',reason:outcome,nextAction:outcome==='verified_surface'?'evaluate':'new_parser_or_evidence',parserVersion:PRIMARY_ANNOUNCEMENT_PARSER,evidenceRef:proof.responseHash,diagnostics:{stage:'facts',missingFields:proof.diagnostics?.missingFields||[]},evidence:{outcome,items,proof}});
 }
 return await store.db.prepare('SELECT * FROM news_facts_sources WHERE source_id=?').bind(cacheKey).first();
}

export async function recheckFacts(store,input,now,registry,pepper,actor,options={}){
 if(!actor||!['human_operator','system_repair','system_recheck','fixture'].includes(actor.type)||!/^[a-zA-Z0-9:_-]{1,128}$/.test(actor.id||''))throw Error('facts_actor_invalid');
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['id','snapshot','revision','requestId'].includes(k))||!/^[a-zA-Z0-9_-]{1,128}$/.test(input.id||'')||!/^([a-f0-9]{64})$/.test(input.snapshot||'')||!Number.isSafeInteger(input.revision)||input.revision<0||!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId||''))throw Error('facts_request_invalid');
 const payloadHash=await hash(canonical({input,actor}));
 const replay=await store.db.prepare('SELECT * FROM news_facts_rechecks WHERE request_id=?').bind(input.requestId).first();
 if(replay){if(replay.request_payload_hash!==payloadHash)throw Error('idempotency_payload_changed');return {id:replay.candidate_id,outcome:replay.outcome,recovered:!!replay.patch_json,replayed:true};}
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();
 if(!row)throw Error('candidate_not_found');if(!['pending','reopened'].includes(row.review_status)||row.origin==='legacy_fixture_backfill')throw Error('already_decided');
 if(row.review_revision!==input.revision||await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 if(options.serverRepair&&(actor.type!=='system_repair'||row.source_id!=='ikebe-event'||row.source_url!=='https://www.ikebe-gakki.com/blog/20261021-aco-workshop/'))throw Error('facts_server_repair_denied');
 const source=registry.find(s=>s.id===row.source_id);await gate(store,source,registry,now,row);
 const before=await publicationValidation(store,row,now,registry,pepper);
 // Already valid and duplicate candidates need no publisher traffic or rewrite.
 let outcome=before.errors.includes('duplicate')?'facts_duplicate_preserved':before.valid?'facts_already_complete':'facts_not_recovered',patch=null,provenance=[],diagnostics=null;
 if((!before.valid||options.refreshComplete===true&&actor.type==='system_repair')&&!before.errors.includes('duplicate')){
  const surface=await verifiedSurface(store,source,registry,row,now,pepper,options);
  outcome=surface.outcome;
  if(surface.proof_json&&initialPrimarySource(source)){try{const failure=JSON.parse(surface.proof_json);if(failure?.failureReason){provenance=[{...failure,factField:'_extraction_failure'}];diagnostics=failure.diagnostics||null;}}catch{}}
  if(outcome==='verified_surface'){
   const item=JSON.parse(surface.items_json||'[]').find(i=>i.id===row.id&&i.sourceUrl===row.source_url),proof=JSON.parse(surface.proof_json||'null');
   if(!item)outcome='facts_not_on_current_surface';
   else if(item.publishedAt!==row.published_at)outcome='facts_date_changed';
   else if(!item.productFacts)outcome='facts_not_recovered';
   else{
    const facts=item.productFacts,old=before.facts;
    const changedIdentity=old&&['brand','product','artist','performer','person'].some(k=>old[k]&&facts[k]!==old[k]);
    if(changedIdentity&&!validOfficialIdentity(facts.officialIdentity,row.source_url,facts.brand,facts.product)&&!targetIdentityRefinement(row,old,facts,proof)&&!ikebeIdentityRefinement(row,old,facts,proof)&&!productArticleIdentityRefinement(row,old,facts,proof))outcome='facts_identity_changed';
    else if(canonical(facts)===canonical(old)&&item.eventType===row.event_type){outcome='facts_unchanged';provenance=Object.keys(facts).map(field=>({...proof,factField:field}));provenance.push({...proof,factField:'event_type'});
     if(before.errors.includes('facts_provenance_invalid')){patch={product_facts:JSON.stringify(facts),category:facts.category,event_type:item.eventType,label:factualLabel(facts,item.eventType)||row.label,topic_key:row.topic_key,event_ends_at:eventEndsAt(facts)};outcome='facts_provenance_recovered';}}

    else{
     const category=facts.category,label=factualLabel(facts,item.eventType)||row.label;
     provenance=Object.keys(facts).map(field=>({...proof,factField:field}));provenance.push({...proof,factField:'event_type'});
     patch={...(source.id==='morris'?{title_fingerprint:item.titleFingerprint}:{}),product_facts:JSON.stringify(facts),category,event_type:item.eventType,label,topic_key:source.id==='morris'?row.topic_key:facts.product?factualTopicKey(facts,item.eventType):row.topic_key,event_ends_at:eventEndsAt(facts)};
     outcome='facts_recovered';
    }
   }
  }
 }
 await gate(store,source,registry,now,row);
 const columns=Object.keys(row),cas=columns.map(k=>`${k} IS ?`).join(' AND ');
 const statement=store.db.prepare(`INSERT INTO news_facts_rechecks(request_id,request_payload_hash,candidate_id,checked_at,outcome,provenance_json,patch_json)
 SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM candidate_items WHERE ${cas} AND review_status IN ('pending','reopened'))
 AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1)
 AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR publication_blocked=1 OR takedown=1 OR backoff_until>? OR (failures>0 AND next_at>?)))
 AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?)`)
 .bind(input.requestId,payloadHash,row.id,now,outcome,JSON.stringify(provenance),patch?JSON.stringify(patch):null,...columns.map(k=>row[k]),source.id,now,now,row.id);
 let result;try{result=await statement.run();}catch{
  const saved=await store.db.prepare('SELECT * FROM news_facts_rechecks WHERE request_id=?').bind(input.requestId).first();
  if(saved&&saved.request_payload_hash===payloadHash)return {id:saved.candidate_id,outcome:saved.outcome,recovered:!!saved.patch_json,replayed:true};throw Error('facts_transaction_failed');
 }
 if(!await store.db.prepare('SELECT request_id FROM news_facts_rechecks WHERE request_id=? AND request_payload_hash=?').bind(input.requestId,payloadHash).first())throw Error('candidate_changed');
 const detail=await reviewDetail(store,row.id,now,registry,pepper);
 await recordDiscoveryResult(store,source,{url:row.source_url},now,{row:await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first(),validation:detail.validation,result:{outcome,diagnostics}});
 return {id:row.id,outcome,recovered:!!patch,validation:detail.validation,...(diagnostics?{diagnostics}:{})};
}

// Reuse the receipt-only Morris branch and the normal publication validator.
// This operational READY marker is neither a publication nor a human verdict.
export async function reconcileMorrisReady(store,now,registry,pepper){
 const report={ready:0,recovered:0,needsConfirmation:0,excluded:0,items:[]};
 const rows=(await store.db.prepare("SELECT * FROM candidate_items WHERE source_id='morris' AND review_status IN ('pending','reopened')").all()).results;
 for(const row of rows){
  if(await store.db.prepare('SELECT 1 FROM news_decision_ledger WHERE candidate_id=?').bind(row.id).first()){report.excluded++;continue;}
  const before=await publicationValidation(store,row,now,registry,pepper);
  if(before.errors.some(e=>!['facts_incomplete','facts_provenance_invalid'].includes(e))){report.excluded++;continue;}
  if(before.valid&&before.facts?.evidence==='morris_human_primary_v1'){report.ready++;continue;}
  const receipt=await morrisEvidenceReceipt(store,row.source_url,now);
  if(!receipt?.facts_json||!['verified','verified_listing'].includes(receipt.outcome)){await markMorrisEvidenceWait(store,row,now);report.needsConfirmation++;report.items.push({id:row.id,state:'NEEDS_CONFIRMATION',reason:'SAVED_PRIMARY_FACTS_MISSING'});continue;}
  const lifecycle=await store.db.prepare('SELECT * FROM news_pending_lifecycle WHERE candidate_id=?').bind(row.id).first();
  if(before.valid&&lifecycle?.recheck_status==='RECOVERED_READY'&&lifecycle.assessed_revision===row.review_revision){report.ready++;continue;}
  const requestId='morris-auto-'+row.id+'-'+row.review_revision+'-'+(await hash(receipt.proof_json||'')).slice(0,8);
  const result=await recheckFacts(store,{id:row.id,revision:row.review_revision,snapshot:await candidateSnapshot(row),requestId},now,registry,pepper,{type:'system_recheck',id:'morris-auto-recovery'});
  const current=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first(),v=await publicationValidation(store,current,now,registry,pepper);
  if(!v.valid){if(v.errors.some(e=>!['facts_incomplete','facts_provenance_invalid'].includes(e)))report.excluded++;else report.needsConfirmation++;continue;}
  const previous=await store.db.prepare('SELECT * FROM news_pending_lifecycle WHERE candidate_id=?').bind(row.id).first();
  const history=JSON.stringify([...JSON.parse(previous?.history_json||'[]'),{at:now,actor:'system_recovery',result:'RECOVERED_READY',revision:current.review_revision,requestId}].slice(-20)),columns=Object.keys(current);
  const saved=await store.db.prepare(`INSERT INTO news_pending_lifecycle(candidate_id,last_rechecked_at,assessed_revision,next_recheck_at,recheck_status,last_recheck_result,recheck_policy_version,history_json)
   SELECT ?,?,?,NULL,'RECOVERED_READY','morris_system_recovery','pending-recheck-1',? WHERE EXISTS(SELECT 1 FROM candidate_items WHERE ${columns.map(k=>k+' IS ?').join(' AND ')} AND review_status IN ('pending','reopened'))
   AND NOT EXISTS(SELECT 1 FROM news_decision_ledger WHERE candidate_id=?)
   AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1 AND publication_enabled=1)
   AND EXISTS(SELECT 1 FROM source_state WHERE source_id='morris' AND disabled=0 AND publication_blocked=0 AND takedown=0 AND backoff_until<=?)
   AND EXISTS(SELECT 1 FROM source_health WHERE source_id='morris' AND status='healthy' AND last_successful_run_at=?)
   AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?)
   ON CONFLICT(candidate_id) DO UPDATE SET last_rechecked_at=excluded.last_rechecked_at,assessed_revision=excluded.assessed_revision,next_recheck_at=NULL,recheck_status=excluded.recheck_status,last_recheck_result=excluded.last_recheck_result,unresolved_reason=NULL,history_json=excluded.history_json
   WHERE news_pending_lifecycle.lease_until<=? AND news_pending_lifecycle.history_json=?`)
  .bind(row.id,now,current.review_revision,history,...columns.map(k=>current[k]),row.id,now,v.healthSuccessfulAt,row.id,now,previous?.history_json||'[]').run();
  if(saved.meta.changes!==1)continue;
  report.ready++;report.recovered+=result.recovered?1:0;report.items.push({id:row.id,state:'READY_FOR_HUMAN_DECISION',actor:'system_recovery'});
 }
 return report;
}
