import {parseShimamuraEventEvidence} from './shimamura-event-evidence.js';
import {parseTargetEvidence,targetIdentityRefinement} from './target-evidence.js';
import {parseIkebeProductEvidence} from './ikebe-product-evidence.js';
import {legalGate} from './registry.js';
import {boundedFetch,robotsPolicy,hash,optOut,BOT,DAY} from './policy.js';
import {parseShimamuraListing} from './shimamura-listing.js';
import {parseOfficialListing} from './official-listing.js';
import {parseEventArticle} from './high-value.js';
import {candidateFrom,factualLabel,factualTopicKey,allowedArticlePath} from './metadata.js';
import {sourceUrl} from './policy.js';
import {eventEndsAt} from './event.js';
import {candidateSnapshot,reviewDetail} from './operator-review.js';
import {publicationValidation} from './decision-policy.js';
import {recoverySurface,recoveryCacheKey} from './facts-readiness.js';
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);

async function gate(store,source,registry,now,row){
 if(!source)throw Error('facts_source_gate');
 const state=await store.state(source.id),controls=await store.controls();
 if(!controls.collection_enabled||legalGate(source,state,now,'production',registry,{requestMode:'operator_validation'})||!source.discoveryValid||!recoverySurface(row,source)||!sourceUrl(row.source_url,source)||sourceUrl(row.source_url,source)!==row.source_url||!allowedArticlePath(row.source_url,source)||await store.db.prepare('SELECT 1 FROM news_takedowns WHERE item_id=?').bind(row.id).first())throw Error('facts_source_gate');
 return state;
}

async function verifiedSurface(store,source,registry,row,now,pepper,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),serverRepair=false}={}){
 const surface=recoverySurface(row,source),cacheKey=recoveryCacheKey(row,source,surface,{serverRepair}),previous=await store.db.prepare('SELECT * FROM news_facts_sources WHERE source_id=?').bind(cacheKey).first();
 if(previous?.checked_at>now-DAY){if(previous.lease_until>now)throw Error('facts_recheck_busy');return previous;}
 const token=crypto.randomUUID();
 const claimed=await store.db.prepare(`INSERT INTO news_facts_sources(source_id,lease_token,lease_until,checked_at,outcome) VALUES(?,?,?,?,'in_progress')
 ON CONFLICT(source_id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until,checked_at=excluded.checked_at,outcome='in_progress',items_json=NULL,proof_json=NULL WHERE lease_until<=? AND checked_at<=?`)
 .bind(cacheKey,token,now+60000,now,now,now-DAY).run();
 if(claimed.meta.changes!==1)throw Error('facts_recheck_busy');
 let acquired=false,items=[],proof=null,outcome='facts_unavailable';
 try{
  const state=await gate(store,source,registry,now,row);
  acquired=await store.lease(source.id,now,DAY,{requestMode:'operator_validation'});if(!acquired)throw Error('facts_recheck_busy');
  const request=async(url,maxBytes)=>{
   await gate(store,source,registry,now,row);
   // The server chooses exactly two URLs, never a caller-supplied URL or redirect.
   if(![source.robotsUrl,surface.url].includes(url)||!sourceUrl(url,source)||sourceUrl(url,source)!==url)throw Error('facts_source_invalid');
   await store.publisherAttempt(source.id,now,DAY);
   const r=await boundedFetch(url,{fetcher,maxBytes,headers:{Accept:url===source.robotsUrl?'text/plain':'text/html','Cache-Control':'no-store'}});
   if([401,403,451,429].includes(r.status)||r.status>=500)throw Error('facts_http_'+r.status);
   if(url!==source.robotsUrl&&optOut(r.headers.get('x-robots-tag')||''))throw Error('facts_optout');return r;
  };
  let robotResponse=await request(source.robotsUrl,512000),robots=robotsPolicy(robotResponse.text,source,robotResponse.status),digest=await hash(robotResponse.text);robotResponse=null;
  if((state.robotsHash&&state.robotsHash!==digest)||(source.robotsHash&&source.robotsHash!==digest))throw Error('facts_robots_changed');
  if(robots.isAllowed(surface.url,BOT)!==true)throw Error('facts_robots_disallow');
  const delay=Math.max(1000,(robots.getCrawlDelay(BOT)||0)*1000);if(delay>10000)throw Error('facts_crawl_delay_review');await sleep(delay);
  let response=await request(surface.url,512000);
  if([404,410].includes(response.status))throw Error('facts_http_'+response.status);
  if(response.status!==200||!/text\/html/i.test(response.headers.get('content-type')||''))throw Error('facts_source_unavailable');
  proof={sourceId:source.id,sourceUrl:surface.url,verifiedAt:now,extractionMethod:surface.method,parserVersion:surface.parser,responseHash:await hash(response.text)};
  try{
   if(surface.method==='targeted_explicit_primary_fields')items=[{id:row.id,sourceUrl:row.source_url,...(surface.parser==='shimamura-intro-event-3'?parseShimamuraEventEvidence(response.text,source,row):parseTargetEvidence(response.text,source,row))}];
   else if(surface.method==='explicit_ikebe_product_fields')items=[{id:row.id,sourceUrl:row.source_url,...parseIkebeProductEvidence(response.text,source,row)}];
   else if(surface.method==='explicit_event_fields')items=[{id:row.id,sourceUrl:row.source_url,publishedAt:row.published_at,eventType:'guitar_event',productFacts:parseEventArticle(response.text,source,row.source_url)}];
   else{
    const entries=(source.id==='shimamura'?parseShimamuraListing(response.text,surface.url):parseOfficialListing(response.text,source)).entries;
    try{for(const entry of entries){const {item}=await candidateFrom(entry,source,robots,now,pepper);if(item)items.push({id:item.id,sourceUrl:item.sourceUrl,publishedAt:item.publishedAt,category:item.category,eventType:item.eventType,productFacts:item.productFacts?{...item.productFacts,...(['relevance_uncertain','category_mismatch'].includes(item.decisionReason)?{scopeUncertain:true}:{})}:null});}}
    finally{for(const e of entries){e.title='';e.eventTitle='';}entries.length=0;}
   }
  }finally{response.text='';response=null;}
  outcome='verified_surface';
 }catch(error){
  outcome=/^facts_/.test(error.message)?error.message:['redirect_blocked','response_too_large','listing_optout','listing_structure_changed','robots_unavailable','robots_unparseable'].includes(error.message)?'facts_'+error.message:error.name==='AbortError'||error.name==='TimeoutError'?'facts_timeout':'facts_parser_failure';
  items=[];proof=null;
 }finally{
  if(acquired){
   // Match the collector's fail-closed stop/backoff boundary, without claiming a new
   // successful source-health run. Existing publication health is not fabricated.
   if(['facts_http_401','facts_http_403','facts_http_451','facts_optout','facts_listing_optout','facts_robots_changed','facts_robots_disallow'].includes(outcome))await store.db.prepare('UPDATE source_state SET disabled=1,lease_until=0 WHERE source_id=?').bind(source.id).run();
   else if(outcome==='facts_http_429'||/^facts_http_5/.test(outcome))await store.db.prepare('UPDATE source_state SET backoff_until=MAX(backoff_until,?),lease_until=0 WHERE source_id=?').bind(now+(outcome==='facts_http_429'?DAY:6*3600000),source.id).run();
   else await store.db.prepare('UPDATE source_state SET lease_until=0 WHERE source_id=?').bind(source.id).run();
  }
  await store.db.prepare('UPDATE news_facts_sources SET lease_until=0,outcome=?,items_json=?,proof_json=? WHERE source_id=? AND lease_token=?').bind(outcome,JSON.stringify(items),proof?JSON.stringify(proof):null,cacheKey,token).run();
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
 let outcome=before.errors.includes('duplicate')?'facts_duplicate_preserved':before.valid?'facts_already_complete':'facts_not_recovered',patch=null,provenance=[];
 if(!before.valid&&!before.errors.includes('duplicate')){
  const surface=await verifiedSurface(store,source,registry,row,now,pepper,options);
  outcome=surface.outcome;
  if(outcome==='verified_surface'){
   const item=JSON.parse(surface.items_json||'[]').find(i=>i.id===row.id&&i.sourceUrl===row.source_url),proof=JSON.parse(surface.proof_json||'null');
   if(!item)outcome='facts_not_on_current_surface';
   else if(item.publishedAt!==row.published_at)outcome='facts_date_changed';
   else if(!item.productFacts)outcome='facts_not_recovered';
   else{
    const facts=item.productFacts,old=before.facts;
    const changedIdentity=old&&['brand','product','artist','performer'].some(k=>old[k]&&facts[k]!==old[k]);
    if(changedIdentity&&!targetIdentityRefinement(row,old,facts,proof))outcome='facts_identity_changed';
    else if(canonical(facts)===canonical(old)&&item.eventType===row.event_type){outcome='facts_unchanged';provenance=Object.keys(facts).map(field=>({...proof,factField:field}));provenance.push({...proof,factField:'event_type'});}
    else{
     const category=facts.category,label=factualLabel(facts,item.eventType)||row.label;
     provenance=Object.keys(facts).map(field=>({...proof,factField:field}));provenance.push({...proof,factField:'event_type'});
     patch={product_facts:JSON.stringify(facts),category,event_type:item.eventType,label,topic_key:facts.product?factualTopicKey(facts,item.eventType):row.topic_key,event_ends_at:eventEndsAt(facts)};
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
 return {id:row.id,outcome,recovered:!!patch,validation:detail.validation};
}
