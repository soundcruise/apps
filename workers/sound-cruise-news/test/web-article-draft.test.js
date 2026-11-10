import test from 'node:test';import assert from 'node:assert/strict';
import {webArticleDraft,saveHint,savedWebDraft} from '../src/web-discovery.js';
import {store,pepper} from './helpers.js';import {SOURCES} from '../src/registry.js';
import {saveAssisted} from '../src/assisted-entry.js';import {operatorDecision,candidateSnapshot} from '../src/operator-review.js';import {handleNewsRequest} from '../src/worker.js';
const now=Date.parse('2026-11-09T00:00:00Z'),actor={type:'human_operator',id:'fixture-human'};
const url='https://jp.yamaha.com/musical-instruments/guitars-basses-amps/explore/topics/2026/fixture.html';
const estimate={category:'アコースティックギター',brand:'Yamaha',product:'TEST-100',event:'新製品を発売',value:'high',priority:'low',relevance:'high',duplicate:'unknown',reason:'公開日不明'};
const hint={url,title:'製品ニュース',estimate_json:JSON.stringify(estimate)};
test('saved AI estimate → draft → explicit human facts → existing decision/Ledger/API',async()=>{
 const s=await store();await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();await s.db.prepare("INSERT INTO source_state(source_id,disabled) VALUES('yamaha',1)").run();
 await saveHint(s.db,{url,title:hint.title,provider:'exa',searchedAt:now},now);await s.db.prepare('UPDATE news_web_hints SET estimate_json=? WHERE url=?').bind(hint.estimate_json,url).run();
 const draft=await savedWebDraft(s.db,url,now);assert.deepEqual(draft,await savedWebDraft(s.db,url,now));assert(draft.headline.includes('TEST-100'));assert.deepEqual(draft.missing,['publishedAt']);assert.equal(draft.fields.publishedAt,'');
 assert.equal((await s.candidates()).length,0);const input={...draft.fields,publishedAt:'2026-11-08',confirmed:true,requestId:'draft-human-confirmation-001'};
 const out=await saveAssisted(s,input,now,SOURCES,pepper,actor);assert(out.validation.valid);assert((await saveAssisted(s,input,now,SOURCES,pepper,actor)).replayed);assert.equal((await s.candidates()).length,1);
 const row=(await s.candidates())[0];assert.equal(JSON.parse(row.facts_provenance).method,'human_official_article_confirmation');
 await operatorDecision(s,{id:row.id,action:'approve',reason:'useful_product',requestId:'draft-human-publication-001',revision:row.review_revision,snapshot:await candidateSnapshot(row),label:out.validation.publishableLabel,category:row.category,publishedAt:row.published_at,checks:{factsChecked:true,relevanceChecked:true,duplicateChecked:true,independentLabelChecked:true}},now,SOURCES,pepper,actor);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,1);
 const api=await handleNewsRequest(new Request('https://news.internal/v1/news'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry:SOURCES,cache:null});assert.equal((await api.json()).items.length,1);
});
test('AI fields do not expand scope, infer dates or silently collapse special events',()=>{
 const conditional=webArticleDraft({...hint,url:'https://www.yamaha.com/ja/news_release/2026/26110601/'});assert.equal(conditional.registrationAllowed,true);assert.equal(conditional.fields.sourceId,'yamaha-newsroom');assert.equal(conditional.usageBasis,'public_facts_conditions_review');assert.equal(conditional.fields.publishedAt,'');const blocked=webArticleDraft({...hint,url:'https://unreviewed.example/news/1'});assert.equal(blocked.registrationAllowed,false);
 assert.equal(webArticleDraft({...hint,estimate_json:'{}'}),null);
 for(const event of ['限定モデル発売','新色を発表','復刻を発売']){const d=webArticleDraft({...hint,estimate_json:JSON.stringify({...estimate,event})});assert(d.headline.includes(event));assert.equal(d.fields.action,'');assert(d.missing.includes('action'));}
 const d=webArticleDraft({...hint,estimate_json:JSON.stringify({...estimate,category:'product_launch'})});assert(d.missing.includes('productType'));assert.equal(d.fields.publishedAt,'');
});

test('a human Topics candidate is reused even with Bot collection OFF',async()=>{
 const {webVerification}=await import('../src/web-verification.js');const s=await store();await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();await s.db.prepare("INSERT INTO source_state(source_id,disabled) VALUES('yamaha',1)").run();
 const draft=webArticleDraft(hint);const out=await saveAssisted(s,{...draft.fields,publishedAt:'2026-11-08',confirmed:true,requestId:'reused-human-proposal-001'},now,SOURCES,pepper,actor);
 const v=await webVerification({NEWS_DB:s.db,NEWS_HEADLINE_PEPPER:pepper},now)(url);assert.equal(v.candidateId,out.id);assert.equal(v.path,'A');assert.equal((await s.candidates()).length,1);
});
