import {parseShimamuraListing,SHIMAMURA_LISTING_URL,LISTING_MAX_BYTES} from './shimamura-listing.js';
import { requirePepper } from './fingerprint.js';
import { SOURCES, legalGate } from './registry.js';
import { boundedFetch, sourceUrl, robotsPolicy, retryAt, hash, optOut, BOT } from './policy.js';
import { parseMetadata, candidateFrom } from './metadata.js';
import { healthForOutcome } from './source-health.js';
export async function collectSource(id,store,{mode='off',now=Date.now(),fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),registry=SOURCES,pepper,clock}={}) {
 const started=Date.now(),source=registry.find(s=>s.id===id),state=await store.state(id);
 const listing=source?.discoveryType==='shimamura_listing';
 const report={sourceId:id,startedAt:now,requests:0,candidates:0,pending:0,rejected:0,duplicates:0,outcome:'',durationMs:0,robots:'not_requested',requestCounts:{robots:0,listing:0,feed:0}};
 const gate=legalGate(source,state,now,mode,registry);
 if(gate){report.outcome=gate;if(source&&!['collection_off','not_registry_source','backoff'].includes(gate))await store.recordHealth({sourceId:id,...healthForOutcome(gate,state.failures||0),checkedAt:now,nextEligibleAt:state.nextAt||0,failureCount:state.failures||0});return report;}
 if(listing&&(id!=='shimamura'||source.discoveryUrl!==SHIMAMURA_LISTING_URL)){report.outcome='listing_url_blocked';return report;}
 try{requirePepper(pepper);}catch{report.outcome='headline_pepper_required';await store.recordHealth({sourceId:id,status:'error',reasonCode:report.outcome,checkedAt:now});return report;}
 if(!(await store.controls()).collection_enabled){report.outcome='global_collection_off';await store.recordHealth({sourceId:id,...healthForOutcome(report.outcome),checkedAt:now});return report;}
 const intervalMs=Math.max(listing?24:6,source.crawlIntervalHours)*3600000;
 if(!await store.lease(id,now,intervalMs)){report.outcome='lease_busy';return report;}
 let next={...state,nextAt:now+Math.max(listing?24:6,source.crawlIntervalHours)*3600000};
 const request=async(url,options={})=>{
  if(!(await store.controls()).collection_enabled)throw new Error('global_collection_off');
  if((await store.state(id)).disabled)throw new Error('access_stopped');
  if(!sourceUrl(url,source))throw new Error('url_blocked');
  if(listing&&(report.requests>=2||![source.robotsUrl,SHIMAMURA_LISTING_URL].includes(url)))throw Error('listing_request_budget');
  const attemptedAt=clock?clock():now+Date.now()-started;
  await store.publisherAttempt(id,attemptedAt,intervalMs);
  next.nextAt=Math.max(next.nextAt,attemptedAt+intervalMs);
  report.requests++;report.requestCounts[url===source.robotsUrl?'robots':listing?'listing':'feed']++;
  let response;try{response=await boundedFetch(url,{fetcher,...options});}catch(error){if(listing&&url===SHIMAMURA_LISTING_URL&&error.message==='response_too_large')throw Error('listing_too_large');if(error.name==='TimeoutError'||error.name==='AbortError')throw Error('request_timeout');throw error;}
  if([401,403,451].includes(response.status)){next.disabled=true;throw new Error('http_'+response.status);}
  if(response.status===429||response.status>=500){next.failures=(state.failures||0)+1;next.nextAt=Math.max(next.nextAt,retryAt(response.status,response.headers.get('retry-after'),next.failures,now));throw new Error(response.status===429?'rate_limited':'upstream_error');}
  if(url!==source.robotsUrl&&optOut(response.headers.get('x-robots-tag')||'')){next.disabled=true;throw new Error('header_optout');}
  return response;
 };
 try {
  const result=await request(source.robotsUrl,{maxBytes:512000});
  const robots=robotsPolicy(result.text,source,result.status);const digest=await hash(result.text);
  if((state.robotsHash && state.robotsHash!==digest)||(listing&&source.robotsHash&&source.robotsHash!==digest)){next.disabled=true;throw new Error('robots_changed_review');}
  next.robotsHash=digest;
  report.robots=robots.isAllowed(source.discoveryUrl,BOT)===true?'allow':'disallow';
  if(report.robots==='disallow'){next.disabled=true;throw new Error('robots_disallow');}
  // Recognize sitemap declarations, but never follow an arbitrary listed endpoint automatically.
  report.sitemaps=robots.getSitemaps().filter(url=>sourceUrl(url,source));
  const delay=Math.max(1000,(robots.getCrawlDelay(BOT)||0)*1000);
  if(delay>60000){next.nextAt=Math.max(next.nextAt,now+delay);throw new Error('crawl_delay_review');}
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
    let parsed;try{parsed=parseShimamuraListing(discovery.text,source.discoveryUrl,{since:state.lastDiscoveryAt||0});}finally{discovery.text='';}
    entries=parsed.entries;report.candidates=parsed.cards;report.reasons=parsed.reasons;report.rejected=Object.values(parsed.reasons).reduce((a,b)=>a+b,0);
   }else{
    if(!/xml|rss|atom/i.test(discovery.headers.get('content-type')||''))throw new Error('non_metadata_response');
    entries=parseMetadata(discovery.text,source.discoveryType);report.candidates=entries.length;discovery.text='';
   }
   await persistDiscoveredEntries(entries,source,store,robots,now,pepper,registry,report);
   next.etag=discovery.headers.get('etag')?.slice(0,200)||null;next.lastModified=discovery.headers.get('last-modified')?.slice(0,100)||null;next.failures=0;next.lastDiscoveryAt=now;report.outcome='collected';discovery=null;
  }
 }catch(error){
  const codes=['listing_structure_changed','listing_optout','listing_too_large','listing_url_blocked','listing_request_budget','request_timeout','global_collection_off','robots_unparseable','robots_unavailable','robots_changed_review','robots_disallow','crawl_delay_review','rate_limited','upstream_error','http_401','http_403','http_451','access_stopped','header_optout','redirect_blocked','response_too_large','discovery_unavailable','non_metadata_response','xml_unsafe','xml_invalid','metadata_format','url_blocked'];
  report.outcome=codes.includes(error.message)?error.message:'network_or_internal_error';
  if(['listing_structure_changed','listing_optout','listing_too_large','robots_unparseable','redirect_blocked','header_optout','robots_changed_review','robots_disallow','http_401','http_403','http_451','access_stopped'].includes(report.outcome))next.disabled=true;
  if(!['rate_limited','upstream_error'].includes(report.outcome)){next.failures=(state.failures||0)+1;next.nextAt=Math.max(next.nextAt,retryAt(500,null,next.failures,now));}
 }finally{
  await store.saveState(id,next);report.durationMs=Date.now()-started;await store.log(report);
  await store.recordHealth({sourceId:id,...healthForOutcome(report.outcome,next.failures||0),checkedAt:now,nextEligibleAt:next.nextAt||0,failureCount:next.failures||0,successfulAt:['collected','not_modified'].includes(report.outcome)?now:null});
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
  for(const entry of entries){
   const {item,reason}=await candidateFrom(entry,source,robots,now,pepper);
   if(!item){report.rejected++;report.reasons??={};report.reasons[reason]=(report.reasons[reason]||0)+1;continue;}
   if(await store.put(item))report.pending++;else report.duplicates++;
  }
 }finally{for(const entry of entries)entry.title='';entries.length=0;}
}
