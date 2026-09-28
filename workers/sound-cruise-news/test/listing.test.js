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
const card=(id,title='BOSS EX-4 新製品を発表しました',date='2026/09/28',path='amp-effector',extra='')=>`<li><a href="https://www.shimamura.co.jp/update/${path}/2026/09/${id}/"><img src="https://example.invalid/never-load.png"><div><span class="btn-cat-red">${path==='amp-effector'?'アンプ／エフェクター':path==='guitar-bass'?'ギター／ベース':'DTM／レコーディング'}</span><h3>${title}</h3><div><span><date>${date}</date></span></div>${extra}</div></a></li>`;
const listing=(cards=[card('a'),card('b'),card('c')],extra='')=>`<!doctype html><html><head>${extra}</head><body><section><div><h2>「製品ニュース」の記事一覧</h2></div><div><h3>合成の一覧説明</h3><ul>${cards.join('')}</ul></div></section><section><h2>特集</h2>${card('unrelated','使い方')}</section></body></html>`;
const options=(extra={})=>({mode:'local',now,registry,pepper,sleep:async()=>{},fetcher:async url=>url.endsWith('/robots.txt')?response(ROBOTS):response(listing(),200,{'content-type':'text/html',etag:'synthetic-v1'}),...extra});
test('listing: fixed product-news section, title/date/category; scripts and images never execute',()=>{
 const parsed=parseShimamuraListing(listing(undefined,'<script>globalThis.listingExecuted=true</script>'));
 assert.equal(parsed.cards,3);assert.equal(parsed.entries.length,3);assert.equal(parsed.entries[0].listingCategory,'amp-effector');assert.equal(parsed.entries[0].date,'2026-09-28T00:00:00+09:00');assert.equal(globalThis.listingExecuted,undefined);
 assert.ok(!JSON.stringify(parsed).includes('<html>'));assert.ok(!JSON.stringify(parsed).includes('unrelated'));
});
test('listing: tutorial/sale/campaign/shop/evergreen/artist exclusions',()=>{
 for(const term of ['tutorial','sale','campaign','店舗案内','セミナー','fair','入荷','比較','完全ガイド','ギターライブ']){
  const parsed=parseShimamuraListing(listing([card('a',term),card('b'),card('c')]));assert.equal(parsed.entries.length,2);assert.equal(Object.values(parsed.reasons).reduce((a,b)=>a+b,0),1);
 }
});
test('listing: malformed section/marker/date/card/title fails closed; no fallback section',()=>{
 for(const html of [listing().replace('製品ニュース','特集'),listing().replace('<date>2026/09/28</date>',''),listing().replace('2026/09/28','2026/02/30'),listing().replace('2026/09/28','yesterday'),listing([card('one')]),'<html>temporarily unavailable</html>',listing().replace('<h3>BOSS EX-4 新製品を発表しました</h3>','<h3></h3>')])assert.throws(()=>parseShimamuraListing(html),/listing_structure_changed/);
 for(const value of ['2026/02/30','2026/13/01','2026/09/31','2026-09-29','2026/9/2'])assert.equal(listingDate(value),null);
});
test('listing: unknown source, credentials, external host, query, normal product page and arbitrary listing rejected',()=>{
 for(const url of ['https://evil.test/update/amp-effector/2026/09/a/','https://user:password@www.shimamura.co.jp/update/amp-effector/2026/09/a/','http://www.shimamura.co.jp/update/amp-effector/2026/09/a/','https://www.shimamura.co.jp/shops/a/','https://www.shimamura.co.jp/update/amp-effector/2026/09/a/?affiliate=1','https://www.shimamura.co.jp/update/amp-effector/'])assert.equal(listingArticleUrl(url),null);
 for(const url of ['https://evil.test/','https://www.shimamura.co.jp/update/feed/',URL+'page/2/'])assert.throws(()=>parseShimamuraListing(listing(),url),/listing_url_blocked/);
 const parsed=parseShimamuraListing(listing([card('a').replace('https://www.shimamura.co.jp','https://evil.test'),card('b'),card('c')]));assert.equal(parsed.entries.length,2);assert.equal(parsed.reasons.url_or_category,1);
});
test('listing: duplicate URLs, ordering and date-only overlap watermark',()=>{
 assert.equal(parseShimamuraListing(listing([card('a'),card('a'),card('a')])).entries.length,1);
 assert.throws(()=>parseShimamuraListing(listing([card('a','ギター','2026/09/27'),card('b'),card('c')])),/listing_structure_changed/);
 const p=parseShimamuraListing(listing([card('a'),card('b','ギター','2026/09/27'),card('c','ギター','2026/09/25')]),URL,{since:Date.parse('2026-09-28T06:00:00Z')});assert.equal(p.entries.length,2);
});
test('listing: old/future metadata rejected by candidate pipeline',async()=>{
 for(const date of ['2026/09/30','2026/05/01']){
  const e=parseShimamuraListing(listing([card('a','BOSS EX-4 発売',date),card('b','BOSS EX-4 発売',date),card('c','BOSS EX-4 発売',date)])).entries[0];
  assert.equal((await candidateFrom(e,source,robotsPolicy(ROBOTS,source),now,pepper)).reason,'date_outside_window');
 }
});
test('listing: opt-out meta (including bot-specific), hidden dates, oversized responses fail closed',async()=>{
 for(const name of ['robots','SoundCruiseNewsBot'])for(const content of ['noindex','none','noarchive','nosnippet'])assert.throws(()=>parseShimamuraListing(listing(undefined,`<meta name="${name}" content="${content}">`)),/listing_optout/);
 assert.throws(()=>parseShimamuraListing('x'.repeat(LISTING_MAX_BYTES+1)),/listing_too_large/);
 assert.throws(()=>parseShimamuraListing(listing().replace('<date>','<date hidden>')),/listing_structure_changed/);
 const s=await store(),r=await collectSource('shimamura',s,options({fetcher:async url=>url.endsWith('/robots.txt')?response(ROBOTS):response('x'.repeat(LISTING_MAX_BYTES+1),200,{'content-type':'text/html'})}));assert.equal(r.outcome,'listing_too_large');assert.equal((await s.state('shimamura')).disabled,true);
});
test('listing: live-shaped collector stores pending only; memory title/HTML/secret absent from SQLite dump',async()=>{
 const s=await store(),calls=[];
 const r=await collectSource('shimamura',s,options({fetcher:async(url,opts)=>{calls.push({url,opts});return options().fetcher(url)}}));
 assert.equal(r.outcome,'collected');assert.equal(r.pending,3);assert.equal(calls.length,2);assert.deepEqual(r.requestCounts,{robots:1,listing:1,feed:0});
 assert.ok(calls.every(c=>c.url===URL||c.url===source.robotsUrl));assert.ok(calls.every(c=>c.opts.redirect==='manual'));
 const dump=JSON.stringify(await s.candidates());for(const forbidden of ['<html>','<h3>','新製品を発表しました',pepper,'title_hash'])assert.ok(!dump.includes(forbidden));
 assert.ok((await s.candidates()).every(r=>r.review_status==='pending'));assert.equal((await s.state('shimamura')).lastDiscoveryAt,now);
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
