import test from 'node:test';import assert from 'node:assert/strict';
import {productAttribution,attributedProductHeadline} from '../src/product-attribution.js';
import {factualLabel,candidateFrom} from '../src/metadata.js';
import {getSource} from '../src/registry.js';
import {publishedHeadline,publishedCorrectionStatements} from '../src/published-headline.js';
import {duplicatePredicate} from '../src/decision-policy.js';
import {database} from './helpers.js';
const info={brand:'Example Instruments',subject:'ギター「EX100」',action:'new_product_information'};
test('distributor, retailer, editorial and manufacturer sources never replace the explicit brand',()=>{
 for(const source of ['kikutani','ikebe','shimamura','agm','zoom','morris']){
  const roles=productAttribution({...info,source});assert.equal(roles.headlineSubject,info.brand);assert.equal(roles.source,source);assert.equal(roles.announcementActor,null);
  assert.equal(attributedProductHeadline({...info,source}),'Example Instruments、ギター「EX100」の新製品情報');
  assert.equal(attributedProductHeadline({...info,source,brand:null}),null);
 }
});
test('announcement, release, distribution and sales actors require product-bound explicit evidence',()=>{
 for(const [action,verb] of [['announce','発表'],['release','発売'],['distribution_start','取扱開始'],['sales_start','販売開始']]){
  assert.equal(attributedProductHeadline({...info,action}),null);
  assert.equal(attributedProductHeadline({...info,action,actor:'Dealer'}),null);
  const actorEvidence={actor:'Dealer',brand:info.brand,action,basis:'explicit_primary_subject'};
  assert.equal(attributedProductHeadline({...info,action,actor:'Dealer',actorEvidence}),`Example Instruments、ギター「EX100」（Dealerが${verb}）`);
  assert.equal(attributedProductHeadline({...info,action,actor:info.brand,actorEvidence:{...actorEvidence,actor:info.brand}}),`Example Instruments、ギター「EX100」を${verb}`);
  for(const patch of [{brand:'Unrelated'},{action:'information'},{basis:'source_name'},{actor:'Other'}])assert.equal(attributedProductHeadline({...info,action,actor:'Dealer',actorEvidence:{...actorEvidence,...patch}}),null);
 }
});
test('generic product information uses verified brand; ordinary release labels stay unchanged',()=>{
 const f={brand:'ZOOM',product:'H1essential',version:null,category:'recording_audio',identifierBasis:'official_manufacturer_model',manufacturerSource:'zoom'};
 assert.equal(factualLabel(f,'other'),'ZOOM、H1essentialの製品情報');
 assert.equal(factualLabel(f,'release'),'ZOOM、H1essentialを発売');
 assert.equal(productAttribution({source:'キクタニ',brand:''}),null);
});
test('future distributor card keeps brand, type and conservative action; unknown brand is incomplete',async()=>{
 const {now}=await import('./operator-case.js'),{pepper}=await import('./helpers.js');
 const source={...getSource('kikutani'),enabled:true,productionEnabled:true};
 const entry={title:'カッタウェイ付きエレアコ「Future Guitars FG100 & FG200」',url:source.discoveryUrl+'future-guitar/',date:new Date(now-86400000).toISOString(),listingSection:'official_news',listingTags:['新製品情報']};
 const r=await candidateFrom(entry,source,{isAllowed:()=>true},now,pepper);
 assert.equal(r.item.label,'Future Guitarsのエレアコ「FG100 / FG200」を紹介');
 assert.equal(r.item.sourceName,source.name);assert.equal(r.item.productFacts.brand,'Future Guitars');assert(!r.item.productFacts.releaseEvent);
 assert.equal(r.item.publicationDecision,'PUBLISH_REVIEW');
 const bad=await candidateFrom({...entry,title:'エレアコ「FG100」の新製品情報'},source,{isAllowed:()=>true},now,pepper);
 assert.notEqual(bad.item?.publicationDecision,'AUTO_PUBLISHABLE');assert(!bad.item?.productFacts?.brand);
});
test('published brand correction changes only presentation, with full-row CAS and immutable duplicate identity',()=>{
 const db=database().raw,at=Date.parse('2026-10-23T00:00:00Z');
 db.prepare("INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,expires_at,event_type,product_facts,review_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run('brand-test','kikutani','キクタニ','https://www.kikutani.co.jp/news/test/','https://www.kikutani.co.jp/news/test/','2026-10-20T15:00:00Z','electric_guitar_bass','Old headline','topic','2026-10-21T00:00:00Z','approved','human_approved',at+86400000,'new_product',JSON.stringify({brand:'Example Tools',product:'EX100',version:null,category:'electric_guitar_bass'}),4);
 const row=db.prepare('SELECT * FROM candidate_items').get(),old=JSON.parse(row.product_facts);
 const h={schemaVersion:1,scope:'published_admin_quality',candidateId:row.id,sourceUrl:row.source_url,kind:'product',brand:old.brand,product:old.product,productType:'truss_rod_tool',action:'new_product_information',evidence:[{url:row.source_url,basis:'trusted_structured_facts',verifiedAt:at,responseHash:'a'.repeat(64),fields:['identity','productType','action']}]};
 const p={facts:{...old,headlineQuality:h},label:publishedHeadline(h,row),provenance:[{factField:'headlineQuality'}],at,requestId:'brand-correction'};
 assert.equal(p.label,'Example Tools、トラスロッド調整工具「EX100」の新製品情報');
 assert.deepEqual(duplicatePredicate(row,old),duplicatePredicate(row,p.facts));
 const incoming={...row,id:'other-source',source_id:'shimamura',source_url:'https://www.shimamura.co.jp/update/guitar-bass/2026/10/12345/',normalized_url:'https://www.shimamura.co.jp/update/guitar-bass/2026/10/12345/',topic_key:'other-topic'};
 const duplicate=duplicatePredicate(incoming,old);
 assert.deepEqual(db.prepare('SELECT d.id FROM candidate_items d WHERE '+duplicate.sql).all(...duplicate.args).map(x=>x.id),[row.id]);
 const tables=['news_decision_ledger','news_operator_feedback','news_shadow_evaluations','news_presentation_days','news_presentation_requests'];
 db.prepare('INSERT INTO news_presentation_days VALUES(?,?,?,?)').run('2026-10-21',1,JSON.stringify([{id:row.id,hot:true},{id:'other',hot:false}]),at);
 const before=Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t).all()]));
 const auditCount=db.prepare('SELECT count(*) n FROM news_admin_audit').get().n;
 const q=x=>x===null?'NULL':typeof x==='number'?String(x):"'"+x.replaceAll("'","''")+"'";
 db.exec(publishedCorrectionStatements(row,p,q).join(';')+';');const after=db.prepare('SELECT * FROM candidate_items').get();
 for(const k of Object.keys(row).filter(k=>!['label','product_facts','facts_provenance','review_revision'].includes(k)))assert.deepEqual(after[k],row[k],k);
 for(const t of tables)assert.deepEqual(db.prepare('SELECT * FROM '+t).all(),before[t]);
 assert.equal(after.review_revision,5);assert.equal(after.review_status,'approved');
 assert.deepEqual(db.prepare('SELECT d.id FROM candidate_items d WHERE '+duplicate.sql).all(...duplicate.args).map(x=>x.id),[row.id]);
 db.exec(publishedCorrectionStatements(row,{...p,requestId:'stale'},q).join(';')+';');assert.equal(db.prepare('SELECT count(*) n FROM news_admin_audit').get().n,auditCount+1);
});
