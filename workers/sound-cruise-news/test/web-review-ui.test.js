import test from 'node:test';import assert from 'node:assert/strict';import {renderWebReviewCard} from '../operator-ui/web-discovery.js';
class Node{constructor(tag,text=''){this.tagName=tag;this.children=[];this.textContent=text;this.dataset={};this.events={};this.attributes={};}append(...x){this.children.push(...x);}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,f){this.events[k]=f;}}
const doc={createElement:t=>new Node(t)},all=n=>[n,...n.children.flatMap(all)],base={url:'https://publisher.example/article',title:'ギター記事',snapshot:'a'.repeat(64),articleDraft:{headline:'工房「AG-1」 — 限定仕様（未確認）',missing:['publishedAt']},webReview:{queue:'judgment'},searchMetadata:{lastModifiedHint:'2026-11-11T00:00:00Z'}};
test('unsupported-source Web card stays visible with original/draft/missing facts and no publication button',()=>{
 const card=renderWebReviewCard(doc,base),nodes=all(card);assert(nodes.some(n=>n.tagName==='h3'&&n.textContent.includes('AG-1')));assert(nodes.some(n=>n.textContent==='publisher.example · 公開日 未確認'));const b=nodes.find(n=>n.textContent==='記事を確認して判断');assert(b);b.events.click();assert(nodes.some(n=>n.hidden===false&&n.tagName==='section'));assert(!nodes.some(n=>n.textContent==='掲載する'));
 assert(nodes.some(n=>n.textContent.includes('正式保存に未対応')));assert.equal(nodes.find(n=>n.tagName==='a').href,base.url);
});
test('supported-source card routes to existing assisted entry without confirmations or formal state',()=>{
 const nodes=all(renderWebReviewCard(doc,{...base,humanEntry:{url:base.url}})),a=nodes.find(n=>n.textContent==='記事を確認して判断');assert.equal(a.href,'/?assistedUrl='+encodeURIComponent(base.url));assert(!a.href.includes('confirmed'));assert(!nodes.some(n=>n.checked));
});
test('dismiss/defer only call visibility action; uncertain response reuses request ID on explicit retry',async()=>{
 const calls=[],nodes=all(renderWebReviewCard(doc,base,{change:async i=>{calls.push({...i});if(calls.length===1)throw Error('unknown result');}})),defer=nodes.find(n=>n.textContent==='見送る');await defer.events.click();await defer.events.click();assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(calls[0].action,'defer');assert.deepEqual(Object.keys(calls[0]).sort(),['action','requestId','snapshot','url']);
 const restore=all(renderWebReviewCard(doc,{...base,webReview:{queue:'low',reason:'operator_deferred'}},{change:async i=>calls.push(i)})).find(n=>n.textContent==='審査へ戻す');await restore.events.click();assert.equal(calls.at(-1).action,'review');
 const blocked=all(renderWebReviewCard(doc,{...base,webReview:{queue:'low',reason:'candidate_takedown',blocked:true}},{change:()=>assert.fail()}));assert(!blocked.some(n=>n.textContent==='審査へ戻す'));
});
