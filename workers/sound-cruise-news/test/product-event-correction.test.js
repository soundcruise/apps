import test from 'node:test';import assert from 'node:assert/strict';
import {verifiedArticleEvent,eventCorrectionStatements} from '../src/product-event-correction.js';
import {getSource} from '../src/registry.js';import {database} from './helpers.js';
import {sqlLiteral as q} from '../scripts/remote-db.mjs';
const source=getSource('shimamura'),facts={brand:'Gibson',product:'SJ-200 / Hummingbird',version:null,category:'acoustic_guitar'};
const row={id:'test-gibson',source_id:'shimamura',source_url:'https://www.shimamura.co.jp/update/guitar-bass/2026/10/89963/',normalized_url:'https://www.shimamura.co.jp/update/guitar-bass/2026/10/89963/',category:facts.category,product_facts:JSON.stringify(facts),label:'Gibson、SJ-200 / Hummingbirdを発表',event_type:'new_product',review_status:'approved',published_at:'2026-09-30T15:00:00.000Z'};
const html=(title='Gibson SJ-200 / Hummingbirdにコア材仕様がラインナップ',lead='両製品の仕様を確認できます。')=>`<h1>${title}</h1><span>公開：<time datetime="2026-10-01">2026/10/01</time></span><span>更新：<time datetime="2026-10-03">2026/10/03</time></span><article><p>${lead}</p><aside><p>Fender 限定モデル登場</p></aside></article>`;
test('event correction: verifies Gibson multi-product spec, publication not modification date',()=>{
 const result=verifiedArticleEvent(html(),row,source);assert.equal(result.label,'Gibson、SJ-200 / Hummingbirdに特別仕様が登場');assert.equal(result.facts.productEvent.basis,'verified_primary_article');
});
test('event correction: no action from sidebar/descriptive body, scope/identity/date fail closed',()=>{
 for(const body of [html('Gibson SJ-200 / Hummingbirdを発表'),html('Gibson Hummingbirdに特別仕様が登場'),html('Fender限定モデル登場').replace('<article>','<article><h2>Gibson SJ-200 / Hummingbird</h2>'),html().replace('datetime="2026-10-01"','datetime="2026-10-02"'),html().replace('<article>','<meta name="robots" content="noindex"><article>')])assert.throws(()=>verifiedArticleEvent(body,row,source));
 assert.throws(()=>verifiedArticleEvent(html(),{...row,review_status:'pending'},source));
});
test('event correction: scoped CAS changes facts/label only, no decision/Shadow/status/date/category change',()=>{
 const db=database().raw;
 db.prepare('INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,expires_at,event_type,product_facts,review_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.source_id,'島村楽器',row.source_url,row.normalized_url,row.published_at,row.category,row.label,'test-topic','2026-10-03T00:00:00Z','approved','automatic_factual_template',Date.parse('2026-12-30'),row.event_type,row.product_facts,0);
 const initialAudit=db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n;
 const before=db.prepare('SELECT * FROM candidate_items WHERE id=?').get(row.id);
 const plan={...verifiedArticleEvent(html(),row,source),provenance:[{sourceUrl:row.source_url,verifiedAt:1,responseHash:'synthetic-test-proof'}],at:1,requestId:'test-correction'};
 db.exec(eventCorrectionStatements(before,plan,q).join(';')+';');
 const after=db.prepare('SELECT * FROM candidate_items WHERE id=?').get(row.id);
 for(const key of Object.keys(before).filter(k=>!['label','product_facts','facts_provenance','review_revision'].includes(k)))assert.deepEqual(after[key],before[key],key);
 assert.equal(after.review_revision,1);assert.equal(after.label,plan.label);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM news_shadow_evaluations').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n,initialAudit+1);
 // A replay/race cannot overwrite a changed candidate or create another audit event.
 db.exec(eventCorrectionStatements(before,{...plan,requestId:'race'},q).join(';')+';');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n,initialAudit+1);
});
