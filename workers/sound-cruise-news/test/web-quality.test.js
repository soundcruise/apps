import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localDatabase} from '../scripts/local-db.mjs';
import {DEFAULT_WEB_QUERIES,searchPlan,publicSearchUrl,resultMetadata,screenWebHint,searchDate} from '../src/web-discovery-quality.js';
import {runWebDiscovery,llmAdapter,listWebHints} from '../src/web-discovery.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/web-quality-pilot.json',import.meta.url)));
const now=Date.parse('2026-11-08T00:00:00Z');
const estimate={category:'アコギ',brand:'未確認',product:'未確認',event:'未確認',value:'medium',priority:'medium',relevance:'high',duplicate:'unknown',reason:'公開日と言語は正式確認が必要'};

test('three independent lanes stay within binding parameters; date range is not a native filter',()=>{
 const plans=searchPlan(DEFAULT_WEB_QUERIES,now);assert.equal(plans.length,3);
 assert.match(plans[0].query,/アコースティックギター/);assert.match(plans[1].query,/新興ブランド/);assert.match(plans[2].query,/アコギアンプ.*録音/);
 assert(plans.every(p=>p.query.includes('2026-10-25〜2026-11-08')));
 assert.notEqual(plans[0].query,searchPlan(DEFAULT_WEB_QUERIES,now+86400000)[0].query);
 assert.equal(searchDate('2026-02-30'),null);assert.equal(searchDate('2026-11-06T00:00:00+09:00'),'2026-11-06T00:00:00+09:00');
 const m=resultMetadata({last_modified:'2026-11-06',description:'must not be stored',text:'private body'},'q',1);
 assert.equal(m.publishedAtHint,null);assert.equal(m.lastModifiedHint,'2026-11-06');assert(!JSON.stringify(m).includes('private body'));
});

test('URLs coalesce tracking aliases, preserve WordPress IDs and never log secret query values',()=>{
 assert.equal(publicSearchUrl('https://example.test/news?utm_source=mail#one'),'https://example.test/news');
 assert.equal(publicSearchUrl('https://example.test/?p=14400'),'https://example.test/?p=14400');
 for(const u of ['javascript:bad','https://u:secret@example.test/news','https://example.test/news?token=secret','https://example.test/news?email=owner@example.test'])assert.equal(publicSearchUrl(u),null);
});

test('actual 45 + baseline 13: no invented publication dates; independent dates are a separate simulation',async()=>{
 assert.equal(fixture.hints.length,58);assert.equal(fixture.hints.filter(h=>h.pilot).length,45);assert.equal(fixture.candidates.length,259);
 const raw=fixture.hints.map(h=>({...h,screen:screenWebHint(h,resultMetadata(h,'raw',1),fixture.candidates,now)}));
 assert(raw.every(h=>!h.screen.ai)); // Actual URL/title-only payload cannot establish freshness.
 const dated=fixture.hints.filter(h=>h.pilot).map(h=>({...h,screen:screenWebHint(h,resultMetadata({...h,publishedDate:h.independentlyCheckedDate},'simulated-date',1),fixture.candidates,now)}));
 const datedOld=dated.filter(h=>h.independentlyCheckedDate&&h.independentlyCheckedDate<'2026-10-25');
 assert.equal(datedOld.length,12);assert(datedOld.every(h=>!h.screen.ai));
 for(const title of ['LNN-GMA #1103','LNN-GQM #1104','Infinite'])assert(dated.find(h=>h.title.includes(title)).screen.ai===false);
 const fg=raw.filter(h=>h.title.includes('FG7')&&h.title.includes('FS7')&&!h.url.includes('lineup'));
 assert.equal(fg.length,2);assert(fg.every(h=>h.screen.reason==='known_product_event_unconfirmed'));
 const report={scope:'Offline screening, not search recall or model accuracy',raw58:count(raw),rawPilot45:count(raw.filter(h=>h.pilot)),baselineTitleOnlyAiEligible45:fixture.hints.filter(h=>h.pilot&&/[\u3040-\u30ff\u3400-\u9fff]/u.test(h.title)).length,datedSimulation45:count(dated),confirmedOldDateLabels:datedOld.length,paidCalls:0};
 await writeFile(new URL('../.local/web-quality-evaluation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 function count(rows){return {n:rows.length,aiEligible:rows.filter(h=>h.screen.ai).length,reasons:Object.fromEntries([...new Set(rows.map(h=>h.screen.reason))].map(k=>[k,rows.filter(h=>h.screen.reason===k).length]))};}
});

test('new date hints admit comparison items for triage; absent dates hold; formal known news avoids AI',()=>{
 for(const h of fixture.comparisons){
  assert.equal(screenWebHint(h,resultMetadata(h,'comparison',1),[],now).ai,true);
  assert.equal(screenWebHint(h,resultMetadata({},'missing',1),[],now).reason,'publication_date_unconfirmed');
 }
 const fg=fixture.hints.find(h=>h.url.includes('26091801'));
 const special={...fg,title:'Yamaha FG7限定ブラックの新色が発売'};
 assert.notEqual(screenWebHint(special,resultMetadata({publishedDate:'2026-11-06'},'q',1),fixture.candidates,now).reason,'known_product_event_unconfirmed');
 const collision={...fg,title:'別ブランド FG7X 新製品を発売'};
 assert.equal(screenWebHint(collision,resultMetadata({publishedDate:'2026-11-06'},'q',1),fixture.candidates,now).ai,true);
});

test('D1 trace preserves every returned rank, safe exclusions and no formal NEWS writes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'web-quality-'));const r=await localDatabase(dir);
 try{
  const env={NEWS_DB:r.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["試験"]',NEWS_WEB_DENIED_HOSTS:'["blocked.test"]'};let ai=0;
  const items=[fixture.comparisons[0],{...fixture.comparisons[0],url:fixture.comparisons[0].url+'?utm_source=again'},
   {url:'https://blocked.test/article',title:'新製品'},{url:'https://example.test/news?token=NEVER_STORE',title:'secret'},
   {url:'https://example.test/about',title:'製品紹介'},{url:'https://example.test/unknown',title:'日付不明の新製品'},
   {url:'https://example.test/old',title:'古い日本語記事',publishedDate:'2022-08-12'},
   {url:'https://example.test/english',title:'New acoustic model',publishedDate:'2026-11-06'}];
  await runWebDiscovery(env,now,{search:async()=>items,classify:async hs=>{ai++;return hs.map(()=>estimate);}});
  const view=await listWebHints(env,now);assert.equal(view.searches.length,1);const results=view.searches[0].results;
  assert.equal(results.length,8);assert.deepEqual(results.map(x=>x.rank),[1,2,3,4,5,6,7,8]);
  assert.deepEqual(results.map(x=>x.reason),['triage_pending_unverified','same_result_url','source_policy_denied','invalid_or_private_url','general_page','publication_date_unconfirmed','old_publication_unverified','japanese_article_unconfirmed']);
  assert(!JSON.stringify(view).includes('NEVER_STORE'));assert.equal(ai,1);assert(view.items.every(h=>h.formalFacts===false&&h.publishedAt===null));
  await runWebDiscovery(env,now,{search:async()=>items,classify:()=>assert.fail('known hints must not repeat AI')});
  assert((await listWebHints(env,now)).searches.some(s=>s.results.some(x=>x.reason==='known_web_url')));
  assert.equal((await r.db.prepare('SELECT COUNT(*) n FROM candidate_items').first()).n,0);
  assert.equal((await r.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
  // Missing dates are filled only when an actual new result supplies a date;
  // last-modified alone cannot release a hold.
  await runWebDiscovery(env,now+86400000,{search:async()=>[{url:'https://example.test/unknown',title:'日付不明の新製品',publishedDate:'2026-11-06'}],classify:async hs=>{ai++;return hs.map(()=>estimate);}});
  assert.equal(ai,2);
 }finally{await r.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('Gemma/Qwen3.8 contracts accept structured or chat JSON and never retry/fallback',async()=>{
 for(const model of ['@cf/google/gemma-4-26b-a4b-it','@cf/qwen/qwen3.8-27b']){
  let calls=0;
  const ai={run:async(name,input)=>{calls++;assert.equal(name,model);assert.equal(input.max_completion_tokens,1500);assert.equal(input.max_tokens,undefined);assert.equal(input.response_format.type,'json_schema');assert(!input.messages[1].content.includes('/no_think'));return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[estimate]})}}],usage:{prompt_tokens:100,completion_tokens:100}};}};
  assert.deepEqual(await llmAdapter(ai,model)([fixture.comparisons[0]]),[estimate]);assert.equal(calls,1);
  await assert.rejects(llmAdapter({run:async()=>{calls++;throw Error('private');}},model)([]),{message:'model_request_failed'});assert.equal(calls,2);
 }
 await assert.rejects(llmAdapter({run:async()=>({choices:[{finish_reason:'content_filter',message:{content:'{}'}}]})},'@cf/google/gemma-4-26b-a4b-it')([]),{message:'model_output_incomplete'});
});

test('trace cap, expiry, unknown ACK and disabled mode do not create extra calls',async()=>{
 assert.deepEqual(await runWebDiscovery({NEWS_WEB_ENABLED:'false',NEWS_DB:{prepare:()=>assert.fail()}},now),{disabled:true});
 const dir=await mkdtemp(join(tmpdir(),'web-log-bounds-'));const r=await localDatabase(dir);
 try{
  const env={NEWS_DB:r.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["query"]'};
  const statements=Array.from({length:200},(_,i)=>r.db.prepare("INSERT INTO news_web_searches VALUES(?, 'q', ?, 'query','exa','started','[]',?)").bind('filled-'+i,now,now+86400000));await r.db.batch(statements);
  let calls=0;await assert.rejects(runWebDiscovery(env,now,{search:async()=>{calls++;return [];}}),{message:'web_search_log_full'});assert.equal(calls,0);
  await runWebDiscovery(env,now+2*86400000,{search:async()=>{calls++;throw Error('secret body');},classify:()=>assert.fail()});
  const log=await listWebHints(env,now+2*86400000);assert.equal(log.searches.length,1);assert.equal(log.searches[0].outcome,'search_failed');assert(!JSON.stringify(log).includes('secret body'));
  assert.equal((await r.db.prepare('SELECT COUNT(*) n FROM news_web_searches').first()).n,1);
  assert.equal((await r.db.prepare('SELECT lock_until FROM news_web_runs ORDER BY day DESC LIMIT 1').first()).lock_until,0);
 }finally{await r.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('matching long title is only an uncertain article alias; distinct title/spec stays eligible',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'web-alias-'));const r=await localDatabase(dir);
 try{
  const env={NEWS_DB:r.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["query"]'};let calls=0;
  const title='未知工房のアコースティックギター「MODEL-100」が正式に新発売';
  await runWebDiscovery(env,now,{search:async()=>[
   {url:'https://one.test/article',title,publishedDate:'2026-11-06'},
   {url:'https://two.test/article',title,publishedDate:'2026-11-06'},
   {url:'https://two.test/limited',title:title+' 限定ブラック',publishedDate:'2026-11-06'}],classify:async hs=>{calls+=hs.length;return hs.map(()=>estimate);}});
  assert.equal(calls,2);const h=await listWebHints(env,now);
  assert.equal(h.items.find(x=>x.url==='https://two.test/article').reason,'same_title_article_unconfirmed');
  assert.equal(h.items.find(x=>x.url==='https://two.test/limited').status,'classified');
  assert.equal((await r.db.prepare('SELECT COUNT(*) n FROM news_takedowns').first()).n,0);
 }finally{await r.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('metadata-only legacy holds do not starve a new classifiable item',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'web-backlog-'));const r=await localDatabase(dir);
 try{
  const {saveHint}=await import('../src/web-discovery.js');
  for(let i=0;i<20;i++)await saveHint(r.db,{url:`https://example.test/legacy-${i}`,title:`旧ヒント ${i}`,provider:'exa',searchedAt:now-86400000},now);
  let calls=0;
  const out=await runWebDiscovery({NEWS_DB:r.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["試験"]'},now,{search:async()=>[{url:'https://example.test/new',title:'新しい記事',publishedDate:'2026-11-06'}],classify:async hs=>{calls++;return hs.map(()=>estimate);}});
  assert.equal(calls,1);assert.equal(out.processed,1);
  assert.equal((await r.db.prepare("SELECT COUNT(*) n FROM news_web_hints WHERE reason='publication_date_unconfirmed'").first()).n,20);
 }finally{await r.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('0026 is additive: old hint rows and old SELECT/INSERT contracts survive',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const {migrationStatements}=await import('../scripts/migration-statements.mjs');
 const mf=new Miniflare(convertV4MiniflareOptions({name:'migration-compat',modules:true,script:'export default {fetch(){return new Response("local");}}',compatibilityDate:'2026-09-18',d1Databases:{NEWS_DB:'00000000-0000-0000-0000-000000000001'}}));
 try{
  const db=await mf.getD1Database('NEWS_DB');
  // Original 0025 shape, including old worker INSERT columns, independent of
  // the new code's schema creation. No original rows are rewritten by 0026.
  await db.batch(migrationStatements(await readFile(new URL('../migrations/0025_web_discovery.sql',import.meta.url),'utf8')).map(s=>db.prepare(s)));
  const insert=()=>db.prepare("INSERT INTO news_web_hints(url,title,provider,searched_at,last_seen_at,status,reason,estimate_json,expires_at,attempts,retry_at) VALUES('https://old.test/news','旧ヒント','exa',1,1,'hold','classification_failed',NULL,9999999999999,2,99)");
  await insert().run();const before=await db.prepare('SELECT url,title,provider,status,attempts,retry_at,estimate_json FROM news_web_hints').first();
  await db.batch(migrationStatements(await readFile(new URL('../migrations/0026_web_search_quality.sql',import.meta.url),'utf8')).map(s=>db.prepare(s)));
  assert.deepEqual(await db.prepare('SELECT url,title,provider,status,attempts,retry_at,estimate_json FROM news_web_hints').first(),before);
  assert.equal((await db.prepare('SELECT search_meta_json FROM news_web_hints').first()).search_meta_json,null);
  await db.prepare('DELETE FROM news_web_hints').run();await insert().run();
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM news_web_hints').first()).n,1);
 }finally{await mf.dispose();}
});
