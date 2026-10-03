import test from 'node:test';import assert from 'node:assert/strict';
import {productEventFrom,validatedProductEvent} from '../src/product-event.js';
import {factualLabel,productFacts,candidateFrom,factualTopicKey} from '../src/metadata.js';
import {preferredIndependentLabel} from '../src/label-quality.js';
import {decisionProfile,similarity} from '../src/operator-insights.js';
import {getSource} from '../src/registry.js';
import {pepper,store} from './helpers.js';
import {handleNewsRequest} from '../src/worker.js';
const base=productFacts('BOSS EX-4');
for(const [action,word,suffix] of [
 ['special_edition','特別仕様','に特別仕様が登場'],['limited_edition','限定モデル','の限定モデルを発表'],
 ['new_color','新色','に新色が登場'],['collaboration','コラボモデル','のコラボモデルを発表'],
 ['reissue','復刻','を復刻'],['rerelease','再発売','を再発売'],['new_variant','新仕様','に新仕様が登場']
])test(`product event: ${action} uses verified statement, concise Japanese action`,()=>{
 const event=productEventFrom(`BOSS EX-4 ${word}を発表`,base,'new_product');
 assert.equal(event.action,action);assert.ok(validatedProductEvent(event));
 assert.equal(factualLabel({...base,productEvent:event},'new_product'),'BOSS、EX-4'+suffix);
});
for(const [event,suffix] of [['new_product','を発表'],['release','を発売'],['update','を更新'],['firmware','のファームウェア更新']])test(`product event: legacy ${event} remains compatible`,()=>{
 assert.equal(factualLabel(base,event),'BOSS、EX-4'+suffix);
 assert.equal(productEventFrom('BOSS EX-4 new product',base,event),null);
});
for(const title of ['BOSS EX-4 Special Sound 新製品発表','BOSS EX-4 custom circuit 新製品発表','BOSS EX-4 Blue 発売','BOSS EX-4 特別仕様の回路を搭載して新製品を発表','BOSS EX-4。Fender XX-10 限定モデル登場','過去のBOSS EX-4 復刻例','BOSS EX-4 特別仕様は登場しない','BOSS EX-4 特別仕様','BOSS EX-4 特別仕様 発売予定'])test(`product event: descriptive/uncertain text never refines action: ${title}`,()=>{
 assert.equal(productEventFrom(title,base,'new_product'),null);
});
test('product event: multi-product material specification launch (Gibson), not arbitrary material word',async()=>{
 const facts=productFacts('Gibson SJ-200 Hummingbird');
 const title='Gibson SJ-200 / Hummingbirdにコア材仕様がラインナップ';
 const event=productEventFrom(title,facts,'other');
 assert.equal(event.action,'special_edition');
 assert.equal(factualLabel({...facts,productEvent:event},'new_product'),'Gibson、SJ-200 / Hummingbirdに特別仕様が登場');
 assert.equal(productEventFrom('Gibson SJ-200 / Hummingbird、コア材採用の新製品を発表',facts,'new_product'),null);
 const s={...getSource('shimamura'),enabled:true};
 const {item}=await candidateFrom({title,url:'https://www.shimamura.co.jp/update/guitar-bass/2026/10/89963/',date:'2026-10-01',listingSection:'product_news',listingCategory:'guitar-bass'},s,{isAllowed:()=>true},Date.parse('2026-10-03'),pepper);
 assert.equal(item.productFacts.productEvent.action,'special_edition');assert.equal(item.label,'Gibson、SJ-200 / Hummingbirdに特別仕様が登場');
});
test('product event: invalid/unverified action cannot generate publishable facts label',()=>{
 for(const productEvent of [{action:'special_edition'},{action:'special_edition',basis:'guess',signal:'explicit_special_edition'},{action:'<script>',basis:'explicit_primary_title',signal:'explicit_special_edition'}])assert.equal(factualLabel({...base,productEvent},'new_product'),null);
 const e=productEventFrom('BOSS EX-4 特別仕様を発表',base,'new_product');
 assert.equal(factualLabel({...base,productEvent:e},'firmware'),null);
 assert.equal(factualTopicKey({...base,productEvent:e},'new_product'),factualTopicKey(base,'new_product'));
});
test('product event: verified action wins over coarse fixture label; API contract and status unchanged',async()=>{
 const facts=productFacts('Gibson SJ-200 Hummingbird'),event=productEventFrom('Gibson SJ-200 / Hummingbirdにコア材仕様が登場',facts,'new_product');
 const label=factualLabel({...facts,productEvent:event},'new_product');
 const s=await store(),now=Date.parse('2026-10-03');
 const source={...getSource('shimamura'),enabled:true};
 const {item}=await candidateFrom({title:'Gibson SJ-200 / Hummingbirdにコア材仕様が登場',url:'https://www.shimamura.co.jp/update/guitar-bass/2026/10/89963/',date:'2026-10-01',listingSection:'product_news'},source,{isAllowed:()=>true},now,pepper);
 await s.put(item);await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(item.id).run();
 const row=(await s.candidates())[0];assert.equal(preferredIndependentLabel(row),label);
 const r=await handleNewsRequest(new Request('https://news.example.invalid/v1/news'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry:[source],cache:null});
 const body=await r.json();assert.equal(body.contractVersion,1);assert.equal(body.items[0].label,label);assert.equal(body.items[0].publishable,true);
 assert.equal((await s.candidates())[0].review_status,'approved');
});
test('product event: action refines future similarity without creating teacher or rewriting history',()=>{
 const event=productEventFrom('BOSS EX-4 特別仕様を発表',base,'new_product');
 const row={source_id:'shimamura',source_url:'https://www.shimamura.co.jp/update/x/',category:base.category,event_type:'new_product',product_facts:JSON.stringify(base),published_at:'2026-10-01'};
 const before=decisionProfile(row,{valid:true},Date.parse('2026-10-03'));
 const after=decisionProfile({...row,product_facts:JSON.stringify({...base,productEvent:event})},{valid:true},Date.parse('2026-10-03'));
 assert.equal(after.productAction,'special_edition');assert.equal(similarity(before,after).level,'WEAK_SIMILAR');assert.notEqual(similarity(after,after).level,'WEAK_SIMILAR');
});
test('product event: ambiguous edition signal stays REVIEW; model Special is not an edition',async()=>{
 const source={...getSource('shimamura'),enabled:true};
 const {item}=await candidateFrom({title:'Fender FSR American Acoustasonic Telecaster 限定ルックスが登場',url:'https://www.shimamura.co.jp/update/guitar-bass/2026/10/11111/',date:'2026-10-01',listingSection:'product_news'},source,{isAllowed:()=>true},Date.parse('2026-10-03'),pepper);
 assert.equal(item.publicationDecision,'PUBLISH_REVIEW');assert.equal(item.decisionReason,'product_event_uncertain');assert.equal(item.productFacts.scopeUncertain,true);
 assert.equal(productEventFrom('BOSS EX-4 Olympic Special 新製品発表',base,'new_product'),null);
});
test('product event: collaboration/limited color retain the actual edition nature',()=>{
 const f=productFacts('PRS Silver Sky');
 assert.equal(factualLabel({...f,productEvent:productEventFrom('PRS Silver Skyにコラボカラーが登場',f,'new_product')},'new_product'),'PRS、Silver Skyにコラボカラーが登場');
 assert.equal(factualLabel({...base,productEvent:productEventFrom('BOSS EX-4 限定カラー発売',base,'release')},'release'),'BOSS、EX-4に限定カラーが登場');
});
