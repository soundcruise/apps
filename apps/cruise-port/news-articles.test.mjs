import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {NEWS_ARTICLES, articlePath, parseNewsArticleRoute, replaceNewsListRoute, CRUISE_APPS_NEWS_ITEM as own} from './news-articles.js';
import {NEWS_CATEGORIES, NEWS_FILTER_GROUPS, normalizeNewsItem, prepareNews, groupNews} from './news-data.js';
import {NEWS_BETA_ITEMS} from './data/news-beta.js';
import {loadConfiguredNews} from './news-provider.js';
import {renderNews} from './news-ui.js';
import {renderNewsArticle} from './news-article-ui.js';
import {normalizeInitialHome} from './app-version.js';
const now=Date.parse('2026-10-04T00:00:00Z');
class Node {
 constructor(tag){this.tagName=tag;this.children=[];this.textContent='';this.attrs={};this.listeners={};}
 append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this.attrs[k]=v;} addEventListener(k,v){this.listeners[k]=v;}
 all(){return this.children.flatMap(n=>[n,...n.all()]);}
}
function doc(){const ids=Object.fromEntries(['news-ticker','news-entry','news-content','news-article-title','news-article-content'].map(id=>[id,new Node('div')]));return{ids,createElement:tag=>new Node(tag),getElementById:id=>ids[id]};}
test('first-party production article is merged without preview query; queries never bypass API',async()=>{
 for(const search of ['', '?newsPreview=cruise-apps']){
  const calls=[];
  const result=await loadConfiguredNews({locationObject:{hostname:'soundcruise.jp',search},fetcher:async url=>{calls.push(url);return{ok:true,json:async()=>({contractVersion:1,items:[],nextCursor:null})};}});
  assert.equal(result.mode,'on');assert.deepEqual(result.items,[own]);assert.equal(calls.length,1);
 }
 assert.doesNotMatch(readFileSync(new URL('news-provider.js',import.meta.url),'utf8'),/isLocalNewsPreview|newsPreview/);
});
test('new category adds one item; legacy counts, sequence and grouping unchanged',()=>{
 assert.equal(NEWS_CATEGORIES.cruise_apps,'クルーズapps');assert.equal(NEWS_FILTER_GROUPS.cruise_apps,'クルーズapps');
 const old=prepareNews(NEWS_BETA_ITEMS,{now});const ready=prepareNews([own,...NEWS_BETA_ITEMS],{now});
 assert.equal(ready.length,old.length+1);
 assert.deepEqual(ready.filter(n=>n.category!=='cruise_apps'),old);
 assert.deepEqual(groupNews(ready,'cruise_apps',now).flatMap(([,rows])=>rows),[normalizeNewsItem(own)]);
 for(const category of Object.keys(NEWS_CATEGORIES).filter(c=>c!=='cruise_apps'))assert.equal(ready.filter(n=>n.category===category).length,old.filter(n=>n.category===category).length);
});
test('internal path must be a bundled article, never arbitrary URL/HTML/body from NEWS',()=>{
 assert.deepEqual(normalizeNewsItem(own),own);
 for(const patch of [{articleId:'../../settings'},{articleId:'https://evil.com'},{articleId:'unknown'},{category:'sale'},{sourceName:'Other'},{sourceKind:'media'},{linkType:'javascript'}])assert.equal(normalizeNewsItem({...own,...patch}),null);
 assert.equal(normalizeNewsItem({...own,linkType:'external',sourceUrl:'https://example.com'}),null);
 assert.equal(normalizeNewsItem({...own,body:'untrusted',image:'https://evil.com/x'}).body,undefined);
 assert.equal(articlePath('unknown'),null);assert.equal(parseNewsArticleRoute('#news/cruise-apps/theme-colors/'),'theme-colors');
 for(const route of ['#news/cruise-apps/unknown','#news/cruise-apps/theme-colors/evil','#news/cruise-apps/%3Cscript%3E'])assert.equal(parseNewsArticleRoute(route),null);
});
test('card is internal; external card retains new tab and noreferrer; filters switch',()=>{
 const d=doc();renderNews({documentObject:d,items:[own,NEWS_BETA_ITEMS[0]],mode:'beta',now,clock:()=>now});
 let cards=d.ids['news-content'].all().filter(n=>n.className==='news-card');
 const internal=cards.find(n=>n.href?.startsWith('#news/'));assert.equal(internal.href,articlePath('theme-colors'));assert.equal(internal.target,undefined);
 const external=cards.find(n=>n.target==='_blank');assert.equal(external.href,NEWS_BETA_ITEMS[0].sourceUrl);assert.equal(external.rel,'noopener noreferrer');
 const select=d.ids['news-content'].all().find(n=>n.tagName==='select');assert.ok(select.children.some(n=>n.textContent==='クルーズapps'));
 select.value='cruise_apps';select.listeners.change();assert.equal(d.ids['news-content'].all().filter(n=>n.className==='news-card').length,1);
 select.value='';select.listeners.change();assert.equal(d.ids['news-content'].all().filter(n=>n.className==='news-card').length,2);
});
test('article renders overview/usage, four local images with alt, headings and safe fallback',()=>{
 const d=doc();assert.equal(renderNewsArticle({documentObject:d,hash:articlePath('theme-colors')}),true);
 const nodes=d.ids['news-article-content'].all();assert.deepEqual(nodes.filter(n=>n.tagName==='h2').map(n=>n.textContent),['概要','使い方','4つのテーマを比較']);
 const imgs=nodes.filter(n=>n.tagName==='img');assert.equal(imgs.length,4);
 for(const [i,img] of imgs.entries()){assert.equal(img.alt,NEWS_ARTICLES['theme-colors'].images[i].alt);assert.ok(existsSync(new URL(NEWS_ARTICLES['theme-colors'].images[i].src,import.meta.url)));assert.match(img.src,/assets\/news\/theme-colors\/(dark|charcoal|gray|light)\.jpg\?v=1\.16\.0$/);}
 assert.ok(nodes.some(n=>n.tagName==='a'&&n.href==='#news'));
 for(const hash of ['#news/cruise-apps/nope','#news/cruise-apps/%3Cscript%3E'])assert.equal(renderNewsArticle({documentObject:d,hash}),false);
 assert.equal(d.ids['news-article-title'].textContent,'記事が見つかりません');
 assert.doesNotMatch(readFileSync(new URL('news-article-ui.js',import.meta.url),'utf8'),/innerHTML|insertAdjacentHTML|\bfetch\(/);
});
test('theme update represents all five apps and identifies screenshots as Port examples',()=>{
 const d=doc();renderNewsArticle({documentObject:d,hash:articlePath('theme-colors')});
 assert.equal(d.ids['news-article-title'].textContent,'クルーズapps、4つのカラーテーマに対応');
 assert.equal(own.label,d.ids['news-article-title'].textContent);
 const nodes=d.ids['news-article-content'].all();
 assert.deepEqual(nodes.filter(n=>n.tagName==='li').map(n=>n.textContent),['Cruise Port','音感クルーズ','指板クルーズ','リズムクルーズ','コードクルーズ']);
 assert.ok(nodes.some(n=>n.tagName==='p'&&n.textContent.includes('Cruise Portと4つのクルーズアプリ')));
 assert.ok(nodes.some(n=>n.tagName==='p'&&n.textContent.includes('音感クルーズ・指板クルーズ')&&n.textContent.includes('「決定」')));
 assert.ok(nodes.some(n=>n.tagName==='p'&&n.textContent.includes('指板クルーズでは「共通」タブ')));
 assert.ok(nodes.some(n=>n.tagName==='p'&&n.textContent.startsWith('画像はCruise Portでの表示例です。')));
 assert.deepEqual(nodes.filter(n=>n.tagName==='figcaption').map(n=>n.textContent),['ダーク','チャコール','グレー','ライト']);
 assert.equal(own.publishedAt,'2026-10-01T15:00:00.000Z');
 assert.equal(articlePath('theme-colors'),'#news/cruise-apps/theme-colors');
});
test('direct NEWS URLs survive startup without appending a history entry; both editions include article view',()=>{
 for(const hash of ['#news',articlePath('theme-colors'),'#news/cruise-apps/unknown'])normalizeInitialHome({locationObject:{hash},historyObject:{replaceState(){assert.fail('no redirect/history loop');}}});
 for(const path of ['index.html','pro_9a3943176561/index.html']){const html=readFileSync(new URL(path,import.meta.url),'utf8');assert.match(html,/id="news-article-view"/);assert.match(html,/href="#news">← ニュース一覧/);assert.match(html,/news-article\.css\?v=1\.16\.0/);}
});

test('explicit return replaces detail rather than appending a route (no back loop)',()=>{
 const calls=[],state={keep:true};replaceNewsListRoute({historyObject:{state,replaceState(...args){calls.push(args);}},locationObject:{pathname:'/apps/cruise-port/',search:''}});
 assert.deepEqual(calls,[[state,'','/apps/cruise-port/#news']]);
});

test('four real screenshots have matching JPEG dimensions (no fabricated UI)',()=>{
 for(const image of NEWS_ARTICLES['theme-colors'].images){
  const bytes=readFileSync(new URL(image.src,import.meta.url));assert.equal(bytes.readUInt16BE(0),0xffd8);
  let dimensions=null;
  for(let offset=2;offset+8<bytes.length;){
   assert.equal(bytes[offset],0xff);const marker=bytes[offset+1],length=bytes.readUInt16BE(offset+2);
   if([0xc0,0xc1,0xc2].includes(marker)){dimensions={height:bytes.readUInt16BE(offset+5),width:bytes.readUInt16BE(offset+7)};break;}
   offset+=length+2;
  }
  assert.deepEqual(dimensions,{width:378,height:819});
 }
});
