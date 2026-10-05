import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PUBLISHED_PRODUCT_TYPES,publishedHeadline,validPublishedHeadline,validPublishedDate,publishedCorrectionStatements} from '../src/published-headline.js';
import {preferredIndependentLabel,independentTopicUrls} from '../src/label-quality.js';
import {factualLabel,validatedProductFacts} from '../src/metadata.js';
import {duplicatePredicate,publicationValidation} from '../src/decision-policy.js';
import {database,store,now,source,registry,pepper} from './helpers.js';
import {sqlLiteral as q} from '../scripts/remote-db.mjs';
import {handleNewsRequest} from '../src/worker.js';
import {administer} from '../src/admin.js';
import {LEGACY_DIGEST} from '../src/legacy.js';
const row={id:'published-test',source_url:'https://sleepfreaks-dtm.com/dtm-materials/luna-3/',review_status:'approved'};
const proof={url:row.source_url,basis:'primary_article_review',verifiedAt:now,responseHash:'a'.repeat(64),fields:['identity','productType','action','qualifier','date','version','feature','theme','subtypes']};
const h={schemaVersion:1,scope:'published_admin_quality',candidateId:row.id,sourceUrl:row.source_url,kind:'product',brand:'Synthetic Maker',product:'XYZ-710',productType:'effect_pedal',action:'announce',evidence:[proof]};
for(const type of Object.keys(PUBLISHED_PRODUCT_TYPES))test('generic published type: '+type,()=>assert.match(publishedHeadline({...h,productType:type},row),new RegExp(PUBLISHED_PRODUCT_TYPES[type])));
for(const [action,phrase] of [['announce','を発表'],['release','を発売'],['scheduled_release','を発売予定'],['release_delay','の発売を延期'],['reservation_start','の予約受付を開始'],['information','の製品情報'],['update','を更新'],['firmware','のファームウェアを更新'],['spec_change','の仕様を変更'],['arrival','の入荷情報'],['early_sale','を国内先行販売'],['new_color','に新色が登場'],['collaboration_color','にコラボカラーが登場'],['reissue','を復刻'],['rerelease','を再発売'],['price_change','の価格を改定'],['discontinued','の販売を終了']])test('actual generic event: '+action,()=>assert(publishedHeadline({...h,action},row).endsWith(phrase)));
test('dates are explicit event dates, not publication/collection dates',()=>{
 assert(publishedHeadline({...h,action:'scheduled_release',date:'2026-10-09'},row).endsWith('を10月9日に発売予定'));
 assert(publishedHeadline({...h,action:'scheduled_release',date:'2026-10'},row).endsWith('を10月に発売予定'));
 assert(publishedHeadline({...h,action:'release_delay',date:'2027'},row).endsWith('の発売を延期（2027年予定）'));
 for(const date of ['2026-02-30','2026-13-01','2026-10-32','today','2026/10/9'])assert(!validPublishedDate(date));
 assert.equal(publishedHeadline({...h,date:'2026-10-09'},row),null);
});
test('specific qualifiers, multi-model subtypes and specification changes remain',()=>{
 assert.match(publishedHeadline({...h,qualifier:'japan_limited',action:'release'},row),/日本限定のエフェクター/);
 assert.match(publishedHeadline({...h,qualifier:'limited',action:'reissue'},row),/限定エフェクター.*を復刻$/);
 assert.match(publishedHeadline({...h,subtypes:['granular','flanger']},row),/グラニュラー／フランジャーエフェクター/);
 assert.match(publishedHeadline({...h,action:'spec_change',feature:'新ピックアップ搭載仕様'},row),/に新ピックアップ搭載仕様が登場$/);
});
test('proof must cover every asserted fact, category never creates evidence',()=>{
 for(const field of ['identity','productType','action','date','qualifier','version','feature','theme','subtypes']){
  const addition={date:{action:'scheduled_release',date:'2026-10-09'},qualifier:{qualifier:'limited'},version:{action:'update',version:'2.0'},feature:{action:'spec_change',feature:'仕様'},theme:{kind:'interview',person:'テスト奏者',theme:'composition_arrangement',action:'interview',brand:undefined,product:undefined,productType:undefined},subtypes:{subtypes:['granular']}}[field]||{};
  const value={...h,...addition,evidence:[{...proof,fields:proof.fields.filter(f=>f!==field)}]};for(const k of Object.keys(value))if(value[k]===undefined)delete value[k];
  assert.equal(validPublishedHeadline(value,row),false,field);
 }
 assert.equal(publishedHeadline({...h,evidence:[{...proof,basis:'category'}]},row),null);
 for(const patch of [{productType:'guessed'},{action:'guessed'},{brand:'<img onerror=x>'},{product:'x\ny'},{subtypes:['unverified']},{evidence:[]}])assert.equal(publishedHeadline({...h,...patch},row),null);
});
test('binding, unknown fields, missing evidence and non-approved state fail closed',()=>{
 for(const r of [{...row,id:'different'},{...row,source_url:'https://example.com/'},{...row,review_status:'pending'},{...row,review_status:'rejected'}])assert.equal(publishedHeadline(h,r),null);
 assert.equal(publishedHeadline({...h,category:'electric_guitar_bass'},row),null);
 assert.equal(publishedHeadline({...h,evidence:[{...proof,url:'javascript:alert(1)'}]},row),null);
});
test('specific interview themes and auction/exhibition are not generic product launches',()=>{
 const core={schemaVersion:1,scope:h.scope,candidateId:row.id,sourceUrl:row.source_url,evidence:[proof]};
 assert.equal(publishedHeadline({...core,kind:'interview',person:'奏者A',action:'interview',theme:'composition_arrangement'},row),'奏者A、アコギでの作曲・アレンジを語るインタビュー');
 assert.match(publishedHeadline({...core,kind:'auction',person:'奏者A',action:'guitar_collection_auction'},row),/個人コレクションを競売へ$/);
 assert.equal(publishedHeadline({...core,kind:'exhibition',brand:'出展者A',event:'催事A',exhibit:'機材A',action:'exhibiting'},row),'出展者A、催事Aに機材Aを出展');
});
test('public display preserves reviewed label only with a matching generated label',()=>{
 const label=publishedHeadline(h,row),r={...row,label,product_facts:JSON.stringify({headlineQuality:h})};
 assert.equal(preferredIndependentLabel(r),label);
 assert.equal(preferredIndependentLabel({...r,label:'unreviewed alteration'}),'unreviewed alteration');
});
test('additive presentation facts cannot create publication eligibility or alter duplicate identities',async()=>{
 const s=await store(),r={...row,source_id:source.id,category:'dtm_software',published_at:new Date(now-86400000).toISOString(),expires_at:now+86400000,event_type:'new_product',topic_key:'topic',normalized_url:row.source_url,product_facts:null,label:'existing'};
 const old=await publicationValidation(s,r,now,registry,pepper),updated={...r,product_facts:JSON.stringify({headlineQuality:h}),label:publishedHeadline(h,row)};
 assert(!validatedProductFacts({headlineQuality:h}));assert.equal(factualLabel({headlineQuality:h},r.event_type),null);
 assert.deepEqual((await publicationValidation(s,updated,now,registry,pepper)).errors,old.errors);
 const facts={brand:'Universal Audio',product:'LUNA',version:'3',category:'dtm_software'};
 assert.deepEqual(duplicatePredicate({...r,product_facts:JSON.stringify(facts)},facts),duplicatePredicate({...r,product_facts:JSON.stringify({...facts,headlineQuality:h})},{...facts,headlineQuality:h}));
 assert.deepEqual(independentTopicUrls({...r,product_facts:JSON.stringify(facts)}),independentTopicUrls({...r,product_facts:JSON.stringify({...facts,headlineQuality:h})}));
});
test('full-row CAS preserves original facts, dates/status/source/teacher/Shadow; disabled collection is allowed, takedowns are not',()=>{
 const db=database().raw;
 db.prepare('INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,expires_at,event_type,product_facts,review_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,'sleepfreaks','Test',row.source_url,row.source_url,'2026-10-01T00:00:00Z','dtm_software','Old label','topic','2026-10-02T00:00:00Z','approved','retained',now+86400000,'other',null,0);
 db.prepare('INSERT INTO source_state(source_id,disabled) VALUES(?,1)').run('sleepfreaks');
 const before=db.prepare('SELECT * FROM candidate_items WHERE id=?').get(row.id),p={facts:{headlineQuality:h},label:publishedHeadline(h,row),provenance:[{factField:'headlineQuality'}],at:now,requestId:'test-backfill'};
 const initialAudits=db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n;
 db.exec(publishedCorrectionStatements(before,p,q).join(';')+';');const after=db.prepare('SELECT * FROM candidate_items WHERE id=?').get(row.id);
 for(const k of Object.keys(before).filter(k=>!['label','product_facts','facts_provenance','review_revision'].includes(k)))assert.deepEqual(after[k],before[k],k);
 for(const table of ['news_decision_ledger','news_shadow_evaluations','news_operator_feedback'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n,initialAudits+1);
 db.exec(publishedCorrectionStatements(before,{...p,requestId:'race'},q).join(';')+';');assert.equal(db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n,initialAudits+1);
 assert.throws(()=>publishedCorrectionStatements(after,{...p,facts:{brand:'changed',headlineQuality:h}},q));
 db.prepare('UPDATE source_state SET publication_blocked=1 WHERE source_id=?').run('sleepfreaks');
 db.exec(publishedCorrectionStatements(after,{...p,provenance:[...JSON.parse(after.facts_provenance),{factField:'headlineQuality'}],requestId:'blocked'},q).join(';')+';');assert.equal(db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n,initialAudits+1);
});
test('all reviewed published entries have consistent, independently composed facts; insufficient evidence stays unchanged',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../data/published-headline-review-2026-10-06.json',import.meta.url)));
 assert.equal(manifest.entries.length,59);assert.equal(new Set(manifest.entries.map(e=>e.id)).size,59);
 for(const e of manifest.entries){if(e.headlineQuality)assert.equal(publishedHeadline(e.headlineQuality,{id:e.id,source_url:e.sourceUrl,review_status:'approved'}),e.after);else assert.equal(e.after,e.publicBefore);if(e.classification==='D')assert.equal(e.headlineQuality,null);}
 assert.equal(manifest.entries.filter(e=>e.headlineQuality?.productType).length,50);
});
test('real public API retains inactive legacy articles, exact grant identity and cache invalidation after headline backfill',async()=>{
 const s=await store();await administer(s,{action:'publish-on',reason:'review_complete'},now);
 const db=s.db.raw;
 db.prepare('INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,expires_at,event_type,product_facts,review_revision,origin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,'sleepfreaks','Test',row.source_url,row.source_url,new Date(now-1000).toISOString(),'dtm_software','LUNA 3の更新情報','topic',new Date(now).toISOString(),'approved','legacy_fixture_verified',now+86400000,'update',null,0,'legacy_fixture_backfill');
 const before=db.prepare('SELECT * FROM candidate_items WHERE id=?').get(row.id);
 db.prepare('INSERT INTO legacy_news_grants VALUES(?,?,?,?,?,?,?)').run(before.id,before.label,before.source_id,before.source_url,before.published_at,before.category,LEGACY_DIGEST);
 const grant=db.prepare('SELECT * FROM legacy_news_grants').get(),map=new Map(),cache={match:async k=>map.get(k.url)?.clone(),put:async(k,v)=>map.set(k.url,v.clone())};
 const api=async()=>{const response=await handleNewsRequest(new Request('https://news.example/v1/news'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry:[],cache});assert.equal(response.status,200);return response.json();};
 assert.equal((await api()).items.length,1);
 const p={facts:{headlineQuality:h},label:publishedHeadline(h,row),provenance:[{factField:'headlineQuality'}],at:now,requestId:'legacy-quality'};
 db.exec(publishedCorrectionStatements(before,p,q).join(';')+';UPDATE news_controls SET revision=revision+1 WHERE id=1;');
 const after=await api();assert.equal(after.items.length,1);assert.equal(after.items[0].label,p.label);
 assert(!Object.hasOwn(after.items[0],'product_facts'));assert(!Object.hasOwn(after.items[0],'review_status'));
 const updatedGrant=db.prepare('SELECT * FROM legacy_news_grants').get();assert.deepEqual({...updatedGrant,label:grant.label},{...grant});
 db.exec(publishedCorrectionStatements(before,{...p,requestId:'legacy-race'},q).join(';')+';');assert.deepEqual(db.prepare('SELECT * FROM legacy_news_grants').get(),updatedGrant);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM news_shadow_evaluations').get().n,0);
});
