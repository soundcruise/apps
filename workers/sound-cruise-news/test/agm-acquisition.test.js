import test from 'node:test';import assert from 'node:assert/strict';
import {collectSource} from '../src/collector.js';
import {AGM_SURFACES} from '../src/agm-sections.js';
import {AGM_ARTICLE_PARSER} from '../src/agm-article-evidence.js';
import {inspectAgmArticle,acquireAgmArticle,agmRevalidationDays} from '../src/agm-acquisition.js';
import {runtimeSources} from '../src/runtime.js';
import {publicationValidation} from '../src/decision-policy.js';
import {recheckFacts} from '../src/facts-recheck.js';
import {reviewDetail} from '../src/operator-review.js';
import {getSource} from '../src/registry.js';import {DAY,hash} from '../src/policy.js';
import {store,pepper} from './helpers.js';
const t=Date.parse('2026-10-21T00:00:00Z'),date='2026-10-20T00:00:00.000Z',robot='User-agent: *\nAllow: /',base='https://acousticguitarmagazine.jp';
const url=n=>`${base}/2026-1020-fixture-${n}/`,title=n=>`シンガー・ソングライターの合成奏者がEP『空の歌${n}』をリリース`;
function article(n,headline=title(n)){return `<link rel="canonical" href="${url(n)}"><h1>${headline}</h1><meta property="article:published_time" content="${date}"><main class="post-item"><article><p>シンガー・ソングライターの合成奏者がEP『空の歌${n}』をリリースする。DO_NOT_STORE_ARTICLE_BODY</p></article></main>`;}
const card=(n,headline=title(n))=>`<div class="post-wrap"><a class="post-obj" href="${url(n)}"><div class="post-obj-title">${headline}</div></a></div>`;
function feed(section){return '<rss><channel>'+Array.from({length:10},(_,n)=>`<item><title>アコギのadd9を詳しく解説</title><link>${base}/${section}/2026-1020-fixture-${n}/</link><pubDate>Tue, 20 Oct 2026 00:00:00 GMT</pubDate></item>`).join('')+'</channel></rss>';}
async function setup(extra={},db){
 const s=await store(db),source={...getSource('agm'),enabled:true,productionEnabled:true,robotsHash:await hash(robot),...extra},calls=[];
 const state={ids:Array.from({length:9},(_,i)=>i),headlines:{},pages:{},status:{}};
 const fetcher=async(u,options)=>{calls.push({url:u,headers:options.headers});const surface=AGM_SURFACES.find(x=>x.url===u),n=Number(u.match(/fixture-(\d+)\//)?.[1]);
  if(u===source.robotsUrl)return new Response(robot);
  if(surface)return new Response(surface.type==='rss'?feed(surface.section):state.ids.map(i=>card(i,state.headlines[i])).join(''),{headers:{'Content-Type':surface.type==='rss'?'application/rss+xml':'text/html'}});
  const status=state.status[n]||200;
  return new Response(status===304?null:state.pages[n]??article(n,state.headlines[n]),{status,headers:{'Content-Type':'text/html',ETag:`"article-${n}"`,'Last-Modified':'Tue, 20 Oct 2026 00:00:00 GMT'}});
 };
 const collect=at=>collectSource('agm',s,{mode:'production',registry:[source],now:at,pepper,clock:()=>at,sleep:async()=>{},requestMode:'scheduled',jstDay:new Date(at+9*3600000).toISOString().slice(0,10),fetcher});
 return {s,source,state,calls,collect};
}
test('six sections: cold 16 → warm 7 requests; same discovery, facts, original dates, published rows and teachers',async()=>{
 const {s,calls,collect}=await setup();const first=await collect(t);assert.equal(first.requests,16);assert.equal(first.candidates,59);
 s.db.raw.exec("UPDATE candidate_items SET review_status='approved' WHERE source_id='agm'");const before=await s.candidates();calls.length=0;
 const second=await collect(t+DAY);assert.equal(second.outcome,'collected');assert.equal(second.requests,7);assert.equal(second.articleCache.hits,9);assert.equal(second.candidates,59);assert.equal(second.sections.length,6);
 assert.equal(calls.filter(x=>x.url===base+'/news/').length,1);assert.equal(calls.filter(x=>x.url.endsWith('feed/')).length,5);assert.equal(calls.filter(x=>x.url.endsWith('robots.txt')).length,1);
 assert.deepEqual(await s.candidates(),before);
 for(const table of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'])assert.equal(s.db.raw.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
 const cache=JSON.stringify(s.db.raw.prepare('SELECT * FROM news_agm_article_cache').all());assert(!cache.includes('DO_NOT_STORE_ARTICLE_BODY'));assert(!cache.includes(title(0)));
});
test('new article alone adds one detail GET, 8 total; no automatic approval',async()=>{
 const {s,state,calls,collect}=await setup();await collect(t);state.ids=[9,0,1,2,3,4,5,6,7];calls.length=0;const r=await collect(t+DAY);
 assert.equal(r.outcome,'collected');assert.equal(r.requests,8);assert.equal(r.articleCache.hits,8);assert.equal(calls.filter(x=>x.url===url(9)).length,1);
 assert.equal((await s.db.prepare('SELECT * FROM candidate_items WHERE source_url=?').bind(url(9)).first()).review_status,'pending');
});
test('missing cache can reuse valid retained facts/provenance; obsolete parser and missing provenance cannot bootstrap',async()=>{
 for(const change of ['valid','obsolete','missing']){
  const {s,collect,calls}=await setup();await collect(t);await s.db.prepare('DELETE FROM news_agm_article_cache').run();
  if(change==='missing')await s.db.prepare('UPDATE candidate_items SET facts_provenance=NULL WHERE source_url=?').bind(url(0)).run();
  if(change==='obsolete'){const row=await s.db.prepare('SELECT facts_provenance FROM candidate_items WHERE source_url=?').bind(url(0)).first();await s.db.prepare('UPDATE candidate_items SET facts_provenance=? WHERE source_url=?').bind(row.facts_provenance.replaceAll(AGM_ARTICLE_PARSER,'obsolete'),url(0)).run();}
  calls.length=0;const r=await collect(t+DAY);assert.equal(r.outcome,'collected');assert.equal(r.requests,change==='valid'?7:8);
 }
});
for(const kind of ['corrupt','parser','provenance','facts','date'])test('cache '+kind+' fails closed to a single unconditional detail GET',async()=>{
 const {s,collect,calls}=await setup();await collect(t);
 const row=await s.db.prepare('SELECT * FROM news_agm_article_cache WHERE canonical_url=?').bind(url(0)).first(),p=JSON.parse(row.payload_json);
 if(kind==='missing')await s.db.prepare('DELETE FROM news_agm_article_cache WHERE canonical_url=?').bind(url(0)).run();
 else{if(kind==='parser')p.parser='obsolete';if(kind==='provenance')p.item.factsProvenance='[]';if(kind==='facts')p.item.productFacts=null;if(kind==='date')p.item.publishedAt='2026-10-19T00:00:00.000Z';const json=kind==='corrupt'?'{broken':JSON.stringify(p);await s.db.prepare('UPDATE news_agm_article_cache SET payload_json=?,payload_hash=? WHERE canonical_url=?').bind(json,await hash(json),url(0)).run();}
 calls.length=0;const r=await collect(t+DAY);assert.equal(r.outcome,'collected');assert.equal(r.requests,8);const detail=calls.find(x=>x.url===url(0));assert(detail);assert.equal(detail.headers['If-None-Match'],undefined);
});
test('changed listing headline bypasses cache and validators; previous published article is preserved',async()=>{
 const {s,collect,state,calls}=await setup();await collect(t);s.db.raw.exec("UPDATE candidate_items SET review_status='approved'");const before=await s.candidates();state.headlines[0]='シンガー・ソングライターの合成奏者がEP『別の空の歌』をリリース';calls.length=0;
 const r=await collect(t+DAY);assert.equal(r.requests,8);assert.equal(calls.find(x=>x.url===url(0)).headers['If-None-Match'],undefined);assert.deepEqual(await s.candidates(),before);
});
test('7-day revalidation uses ETag and Last-Modified; 304 keeps the original 200 provenance and timestamp',async()=>{
 const {s,collect,state,calls,source}=await setup();await collect(t);const initial=(await inspectAgmArticle(s,source,url(0),t,pepper,{listingTitle:title(0)})).payload;
 for(let i=0;i<9;i++)state.status[i]=304;calls.length=0;const r=await collect(t+7*DAY);assert.equal(r.outcome,'collected');assert.equal(r.requests,16);assert.equal(r.articleCache.notModified,9);assert.equal(r.articleCache.fetched,0);
 const request=calls.find(x=>x.url===url(0));assert.equal(request.headers['If-None-Match'],'"article-0"');assert.equal(request.headers['If-Modified-Since'],'Tue, 20 Oct 2026 00:00:00 GMT');
 const result=await inspectAgmArticle(s,source,url(0),t+7*DAY,pepper,{listingTitle:title(0)});assert(result.hit);assert.deepEqual(result.payload,initial);assert.equal(result.row.checked_at,t+7*DAY);assert.equal(result.payload.proof.verifiedAt,t);
 calls.length=0;assert.equal((await collect(t+8*DAY)).requests,7);
});
test('unbound 304 is rejected, never treated as new evidence',async()=>{const {collect,state,s}=await setup();state.status[0]=304;const r=await collect(t);assert.notEqual(r.outcome,'collected');assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM candidate_items WHERE source_url=?').bind(url(0)).first()).n,0);});
test('incomplete same-day evidence is not fetched again by facts recheck',async()=>{
 const {collect,state,s,source,calls}=await setup();state.headlines[0]='合成奏者が語る未知の話題';state.pages[0]=article(0,state.headlines[0]);await collect(t);
 const row=await s.db.prepare('SELECT * FROM candidate_items WHERE source_url=?').bind(url(0)).first(),d=await reviewDetail(s,row.id,t,[source],pepper);calls.length=0;
 const out=await recheckFacts(s,{id:row.id,revision:d.revision,snapshot:d.snapshot,requestId:crypto.randomUUID()},t,[source],pepper,{type:'system_recheck',id:'test'},{fetcher:async()=>{throw Error('unexpected HTTP');},sleep:async()=>{}});
 assert.equal(out.recovered,false);assert.equal(calls.length,0);assert.equal(out.validation.valid,false);
});
test('complete discovery evidence is reused by recheck without HTTP and still receives formal validation',async()=>{
 const {collect,s,source}=await setup();await collect(t);s.db.raw.exec("UPDATE news_controls SET publication_enabled=1");
 const row=await s.db.prepare('SELECT * FROM candidate_items WHERE source_url=?').bind(url(0)).first();assert.equal((await publicationValidation(s,row,t,[source],pepper)).valid,true);
 // Simulate a pending candidate whose facts were not persisted, while the shared
 // receipt still contains the original normalized evidence. No human facts input.
 await s.db.prepare('UPDATE candidate_items SET product_facts=NULL WHERE id=?').bind(row.id).run();const d=await reviewDetail(s,row.id,t,[source],pepper);
 const out=await recheckFacts(s,{id:row.id,revision:d.revision,snapshot:d.snapshot,requestId:crypto.randomUUID()},t,[source],pepper,{type:'system_recheck',id:'test'},{fetcher:async()=>{throw Error('unexpected HTTP');},sleep:async()=>{}});
 assert.equal(out.recovered,true);assert.equal(out.validation.valid,true);
});
test('revalidation config is shared by both runtimes and bounded; default remains seven days',()=>{
 assert.equal(agmRevalidationDays(),7);for(const v of ['0','31','bad','1.5'])assert.equal(agmRevalidationDays(v),7);
 assert.equal(runtimeSources({NEWS_SOURCE_IDS:'["agm"]',NEWS_AGM_REVALIDATION_DAYS:'3'},undefined,t).find(s=>s.id==='agm').agmRevalidationDays,3);
});
test('URL lease prevents concurrent collector/recheck requests; explicit correction may revalidate a fresh cache',async()=>{
 const {s,source,collect}=await setup();await collect(t);const initial=await inspectAgmArticle(s,source,url(0),t,pepper),payload=initial.payload;
 await s.db.prepare('UPDATE news_agm_article_cache SET lease_until=? WHERE canonical_url=?').bind(t+60000,url(0)).run();
 await assert.rejects(acquireAgmArticle({store:s,source,url:url(0),now:t,pepper,request:()=>assert.fail('HTTP')}),/busy/);
 await s.db.prepare('UPDATE news_agm_article_cache SET lease_until=0 WHERE canonical_url=?').bind(url(0)).run();let count=0;
 const out=await acquireAgmArticle({store:s,source,url:url(0),now:t+1,pepper,forceRevalidate:true,request:async(_,o)=>{count++;assert.equal(o.headers['If-None-Match'],undefined);return {status:200,headers:new Headers({'content-type':'text/html'}),text:'transient'};},parse:async()=>payload});assert.equal(count,1);assert.equal(out.cache,'fetched');
});
for(const status of [403,429])test('HTTP '+status+' on revalidation preserves stop/backoff and cannot fall back to stale evidence',async()=>{
 const {collect,s,source,state}=await setup();await collect(t);state.status[0]=status;const r=await collect(t+7*DAY);assert.notEqual(r.outcome,'collected');const stateRow=await s.state('agm');if(status===403)assert(stateRow.disabled);else assert(stateRow.backoffUntil>t+7*DAY);
 assert.equal((await inspectAgmArticle(s,source,url(0),t+7*DAY,pepper)).hit,false);
});
test('cache retention is bounded without removing active 7-day evidence',async()=>{const {s,collect}=await setup();await collect(t);await s.purge(t+2*DAY);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM news_agm_article_cache').get().n,9);await s.purge(t+91*DAY);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM news_agm_article_cache').get().n,0);});
test('cache reuse never extends the original 90-day publication window',async()=>{
 const {s,collect,source}=await setup({agmRevalidationDays:30});await collect(t);const row=await s.db.prepare('SELECT * FROM candidate_items WHERE source_url=?').bind(url(0)).first();
 await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();await s.recordHealth({sourceId:'agm',status:'healthy',reasonCode:'ok',checkedAt:t+90*DAY,successfulAt:t+90*DAY});
 assert((await publicationValidation(s,row,t+90*DAY,[source],pepper)).errors.includes('expired_candidate'));
});
test('opt-out is enforced on revalidation and no saved evidence can bypass a stopped source',async()=>{
 const {s,collect,state,source}=await setup();await collect(t);state.pages[0]='<meta name="robots" content="noindex">'+article(0);const r=await collect(t+7*DAY);assert.notEqual(r.outcome,'collected');assert((await s.state('agm')).disabled);
 const row=await s.db.prepare('SELECT * FROM candidate_items WHERE source_url=?').bind(url(0)).first(),d=await reviewDetail(s,row.id,t+7*DAY,[source],pepper);
 await assert.rejects(recheckFacts(s,{id:row.id,revision:d.revision,snapshot:d.snapshot,requestId:crypto.randomUUID()},t+7*DAY,[source],pepper,{type:'system_recheck',id:'test'},{fetcher:()=>assert.fail('HTTP')}),/facts_source_gate/);
});
test('real local workerd/D1: warm discovery skips details and a concurrent shared URL claim has one winner',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{localDatabase}=await import('../scripts/local-db.mjs');
 const dir=await mkdtemp(join(tmpdir(),'news-agm-cache-d1-'));let runtime;
 try{runtime=await localDatabase(dir);const {s,source,collect}=await setup({},runtime.db);assert.equal((await collect(t)).requests,16);assert.equal((await collect(t+DAY)).requests,7);
  let release,started;const barrier=new Promise(r=>release=r),ready=new Promise(r=>started=r),cached=await inspectAgmArticle(s,source,url(0),t+DAY,pepper);
  const params={store:s,source,url:url(0),now:t+2*DAY,pepper,forceRevalidate:true,request:async()=>{started();await barrier;return {status:200,headers:new Headers({'content-type':'text/html'}),text:'transient'};},parse:async()=>cached.payload};
  const first=acquireAgmArticle(params);await ready;try{await assert.rejects(acquireAgmArticle({...params,request:()=>assert.fail('duplicate HTTP')}),/busy/);}finally{release();}assert.equal((await first).cache,'fetched');
  for(const table of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'])assert.equal((await s.db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
