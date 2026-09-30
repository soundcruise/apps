// One operator-authorized GET. HTML and original titles stay in this process only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {lookup} from 'node:dns/promises';
import {channel} from 'node:diagnostics_channel';
import {createInterface} from 'node:readline';
import {Agent,fetch as undiciFetch} from 'undici';
import {boundedFetch,robotsPolicy,hash,optOut,BOT} from '../src/policy.js';
import {getSource,evidenceGate,phaseOneSourceReady} from '../src/registry.js';
import {runtimeSources} from '../src/runtime.js';
import {SHIMAMURA_LISTING_URL,LISTING_MAX_BYTES} from '../src/shimamura-listing.js';
import {persistDiscoveredEntries} from '../src/collector.js';
import {NewsStore} from '../src/store.js';
import {healthForOutcome} from '../src/source-health.js';
import {checkedConfig,remoteSql} from './remote-db.mjs';
import {remoteDatabase} from './remote-store.mjs';
import {deploymentMetadata} from './cloudflare-metadata.mjs';
import {publicAddress} from './safe-fetch.mjs';
import {consumeInitialOverride,INITIAL_REASON} from './initial-override.mjs';
if(process.argv[2]!==INITIAL_REASON)throw Error('explicit_initial_reason_required');
const config=await checkedConfig(),now=Date.now(),evidence=getSource('shimamura');
if(evidenceGate(evidence,now)||!phaseOneSourceReady(evidence,now)||evidence.saleCollection!=='none')throw Error('readiness_required');
const metadata=await deploymentMetadata();
if(metadata.bindings.find(b=>b.name==='NEWS_COLLECTION_MODE')?.value!=='off'||(metadata.schedules.schedules??metadata.schedules).length||metadata.bindings.find(b=>b.name==='NEWS_DB')?.id!==config.d1_databases[0].database_id||!metadata.bindings.some(b=>b.name==='NEWS_HEADLINE_PEPPER'&&b.type==='secret_text'))throw Error('stopped_production_infrastructure_required');
const robotsText='User-agent: *\nDisallow: /p/test.xml\nDisallow: /originalbrand/ryoga/member.html';
if(await hash(robotsText)!==evidence.robotsHash)throw Error('robots_evidence_mismatch');
const robots=robotsPolicy(robotsText,evidence);if(robots.isAllowed(SHIMAMURA_LISTING_URL,BOT)!==true)throw Error('robots_disallow');
const registry=runtimeSources(config.vars),source=registry.find(s=>s.id==='shimamura'),store=new NewsStore(remoteDatabase());
const health=(await store.sourceHealth()).find(h=>h.source_id==='shimamura');
if(!health||health.failure_count||!['healthy','paused'].includes(health.status)||health.status==='paused'&&health.reason_code!=='global_collection_off')throw Error('source_health_not_ready');
const secrets=JSON.parse(await readFile('.local/production-secrets.json','utf8'));
const pepper=secrets.NEWS_HEADLINE_PEPPER;if(typeof pepper!=='string'||pepper.length<32)throw Error('private_secret_required');
const addresses=await lookup('www.shimamura.co.jp',{family:4,all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('public_dns_required');
await mkdir('.local',{recursive:true});
await writeFile('.local/initial-attempt.json',JSON.stringify({at:now,reason:INITIAL_REASON}),{flag:'wx',mode:0o600});
await consumeInitialOverride(store,now,INITIAL_REASON);
const agent=new Agent({connect:{lookup(host,options,callback){if(host!=='www.shimamura.co.jp')return callback(Error('host_blocked'));callback(null,options.all?[addresses[0]]:addresses[0].address,4);}}});
const report={at:now,reason:INITIAL_REASON,parserHash:await hash(await readFile(new URL('../src/shimamura-listing.js',import.meta.url),'utf8')),requests:{listing:0,robots:0,article:0,image:0,feed:0,head:0,otherPublisher:0},wireRequests:0,pending:0,rejected:0,duplicates:0,ready:false};
let html='',reply,parsed,closed=false;
channel('undici:client:sendHeaders').subscribe(({request})=>{
 if(String(request.origin)+request.path!==SHIMAMURA_LISTING_URL||request.method!=='GET'||report.wireRequests)throw Error('publisher_request_budget');
 report.wireRequests++;report.publisherRequestAt=Date.now();
});
const log=()=>writeFile('.local/initial-collection.json',JSON.stringify(report,null,2),{mode:0o600});
async function analyze(){
 try{
 const parser=await import('../src/shimamura-listing.js?initial='+Date.now());parsed=parser.parseShimamuraListing(html);
 report.candidates=parsed.cards;report.reasons=parsed.reasons;report.rejected=Object.values(parsed.reasons).reduce((a,b)=>a+b,0);
 report.metadataComplete=parsed.entries.filter(e=>e.title&&e.date&&e.listingCategory&&!e.listingUncertainty).length;
 report.categories=parsed.entries.reduce((a,e)=>(a[e.listingCategory]=(a[e.listingCategory]||0)+1,a),{});report.parserPassed=true;
 }catch{parsed=null;report.parserPassed=false;report.failure='listing_structure_changed';}
 await log();console.log(JSON.stringify({phase:'analyzed',...report}));
}
async function finish(success){
 if(closed)return;closed=true;
 const at=report.publisherRequestAt||now;
 try{
 if(!success||!parsed)throw Error(report.failure||'initial_collection_aborted');
 await remoteSql('UPDATE news_controls SET collection_enabled=1,publication_enabled=0 WHERE id=1;');
 await persistDiscoveredEntries(parsed.entries,source,store,robots,at,pepper,registry,report);
 report.ready=report.pending>0;report.outcome=report.ready?'collected':'no_relevant_candidates';
 await store.saveState('shimamura',{nextAt:at+86400000,robotsHash:evidence.robotsHash,etag:reply.headers.get('etag'),lastModified:reply.headers.get('last-modified'),lastDiscoveryAt:at});
 await store.recordHealth({sourceId:'shimamura',status:'healthy',reasonCode:'ok',checkedAt:at,successfulAt:at,nextEligibleAt:at+86400000});
 await store.log({sourceId:'shimamura',startedAt:at,requests:1,candidates:report.candidates,pending:report.pending,rejected:report.rejected,duplicates:report.duplicates,outcome:report.outcome,durationMs:Date.now()-at});
 }catch(error){report.ready=false;report.outcome=error.message==='listing_structure_changed'?'listing_structure_changed':'initial_collection_failed';await store.recordHealth({sourceId:'shimamura',...healthForOutcome(report.outcome,1),checkedAt:at,nextEligibleAt:at+86400000,failureCount:1});}
 finally{
  await remoteSql('UPDATE news_controls SET collection_enabled=0,publication_enabled=0 WHERE id=1;');
  // Advance to the actual wire-attempt time, including failed requests.
  await store.publisherAttempt('shimamura',at,86400000);
  html='';if(reply)reply.text='';if(parsed)for(const e of parsed.entries)e.title='';parsed=null;
  report.rawHtmlPersisted=false;report.originalHeadlinesPersisted=false;report.memoryReleased=true;report.nextEligibleAt=at+86400000;
  await log();await agent.close();console.log(JSON.stringify({phase:'finished',...report}));
 }
}
try{
 await store.publisherAttempt('shimamura',Date.now(),86400000);
 report.requests.listing=1;
 reply=await boundedFetch(SHIMAMURA_LISTING_URL,{maxBytes:LISTING_MAX_BYTES,headers:{Accept:'text/html','Cache-Control':'no-store'},fetcher:async(url,options)=>{
  if(url!==SHIMAMURA_LISTING_URL||options.method!=='GET')throw Error('publisher_request_budget');
  const response=await undiciFetch(url,{...options,dispatcher:agent});report.status=response.status;report.contentType=response.headers.get('content-type');return response;
 }});
 report.bytes=Buffer.byteLength(reply.text);
 if(reply.status!==200||!/^text\/html/i.test(report.contentType||'')||optOut(reply.headers.get('x-robots-tag')||''))throw Error('initial_http_or_optout_failure');
 html=reply.text;reply.text='';await analyze();
 console.log('Memory retained. Commands: analyze (same response), finish, abort. No second GET.');
 const input=createInterface({input:process.stdin});
 for await(const line of input){if(line.trim()==='analyze')await analyze();else if(['finish','abort'].includes(line.trim())){await finish(line.trim()==='finish');input.close();break;}}
 if(!closed)await finish(false);
}catch{if(!closed)await finish(false);process.exitCode=1;}
