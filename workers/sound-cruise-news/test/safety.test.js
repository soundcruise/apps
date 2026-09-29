import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fingerprint,headlineSimilarity,normalizeHeadline} from '../src/fingerprint.js';
import {productFacts,candidateFrom,allowedArticlePath,contentType} from '../src/metadata.js';
import {collectSource} from '../src/collector.js';
import {reviewCandidate} from '../src/review.js';
import {getSource,evidenceGate,phaseOneReady,phaseOneSourceReady,legalGate} from '../src/registry.js';
import {hash,robotsPolicy} from '../src/policy.js';
import {pepper,source,registry,now,robots,feed,store,options,approval} from './helpers.js';
const title='Universal Audio LUNA 3の新機能を発表、録音編集と音楽制作の機能を拡張';
const off={NEWS_COLLECTION_MODE:'off',NEWS_API_MODE:'off',crons:[]};
test('N1: keyed bounded sketch contains neither raw headline, pepper, salt nor unsalted digest',async()=>{
 const fp=await fingerprint(title,pepper),json=JSON.stringify(fp);
 assert.equal(fp.version,2);assert.ok(fp.grams.length<=64);assert.ok(!json.includes(title));assert.ok(!json.includes(pepper));assert.equal(fp.salt,undefined);assert.equal(fp.normalizedHash,undefined);
 for(const value of [title,normalizeHeadline(title),'Uni','luna'])assert.ok(!json.includes(await hash(value)));
 const long=await fingerprint('abcdefghijklmnopqrstuvwxyz0123456789'.split('').map((c,i)=>c+i+'音楽制作').join(''),pepper);
 assert.ok(long.count>64);assert.equal(long.grams.length,64);
 const wrong=await fingerprint(title,'different-test-secret-only-0123456789');assert.notEqual(wrong.exact,fp.exact);assert.notEqual(wrong.keyId,fp.keyId);
 assert.equal(await headlineSimilarity('独自に書いた短い確認用ラベル',fp,'different-test-secret-only-0123456789'),true);
});
test('N1: normalized and reordered near copies rejected; independent label accepted',async()=>{
 const fp=await fingerprint(title,pepper);
 for(const copy of [title+'。',title.replaceAll(' ','\n'),title.replace('LUNA 3','ＬＵＮＡ　３'),title.toLowerCase(),'録音編集と音楽制作の機能を拡張、Universal Audio LUNA 3の新機能を発表'])assert.equal(await headlineSimilarity(copy,fp,pepper),true);
 assert.equal(await headlineSimilarity('DAWの変更内容を確認する',fp,pepper),false);
 const chunks=['新しい音楽制作環境では多彩な編集操作に対応','直感的な画面設計と柔軟なトラック管理を提供','Universal Audio LUNA 3の新機能を発表','ミックス作業を支える最新の便利な機能を搭載'];
 const long=await fingerprint(chunks.join('、'),pepper);assert.equal(long.grams.length,64);
 assert.equal(await headlineSimilarity([chunks[2],chunks[0],chunks[3],chunks[1]].join('、'),long,pepper),true);
});
test('N1: missing/short secret fails closed at collection and approval; old sketches unapprovable',async()=>{
 for(const key of [undefined,'short'])await assert.rejects(fingerprint(title,key),/pepper_required/);
 const s=await store();let calls=0;const r=await collectSource(source.id,s,options({pepper:undefined,fetcher:()=>{calls++;throw Error();}}));assert.equal(r.outcome,'headline_pepper_required');assert.equal(calls,0);
 await collectSource(source.id,s,options());const item=(await s.candidates())[0];
 await assert.rejects(reviewCandidate(s,approval(item),now,registry),/pepper_required/);
 for(const old of [null,{version:1,salt:'known',grams:[]}])assert.equal(await headlineSimilarity('独立したラベルを検証する',old,pepper),true);
});
test('N1: active database has no title_hash; candidate persistence and public projection hide sensitive fields',async()=>{
 const s=await store();await collectSource(source.id,s,options());
 assert.ok(!s.db.raw.prepare('PRAGMA table_info(candidate_items)').all().some(c=>c.name==='title_hash'));
 const rows=await s.candidates(),json=JSON.stringify(rows);
 assert.ok(!json.includes(pepper));assert.ok(!json.includes('新機能アップデートの紹介'));assert.ok(!json.includes('title_hash'));
});
test('N1: migration quarantines legacy approved records without converting signatures',()=>{
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_news.sql','0002_safety.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 db.exec("INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,category,label,topic_key,collected_at,title_hash,title_fingerprint,review_status,review_reason,expires_at) VALUES('old','test','test','https://example.com/a','https://example.com/a','dtm_software','legacy label','old','2026-09-28','old-unsalted-digest','old-salted-grams','approved','legacy',9999999999999)");
 db.exec(readFileSync(new URL('../migrations/0003_keyed_fingerprint.sql',import.meta.url),'utf8'));
 const row=db.prepare('SELECT * FROM candidate_items').get();assert.equal(row.title_hash,undefined);assert.equal(row.title_fingerprint,null);assert.equal(row.review_status,'pending');assert.equal(row.review_reason,'legacy_pepper_recollection_required');db.close();
});
test('N2: brand and product must both be explicit, common words cannot supply facts',()=>{
 assert.equal(productFacts('Universal Audio LUNA 3 update').brand,'Universal Audio');
 assert.equal(productFacts('BOSS GX-1 新製品を発売').product,'GX-1');
 for(const text of ['LUNA SEA 新曲をリリース','Luna guitar released','LUNA 3 update','BOSS 新製品','boss gave me a GX-1','Reason Logic Studio update','LAVA STUDIO new product','Lunacy NOVA update','Universal Audio unknown product'])assert.equal(productFacts(text),null,text);
});
test('N2: unknown brand/product/event stays label_required and pending without fabricated facts',async()=>{
 const p=robotsPolicy(robots,source);
 for(const title of ['Luna guitar 新モデルを発表','Universal Audio LUNA の機能一覧','知らないメーカーの新しいギターペダルを発売']){
  const r=await candidateFrom({title,url:source.baseUrl+'dtm-materials/probe/',date:'2026-09-28'},source,p,now,pepper);
  assert.equal(r.item.reviewReason,'label_required');assert.equal(r.item.manualReviewStatus,'pending');
  if(!title.startsWith('Universal Audio'))assert.ok(!r.item.label.includes('Universal Audio'));
 }
 assert.equal(contentType('Universal Audio LUNA'),'other');assert.equal(contentType('Universal Audio LUNA price change'),'price_change');
});
test('N3: corrected exact official policy URLs and ESP deep-link restriction',()=>{
 assert.equal(getSource('kanda').termsUrl,'https://www.kandashokai.co.jp/terms/');assert.ok(!getSource('kanda').termsUrl.includes('notice.html'));
 assert.equal(getSource('esp').linkPolicyUrl,'https://espguitars.co.jp/support/link');assert.match(getSource('esp').policySummary,/deep links.*prohibited/i);assert.equal(getSource('esp').legalStatus,'CONTACT');
 const at=getSource('audio-technica');assert.equal(at.linkPolicyUrl,'https://www.audio-technica.co.jp/corp/privacypolicy');assert.match(at.policySummary,/framing/);
});
test('Shimamura: readiness requires complete fresh evidence, validated Feed/robots, rules, rate and production OFF',()=>{
 const real=getSource('shimamura');
 const ready={...real,reviewedAt:'2026-09-28',robotsReviewedAt:'2026-09-28',discoveryReviewedAt:'2026-09-28',policyDecision:'approved',robotsValid:true,discoveryValid:true,sourceRulesReviewed:true,localPilotEnabled:true};
 assert.equal(evidenceGate(ready,now),null);assert.equal(phaseOneReady(ready,now,off),true);
 for(const [field,value] of [['termsUrl',null],['reviewedAt','2020-01-01'],['robotsValid',false],['discoveryValid',false],['sourceRulesReviewed',false],['allowedPaths',[]],['deniedPaths',[]],['crawlIntervalHours',6],['productionEnabled',true],['enabled',true]])assert.equal(phaseOneReady({...ready,[field]:value},now,off),false,field);
 for(const config of [undefined,{...off,NEWS_COLLECTION_MODE:'production'},{...off,NEWS_API_MODE:'production'},{...off,crons:['0 * * * *']}])assert.equal(phaseOneReady(ready,now,config),false);
 assert.equal(legalGate(ready,{},now,'local',[ready]),null);assert.equal(legalGate(ready,{},now,'production',[ready]),'collection_off');
 assert.equal(phaseOneSourceReady(getSource('sleepfreaks'),now),false);assert.equal(phaseOneSourceReady(getSource('hookup'),now),false);
});
test('Shimamura: narrow Gear paths only, shops/sale/campaign/events/lessons/used notices excluded',async()=>{
 const source=getSource('shimamura'),p={isAllowed:()=>true};
 for(const path of ['/shops/a','/update/sale/a','/update/campaign/a','/update/event/a','/update/dtm-recording/../../shops/a','/update/generic/a','/update/amp-effector/sale/a','/update/guitar-bass/%75sed/a'])assert.equal(allowedArticlePath(source.baseUrl.slice(0,-1)+path,source),false);
 const entry={listingSection:'product_news',listingCategory:'amp-effector',title:'BOSS GX-1 新製品を発表しました',url:source.baseUrl+'update/amp-effector/2026/09/80421/',date:'2026-09-28'};
 assert.equal((await candidateFrom(entry,source,p,now,pepper)).item.category,'amps_effects');
 assert.equal((await candidateFrom({...entry,title:'ギターライブ開催'},source,p,now,pepper)).reason,'artist_or_lifestyle');
 for(const term of ['sale','coupon','used','event','lesson','recruit','営業時間','店舗案内','入荷情報'])assert.equal((await candidateFrom({...entry,title:entry.title+' '+term},source,p,now,pepper)).item,undefined,term);
 assert.equal((await candidateFrom({...entry,title:entry.title+' campaign'},source,p,now,pepper)).item.publicationDecision,'PUBLISH_REVIEW');
});
