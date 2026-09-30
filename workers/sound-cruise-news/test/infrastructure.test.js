import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{handleNewsRequest} from '../src/worker.js';
import {infrastructureConfig,parseWranglerJson} from '../scripts/remote-db.mjs';
import {runtimeSources} from '../src/runtime.js';
import {collectSource} from '../src/collector.js';
import {scheduledNews,COLLECTION_CRON} from '../src/scheduled.js';
import {publishAutomatic} from '../src/automatic.js';
import {administer} from '../src/admin.js';
import {NewsStore} from '../src/store.js';
import {database,pepper} from './helpers.js';
const config=JSON.parse(readFileSync(new URL('../wrangler.infrastructure.jsonc',import.meta.url)));
const now=Date.parse('2026-09-30T10:00:00+09:00');
test('infrastructure: Wrangler upload progress cannot obscure or truncate a JSON result',()=>{
 const value=[{success:true,results:[{count:0}]}];
 assert.deepEqual(parseWranglerJson(JSON.stringify(value)),value);
 assert.deepEqual(parseWranglerJson('├ Checking file\n├ Uploading\n'+JSON.stringify(value,null,2)),value);
 assert.throws(()=>parseWranglerJson('upload failed\n[{"success":true}'),/wrangler_json_result_missing/);
 assert.throws(()=>parseWranglerJson(JSON.stringify(value)+'\ntrailing error'),/wrangler_json_result_missing/);
});
test('infrastructure: deployed config requires collection hard OFF and explicitly empty Cron',()=>{
 assert.equal(infrastructureConfig(config),config);
 for(const patch of [{vars:{...config.vars,NEWS_COLLECTION_MODE:'production'}},{triggers:{crons:['0 21 * * *']}},{triggers:{}},{d1_databases:[{...config.d1_databases[0],binding:'SYNC_DB'}]}])assert.throws(()=>infrastructureConfig({...config,...patch}));
});
test('infrastructure: fresh migrations, manual route, scheduled and automatic paths cannot collect or publish',async()=>{
 const db=database(),store=new NewsStore(db),env={...config.vars,NEWS_DB:db,NEWS_HEADLINE_PEPPER:pepper};
 assert.equal((await store.controls()).collection_enabled,0);assert.equal((await store.controls()).publication_enabled,0);
 const registry=runtimeSources(env,undefined,now);assert.equal(registry.find(s=>s.id==='shimamura').enabled,true);
 let requests=0;const fetcher=async()=>{requests++;throw Error('publisher_request_forbidden');};
 const original=globalThis.fetch;globalThis.fetch=fetcher;
 try{
  assert.equal((await worker.fetch(new Request('https://news.example/admin/collect',{method:'POST'}),env)).status,405);
  assert.equal((await worker.fetch(new Request('https://news.example/admin/collect'),env)).status,404);
  assert.equal((await collectSource('shimamura',store,{mode:env.NEWS_COLLECTION_MODE,now,registry,fetcher,pepper})).outcome,'collection_off');
  assert.equal((await scheduledNews({cron:COLLECTION_CRON},env,{},now,{fetcher})).stopped,true);
  // Even accidental D1 switches cannot bypass the deployed env hard-off scheduled gate.
  await administer(store,{action:'collection-on',reason:'review_complete'},now);
  await administer(store,{action:'publish-on',reason:'review_complete'},now);
  assert.equal((await scheduledNews({cron:COLLECTION_CRON},env,{},now,{fetcher})).stopped,true);
  await administer(store,{action:'global-off',reason:'operator_stop'},now);
  assert.equal(await publishAutomatic(store,registry.find(s=>s.id==='shimamura'),registry,now,pepper),0);
  assert.equal(requests,0);assert.equal((await store.candidates()).length,0);
 }finally{globalThis.fetch=original;db.raw.close();}
});
test('infrastructure: empty API, category validation, isolated cache and kill controls',async()=>{
 const db=database(),store=new NewsStore(db),env={...config.vars,NEWS_DB:db};
 await administer(store,{action:'api-on',reason:'review_complete'},now);
 const registry=runtimeSources(env,undefined,now),map=new Map(),cache={match:async key=>map.get(key.url)?.clone(),put:async(key,value)=>map.set(key.url,value.clone())};
 const request=(path,origin='https://soundcruise.jp')=>handleNewsRequest(new Request('https://news.example'+path,{headers:{Origin:origin}}),env,now,{registry,cache});
 for(const path of ['/v1/news','/v1/news/ticker','/v1/news?category=sale','/v1/news?limit=1&offset=1','/v1/news?cursor='+encodeURIComponent(JSON.stringify(['2026-09-28T00:00:00.000Z','qa']))]){
  const response=await request(path);assert.equal(response.status,200);assert.deepEqual(await response.json(),{contractVersion:1,items:[],nextOffset:null,nextCursor:null});
 }
 assert.ok(map.size>=4);
 assert.equal((await request('/v1/news?category=unknown')).status,400);
 assert.equal((await request('/v1/news?cursor=invalid')).status,400);
 assert.equal((await request('/v1/news','http://localhost:8765')).status,403);
 assert.equal((await request('/v1/news','https://evil.example')).status,403);
 await administer(store,{action:'api-off',reason:'operator_stop'},now);
 assert.equal((await request('/v1/news')).status,503);
 assert.equal((await store.controls()).collection_enabled,0);assert.equal((await store.controls()).publication_enabled,0);
 db.raw.close();
});
test('infrastructure: category SQL and cache return only the selected category',async()=>{
 const db=database(),store=new NewsStore(db),env={...config.vars,NEWS_DB:db};
 await administer(store,{action:'api-on',reason:'review_complete'},now);
 for(const [id,category] of [['qa-a','acoustic_guitar'],['qa-b','amps_effects'],['qa-c','amps_effects']])await db.prepare(`INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,expires_at)
 VALUES(?,'shimamura','島村楽器',?,?,?,?,'QA用の独自説明',?,?,'approved','synthetic_test',?)`).bind(id,'https://www.shimamura.co.jp/update/amp-effector/2026/09/'+id+'/',id,'2026-09-29T00:00:00.000Z',category,id,'2026-09-29T00:00:00.000Z',now+86400000).run();
 const map=new Map(),cache={match:async key=>map.get(key.url)?.clone(),put:async(key,value)=>map.set(key.url,value.clone())};
 const request=path=>handleNewsRequest(new Request('https://news.example'+path),env,now,{registry:runtimeSources(env,undefined,now),cache});
 const first=await (await request('/v1/news?category=amps_effects&limit=1')).json();
 assert.equal(first.items.length,1);assert.equal(first.items[0].category,'amps_effects');assert.ok(first.nextCursor);
 const next=await (await request('/v1/news?category=amps_effects&limit=1&cursor='+encodeURIComponent(first.nextCursor))).json();
 assert.equal(next.items.length,1);assert.notEqual(next.items[0].id,first.items[0].id);assert.equal(next.nextCursor,null);
 const other=await (await request('/v1/news?category=acoustic_guitar&limit=1')).json();assert.equal(other.items[0].id,'qa-a');
 assert.equal((await (await request('/v1/news/ticker?category=dtm_software')).json()).items.length,0);
 db.raw.close();
});
