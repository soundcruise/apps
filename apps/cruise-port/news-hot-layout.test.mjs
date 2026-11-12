import test from 'node:test';
import assert from 'node:assert/strict';
import {renderNews} from './news-ui.js';
import {readFileSync} from 'node:fs';

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
function render(items,at=now) {
    const ids=Object.fromEntries(['news-ticker','news-entry','news-content'].map(id=>[id,new Node('div')]));
    renderNews({documentObject:{getElementById:id=>ids[id],createElement:tag=>new Node(tag)},items,mode:'on',now:at});
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

test('current public replay renders five chronological home headlines and keeps Acompass HOT in the full NEWS list',()=>{
    const replay=JSON.parse(readFileSync(new URL('./test-fixtures/news-home-20261112.json',import.meta.url)));
    const data=replay.items.map(i=>({...i,topicKey:i.id,createdAt:i.publishedAt,updatedAt:i.publishedAt,sourceSafety:'safe',sourceKind:'official',manualReviewStatus:'approved'}));
    const before=structuredClone(data),doc=render(data,Date.parse(replay.at));
    const track=doc['news-ticker'].all().find(n=>n.className==='news-ticker-track');
    assert.deepEqual(track.children.map(n=>n.textContent),data.slice(0,5).map(i=>i.label));
    const acompass=doc['news-content'].all().find(n=>n.className==='news-card'&&n.href===data[5].sourceUrl);
    assert.equal(acompass.children[1].textContent,data[5].label);
    assert.equal(acompass.all().find(n=>n.className==='news-hot').textContent,'🔥 ホット');
    assert.deepEqual(data,before);
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

test('reduced-motion first-only presentation retains the newest day, not only an older hot item',()=>{
    const data=[{...item('old',true,0),label:'旧モデルの限定仕様を発表',publishedAt:'2026-10-20T15:00:00Z'},
        {...item('new',false,1),label:'ギターの試奏記事を公開',publishedAt:'2026-10-22T15:00:00Z'}];
    const doc=render(data),track=doc['news-ticker'].all().find(n=>n.className==='news-ticker-track');
    assert.equal(track.children[0].textContent,'ギターの試奏記事を公開');
    assert.equal(track.children[1].textContent,'🔥 旧モデルの限定仕様を発表');
    const css=readFileSync(new URL('./style.css',import.meta.url),'utf8');
    assert.match(css,/@media \(prefers-reduced-motion: reduce\) \{\s*\.news-ticker-track \{ animation: none;/);
    assert.match(css,/\.news-ticker-track > span:not\(:first-child\) \{ display: none; \}/);
});
