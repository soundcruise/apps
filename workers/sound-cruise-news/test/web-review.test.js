import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {webReviewDisposition,addWebReview,setWebHintReview,webHintSnapshot} from '../src/web-review.js';
import {webArticleDraft,saveHint,listWebHints,runWebDiscovery} from '../src/web-discovery.js';
import {assistedSource} from '../src/assisted-facts.js';import {hash} from '../src/policy.js';import {store} from './helpers.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/web-review-projection.json',import.meta.url))),now=Date.parse(fixture.at),actor={type:'human_operator',id:'fixture-human'};
const project=r=>({...r,articleDraft:webArticleDraft(r),estimate:JSON.parse(r.estimate_json),searchMetadata:JSON.parse(r.search_meta_json||'null'),humanEntry:assistedSource(r.url),existingCandidate:fixture.known.find(c=>c.source_url===r.url)?{id:fixture.known.find(c=>c.source_url===r.url).id,status:'approved'}:null});
const disposition=r=>webReviewDisposition(project(r),fixture.known,now);
test('32 saved projections: useful drafts reach human review, no formal READY is invented',()=>{
 const counts={};for(const r of fixture.hints){const v=disposition(r);counts[v.queue]=(counts[v.queue]||0)+1;assert.equal(v.formalReady,false);}assert.deepEqual(counts,{low:23,judgment:8,existing:1});
 for(const text of ['LL56','100周年','浜田省吾','Eastman','Mukae'])assert.equal(disposition(fixture.hints.find(r=>r.title.includes(text))).queue,'judgment',text);
 const b=fixture.hints.filter(r=>disposition(r).queue==='judgment');assert.equal(b.filter(r=>!project(r).humanEntry).length,7);
 const published=fixture.hints.find(r=>r.url.includes('26110601'));assert.equal(disposition(published).queue,'existing');
 assert(fixture.hints.filter(r=>disposition(r).reason==='possible_known_event').every(r=>disposition(r).candidateId));
});
test('unknown date, AI low value, unsupported source and old SEARCH time do not hide a reviewable draft',()=>{
 const r=project(fixture.hints.find(r=>r.title.includes('Mukae')));r.searched_at=now-20*86400000;assert.equal(r.estimate.value,'low');assert.equal(webReviewDisposition(r,[],now).queue,'judgment');assert.equal(r.articleDraft.fields.publishedAt,'');
 r.searchMetadata={lastModifiedHint:'2026-11-11'};assert.equal(webReviewDisposition(r,[],now).queue,'judgment');assert.equal(r.articleDraft.fields.publishedAt,'');
});
test('dates in URLs only lower priority; restored soft holds remain unverified; hard stops cannot be restored',()=>{
 const item=project(fixture.hints.find(r=>r.url.includes('20251016')));assert.equal(webReviewDisposition(item,[],now).reason,'archive_or_old_url_hint');assert.equal(item.articleDraft.fields.publishedAt,'');
 item.reason='web_review:review:human-request-0001';assert.equal(webReviewDisposition(item,[],now).queue,'judgment');item.reviewBlocked='candidate_takedown';assert.equal(webReviewDisposition(item,[],now).blocked,true);
 item.existingCandidate={id:'existing',status:'rejected'};assert.equal(webReviewDisposition(item,[],now).queue,'existing');
});
test('same product variants are not collapsed into an existing announcement',()=>{
 const base=project(fixture.hints.find(r=>r.url.includes('vethel')));assert.equal(webReviewDisposition(base,fixture.known,now).reason,'possible_known_event');
 for(const phrase of ['限定','新色','復刻','再発売','周年','仕様変更','HH','custom','新機能'])assert.equal(webReviewDisposition({...base,title:base.title+' '+phrase},fixture.known,now).queue,'judgment');
});
async function seeded(){const s=await store(),r=fixture.hints.find(r=>r.title.includes('Gibson Japan'));await saveHint(s.db,{url:r.url,title:r.title,provider:'exa',searchedAt:now},now);await s.db.prepare('UPDATE news_web_hints SET estimate_json=? WHERE url=?').bind(r.estimate_json,r.url).run();return {s,r};}
const inputFor=async(s,r,extra={})=>({url:r.url,action:'defer',snapshot:await webHintSnapshot(await s.db.prepare('SELECT * FROM news_web_hints WHERE url=?').bind(r.url).first()),requestId:'fixture-visibility-001',...extra});
test('read-only projection, takedown/source stop, and no unsafe null-URL candidate match',async()=>{
 const {s,r}=await seeded();const beforeAudit=(await s.db.prepare('SELECT COUNT(*) n FROM news_admin_audit').first()).n;const data=await listWebHints({NEWS_DB:s.db,NEWS_WEB_ENABLED:'true'},now);assert.equal(data.items[0].webReview.queue,'judgment');assert.match(data.items[0].snapshot,/^[a-f0-9]{64}$/);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_admin_audit').first()).n,beforeAudit);
 await s.db.prepare('INSERT INTO news_takedowns VALUES(?,?)').bind(await hash(r.url),now+86400000).run();let [item]=await addWebReview(s.db,[project(r)],now);assert.equal(item.webReview.blocked,true);
 const unsafe=project({...r,url:'https://invalid.example/?secret=1'});[item]=await addWebReview(s.db,[unsafe],now);assert.equal(item.existingCandidate,null);assert.equal(item.webReview.reason,'unsafe_url');
 const prohibited=project({...r,url:'https://takamineguitars.co.jp/news/123/'});[item]=await addWebReview(s.db,[prohibited],now);assert.equal(item.webReview.reason,'source_prohibited');
 const human=project({...r,url:'https://www.yamaha.com/ja/news_release/2026/26111101/'});human.humanEntry={sourceId:'yamaha-newsroom',url:human.url};await s.db.prepare('INSERT INTO source_state(source_id,disabled) VALUES(?,1)').bind('yamaha-newsroom').run();[item]=await addWebReview(s.db,[human],now);assert.equal(item.webReview.queue,'judgment');await s.db.prepare('UPDATE source_state SET publication_blocked=1 WHERE source_id=?').bind('yamaha-newsroom').run();[item]=await addWebReview(s.db,[human],now);assert.equal(item.webReview.reason,'source_stopped');
 const stopped=project({...r,url:'https://www.shimamura.co.jp/update/shops/example/guitar-bass/123/'});await s.db.prepare('INSERT INTO source_state(source_id,publication_blocked) VALUES(?,1)').bind('shimamura').run();[item]=await addWebReview(s.db,[stopped],now);assert.equal(item.webReview.reason,'source_stopped');
});
test('hint visibility uses audited CAS, is idempotent, and never creates an editorial decision',async()=>{
 const {s,r}=await seeded(),input=await inputFor(s,r),before=await s.db.prepare('SELECT COUNT(*) n FROM news_admin_audit').first();await setWebHintReview(s,input,now,actor);assert.equal((await setWebHintReview(s,input,now,actor)).replayed,true);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_admin_audit').first()).n,before.n+1);for(const table of ['candidate_items','news_decision_ledger','news_shadow_evaluations'])assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
 const data=await listWebHints({NEWS_DB:s.db,NEWS_WEB_ENABLED:'true'},now);assert.equal(data.items[0].webReview.reason,'operator_deferred');
 await assert.rejects(setWebHintReview(s,{...input,action:'review'},now,actor),/idempotency_payload_changed/);
 const restore=await inputFor(s,r,{action:'review',requestId:'fixture-visibility-002'});await setWebHintReview(s,restore,now,actor);assert.equal((await listWebHints({NEWS_DB:s.db,NEWS_WEB_ENABLED:'true'},now)).items[0].webReview.queue,'judgment');
 await setWebHintReview(s,input,now,actor);assert.equal((await s.db.prepare('SELECT reason FROM news_web_hints').first()).reason.includes(':review:'),true);
});
test('stale/concurrent snapshots cannot overwrite another human action; failed audit rolls back',async()=>{
 const {s,r}=await seeded(),one=await inputFor(s,r),two={...one,requestId:'fixture-visibility-002',action:'later'};
 const results=await Promise.allSettled([setWebHintReview(s,one,now,actor),setWebHintReview(s,two,now,actor)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const fresh=await inputFor(s,r,{requestId:'fixture-visibility-003',action:'review'});const old=(await s.db.prepare('SELECT * FROM news_web_hints').first());s.db.raw.exec("CREATE TRIGGER fail_visibility BEFORE INSERT ON news_admin_audit WHEN NEW.action='web-hint-visibility' BEGIN SELECT RAISE(ABORT,'db_unavailable'); END");await assert.rejects(setWebHintReview(s,fresh,now,actor),/db_unavailable/);assert.deepEqual(await s.db.prepare('SELECT * FROM news_web_hints').first(),old);
});
test('visibility input is closed, actor-bound, expiring and cannot forge confirmations',async()=>{
 const {s,r}=await seeded(),input=await inputFor(s,r);await assert.rejects(setWebHintReview(s,input,now,{type:'system'}),/operator_denied/);await assert.rejects(setWebHintReview(s,{...input,confirmed:true},now,actor),/web_review_invalid/);await assert.rejects(setWebHintReview(s,input,now+31*86400000,actor),/web_review_missing/);
});
test('deferred hint rediscovery does not repeat AI classification; discovery OFF remains inert',async()=>{
 const {s,r}=await seeded(),input=await inputFor(s,r);await setWebHintReview(s,input,now,actor);let models=0;
 await runWebDiscovery({NEWS_DB:s.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["guitar"]'},now,{search:async()=>[{url:r.url,title:r.title}],classify:()=>{models++;throw Error('must not classify');}});assert.equal(models,0);assert.match((await s.db.prepare('SELECT reason FROM news_web_hints').first()).reason,/web_review:defer/);
 assert.deepEqual(await runWebDiscovery({NEWS_DB:s.db,NEWS_WEB_ENABLED:'false'},now,{search:()=>assert.fail()}),{disabled:true});
});

test('workerd D1: authenticated-view snapshot supports concurrent audited visibility CAS without formal writes',async()=>{
 const {localDatabase}=await import('../scripts/local-db.mjs'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'web-review-d1-')),runtime=await localDatabase(dir);
 try{const s=await store(runtime.db),r=fixture.hints.find(r=>r.title.includes('Gibson Japan'));await saveHint(s.db,{url:r.url,title:r.title,provider:'exa',searchedAt:now},now);await s.db.prepare('UPDATE news_web_hints SET estimate_json=?').bind(r.estimate_json).run();const item=(await listWebHints({NEWS_DB:s.db,NEWS_WEB_ENABLED:'true'},now)).items[0];const input={url:r.url,snapshot:item.snapshot,action:'defer',requestId:'workerd-visibility-cas-001'};
 const results=await Promise.allSettled([setWebHintReview(s,input,now,actor),setWebHintReview(s,{...input,action:'later',requestId:'workerd-visibility-cas-002'},now,actor)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);
 const after=(await listWebHints({NEWS_DB:s.db,NEWS_WEB_ENABLED:'true'},now)).items[0];assert.equal(after.webReview.queue,'low');assert.notEqual(item.snapshot,after.snapshot);assert.equal((await s.db.prepare("SELECT COUNT(*) n FROM news_admin_audit WHERE action='web-hint-visibility'").first()).n,1);for(const table of ['candidate_items','news_decision_ledger','news_shadow_evaluations','news_takedowns'])assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
 }finally{await runtime.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
