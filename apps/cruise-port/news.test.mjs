import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEWS_MODE, NEWS_CATEGORIES, normalizeNewsItem, prepareNews, tickerNews, groupNews } from './news-data.js';
import { NEWS_BETA_ITEMS } from './data/news-beta.js';
const now = Date.parse('2026-09-28T12:00:00Z');
const make = (age = 1, overrides = {}) => ({ id: 'synthetic', label: 'テスト用のギター製品情報', sourceName: 'テスト用公式', sourceUrl: 'https://example.invalid/product', publishedAt: new Date(now - age * 86400000).toISOString(), createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z', category: 'acoustic_guitar', topicKey: 'synthetic', sourceKind: 'official', sourceSafety: 'safe', manualReviewStatus: 'approved', ...overrides });
test('schema projection excludes headline/body/image and rejects invalid input', () => {
 const item = normalizeNewsItem(make(1,{ headline:'not retained',body:'not retained', image:'not retained' }));
 assert.ok(item); assert.equal(item.headline,undefined); assert.equal(item.body,undefined); assert.equal(item.image,undefined);
 for(const patch of [{category:'bad'},{publishedAt:''},{publishedAt:'2026-02-30T00:00:00Z'},{label:''},{sourceKind:'bad'},{sourceSafety:'UNKNOWN'},{manualReviewStatus:'pending'},{manualReviewStatus:'rejected'}]) assert.equal(normalizeNewsItem(make(1,patch)),null);
 for(const sourceUrl of ['javascript:alert(1)','data:text/plain,x','file:///tmp/x','http://example.invalid','https://user:secret@example.invalid']) assert.equal(normalizeNewsItem(make(1,{sourceUrl})),null);
});
test('artist requires explicit guitar evidence; piano only excluded', () => {
 for(const category of ['artist_guitar','live_guitar']) {
 assert.ok(normalizeNewsItem(make(1,{category,guitarEvidence:'guitar_performance'})));
 assert.equal(normalizeNewsItem(make(1,{category,guitarEvidence:'piano_vocal'})),null);
 assert.equal(normalizeNewsItem(make(1,{category})),null);
 }
});
test('90 day boundary, future exclusion, latest sort and date groups', () => {
 const items=prepareNews([make(90,{topicKey:'old',id:'old'}),make(91),make(-1),make(1,{id:'new',topicKey:'new'})],{now});
 assert.deepEqual(items.map(i=>i.id),['new','old']); assert.equal(groupNews(items).length,2);
 assert.equal(groupNews(items,'dtm_software').length,0);
});
test('ticker 7 days, 14 days fallback, old hide and max five', () => {
 assert.deepEqual(tickerNews([make(7),make(8)],now).map(i=>i.publishedAt),[make(7).publishedAt]);
 assert.equal(tickerNews([make(14)],now).length,1); assert.equal(tickerNews([make(15)],now).length,0);
 assert.equal(tickerNews(Array.from({length:8},()=>make()),now).length,5);
});
test('dedupe selects official, then distributor, retailer, media', () => {
 const all=['media','retailer_editorial','distributor','official'].map(sourceKind=>make(1,{sourceKind,id:sourceKind}));
 for(let count=4; count>0;count--) assert.equal(prepareNews(all.slice(0,count),{now})[0].id,all[count-1].id);
});
test('modes, empty and malformed data', () => {
 assert.equal(NEWS_MODE,'beta'); assert.equal(Object.keys(NEWS_CATEGORIES).length,10);
 assert.deepEqual(prepareNews(null,{mode:'off'}),[]);
 for(const mode of ['beta','on']) assert.equal(prepareNews([make()],{now,mode}).length,1);
 assert.throws(()=>prepareNews({items:[]},{now})); assert.throws(()=>prepareNews([],{mode:'invalid'}));
 assert.deepEqual(prepareNews([null,{},'bad'],{now}),[]); assert.deepEqual(prepareNews([],{now}),[]);
 assert.equal(NEWS_BETA_ITEMS.length,23);
});
test('runtime source contains no outbound acquisition or HTML sinks', () => {
 for(const path of ['news-data.js','news-ui.js','data/news-beta.js']) {
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket|innerHTML|createElement\(['"](?:img|iframe)/);
 }
 const css=readFileSync(new URL('style.css',import.meta.url),'utf8');
 assert.match(css,/prefers-reduced-motion/); assert.match(css,/news-ticker:focus .*animation-play-state: paused/);
 for(const path of ['index.html','pro_9a3943176561/index.html']) {
 const html=readFileSync(new URL(path,import.meta.url),'utf8');
 assert.match(html,/id="news-ticker"[^>]*href="#news"[^>]*hidden/);
 assert.match(html,/id="news-view"[^>]*hidden/);
 }
 const app=readFileSync(new URL('practice-menu-app.js',import.meta.url),'utf8');
 assert.match(app,/await import\('\.\/news-ui.js\?v=1.5.0'\)/);
});

test('real manual fixture is valid, unique, safe-source only and fact-label only', () => {
 const hosts = {'Yamaha':['jp.yamaha.com'],'キクタニ':['www.kikutani.co.jp'],'島村楽器':['www.shimamura.co.jp'],'池部楽器':['www.ikebe-gakki.com','www.ikebe-gakki-pb.com'],'Discover chuya':['discover.chuya-online.com'],'SONICWIRE':['sonicwire.com'],'Hookup':['hookup.co.jp'],'Sleepfreaks':['sleepfreaks-dtm.com'],'IK Multimedia':['www.ikmultimedia.com'],'AHS':['www.ah-soft.com']};
 assert.equal(NEWS_BETA_ITEMS.length,23);
 assert.equal(new Set(NEWS_BETA_ITEMS.map(i=>i.topicKey)).size,23);
 for(const item of NEWS_BETA_ITEMS) {
  assert.deepEqual(normalizeNewsItem(item),item);
  assert.equal(item.sourceSafety,'safe'); assert.equal(item.manualReviewStatus,'approved');
  assert.ok(hosts[item.sourceName]?.includes(new URL(item.sourceUrl).hostname));
  assert.doesNotMatch(item.sourceUrl,/yamaha\.com\/ja\/news_release/);
  assert.ok(!['artist_guitar','live_guitar'].includes(item.category));
  assert.deepEqual(Object.keys(item).sort(),['id','label','sourceName','sourceUrl','publishedAt','category','topicKey','createdAt','updatedAt','manualReviewStatus','sourceSafety','sourceKind'].sort());
 }
 const ready=prepareNews(NEWS_BETA_ITEMS,{now});assert.equal(ready.length,23);
 assert.deepEqual(Object.fromEntries(['acoustic_guitar','electric_guitar_bass','amps_effects','dtm_software'].map(cat=>[cat,ready.filter(i=>i.category===cat).length])),{acoustic_guitar:6,electric_guitar_bass:4,amps_effects:7,dtm_software:6});
 assert.equal(tickerNews(ready,now).length,5);
 assert.ok(!tickerNews(ready,now).some(i=>i.sourceName==='Yamaha'));
 assert.equal(groupNews(ready).find(([day])=>day==='2026-09-18')[1].filter(i=>i.sourceName==='Yamaha').length,1);
 assert.equal(ready.find(i=>i.topicKey==='caj-acdc-vii').sourceUrl,'https://www.shimamura.co.jp/update/amp-effector/2026/09/80794/');
 assert.equal(ready.find(i=>i.topicKey==='ahs-instrumentx-101').sourceUrl,'https://www.ah-soft.com/inst-x/setup/');
});
