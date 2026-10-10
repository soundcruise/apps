import {authenticationPage} from './operator-auth-page.js';
import {setPublishInterest,runPendingRechecks} from './pending-lifecycle.js';
import {saveShadowEvaluation,evaluatePending,shadowMetrics} from './operator-shadow.js';
import {dashboardSummary,humanDecisionHistory,similarDecisions} from './operator-insights.js';
import {recheckFacts} from './facts-recheck.js';
import {authenticateOperator,csrfToken,verifyCsrf} from './operator-auth.js';
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
  const store=new NewsStore(env.NEWS_DB),registry=runtimeSources(env,undefined,now);
  if(request.method==='GET'&&url.pathname==='/api/session')return json({operator:identity.email,csrf:await csrfToken(identity,env,now),version:'0.25.4'});
  if(request.method==='GET'&&url.pathname==='/api/shadow-metrics')return json(await shadowMetrics(store,now));
  if(request.method==='POST'&&url.pathname==='/api/shadow-evaluate'){
   await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);
   if(input.scope==='pending'&&Object.keys(input).length===1)return json(await evaluatePending(store,now,registry,env.NEWS_HEADLINE_PEPPER));
   return json(await saveShadowEvaluation(store,input,now,registry,env.NEWS_HEADLINE_PEPPER));
  }
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
  if(request.method==='GET'&&url.pathname==='/api/pending')return json({items:await reviewQueue(store,{now,registry,pepper:env.NEWS_HEADLINE_PEPPER})});
  if(request.method==='GET'&&/^\/api\/candidates\/[a-zA-Z0-9_-]{1,128}$/.test(url.pathname))return json(await reviewDetail(store,url.pathname.split('/').at(-1),now,registry,env.NEWS_HEADLINE_PEPPER));
  if(request.method==='POST'&&url.pathname==='/api/publish-interest'){
   await verifyCsrf(request,identity,env,now);return json(await setPublishInterest(store,await inputJSON(request),now,registry,env.NEWS_HEADLINE_PEPPER,identity.actor));
  }
  if(request.method==='POST'&&url.pathname==='/api/pending-recheck'){
   await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);if(input.scope!=='due'||Object.keys(input).length!==1)throw Error('operator_recheck_invalid');
   return json(await runPendingRechecks(store,now,registry,env.NEWS_HEADLINE_PEPPER,{...options,limit:20}));
  }
  if(request.method==='POST'&&url.pathname==='/api/facts-recheck'){
   await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);
   return json(await recheckFacts(store,input,now,registry,env.NEWS_HEADLINE_PEPPER,identity.actor,options));
  }
  if(request.method==='POST'&&['/api/decision','/api/cli-decision'].includes(url.pathname)){
   await verifyCsrf(request,identity,env,now);const input=await inputJSON(request);
   return json(await operatorDecision(store,input,now,registry,env.NEWS_HEADLINE_PEPPER,url.pathname==='/api/cli-decision'?{...identity.actor,type:'system_repair'}:identity.actor));
  }
  if(request.method==='GET'&&['/','/index.html','/review.js','/review.css'].includes(url.pathname)){
   if(!env.OPERATOR_ASSETS)throw Error('operator_not_configured');
   const response=await env.OPERATOR_ASSETS.fetch(request),headers=new Headers(response.headers);for(const [k,v]of Object.entries(security))headers.set(k,v);return new Response(response.body,{status:response.status,headers});
  }
  return json({error:'not_found'},404);
 }catch(error){
  const code=error.message,status=code==='operator_not_configured'?503:['authentication_required','authentication_invalid'].includes(code)?401:['operator_denied','origin_denied','csrf_invalid'].includes(code)?403:code==='candidate_not_found'?404:['stale_decision','already_decided','candidate_changed','idempotency_payload_changed','duplicate','facts_recheck_busy'].includes(code)?409:['decision_transaction_failed','facts_transaction_failed'].includes(code)?503:422;
  const known=/^(publication_|operator_|authentication_|origin_|csrf_|candidate_|json_|malformed_|request_|stale_|already_|idempotency_|duplicate$|facts_|label_|verified_|expired_|sale_|event_|decision_transaction_failed)/.test(code);
  if(request.method==='GET'&&['/','/index.html'].includes(new URL(request.url).pathname)&&['authentication_required','authentication_invalid'].includes(code))return authenticationPage(security);
  return json({error:known?code:'operator_unavailable'},known?status:503);
 }
}
export default {fetch:(request,env)=>handleOperatorRequest(request,env)};
