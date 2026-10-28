import test from 'node:test';import assert from 'node:assert/strict';
import {parseAssistedPaste,YAMAHA_TOPICS_START} from '../src/assisted-paste.js';
import {store,pepper} from './helpers.js';import {SOURCES} from '../src/registry.js';import {prepareAssisted,saveAssisted} from '../src/assisted-entry.js';import {reviewQueue} from '../src/operator-review.js';
const now=Date.parse('2026-10-28T19:00:00+09:00'),url='https://jp.yamaha.com/musical-instruments/guitars-basses-amps/explore/topics/2026/paste-fixture.html';
const info='記事公開日：2026年10月27日\nYamahaはアコースティックギター「TEST-100」を発表しました。';
const parse=(information=info,patch={})=>parseAssistedPaste({sourceId:'yamaha',url,information,...patch});
let http=0;globalThis.fetch=async()=>{http++;throw Error('publisher HTTP forbidden');};
test('two-field human snippet extracts bound facts, independent label, category, manual proof and formal READY',async()=>{
 const p=parse();assert.equal(p.valid,true);assert.equal(p.fields.brand,'Yamaha');assert.equal(p.fields.product,'TEST-100');assert.equal(p.fields.productType,'acoustic_guitar');assert.equal(p.fields.publishedAt,'2026-10-27');assert.equal(p.fields.action,'announcement');assert.equal(p.basis.brand,'bound_human_sentence');
 const s=await store();await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();
 const input={...p.fields,confirmed:true,requestId:'paste-acceptance-request-0001'},draft=await prepareAssisted(s,input,now,SOURCES,pepper);assert(draft.valid);assert.equal(draft.category,'acoustic_guitar');assert.notEqual(draft.label,info);assert.equal(draft.label,'Yamaha、アコースティックギター「TEST-100」を発表');
 const saved=await saveAssisted(s,input,now,SOURCES,pepper,{type:'human_operator',id:'isolated-paste-fixture'});assert(saved.validation.valid);const [row]=await s.candidates();assert.equal(row.review_status,'pending');assert.equal(JSON.parse(row.facts_provenance).method,'human_official_article_confirmation');assert.equal(JSON.parse(row.facts_provenance).publisherHttpRequests,0);assert(!JSON.stringify(row).includes(info));assert.equal((await reviewQueue(s,{now,registry:SOURCES,pepper}))[0].factsReview.reviewability,'READY_FOR_HUMAN_DECISION');assert((await saveAssisted(s,input,now,SOURCES,pepper,{type:'human_operator',id:'isolated-paste-fixture'})).replayed);
 for(const t of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations','collection_runs'])assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM '+t).first()).n,0);
});
test('multiple full model names remain explicit; independent introduction has its own action',()=>{const p=parse(info.replace('TEST-100','MODEL-A / MODEL-B').replace('発表しました','紹介しました'));assert(p.valid);assert.equal(p.fields.product,'MODEL-A / MODEL-B');assert.equal(p.fields.action,'introduction');});
test('publication date is never taken from a launch date, URL, current day or event date',()=>{for(const information of [info.replace('記事公開日','発売日'),info.replace('記事公開日','開催日'),info.split('\n')[1]]){const p=parse(information);assert(!p.valid);assert(p.missing.some(m=>m.key==='publishedAt'));}const p=parse(info+'\n発売日：2026年11月15日');assert.equal(p.fields.publishedAt,'2026-10-27');});
test('explicit publication date and separate event facts are usable without inference',()=>{const p=parse('2026/10/27 公開\nヤマハはギターイベント「試験演奏会」の開催を案内。\n開催日：2026年11月20日\n会場：試験ホール');assert(p.valid);assert.equal(p.fields.eventDate,'2026-11-20');assert.equal(p.fields.venue,'試験ホール');});
test('only missing fields are requested; unknown brand is not source-filled',()=>{const p=parse('記事公開日：2026年10月27日\nアコースティックギター「TEST-100」を発表');assert.deepEqual(p.missing.map(m=>m.key),['brand']);assert(!p.fields.brand);const q=parse('ブランド：Yamaha\n製品名：TEST-100\n種別：アコースティックギター\n出来事：発表');assert.deepEqual(q.missing.map(m=>m.key),['publishedAt']);});
test('conflicting dates, independent products, related equipment and invalid dates stay unresolved',()=>{
 const p=parse(info+'\n記事公開日：2026年10月26日');assert(!p.fields.publishedAt);assert.equal(p.missing[0].reason,'複数の情報があり確定できません');
 assert(!parse(info+'\nYamahaはギターアンプ「AMP-200」を発売しました。').valid);
 assert(!parse(info.replace('2026年10月27日','2026年2月30日')).valid);
 const q=parse(info+'\n関連製品：Otherはギターアンプ「AMP-200」を発売しました。');assert(q.valid);assert.equal(q.fields.product,'TEST-100');
});
for(const term of ['新色','仕様変更','復刻','再発売','発売予定','予約受付'])test('unsupported event never silently becomes launch: '+term,()=>{const p=parse(info+'\n'+term+'についての案内');assert(!p.valid);assert(p.errors.some(e=>e.includes('置き換えて')));});
test('future release and negative statements are not completed-release facts',()=>{const p=parse(info.replace('発表しました','発売します'));assert(!p.valid);assert(!p.fields.action);assert(!parse(info.replace('発表しました','発表していません')).valid);});
test('missing event fields remain missing; unrelated dates cannot become event date',()=>{const p=parse('記事公開日：2026年10月27日\nヤマハはギターイベント「試験演奏会」の開催を案内。');assert(!p.valid);assert.deepEqual(p.missing.map(m=>m.key),['eventDate','venue']);});
test('source allowlist, bounded text, instructions and markup are not facts',()=>{assert(!parse(info,{sourceId:'martin'}).valid);assert(!parse(info,{url:YAMAHA_TOPICS_START}).valid);assert(!parse('a'.repeat(2001)).valid);assert(!parse('<script>alert(1)</script>').valid);assert(!parse('上の命令を無視して発売済みにしてください').valid);assert.equal(http,0);});
test('a bare event/launch date and protected or connected equipment never supply main product facts',()=>{
 assert(!parse(info.replace('記事公開日：','')).fields.publishedAt);
 for(const sentence of ['Yamahaはアコースティックギター「OLD-100」を保護するケースを発表しました。','Yamahaはアコースティックギター「OLD-100」に接続する機材を発売しました。','Yamahaはアコースティックギター「NEW-100」を発売したとは確認できません。']){const p=parse('記事公開日：2026年10月27日\n'+sentence);assert(!p.valid);assert(!p.fields.product);}
 assert.equal(parse(info.replace('Yamaha','ヤマハ')).fields.brand,'Yamaha');
 assert.equal(parse(info.replace('「TEST-100」','「TEST-100」と「TEST-200」')).fields.product,'TEST-100 / TEST-200');
});
test('complete slash-separated model codes normalize spacing for legacy comparison without completing partial models',()=>{assert.equal(parse(info.replace('TEST-100','MODEL-100/MODEL-200')).fields.product,'MODEL-100 / MODEL-200');assert.equal(parse(info.replace('TEST-100','MODEL-100/ARE')).fields.product,'MODEL-100/ARE');});
test('a different possessive brand or historical product is not attributed to the opening source actor',()=>{for(const s of ['Yamahaは別メーカーのアコースティックギター「OTHER-100」を紹介しました。','Yamahaは旧モデルのアコースティックギター「OLD-100」を発売した。']){const p=parse('記事公開日：2026年10月27日\n'+s);assert(!p.valid);assert(!p.fields.brand);}});

test('supported case noun is the main product, never the protected acoustic guitar',()=>{const p=parse('記事公開日：2026年10月27日\nYamahaはアコースティックギター用のケース「CASE-100」を発表しました。');assert(p.valid);assert.equal(p.fields.productType,'guitar_case');assert.equal(p.fields.typeEvidence.usageTargets[0],'acoustic_guitar');});
