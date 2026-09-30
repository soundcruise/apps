import test from 'node:test';
import assert from 'node:assert/strict';
import {getSource,legalGate,evidenceGate,SOURCES} from '../src/registry.js';
import {candidateFrom,validLabel,factualLabel,contentType,CATEGORIES} from '../src/metadata.js';
import {assessSale,saleDates,saleLabel,saleEndsAt,hasHype} from '../src/sale.js';
import {publishAutomatic} from '../src/automatic.js';
import {handleNewsRequest} from '../src/worker.js';
import {collectSource} from '../src/collector.js';
import {administer} from '../src/admin.js';
import {robotsPolicy,DAY} from '../src/policy.js';
import {store,pepper} from './helpers.js';

const now=Date.parse('2026-09-28T03:00:00Z');
const evidence={termsUrl:'https://example.invalid/terms',linkPolicyUrl:'https://example.invalid/links',policySummary:'Synthetic offline test evidence only',
 reviewedBy:'operator',reviewedAt:'2026-09-28',robotsReviewedAt:'2026-09-28',discoveryReviewedAt:'2026-09-28',policyDecision:'approved'};
// Synthetic sale-approved sources. The real registry entries stay disabled and pending.
const retailer=Object.freeze({...getSource('ikebe'),...evidence,discoveryUrl:'https://www.ikebe-gakki-pb.com/feed/',discoveryType:'rss',
 allowedPaths:['/news/'],deniedPaths:['/private/'],articlePathPattern:null,allowedEventTypes:undefined,
 enabled:true,productionEnabled:true,saleCollection:'approved'});
const maker=Object.freeze({...getSource('roland'),...evidence,discoveryUrl:'https://www.roland.com/feed/',discoveryType:'rss',
 contentTypes:['product','sale'],saleCollection:'approved',enabled:true,productionEnabled:true});
const media={...getSource('sleepfreaks'),...evidence,enabled:true};
const robots=s=>robotsPolicy('User-agent: *\nAllow: /',s);
const entry=(s,title,path='news/1/')=>({title,url:s.baseUrl+(s.id==='sleepfreaks'?'dtm-materials/'+path:path),date:'2026-09-27'});
const judge=(s,title,extra={})=>candidateFrom({...entry(s,title),...extra},s,robots(s),now,pepper);

test('sale is a formal category and a sale signal no longer means REJECT', async()=>{
 assert.ok(CATEGORIES.includes('sale'));
 for(const title of ['決算セール','BLACK FRIDAY SALE','期間限定でエフェクターを値下げ','ポイント10倍','送料無料','BOSS DS-1 10%オフ'])assert.equal(contentType(title),'sale',title);
 assert.equal(contentType('Universal Audio LUNA price change'),'price_change','permanent price changes are not sales');
 assert.ok((await judge(retailer,'決算セール開催 ギター・エフェクター・DTM製品が対象 10月31日まで')).item);
});

test('AUTO_PUBLISHABLE: broad, dated, equipment-specific sales from a clear, sale-approved seller', async()=>{
 const cases=[
  [retailer,'決算セール開催中！ギター・エフェクター・DTM製品が対象 10月31日まで','池部楽器、決算セールを10月31日まで開催。ギター・エフェクター・DTM製品などが対象'],
  [retailer,'BLACK FRIDAY SALE 複数ブランドのギター・アンプが対象 11/20〜11/30','池部楽器、ブラックフライデーセールを11月30日まで開催。ギター・アンプなどが対象'],
  [maker,'期間限定 BOSSエフェクター製品を値下げ 10月15日まで','Roland / BOSS、対象製品の期間限定値下げを10月15日まで実施。エフェクターなどが対象']
 ];
 for(const [s,title,label] of cases){
  const {item}=await judge(s,title);
  assert.equal(item.publicationDecision,'AUTO_PUBLISHABLE',title);
  assert.equal(item.category,'sale');assert.equal(item.eventType,'sale');assert.equal(item.label,label);
  assert.equal(item.productFacts.kind,'sale');assert.equal(factualLabel(item.productFacts,'sale'),label,'the stored facts reproduce the label');
  assert.ok(item.productFacts.endDate);
 }
});

test('PUBLISH_REVIEW: uncertain sales stay for human review (recall-first)', async()=>{
 const brand=(await judge(retailer,'Fender セール開催 10月20日まで')).item;
 assert.equal(brand.publicationDecision,'PUBLISH_REVIEW');assert.equal(brand.decisionReason,'sale_scope_uncertain');
 assert.equal(brand.label,'池部楽器、Fender製品のセールを10月20日まで開催');
 const shop=(await judge(retailer,'渋谷店限定 在庫一掃クリアランスセール ギター多数 10月10日まで')).item;
 assert.equal(shop.publicationDecision,'PUBLISH_REVIEW');assert.equal(shop.productFacts.scope,'shop');
 const noEnd=(await judge(retailer,'決算セール開催 ギター・アンプ')).item;
 assert.equal(noEnd.publicationDecision,'PUBLISH_REVIEW');assert.equal(noEnd.decisionReason,'sale_end_date_unknown');
 const noGear=(await judge(retailer,'決算セール 10月31日まで')).item;
 assert.equal(noGear.decisionReason,'sale_equipment_unclear');
 const campaign=(await judge(retailer,'多数のギターが対象のキャンペーン 10月31日まで')).item;
 assert.equal(campaign.publicationDecision,'PUBLISH_REVIEW');assert.equal(campaign.decisionReason,'sale_campaign_boundary');
 const mediaSale=(await judge(media,'Plugin Alliance ブラックフライデーセール プラグイン多数 11月30日まで')).item;
 assert.equal(mediaSale.publicationDecision,'PUBLISH_REVIEW');assert.equal(mediaSale.productFacts.seller,null);
 assert.match(mediaSale.label,/^審査待ち/);
 const pending=(await judge({...retailer,saleCollection:'pending_evidence'},'決算セール ギター・エフェクター 10月31日まで')).item;
 assert.equal(pending.publicationDecision,'PUBLISH_REVIEW','a broad sale from an unreviewed sale source never auto-publishes');
 assert.equal(pending.decisionReason,'sale_source_scope_unreviewed');
});

test('REJECT: single items, coupons, points and minor promotions; ended sales', async()=>{
 const cases=[
  ['BOSS DS-1 10%オフ','single_product_markdown'],
  ['中古 Gibson Les Paul 値下げしました','single_item_markdown'],
  ['ギター弦クーポン配布中','coupon_only'],
  ['ポイント10倍 キャンペーン','points_only'],
  ['週末限定セール 渋谷店','minor_promotion'],
  ['全品送料無料','shipping_only'],
  ['ノベルティプレゼントキャンペーン','novelty_or_lottery'],
  ['ギター下取りキャンペーン','trade_in'],
  ['渋谷店限定 小規模アンプ特価','minor_promotion'],
  ['決算セール ギター・アンプ 9月20日まで','sale_ended']
 ];
 for(const [title,reason] of cases){
  const result=await judge(retailer,title);
  assert.equal(result.item,undefined,title);assert.equal(result.reason,reason,title);
 }
 assert.equal((await judge({...getSource('natalie'),...evidence,allowedPaths:['/news/'],deniedPaths:[],enabled:true},'ギターセール 10月31日まで')).reason,'source_scope');
});

test('labels use facts only: no publisher copy or hype wording', async()=>{
 const title='衝撃価格！史上最大級の超スーパー決算SALE！見逃し厳禁 ギター・DTM 10月31日まで';
 const {item}=await judge(retailer,title);
 assert.equal(item.label,'池部楽器、決算セールを10月31日まで開催。ギター・DTM製品などが対象');
 for(const word of ['衝撃','史上最大','超','見逃し','SALE','!','！'])assert.ok(!item.label.includes(word),word);
 assert.ok(!JSON.stringify(item).includes('衝撃価格'),'the original headline is not stored');
 for(const bad of ['池部楽器、激安セールを開催','爆安！ギター祭り','今だけ超お得なセール'])assert.equal(validLabel(bad),false,bad);
 assert.equal(hasHype(item.label),false);
 // Tampered facts cannot smuggle wording into the label.
 assert.equal(saleLabel({...item.productFacts,event:'史上最大の決算セール'}),null);
 assert.equal(saleLabel({...item.productFacts,seller:'激安の池部楽器'}),null);
 assert.equal(saleLabel({...item.productFacts,equipment:['衝撃価格']}),null);
});

test('sale dates: ranges, until-dates, year rollover and JST end of day', ()=>{
 assert.deepEqual(saleDates('10月1日〜10月31日',now),{startDate:'2026-10-01',endDate:'2026-10-31'});
 assert.deepEqual(saleDates('10/1(木)～10/15(木)',now),{startDate:'2026-10-01',endDate:'2026-10-15'});
 assert.deepEqual(saleDates('10月1日～15日',now),{startDate:'2026-10-01',endDate:'2026-10-15'});
 assert.deepEqual(saleDates('1月5日まで',Date.parse('2026-12-28T00:00:00Z')),{startDate:null,endDate:'2027-01-05'});
 assert.deepEqual(saleDates('12/26〜1/4',Date.parse('2026-12-20T00:00:00Z')),{startDate:'2026-12-26',endDate:'2027-01-04'});
 assert.deepEqual(saleDates('決算セール',now),{startDate:null,endDate:null});
 assert.equal(saleEndsAt('2026-10-31'),Date.parse('2026-11-01T00:00:00+09:00')-1);
});

test('sale is stored, auto-published, served by list and ticker, and never after it ends', async()=>{
 const s=await store();await administer(s,{action:'publish-on',reason:'review_complete'},now);
 const live=(await judge(retailer,'決算セール ギター・エフェクター 10月31日まで',{url:retailer.baseUrl+'news/live/'})).item;
 const ending=(await judge(retailer,'サマーセール ギター・アンプ 9月30日まで',{url:retailer.baseUrl+'news/ending/'})).item;
 assert.ok(await s.put(live));assert.ok(await s.put(ending));
 const stored=(await s.candidates()).find(r=>r.id===live.id);
 assert.equal(stored.category,'sale');assert.equal(stored.event_type,'sale');assert.equal(JSON.parse(stored.product_facts).endDate,'2026-10-31');
 const publishAt=Date.parse('2026-10-01T03:00:00Z');// after the summer sale ended
 await s.recordHealth({sourceId:retailer.id,status:'healthy',reasonCode:'ok',checkedAt:publishAt,successfulAt:publishAt});
 assert.equal(await publishAutomatic(s,retailer,[retailer],publishAt,pepper),1,'only the running sale is published');
 const rows=await s.candidates();
 assert.equal(rows.find(r=>r.id===ending.id).review_status,'pending');
 const env={NEWS_DB:s.db,NEWS_API_MODE:'local',NEWS_LOCAL_ORIGINS:'["http://localhost:8765"]'};
 for(const path of ['/v1/news','/v1/news/ticker']){
  const data=await (await handleNewsRequest(new Request('http://localhost:8787'+path),env,publishAt,{registry:[retailer]})).json();
  assert.deepEqual(data.items.map(i=>[i.category,i.label]),[['sale','池部楽器、決算セールを10月31日まで開催。ギター・エフェクターなどが対象']],path);
 }
});

test('Sound House and Ikebe are represented but disabled; registry presence never fetches', async()=>{
 const soundhouse=getSource('soundhouse'),ikebe=getSource('ikebe');
 assert.equal(SOURCES.filter(s=>s.id==='ikebe').length,1,'Ikebe is not duplicated');
 for(const s of [soundhouse,ikebe]){
  assert.equal(s.enabled,false);assert.equal(s.productionEnabled,false);assert.equal(s.localPilotEnabled,false);
  assert.deepEqual([...s.contentTypes],['product','sale']);assert.equal(s.saleCollection,'pending_evidence');
  assert.notEqual(evidenceGate(s,now),null);
  for(const mode of ['local','production'])assert.notEqual(legalGate(s,{},now,mode),null);
 }
 assert.equal(soundhouse.legalStatus,'UNKNOWN');assert.equal(evidenceGate(soundhouse,now),'legal_block');
 assert.equal(evidenceGate(ikebe,now),'policy_expired');
 assert.equal(evidenceGate(ikebe,Date.parse('2026-09-30T12:00:00Z')),null);
 assert.equal(ikebe.saleCollection,'pending_evidence');
 assert.ok(SOURCES.filter(s=>!['ikebe','soundhouse'].includes(s.id)).every(s=>s.saleCollection==='none'));
 const s=await store();let calls=0;
 for(const id of ['soundhouse','ikebe'])for(const mode of ['local','production']){
  await collectSource(id,s,{mode,now,pepper,fetcher:async()=>{calls++;throw Error('must not fetch');},sleep:async()=>{}});
 }
 assert.equal(calls,0);
});

test('assessSale exposes the sale model fields for review tooling', ()=>{
 const result=assessSale({title:'決算セール ギター・DTM 10月1日〜10月31日',date:'2026-09-27'},retailer,now,{hasDate:true,known:false});
 assert.deepEqual(Object.keys(result.facts).sort(),['brand','category','endDate','equipment','event','kind','nature','scope','seller','sellerKind','startDate']);
 assert.equal(result.facts.seller,'池部楽器');assert.equal(result.facts.sellerKind,'retailer_editorial');
 assert.equal(result.facts.startDate,'2026-10-01');assert.equal(result.facts.nature,'sale');
 assert.ok(saleEndsAt(result.facts.endDate)-now<40*DAY);
});

// Safety closure: evidence is current authorization, never a permanent property of a candidate.
for(const [name,change,health] of [
 ['pending_evidence',{saleCollection:'pending_evidence'}],
 ['sale type removed',{contentTypes:['product']}],
 ['missing sale state',{saleCollection:undefined}],
 ['unknown sale state',{saleCollection:'enabled'}],
 ['malformed sale state',{saleCollection:{approved:true}}],
 ['malformed content types',{contentTypes:'sale'}],
 ['disabled',{enabled:false}],
 ['production disabled',{productionEnabled:false}],
 ['missing evidence',{termsUrl:null}],
 ['expired evidence',{reviewedAt:'2020-01-01'}],
 ['legal block',{legalStatus:'UNKNOWN'}],
 ['health blocked',{},'http_blocked'],
])test(`publish-time SALE gate: ${name} cannot approve an existing AUTO candidate`,async()=>{
 const s=await store();await administer(s,{action:'publish-on',reason:'review_complete'},now);
 const {item}=await judge(retailer,'決算セール ギター・エフェクター 10月31日まで');
 assert.equal(item.publicationDecision,'AUTO_PUBLISHABLE');await s.put(item);
 await s.recordHealth({sourceId:retailer.id,status:health||'healthy',reasonCode:health?'http_403':'ok',checkedAt:now,successfulAt:now});
 const current={...retailer,...change};
 // Intentionally pass the older approved object too: registry is the current authority.
 assert.equal(await publishAutomatic(s,retailer,[current],now,pepper),0);
 assert.equal((await s.candidates())[0].review_status,'pending');
});

test('SALE markers cannot evade the current authorization check through category/event mismatch',async()=>{
 for(const patch of [{category:'amps_effects'},{eventType:'new_product'},{category:'amps_effects',eventType:'new_product'}]){
  const s=await store();await administer(s,{action:'publish-on',reason:'review_complete'},now);
  const {item}=await judge(retailer,'決算セール ギター・エフェクター 10月31日まで');
  await s.put({...item,...patch});
  await s.recordHealth({sourceId:retailer.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});
  const current={...retailer,saleCollection:'pending_evidence'};
  assert.equal(await publishAutomatic(s,current,[current],now,pepper),0);
 }
});

for(const [title,decision,reason] of [
 ['ブラックフライデー ギター全品ポイント10倍 10月31日まで','REJECT','points_only'],
 ['ブラックフライデー ギター全品クーポン配布 10月31日まで','REJECT','coupon_only'],
 ['BLACK FRIDAY ギター全品20%OFFクーポン 10月31日まで','REJECT','coupon_only'],
 ['決算セール BOSS DS-1 特価 10月31日まで','REJECT','single_product_markdown'],
 ['決算セール ギター用エフェクター1点限定 10月31日まで','REJECT','single_item_markdown'],
 ['決算セール 全品送料無料 ギター・アンプ 10月31日まで','REJECT','shipping_only'],
 ['周年セール ギター全品ノベルティプレゼント 10月31日まで','REJECT','novelty_or_lottery'],
 ['周年セール ギター全品抽選 10月31日まで','REJECT','novelty_or_lottery'],
 ['全品ギター買取キャンペーン 10月31日まで','REJECT','trade_in'],
 ['渋谷店限定 ギターセール 10月31日まで','PUBLISH_REVIEW','sale_scope_uncertain'],
 ['ギター用エフェクター 決算セール 10月31日まで','PUBLISH_REVIEW','sale_scope_uncertain'],
 ['ギター用アンプ BLACK FRIDAY SALE 10月31日まで','PUBLISH_REVIEW','sale_scope_uncertain'],
 ['ブラックフライデー ギター・アンプ 10月31日まで','PUBLISH_REVIEW','sale_campaign_boundary'],
 ['ギター全品値下げ 送料無料 10月31日まで','PUBLISH_REVIEW','sale_campaign_boundary'],
])test(`classification regression: ${title}`,async()=>{
 const result=await judge(retailer,title);
 assert.equal(result.item?.publicationDecision||result.decision,decision);
 assert.equal(result.reason||result.item.decisionReason,reason);
 if(decision==='REJECT')assert.equal(result.item,undefined,'rejection never enters the public label path');
});

test('independent categories broaden scope; a guitar pedal alone does not; real major sales survive',async()=>{
 const single=(await judge(retailer,'ギター用エフェクター セール 10月31日まで')).item;
 assert.deepEqual(single.productFacts.equipment,['エフェクター']);assert.equal(single.productFacts.scope,'unknown');
 for(const title of ['決算セール ギター、アンプ、エフェクター、DTM 10月31日まで',
  'BLACK FRIDAY SALE Fender・Gibson ギター 10月31日まで',
  'ギター全品値下げ。送料無料 10月31日まで']){
  assert.equal((await judge(retailer,title)).item.publicationDecision,'AUTO_PUBLISHABLE',title);
 }
 assert.equal((await judge(retailer,'未知ブランド エフェクターセール 10月31日まで')).item.publicationDecision,'PUBLISH_REVIEW');
 assert.equal((await judge(retailer,'渋谷店限定 大型ギターセール 10月31日まで')).item.publicationDecision,'PUBLISH_REVIEW');
});

test('explicit JST times override date-only; invalid deadlines never auto-publish',async()=>{
 for(const tail of ['10月31日 20:00まで','10/31 20時まで','10/31 20時00分まで','10/1〜10/31 20:00まで']){
  const dates=saleDates(tail,now);assert.equal(dates.endTime,'20:00');
  assert.equal(saleEndsAt(dates.endDate,dates.endTime),Date.parse('2026-10-31T20:00:00+09:00'));
  const {item}=await judge(retailer,'決算セール ギター・アンプ '+tail);
  assert.equal(item.publicationDecision,'AUTO_PUBLISHABLE');assert.match(item.label,/10月31日 20:00まで/);
 }
 for(const tail of ['10月31日 29:00まで','2月30日まで'])assert.notEqual((await judge(retailer,'決算セール ギター・アンプ '+tail)).item?.publicationDecision,'AUTO_PUBLISHABLE');
 assert.equal(saleDates('2026年10月1日〜2026年9月30日',now).endDate,'2026-09-30','an explicit year is never silently extended');
 assert.equal((await judge(retailer,'決算セール ギター・アンプ 2026年10月1日〜2026年9月30日')).item.publicationDecision,'PUBLISH_REVIEW','contradictory range needs review');
 assert.equal(saleEndsAt(null),null);
 assert.ok(Number.isNaN(saleEndsAt('2026-02-30')));
});

const apiEnv=s=>({NEWS_DB:s.db,NEWS_API_MODE:'local',NEWS_LOCAL_ORIGINS:'["http://localhost:8765"]'});
const api=(s,at,path='/v1/news',cache)=>handleNewsRequest(new Request('http://localhost:8787'+path),apiEnv(s),at,{registry:[retailer],cache});
async function approvedSale(s,id,tail,publishedAt='2026-09-27T00:00:00.000Z'){
 const {item}=await judge(retailer,'決算セール ギター・アンプ '+tail,{url:retailer.baseUrl+'news/'+id+'/'});
 await s.put({...item,publishedAt});
 // Seed a human-reviewed synthetic row; no production mutation or publisher request.
 await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(item.id).run();
 return item.id;
}
for(const [tail,deadline] of [
 ['9月30日まで',Date.parse('2026-10-01T00:00:00+09:00')-1],
 ['9月30日 20:00まで',Date.parse('2026-09-30T20:00:00+09:00')],
])test(`SALE visibility before / exact / after deadline: ${tail}`,async()=>{
 const s=await store();await approvedSale(s,'boundary',tail);
 for(const delta of [-1,0,1])for(const path of ['/v1/news','/v1/news/ticker']){
  const data=await (await api(s,deadline+delta,path)).json();
  assert.equal(data.items.length,delta<=0?1:0,`${path} ${delta}`);
  if(delta<=0)assert.equal(data.items[0].saleEndsAt,deadline);
 }
 assert.equal((await s.candidates()).length,1,'display expiry never deletes D1 data');
});

test('unknown end date uses normal 90-day display and physical retention stays independent',async()=>{
 const s=await store();await approvedSale(s,'unknown','');
 const data=await (await api(s,now)).json();assert.equal(data.items.length,1);assert.equal(data.items[0].saleEndsAt,null);
 assert.equal((await (await api(s,now+91*DAY)).json()).items.length,0);
 assert.equal((await s.candidates()).length,1);
 await s.purge(now+91*DAY);assert.equal((await s.candidates()).length,0);
});

test('expired recent sale does not suppress the 14-day ticker fallback',async()=>{
 const s=await store();const deadline=saleEndsAt('2026-09-30');
 await approvedSale(s,'recent','9月30日まで');
 const older=await approvedSale(s,'older','10月31日まで','2026-09-20T00:00:00.000Z');
 const data=await (await api(s,deadline+1,'/v1/news/ticker')).json();
 assert.deepEqual(data.items.map(i=>i.id),[older]);
});

test('deadline invalidates an already cached page even inside the same five-minute bucket',async()=>{
 const s=await store();const deadline=saleEndsAt('2026-09-30','20:02');await approvedSale(s,'cached','9月30日 20:02まで');
 const values=new Map();let reads=0;
 const cache={match:async key=>{reads++;return values.get(key.url)?.clone();},put:async(key,value)=>values.set(key.url,value.clone())};
 assert.equal((await (await api(s,deadline-2000,'/v1/news',cache)).json()).items.length,1);
 assert.equal((await (await api(s,deadline,'/v1/news',cache)).json()).items.length,1);
 assert.equal((await (await api(s,deadline+1,'/v1/news',cache)).json()).items.length,0);
 assert.ok(reads>=3);assert.equal((await s.candidates()).length,1);
});

test('SQL filters expiry before LIMIT/OFFSET; keyset continuation survives expiry between pages',async()=>{
 const s=await store();const deadline=saleEndsAt('2026-09-30','20:02');
 await approvedSale(s,'expired','9月30日 20:00まで','2026-09-27T23:00:00.000Z');
 const first=await approvedSale(s,'first','9月30日 20:02まで','2026-09-27T22:00:00.000Z');
 const second=await approvedSale(s,'second','10月31日まで','2026-09-27T21:00:00.000Z');
 const third=await approvedSale(s,'third','10月31日まで','2026-09-27T20:00:00.000Z');
 const p1=await (await api(s,deadline,'/v1/news?limit=2')).json();assert.deepEqual(p1.items.map(i=>i.id),[first,second]);assert.equal(p1.nextOffset,2);
 const p2=await (await api(s,deadline+1,'/v1/news?limit=2&cursor='+encodeURIComponent(p1.nextCursor))).json();
 assert.deepEqual(p2.items.map(i=>i.id),[third]);assert.equal(p2.nextCursor,null);
 const offset=await (await api(s,deadline+1,'/v1/news?limit=1&offset=1')).json();assert.equal(offset.items[0].id,third);
 assert.equal((await api(s,deadline,'/v1/news?cursor=bad')).status,400);
});

test('publication checks deadline and current authorization/evidence together, including exact time',async()=>{
 const deadline=saleEndsAt('2026-09-30','20:00');
 for(const delta of [-1,0,1])for(const blocked of ['none','sale','policy','both']){
  const s=await store();await administer(s,{action:'publish-on',reason:'review_complete'},now);
  const {item}=await judge(retailer,'決算セール ギター・アンプ 9月30日 20:00まで');await s.put(item);
  await s.recordHealth({sourceId:retailer.id,status:'healthy',reasonCode:'ok',checkedAt:deadline+delta,successfulAt:deadline+delta});
  const current={...retailer,...(['sale','both'].includes(blocked)?{saleCollection:'pending_evidence'}:{}),...(['policy','both'].includes(blocked)?{reviewedAt:'2020-01-01'}:{})};
  assert.equal(await publishAutomatic(s,current,[current],deadline+delta,pepper),delta<=0&&blocked==='none'?1:0,`${delta} ${blocked}`);
 }
});

test('an official source and broad marketing adjective never turn one model into a range',async()=>{
 for(const title of ['決算大型セール BOSS DS-1 特価 10月31日まで','期間限定 BOSS DS-1 製品を値下げ 10月31日まで']){
  assert.equal((await judge(maker,title)).decision,'REJECT',title);
 }
 assert.equal((await judge(retailer,'Line 6 セール ギター用アンプ 10月31日まで')).item.publicationDecision,'PUBLISH_REVIEW','brand digits are not a product model');
});

test('sale migration backfills existing JST dates without changing retention, status or unknown dates',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {readFileSync,readdirSync}=await import('node:fs');
 const db=new DatabaseSync(':memory:');const dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).sort().filter(n=>n<'0007'))db.exec(readFileSync(new URL(name,dir),'utf8'));
 const insert=db.prepare(`INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,category,label,topic_key,collected_at,review_status,review_reason,expires_at,event_type,product_facts)
 VALUES(?,?,?,?,?,'sale','テスト用セール',?,?,'approved','test',?,'sale',?)`);
 const retention=now+90*DAY;
 for(const [id,end] of [['dated','2026-09-30'],['unknown',null],['invalid','2026-02-30']])insert.run(id,retailer.id,retailer.name,retailer.baseUrl+id,retailer.baseUrl+id,id,new Date(now).toISOString(),retention,JSON.stringify({kind:'sale',endDate:end}));
 db.exec(readFileSync(new URL('0007_sale_visibility.sql',dir),'utf8'));
 const rows=db.prepare('SELECT * FROM candidate_items ORDER BY id').all();
 assert.equal(rows.find(r=>r.id==='dated').sale_ends_at,saleEndsAt('2026-09-30'));
 assert.equal(rows.find(r=>r.id==='unknown').sale_ends_at,null);assert.equal(rows.find(r=>r.id==='invalid').sale_ends_at,null);
 assert.ok(rows.every(r=>r.expires_at===retention&&r.review_status==='approved'));db.close();
});

test('compound equipment words alone are not a multi-category sale',async()=>{
 for(const title of ['アンプシミュレータープラグイン セール 10月31日まで','ギター録音ソフトウェア セール 10月31日まで']){
  assert.equal((await judge(retailer,title)).item.publicationDecision,'PUBLISH_REVIEW',title);
 }
 assert.equal((await judge(retailer,'決算セール ギター＋アンプ＋エフェクター＋DTM 10月31日まで')).item.publicationDecision,'AUTO_PUBLISHABLE');
});
