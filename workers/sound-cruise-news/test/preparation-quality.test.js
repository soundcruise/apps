import test from 'node:test';import assert from 'node:assert/strict';
import {recordPreparationMetrics,observePreparation} from '../src/preparation-metrics.js';
import {preparationAudit} from '../src/preparation-audit.js';
import {getSource} from '../src/registry.js';
import {candidateFrom,factualLabel} from '../src/metadata.js';
import {listingProductNotice,productAttribution} from '../src/product-attribution.js';
import {publishedHeadline,validPublishedEvidence} from '../src/published-headline.js';
import {setup,now} from './operator-case.js';import{pepper}from'./helpers.js';
import {KIKUTANI_LISTING_PARSER} from '../src/kikutani-listing-evidence.js';
import {INSIGHTS_VERSION} from '../src/operator-insights.js';
import {DECISION_POLICY_VERSION} from '../src/decision-policy.js';
const source={...getSource('kikutani'),enabled:true,productionEnabled:true};
const url=source.discoveryUrl+'future-products/',facts={brand:'Future Guitars',product:'FG100',models:['FG100']};
const proof={sourceId:source.id,sourceUrl:source.discoveryUrl,verifiedAt:now,extractionMethod:'explicit_kikutani_listing_card',parserVersion:KIKUTANI_LISTING_PARSER,responseHash:'a'.repeat(64)};
const entry={url,title:'カッタウェイ付きエレアコ「Future Guitars FG100」',date:new Date(now-86400000).toISOString(),listingSection:'official_news',listingTags:['新製品情報'],listingProof:proof};
test('source, manufacturer, brand, actor, subject, product type and event type stay independent',()=>{
 assert.equal(productAttribution({brand:facts.brand,source:'Dealer',manufacturer:'Factory'}),null);
 const r=productAttribution({brand:facts.brand,source:'Dealer',manufacturer:'Factory',manufacturerEvidence:{basis:'explicit_primary_manufacturer',manufacturer:'Factory',brand:facts.brand},productType:'acoustic_guitar',eventType:'new_product'});
 assert.deepEqual([r.source,r.manufacturer,r.brand,r.announcementActor,r.headlineSubject,r.productType,r.eventType],['Dealer','Factory',facts.brand,null,facts.brand,'acoustic_guitar','new_product']);
});
for(const [text,action,actor]of [['Future Guitarsが「FG100」を発売','release','Future Guitars'],['Future Guitarsが「FG100」を発表','announce','Future Guitars'],['キクタニがFuture Guitars「FG100」の取扱を開始','distribution_start','キクタニ'],['キクタニがFuture Guitars「FG100」の販売を開始','sales_start','キクタニ'],['Future Guitars「FG100」が登場','appearance',null]])test('explicit product-bound event: '+action,()=>{const n=listingProductNotice(text,facts,'キクタニ');assert.equal(n.action,action);assert.equal(n.actor,actor);});
for(const text of ['Future Guitars「FG100」の新製品情報','Future Guitars「FG100」を発売予定','Future Guitarsが旧製品「FG100」を発売','Future Guitarsが「FG100」を発表し、発売','Future Guitars「FG100」に対応するケースが登場','Future Guitars「FG100」と関連製品が登場'])test('a tag, ambiguity, future date or related product cannot invent an event: '+text,()=>assert.equal(listingProductNotice(text,facts,'キクタニ'),null));
test('owner type confirmation cannot claim publisher identity, action or a source response hash',()=>{
 const owner={basis:'owner_product_type_confirmation',reference:'owner-confirmation:2026-10-23:acoustic',verifiedAt:now,fields:['productType']};assert(validPublishedEvidence(owner));
 for(const patch of [{fields:['identity']},{fields:['action']},{responseHash:'a'.repeat(64)},{url:'https://example.com/'}])assert(!validPublishedEvidence({...owner,...patch}));
 const row={id:'owner',source_url:url,review_status:'approved'},h={schemaVersion:1,scope:'published_admin_quality',candidateId:row.id,sourceUrl:url,kind:'product',brand:facts.brand,product:facts.product,productType:'acoustic_guitar',action:'product_overview',evidence:[{url:source.discoveryUrl,basis:'trusted_structured_facts',verifiedAt:now,responseHash:'b'.repeat(64),fields:['identity','action']},owner]};
 assert.equal(publishedHeadline(h,row),'Future Guitarsのアコースティックギター「FG100」を紹介');assert.equal(publishedHeadline({...h,evidence:[owner]},row),null);
});
test('unlisted brand/model grammar is retained as evidence-incomplete, never fabricated READY',async()=>{
 const r=await candidateFrom({...entry,title:'新しい工房のアコースティックギター「Wood Voice」'},source,{isAllowed:()=>true},now,pepper);
 assert.equal(r.item.productFacts,null);assert.equal(r.item.publicationDecision,'PUBLISH_REVIEW');assert.equal(r.item.decisionReason,'listing_product_evidence_missing');assert(!r.item.label.includes('Wood Voice'));
 const s=await setup();await s.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});await s.put(r.item);const report={sourceId:source.id,outcome:'collected',requests:0,candidates:1};observePreparation(report,entry,{item:r.item,created:true});await recordPreparationMetrics(s,report,now,[source],pepper);assert.equal(report.preparation.readyNew,0);assert(report.preparation.validationFailures.facts_incomplete);
});
test('collector observations track formal new READY, known URLs, exclusions and idempotency without teacher writes',async()=>{
 const s=await setup();await s.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});
 const {item}=await candidateFrom(entry,source,{isAllowed:()=>true},now,pepper);assert.equal(item.label,'Future Guitarsのエレアコ「FG100」を紹介');await s.put(item);
 const report={runId:'run-one',sourceId:source.id,outcome:'collected',requests:2,requestCounts:{robots:1,listing:1},candidates:2,reasons:{not_relevant:1}};
 observePreparation(report,entry,{item,created:true});observePreparation(report,{url:source.discoveryUrl+'unrelated/',date:entry.date},{reason:'not_relevant'});
 const tables=['candidate_items','news_decision_ledger','news_operator_feedback','news_shadow_evaluations','news_presentation_days'];const before=Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await s.db.prepare('SELECT * FROM '+t).all()).results])));
 await recordPreparationMetrics(s,report,now,[source],pepper);assert.equal(report.preparation.newUrls,2);assert.equal(report.preparation.readyNew,1);assert.equal(report.preparation.validationPassed,1);assert.equal(report.preparation.exclusionReasons.not_relevant,1);
 await recordPreparationMetrics(s,report,now,[source],pepper);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_preparation_runs').first()).n,1);
 for(const t of tables)assert.deepEqual((await s.db.prepare('SELECT * FROM '+t).all()).results,before[t]);
 const next={...report,runId:'run-two',qualityObservations:[]};observePreparation(next,entry,{item});await recordPreparationMetrics(s,next,now+86400000,[source],pepper);assert.equal(next.preparation.newUrls,0);assert.equal(next.preparation.knownUrls,1);assert.equal(next.preparation.candidateCreated,0);
 assert(!JSON.stringify((await s.db.prepare('SELECT * FROM news_discovery_receipts').all()).results).includes(entry.title));
});
test('an explicit primary listing identity outranks supplementary brands and accessory model codes',async()=>{
 const ikebe={...getSource('ikebe'),enabled:true,productionEnabled:true},base={url:'https://www.ikebe-gakki-pb.com/new_product/999999/',date:entry.date,listingSection:'product_news',listingCategory:'amps_effects',eventTitle:'BOSS EX-4 発表'};
 const r=await candidateFrom({...base,title:base.eventTitle+' 関連製品 Fender RS20MM ギター用ケース USB8'},ikebe,{isAllowed:()=>true},now,pepper);assert.equal(r.item.productFacts.brand,'BOSS');assert.equal(r.item.productFacts.product,'EX-4');
});
test('historical audit distinguishes sightings, stored candidates, unknown old rates and trusted humans',()=>{
 const human={candidate_id:'a',source_id:'kikutani',actor_type:'human_operator',success_state:'committed',policy_version:DECISION_POLICY_VERSION,created_at:now,decided_at:now,verdict:'approve',reason:'useful_product',decision_features_json:JSON.stringify({insightsProfile:{version:INSIGHTS_VERSION,factsVerified:true}})};
 const data={collection_runs:[{source_id:'kikutani',collected_at:now,requests:2,candidates:20,pending:1,duplicates:5,rejected:14,outcome:'collected'}],news_decision_ledger:[human,{...human,candidate_id:'system',actor_type:'system_repair'},{...human,candidate_id:'bad',success_state:'failed'}]};
 const r=preparationAudit(data,{now,days:14,sourceIds:['kikutani']}),s=r.sources[0];assert.equal(s.cardSightings,20);assert.equal(s.candidatesStored,1);assert.equal(s.newUrlDetection,null);assert.equal(s.legacyInitialReadyRate,null);assert.equal(s.humanApprove,1);assert.equal(r.daily.length,14);
});
test('measurement retention is bounded and never produces a publication decision',async()=>{
 const s=await setup(),old=now-91*86400000;
 await s.db.prepare('INSERT INTO news_preparation_runs VALUES(?,?,?,?,?,?,?)').bind('old',source.id,old,'2026-01-01','scheduled','collected','{}').run();
 await s.db.prepare('INSERT INTO news_discovery_receipts VALUES(?,?,?,?,?,?,?,?)').bind(source.id,url,old,old,null,'not_candidate','unknown',null).run();
 await s.purge(now);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_preparation_runs').first()).n,0);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_discovery_receipts').first()).n,0);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_decision_ledger').first()).n,0);
});
