import test from 'node:test';
import assert from 'node:assert/strict';
import inputs from './fixtures/web-source-review-inputs.json' with {type:'json'};
import {store,pepper} from './helpers.js';
import {listWebHints,saveHint} from '../src/web-discovery.js';
import {assistedDraftForUrl} from '../src/candidate-draft.js';
import {decideAssisted,FINAL_CONFIRMATION} from '../src/assisted-decision.js';
import {SOURCES,legalGate} from '../src/registry.js';
import {assessAutomatic} from '../src/automatic.js';
import {handleNewsRequest} from '../src/worker.js';

const now=Date.parse('2026-11-18T13:00:00Z');
const actor={type:'human_operator',id:'isolated-source-review'};
const hints=s=>listWebHints({NEWS_DB:s.db,NEWS_WEB_ENABLED:'true'},now);
async function seed(s,r){
 await saveHint(s.db,{url:r.url,title:r.title,provider:'exa',searchedAt:now},now);
 await s.db.prepare('UPDATE news_web_hints SET estimate_json=?,search_meta_json=? WHERE url=?')
  .bind(r.estimate_json,r.search_meta_json,r.url).run();
}
test('three preserved hints reach two primary articles through explicit human confirmation, Ledger and public API',async()=>{
 const s=await store();
 await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();
 for(const r of inputs.filter(r=>!r.url.includes('buomo-guitars')))await seed(s,r);
 const snapshot=()=>s.db.prepare('SELECT * FROM news_web_hints ORDER BY url').all();
 const before=await snapshot();
 const {items}=await hints(s);
 const urls=new Set(items.map(i=>i.humanEntry.url));
 assert.equal(items.length,3);assert.equal(urls.size,2);
 for(const url of urls){
  const d=await assistedDraftForUrl(s,url,now);
  const source=SOURCES.find(r=>r.id===d.fields.sourceId);
  assert.equal(legalGate(source,{},now,'production',SOURCES),'collection_off');
  assert.equal(d.humanConfirmed,false);assert.equal(d.formalFacts,false);
  assert.deepEqual(d.missing,[]);
  const input={entry:{...d.fields,confirmed:true,conditionsConfirmed:false},confirmation:FINAL_CONFIRMATION,action:'approve',reason:'useful_product',requestId:crypto.randomUUID()};
  assert.equal((await decideAssisted(s,input,now,SOURCES,pepper,actor)).completed,false);
  input.entry.conditionsConfirmed=true;
  assert.equal((await decideAssisted(s,input,now,SOURCES,pepper,actor)).completed,true);
  assert.equal((await decideAssisted(s,input,now,SOURCES,pepper,actor)).replayed,true);
  assert.equal((await decideAssisted(s,{...input,requestId:crypto.randomUUID()},now,SOURCES,pepper,actor)).completed,false);
 }
 const publicList=await handleNewsRequest(new Request('https://isolated.test/v1/news'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry:SOURCES,cache:null});
 const articles=(await publicList.json()).items;assert.equal(articles.length,2);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,2);
 for(const row of await s.candidates()){
  assert(urls.has(row.source_url));
  assert.equal(JSON.parse(row.facts_provenance).method,'human_public_facts_confirmation');
  assert.equal((await assessAutomatic(s,row,SOURCES,now,pepper)).eligible,false);
 }
 assert.deepEqual(await snapshot(),before);
 for(const item of (await hints(s)).items){assert(!item.humanEntry);assert.equal(item.primaryReview.existingCandidate.status,'approved');assert.equal(item.webReview.reason,'primary_already_decided');assert.equal(item.webReview.queue,'low');}
});
test('a changed discovery headline or blocked primary cannot offer the reviewed form from a secondary card',async()=>{
 const s=await store(),r=inputs.find(r=>r.url.includes('computermusic.jp'));
 await seed(s,{...r,title:r.title+' 続報'});
 assert(!(await hints(s)).items[0].humanEntry);
 await s.db.prepare('UPDATE news_web_hints SET title=? WHERE url=?').bind(r.title,r.url).run();
 await s.db.prepare("INSERT INTO source_state(source_id,publication_blocked) VALUES('audient',1)").run();
 assert(!(await hints(s)).items[0].humanEntry);
});
