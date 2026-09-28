import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localDatabase} from '../scripts/local-db.mjs';
import {collectSource} from '../src/collector.js';
import {reviewCandidate} from '../src/review.js';
import {handleNewsRequest} from '../src/worker.js';
import {administer} from '../src/admin.js';
import {scheduledPurge} from '../src/retention.js';
import {pepper,registry,options,approval,store as enableStore,env} from './helpers.js';
test('real local D1: migration, pending, approval/API pagination, retention and kill',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'news-d1-test-'));let runtime;
 try{
  runtime=await localDatabase(dir);const {store,db}=runtime;await enableStore(db);const now=Date.parse('2026-09-28T12:00:00Z');
  const xml='<rss><channel>'+[1,2,3].map(i=>`<item><title>Universal Audio LUNA ${i} 新機能アップデートの紹介</title><link>https://sleepfreaks-dtm.com/dtm-materials/qa-${i}</link><pubDate>2026-09-28T00:00:00Z</pubDate></item>`).join('')+'</channel></rss>';
  const r=await collectSource('sleepfreaks',store,{...options(),now,fetcher:async url=>new Response(url.endsWith('robots.txt')?'User-agent: *\nAllow: /':xml,{headers:{'content-type':'application/xml'}})});
  assert.equal(r.pending,3);
  const request=path=>handleNewsRequest(new Request('http://localhost'+path),env(db),now,{registry});
  assert.equal((await (await request('/v1/news')).json()).items.length,0);
  for(const item of await store.candidates())await reviewCandidate(store,{...approval(item),label:'音楽制作ツールの更新内容を確認する'},now,registry,pepper);
  const first=await (await request('/v1/news?limit=2')).json();assert.equal(first.items.length,2);assert.equal(first.nextOffset,2);
  const second=await (await request('/v1/news?limit=2&offset=2')).json();assert.equal(second.items.length,1);assert.equal(second.nextOffset,null);
  assert.equal((await (await request('/v1/news/ticker')).json()).items.length,3);
  await administer(store,{action:'source-delete',target:'sleepfreaks',reason:'owner_request'},now);assert.equal((await (await request('/v1/news')).json()).items.length,0);
  const counts=await scheduledPurge({},env(db),{},now+91*86400000);assert.ok(counts.runs>=1);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
