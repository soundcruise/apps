import test from 'node:test';import assert from 'node:assert/strict';
import {reviewMorrisPrimary,MORRIS_PRIMARY_REVIEW} from '../src/morris-primary-review.js';
import {morrisUrlDate} from '../src/morris-policy.js';import {morrisNoticeLabel} from '../src/morris-editorial-policy.js';
import {pepper,store} from './helpers.js';import {getSource} from '../src/registry.js';import {administer} from '../src/admin.js';
import {collectSource} from '../src/collector.js';import {publicationValidation} from '../src/decision-policy.js';import {reconcileMorrisReady} from '../src/facts-recheck.js';
const now=Date.parse('2026-10-20T04:00:00Z'),url='https://www.morris-guitar.com/information/2026/1018_09.html',entry={url,publishedAt:morrisUrlDate(url)};
const event={articleType:'event_announcement',subject:'合成アコギの集い',eventDate:'2026-11-22',endDate:'2026-11-22',venue:'合成ホール'};
// Synthetic markup only; no historical publisher expression is retained.
const page=(body='<p>合成アコギの集いというイベントです。</p><p>開催日：2026年11月22日</p><p>会場：合成ホール</p>',heading='<h2 class="h3 serif">秋の合成アコギ企画について</h2>')=>`<html><head><meta property="og:url" content="${url}"></head><main><time>2026.10.18</time>${heading}${body}<h2 class="serif h4">お問い合わせ</h2></main></html>`;
test('offline primary review supports section headings and emphasized lead titles, with honest system provenance',async()=>{for(const heading of [undefined,'<p class="fz-large fw-bold">合成の催事案内です</p>']){const r=await reviewMorrisPrimary(page(undefined,heading),entry,event,now,pepper);assert.equal(r.proof.parserVersion,MORRIS_PRIMARY_REVIEW);assert.equal(r.proof.reviewActor,'system_primary_review');assert.equal(r.facts.evidence,'morris_explicit_notice_v1');assert.equal(r.facts.actor,'Morris Guitars');assert.match(morrisNoticeLabel(r.facts,r.eventType),/合成アコギの集い.*開催を案内/);assert.equal(r.facts.publishedAt,undefined);assert.equal(JSON.stringify(r).includes('秋の合成アコギ企画について'),false);}});
test('recruitment needs real application/deadline evidence; a release decision is an announcement, not an asserted release',async()=>{const r=await reviewMorrisPrimary(page('<p>合成音楽コンテストへの応募方法と応募締切：2026年12月2日</p>','<h2 class="h3 serif">合成の参加者募集について</h2>'),entry,{articleType:'recruitment',subject:'合成音楽コンテスト',deadline:'2026-12-02'},now,pepper);assert.equal(r.facts.deadline,'2026-12-02');const p=await reviewMorrisPrimary(page('<p>ギターのシグネチャーモデル「QA-77 合成奏者 Signature」の発売が決定しました。</p>'),entry,{articleType:'new_product',subject:'QA-77 合成奏者 Signature',productType:'ギター'},now,pepper);assert.match(morrisNoticeLabel(p.facts,p.eventType),/を発表$/);assert.equal(p.facts.releaseDate,undefined);await assert.rejects(reviewMorrisPrimary(page(),entry,{articleType:'recruitment',subject:event.subject},now,pepper),/action_unbound/);});
for(const [name,html,input,pattern]of [
 ['canonical contradiction',page().replace(url,url.replace('1018','1017')),event,/identity_conflict/],
 ['publication day contradiction',page().replace('2026.10.18','2026.10.17'),event,/date_conflict/],
 ['missing subject',page(),{...event,subject:'未確認の別企画'},/subject_unbound/],
 ['missing date',page().replace('2026年11月22日','後日決定'),event,/field_unbound/],
 ['missing venue',page().replace('会場：合成ホール','会場：未定'),event,/field_unbound/],
 ['related-only evidence',page('<aside>合成アコギの集い。開催日：2026年11月22日。会場：合成ホール</aside>'),event,/subject_unbound/],
 ['pre-heading evidence',page('<p>合成アコギの集いというイベントです。開催日程は未定です。</p>').replace('<main>','<main><p>開催日：2026年11月22日。会場：合成ホール</p>'),event,/field_unbound/],
 ['cancelled action',page('<p>合成アコギの集いの開催を中止します。開催日：2026年11月22日。会場：合成ホール</p>'),event,/action_contradicted/],
 ['explicit optout',page().replace('<head>','<head><meta name="robots" content="noarchive">'),event,/scope_invalid/]
])test('primary review blocks '+name,async()=>{await assert.rejects(reviewMorrisPrimary(html,entry,input,now,pepper),pattern);});
test('real stored audit receipt is required for formal READY; teacher history, baseline date, duplicate and expiry gates remain',async()=>{
 const s=await store(),source={...getSource('morris'),enabled:true,productionEnabled:true},registry=[source];for(const action of ['source-enable','publish-on'])await administer(s,{action,...(action==='source-enable'?{target:'morris'}:{}),reason:'review_complete'},now,registry);
 const listing=`<head><link rel="canonical" href="https://www.morris-guitar.com/information/"></head><main><div class="col-9"><h3 class="h5 serif"><a href="${url}">合成案内</a></h3><time>2026.10.18</time></div></main>`;
 await collectSource('morris',s,{now,mode:'production',registry,pepper,sleep:async()=>{},fetcher:async u=>u===source.robotsUrl?new Response(null,{status:404}):new Response(u===source.discoveryUrl?listing:page(),{headers:{'content-type':'text/html'}})});
 const original=(await s.candidates())[0],r=await reviewMorrisPrimary(page(),entry,event,now,pepper);
 await s.db.prepare("UPDATE news_morris_acquisition SET outcome='verified',attempted_at=?,actual_requests=1,response_hash=?,facts_json=?,proof_json=?,fingerprint_json=? WHERE source_url=? AND scope='article'").bind(now,r.proof.responseHash,JSON.stringify(r.facts),JSON.stringify(r.proof),JSON.stringify(r.fingerprint),url).run();
 const reconciliation=await reconcileMorrisReady(s,now,registry,pepper);assert.equal(reconciliation.ready,1,JSON.stringify({reconciliation,validation:await publicationValidation(s,(await s.candidates())[0],now,registry,pepper)}));const current=(await s.candidates())[0];assert.equal(current.id,original.id);assert.equal(current.published_at,original.published_at);assert.equal(current.review_status,'pending');assert.equal((await publicationValidation(s,current,now,registry,pepper)).valid,true);
 for(const table of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'])assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
 assert.equal((await publicationValidation(s,current,now+95*86400000,registry,pepper)).valid,false);
 const bad={...r.proof,reviewActor:'human_operator'};await s.db.prepare('UPDATE news_morris_acquisition SET proof_json=? WHERE source_url=?').bind(JSON.stringify(bad),url).run();assert.ok((await publicationValidation(s,current,now,registry,pepper)).errors.includes('facts_provenance_invalid'));
});
