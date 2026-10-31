import {prepareAssisted,saveAssisted} from './assisted-entry.js';
import {parseAssistedPaste,YAMAHA_TOPICS_START} from './assisted-paste.js';
import {assistedSources,assistedTypes,assistedActions,ASSISTED_ORIGIN,ASSISTED_PERMISSION,assistedUrl} from './assisted-facts.js';
import {manualFactsPolicy} from './manual-facts-policy.js';
import {categoryDetail,saveCategory} from './category-editor.js';
import {publishedPresentation,savePresentation} from './news-presentation.js';
import {confirmMorrisFacts} from './morris-fact-confirmation.js';
import {authenticationPage} from './operator-auth-page.js';
import {setPublishInterest,runPendingRechecks} from './pending-lifecycle.js';
import {saveShadowEvaluation,evaluatePending,shadowMetrics} from './operator-shadow.js';
import {dashboardSummary,humanDecisionHistory,similarDecisions} from './operator-insights.js';
import {recheckFacts} from './facts-recheck.js';
import {authenticateOperator,csrfToken,verifyCsrf} from './operator-auth.js';
import {createDotCloudRunProxy,configuredDotProxy} from './dot-cloudrun-proxy.js';
import {compareDotWithNews} from './dot-news-comparison.js';
import {readDotNewsSnapshot} from './dot-news-snapshot.js';
import {dotSnapshot,saveDotConfirmation} from './dot-human-confirmation.js';
import {admitDotCandidate} from './dot-admission.js';
import {dotPublicationGate} from './dot-publication-gate.js';
import {saveDotSourceRecheck} from './dot-source-recheck.js';
import {saveDotHistoryCheck} from './dot-history-check.js';
import {saveDotHistoryExclusion,historySubjects} from './dot-history-exclusion.js';
import {NewsStore} from './store.js';
import {runtimeSources} from './runtime.js';
import {reviewQueue,reviewDetail,operatorDecision,candidateSnapshot} from './operator-review.js';
const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
const json=(body,status=200)=>Response.json(body,{status,headers:security});
async function inputJSON(request){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))throw Error('json_required');
 if(Number(request.headers.get('Content-Length'))>8192)throw Error('request_too_large');
 let bytes=0,text='';const reader=request.body?.getReader();if(!reader)throw Error('malformed_json');
 const decoder=new TextDecoder();try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();throw Error('request_too_large');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 try{const input=JSON.parse(text);if(!input||typeof input!=='object'||Array.isArray(input))throw Error();return input;}catch{throw Error('malformed_json');}
}
export async function handleOperatorRequest(request,env,now=Date.now(),options={}){
 try{
  const identity=await authenticateOperator(request,env,now,options),url=new URL(request.url);
  if(url.origin!==identity.config.origin)throw Error('origin_denied');
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==identity.config.origin)throw Error('origin_denied');
  const store=new NewsStore(env.NEWS_DB),registry=options.registry||runtimeSources(env,undefined,now);
  // Configuration is consulted only on Dot routes; other Operator functionality remains independent.
  const isDotRoute=url.pathname==='/api/dot-capabilities'||url.pathname==='/api/dot-candidates'||url.pathname.startsWith('/api/dot-candidates/')||/^\/api\/candidates\/[A-Za-z0-9_-]{1,128}\/dot-(?:publish-check|source-recheck|history-check|history-subjects|history-exclusion)$/.test(url.pathname);
  const assertion=request.headers.get('Cf-Access-Jwt-Assertion');
  const dotReader=isDotRoute?(options.dotReader||(options.dotProxy?createDotCloudRunProxy({...options.dotProxy,assertion}):configuredDotProxy(env,assertion))):null;
  if(request.method==='GET'&&/^\/api\/candidates\/[A-Za-z0-9_-]{1,128}\/dot-history-subjects$/.test(url.pathname)){
   if(!dotReader||env.NEWS_DOT_CONFIRMATION_ENABLED!=='true'||env.NEWS_DOT_PUBLICATION_ENABLED!=='true')return json({error:'not_found'},404);if([...url.searchParams.keys()].some(k=>k!=='after'))throw Error('operator_query_invalid');return json(await historySubjects(store,url.pathname.split('/')[3],url.searchParams.get('after')||''));
  }
  if(request.method==='POST'&&/^\/api\/candidates\/[A-Za-z0-9_-]{1,128}\/dot-history-exclusion$/.test(url.pathname)){
   if(!dotReader||env.NEWS_DOT_CONFIRMATION_ENABLED!=='true'||env.NEWS_DOT_PUBLICATION_ENABLED!=='true')return json({error:'not_found'},404);if(url.search)throw Error('operator_query_invalid');await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);if(input.id!==url.pathname.split('/')[3])throw Error('operator_query_invalid');return json(await saveDotHistoryExclusion(store,input,identity.actor,now));
  }
  if(request.method==='POST'&&/^\/api\/candidates\/[A-Za-z0-9_-]{1,128}\/dot-history-check$/.test(url.pathname)){
   if(!dotReader||env.NEWS_DOT_CONFIRMATION_ENABLED!=='true'||env.NEWS_DOT_PUBLICATION_ENABLED!=='true')return json({error:'not_found'},404);if(url.search)throw Error('operator_query_invalid');await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);if(input.id!==url.pathname.split('/')[3])throw Error('operator_query_invalid');return json(await saveDotHistoryCheck(store,input,identity.actor,now));
  }
  if(request.method==='POST'&&/^\/api\/candidates\/[A-Za-z0-9_-]{1,128}\/dot-source-recheck$/.test(url.pathname)){
   if(!dotReader||env.NEWS_DOT_CONFIRMATION_ENABLED!=='true')return json({error:'not_found'},404);if(url.search)throw Error('operator_query_invalid');await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);if(input.id!==url.pathname.split('/')[3])throw Error('operator_query_invalid');return json(await saveDotSourceRecheck(store,dotReader,input,identity.actor,now,registry));
  }
  if(request.method==='GET'&&/^\/api\/candidates\/[A-Za-z0-9_-]{1,128}\/dot-publish-check$/.test(url.pathname)){
   if(url.search)throw Error('operator_query_invalid');const {fence,...result}=await dotPublicationGate(store,dotReader,url.pathname.split('/')[3],now,registry,env.NEWS_HEADLINE_PEPPER);return json({...result,publicationEnabled:env.NEWS_DOT_PUBLICATION_ENABLED==='true'});
  }
  if(request.method==='GET'&&url.pathname==='/api/dot-capabilities')return json({available:Boolean(dotReader),humanConfirmation:Boolean(dotReader)&&env.NEWS_DOT_CONFIRMATION_ENABLED==='true',admission:Boolean(dotReader)&&env.NEWS_DOT_CONFIRMATION_ENABLED==='true'&&env.NEWS_DOT_ADMISSION_ENABLED==='true'});
  if(request.method==='POST'&&url.pathname==='/api/dot-candidates/admit'){
   if(!dotReader||env.NEWS_DOT_CONFIRMATION_ENABLED!=='true'||env.NEWS_DOT_ADMISSION_ENABLED!=='true')return json({error:'not_found'},404);
   await verifyCsrf(request,identity,env,now);return json(await admitDotCandidate(store,dotReader,await inputJSON(request),identity.actor,now,registry,env.NEWS_HEADLINE_PEPPER));
  }
  if(request.method==='GET'&&/^\/api\/dot-candidates\/[A-Za-z0-9_-]{1,128}\/admission$/.test(url.pathname)){
   if(!dotReader||env.NEWS_DOT_CONFIRMATION_ENABLED!=='true'||env.NEWS_DOT_ADMISSION_ENABLED!=='true')return json({error:'not_found'},404);
   if(url.search)throw Error('operator_query_invalid');const id=url.pathname.split('/')[3],row=await env.NEWS_DB.prepare('SELECT r.request_id,r.candidate_id,r.candidate_digest,r.staging_revision,r.delivery_key_hash,r.created_at,c.review_status FROM news_dot_admission_receipts r LEFT JOIN candidate_items c ON c.id=r.candidate_id WHERE r.dot_candidate_id=? AND r.actor_id=?').bind(id,identity.actor.id).first();
   if(!row){let deleted;try{deleted=await env.NEWS_DB.prepare('SELECT 1 AS found FROM news_dot_deleted_receipts WHERE dot_candidate_id=?').bind(id).first();}catch(e){if(!/no such table:\s*(?:main\.)?news_dot_deleted_receipts\b/i.test(String(e?.message)))throw e;}return deleted?json({status:'deleted',reviewStatus:'deleted'}):json({status:'not_found'},404);}if(!row.review_status)throw Error('operator_unavailable');let stagingConsistency='UNCERTAIN';try{const current=await dotReader.detail(id),snapshot=await dotSnapshot(current,id);stagingConsistency=snapshot.digest===row.candidate_digest&&snapshot.revision===row.staging_revision&&current.deliveryKeyHash===row.delivery_key_hash?'MATCH':'CHANGED';}catch{}return json({status:'registered',receiptId:row.request_id,id:row.candidate_id,createdAt:row.created_at,reviewStatus:row.review_status,stagingConsistency});
  }
  if(request.method==='POST'&&url.pathname==='/api/dot-candidates/confirm'){
   if(!dotReader||env.NEWS_DOT_CONFIRMATION_ENABLED!=='true')return json({error:'not_found'},404);
   await verifyCsrf(request,identity,env,now);return json(await saveDotConfirmation(env.NEWS_DB,dotReader,await inputJSON(request),identity.actor,now));
  }
  if(request.method==='GET'&&/^\/api\/dot-candidates\/confirm\/[A-Za-z0-9_-]{16,100}$/.test(url.pathname)){
   if(!dotReader||env.NEWS_DOT_CONFIRMATION_ENABLED!=='true')return json({error:'not_found'},404);
   if(url.search)throw Error('operator_query_invalid');const row=await env.NEWS_DB.prepare('SELECT candidate_id,candidate_digest,staging_revision,confirmed_at,evidence_json,outcome FROM news_dot_confirmations WHERE request_id=? AND actor_id=?').bind(url.pathname.split('/').at(-1),identity.actor.id).first();
   if(!row)return json({error:'not_found'},404);return json({candidateId:row.candidate_id,digest:row.candidate_digest,revision:row.staging_revision,confirmedAt:row.confirmed_at,...JSON.parse(row.evidence_json),formalFacts:false,ready:false,registration:'NOT_AVAILABLE'});
  }
  if(request.method==='GET'&&(url.pathname==='/api/dot-candidates'||/^\/api\/dot-candidates\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname))){
   if(!dotReader)throw Error('operator_not_configured');
   const detail=url.pathname!=='/api/dot-candidates';let output;
   if(detail){if(url.search)throw Error('operator_query_invalid');const id=url.pathname.split('/').at(-1);output=await dotReader.detail(id);if(!output)return json({error:'not_found'},404);if(output.validation?.ready!==false||output.validation?.formalFacts!==false)throw Error('operator_query_invalid');let snapshot;try{snapshot=options.dotNewsSnapshot?await options.dotNewsSnapshot():await readDotNewsSnapshot(env.NEWS_DB,output.candidate);}catch{}let confirmationSnapshot=null;if(env.NEWS_DOT_CONFIRMATION_ENABLED==='true'){try{confirmationSnapshot=await dotSnapshot(output,id);}catch{}}const manualSources=[];if(env.NEWS_DOT_ADMISSION_ENABLED==='true')for(const candidateSource of (Array.isArray(output.candidate?.sources)?output.candidate.sources.slice(0,8):[])){const raw=candidateSource?.url;if(assistedUrl(raw))manualSources.push({url:raw,kind:'official',policyRef:ASSISTED_PERMISSION,evidenceUrl:null});else for(const source of registry){const policy=manualFactsPolicy(source,raw,now);if(policy)manualSources.push({url:raw,kind:source.sourceKind,policyRef:policy.permissionRef,evidenceUrl:policy.evidenceUrl});}}output={...output,...compareDotWithNews(output.candidate,snapshot),formalComparison:'NOT_EVALUATED',confirmationSnapshot,manualSources};}
   else{const keys=[...url.searchParams.keys()];if(keys.some(k=>!['limit','cursor'].includes(k))||new Set(keys).size!==keys.length)throw Error('operator_query_invalid');const text=url.searchParams.get('limit')||'10',cursor=url.searchParams.get('cursor');if(!/^(?:[1-9]|1[0-9]|20)$/.test(text)||(cursor!==null&&!/^[a-f0-9]{64}$/.test(cursor)))throw Error('operator_query_invalid');output=await dotReader.list({limit:Number(text),cursor});if(!Array.isArray(output?.items)||output.items.length>Number(text)||output.items.some(x=>x.validation?.ready!==false||x.validation?.formalFacts!==false))throw Error('operator_query_invalid');}
   if(new TextEncoder().encode(JSON.stringify(output)).length>65536)throw Error('operator_query_invalid');return json(output);
  }
  if(request.method==='GET'&&url.pathname==='/api/session')return json({operator:identity.email,csrf:await csrfToken(identity,env,now),version:'0.48.0'});
  if(request.method==='GET'&&url.pathname==='/api/shadow-metrics')return json(await shadowMetrics(store,now));
  if(request.method==='POST'&&url.pathname==='/api/shadow-evaluate'){
   await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);
   if(input.scope==='pending'&&Object.keys(input).length===1)return json(await evaluatePending(store,now,registry,env.NEWS_HEADLINE_PEPPER));
   return json(await saveShadowEvaluation(store,input,now,registry,env.NEWS_HEADLINE_PEPPER));
  }
  if(request.method==='GET'&&url.pathname==='/api/assisted')return json({sources:assistedSources.map(s=>({...s,startUrl:s.id==='yamaha'?YAMAHA_TOPICS_START:undefined})),types:Object.fromEntries(Object.entries(assistedTypes).filter(([id])=>id!=='guitar_accessory')),actions:assistedActions});
  if(request.method==='POST'&&url.pathname==='/api/assisted-parse'){await verifyCsrf(request,identity,env,now);return json(parseAssistedPaste(await inputJSON(request)));}
  if(request.method==='POST'&&['/api/assisted-preview','/api/assisted-save'].includes(url.pathname)){await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);const p=url.pathname.endsWith('-save')?await saveAssisted(store,input,now,registry,env.NEWS_HEADLINE_PEPPER,identity.actor):await prepareAssisted(store,input,now,registry,env.NEWS_HEADLINE_PEPPER);return json({...p,row:undefined,existing:undefined});}
  if(request.method==='GET'&&/^\/api\/assisted\/[a-f0-9]{64}$/.test(url.pathname)){const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=? AND origin=?').bind(url.pathname.split('/').at(-1),ASSISTED_ORIGIN).first();if(!row)throw Error('candidate_not_found');return json({id:row.id,url:row.source_url,publishedAt:new Date(Date.parse(row.published_at)+9*3600000).toISOString().slice(0,10),sourceId:row.source_id,label:row.label,...JSON.parse(row.product_facts),snapshot:await candidateSnapshot(row)});}
  if(request.method==='GET'&&url.pathname==='/api/summary')return json(await dashboardSummary(store,now));
  if(request.method==='GET'&&url.pathname==='/api/human-decisions'){
   const offset=url.searchParams.get('offset')||'0';if(!/^\d{1,7}$/.test(offset))throw Error('operator_query_invalid');
   return json(await humanDecisionHistory(store,now,{offset:Number(offset)}));
  }
  if(request.method==='GET'&&/^\/api\/candidates\/[a-zA-Z0-9_-]{1,128}\/similar-decisions$/.test(url.pathname)){
   const id=url.pathname.split('/')[3],detail=await reviewDetail(store,id,now,registry,env.NEWS_HEADLINE_PEPPER);
   const expected=url.searchParams.get('snapshot'),revision=url.searchParams.get('revision');
   if((expected!==null||revision!==null)&&(expected!==detail.snapshot||revision!==String(detail.revision)))throw Error('candidate_changed');
   const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first();
   if(!row||await candidateSnapshot(row)!==detail.snapshot)throw Error('candidate_changed');
   const result={...await similarDecisions(store,row,detail.validation,now),candidateId:id,candidateRevision:detail.revision,candidateSnapshot:detail.snapshot};
   console.info(JSON.stringify({event:'news_recommendation_observed',version:result.version,candidateId:id,candidateRevision:detail.revision,candidateSnapshot:detail.snapshot,generatedAt:now,recommendation:result.recommendation,evidenceCount:result.evidenceCount,similarityLevel:result.similarityLevel,policyVersion:result.policyVersion,decisionIds:result.matches.map(m=>m.decisionId)}));
   return json(result);
  }
  if(request.method==='GET'&&/^\/api\/candidates\/[a-zA-Z0-9_-]{1,128}\/category$/.test(url.pathname))return json(await categoryDetail(store,url.pathname.split('/')[3],now));
  if(request.method==='POST'&&url.pathname==='/api/category'){await verifyCsrf(request,identity,env,now);return json(await saveCategory(store,await inputJSON(request),now,identity.actor));}
  if(request.method==='GET'&&url.pathname==='/api/published')return json(await publishedPresentation(store,env,now,registry));
  if(request.method==='POST'&&url.pathname==='/api/presentation'){await verifyCsrf(request,identity,env,now);return json(await savePresentation(store,await inputJSON(request),env,now,registry,identity.actor));}
  if(request.method==='GET'&&url.pathname==='/api/pending')return json({items:await reviewQueue(store,{now,registry,pepper:env.NEWS_HEADLINE_PEPPER})});
  if(request.method==='GET'&&/^\/api\/candidates\/[a-zA-Z0-9_-]{1,128}$/.test(url.pathname)){const detail=await reviewDetail(store,url.pathname.split('/').at(-1),now,registry,env.NEWS_HEADLINE_PEPPER);if(detail.dotAdmission&&env.NEWS_DOT_PUBLICATION_ENABLED==='true'){const reader=options.dotReader||configuredDotProxy(env,assertion);if(reader){const gate=await dotPublicationGate(store,reader,detail.id,now,registry,env.NEWS_HEADLINE_PEPPER);if(gate.status==='PASS'&&detail.validation.errors.every(x=>x==='dot_publication_gate_pending')){detail.validation.errors=[];detail.validation.valid=true;}}}return json(detail);}
  if(request.method==='POST'&&url.pathname==='/api/publish-interest'){
   await verifyCsrf(request,identity,env,now);return json(await setPublishInterest(store,await inputJSON(request),now,registry,env.NEWS_HEADLINE_PEPPER,identity.actor));
  }
  if(request.method==='POST'&&url.pathname==='/api/pending-recheck'){
   await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);if(input.scope!=='due'||Object.keys(input).length!==1)throw Error('operator_recheck_invalid');
   return json(await runPendingRechecks(store,now,registry,env.NEWS_HEADLINE_PEPPER,{...options,limit:20}));
  }
  if(request.method==='POST'&&url.pathname==='/api/morris-facts-confirm'){
   await verifyCsrf(request,identity,env,now);return json(await confirmMorrisFacts(store,await inputJSON(request),now,registry,env.NEWS_HEADLINE_PEPPER,identity.actor));
  }
  if(request.method==='POST'&&url.pathname==='/api/facts-recheck'){
   await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);
   return json(await recheckFacts(store,input,now,registry,env.NEWS_HEADLINE_PEPPER,identity.actor,options));
  }
  if(request.method==='POST'&&['/api/decision','/api/cli-decision'].includes(url.pathname)){
   await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);
   return json(await operatorDecision(store,input,now,registry,env.NEWS_HEADLINE_PEPPER,url.pathname==='/api/cli-decision'?{...identity.actor,type:'system_repair'}:identity.actor,{enabled:env.NEWS_DOT_PUBLICATION_ENABLED==='true',readerFactory:()=>options.dotReader||configuredDotProxy(env,assertion)}));
  }
  if(request.method==='GET'&&['/','/index.html','/review.js','/review.css','/dot-review.js'].includes(url.pathname)){
   if(!env.OPERATOR_ASSETS)throw Error('operator_not_configured');
   const response=await env.OPERATOR_ASSETS.fetch(request),headers=new Headers(response.headers);for(const [k,v]of Object.entries(security))headers.set(k,v);return new Response(response.body,{status:response.status,headers});
  }
  return json({error:'not_found'},404);
 }catch(error){
  const code=error.message,status=['operator_not_configured','operator_unavailable'].includes(code)?503:['authentication_required','authentication_invalid'].includes(code)?401:['operator_denied','origin_denied','csrf_invalid'].includes(code)?403:code==='candidate_not_found'?404:['stale_decision','already_decided','candidate_changed','idempotency_payload_changed','duplicate','facts_recheck_busy','presentation_changed','category_changed'].includes(code)?409:['decision_transaction_failed','facts_transaction_failed','category_transaction_failed'].includes(code)?503:422;
  const known=/^(assisted_|category_|presentation_|publication_|operator_|authentication_|origin_|csrf_|candidate_|dot_|json_|malformed_|request_|stale_|already_|idempotency_|duplicate$|facts_|label_|verified_|expired_|sale_|event_|decision_transaction_failed)/.test(code);
  if(request.method==='GET'&&['/','/index.html'].includes(new URL(request.url).pathname)&&['authentication_required','authentication_invalid'].includes(code))return authenticationPage(security);
  return json({error:known?code:'operator_unavailable'},known?status:503);
 }
}
export default {fetch:(request,env)=>handleOperatorRequest(request,env)};
