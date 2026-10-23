import test from 'node:test';
import assert from 'node:assert/strict';
import {renderNews} from './news-ui.js';

class Node {
    constructor(tag) { this.tagName=tag;this.children=[];this.textContent='';this.className='';this.attrs={}; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children=nodes; }
    setAttribute(key,value) { this.attrs[key]=value; }
    addEventListener() {}
    all() { return this.children.flatMap(child=>[child,...child.all()]); }
}
const now=Date.parse('2026-10-23T00:00:00Z');
const item=(id,hot,displayOrder)=>({id,topicKey:id,hot,displayOrder,label:'長い独自見出し：アコースティックギターの製品と演奏について紹介',sourceName:'長い出典名のテスト公式サイト',sourceUrl:'https://example.invalid/'+id,publishedAt:'2026-10-21T15:00:00Z',createdAt:'2026-10-22T00:00:00Z',updatedAt:'2026-10-22T00:00:00Z',category:'acoustic_guitar',sourceKind:'official',sourceSafety:'safe',manualReviewStatus:'approved'});
function render(items) {
    const ids=Object.fromEntries(['news-ticker','news-entry','news-content'].map(id=>[id,new Node('div')]));
    renderNews({documentObject:{getElementById:id=>ids[id],createElement:tag=>new Node(tag)},items,mode:'on',now});
    return ids;
}

test('HOT follows source and publication date in the footer; category and headline remain first',()=>{
    const data=[item('hot',true,0)],before=structuredClone(data),doc=render(data);
    const card=doc['news-content'].all().find(n=>n.className==='news-card');
    assert.deepEqual(card.children.map(n=>n.className),['news-category','news-label','news-footer']);
    const footer=card.children[2],metadata=footer.children[0],hot=footer.children[1];
    assert.equal(metadata.className,'news-metadata');
    assert.equal(metadata.children[0].textContent,data[0].sourceName);
    assert.equal(metadata.children[1].tagName,'time');
    assert.equal(metadata.children[1].dateTime,data[0].publishedAt);
    assert.equal(hot.className,'news-hot');assert.equal(hot.textContent,'🔥 ホット');
    assert.equal(hot.attrs['aria-label'],'注目記事');
    assert.equal(card.href,data[0].sourceUrl);assert.equal(card.target,'_blank');
    assert.deepEqual(data,before,'render does not mutate publication data');
});

test('non-HOT cards have no badge placeholder; same-day manual order and ticker HOT remain',()=>{
    const data=[item('plain',false,1),item('hot',true,0)],before=structuredClone(data),doc=render(data);
    const cards=doc['news-content'].all().filter(n=>n.className==='news-card');
    assert.deepEqual(cards.map(c=>c.href),['https://example.invalid/hot','https://example.invalid/plain']);
    assert.equal(cards[1].children[2].children.length,1);
    assert.equal(cards[1].all().some(n=>n.className==='news-hot'),false);
    assert.ok(doc['news-ticker'].all().some(n=>n.textContent==='🔥 '+data[1].label));
    assert.deepEqual(data,before);
});
