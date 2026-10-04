import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEWS_CATEGORIES, normalizeNewsItem, prepareNews, tickerNews, groupNews } from './news-data.js';
import { loadNews } from './news-provider.js';
import { renderNews } from './news-ui.js';

const now = Date.parse('2026-09-28T12:00:00Z');
const make = (overrides = {}) => ({ id: 'sale-1', label: 'テスト用楽器店、決算セールを10月31日まで開催。ギター・エフェクターなどが対象', sourceName: 'テスト用楽器店',
    sourceUrl: 'https://example.invalid/sale', publishedAt: new Date(now - 86400000).toISOString(), createdAt: '2026-09-27T00:00:00Z',
    updatedAt: '2026-09-27T00:00:00Z', category: 'sale', topicKey: 'sale-1', sourceKind: 'retailer_editorial', sourceSafety: 'safe',
    manualReviewStatus: 'approved', ...overrides });

test('「セール」 is a NEWS category accepted by the client model', () => {
    assert.equal(NEWS_CATEGORIES.sale, 'セール');
    assert.deepEqual(Object.keys(NEWS_CATEGORIES).slice(-2), ['sale', 'media_other'], 'listed before その他');
    assert.equal(normalizeNewsItem(make()).category, 'sale');
    const items = prepareNews([make(), make({ id: 'gear', topicKey: 'gear', category: 'amps_effects', label: 'BOSS、EX-4を発表' })], { now });
    assert.equal(items.length, 2);
    assert.deepEqual(groupNews(items, 'sale').flatMap(([, rows]) => rows.map(row => row.id)), ['sale-1'], 'filter works');
    assert.ok(tickerNews(items, now).some(item => item.category === 'sale'), 'sale can appear in the ticker');
});

test('the API provider accepts sale items and still fails closed on unknown categories', async () => {
    const api = items => loadNews({ provider: 'api', transport: async () => ({ contractVersion: 1, items }) });
    const apiItem = { id: 'sale-1', label: make().label, sourceName: 'テスト用楽器店', sourceUrl: 'https://example.invalid/sale',
        publishedAt: '2026-09-27T00:00:00Z', category: 'sale', publishable: true };
    const [loaded] = await api([apiItem]);
    assert.equal(loaded.category, 'sale');
    assert.ok(normalizeNewsItem(loaded));
    await assert.rejects(api([{ ...apiItem, category: 'future_kind' }]), 'unknown data is rejected, never rendered');
});

// Minimal DOM for renderNews.
class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.hidden = false; this.textContent = ''; this.className = ''; this.listeners = {}; this.attrs = {}; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    all() { return this.children.flatMap(child => [child, ...child.all()]); }
}
function documentFor() {
    const ids = { 'news-ticker': new Node('div'), 'news-entry': new Node('div'), 'news-content': new Node('div') };
    return { ids, getElementById: id => ids[id], createElement: tag => new Node(tag) };
}

test('sale renders like any NEWS item: badge, filter option and ticker; no ad wording', () => {
    const doc = documentFor();
    const items = [make(), make({ id: 'gear', topicKey: 'gear', category: 'amps_effects', label: 'BOSS、EX-4を発表', sourceKind: 'official' })];
    renderNews({ documentObject: doc, items, mode: 'on', now });
    const content = doc.ids['news-content'].all();
    const select = content.find(node => node.tagName === 'select');
    assert.ok(select.children.some(option => option.value === 'sale' && option.textContent === 'セール'));
    const badges = () => doc.ids['news-content'].all().filter(node => node.className === 'news-category').map(node => node.textContent);
    assert.ok(badges().includes('セール'));
    select.value = 'sale'; select.listeners.change();
    assert.deepEqual(badges(), ['セール'], 'filtering to セール shows only sale items');
    assert.equal(doc.ids['news-ticker'].hidden, false);
    assert.ok(doc.ids['news-ticker'].all().some(node => node.textContent === make().label));
    const text = [...doc.ids['news-content'].all(), ...doc.ids['news-ticker'].all()].map(node => node.textContent).join(' ');
    assert.doesNotMatch(text, /Sponsored|スポンサー|広告|PR|おすすめ購入|今すぐ購入/);
});

test('no affiliate or ad treatment exists in NEWS code', () => {
    for (const path of ['news-data.js', 'news-ui.js', 'news-provider.js']) {
        assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), 'utf8'), /affiliate|アフィリエイト|sponsored|tag=|utm_/i, path);
    }
});

test('sale expiry is inclusive and removes list/category/ticker entries while keeping unknown deadlines',()=>{
 const deadline=now+1000;
 const dated=make({saleEndsAt:deadline}),unknown=make({id:'unknown',topicKey:'unknown',saleEndsAt:null});
 for(const delta of [-1,0,1]){
  const prepared=prepareNews([dated,unknown],{now:deadline+delta});
  assert.equal(prepared.length,delta<=0?2:1);
  assert.equal(groupNews([dated,unknown],'sale',deadline+delta).flatMap(([,rows])=>rows).length,delta<=0?2:1);
  assert.equal(tickerNews([dated,unknown],deadline+delta).length,delta<=0?2:1);
 }
 assert.equal(normalizeNewsItem(make({saleEndsAt:'tomorrow'})),null);
});

test('provider preserves sale deadline, rejects malformed deadline and unknown-category mixed responses',async()=>{
 const item={id:'sale',label:make().label,sourceName:'テスト用楽器店',sourceUrl:'https://example.invalid/sale',publishedAt:'2026-09-27T00:00:00Z',category:'sale',publishable:true,saleEndsAt:now};
 const transport=items=>async()=>({contractVersion:1,items});
 const [result]=await loadNews({provider:'api',transport:transport([item])});
 assert.equal(result.saleEndsAt,now);
 for(const bad of ['2026-09-30',-1,{},1.5])await assert.rejects(loadNews({provider:'api',transport:transport([{...item,saleEndsAt:bad}])}));
 await assert.rejects(loadNews({provider:'api',transport:transport([item,{...item,id:'unknown',category:'future'}])}));
});

function timedDocument(){
 const doc=documentFor();let at=now,nextId=0;const timers=new Map(),listeners=new Map();
 const add=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);};
 const remove=(name,fn)=>listeners.get(name)?.delete(fn);
 doc.addEventListener=add;doc.removeEventListener=remove;
 doc.defaultView={setTimeout:(fn,ms)=>{const id=++nextId;timers.set(id,{fn,at:at+ms});return id;},clearTimeout:id=>timers.delete(id),addEventListener:add,removeEventListener:remove};
 return {doc,clock:()=>at,advance:(time,runTimers=true)=>{at=time;if(runTimers)for(const [id,timer] of [...timers])if(timer.at<=at){timers.delete(id);timer.fn();}},wake:()=>{for(const fn of [...(listeners.get('visibilitychange')||[])])fn();},timers};
}
test('open NEWS screen removes expired sale automatically and hides its zero-count filter',()=>{
 const ui=timedDocument(),deadline=now+1000;
 renderNews({documentObject:ui.doc,items:[make({saleEndsAt:deadline})],mode:'on',clock:ui.clock});
 let select=ui.doc.ids['news-content'].all().find(node=>node.tagName==='select');select.value='sale';select.listeners.change();
 ui.advance(deadline);assert.equal(ui.doc.ids['news-ticker'].hidden,false);
 ui.advance(deadline+1);assert.equal(ui.doc.ids['news-ticker'].hidden,true);
 assert.equal(ui.doc.ids['news-content'].all().filter(node=>node.className==='news-card').length,0);
 select=ui.doc.ids['news-content'].all().find(node=>node.tagName==='select');assert.equal(select.value,'');
 assert.equal(select.children.some(option=>option.value==='sale'),false);
 assert.equal(ui.timers.size,0);
});
test('wake rechecks expired sales when timers were suspended; OFF cancels old rendering',async()=>{
 const {stopNewsUpdates}=await import('./news-ui.js');
 const ui=timedDocument();renderNews({documentObject:ui.doc,items:[make({saleEndsAt:now+1000})],mode:'on',clock:ui.clock});
 ui.advance(now+2000,false);ui.wake();assert.equal(ui.doc.ids['news-ticker'].hidden,true);
 renderNews({documentObject:ui.doc,items:[make({saleEndsAt:now+4000})],mode:'on',clock:ui.clock});
 stopNewsUpdates(ui.doc);assert.equal(ui.timers.size,0,'a later API failure/kill cannot be undone by an old timer');
 renderNews({documentObject:ui.doc,items:[],mode:'off',clock:ui.clock});ui.advance(now+5000);ui.wake();
 assert.equal(ui.doc.ids['news-entry'].hidden,true);assert.equal(ui.doc.ids['news-ticker'].hidden,true);
});

test('recording/creator share one display filter; raw model and individual filters remain compatible',async()=>{
 const {NEWS_FILTER_GROUPS,newsFilterGroup}=await import('./news-data.js');
 assert.equal(NEWS_CATEGORIES.dtm_software,'DTM・録音・配信');
 for(const key of ['recording_audio','creator_streaming'])assert.equal(NEWS_CATEGORIES[key],'DTM・録音・配信');
 assert.equal(Object.values(NEWS_FILTER_GROUPS).filter(x=>x==='DTM・録音・配信').length,1);
 assert.equal(newsFilterGroup('creator_streaming'),'recording_streaming');
 assert.equal(newsFilterGroup('recording_audio'),'recording_streaming');
 assert.equal(newsFilterGroup('unknown'),'');
 const items=['recording_audio','creator_streaming','dtm_software','amps_effects'].map(category=>make({id:category,topicKey:category,category,label:category,saleEndsAt:undefined}));
 const prepared=prepareNews(items,{now});
 const ids=key=>groupNews(prepared,key,now).flatMap(([,rows])=>rows.map(r=>r.id));
 assert.deepEqual(ids('recording_streaming'),['creator_streaming','dtm_software','recording_audio']);
 for(const category of ['recording_audio','creator_streaming','dtm_software','amps_effects'])assert.deepEqual(ids(category),[category]);
 for(const oldKey of ['creator_streaming','recording_audio','dtm_software','recording_streaming','DTM','録音・配信']){
  const doc=documentFor();renderNews({documentObject:doc,items,mode:'on',now,category:oldKey});
  const nodes=doc.ids['news-content'].all(),select=nodes.find(n=>n.tagName==='select');
  assert.equal(select.value,'recording_streaming');assert.equal(select.children.filter(n=>n.textContent==='DTM・録音・配信').length,1);
  const cards=nodes.filter(n=>n.className==='news-card');assert.equal(cards.length,3);assert.deepEqual(cards.map(n=>n.children.find(c=>c.className==='news-label').textContent).sort(),['creator_streaming','dtm_software','recording_audio']);
  assert.deepEqual(nodes.filter(n=>n.className==='news-category').map(n=>n.textContent),['DTM・録音・配信','DTM・録音・配信','DTM・録音・配信']);
  select.value='recording_streaming';select.listeners.change();assert.equal(doc.ids['news-content'].all().filter(n=>n.className==='news-card').length,3);
 }
 assert.deepEqual(prepared.map(i=>i.category).sort(),items.map(i=>i.category).sort());
});

test('artist/event UI union preserves raw keys, individual filters, dates and product order',async()=>{
 const {ARTIST_EVENT_GROUP,NEWS_FILTER_GROUPS,newsFilterGroup}=await import('./news-data.js');
 const at=Date.parse('2026-10-04T00:00:00Z');
 const items=['artist_guitar','live_guitar','acoustic_guitar','media_other'].map(category=>make({id:category,topicKey:category,category,guitarEvidence:'manual_guitar_review'}));
 const prepared=prepareNews(items,{now:at});
 const rows=key=>groupNews(prepared,key,at).flatMap(([,rows])=>rows);
 assert.deepEqual(rows(ARTIST_EVENT_GROUP).map(i=>i.id).sort(),['artist_guitar','live_guitar']);
 assert.equal(rows(ARTIST_EVENT_GROUP).length,rows('artist_guitar').length+rows('live_guitar').length);
 assert.deepEqual(prepared.map(i=>i.category).sort(),items.map(i=>i.category).sort());
 for(const raw of ['artist_guitar','live_guitar']){
  assert.equal(newsFilterGroup(raw),ARTIST_EVENT_GROUP);
  assert.equal(rows(raw).length,1);
  const d=documentFor();renderNews({documentObject:d,items,mode:'on',now:at,clock:()=>at,category:raw});
  const nodes=d.ids['news-content'].all(),select=nodes.find(n=>n.tagName==='select');
  assert.equal(select.value,ARTIST_EVENT_GROUP);
  assert.equal(nodes.filter(n=>n.className==='news-card').length,2);
  assert.deepEqual(nodes.filter(n=>n.className==='news-category').map(n=>n.textContent),['アーティスト・イベント','アーティスト・イベント']);
 }
 assert.deepEqual(Object.keys(NEWS_FILTER_GROUPS).slice(0,4),['acoustic_guitar','electric_guitar_bass','amps_effects','recording_streaming']);
 assert.deepEqual(Object.values(NEWS_FILTER_GROUPS).slice(-3),['アーティスト・イベント','クルーズapps','その他']);
});

test('filter options hide zero sales; union, products, internal news, other and all switch independently',async()=>{
 const {CRUISE_APPS_NEWS_ITEM:own}=await import('./news-articles.js');
 const at=Date.parse('2026-10-04T00:00:00Z');
 const items=[own,...['artist_guitar','live_guitar','acoustic_guitar','media_other'].map(category=>make({id:category,topicKey:category,category,guitarEvidence:'manual_guitar_review'}))];
 const d=documentFor();renderNews({documentObject:d,items,mode:'on',now:at,clock:()=>at});
 const select=d.ids['news-content'].all().find(n=>n.tagName==='select');
 assert.equal(select.children.some(o=>o.value==='sale'),false);
 assert.equal(select.children.some(o=>['artist_guitar','live_guitar'].includes(o.value)),false);
 assert.deepEqual(select.children.slice(-3).map(o=>o.textContent),['アーティスト・イベント','クルーズapps','その他']);
 for(const [category,count] of [['',5],['artist_event',2],['cruise_apps',1],['media_other',1],['acoustic_guitar',1]]){
  select.value=category;select.listeners.change();
  const cards=d.ids['news-content'].all().filter(n=>n.className==='news-card');assert.equal(cards.length,count);
  for(const card of cards)if(card.href.startsWith('#'))assert.equal(card.href,'#news/cruise-apps/theme-colors');else{assert.equal(card.target,'_blank');assert.equal(card.rel,'noopener noreferrer');}
 }
 const saleDoc=documentFor();renderNews({documentObject:saleDoc,items:[make()],mode:'on',now,clock:()=>now});
 const saleSelect=saleDoc.ids['news-content'].all().find(n=>n.tagName==='select');
 assert.ok(saleSelect.children.some(o=>o.value==='sale'));
 saleSelect.value='artist_event';saleSelect.listeners.change();assert.equal(saleDoc.ids['news-content'].all().filter(n=>n.className==='news-card').length,0,'sales never join artist/event');
});
