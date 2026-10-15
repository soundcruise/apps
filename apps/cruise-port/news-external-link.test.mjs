import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newsOriginalArticleHref as href} from './news-external-link.js';
import {renderNews} from './news-ui.js';
import {loadNews} from './news-provider.js';
import {prepareNews} from './news-data.js';
const params={utm_source:'soundcruise',utm_medium:'referral',utm_campaign:'cruise_port'};
const pb='https://www.ikebe-gakki-pb.com/new_product/172649/';
const event='https://www.ikebe-gakki.com/blog/20261024-eg-workshop/';
function tracked(original){const u=new URL(href({sourceUrl:original}));for(const [k,v] of Object.entries(params))assert.deepEqual(u.searchParams.getAll(k),[v]);return u;}
for(const [name,url] of [['PB',pb],['Events',event],['legacy product blog','https://www.ikebe-gakki.com/blog/gibson-lrbaggs_hifi-dna/']]){
 test(`${name}: exact publisher tracking, unchanged origin/path`,()=>{const u=tracked(url),original=new URL(url);assert.equal(u.origin,original.origin);assert.equal(u.pathname,original.pathname);});
}
test('existing query, encoded values and fragment survive before the fragment',()=>{
 const u=tracked(pb+'?q=%E9%9F%B3%E6%A5%BD%20%26%20%E6%A5%BD%E5%99%A8&ref=a%2Bb#spec');
 assert.equal(u.searchParams.get('q'),'音楽 & 楽器');assert.equal(u.searchParams.get('ref'),'a+b');assert.equal(u.hash,'#spec');assert.ok(u.href.indexOf('?')<u.href.indexOf('#'));
});
test('same UTM is idempotent, conflicts and duplicate/case variants become the three specified values',()=>{
 const existing=pb+'?utm_source=old&utm_source=older&UTM_SOURCE=upper&utm_medium=email&utm_campaign=x&other=keep';
 const u=tracked(existing);assert.equal(u.searchParams.has('UTM_SOURCE'),false);assert.equal(u.searchParams.get('other'),'keep');assert.equal(href({sourceUrl:u.href}),u.href);
});
test('other publishers, lookalike hosts and unsupported surfaces are unchanged',()=>{
 for(const url of ['https://www.shimamura.co.jp/update/2026/10/94705/','https://acousticguitarmagazine.jp/news/item/','https://www.ikebe-gakki.com.evil.example/blog/test/','https://evil.example/www.ikebe-gakki.com/blog/test/','https://www.ikebe-gakki.com/','https://www.ikebe-gakki.com/Page/agreement.aspx','https://www.ikebe-gakki.com/blog/category/event/','https://www.ikebe-gakki.com/blog/tag/guitar/','https://www.ikebe-gakki-pb.com/new_product/','https://www.ikebe-gakki-pb.com/new_product/category/amp/','https://www.ikebe-gakki-pb.com/other/123/'])assert.equal(href({sourceUrl:url}),url);
});
test('invalid URL, credentials and unsafe protocols fail closed',()=>{
 for(const sourceUrl of [undefined,null,'bad','//www.ikebe-gakki.com/blog/test/','javascript:alert(1)','data:text/html,test','http://www.ikebe-gakki.com/blog/test/','https://u:p@www.ikebe-gakki.com/blog/test/','https://www.ikebe-gakki.com:8443/blog/test/','https://www.ikebe-gakki.com/\nblog/test/'])assert.equal(href({sourceUrl}),null);
});
class Node{constructor(tag){this.tagName=tag;this.children=[];this.textContent='';this.listeners={};this.attrs={};this.hidden=false;}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,f){this.listeners[k]=f;}all(){return this.children.flatMap(x=>[x,...x.all()]);}}
function doc(){const ids=Object.fromEntries(['news-ticker','news-entry','news-content'].map(k=>[k,new Node('div')]));ids['news-ticker'].href='#news';return {ids,getElementById:k=>ids[k],createElement:t=>new Node(t)};}
const now=Date.parse('2026-10-16T01:00:00Z');
const record=(id,url)=>Object.freeze({id,sourceUrl:url,sourceName:id==='event'?'池部楽器 Events':'池部楽器',label:'独自の短い製品見出し '+id,publishedAt:'2026-10-15T00:00:00Z',category:'amps_effects',topicKey:id,createdAt:'2026-10-15T00:00:00Z',updatedAt:'2026-10-15T00:00:00Z',sourceKind:'retailer_editorial',sourceSafety:'safe',manualReviewStatus:'approved'});
test('rendered cards alone receive tracking; IDs, dates, dedupe, headlines, canonical and ticker route stay unchanged',()=>{
 const items=Object.freeze([record('pb',pb),record('event',event),record('other','https://example.org/article')]);const before=JSON.stringify(items),prepared=prepareNews(items,{now});
 for(const edition of ['Standard','Pro']){const d=doc();renderNews({documentObject:d,items,now,mode:'on'});const cards=d.ids['news-content'].all().filter(n=>n.className==='news-card');assert.equal(cards.length,3,edition);for(const c of cards){assert.equal(c.target,'_blank');assert.equal(c.rel,'noopener noreferrer');}assert.equal(cards.filter(c=>c.href.includes('utm_source=soundcruise')).length,2);assert.ok(cards.some(c=>c.href==='https://example.org/article'));assert.equal(d.ids['news-ticker'].href,'#news');assert.equal(d.ids['news-ticker'].hidden,false);assert.ok(d.ids['news-ticker'].all().some(n=>n.textContent===items[0].label));const select=d.ids['news-content'].all().find(n=>n.tagName==='select');select.value='amps_effects';select.listeners.change();assert.equal(d.ids['news-content'].all().filter(n=>n.className==='news-card').length,3);}
 assert.equal(JSON.stringify(items),before);assert.deepEqual(prepareNews(items,{now}),prepared);
});
test('API projection preserves original source URL and human publication gate; future valid articles use same resolver',async()=>{
 const raw={id:'future',label:'将来の独自見出し',sourceName:'池部楽器',sourceUrl:pb,publishedAt:'2026-10-15T00:00:00Z',category:'amps_effects',publishable:true};
 const [item]=await loadNews({provider:'api',transport:async()=>({contractVersion:1,items:[raw]})});const before=JSON.stringify(item);tracked(item.sourceUrl);assert.equal(item.sourceUrl,pb);assert.equal(item.id,'future');assert.equal(item.publishedAt,raw.publishedAt);assert.equal(item.manualReviewStatus,'approved');assert.equal(JSON.stringify(item),before);
 await assert.rejects(loadNews({provider:'api',transport:async()=>({contractVersion:1,items:[{...raw,publishable:false}]})}));
});
test('both editions use the same NEWS renderer; internal article paths and ticker route remain internal',()=>{
 for(const file of ['index.html','pro_9a3943176561/index.html'])assert.match(readFileSync(new URL(file,import.meta.url),'utf8'),/id="news-ticker"[^>]+href="#news"/);
 const code=readFileSync(new URL('news-ui.js',import.meta.url),'utf8');assert.match(code,/item.linkType === 'internal'\) link.href = articlePath\(item.articleId\)/);assert.doesNotMatch(code,/fetch\(|innerHTML/);
});
