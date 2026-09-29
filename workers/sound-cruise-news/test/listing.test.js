import test from 'node:test';
import assert from 'node:assert/strict';
import {parseShimamuraListing,listingArticleUrl,listingDate,LISTING_MAX_BYTES,SHIMAMURA_LISTING_URL as URL} from '../src/shimamura-listing.js';
import {getSource,phaseOneReady,evidenceGate} from '../src/registry.js';
import {collectSource} from '../src/collector.js';
import {candidateFrom} from '../src/metadata.js';
import {robotsPolicy,hash} from '../src/policy.js';
import {store,pepper,response} from './helpers.js';
const now=Date.parse('2026-09-29T12:00:00Z');
const ROBOTS='User-agent: *\nDisallow: /p/test.xml\nDisallow: /originalbrand/ryoga/member.html';
const source={...getSource('shimamura'),policyDecision:'approved',reviewedAt:'2026-09-29',robotsReviewedAt:'2026-09-29',discoveryReviewedAt:'2026-09-29',robotsValid:true,discoveryValid:true,sourceRulesReviewed:true,localPilotEnabled:true,robotsHash:await hash(ROBOTS)};
const registry=[source];
// Authored synthetic HTML only; never copy publisher HTML/headlines into tests or snapshots.
const card=(id,title='BOSS EX-4 新製品を発表しました',date='2026/09/28',path='amp-effector',extra='')=>{
 const numericId=/^\d+$/.test(id)?id:String([...id].reduce((n,ch)=>n*37+ch.codePointAt(0),0));
 return `<li><a href="https://www.shimamura.co.jp/update/${path}/2026/09/${numericId}/"><img src="https://example.invalid/never-load.png"><div><span class="btn-cat-red">${path==='amp-effector'?'アンプ／エフェクター':path==='guitar-bass'?'ギター／ベース':'DTM／レコーディング'}</span><h3>${title}</h3><div><span><date>${date}</date></span></div>${extra}</div></a></li>`;
};
const listing=(cards=[card('a'),card('b'),card('c')],extra='')=>`<!doctype html><html><head>${extra}</head><body><section><div><h2>「製品ニュース」の記事一覧</h2></div><div><h3>合成の一覧説明</h3><ul>${cards.join('')}</ul></div></section><footer>${card('unrelated','使い方')}</footer></body></html>`;
const options=(extra={})=>({mode:'local',now,registry,pepper,sleep:async()=>{},fetcher:async url=>url.endsWith('/robots.txt')?response(ROBOTS):response(listing(),200,{'content-type':'text/html',etag:'synthetic-v1'}),...extra});
test('listing: fixed product-news section, title/date/category; scripts and images never execute',()=>{
 const parsed=parseShimamuraListing(listing(undefined,'<script>globalThis.listingExecuted=true</script>'));
 assert.equal(parsed.cards,3);assert.equal(parsed.entries.length,3);assert.equal(parsed.entries[0].listingCategory,'amp-effector');assert.equal(parsed.entries[0].date,'2026-09-28T00:00:00+09:00');assert.equal(globalThis.listingExecuted,undefined);
 assert.ok(!JSON.stringify(parsed).includes('<html>'));assert.ok(!JSON.stringify(parsed).includes('unrelated'));
});
test('listing: separated heading and 12 wrapped article links ignore navigation, pagination and footer',()=>{
 const cards=Array.from({length:12},(_,i)=>card(String(85000+i),'BOSS EX-4 新製品を発表しました','2026/09/28',i%3===0?'guitar-bass':i%3===1?'amp-effector':'dtm-recording'));
 const html=`<html><body><header>${card('header')}</header><nav>${card('nav')}</nav><main><section><h1>製品ニュース 記事一覧</h1><h3>一覧の説明</h3></section><div class="layout"><div><ul>${cards.join('')}</ul></div></div><a href="/update/common/new-item/page/2/">次へ</a><a href="https://outside.invalid/update/amp-effector/2026/09/99999/">外部</a></main><footer>${card('footer')}</footer></body></html>`;
 const parsed=parseShimamuraListing(html);
 assert.equal(parsed.cards,12);assert.equal(parsed.entries.length,12);
 assert.equal(parsed.entries.filter(e=>e.listingCategory==='dtm-recording').length,4);
 assert.ok(parsed.entries.every(e=>e.date==='2026-09-28T00:00:00+09:00'));
});
test('listing: one missing date, one malformed card and one category mismatch stay bounded',()=>{
 const html=listing([card('a').replace('<date>2026/09/28</date>',''),card('b').replace('<h3>BOSS EX-4 新製品を発表しました</h3>','<h3></h3>'),card('c').replace('アンプ／エフェクター','DTM'),card('d')]);
 const parsed=parseShimamuraListing(html);
 assert.equal(parsed.cards,4);assert.equal(parsed.entries.length,3);assert.equal(parsed.reasons.malformed_card,1);
 assert.equal(parsed.entries[0].listingUncertainty,'missing_date');
 assert.equal(parsed.entries[1].listingUncertainty,'category_mismatch');
});
test('listing: zero or excessive article links fail closed',()=>{
 assert.throws(()=>parseShimamuraListing(listing([])),/listing_structure_changed/);
 assert.throws(()=>parseShimamuraListing(listing(Array.from({length:101},(_,i)=>card(String(90000+i))))),/listing_structure_changed/);
});
test('listing: tutorial/sale/campaign/shop/evergreen/artist exclusions',()=>{
 for(const term of ['tutorial','sale','campaign','coupon','中古','店舗案内','セミナー','fair','入荷','比較','完全ガイド','ギターライブ']){
  const parsed=parseShimamuraListing(listing([card('a',term),card('b'),card('c')]));assert.equal(parsed.entries.length,2);assert.equal(Object.values(parsed.reasons).reduce((a,b)=>a+b,0),1);
 }
});
test('listing: a product announcement mentioning a campaign remains reviewable',async()=>{
 const entry=parseShimamuraListing(listing([card('a','BOSS EX-4を発売、記念キャンペーンも実施'),card('b'),card('c')])).entries[0];
 const result=await candidateFrom(entry,source,robotsPolicy(ROBOTS,source),now,pepper);
 assert.equal(result.item.publicationDecision,'PUBLISH_REVIEW');
 assert.equal(result.item.manualReviewStatus,'pending');
});
test('listing: absent identity, all dates or all titles fail closed; one malformed card is reviewable',()=>{
 for(const html of [listing().replace('製品ニュース','特集'),listing().replaceAll('<date>2026/09/28</date>',''),listing().replaceAll('2026/09/28','2026/02/30'),listing().replaceAll('2026/09/28','yesterday'),'<html>temporarily unavailable</html>',listing().replaceAll('<h3>BOSS EX-4 新製品を発表しました</h3>','<h3></h3>')])assert.throws(()=>parseShimamuraListing(html),/listing_structure_changed/);
 assert.equal(parseShimamuraListing(listing([card('one')])).entries.length,1);
 assert.equal(parseShimamuraListing(listing().replace('<date>2026/09/28</date>','')).entries[0].listingUncertainty,'missing_date');
 for(const value of ['2026/02/30','2026/13/01','2026/09/31','2026-09-29','2026/9/2'])assert.equal(listingDate(value),null);
});
test('listing: unknown source, credentials, external host, query, normal product page and arbitrary listing rejected',()=>{
 for(const url of ['https://evil.test/update/amp-effector/2026/09/a/','https://user:password@www.shimamura.co.jp/update/amp-effector/2026/09/a/','http://www.shimamura.co.jp/update/amp-effector/2026/09/a/','https://www.shimamura.co.jp/shops/a/','https://www.shimamura.co.jp/update/amp-effector/2026/09/a/?affiliate=1','https://www.shimamura.co.jp/update/amp-effector/'])assert.equal(listingArticleUrl(url),null);
 for(const url of ['https://evil.test/','https://www.shimamura.co.jp/update/feed/',URL+'page/2/'])assert.throws(()=>parseShimamuraListing(listing(),url),/listing_url_blocked/);
 const parsed=parseShimamuraListing(listing([card('a').replace('https://www.shimamura.co.jp','https://evil.test'),card('b'),card('c')]));assert.equal(parsed.entries.length,2);assert.equal(parsed.cards,2);
});
test('listing: duplicate URLs, ordering and date-only overlap watermark',()=>{
 assert.equal(parseShimamuraListing(listing([card('a'),card('a'),card('a')])).entries.length,1);
 assert.equal(parseShimamuraListing(listing([card('a','ギター','2026/09/27'),card('b'),card('c')])).entries.length,3);
 const p=parseShimamuraListing(listing([card('a'),card('b','ギター','2026/09/27'),card('c','ギター','2026/09/25')]),URL,{since:Date.parse('2026-09-28T06:00:00Z')});assert.equal(p.entries.length,2);
});
test('listing: old/future metadata rejected by candidate pipeline',async()=>{
 for(const date of ['2026/09/30','2026/05/01']){
  const e=parseShimamuraListing(listing([card('a','BOSS EX-4 発売',date),card('b','BOSS EX-4 発売',date),card('c','BOSS EX-4 発売',date)])).entries[0];
  assert.equal((await candidateFrom(e,source,robotsPolicy(ROBOTS,source),now,pepper)).reason,'date_outside_window');
 }
});
test('listing: recall retains unknown brand, ambiguous event and missing date for review',async()=>{
 const rows=parseShimamuraListing(listing([
  card('a','新しいギター関連機材のお知らせ','2026/09/28','guitar-bass'),
  card('b','新しい音楽制作ツールのお知らせ','2026/09/28','dtm-recording'),
  card('c','BOSS GX-1の紹介','2026/09/28','amp-effector'),
  card('d','BOSS EX-4を発表','2026/09/28','amp-effector').replace('<date>2026/09/28</date>','')
 ])).entries;
 const results=await Promise.all(rows.map(row=>candidateFrom(row,source,robotsPolicy(ROBOTS,source),now,pepper)));
 assert.ok(results.every(r=>r.item?.manualReviewStatus==='pending'&&r.item.publicationDecision==='PUBLISH_REVIEW'));
 assert.equal(results[0].item.category,'electric_guitar_bass');
 assert.equal(results[1].item.category,'recording_audio');
 assert.equal(results[3].item.reviewReason,'missing_date');
 assert.ok(results.every(r=>!r.item.productFacts||r.item.productFacts.brand));
});
test('listing: factual similarity is advisory; creative wording never enters generated label',async()=>{
 const rows=parseShimamuraListing(listing([
  card('a','BOSS、EX-4を発表！'),
  card('b','BOSS EX-4 新製品を発表、夢を叶える驚異の音色'),
  card('c','BOSS EX-4 新しいギター用エフェクターを2026年に発表')
 ])).entries;
 const results=await Promise.all(rows.map(row=>candidateFrom(row,source,robotsPolicy(ROBOTS,source),now,pepper)));
 assert.ok(results.every(r=>r.item?.manualReviewStatus==='pending'));
 assert.equal(results[0].item.publicationDecision,'AUTO_PUBLISHABLE');
 assert.equal(results[0].item.decisionReason,'factual_label_similarity');
 assert.ok(results.every(r=>!r.item.label.includes('夢を叶える驚異の音色')));
 assert.ok(results.some(r=>r.item.publicationDecision==='AUTO_PUBLISHABLE'));
});
test('listing: opt-out meta (including bot-specific), hidden dates, oversized responses fail closed',async()=>{
 for(const name of ['robots','SoundCruiseNewsBot'])for(const content of ['noindex','none','noarchive','nosnippet'])assert.throws(()=>parseShimamuraListing(listing(undefined,`<meta name="${name}" content="${content}">`)),/listing_optout/);
 assert.throws(()=>parseShimamuraListing('x'.repeat(LISTING_MAX_BYTES+1)),/listing_too_large/);
 assert.equal(parseShimamuraListing(listing().replace('<date>','<date hidden>')).entries[0].listingUncertainty,'missing_date');
 const s=await store(),r=await collectSource('shimamura',s,options({fetcher:async url=>url.endsWith('/robots.txt')?response(ROBOTS):response('x'.repeat(LISTING_MAX_BYTES+1),200,{'content-type':'text/html'})}));assert.equal(r.outcome,'listing_too_large');assert.equal((await s.state('shimamura')).disabled,true);
});
test('listing: live-shaped collector stores pending only; memory title/HTML/secret absent from SQLite dump',async()=>{
 const s=await store(),calls=[];
 const r=await collectSource('shimamura',s,options({fetcher:async(url,opts)=>{calls.push({url,opts});return options().fetcher(url)}}));
 assert.equal(r.outcome,'collected');assert.equal(r.pending,3);assert.equal(calls.length,2);assert.deepEqual(r.requestCounts,{robots:1,listing:1,feed:0});
 assert.ok(calls.every(c=>c.url===URL||c.url===source.robotsUrl));assert.ok(calls.every(c=>c.opts.redirect==='manual'));
 const dump=JSON.stringify(await s.candidates());for(const forbidden of ['<html>','<h3>','新製品を発表しました',pepper,'title_hash'])assert.ok(!dump.includes(forbidden));
 assert.ok((await s.candidates()).every(r=>r.review_status==='pending'&&['AUTO_PUBLISHABLE','PUBLISH_REVIEW'].includes(r.publication_decision)&&r.decision_reason));assert.equal((await s.state('shimamura')).lastDiscoveryAt,now);
 const later=await collectSource('shimamura',s,options({now:now+12*3600000}));assert.equal(later.outcome,'backoff');assert.equal(later.requests,0);
});
test('listing: conditional GET and 304 do not parse or persist; no pagination requests',async()=>{
 const s=await store();await collectSource('shimamura',s,options());let calls=0;
 const r=await collectSource('shimamura',s,options({now:now+86400000,fetcher:async(url,opts)=>{calls++;if(url===source.robotsUrl)return response(ROBOTS);assert.equal(opts.headers['If-None-Match'],'synthetic-v1');return new Response(null,{status:304});}}));
 assert.equal(r.outcome,'not_modified');assert.equal(calls,2);assert.equal((await s.candidates()).length,3);
});
test('listing: timeout/backoff, changed robots, disallow, malformed, robots noindex regression',async()=>{
 const timeout=await collectSource('shimamura',await store(),options({fetcher:async()=>{throw new DOMException('synthetic timeout','TimeoutError')}}));assert.equal(timeout.outcome,'request_timeout');assert.equal(timeout.requests,1);
 for(const body of [ROBOTS+'\nDisallow: /update/','User-agent: * Disallow: /']){
  const s=await store(),r=await collectSource('shimamura',s,options({fetcher:async()=>response(body)}));assert.equal(r.requests,1);assert.equal((await s.state('shimamura')).disabled,true);
 }
 const r=await collectSource('shimamura',await store(),options({fetcher:async url=>url===source.robotsUrl?response(ROBOTS,200,{'x-robots-tag':'noindex'}):options().fetcher(url)}));assert.equal(r.outcome,'collected');
});
test('listing: complete policy distinct from explicit permission; all production controls stay OFF',()=>{
 const off={NEWS_COLLECTION_MODE:'off',NEWS_API_MODE:'off',crons:[]};assert.equal(phaseOneReady(source,now,off),true);
 assert.equal(source.automationPolicy,'documented_silence');assert.equal(source.explicitAutomationPermission,false);assert.equal(source.productionEnabled,false);assert.equal(source.enabled,false);
 for(const field of ['discoveryReviewedAt','linkPolicyUrl','reviewedBy'])assert.equal(evidenceGate({...source,[field]:null},now),'evidence_missing');
 assert.equal(evidenceGate({...source,reviewedAt:'2025-01-01'},now),'policy_expired');
 assert.equal(evidenceGate({...source,explicitAutomationPermission:true},now),'evidence_missing');assert.equal(phaseOneReady({...source,crawlIntervalHours:12},now,off),false);
});
test('listing: even a freshly reviewed Disallow stops before listing fetch',async()=>{
 const body='User-agent: *\nDisallow: /update/common/';
 const denied={...source,robotsHash:await hash(body)};
 const s=await store(),r=await collectSource('shimamura',s,options({registry:[denied],fetcher:async()=>response(body)}));
 assert.equal(r.outcome,'robots_disallow');assert.equal(r.requests,1);assert.equal((await s.state('shimamura')).disabled,true);
});
