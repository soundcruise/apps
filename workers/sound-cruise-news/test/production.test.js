import test from 'node:test';
import assert from 'node:assert/strict';
import {getSource} from '../src/registry.js';
import {runtimeSources} from '../src/runtime.js';
import {scheduledNews,COLLECTION_CRON,RETENTION_CRON} from '../src/scheduled.js';
import {publishAutomatic} from '../src/automatic.js';
import {handleNewsRequest} from '../src/worker.js';
import {administer} from '../src/admin.js';
import {hash,DAY} from '../src/policy.js';
import {database,store,pepper} from './helpers.js';
const now=Date.parse('2026-09-30T21:00:00Z');
const robots='User-agent: *\nAllow: /';
const source={...getSource('shimamura'),reviewedAt:'2026-09-29',robotsReviewedAt:'2026-09-29',discoveryReviewedAt:'2026-09-29',discoveryValid:true,localPilotEnabled:true,robotsHash:await hash(robots)};
const config={NEWS_COLLECTION_MODE:'production',NEWS_API_MODE:'production',NEWS_SOURCE_IDS:'["shimamura"]',NEWS_HEADLINE_PEPPER:pepper};
const html='<main><section><h1>製品ニュース 記事一覧</h1></section><div>'+[
 ['BOSS EX-4 新製品を発表、夢のような響き','2026/09/30'],
 ['未知のブランドによるギター用エフェクターのお知らせ','2026/09/30'],
 ['BOSS EX-4 発売 coupon','2026/09/30']
].map(([title,date],i)=>`<a href="/update/amp-effector/2026/09/${90000+i}/"><h3>${title}</h3><date>${date}</date></a>`).join('')+'</div></main>';
const setup=async()=>{const db=database(),s=await store(db);await administer(s,{action:'publish-on',reason:'review_complete'},now);return {db,s,env:{...config,NEWS_DB:db}};};
const options={registry:[source],sleep:async()=>{},fetcher:async url=>new Response(url.endsWith('robots.txt')?robots:html,{headers:{'content-type':url.endsWith('robots.txt')?'text/plain':'text/html'}})};
const run=(env,at=now,overrides={})=>scheduledNews({cron:COLLECTION_CRON},env,{},at,{...options,clock:()=>at,...overrides});

test('production: only live-validated unique allowlisted sources may be enabled',()=>{
 assert.equal(runtimeSources(config,[source],now)[0].enabled,true);
 assert.equal(runtimeSources(config,[{...source,discoveryValid:false}],now)[0].enabled,false);
 for(const ids of ['[]','["unknown"]','["shimamura","shimamura"]','bad'])assert.equal(runtimeSources({...config,NEWS_SOURCE_IDS:ids},[source],now)[0].enabled,false);
 assert.equal(runtimeSources(config,[source],now+91*DAY)[0].enabled,false);
});
test('production: scheduled collection auto-publishes facts; review retained; coupon rejected; no article requests',async()=>{
 const {s,env}=await setup(),calls=[];
 const result=await run(env,now,{fetcher:async url=>{calls.push(url);return options.fetcher(url);}});
 assert.equal(calls.length,2);assert.ok(calls.every(url=>url.endsWith('robots.txt')||url===source.discoveryUrl));
 assert.equal(result.results[0].published,1);
 const rows=await s.candidates();assert.equal(rows.length,2);assert.equal(rows.filter(r=>r.review_status==='approved').length,1);assert.equal(rows.filter(r=>r.publication_decision==='PUBLISH_REVIEW').length,1);
 assert.ok(!JSON.stringify(rows).includes('夢のような響き'));assert.ok(!JSON.stringify(rows).includes(pepper));
 const response=await handleNewsRequest(new Request('https://news.example/v1/news'),env,now,{registry:runtimeSources(env,[source],now)});
 const data=await response.json();assert.equal(data.items.length,1);assert.equal(data.items[0].label,'BOSS EX-4 Effects Expander、年内発売予定');assert.equal(data.items[0].reviewed_by,undefined);
 assert.equal((await s.sourceHealth()).find(h=>h.source_id==='shimamura').status,'healthy');
});
test('production: backoff is not an abnormal transition; URL dedupe and takedown prevent resurrection',async()=>{
 const {s,env}=await setup();await run(env);
 await run(env,now+1000,{fetcher:async()=>{throw Error('must not fetch during backoff');}});
 assert.equal((await s.sourceHealth()).find(h=>h.source_id==='shimamura').status,'healthy');
 const item=(await s.candidates()).find(r=>r.review_status==='approved');
 await administer(s,{action:'item-delete',target:item.id,reason:'owner_request'},now);
 const result=await run(env,now+DAY);assert.equal(result.results[0].published,0);assert.ok(!(await s.candidates()).some(r=>r.id===item.id));
});
test('production: publication control and fingerprint validity cannot be bypassed',async()=>{
 const {db,s,env}=await setup();await administer(s,{action:'publish-off',reason:'operator_stop'},now);
 const result=await run(env);assert.equal(result.results[0].published,0);
 await administer(s,{action:'publish-on',reason:'review_complete'},now);
 const active=runtimeSources(env,[source],now);
 assert.equal(await publishAutomatic(s,active[0],active,now,'different-production-secret-at-least-32-bytes'),0);
 await db.prepare("UPDATE candidate_items SET title_fingerprint='{}'").run();
 assert.equal(await publishAutomatic(s,active[0],active,now,pepper),0);
});
test('production: stale evidence, global stop, HTTP refusal and missing secret produce operator states',async()=>{
 for(const [variant,code] of [['expired','policy_expired'],['off','global_collection_off'],['blocked','http_451'],['secret','headline_pepper_required']]){
  const {s,env}=await setup();let calls=0;const extra={fetcher:async()=>{calls++;return new Response(null,{status:451});}};
  if(variant==='expired')extra.registry=[{...source,reviewedAt:'2020-01-01'}];
  if(variant==='off')env.NEWS_COLLECTION_MODE='off';
  if(variant==='secret')env.NEWS_HEADLINE_PEPPER='';
  await run(env,now,extra);
  assert.ok((await s.sourceAlerts()).some(a=>a.reason_code===code),code);assert.equal(calls,variant==='blocked'?1:0);
 }
});
test('production: independent retention removes expired items while collection and API are OFF',async()=>{
 const {s,env}=await setup();await run(env);await administer(s,{action:'global-off',reason:'operator_stop'},now);
 await scheduledNews({cron:RETENTION_CRON},env,{},now+91*DAY,{...options,fetcher:async()=>{throw Error('purge must not fetch');}});
 assert.equal((await s.candidates()).length,0);assert.equal((await s.sourceHealth()).find(h=>h.source_id==='retention').status,'healthy');
});
test('production: cached automatic items honor global kill and public endpoints hide operator data',async()=>{
 const {s,env}=await setup();await run(env);const map=new Map(),cache={match:async key=>map.get(key.url)?.clone(),put:async(key,value)=>map.set(key.url,value.clone())};
 const request=(path,origin='https://soundcruise.jp')=>handleNewsRequest(new Request('https://news.example'+path,{headers:{Origin:origin}}),env,now,{registry:runtimeSources(env,[source],now),cache});
 assert.equal((await (await request('/v1/news')).json()).items.length,1);
 assert.equal((await request('/admin/health')).status,404);assert.equal((await request('/v1/news','https://evil.example')).status,403);
 await administer(s,{action:'global-off',reason:'operator_stop'},now);
 assert.equal((await request('/v1/news')).status,503);assert.equal((await (await request('/health')).json()).api,false);
});
