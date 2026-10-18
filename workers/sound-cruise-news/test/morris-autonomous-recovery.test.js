import test from 'node:test';
import assert from 'node:assert/strict';
import {store,pepper} from './helpers.js';
import {parseMorrisListing,morrisLabel} from '../src/morris-evidence.js';
import {MORRIS_LISTING,MORRIS_PERMISSION,morrisParserSupported} from '../src/morris-policy.js';
import {getSource} from '../src/registry.js';
import {administer} from '../src/admin.js';
import {collectSource} from '../src/collector.js';
import {publicationValidation} from '../src/decision-policy.js';
import {morrisProofValid} from '../src/morris-collector.js';
import {hash} from '../src/policy.js';
// SYNTHETIC wording. None of these fixtures proves a real Morris article's facts.
const now=Date.parse('2026-10-16T00:00:00Z'),url='https://www.morris-guitar.com/information/2026/1001_01.html';
const source={...getSource('morris'),enabled:true,productionEnabled:true},registry=[source];
const card=(title,paragraphs,u=url,date='2026.10.01',extra='')=>`<div class="col-9"><h3 class="h5 serif"><a href="${u}">${title}</a></h3><time>${date}</time>${paragraphs.map(p=>`<p>${p}</p>`).join('')}${extra}</div>`;
const listing=body=>`<html><head><link rel="canonical" href="${MORRIS_LISTING}"></head><main>${body}</main></html>`;
const parse=async(title,paragraphs,extra='')=>(await parseMorrisListing(listing(card(title,paragraphs,url,'2026.10.01',extra)),pepper,{verifiedAt:now}))[0];
const productTitle='モーリス QA-73 新製品のご案内',productLead='Morris Guitarsのアコースティックギター QA-73 を発表しました。';
test('unquoted, explicitly typed model/action is recoverable without a product-name table',async()=>{
 const e=await parse(productTitle,[productLead]);assert.equal(e.facts.product,'QA-73');assert.equal(e.facts.productType,'acoustic_guitar');assert.equal(e.eventType,'new_product');assert.equal(e.recoveryAnalysis.selected,'generic');assert.equal(e.recoveryAnalysis.typedIdentity,true);assert.equal(e.recoveryAnalysis.actionExplicit,true);assert.match(morrisLabel(e.facts,e.eventType),/QA-73を発表$/);
 const other=await parse(productTitle.replaceAll('QA-73','XZ-99'),[productLead.replaceAll('QA-73','XZ-99')]);assert.equal(other.facts.product,'XZ-99');
});
test('explicit release decision and completed release remain distinct',async()=>{
 const decided=await parse(productTitle,[productLead.replace('発表しました','発売が決定しました')]);assert.equal(decided.facts.announcement,'release_decided');assert.match(morrisLabel(decided.facts,decided.eventType),/発売決定を告知$/);
 const released=await parse(productTitle,[productLead.replace('発表しました','販売を開始しました')]);assert.equal(released.eventType,'release');assert.match(morrisLabel(released.facts,released.eventType),/を発売$/);
 const future=await parse(productTitle,[productLead.replace('発表しました','発売予定です')]);assert.equal(future.facts,null);
});
for(const [word,action] of [['限定モデル','limited_edition'],['シグネチャーモデル','signature'],['新色','new_color']])test('special specification needs same-model primary evidence: '+word,async()=>{
 const e=await parse(productTitle+' '+word,[productLead.replace('を発表',`の${word}を発表`)]);assert.equal(e.facts.productEvent.action,action);
 const missing=await parse(productTitle+' '+word,[productLead]);assert.equal(missing.facts,null);
});
for(const [name,lead] of [
 ['brand only','Morris Guitarsからのお知らせです。'],
 ['other model','Morris Guitarsのアコースティックギター XZ-99 を発表しました。'],
 ['multiple models','Morris Guitarsのアコースティックギター QA-73 と XZ-99 を発表しました。'],
 ['protected equipment','Morris Guitarsのアコースティックギター QA-73 を保護するケースを発表しました。'],
 ['supported equipment','Morris Guitarsのアコースティックギター QA-73 対応のピックアップを発表しました。'],
 ['incidental accessory','Morris Guitarsのアコースティックギター QA-73 のアクセサリーを発表しました。'],
 ['no type','Morris Guitarsの QA-73 を発表しました。'],
 ['no manufacturer','アコースティックギター QA-73 を発表しました。'],
 ['wrong manufacturer binding','Morrisではないメーカーのアコースティックギター QA-73 を発表しました。'],
 ['comparison','Morris Guitarsのアコースティックギター QA-73 を他社製品と比較。'],
 ['restock','Morris Guitarsのアコースティックギター QA-73 が再入荷しました。'],
 ['sale','Morris Guitarsのアコースティックギター QA-73 がセール中です。'],
 ['old product','過去にMorris Guitarsのアコースティックギター QA-73 を発表しました。'],
 ['model list','Morris Guitars QA-73 XZ-99 AB-12 アコースティックギター 製品一覧。']
])test('does not turn unsupported/relational context into product facts: '+name,async()=>assert.equal((await parse(productTitle,[lead])).facts,null));
test('paragraph-labeled event fields work without li/dt/dd and retain explicit calendar dates',async()=>{
 const e=await parse('「合成ギター展」への出展案内',['Morris Guitarsは「合成ギター展」に出展します。','開催日：2026年11月1日','会場：合成ホール']);
 assert.equal(e.recoveryAnalysis.selected,'generic');assert.equal(e.facts.eventDate,'2026-11-01');assert.equal(e.facts.venue,'合成ホール');assert.equal(e.facts.action,'exhibiting');
});
test('event cannot borrow publication year, venue, another event or another card',async()=>{
 for(const date of ['11月1日','2026年2月30日','2026年11月2日〜1日'])assert.equal((await parse('「合成ギター展」への出展案内',['Morris Guitarsは「合成ギター展」に出展します。','開催日：'+date,'会場：合成ホール'])).facts,null);
 const e=await parse('「合成ギター展」への出展案内',['Morris Guitarsは「別のギター展」に出展します。','開催日：2026年11月1日','会場：合成ホール']);assert.equal(e.facts,null);
 const entries=await parseMorrisListing(listing(card('「合成ギター展」への出展案内',['Morris Guitarsは「合成ギター展」に出展します。'])+card('別件',['開催日：2026年11月1日','会場：合成ホール'],'https://www.morris-guitar.com/information/2026/1002_01.html','2026.10.02')),pepper,{verifiedAt:now});assert.equal(entries[0].facts.articleType,'exhibition');assert.equal(entries[0].facts.eventDate,undefined);assert.equal(entries[0].facts.venue,undefined);
});
for(const [type,title,lead] of [
 ['craftsmanship','アコースティックギターの製造過程','Morris Guitarsのアコースティックギターの製造過程を紹介。'],
 ['feature','アコースティックギターの構造について','Morris Guitarsのアコースティックギターの構造を解説。'],
 ['support','アコースティックギターのメンテナンスについて','Morris Guitarsのアコースティックギターのメンテナンスを解説。']
])test('explicit non-event subject/action without canned heading phrase: '+type,async()=>{
 const e=await parse(title,[lead]);assert.equal(e.facts.articleType,type);assert.equal(e.eventType,'morris_editorial');assert.equal(e.facts.eventDate,undefined);assert.ok(morrisLabel(e.facts,e.eventType));
 assert.equal((await parse(title,[lead+'来月公開予定です。'])).facts,null);
});
test('event report, catalog and artist require corroborated explicit subjects',async()=>{
 const report=await parse('「合成ギター祭」開催レポート',['Morris Guitarsのアコースティックギターを紹介する「合成ギター祭」の開催レポートを公開。']);assert.equal(report.facts.articleType,'event_report');
 const catalog=await parse('ギターカタログ「合成2026」',['Morris Guitarsのアコースティックギターカタログ「合成2026」を公開。']);assert.equal(catalog.facts.articleType,'catalog');
 const artist=await parse('合成奏者の演奏活動',['Morris Guitarsで合成奏者のアコースティックギター演奏活動を紹介。','ギタリスト：合成奏者']);assert.equal(artist.facts.articleType,'artist_activity');assert.equal(artist.facts.subject,'合成奏者');
 assert.equal((await parse('合成奏者の演奏活動',['Morris Guitarsのアコースティックギターを紹介。','ギタリスト：合成奏者'])).facts,null);
});
test('generic prose, diagnosis, recruitment and unknown product do not become catch-all introductions',async()=>{
 for(const [title,lead] of [['一般案内','Morris Guitarsのアコースティックギターについてのお知らせ。'],['無料診断会','Morris Guitarsのアコースティックギター無料診断会を開催します。'],['演奏者募集','Morris Guitarsのアコースティックギター演奏者を募集。'],['新製品','Morris Guitarsの新製品を発表しました。']])assert.equal((await parse(title,[lead])).facts,null);
});
test('secondary analysis persists only closed facts/flags, never arbitrary prose',async()=>{
 const marker='DO_NOT_PERSIST_ARBITRARY_SOURCE_COPY';const e=await parse('一般案内',['Morris Guitarsのアコースティックギターの案内。'+marker]);assert.ok(!JSON.stringify(e).includes(marker));assert.equal(e.recoveryAnalysis.result,'hold');
 assert.equal(e.recoveryAnalysis.version,'morris-recovery-3');assert.equal(e.recoveryAnalysis.evaluatedTypes.length>=13,true);assert.ok(e.recoveryAnalysis.candidates.every(c=>Object.values(c.checks).every(v=>typeof v==='boolean')));
});
test('hidden/related content and content after the bounded window do not supply missing evidence',async()=>{
 const e=await parse(productTitle,['一般の案内。'],`<aside>${productLead}</aside><div class="related"><p>${productLead}</p></div>`);assert.equal(e.facts,null);
 const outside=await parse(productTitle,['案内1','案内2','案内3',productLead]);assert.equal(outside.facts,null);
});
async function setup(s=undefined){s??=await store();for(const action of ['collection-on','publish-on','source-enable'])await administer(s,{action,...(action==='source-enable'?{target:'morris'}:{}),reason:'review_complete'},now,registry);return s;}
const collect=(s,fetcher,at=now)=>collectSource('morris',s,{now:at,mode:'production',registry,pepper,requestMode:'scheduled',fetcher,sleep:async()=>{}});
test('one response feeds both analyses, historical recovery and authoritative validation with no teacher signal',async()=>{
 const s=await setup(),key='article:'+await hash(url);await s.db.prepare("INSERT INTO news_morris_acquisition(request_key,scope,source_url,jst_day,published_at,discovered_at,actual_requests,outcome,permission_ref) VALUES(?,'article',?,'2026-10-15','2026-09-30T15:00:00.000Z',?,0,'baseline_old',?)").bind(key,url,now-86400000,MORRIS_PERMISSION).run();
 const before=await s.db.prepare('SELECT * FROM news_morris_acquisition WHERE request_key=?').bind(key).first();const calls=[];
 const r=await collect(s,async u=>{calls.push(u);assert.ok([source.robotsUrl,MORRIS_LISTING].includes(u));return u===source.robotsUrl?new Response(null,{status:404}):new Response(listing(card(productTitle,[productLead])),{headers:{'content-type':'text/html'}});});
 assert.equal(r.historicalRecovered,1);assert.equal(calls.length,2);let row=(await s.candidates())[0];assert.equal(row.review_status,'pending');assert.equal((await publicationValidation(s,row,now,registry,pepper)).valid,true);
 assert.deepEqual(await s.db.prepare('SELECT * FROM news_morris_acquisition WHERE request_key=?').bind(key).first(),before);
 for(const t of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'])assert.equal((await s.db.prepare(`SELECT COUNT(*) n FROM ${t}`).first()).n,0);
 await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(row.id).run();const saved=JSON.stringify(await s.candidates());
 await collect(s,()=>{throw Error('extra request forbidden');});assert.equal(JSON.stringify(await s.candidates()),saved);
});
test('new detail is fetched at most once; same analyzer and proof validation apply to fresh articles',async()=>{
 const s=await setup(),fresh=url.replace('/1001_','/1016_'),calls=[];
 const fetcher=async u=>{calls.push(u);if(u===source.robotsUrl)return new Response(null,{status:404});return new Response(u===MORRIS_LISTING?listing(card(productTitle,['短い案内のみ。'],fresh,'2026.10.16')):`<html><head><link rel="canonical" href="${fresh}"></head><main><h2 class="serif">${productTitle}</h2><p>${productLead}</p></main></html>`,{headers:{'content-type':'text/html'}});};
 await collect(s,fetcher);const row=(await s.candidates())[0];assert.equal((await publicationValidation(s,row,now,registry,pepper)).valid,true);assert.equal(calls.filter(u=>u===fresh).length,1);
 await collect(s,()=>{throw Error('extra request forbidden');});assert.equal(calls.length,3);
});
test('legacy proof remains valid; unknown parser version or mixed listing/card versions fail closed',async()=>{
 const s=await setup();await collect(s,async u=>u===source.robotsUrl?new Response(null,{status:404}):new Response(listing(card('ギター製作工程の紹介',['Morris Guitarsのアコースティックギターの製作工程を紹介します。'])),{headers:{'content-type':'text/html'}}));
 const receipt=await s.db.prepare("SELECT * FROM news_morris_acquisition WHERE scope='listing'").first(),entries=JSON.parse(receipt.entries_json),proof=JSON.parse(receipt.proof_json);let row=(await s.candidates())[0];
 proof.parserVersion='morris-listing-facts-1';for(const e of entries)e.proof.parserVersion=proof.parserVersion;
 const provenance=JSON.parse(row.facts_provenance).map(p=>({...p,parserVersion:proof.parserVersion}));
 await s.db.prepare('UPDATE news_morris_acquisition SET entries_json=?,proof_json=? WHERE request_key=?').bind(JSON.stringify(entries),JSON.stringify(proof),receipt.request_key).run();await s.db.prepare('UPDATE candidate_items SET facts_provenance=? WHERE id=?').bind(JSON.stringify(provenance),row.id).run();row=(await s.candidates())[0];assert.equal(await morrisProofValid(s,row,now),true);
 entries[0].proof.parserVersion='morris-listing-facts-2';await s.db.prepare('UPDATE news_morris_acquisition SET entries_json=? WHERE request_key=?').bind(JSON.stringify(entries),receipt.request_key).run();assert.equal(await morrisProofValid(s,row,now),false);
 assert.equal(morrisParserSupported('invented',true),false);assert.equal(morrisParserSupported('morris-explicit-fields-1'),true);
});
test('recovered generic product still meets the existing publication-time duplicate guard',async()=>{
 const s=await setup();await collect(s,async u=>u===source.robotsUrl?new Response(null,{status:404}):new Response(listing(card(productTitle,[productLead])),{headers:{'content-type':'text/html'}}));
 const row=(await s.candidates())[0],copy={...row,id:'published-copy',source_url:'https://www.morris-guitar.com/information/2026/1002_01.html',normalized_url:'https://www.morris-guitar.com/information/2026/1002_01.html',review_status:'approved',topic_key:'published-copy'},keys=Object.keys(copy);
 await s.db.prepare(`INSERT INTO candidate_items(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...keys.map(k=>copy[k])).run();
 const validation=await publicationValidation(s,row,now,registry,pepper);assert.equal(validation.valid,false);assert.ok(validation.errors.includes('duplicate'));assert.equal(validation.duplicates[0].id,copy.id);
});
test('real isolated D1 persists generic analysis/facts and replays with no additional I/O',async()=>{
 const {localDatabase}=await import('../scripts/local-db.mjs'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'morris-e2e-d1-'));let runtime;
 try{
  runtime=await localDatabase(directory);const s=await setup(runtime.store),calls=[];
  await collect(s,async u=>{calls.push(u);assert.ok([source.robotsUrl,MORRIS_LISTING].includes(u));return u===source.robotsUrl?new Response(null,{status:404}):new Response(listing(card(productTitle,[productLead])),{headers:{'content-type':'text/html'}});});
  const receipt=await s.db.prepare("SELECT * FROM news_morris_acquisition WHERE scope='listing'").first(),e=JSON.parse(receipt.entries_json)[0],row=(await s.candidates())[0];
  assert.equal(e.recoveryAnalysis.selected,'generic');assert.equal(e.facts.product,'QA-73');assert.equal(receipt.entries_json.includes(productLead),false);assert.equal(receipt.entries_json.includes(productTitle),false);
  assert.equal((await publicationValidation(s,row,now,registry,pepper)).valid,true);const saved=JSON.stringify(await s.candidates()),acquired=JSON.stringify((await s.db.prepare('SELECT * FROM news_morris_acquisition').all()).results);
  await collect(s,()=>{throw Error('repeated publisher access');});assert.equal(calls.length,2);assert.equal(JSON.stringify(await s.candidates()),saved);assert.equal(JSON.stringify((await s.db.prepare('SELECT * FROM news_morris_acquisition').all()).results),acquired);
  const health=(await s.sourceHealth()).find(h=>h.source_id==='morris');assert.equal(health.status,'healthy');
  for(const t of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'])assert.equal((await s.db.prepare(`SELECT COUNT(*) n FROM ${t}`).first()).n,0);
 }finally{await runtime?.mf.dispose();await rm(directory,{recursive:true,force:true});}
});
