// One authorized listing GET. Raw HTML stays only in this process until finish/abort.
// On parser failure, use `analyze` after a limited offline fix; never launch another GET.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createInterface} from 'node:readline';
import {channel} from 'node:diagnostics_channel';
import {Agent,fetch as undiciFetch} from 'undici';
import {parseDocument,DomUtils} from 'htmlparser2';
import {boundedFetch,robotsPolicy,hash,optOut,BOT} from '../src/policy.js';
import {getSource,evidenceGate,phaseOneSourceReady} from '../src/registry.js';
import {SHIMAMURA_LISTING_URL,LISTING_MAX_BYTES} from '../src/shimamura-listing.js';
import {persistDiscoveredEntries} from '../src/collector.js';
import {publishAutomatic} from '../src/automatic.js';
import {NewsStore} from '../src/store.js';
import {healthForOutcome} from '../src/source-health.js';
import {publicAddress} from './safe-fetch.mjs';
const source=getSource('shimamura'),now=Date.now();
const gate=Math.max(Date.parse('2026-09-30T08:17:00+09:00'),Date.parse(source.nextListingAccessAt));
if(!Number.isFinite(gate)||now<gate)throw Error('listing_interval_not_elapsed');
if(evidenceGate(source,now))throw Error('current_evidence_required');
const robotsText='User-agent: *\nDisallow: /p/test.xml\nDisallow: /originalbrand/ryoga/member.html';
if(await hash(robotsText)!==source.robotsHash)throw Error('robots_review_requires_refresh');
const robots=robotsPolicy(robotsText,source);
if(robots.isAllowed(SHIMAMURA_LISTING_URL,BOT)!==true)throw Error('robots_disallow');
const address=process.env.NEWS_VALIDATION_PINNED_IP;
if(!address||!publicAddress(address))throw Error('validated_public_ipv4_required');
const parserPath=new URL('../src/shimamura-listing.js',import.meta.url);
const parserHash=await hash(await readFile(parserPath,'utf8'));
const report={at:now,ready:false,parserBefore:parserHash,parserAfter:parserHash,requests:{listing:0,robots:0,article:0,image:0,feed:0,head:0,otherPublisher:0},wireRequests:0,blockedRequests:0,pending:0,rejected:0,duplicates:0,preflight:{evidenceValid:true,robotsHashVerified:true,robotsAllowsListing:true,elapsedHours:(now-Date.parse(source.lastListingAccessAt))/3600000}};
await mkdir('.local',{recursive:true});
const db=new DatabaseSync(':memory:');
for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
const wrap=(sql,args=[])=>({bind:(...values)=>wrap(sql,values),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:db.prepare(sql).run(...args)})});
const adapter={prepare:wrap,batch:async statements=>{db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
const store=new NewsStore(adapter);
let secrets;try{secrets=JSON.parse(await readFile('.local/production-secrets.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;secrets={NEWS_HEADLINE_PEPPER:randomBytes(32).toString('hex')};await writeFile('.local/production-secrets.json',JSON.stringify(secrets),{flag:'wx',mode:0o600});}
const log=async()=>writeFile('.local/final-validation.json',JSON.stringify(report,null,2),{mode:0o600});
const agent=new Agent({connect:{lookup(host,options,callback){if(host!=='www.shimamura.co.jp')return callback(Error('host_blocked'));callback(null,options.all?[{address,family:4}]:address,4);}}});
globalThis.fetch=()=>{report.blockedRequests++;throw Error('unapproved_network_call');};
channel('undici:client:sendHeaders').subscribe(({request})=>{
 if(request.method!=='GET'||String(request.origin)+request.path!==SHIMAMURA_LISTING_URL||report.wireRequests!==0){report.blockedRequests++;throw Error('request_budget_exceeded');}
 report.wireRequests++;
});
let reply,html='',parsed=null,closed=false,attempted=false;
function structure(body){
 const doc=parseDocument(body),nodes=DomUtils.findAll(n=>!!n.name,doc.children),anchors=nodes.filter(n=>n.name==='a'&&n.attribs?.href);
 const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','noscript','template','svg'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
 const navigation=n=>{for(let p=n;p;p=p.parent)if(['header','footer','nav','aside','form'].includes(p.name)||p.attribs?.role==='navigation')return true;return false;};
 const numeric=n=>{try{const u=new URL(n.attribs.href,SHIMAMURA_LISTING_URL);return u.origin==='https://www.shimamura.co.jp'&&!u.search&&!u.hash&&/^\/update\/(guitar-bass|amp-effector|dtm-recording)\/20\d{2}\/\d{2}\/\d+\/$/.test(u.pathname);}catch{return false;}};
 const eligible=anchors.filter(n=>numeric(n)&&!hidden(n)&&!navigation(n));
 return {discoveredLinks:anchors.length,numericArticleLinks:anchors.filter(numeric).length,structurallyEligibleLinks:eligible.length,rejectedStructuralLinks:anchors.length-eligible.length,navigationLinks:anchors.filter(navigation).length,hiddenLinks:anchors.filter(hidden).length,identityHeadings:nodes.filter(n=>/^h[12]$/.test(n.name)&&!hidden(n)&&/製品ニュース/.test(DomUtils.textContent(n))&&/記事一覧/.test(DomUtils.textContent(n))).length,
  cardShapes:eligible.slice(0,15).map(n=>({headingCount:DomUtils.findAll(x=>/^h[2-4]$/.test(x.name)&&!hidden(x),n.children).length,dateCount:DomUtils.findAll(x=>['date','time'].includes(x.name)&&!hidden(x),n.children).length,categoryBadgeCount:DomUtils.findAll(x=>/\bbtn-cat-[\w-]+\b/.test(x.attribs?.class||''),n.children).length}))};
}
async function analyze(){
 if(!html)throw Error('no_retained_response');
 const parser=await import(parserPath.href+'?validation='+Date.now());
 report.parserAfter=await hash(await readFile(parserPath,'utf8'));
 try{
  parsed=parser.parseShimamuraListing(html);
  report.parserPassed=true;report.parserFailure=null;report.candidates=parsed.cards;report.parserReasons=parsed.reasons;
  report.metadata={retained:parsed.entries.length,complete:parsed.entries.filter(e=>e.title&&e.date&&e.listingCategory&&!e.listingUncertainty).length,uncertain:parsed.entries.filter(e=>e.listingUncertainty).length,allSameOriginNumeric:parsed.entries.every(e=>!!parser.listingArticleUrl(e.url)),categories:parsed.entries.reduce((a,e)=>(a[e.listingCategory]=(a[e.listingCategory]||0)+1,a),{})};
 }catch(error){parsed=null;report.parserPassed=false;report.parserFailure=['listing_structure_changed','listing_optout','listing_too_large'].includes(error.message)?error.message:'parser_failure';}
 await log();console.log(JSON.stringify({phase:'analyzed',...report}));
}
async function finish(success){
 if(closed)return;closed=true;
 const evidence={...source,lastListingAccessAt:new Date(now).toISOString(),nextListingAccessAt:new Date(now+86400000).toISOString()};
 try{
  if(success&&parsed&&report.parserPassed){
   const validated={...source,discoveryValid:true,discoveryReviewedAt:new Date(now).toISOString(),localPilotEnabled:true};
   if(!phaseOneSourceReady(validated,now))throw Error('readiness_gate_failed');
   db.exec('UPDATE news_controls SET collection_enabled=1,publication_enabled=1 WHERE id=1');
   await store.lease(source.id,now);
   report.reasons={...parsed.reasons};report.rejected=Object.values(parsed.reasons).reduce((a,b)=>a+b,0);
   await persistDiscoveredEntries(parsed.entries,validated,store,robots,now,secrets.NEWS_HEADLINE_PEPPER,[validated],report);
   await store.saveState(source.id,{nextAt:now+86400000,robotsHash:source.robotsHash,lastDiscoveryAt:now,etag:reply.headers.get('etag'),lastModified:reply.headers.get('last-modified')});
   await store.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now,nextEligibleAt:now+86400000});
   // Local in-memory simulation only. Registry and production controls remain disabled.
   const simulated={...validated,enabled:true,productionEnabled:true};
   report.published=await publishAutomatic(store,simulated,[simulated],now,secrets.NEWS_HEADLINE_PEPPER);
   const rows=await store.candidates();
   if(!rows.length)throw Error('no_relevant_candidates');
   report.classification=rows.reduce((a,r)=>(a[r.publication_decision]=(a[r.publication_decision]||0)+1,a),{});
   report.categories=rows.reduce((a,r)=>(a[r.category]=(a[r.category]||0)+1,a),{});
   report.health=await store.sourceHealth();report.ready=true;
   await writeFile('.local/production-bootstrap.json',JSON.stringify({at:now,rows,state:await store.state(source.id),health:report.health}),{mode:0o600});
   Object.assign(evidence,{discoveryValid:true,discoveryReviewedAt:validated.discoveryReviewedAt,localPilotEnabled:false,discoveryFailure:null,listingEvidence:{url:SHIMAMURA_LISTING_URL,status:report.status,bytes:report.bytes,cards:parsed.cards,parserLiveValidated:true,parserHash:report.parserAfter,metadata:report.metadata,structure:report.structure}});
  }else{report.failure=report.failure||report.parserFailure||'validation_aborted';}
 }catch(error){report.ready=false;report.failure=['readiness_gate_failed','no_relevant_candidates'].includes(error.message)?error.message:'pipeline_validation_failed';}
 finally{
  html='';if(reply)reply.text='';if(parsed)for(const e of parsed.entries)e.title='';parsed=null;
  if(!report.ready){await store.recordHealth({sourceId:source.id,...healthForOutcome(report.failure||'listing_structure_changed',1),checkedAt:now,nextEligibleAt:now+86400000,failureCount:1});report.health=await store.sourceHealth();evidence.discoveryValid=false;evidence.discoveryFailure=report.failure;}
  const keys=['reviewedAt','robotsReviewedAt','discoveryReviewedAt','lastListingAccessAt','nextListingAccessAt','automationPolicy','explicitAutomationPermission','robotsValid','robotsHash','crawlDelaySeconds','discoveryValid','sourceRulesReviewed','localPilotEnabled','policyDecision','discoveryFailure','listingEvidence'];
  if(attempted)await writeFile(new URL('../src/shimamura-evidence.js',import.meta.url),'// Reviewed facts only; no publisher HTML/headline.\nexport const SHIMAMURA_EVIDENCE=Object.freeze('+JSON.stringify(Object.fromEntries(keys.map(k=>[k,evidence[k]])),null,2)+');\n');
  report.rawHtmlPersisted=false;report.originalHeadlinesPersisted=false;report.memoryReleased=true;
  await log();db.close();await agent.close();console.log(JSON.stringify({phase:'finished',...report}));
 }
}
try{
 await writeFile('.local/final-validation-attempt.json',JSON.stringify({at:now,parserHash,url:SHIMAMURA_LISTING_URL}),{flag:'wx',mode:0o600});
 attempted=true;report.requests.listing=1;
 reply=await boundedFetch(SHIMAMURA_LISTING_URL,{maxBytes:LISTING_MAX_BYTES,headers:{Accept:'text/html','Cache-Control':'no-store'},fetcher:async(url,options)=>{
  if(url!==SHIMAMURA_LISTING_URL||options.method!=='GET')throw Error('unapproved_network_call');
  const result=await undiciFetch(url,{...options,dispatcher:agent});report.status=result.status;report.contentType=result.headers.get('content-type');return result;
 }});
 report.bytes=Buffer.byteLength(reply.text);
 if(reply.status!==200)throw Error([401,403,451].includes(reply.status)?'http_'+reply.status:reply.status===429?'rate_limited':'discovery_unavailable');
 if(!/^text\/html/i.test(report.contentType||'')||optOut(reply.headers.get('x-robots-tag')||''))throw Error('listing_optout');
 html=reply.text;reply.text='';report.structure=structure(html);
 await analyze();
 console.log('Memory retained. Commands: analyze (same response), finish, abort. No further fetch is possible.');
 const input=createInterface({input:process.stdin});
 for await(const line of input){if(line.trim()==='analyze'){await analyze();}else if(['finish','abort'].includes(line.trim())){await finish(line.trim()==='finish');input.close();break;}}
 if(!closed)await finish(false);
}catch(error){
 if(!attempted){console.log(JSON.stringify({phase:'blocked_before_request',reason:error.code==='EEXIST'?'prior_attempt_exists':'pre_request_failure'}));db.close();await agent.close();process.exitCode=1;}
 else{report.failure=['http_401','http_403','http_451','rate_limited','discovery_unavailable','listing_optout','redirect_blocked','response_too_large'].includes(error.message)?error.message:'validation_failed';await finish(false);process.exitCode=1;}
}
