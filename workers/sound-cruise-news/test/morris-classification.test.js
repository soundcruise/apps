import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMorrisFacts} from '../src/morris-recovery.js';
import {parseMorrisListing,morrisLabel} from '../src/morris-evidence.js';
import {MORRIS_LISTING,MORRIS_PERMISSION} from '../src/morris-policy.js';
import {store,pepper} from './helpers.js';
import {getSource} from '../src/registry.js';
import {administer} from '../src/admin.js';
import {collectSource} from '../src/collector.js';
import {publicationValidation} from '../src/decision-policy.js';
import {reviewDetail} from '../src/operator-review.js';
import {hash} from '../src/policy.js';
// SYNTHETIC facts/wording only; no transcription of the fourteen real articles.
const url='https://www.morris-guitar.com/information/2026/1001_01.html',now=Date.parse('2026-10-17T00:00:00Z');
const analyze=(t,p,f=[])=>analyzeMorrisFacts(t,p,f,url);
const product='Morris Guitarsのアコースティックギター QA-88 を発表しました。';
const event='Morris Guitarsは「合成ギター展」に出展します。';
const dates=['開催日：2026年11月1日','会場：合成ホール'];
const assessment=(r,t)=>r.analysis.candidates.find(c=>c.type===t);
const card=(t,p,u=url,d='2026.10.01')=>`<div class="col-9"><h3 class="h5 serif"><a href="${u}">${t}</a></h3><time>${d}</time>${p.map(x=>`<p>${x}</p>`).join('')}</div>`;
const listing=body=>`<html><head><link rel="canonical" href="${MORRIS_LISTING}"></head><main>${body}</main></html>`;
for(const word of ['イベント','受付','募集','開催'])test('incidental event word does not suppress complete product: '+word,()=>{
 const r=analyze('QA-88 新製品 '+word+'案内',[product,'イベントの受付についてもご案内します。']);
 assert.equal(r.facts.product,'QA-88');assert.equal(r.analysis.evaluatedTypes.length,13);
});
test('product reservations alone cannot claim a release',()=>{
 const r=analyze('QA-88 予約受付開始',[product.replace('発表しました','予約受付を開始しました')]);
 assert.equal(r.facts,null);assert.ok(assessment(r,'product_announcement').missingFields.includes('product_action'));
});
test('explicit completed release remains valid when reservations are mentioned',()=>{
 const r=analyze('QA-88 発売・予約受付',[product.replace('発表しました','発売しました'),'予約受付についてのご案内。']);assert.equal(r.eventType,'release');
});
test('NFKC model normalization preserves explicit signature binding',()=>{
 const r=analyze('ＱＡ－８８ シグネチャーモデル',[product.replace('QA-88','ＱＡ－８８').replace('を発表','のシグネチャーモデルを発表')]);
 assert.equal(r.facts.product,'QA-88');assert.equal(r.facts.productEvent.action,'signature');assert.equal(r.analysis.articleType,'signature_model');
});
test('recruitment uses complete competition facts, never an event keyword alone',()=>{
 const r=analyze('「合成アコギコンテスト」参加募集',['Morris Guitarsは「合成アコギコンテスト」の参加者募集を開始します。',...dates]);
 assert.equal(r.facts.action,'entry_open');assert.equal(r.facts.eventDate,'2026-11-01');assert.match(morrisLabel(r.facts,r.eventType),/参加募集を開始/);
 const insufficient=analyze('「合成アコギコンテスト」参加募集',['Morris Guitarsは「合成アコギコンテスト」の参加者募集を開始します。']);
 assert.equal(insufficient.facts,null);assert.deepEqual(assessment(insufficient,'recruitment_announcement').missingFields,['event_date','venue']);
});
test('recruitment cannot borrow a year from publication date or event name',()=>{
 const r=analyze('「合成アコギコンテスト2027」参加募集',['Morris Guitarsは「合成アコギコンテスト2027」の参加者募集を開始します。','開催日：11月1日','会場：合成ホール']);assert.equal(r.facts,null);
});
test('event exhibition can use a corroborated unquoted name',()=>{
 const r=analyze('合成ギター展への出展案内',['Morris Guitarsは合成ギター展に出展します。',...dates]);assert.equal(r.facts.eventName,'合成ギター展');
});
test('explicit event-bound prose date and venue work without field labels',()=>{
 const r=analyze('「合成ギター展」出展案内',['Morris Guitarsは2026年11月1日に、会場「合成ホール」で開催される「合成ギター展」に出展します。']);
 assert.equal(r.facts.eventDate,'2026-11-01');assert.equal(r.facts.venue,'合成ホール');
});
test('ambiguous dates/venues and wrong subject action fail closed',()=>{
 for(const p of [[event,...dates,'開催日：2026年11月2日'],[event,...dates,'会場：別ホール'],['Morris Guitarsは「別展」に出展します。','「合成ギター展」のご案内。',...dates]])assert.equal(analyze('「合成ギター展」出展',p).facts,null);
});
test('workshop hosting has explicit organizer/action/date/venue',()=>{
 const r=analyze('「合成アコギ診断会」を開催',['Morris Guitarsはアコースティックギターの「合成アコギ診断会」を開催します。',...dates]);
 assert.equal(r.facts.eventType,'workshop');assert.equal(r.facts.organizer,'Morris Guitars');assert.match(morrisLabel(r.facts,r.eventType),/開催を告知/);
 const missing=analyze('「合成アコギ診断会」を開催',['Morris Guitarsはアコースティックギターの「合成アコギ診断会」を開催します。']);assert.equal(missing.facts,null);
});
test('report is evaluated despite mentions of event recruitment',()=>{
 const r=analyze('「合成ギター祭」開催レポート',['Morris Guitarsのアコースティックギターを展示した「合成ギター祭」の開催レポートを公開。','次の募集については別のご案内です。']);
 assert.equal(r.facts.articleType,'event_report');assert.equal(r.facts.eventDate,undefined);
});
test('catalog is evaluated despite event words elsewhere',()=>{
 const r=analyze('ギターカタログ「合成資料2026」',['Morris Guitarsのアコースティックギターカタログ「合成資料2026」を公開しました。','イベント受付の案内もあります。']);
 assert.equal(r.facts.articleType,'catalog');assert.equal(r.facts.subject,'合成資料2026');
});
test('service pause has its own bounded facts and cannot broaden partial service scope',()=>{
 const r=analyze('塗装を伴う修理受付停止',['Morris Guitarsではアコースティックギターの塗装を伴う修理受付を停止します。']);
 assert.equal(r.facts.topic,'guitar_finish_repair');assert.match(morrisLabel(r.facts,r.eventType),/塗装を伴う/);
 assert.equal(analyze('修理受付停止',['Morris Guitarsのサービス受付についてのお知らせ。']).facts,null);
 assert.equal(morrisLabel({...r.facts,serviceAction:'unknown'},r.eventType),null);
});
test('all repair pause requires explicit same-scope evidence',()=>{
 const r=analyze('アコースティックギター修理受付停止',['Morris Guitarsではアコースティックギター修理受付を停止します。']);assert.equal(r.facts.topic,'guitar_repair');
 assert.equal(analyze('アコースティックギター修理受付停止',['Morris Guitarsではアコースティックギターの塗装を伴う修理受付を停止します。']).facts,null);
});
test('multiple incomplete candidates are assessed independently',()=>{
 const r=analyze('QA-88 新製品・「合成ギター展」出展',['Morris GuitarsのQA-88についてのご案内。','「合成ギター展」のご案内。']);
 assert.equal(r.facts,null);assert.equal(r.analysis.candidates.length,2);assert.ok(r.analysis.candidates.every(c=>c.missingFields.length));
});
test('multiple complete interpretations are held instead of choosing the first',()=>{
 const r=analyze('QA-88 新製品・「合成ギター展」出展',[product,event,...dates]);
 assert.equal(r.facts,null);assert.equal(r.analysis.reason,'AMBIGUOUS_ARTICLE_TYPES');assert.equal(r.analysis.candidates.filter(c=>c.eligible).length,2);
});
test('metadata paragraphs cannot displace the bounded primary prose window',async()=>{
 const body=card('QA-88 新製品',['2026.10.01','詳しくはこちら',product]);const e=(await parseMorrisListing(listing(body),pepper,{verifiedAt:now}))[0];
 assert.equal(e.facts.product,'QA-88');assert.equal(e.diagnostics.selectedParagraphCount,1);
});
test('another card cannot supply the missing product identity or event dates',async()=>{
 const body=card('QA-88 新製品',['Morris Guitarsからのご案内。'])+card('別製品',[product],'https://www.morris-guitar.com/information/2026/1002_01.html','2026.10.02');
 const entries=await parseMorrisListing(listing(body),pepper,{verifiedAt:now});assert.equal(entries[0].facts,null);
});
test('persisted analysis contains bounded codes/booleans, never source sentences',async()=>{
 const marker='NOT_FOR_PERSISTENCE_123';const e=(await parseMorrisListing(listing(card('QA-88 新製品',[product,marker])),pepper,{verifiedAt:now}))[0];
 const stored=JSON.stringify(e);assert.equal(stored.includes(marker),false);assert.equal(stored.includes(product),false);assert.equal(e.proof.parserVersion,'morris-listing-facts-4');assert.match(e.proof.responseHash,/^[a-f0-9]{64}$/);
 assert.ok(e.recoveryAnalysis.candidates.every(c=>Object.values(c.checks).every(v=>typeof v==='boolean')));
});
async function setup(){const s=await store(),source={...getSource('morris'),enabled:true,productionEnabled:true},registry=[source];for(const action of ['collection-on','publish-on','source-enable'])await administer(s,{action,...(action==='source-enable'?{target:'morris'}:{}),reason:'review_complete'},now,registry);return {s,source,registry};}
test('baseline_old becomes authoritative READY with unchanged receipt, date and human learning tables',async()=>{
 const {s,source,registry}=await setup(),key='article:'+await hash(url);
 await s.db.prepare("INSERT INTO news_morris_acquisition(request_key,scope,source_url,jst_day,published_at,discovered_at,outcome,permission_ref) VALUES(?,'article',?,'2026-10-16','2026-09-30T15:00:00.000Z',?,'baseline_old',?)").bind(key,url,now-86400000,MORRIS_PERMISSION).run();
 const before=await s.db.prepare('SELECT * FROM news_morris_acquisition WHERE request_key=?').bind(key).first(),calls=[];
 const run=await collectSource('morris',s,{now,mode:'production',registry,pepper,requestMode:'scheduled',sleep:async()=>{},fetcher:async u=>{calls.push(u);assert.ok([source.robotsUrl,MORRIS_LISTING].includes(u));return u===source.robotsUrl?new Response(null,{status:404}):new Response(listing(card('QA-88 発表・イベント受付',[product])),{headers:{'content-type':'text/html'}});}});
 assert.equal(run.historicalRecovered,1);assert.equal(calls.length,2);const row=(await s.candidates())[0];assert.equal(row.review_status,'pending');assert.equal(row.published_at,'2026-09-30T15:00:00.000Z');
 assert.equal((await publicationValidation(s,row,now,registry,pepper)).valid,true);assert.equal((await reviewDetail(s,row.id,now,registry,pepper)).factsReview.reviewability,'READY_FOR_HUMAN_DECISION');
 assert.deepEqual(await s.db.prepare('SELECT * FROM news_morris_acquisition WHERE request_key=?').bind(key).first(),before);
 for(const table of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'])assert.equal((await s.db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
});
test('ninety-day-old facts do not revive a candidate or fetch historical details',async()=>{
 const {s,source,registry}=await setup(),old=url.replace('/1001_','/0601_');const calls=[];
 await collectSource('morris',s,{now,mode:'production',registry,pepper,sleep:async()=>{},fetcher:async u=>{calls.push(u);assert.ok([source.robotsUrl,MORRIS_LISTING].includes(u));return u===source.robotsUrl?new Response(null,{status:404}):new Response(listing(card('QA-88 発表',[product],old,'2026.06.01')),{headers:{'content-type':'text/html'}});}});
 assert.equal((await s.candidates()).length,0);assert.equal(calls.length,2);
});

test('contradictory primary prose and labeled event fields cannot select a preferred date/venue',()=>{
 for(const p of [
 ['Morris Guitarsは2026年11月2日に「合成ギター展」に出展します。',...dates],
 ['Morris Guitarsは会場「別ホール」で「合成ギター展」に出展します。',...dates]
 ])assert.equal(analyze('「合成ギター展」出展',p).facts,null);
});
test('negated Morris actor cannot supply an event or editorial subject',()=>{
 assert.equal(analyze('「合成ギター展」出展',['Morrisではない会社は「合成ギター展」に出展します。',...dates]).facts,null);
 assert.equal(analyze('アコースティックギター修理受付停止',['Morrisではない会社はアコースティックギター修理受付を停止します。']).facts,null);
});
for(const [type,title,paras]of [
 ['recruitment','「合成アコギコンテスト」参加募集',['Morris Guitarsは「合成アコギコンテスト」の参加者募集を開始します。',...dates]],
 ['workshop','「合成アコギ診断会」を開催',['Morris Guitarsはアコースティックギターの「合成アコギ診断会」を開催します。',...dates]],
 ['service','塗装を伴う修理受付停止',['Morris Guitarsではアコースティックギターの塗装を伴う修理受付を停止します。']]
])test('complete '+type+' facts must pass the actual publication gate and remain human-only',async()=>{
 const {s,source,registry}=await setup();
 await collectSource('morris',s,{now,mode:'production',registry,pepper,sleep:async()=>{},fetcher:async u=>{assert.ok([source.robotsUrl,MORRIS_LISTING].includes(u));return u===source.robotsUrl?new Response(null,{status:404}):new Response(listing(card(title,paras)),{headers:{'content-type':'text/html'}});}});
 const row=(await s.candidates())[0];assert.ok(row);assert.equal(row.review_status,'pending');assert.equal(row.publication_decision,'PUBLISH_REVIEW');
 assert.equal((await publicationValidation(s,row,now,registry,pepper)).valid,true);assert.equal((await reviewDetail(s,row.id,now,registry,pepper)).factsReview.reviewability,'READY_FOR_HUMAN_DECISION');
});
