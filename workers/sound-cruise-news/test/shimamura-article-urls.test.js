import test from 'node:test';import assert from 'node:assert/strict';
import {listingArticleUrl,parseShimamuraListing,SHIMAMURA_LISTING_URL} from '../src/shimamura-listing.js';
import {shimamuraProductSurface} from '../src/shimamura-product-evidence.js';
import {candidateFrom} from '../src/metadata.js';import {getSource} from '../src/registry.js';import {pepper,store} from './helpers.js';import {collectSource} from '../src/collector.js';import {hash} from '../src/policy.js';
const now=Date.parse('2026-11-10T06:00:00+09:00'),source={...getSource('shimamura'),enabled:true,productionEnabled:true};
const url='https://www.shimamura.co.jp/update/guitar-bass/2026/11/gs-699881/';
// Owner-opened article: canonical=self, published11/01, modified11/05.
// Layout/proof below is synthetic; no production receipt/hash is invented.
const title='Sleep Tokenの「IV」＆「III」シグネイチャーモデルがJacksonとCharvelから登場！';
const card=(u=url,t=title)=>`<a href="${u}"><h3>${t}</h3><time>2026/11/01</time><span class="btn-cat-guitar-bass">ギター／ベース</span></a>`;
const html=c=>'<h1>製品ニュース 記事一覧</h1>'+c;
for(const path of ['guitar-bass/2026/11/gs-123456','amp-effector/2026/11/gs-2468','dtm-recording/2026/11/1234'])test('same approved article families: '+path,()=>{const u='https://www.shimamura.co.jp/update/'+path+'/';assert.equal(listingArticleUrl(u),u);assert(shimamuraProductSurface({source_id:source.id,source_url:u,review_status:'pending'},source));});
for(const path of ['guitar-bass/2026/11/anything','guitar-bass/2026/11/gs-sale','guitar-bass/2026/11/gs-001','guitar-bass/2026/13/gs-123','shops/test/guitar-bass/gs-123','common/new-item','guitar-bass-tags/gs-123','guitar-bass/2026/11/gs-123/page/2'])test('does not admit unrelated page family: '+path,()=>assert.equal(listingArticleUrl('https://www.shimamura.co.jp/update/'+path+'/'),null));
for(const u of [url+'?page=2',url+'#share',url.replace('www.shimamura.co.jp','evil.test'),url.replace('https://','http://'),url.replace('https://','https://user@')])test('URL safety unchanged: '+u,()=>assert.equal(listingArticleUrl(u),null));
test('real gs URL is no longer silently lost; multi-brand identity is not fabricated into one product',async()=>{
 const p=parseShimamuraListing(html(card()),SHIMAMURA_LISTING_URL,{knownUrls:new Set()});assert.equal(p.entries.length,1);assert.equal(p.entries[0].url,url);assert.equal(p.entries[0].date,'2026-11-01T00:00:00+09:00');const r=await candidateFrom(p.entries[0],source,{isAllowed:()=>true},now,pepper);assert(r.item);assert.equal(r.item.sourceUrl,url);assert.equal(r.item.productFacts,null);assert.equal(r.item.publicationDecision,'PUBLISH_REVIEW');
});
test('gs format alone is insufficient: editorial exclusion, card binding, opt-out and malformed dates remain',()=>{
 assert.equal(parseShimamuraListing(html(card(url,'中古ギターが入荷')),SHIMAMURA_LISTING_URL).entries.length,0);
 assert.equal(parseShimamuraListing(html('<nav>'+card()+'</nav>'+card(url.replace('699881','123456'))),SHIMAMURA_LISTING_URL).entries.length,1);
 assert.throws(()=>parseShimamuraListing('<meta name="robots" content="noarchive">'+html(card()),SHIMAMURA_LISTING_URL),/listing_optout/);
 assert.throws(()=>parseShimamuraListing(html(card().replace('2026/11/01','不明')),SHIMAMURA_LISTING_URL),/listing_structure_changed/);
});
test('collector admits one gs product-news card, never arbitrary page links or publisher-detail fetches',async()=>{
 const s=await store(),robots='User-agent: *\nAllow: /',active={...source,robotsHash:await hash(robots)},calls=[];
 const r=await collectSource(source.id,s,{mode:'local',now,registry:[active],pepper,sleep:async()=>{},fetcher:async u=>{calls.push(u);assert([active.robotsUrl,active.discoveryUrl].includes(u));return new Response(u===active.robotsUrl?robots:html(card()+card('https://www.shimamura.co.jp/update/shops/test/123/','店舗の在庫一覧')),{headers:{'Content-Type':u===active.robotsUrl?'text/plain':'text/html'}});}});
 assert.equal(r.outcome,'collected');assert.equal((await s.db.prepare('SELECT count(*) n FROM candidate_items').first()).n,1);assert.equal(calls.length,2);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_decision_ledger').first()).n,0);
});
