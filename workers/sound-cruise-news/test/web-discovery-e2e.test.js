import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {localDatabase} from '../scripts/local-db.mjs';
import {runWebDiscovery,listWebHints,exaAdapter,llmAdapter} from '../src/web-discovery.js';
import {handleOperatorRequest} from '../src/operator-worker.js';
import {renderWebDiscovery} from '../operator-ui/web-discovery.js';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/web-search-exa.json',import.meta.url)));
const now=Date.parse('2026-10-31T00:00:00Z');
const estimate=h=>({category:'acoustic_guitar',brand:h.title.includes('Emerald')?'Emerald':h.title.includes('Headway')?'Headway':'unknown',product:'needs verification',event:'announcement',value:h.title.includes('Solid-Body')?'low':'high',priority:'high',relevance:'high',duplicate:'unknown',reason:'fixture model estimate; human review required'});
const dom={createElement(tag){return {tag,children:[],setAttribute(k,v){this[k]=v;},addEventListener(){},append(...nodes){this.children.push(...nodes);}};}};
test('persistent workerd D1: Exa fixture → mock AI → authenticated Operator → rendered hints → restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'web-discovery-'));let runtime=await localDatabase(dir);
 try{
  const env={NEWS_DB:runtime.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_DAILY_LIMIT:'5'};let searches=0,models=0;
  const dependencies={search:async()=>fixtures[searches++%3].items,classify:async hints=>{models++;return hints.map(estimate);}};
  const result=await runWebDiscovery(env,now,dependencies);assert.equal(result.searches,3);assert.equal(result.ai_calls,2);assert.equal(models,2);
  let data=await listWebHints(env,now);assert.equal(data.items.length,15);assert(data.items.some(i=>i.title.includes('Emerald')&&i.status==='hold'&&i.reason==='japanese_article_unconfirmed')); assert(data.items.some(i=>i.title.includes('Headway')));assert(data.items.some(i=>i.titleLanguageHint==='japanese_unconfirmed')); assert(data.items.every(i=>i.formalFacts===false&&i.publishedAt===null&&i.publicationCandidate===false&&i.pageLanguage==='unverified'));
  await runWebDiscovery(env,now,dependencies);assert.equal(models,2); // classified and language-hold URLs are not reevaluated
  await runWebDiscovery(env,now,dependencies);assert.equal(searches,5);assert.equal(models,2);
  assert.equal((await runtime.db.prepare('SELECT COUNT(*) n FROM candidate_items').first()).n,0);
  const {privateKey,publicKey}=await generateKeyPair('RS256'),issuer='https://fixture.cloudflareaccess.com',aud='a'.repeat(64),origin='https://operator.fixture.test';
  const jwks=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'fixture'}]});
  const token=await new SignJWT({email:'human@fixture.test',type:'app'}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setSubject('human').setIssuer(issuer).setAudience(aud).setIssuedAt(now/1000).setExpirationTime(now/1000+3600).sign(privateKey);
  Object.assign(env,{NEWS_HEADLINE_PEPPER:'fixture-only-secret-32-characters-long',NEWS_OPERATOR_ORIGIN:origin,NEWS_OPERATOR_EMAILS:'["human@fixture.test"]',NEWS_ACCESS_ISSUER:issuer,NEWS_ACCESS_AUD:aud});
  const call=(headers={},method='GET')=>handleOperatorRequest(new Request(origin+'/api/web-discovery',{headers,method}),env,now,{jwks});
  assert.equal((await call()).status,401);
  const response=await call({'Cf-Access-Jwt-Assertion':token});assert.equal(response.status,200);data=await response.json();
  const view=renderWebDiscovery(dom,data);assert.equal(view.children.length,17);assert(JSON.stringify(view).includes('Emerald'));assert(!JSON.stringify(view).includes('innerHTML'));
  assert.equal((await call({'Cf-Access-Jwt-Assertion':token},'POST')).status,404);
  assert.equal((await call({'Cf-Access-Jwt-Assertion':token,Origin:'https://evil.test'})).status,403);
  env.NEWS_WEB_ENABLED='false';assert.deepEqual(await runWebDiscovery(env,now,{search:()=>assert.fail()}),{disabled:true});assert.deepEqual(await listWebHints(env,now),{enabled:false,items:[]});
  await runtime.mf.dispose();runtime=await localDatabase(dir);assert.equal((await runtime.db.prepare('SELECT COUNT(*) n FROM news_web_hints').first()).n,15);
 }finally{await runtime.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('failed model holds, invalid output rejected, known URL and denied host avoid AI',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'web-hold-'));const runtime=await localDatabase(dir);
 try{
  const env={NEWS_DB:runtime.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["acoustic"]',NEWS_WEB_DENIED_HOSTS:'["blocked.test"]'};
  const d={search:async()=>[{url:'https://blocked.test/news',title:'blocked'},{url:'https://example.test/new',title:'<script>悪意</script>'}],classify:async()=>[{formalFacts:true}]};
  await runWebDiscovery(env,now,d);let data=await listWebHints(env,now);assert.equal(data.items.length,1);assert.equal(data.items[0].status,'hold');assert.equal(data.items[0].reason,'classification_schema_failed');
  const view=renderWebDiscovery(dom,data);assert.equal(view.children[2].children[0].textContent,'<script>悪意</script>');
  const before=(await runtime.db.prepare('SELECT ai_calls FROM news_web_runs').first()).ai_calls;await runWebDiscovery(env,now,d);assert.equal((await runtime.db.prepare('SELECT ai_calls FROM news_web_runs').first()).ai_calls,before);
  await runWebDiscovery(env,now+31*86400000,{search:async()=>[],classify:()=>assert.fail()});assert.equal((await listWebHints(env,now+31*86400000)).items.length,0);
 }finally{await runtime.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('thin adapters enforce response and output contracts without paid calls',async()=>{
 const search=exaAdapter({websearch:async input=>{assert.equal(input.provider,'exa');assert.equal(input.limit,5);return Response.json({items:fixtures[0].items});}});
 assert.equal((await search('query')).length,5);
 const model=llmAdapter({run:async(name,input)=>{assert.equal(input.max_tokens,1500);return {response:JSON.stringify([estimate({title:'Emerald'})])};}},'@cf/test');assert.equal((await model([{url:'https://example.test',title:'x'}]))[0].brand,'Emerald');
});
test('known NEWS URL avoids model; search errors and concurrent invocations obey daily quota',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'web-budget-'));const runtime=await localDatabase(dir);
 try{
  const db=runtime.db,url='https://known.test/model';
  await db.prepare(`INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,category,label,topic_key,collected_at,review_status,review_reason,expires_at) VALUES('known','fixture','fixture',?,?,'acoustic_guitar','known fixture','known','2026-10-31','rejected','human_reject',?)`).bind(url,url,now+86400000).run();
  const env={NEWS_DB:db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["one","two","three"]'};let calls=0;
  const dependencies={search:async()=>{calls++;return [{url,title:'known rejected news'}];},classify:()=>assert.fail('known NEWS must not be reevaluated')};
  await Promise.all([runWebDiscovery(env,now,dependencies),runWebDiscovery(env,now,dependencies)]);assert.equal(calls,3);await runWebDiscovery(env,now,dependencies);assert.equal(calls,5);assert.equal((await listWebHints(env,now)).items.length,0);
  assert.equal((await db.prepare("SELECT review_status FROM candidate_items WHERE id='known'").first()).review_status,'rejected');
  await runWebDiscovery(env,now+86400000,{search:async()=>{throw Error('transport');},classify:()=>assert.fail()});assert.equal((await db.prepare('SELECT errors FROM news_web_runs WHERE day=?').bind('2026-11-01').first()).errors,3);
 }finally{await runtime.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('manual Operator run requires flags, human Access, CSRF and is once per day',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'web-manual-'));const runtime=await localDatabase(dir);
 try{
  const origin='https://operator.fixture.test',issuer='https://fixture.cloudflareaccess.com',aud='a'.repeat(64);
  const {privateKey,publicKey}=await generateKeyPair('RS256');const jwks=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'manual'}]});
  const token=await new SignJWT({email:'human@fixture.test',type:'app'}).setProtectedHeader({alg:'RS256',kid:'manual'}).setSubject('human').setIssuer(issuer).setAudience(aud).setIssuedAt(now/1000).setExpirationTime(now/1000+3600).sign(privateKey);
  const env={NEWS_DB:runtime.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_MANUAL_ENABLED:'true',NEWS_WEB_QUERIES:'["試験"]',NEWS_HEADLINE_PEPPER:'fixture-only-secret-32-characters-long',NEWS_OPERATOR_ORIGIN:origin,NEWS_OPERATOR_EMAILS:'["human@fixture.test"]',NEWS_ACCESS_ISSUER:issuer,NEWS_ACCESS_AUD:aud};let calls=0;
  const options={jwks,webDiscoveryDependencies:{search:async()=>{calls++;return [{url:'https://www.takamineguitars.co.jp/x',title:'新製品'},{url:'https://takamineguitars.co.jp/x',title:'新製品'},{url:'https://example.test/new',title:'新製品'}];},classify:async hints=>hints.map(estimate)}};
  const call=(path,{auth=true,csrf,originHeader=origin,method='POST'}={})=>handleOperatorRequest(new Request(origin+path,{method,headers:{...(auth?{'Cf-Access-Jwt-Assertion':token}:{}),...(method==='POST'?{'Origin':originHeader,'Content-Type':'application/json',...(csrf?{'X-News-CSRF':csrf}:{})}:{})},...(method==='POST'?{body:'{}'}:{})}),env,now,options);
  assert.equal((await call('/api/web-discovery/run',{auth:false})).status,401);
  assert.equal((await call('/api/web-discovery/run')).status,403);
  const session=await(await call('/api/session',{method:'GET'})).json();
  assert.equal((await call('/api/web-discovery/run',{csrf:session.csrf,originHeader:'https://evil.test'})).status,403);
  env.NEWS_WEB_MANUAL_ENABLED='false';assert.equal((await call('/api/web-discovery/run',{csrf:session.csrf})).status,503);env.NEWS_WEB_MANUAL_ENABLED='true';
  const response=await call('/api/web-discovery/run',{csrf:session.csrf});assert.equal(response.status,200);assert.equal((await response.json()).searches,1);assert.equal(calls,1);
  const hints=await listWebHints(env,now);assert.equal(hints.items.length,1);assert.equal(hints.items[0].url,'https://example.test/new');const view=renderWebDiscovery(dom,hints);assert(view.children.some(n=>n.textContent?.includes('誤りが含まれる可能性')));assert(view.children.some(n=>n.textContent==='Web探索を1回実行'));
  const again=await(await call('/api/web-discovery/run',{csrf:session.csrf})).json();assert.equal(again.skipped,true);assert.equal((await runWebDiscovery(env,now,options.webDiscoveryDependencies)).skipped,true);assert.equal(calls,1);
  assert.equal((await runtime.db.prepare('SELECT COUNT(*) n FROM candidate_items').first()).n,0);
 }finally{await runtime.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('manual run cannot race cron or repeat after a prior daily run',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'web-lock-'));const runtime=await localDatabase(dir);
 try{
  const env={NEWS_DB:runtime.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["試験"]'};let started,release,calls=0;
  const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{started=r;});
  const deps={search:async()=>{calls++;started();await gate;return [];},classify:()=>assert.fail()};
  const start=Date.parse('2026-10-31T23:59:59Z');const cron=runWebDiscovery(env,start,deps);await ready;
  assert.equal((await runWebDiscovery(env,start,deps,true)).skipped,true);assert.equal((await runWebDiscovery(env,start+1000,deps,true)).skipped,true);release();await cron;
  assert.equal((await runWebDiscovery(env,start,deps,true)).skipped,true);assert.equal(calls,1);
 }finally{await runtime.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('saved 15 hints survive model failure, daily bounded retry and restart without another search result',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'web-retry-'));let runtime=await localDatabase(dir);
 try{
  const env={NEWS_DB:runtime.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["fixture"]'};
  const {saveHint}=await import('../src/web-discovery.js');
  for(let i=0;i<15;i++)await saveHint(runtime.db,{url:`https://fixture.test/${i}`,title:`日本語 新製品 ${i}`,provider:'exa',searchedAt:now},now);
  const failed=await runWebDiscovery(env,now,{search:async()=>[],classify:async hints=>{assert(hints.length<=3);throw Error('private provider message');}});
  assert.equal(failed.ai_calls,5);assert.equal(failed.errors,5);
  let rows=(await listWebHints(env,now)).items;assert.equal(rows.length,15);assert(rows.every(h=>h.reason==='classification_model_failed'));
  assert.equal((await runtime.db.prepare('SELECT MIN(retry_at) at FROM news_web_hints').first()).at,Date.parse('2026-10-31T21:00:00Z'));
  // Retry is delayed; a repeated same-day invocation consumes no further model calls.
  await runWebDiscovery(env,now,{search:async()=>[],classify:()=>assert.fail()});
  await runtime.mf.dispose();runtime=await localDatabase(dir);env.NEWS_DB=runtime.db;
  const recovered=await runWebDiscovery(env,now+86400000,{search:async()=>[],classify:async hints=>{assert(hints.length<=3);return hints.map(estimate);}});
  assert.equal(recovered.processed,15);assert.equal(recovered.ai_calls,5);assert.equal(recovered.errors,0);
  rows=(await listWebHints(env,now+86400000)).items;assert.equal(rows.length,15);assert(rows.every(h=>h.status==='classified'));
  assert.equal((await runtime.db.prepare('SELECT COUNT(*) n FROM candidate_items').first()).n,0);
 }finally{await runtime.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
