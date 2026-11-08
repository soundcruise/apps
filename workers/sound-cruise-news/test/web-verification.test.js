import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resultMetadata,generalPage,screenWebHint} from '../src/web-discovery-quality.js';
import {webVerification} from '../src/web-verification.js';
import {runWebDiscovery,saveHint,listWebHints} from '../src/web-discovery.js';
import {setup,cases,at} from './discovery-case.js';
import {store} from './helpers.js';
import {renderWebDiscovery} from '../operator-ui/web-discovery.js';

const live=JSON.parse(await readFile(new URL('./fixtures/web-quality-live-20261108.json',import.meta.url)));
const pilot=JSON.parse(await readFile(new URL('./fixtures/web-quality-pilot.json',import.meta.url)));
const policyRegistry=x=>x.registry.map(s=>({...s,enabled:false,productionEnabled:false}));
const now=Date.parse('2026-11-08T01:24:42Z');
const estimate={category:'アコギ関連',brand:'未確認',product:'未確認',event:'未確認',value:'high',priority:'high',relevance:'high',duplicate:'unknown',reason:'検索情報のみ。正式公開日は不明'};

test('actual 15 results retain 12 modification dates, zero publication dates; three indexes stay separate',()=>{
 const rows=live.queries.flatMap(q=>q.items.map((h,i)=>({h,m:resultMetadata(h,q.id,i+1)})));
 assert.equal(rows.length,15);assert.equal(rows.filter(x=>x.m.lastModifiedHint).length,12);
 assert(rows.every(x=>x.m.publishedAtHint===null&&x.m.dateSource==='unknown'));
 assert.equal(rows.filter(x=>generalPage(x.h.url)).length,3);
 assert.equal(generalPage('https://gibson.jp/news-events/27755'),false);
 const yamaha=rows.find(x=>x.h.url.includes('26110601'));
 assert.equal(yamaha.m.lastModifiedHint,'2026-11-06T01:00:00.000Z');
 assert.equal(screenWebHint(yamaha.h,yamaha.m,pilot.candidates,now).reason,'triage_date_unconfirmed');
 for(const old of rows.filter(x=>x.m.lastModifiedHint&&Date.parse(x.m.lastModifiedHint)<now-14*86400000))assert.equal(screenWebHint(old.h,old.m,pilot.candidates,now).ai,false);
 assert.equal(resultMetadata({lastModifiedDate:'invalid'},'q',1).lastModifiedHint,null);
 // An explicit old publication wins even if modification is recent.
 assert.equal(screenWebHint(yamaha.h,resultMetadata({...yamaha.h,publishedDate:'2020-01-01'},'q',1),[],now).reason,'old_publication_unverified');
});

test('actual response replay persists null publication, triages semantics once, keeps date verification separate',async()=>{
 const s=await store(),env={NEWS_DB:s.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["機材","アコギ","仕様"]'};
 let search=0,model=0;
 await runWebDiscovery(env,now,{search:async()=>live.queries[search++].items,classify:async hs=>{model++;return hs.map(()=>estimate);}});
 assert.equal(search,3);assert.equal(model,1); // Three fresh-modification article titles; no live AI.
 const hints=await listWebHints(env,now);
 assert.equal(hints.searches.flatMap(q=>q.results).length,15);
 const h=hints.items.find(h=>h.url.includes('26110601'));
 assert.equal(h.publishedAt,null);assert.equal(h.formalFacts,false);assert.equal(h.publicationCandidate,false);
 assert.equal(h.status,'hold');assert.equal(h.reason,'publication_verification_pending');
 assert.equal(h.estimate.priority,'low');assert.equal(h.searchMetadata.publishedAtHint,null);
 assert.equal(h.searchMetadata.lastModifiedHint,'2026-11-06T01:00:00.000Z');
 assert.equal(h.verification.path,'C');assert.equal(h.verification.sourceId,'yamaha-newsroom');
 assert.equal(h.verification.registrationAllowed,false);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM candidate_items').first()).n,0);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
 await runWebDiscovery(env,now+86400000,{search:async()=>[],classify:()=>assert.fail('same undated estimate must not be classified again')});
 const dom={createElement:()=>({children:[],append(...x){this.children.push(...x);},setAttribute(){}})};
 const view=JSON.stringify(renderWebDiscovery(dom,hints));
 assert(view.includes('更新日時ヒント（公開日ではありません）'));assert(view.includes('出典条件・事実の確認が必要'));
});

test('A/B follows real collector evidence without URL fetch, fake receipt or candidate registration',async()=>{
 // Synthetic permitted HTML fixture exercises the existing full formal pipeline;
 // this is not a claim about production evidence or live search quality.
 const x=await setup({list:[cases[0]]}),url=cases[0].sourceUrl;
 const hint={url,title:'正式な製品発表記事',provider:'exa',searchedAt:at};
 await saveHint(x.s.db,hint,at,{metadata:resultMetadata({},'legacy',1),screening:{status:'hold',reason:'publication_date_unconfirmed',ai:false}});
 const env={...x.env,NEWS_WEB_ENABLED:'true'};
 let v=await webVerification(env,at,{registry:policyRegistry(x)})(url);
 assert.equal(v.path,'B');assert.equal(v.reason,'listing_discovery_required');assert.equal(v.registrationAllowed,false);
 assert.equal(x.calls.length,0);
 assert.equal((await x.s.db.prepare('SELECT COUNT(*) n FROM news_discovery_receipts').first()).n,0);
 await x.run(); // The ordinary permitted collector alone creates formal evidence.
 const row=await x.s.db.prepare('SELECT * FROM candidate_items WHERE source_url=?').bind(url).first();
 assert(row);const before=JSON.stringify(row),calls=x.calls.length;
 const readonly={...env,NEWS_DB:{prepare(sql){assert.match(sql.trim(),/^SELECT /i,'resolver must be read only');return x.s.db.prepare(sql);}}};
 v=await webVerification(readonly,at,{registry:policyRegistry(x)})(url);
 assert.equal((await listWebHints(readonly,at)).items[0].verification.path,'A');
 assert.equal(v.path,'A');assert.equal(v.publishedAt,row.published_at);assert.equal(v.candidateId,row.id);assert.equal(v.revision,row.review_revision);
 assert.equal(x.calls.length,calls);assert.equal(JSON.stringify(await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first()),before);
 // Tampered/absent provenance must not be accepted as a confirmed date.
 await x.s.db.prepare('UPDATE candidate_items SET facts_provenance=NULL WHERE id=?').bind(row.id).run();
 v=await webVerification(env,at,{registry:policyRegistry(x)})(url);assert.equal(v.path,'B');assert.equal(v.publishedAt,null);
 await x.s.db.prepare('INSERT INTO news_takedowns VALUES(?,?)').bind(row.id,at+86400000).run();
 v=await webVerification(env,at,{registry:policyRegistry(x)})(url);assert.equal(v.path,'C');assert.equal(v.reason,'candidate_takedown');
});

test('B preserves discovery retry/budget and C protects source permission, paths and human decisions',async()=>{
 const x=await setup({list:[]}),url=cases[0].sourceUrl,next=at+2*86400000;
 await x.s.db.prepare("INSERT INTO news_discovery_work(source_id,normalized_url,first_seen_at,updated_at,processing_state,reason_code,next_at,next_action) VALUES('shimamura',?,?,?,'awaiting_fetch_budget','budget_deferred',?,'daily_recovery')").bind(url,at,at,next).run();
 const before=JSON.stringify(await x.s.db.prepare('SELECT * FROM news_discovery_work').all());
 let v=await webVerification(x.env,at,{registry:policyRegistry(x)})(url);assert.equal(v.path,'B');assert.equal(v.nextAt,next);assert.equal(v.nextAction,'daily_recovery');
 assert.equal(JSON.stringify(await x.s.db.prepare('SELECT * FROM news_discovery_work').all()),before);
 for(const raw of ['https://www.yamaha.com/ja/news_release/2026/26110601/','https://jp.yamaha.com/musical-instruments/guitars-basses-amps/products/guitar-amps/acompass60/','https://www.shimamura.co.jp/shops/store/article/','https://www.takamineguitars.co.jp/news/one','https://unknown.test/article']){
  v=await webVerification(x.env,at,{registry:policyRegistry(x)})(raw);assert.equal(v.path,'C');assert.equal(v.registrationAllowed,false);assert.equal(v.publishedAt,null);
 }
 await x.s.db.prepare("UPDATE source_state SET disabled=1 WHERE source_id='shimamura'").run();
 assert.equal((await webVerification(x.env,at,{registry:policyRegistry(x)})(url)).path,'C');
 assert.equal(x.calls.length,0);
});
