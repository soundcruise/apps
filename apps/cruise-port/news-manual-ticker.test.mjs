import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {renderNews,stopNewsUpdates} from './news-ui.js';

class Target {
    listeners = new Map();
    addEventListener(type, fn) { const list=this.listeners.get(type)||new Set();list.add(fn);this.listeners.set(type,list); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    dispatch(type, extra={}) { const event={preventDefault(){this.prevented=true;},...extra};for(const fn of this.listeners.get(type)||[])fn(event);return event; }
}
class Element extends Target {
    constructor(tag) { super();this.tagName=tag;this.children=[];this.attrs={}; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children=children; }
    setAttribute(name,value) { this.attrs[name]=value; }
}
function setup(reduced=true) {
    const motion=Object.assign(new Target(),{matches:reduced});
    const view=Object.assign(new Target(),{matchMedia:()=>motion,setTimeout:()=>1,clearTimeout(){}});
    const ids=Object.fromEntries(['news-ticker','news-ticker-controls','news-entry','news-content'].map(id=>[id,new Element('div')]));
    const doc=Object.assign(new Target(),{defaultView:view,getElementById:id=>ids[id],createElement:tag=>new Element(tag)});
    const replay=JSON.parse(readFileSync(new URL('./test-fixtures/news-home-20261112.json',import.meta.url)));
    const items=replay.items.map(i=>({...i,topicKey:i.id,createdAt:i.publishedAt,updatedAt:i.publishedAt,sourceSafety:'safe',sourceKind:'official',manualReviewStatus:'approved'}));
    const draw=(data=items)=>renderNews({documentObject:doc,items:data,mode:'on',now:Date.parse(replay.at)});
    draw();return {ids,motion,doc,draw,items};
}
const current=ids=>ids['news-ticker'].children[1].children[0].children.findIndex(n=>n.attrs['data-current']==='true');

test('non-NEWS stylesheet bytes remain identical to the fetched production 1.34.0',()=>{
    const css=readFileSync(new URL('./style.css',import.meta.url),'utf8');
    const outsideNews=css.replace(/\.news-heading \{[\s\S]*?(?=\n\/\* ═══ Color themes)/,'<NEWS>');
    assert.equal(createHash('sha256').update(outsideNews).digest('hex'),'87c5b3af2443f28ac1f737a7a8d4cd61cfa1a46e06bc99207edc05b7b102ca72');
});

test('touch/button activation visits all five in publication order, wraps, and keeps the NEWS link',()=>{
    const {ids,items}=setup(),controls=ids['news-ticker-controls'],next=controls.children[2],previous=controls.children[0];
    assert.equal(controls.hidden,false);
    for(let index=0;index<5;index++){
        assert.equal(current(ids),index);
        assert.equal(controls.children[1].textContent,`${index+1}/5`);
        assert.ok(ids['news-ticker'].attrs['aria-label'].endsWith(items[index].label));
        next.dispatch('click');
    }
    assert.equal(current(ids),0);previous.dispatch('click');assert.equal(current(ids),4);
    for(const path of ['index.html','pro_9a3943176561/index.html'])assert.match(readFileSync(new URL(path,import.meta.url),'utf8'),/id="news-ticker"[^>]*href="#news"/);
});
test('keyboard navigation supports arrows, Home and End without activating the list link',()=>{
    const {ids}=setup(),ticker=ids['news-ticker'],controls=ids['news-ticker-controls'];
    assert.equal(ticker.dispatch('keydown',{key:'ArrowRight'}).prevented,true);assert.equal(current(ids),1);
    controls.dispatch('keydown',{key:'End'});assert.equal(current(ids),4);
    ticker.dispatch('keydown',{key:'Home'});assert.equal(current(ids),0);
    controls.dispatch('keydown',{key:'ArrowLeft'});assert.equal(current(ids),4);
    assert.equal(ticker.dispatch('keydown',{key:'Enter'}).prevented,undefined);
});
test('normal motion keeps all five track entries and ignores manual navigation; preference changes need no reload',()=>{
    const {ids,motion}=setup(false),ticker=ids['news-ticker'],controls=ids['news-ticker-controls'];
    assert.equal(controls.hidden,true);assert.equal(ticker.children[1].children[0].children.length,5);
    assert.equal(ticker.dispatch('keydown',{key:'End'}).prevented,undefined);assert.equal(current(ids),0);
    motion.matches=true;motion.dispatch('change');controls.children[2].dispatch('click');assert.equal(current(ids),1);
    motion.matches=false;motion.dispatch('change');assert.equal(controls.hidden,true);assert.ok(!ticker.attrs['aria-label'].includes('2/5'));
    const css=readFileSync(new URL('./style.css',import.meta.url),'utf8');
    assert.match(css,/animation: news-scroll 75s linear infinite/);assert.match(css,/\.news-ticker \{[^}]*height: 34px/);
});
test('rerender and stop remove listeners; no duplicate steps or controls after expiry/empty/off',()=>{
    const {ids,motion,doc,draw}=setup();draw();draw();
    assert.equal(motion.listeners.get('change').size,1);assert.equal(ids['news-ticker-controls'].listeners.get('keydown').size,1);
    ids['news-ticker-controls'].dispatch('keydown',{key:'ArrowRight'});assert.equal(current(ids),1);
    draw([]);assert.equal(ids['news-ticker'].hidden,true);assert.equal(ids['news-ticker-controls'].hidden,true);assert.equal(motion.listeners.get('change').size,0);
    draw();stopNewsUpdates(doc);assert.equal(motion.listeners.get('change').size,0);assert.equal(ids['news-ticker'].listeners.get('keydown').size,0);
    renderNews({documentObject:doc,items:[],mode:'off'});assert.equal(ids['news-ticker-controls'].hidden,true);
});
