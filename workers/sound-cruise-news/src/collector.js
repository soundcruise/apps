import {prepareInitialFacts} from './initial-facts.js';
import {KIKUTANI_LISTING_PARSER} from './kikutani-listing-evidence.js';
import {planAgmNews,recordAgmDeferred,AGM_DETAIL_BUDGET,AGM_DEFERRED} from './agm-backfill.js';
import {observePreparation,recordPreparationMetrics} from './preparation-metrics.js';
import {acquireAgmArticle,agmProof,agmProvenance} from './agm-acquisition.js';
import {agmArticleMetadata} from './agm-sections.js';
import {collectMorris} from './morris-collector.js';
import {parseAgmArticleEvidence} from './agm-article-evidence.js';
import {AGM_SURFACES,agmArticleUrl,discoverAgm} from './agm-sections.js';
import {parseOfficialListing} from './official-listing.js';
import {parseShimamuraListing,SHIMAMURA_LISTING_URL,LISTING_MAX_BYTES} from './shimamura-listing.js';
import { requirePepper } from './fingerprint.js';
import { SOURCES, legalGate } from './registry.js';
import { boundedFetch, sourceUrl, robotsPolicy, retryAt, hash, optOut, BOT, robotsEvidence } from './policy.js';
import { parseMetadata, candidateFrom, factualLabel } from './metadata.js';
import { healthForOutcome } from './source-health.js';
import {nextDailyCollectionAt} from './collection-clock.js';
export {nextDailyCollectionAt} from './collection-clock.js';
export async function collectSource(id,store,options={}){
 const report=await collectSourceInternal(id,store,options);
 if(options.mode==='production'&&report._primaryRobots){
  const fetcher=options.fetcher||fetch;
  try{await prepareInitialFacts(store,report,options.now||Date.now(),options.registry||SOURCES,options.pepper,{...options,cachedRobots:report._primaryRobots,
   fetcher:async(url,init)=>{report.requests++;const kind=url===report._primaryRobots.url?'robots':'article';report.requestCounts[kind]=(report.requestCounts[kind]||0)+1;try{const response=await fetcher(url,init);if(kind==='article'){report.primaryHttp??={success:0,failure:0};report.primaryHttp[response.status===200?'success':'failure']++;}return response;}catch(error){if(kind==='article'){report.primaryHttp??={success:0,failure:0};report.primaryHttp.failure++;}throw error;}}});}
  catch(error){report.initialRecovery??={};report.initialRecovery.error=/^[a-z_0-9]+$/.test(error.message)?error.message:'initial_facts_failed';console.error(JSON.stringify({event:'news_initial_facts_failed',sourceId:id,reason:report.initialRecovery.error}));}
  const state=await store.state(id),health=(await store.sourceHealth()).find(s=>s.source_id===id);if(report.initialRecovery?.evaluated&&report.outcome==='collected'&&(state.disabled||state.backoffUntil>(options.now||Date.now())||health?.status!=='healthy'))report.outcome=health?.reason_code||'source_disabled';
  if(report.runId)await store.db.prepare('UPDATE collection_runs SET requests=?,outcome=? WHERE id=?').bind(report.requests,report.outcome,report.runId).run();
 }
 delete report._primaryRobots;
 try{if(options.mode==='production'){const recovery=options.preparationMaintenance,measurement=recovery?{...report,requests:report.requests+recovery.requests,requestCounts:{...report.requestCounts,robots:(report.requestCounts?.robots||0)+recovery.requests},maintenanceOutcome:recovery.outcome}:report;await recordPreparationMetrics(store,measurement,options.now||Date.now(),options.registry||SOURCES,options.pepper);report.preparation=measurement.preparation;}}
 catch{console.error(JSON.stringify({event:'news_preparation_metrics_failed',sourceId:id}));}
 delete report.qualityObservations;return report;
}
async function collectSourceInternal(id,store,{mode='off',now=Date.now(),fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),registry=SOURCES,pepper,clock,requestMode='normal',jstDay='',auditReason='',cachedRobots=null,requireHumanReview=false}={}) {
 const started=Date.now(),source=registry.find(s=>s.id===id),state=await store.state(id);
 const agmExpanded=source?.id==='agm'&&source.agmSections===true;
 const shimListing=source?.discoveryType==='shimamura_listing',listing=shimListing||source?.discoveryType==='official_listing';
 const report={sourceId:id,requestMode,requireHumanReview,startedAt:now,requests:0,candidates:0,pending:0,rejected:0,duplicates:0,outcome:'',durationMs:0,robots:'not_requested',requestCounts:{robots:0,listing:0,feed:0}};
 const gate=legalGate(source,state,now,mode,registry,{requestMode});
 if(gate){report.outcome=gate;if(source&&!['collection_off','not_registry_source','backoff'].includes(gate))await store.recordHealth({sourceId:id,...healthForOutcome(gate,state.failures||0),checkedAt:now,nextEligibleAt:state.nextAt||0,failureCount:state.failures||0});return report;}
 if(id==='morris')return collectMorris(store,{source,now,mode,registry,pepper,fetcher,sleep,requestMode});
 if(shimListing&&(id!=='shimamura'||source.discoveryUrl!==SHIMAMURA_LISTING_URL)){report.outcome='listing_url_blocked';return report;}
 try{requirePepper(pepper);}catch{report.outcome='headline_pepper_required';await store.recordHealth({sourceId:id,status:'error',reasonCode:report.outcome,checkedAt:now});return report;}
 if(!(await store.controls()).collection_enabled){report.outcome='global_collection_off';await store.recordHealth({sourceId:id,...healthForOutcome(report.outcome),checkedAt:now});return report;}
 const intervalMs=Math.max(listing?24:6,source.crawlIntervalHours)*3600000;
 if(requestMode==='operator_validation'){
  if(!['coverage_validation','operator_recheck'].includes(auditReason))throw Error('operator_audit_required');
  await store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'manual-collection',id,now,auditReason).run();
 }
 if(!await store.lease(id,now,intervalMs,{requestMode,jstDay})){report.outcome=requestMode==='scheduled'?'scheduled_day_or_lease_busy':'lease_busy';return report;}
 let next={...state,nextAt:now+Math.max(listing?24:6,source.crawlIntervalHours)*3600000};
 const request=async(url,options={})=>{
  if(!(await store.controls()).collection_enabled)throw new Error('global_collection_off');
  if((await store.state(id)).disabled)throw new Error('access_stopped');
  if(!sourceUrl(url,source))throw new Error('url_blocked');
  if(agmExpanded&&agmArticleUrl(url,'news')&&(report.requestCounts.article||0)>=AGM_DETAIL_BUDGET)throw Error('listing_request_budget');
  if(agmExpanded&&(report.requests>=16||!(url===source.robotsUrl||AGM_SURFACES.some(s=>s.url===url)||agmArticleUrl(url,'news'))))throw Error('listing_request_budget');
  if(listing&&(report.requests>=2||![source.robotsUrl,source.discoveryUrl].includes(url)))throw Error('listing_request_budget');
  const attemptedAt=clock?clock():now+Date.now()-started;
  await store.publisherAttempt(id,attemptedAt,intervalMs);
  next.nextAt=Math.max(next.nextAt,attemptedAt+intervalMs);
  const requestKind=url===source.robotsUrl?'robots':agmExpanded&&agmArticleUrl(url,'news')?'article':listing||agmExpanded&&url.endsWith('/news/')?'listing':'feed';
  report.requests++;report.requestCounts[requestKind]=(report.requestCounts[requestKind]||0)+1;
  let response;try{response=await boundedFetch(url,{fetcher,evidenceAt:attemptedAt,...options});}catch(error){if(error.redirectEvidence)await store.recordRedirect(id,error.redirectEvidence);if(listing&&url===SHIMAMURA_LISTING_URL&&error.message==='response_too_large')throw Error('listing_too_large');if(error.name==='TimeoutError'||error.name==='AbortError')throw Error('request_timeout');throw error;}
  if([401,403,451].includes(response.status)){next.disabled=true;throw new Error('http_'+response.status);}
  if(response.status===429||response.status>=500){next.failures=(state.failures||0)+1;next.nextAt=Math.max(next.nextAt,retryAt(response.status,response.headers.get('retry-after'),next.failures,now));next.backoffUntil=next.nextAt;throw new Error(response.status===429?'rate_limited':'upstream_error');}
  if(url!==source.robotsUrl&&optOut(response.headers.get('x-robots-tag')||'')){next.disabled=true;throw new Error('header_optout');}
  return response;
 };
 try {
  const cached=cachedRobots&&['operator_validation','scheduled'].includes(requestMode)&&Number.isSafeInteger(cachedRobots.checkedAt)&&cachedRobots.checkedAt<=now&&now-cachedRobots.checkedAt<=3600000&&(await robotsEvidence(cachedRobots.text)).matches(source.robotsHash);
  const result=cached?{text:cachedRobots.text,status:200}:await request(source.robotsUrl,{maxBytes:512000});
  report.robotsCached=!!cached;
  const robots=robotsPolicy(result.text,source,result.status);const evidence=await robotsEvidence(result.text);
  if(!evidence.matches(state.robotsHash)||((listing||agmExpanded)&&!evidence.matches(source.robotsHash))){next.disabled=true;throw new Error('robots_changed_review');}
  next.robotsHash=evidence.digest;
  if(['ikebe','shimamura'].includes(id))report._primaryRobots={id,url:source.robotsUrl,text:result.text,status:result.status,checkedAt:now};
  report.robots=robots.isAllowed(source.discoveryUrl,BOT)===true?'allow':'disallow';
  if(report.robots==='disallow'){next.disabled=true;throw new Error('robots_disallow');}
  // Recognize sitemap declarations, but never follow an arbitrary listed endpoint automatically.
  report.sitemaps=robots.getSitemaps().filter(url=>sourceUrl(url,source));
  const delay=Math.max(1000,(robots.getCrawlDelay(BOT)||0)*1000);
  if(delay>60000){next.nextAt=Math.max(next.nextAt,now+delay);throw new Error('crawl_delay_review');}
  if(agmExpanded){
   report.sections=[];
   report.articleCache={hits:0,fetched:0,notModified:0,attempted:0,deferred:0};
   report.backfill={listingUrls:0,queuedUrls:0,replayedUrls:0,deferredUrls:0};
   await discoverAgm({request,robots,sleep,delay,parseFeed:parseMetadata,source,prepareNewsEntries:async entries=>{
    report.backfill.listingUrls=entries.length;
    const planned=await planAgmNews(store,source,entries,now,pepper);
    report.backfill.queuedUrls=planned.filter(e=>e.backlog).length;
    return planned;
   },acquireArticle:async listingEntry=>{
    const inspected=listingEntry.agmCacheInspection;
    if(!inspected.hit&&!inspected.attempted&&!inspected.busy&&(report.requestCounts.article||0)>=AGM_DETAIL_BUDGET){
     report.articleCache.deferred++;report.backfill.deferredUrls++;
     return {url:listingEntry.url,agmAcquired:true,agmDeferred:true,title:''};
    }
    if(listingEntry.backlog)report.backfill.replayedUrls++;
    const acquired=await acquireAgmArticle({store,source,url:listingEntry.url,listingTitle:listingEntry.title,now,pepper,
     request:async(url,options)=>{await sleep(delay);return request(url,options);},
     parse:async html=>{
      const entry=agmArticleMetadata(html,listingEntry.url),proof=agmProof(entry.url,now,await hash(html));
      let {item}=await candidateFrom(entry,source,robots,now,pepper);
      if(item&&!factualLabel(item.productFacts,item.eventType)){try{
       entry.articleRecovery={...parseAgmArticleEvidence(html,source,{source_url:entry.url,published_at:item.publishedAt,product_facts:JSON.stringify(item.productFacts)}),proof};
       ({item}=await candidateFrom(entry,source,robots,now,pepper));
      }catch{/* Missing primary evidence stays incomplete; never guess. */}}
      if(item?.productFacts)item.factsProvenance=agmProvenance(item.productFacts,proof);
      entry.title='';return {item:item||null,proof};
     }});
    report.articleCache[{hit:'hits',fetched:'fetched',not_modified:'notModified',attempted:'attempted'}[acquired.cache]]++;
    return {url:listingEntry.url,agmCachedItem:acquired.item,agmAcquired:true,title:''};
   },onSection:async(section,entries)=>{
    const part={section,requestMode:report.requestMode,requireHumanReview:report.requireHumanReview,candidates:entries.length,pending:0,rejected:0,duplicates:0};
    await persistDiscoveredEntries(entries,source,store,robots,now,pepper,registry,part);
    report.qualityObservations??=[];report.qualityObservations.push(...(part.qualityObservations||[]));
    report.sections.push(part);for(const key of ['candidates','pending','rejected','duplicates'])report[key]+=part[key];
   }});
   next.failures=0;next.lastDiscoveryAt=now;next.etag=null;next.lastModified=null;report.outcome='collected';
  }else{
  await sleep(delay);
  const headers={Accept:listing?'text/html':'application/rss+xml, application/atom+xml, application/xml, text/xml','Cache-Control':'no-store'};
  if(state.etag)headers['If-None-Match']=state.etag;
  if(state.lastModified)headers['If-Modified-Since']=state.lastModified;
  let discovery=await request(source.discoveryUrl,{headers,maxBytes:listing?LISTING_MAX_BYTES:1000000});
  if(discovery.status===304){report.outcome='not_modified';next.failures=0;next.lastDiscoveryAt=now;}
  else {
   if(discovery.status!==200)throw new Error('discovery_unavailable');
   let entries;
   if(listing){
    if(!/text\/html/i.test(discovery.headers.get('content-type')||''))throw Error('listing_structure_changed');
    if(source.id==='kikutani')discovery.responseHash=await hash(discovery.text);
    let parsed;try{parsed=shimListing?parseShimamuraListing(discovery.text,source.discoveryUrl,{since:requestMode==='operator_validation'?0:state.lastDiscoveryAt||0}):parseOfficialListing(discovery.text,source);}finally{discovery.text='';}
    entries=parsed.entries;for(const d of parsed.dispositions||[])observePreparation(report,d,{reason:d.reason});if(source.id==='kikutani'){const proof={sourceId:source.id,sourceUrl:source.discoveryUrl,verifiedAt:now,extractionMethod:'explicit_kikutani_listing_card',parserVersion:KIKUTANI_LISTING_PARSER,responseHash:discovery.responseHash};for(const entry of entries)entry.listingProof=proof;}report.candidates=parsed.cards;report.reasons=parsed.reasons;report.rejected=Object.values(parsed.reasons).reduce((a,b)=>a+b,0);
   }else{
    if(!/xml|rss|atom/i.test(discovery.headers.get('content-type')||''))throw new Error('non_metadata_response');
    entries=parseMetadata(discovery.text,source.discoveryType);report.candidates=entries.length;discovery.text='';
   }
   await persistDiscoveredEntries(entries,source,store,robots,now,pepper,registry,report);
   next.etag=discovery.headers.get('etag')?.slice(0,200)||null;next.lastModified=discovery.headers.get('last-modified')?.slice(0,100)||null;next.failures=0;next.lastDiscoveryAt=now;report.outcome='collected';discovery=null;
  }
  }
 }catch(error){
  const codes=['listing_structure_changed','listing_optout','listing_too_large','listing_url_blocked','listing_request_budget','request_timeout','global_collection_off','robots_unparseable','robots_unavailable','robots_changed_review','robots_disallow','crawl_delay_review','rate_limited','upstream_error','http_401','http_403','http_451','access_stopped','header_optout','redirect_blocked','response_too_large','discovery_unavailable','non_metadata_response','xml_unsafe','xml_invalid','metadata_format','url_blocked'];
  report.outcome=codes.includes(error.message)?error.message:'network_or_internal_error';
  if(['request_timeout','upstream_error','network_or_internal_error','non_metadata_response','metadata_format','xml_invalid','listing_structure_changed','listing_optout','listing_too_large','robots_unparseable','redirect_blocked','header_optout','robots_changed_review','robots_disallow','http_401','http_403','http_451','access_stopped'].includes(report.outcome))next.disabled=true;
  if(!['rate_limited','upstream_error'].includes(report.outcome)){next.failures=(state.failures||0)+1;next.nextAt=Math.max(next.nextAt,retryAt(500,null,next.failures,now));next.backoffUntil=next.nextAt;}
 }finally{
  await store.saveState(id,next);report.durationMs=Date.now()-started;await store.log(report);
  await store.recordHealth({sourceId:id,...healthForOutcome(report.outcome,next.failures||0),checkedAt:now,nextEligibleAt:requestMode!=='normal'&&!next.failures&&!next.disabled?nextDailyCollectionAt(now):next.nextAt||0,failureCount:next.failures||0,successfulAt:['collected','not_modified'].includes(report.outcome)?now:null});
  if(!state.disabled&&next.disabled)await store.alertSourceDisabled(id,now);
 }
 return report;
}
export async function collectAll(ids,store,options){await store.purge(options.now||Date.now());const results=[];for(const id of ids)results.push(await collectSource(id,store,options));return results;}

// Shared pending-only sink. Inputs are transient metadata, never HTML. Recheck kill/policy at the boundary.
export async function persistDiscoveredEntries(entries,source,store,robots,now,pepper,registry,report){
 try{
  if(legalGate(source,{...await store.state(source.id),nextAt:0,lastPublisherRequestAt:0},now,'local',registry))throw Error('access_stopped');
  requirePepper(pepper);
  if(source.id==='agm')await recordAgmDeferred(store,source,entries,now);
  for(const entry of entries){
   if(source.id==='agm'&&entry.agmDeferred){observePreparation(report,entry,{reason:AGM_DEFERRED});continue;}
   const {item,reason}=source.id==='agm'&&entry.agmAcquired?{item:entry.agmCachedItem,reason:'agm_evidence_unavailable'}:await candidateFrom(entry,source,robots,now,pepper);
   if(item&&entry.agmAcquired&&item.publishedAt&&(Date.parse(item.publishedAt)>now||now-Date.parse(item.publishedAt)>=90*86400000)){report.rejected++;observePreparation(report,entry,{reason:'date_outside_window'});continue;}
   if(!item){report.rejected++;report.reasons??={};report.reasons[reason]=(report.reasons[reason]||0)+1;observePreparation(report,entry,{reason});continue;}
   if(item&&report.requireHumanReview){item.publicationDecision='PUBLISH_REVIEW';item.decisionReason='maintenance_recovery_review';item.reviewReason='maintenance_recovery_review';}
   if(report.requestMode==='scheduled'){item.publicationDecision='PUBLISH_REVIEW';if(!report.requireHumanReview){item.decisionReason='collection_human_review';item.reviewReason='structured_review_required';}}
   const created=await store.put(item);if(created)report.pending++;else report.duplicates++;
   observePreparation(report,entry,{item,created});
  }
 }finally{for(const entry of entries){entry.title='';if('eventTitle' in entry)entry.eventTitle='';}entries.length=0;}
}
