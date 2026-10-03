import test from 'node:test';import assert from 'node:assert/strict';
import {productFacts,factualLabel,validatedProductFacts} from '../src/metadata.js';
import {correctedVoltFacts,VOLT_CORRECTION_URL} from '../src/product-name-correction.js';
const title='【Universal Audio】5年振りのフルモデルチェンジ！『Volt Gen2』『Volt Max』シリーズ6機種リリース！';
const html=`<time class="sub_info_date">2026年10月02日公開</time><div class="blog_title__inner"><h1>${title}</h1></div><div class="main_wrap"><p>・Volt Gen 2およびVolt Maxシリーズは、次世代のUSBオーディオインターフェイスです。</p></div>`;
const row={source_id:'ikebe',source_url:VOLT_CORRECTION_URL,review_status:'pending',published_at:'2026-10-01T15:00:00.000Z',event_type:'release',category:'dtm_software',product_facts:JSON.stringify({brand:'Universal Audio',product:'Gen2',version:null,category:'dtm_software',identifierBasis:'explicit_model_code'})};
test('explicit quoted generation retains Volt family and separate brand, without guessing',()=>{
 for(const t of [title,'Universal Audio「Volt Gen 2」を発売']){const facts=productFacts(t);assert.equal(facts.product,'Volt Gen 2');assert.equal(facts.brand,'Universal Audio');assert(validatedProductFacts(facts));assert.equal(factualLabel(facts,'release'),'Universal Audio、Volt Gen 2を発売');}
 assert.equal(productFacts('Universal Audio Gen2発売'),null);
 assert.notEqual(productFacts('Universal Audio「Volt Max」発売')?.product,'Volt Gen 2');
 // Structural regression cases; synthetic names are not real product facts/fixtures.
 for(const suffix of ['Gen 2','MKII','MK2','V2','Series II'])assert.equal(productFacts(`Universal Audio「Test6Family ${suffix}」発売`).product,`Test6Family ${suffix}`);
 assert.equal(productFacts('SHURE「MV6 Gen 2」発売').product,'MV6 Gen 2');
});
test('correction requires exact primary article, release evidence and body family; preserves raw category',()=>{
 const r=correctedVoltFacts(html,row);assert.equal(r.facts.category,row.category);assert.equal(r.label,'Universal Audio、Volt Gen 2を発売');
 for(const bad of [html.replace('リリース','価格表'),html.replace('2026年10月02日公開','2026年10月01日公開'),html.replace('Volt Gen 2および','他製品および'),html.replace('blog_title__inner','sidebar'),html.replace('<p>','<p hidden>'),html+'<meta name="robots" content="nosnippet">'])assert.throws(()=>correctedVoltFacts(bad,row));
 for(const patch of [{review_status:'approved'},{source_url:VOLT_CORRECTION_URL+'x'},{published_at:'2026-10-02T00:00:00.000Z'}])assert.throws(()=>correctedVoltFacts(html,{...row,...patch}));
});
import {setup,put,now} from './operator-case.js';
import {correctionInsertSql} from '../src/product-name-correction.js';
import {sqlLiteral} from '../scripts/remote-db.mjs';
import {factualTopicKey} from '../src/metadata.js';
test('audited correction commits through existing trigger, refuses stale snapshot, preserves decisions and raw category',async()=>{
 const s=await setup();await put(s,'volt-fixture',{sourceId:'ikebe',sourceUrl:row.source_url,normalizedUrl:row.source_url,publishedAt:row.published_at,category:row.category,eventType:row.event_type,productFacts:JSON.parse(row.product_facts)});
 const before=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind('volt-fixture').first();
 const {facts,label}=correctedVoltFacts(html,before);
 const provenance=[{sourceId:'ikebe',sourceUrl:row.source_url,verifiedAt:now,parserVersion:'quoted-generation-1',factField:'product',responseHash:'a'.repeat(64)}];
 const plan={at:now,requestId:'volt-correction-fixture',provenance,patch:{product_facts:JSON.stringify(facts),label,category:before.category,event_type:before.event_type,event_ends_at:before.event_ends_at,topic_key:factualTopicKey(facts,before.event_type)}};
 await s.db.prepare(correctionInsertSql({...before,review_revision:before.review_revision+1},plan,'a'.repeat(64),now,sqlLiteral)).run();
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_facts_rechecks').first()).n,0);
 await s.db.prepare(correctionInsertSql(before,plan,'a'.repeat(64),now,sqlLiteral)).run();
 const after=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(before.id).first();
 assert.equal(after.label,label);assert.equal(after.category,before.category);assert.equal(after.review_status,'pending');assert.equal(after.review_revision,before.review_revision+1);assert.deepEqual(JSON.parse(after.facts_provenance),provenance);
 await s.db.prepare(correctionInsertSql(before,{...plan,requestId:'volt-stale-replay'},'a'.repeat(64),now,sqlLiteral)).run();
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_facts_rechecks').first()).n,1);
 for(const table of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'])assert.equal((await s.db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
});
