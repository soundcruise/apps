import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRUISE_STUDIO_VIDEO as video, CRUISE_STUDIO_NEWS_ITEM as notice } from './news-articles.js';
import { membersVideoHref, confirmMembersVideo } from './news-members-video.js';
import { normalizeNewsItem, prepareNews, tickerNews, groupNews } from './news-data.js';
import { loadNews, loadNewsPresentation } from './news-provider.js';
import { renderNews, stopNewsUpdates } from './news-ui.js';
const now = Date.parse('2026-11-18T03:00:00Z');
const external = { id:'manufacturer', label:'メーカー、アコギの限定モデルを発表', sourceName:'Manufacturer', sourceUrl:'https://example.com/news', category:'acoustic_guitar', publishedAt:'2026-11-16T00:00:00.000Z', createdAt:'2026-11-16T00:00:00.000Z', updatedAt:'2026-11-16T00:00:00.000Z', sourceKind:'official', sourceSafety:'safe', manualReviewStatus:'approved', topicKey:'manufacturer:one', hot:true };
class Element {
 constructor(tag,doc) { this.tagName=tag;this.doc=doc;this.children=[];this.listeners={};this.attrs={};this.textContent='';this.isConnected=true; }
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 removeEventListener(){}
 fire(type,extra={}){for(const fn of this.listeners[type]||[])fn({target:this,...extra});}
 showModal(){this.open=true;}
 close(){this.open=false;this.fire('close');}
 remove(){this.isConnected=false;this.doc.body.children=this.doc.body.children.filter(x=>x!==this);}
 focus(){this.doc.activeElement=this;}
 getBoundingClientRect(){return {left:10,top:10,right:300,bottom:300};}
 all(){return this.children.flatMap(n=>[n,...n.all()]);}
}
function documentFixture(){
 const doc={createElement(tag){return new Element(tag,doc);},addEventListener(){},removeEventListener(){},getElementById(id){return this.ids[id];},defaultView:{setTimeout(){return 1;},clearTimeout(){},addEventListener(){},removeEventListener(){}}};
 doc.body=new Element('body',doc);doc.ids=Object.fromEntries(['news-ticker','news-entry','news-content'].map(id=>[id,new Element('div',doc)]));return doc;
}
function openFixture(){const doc=documentFixture(),trigger=new Element('button',doc),opened=[];const close=confirmMembersVideo(doc,notice,trigger,{open:url=>opened.push(url)});return {doc,trigger,opened,close,dialog:doc.body.children[0]};}
test('reviewed video identity and day precision remain separate from NEWS announcement date',()=>{
 assert.equal(video.id,'BKHbxOotq9E');assert.equal(video.url,'https://www.youtube.com/watch?v=BKHbxOotq9E');
 assert.equal(video.visibility,'members_only');assert.equal(video.audience,'all_channel_members');
 assert.equal(video.publishedOn,'2026-11-15');assert.equal(video.publishedAt,null);
 const item=normalizeNewsItem(notice);assert.equal(item.videoPublishedOn,'2026-11-15');
 assert.equal(groupNews([item],'',now)[0][0],'2026-11-18');
 assert.equal(item.label,'オールインワン弾き語りアプリfor PC「クルーズスタジオ」メンバー限定公開');
 assert.equal(item.sourceName,'アコギ弾き語り専門ラボ / クルーニー');
 assert.equal(item.hot,true);assert.equal(item.displayOrder,0);
 assert.equal(item.body,undefined);assert.equal(item.image,undefined);
});
test('only canonical HTTPS YouTube watch URLs with bundled official authority are accepted',()=>{
 assert.equal(membersVideoHref(notice),video.url);
 for(const sourceUrl of ['http://www.youtube.com/watch?v=BKHbxOotq9E','https://youtu.be/BKHbxOotq9E',video.url+'&x=1',video.url+'#x','https://user@www.youtube.com/watch?v=BKHbxOotq9E','https://www.youtube.com:443/watch?v=BKHbxOotq9E','https://youtube.com.evil.test/watch?v=BKHbxOotq9E','javascript:alert(1)'])assert.equal(normalizeNewsItem({...notice,sourceUrl}),null,sourceUrl);
 for(const patch of [{videoId:'AQai2tyIra0'}, {videoId:'x'},{videoChannelId:'another'},{sourceId:'Unknown'},{sourceKind:'media'},{category:'sale'},{videoPublishedOn:'2026-02-31'},{videoPublishedOn:'2026-11-15T00:00:00Z'}])assert.equal(normalizeNewsItem({...notice,...patch}),null);
});
test('API records cannot claim members-only official authority; kill switch and outage behavior stay distinct',async()=>{
 const records=await loadNews({provider:'api',transport:async()=>({contractVersion:1,items:[{...notice,publishable:true}],nextCursor:null})});
 assert.equal(records[0].sourceId,undefined);assert.equal(records[0].hot,true);assert.equal(records[0].displayOrder,0);assert.equal(records[0].linkType,undefined);assert.equal(records[0].sourceKind,'media');assert.equal(normalizeNewsItem(records[0]),null);
 await assert.rejects(loadNewsPresentation({fetcher:async()=>({ok:true,json:async()=>({disabled:true})})}),{name:'NewsDisabledError'});
 const fallback=await loadNewsPresentation({fetcher:async()=>{throw Error('offline');}});
 assert.ok(fallback.items.some(n=>n.id===notice.id));assert.ok(!fallback.items.some(n=>n.id===external.id));
});
test('existing public-day sorting, HOT, topic dedup, expiry and ticker selection remain shared',()=>{
 const items=prepareNews([external,notice,notice],{now});assert.deepEqual(items.map(n=>n.id),[notice.id,external.id]);
 assert.equal(items[1].hot,true);assert.equal(tickerNews(items,now)[0].id,notice.id);
 assert.deepEqual(prepareNews([notice],{now:Date.parse(notice.publishedAt)-1}),[]);
 assert.deepEqual(prepareNews([notice],{now:Date.parse(notice.publishedAt)+91*86400000}),[]);
 assert.deepEqual(prepareNews([notice],{now,mode:'off'}),[]);
});
test('dialog starts on safe cancel; cancellation restores focus and never opens YouTube',()=>{
 const f=openFixture();assert.equal(f.dialog.open,true);assert.equal(f.dialog.children[0].textContent,'YouTubeへ移動します');
 assert.equal(f.dialog.children[1].textContent,'この動画はYouTubeのメンバー限定コンテンツです。視聴には対象メンバーシップへの加入が必要です。');
 assert.equal(f.doc.activeElement.textContent,'キャンセル');assert.equal(f.opened.length,0);
 f.dialog.children[2].children[0].fire('click');assert.equal(f.dialog.open,false);assert.deepEqual(f.opened,[]);assert.equal(f.doc.activeElement,f.trigger);
});
test('confirmation opens the verified URL only once; dismissed/rerendered dialogs cannot open',()=>{
 const f=openFixture(),view=f.dialog.children[2].children[1];view.fire('click');view.fire('click');assert.deepEqual(f.opened,[video.url]);
 assert.equal(f.dialog.open,false);
 const g=openFixture();g.close();g.dialog.children[2].children[1].fire('click');assert.deepEqual(g.opened,[]);
 const h=openFixture();h.dialog.fire('click',{clientX:0,clientY:0});assert.equal(h.dialog.open,false);assert.deepEqual(h.opened,[]);
});
test('rerender closes the modal; normal external cards retain their original anchor behavior',()=>{
 const doc=documentFixture();renderNews({documentObject:doc,items:[notice,external],mode:'on',now,clock:()=>now});
 const cards=doc.ids['news-content'].all().filter(n=>n.className==='news-card');
 assert.deepEqual(cards.map(n=>n.tagName),['button','a']);assert.equal(cards[0].href,undefined);assert.equal(cards[0].attrs['aria-haspopup'],'dialog');
 assert.equal(cards[1].href,external.sourceUrl);assert.equal(cards[1].target,'_blank');assert.equal(cards[1].rel,'noopener noreferrer');
 doc.defaultView.open=()=>assert.fail('unexpected navigation');cards[0].fire('click');assert.equal(doc.body.children[0].open,true);
 stopNewsUpdates(doc);assert.equal(doc.body.children.length,0);
});
test('both editions load the scoped stylesheet and updated boot modules without changing main CSS',()=>{
 for(const path of ['index.html','pro_9a3943176561/index.html']){
  const html=readFileSync(new URL(path,import.meta.url),'utf8');assert.match(html,/news-members-video\.css\?v=1\.36\.0/);
  assert.match(html,/(practice-menu-app|pro-app-boot)\.js\?v=1\.38\.1/);
 }
 const source=readFileSync(new URL('news-members-video.js',import.meta.url),'utf8');assert.doesNotMatch(source,/innerHTML|insertAdjacentHTML|\bfetch\(|localStorage|indexedDB/);
});

test('the official source identifier is independent of its display name; API copies cannot gain authority',()=>{
 assert.equal(membersVideoHref({...notice,sourceName:'表示名だけ訂正'}),video.url);
 assert.equal(membersVideoHref({...notice,sourceId:undefined}),null);
 assert.equal(membersVideoHref({...notice,sourceId:'manufacturer',sourceName:notice.sourceName}),null);
});
test('official zero slot wins only within its JST day, even against a later normal zero slot',()=>{
 const sameDay={...external,id:'same-day',topicKey:'same-day',publishedAt:'2026-11-18T08:00:00.000Z',displayOrder:0,hot:false};
 const other={...sameDay,id:'second',topicKey:'second',displayOrder:1};
 const tomorrow={...sameDay,id:'tomorrow',topicKey:'tomorrow',publishedAt:'2026-11-18T15:00:00.000Z'};
 const at=Date.parse('2026-11-19T03:00:00Z');
 const before=structuredClone([sameDay,other,tomorrow]);
 const sorted=prepareNews([other,notice,tomorrow,sameDay],{now:at});
 assert.deepEqual(sorted.map(n=>n.id),['tomorrow',notice.id,'same-day','second']);
 assert.equal(sorted.find(n=>n.id==='same-day').hot,false);assert.equal(sorted.find(n=>n.id==='second').displayOrder,1);
 assert.deepEqual([sameDay,other,tomorrow],before);
 // The home follows the list, including the official same-day slot.
 assert.deepEqual(tickerNews(sorted,at).map(n=>n.id),['tomorrow',notice.id,'same-day','second']);
 const doc=documentFixture();renderNews({documentObject:doc,items:[sameDay,notice],mode:'on',now:at,clock:()=>at});
 const cards=doc.ids['news-content'].all().filter(n=>n.className==='news-card');
 assert.equal(cards[0].tagName,'button');
 assert.equal(doc.ids['news-ticker'].all().find(n=>n.className==='news-ticker-track').children[0].textContent,'🔥 '+notice.label);
 assert.deepEqual(cards[0].all().filter(n=>n.className==='news-hot').map(n=>n.textContent),['🔥 ホット']);
 assert.equal(cards[1].all().filter(n=>n.className==='news-hot').length,0);
});

test('only the Studio notice leads the list and ticker during the three JST dates', () => {
 const normal = [19, 18, 17, 16, 15].map(day => ({
  ...external, label: '記事' + day, id: 'external-' + day, topicKey: 'external-' + day,
  publishedAt: '2026-11-' + day + 'T01:00:00Z', hot: true, displayOrder: 0
 }));
 const items = [...normal, notice];
 const start = Date.parse('2026-11-20T00:00:00+09:00');
 const end = Date.parse('2026-11-23T00:00:00+09:00');
 for (const [now, featured] of [[start-1,false],[start,true],[start+86400000,true],[end-1,true],[end,false]]) {
  const doc = documentFixture();
  renderNews({documentObject:doc, items, mode:'on', now, clock:()=>now});
  const cards = doc.ids['news-content'].all().filter(n=>n.className==='news-card');
  const order = cards.map(card=>card.all().find(n=>n.className==='news-label').textContent);
  const sorted = prepareNews(items,{now});
  assert.equal(sorted[0].id, featured ? notice.id : normal[0].id);
  assert.deepEqual(sorted.filter(item=>item.id!==notice.id).map(item=>item.id),normal.map(item=>item.id));
  assert.deepEqual(order, sorted.map(item=>item.label));
  assert.deepEqual(tickerNews(sorted,now).map(item=>item.label),order.slice(0,5));
  const studio = cards.find(card=>card.tagName==='button');
  assert.equal(studio.all().find(n=>n.tagName==='time').textContent,'2026/11/18');
  assert.deepEqual(groupNews(sorted,'acoustic_guitar',now).flatMap(([,rows])=>rows.map(item=>item.id)),normal.map(item=>item.id));
 }
 const doc = documentFixture();
 let time = start-1, timer;
 doc.defaultView.setTimeout = (callback, delay) => { timer={callback, delay}; return 1; };
 renderNews({documentObject:doc, items, mode:'on', clock:()=>time});
 const first = () => doc.ids['news-ticker'].all().find(n=>n.className==='news-ticker-track').children[0].textContent;
 assert.equal(timer.delay,1);
 time=start; timer.callback();
 assert.equal(first(),'🔥 '+notice.label);
 assert.equal(timer.delay,end-start);
 time=end; timer.callback();
 assert.equal(first(),'🔥 '+normal[0].label);
});
