import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {llmAdapter,validateEstimate} from '../src/web-discovery.js';
import {runWebDiscovery,listWebHints} from '../src/web-discovery.js';
import {store} from './helpers.js';
const inputs=JSON.parse(await readFile(new URL('./fixtures/gemma4-acceptance-inputs.json',import.meta.url))).cases;
const retained=JSON.parse(await readFile(new URL('./fixtures/gemma4-acceptance-responses.json',import.meta.url))).cases;
const model='@cf/google/gemma-4-26b-a4b-it';
const estimate={category:'acoustic_guitar',brand:'不明',product:'不明',event:'unknown',value:'unknown',priority:'low',relevance:'unknown',duplicate:'unknown',reason:'公開日と製品仕様の正式確認が必要'};

test('Gemma per-model envelope, thinking OFF, token cap, and explicit unverified dates',async()=>{
 for(const c of inputs){
  let calls=0;
  const out=await llmAdapter({run:async(name,p)=>{
   calls++;assert.equal(name,model);assert.equal(p.max_completion_tokens,1500);assert.equal(p.max_tokens,undefined);
   assert.deepEqual(p.chat_template_kwargs,{enable_thinking:false});
   assert.equal(p.response_format.json_schema.name,'news_hint_estimates');assert.equal(p.response_format.json_schema.strict,true);
   const schema=p.response_format.json_schema.schema;assert.equal(schema.properties.items.minItems,1);assert.equal(schema.properties.items.maxItems,1);
   assert.equal(schema.properties.items.items.required.length,9);assert.equal(schema.properties.items.items.additionalProperties,false);
   const input=JSON.parse(p.messages[1].content)[0];assert.equal(input.dateStatus,'unverified_hints_only');assert.equal(input.searchedAt,'2026-11-08T00:00:00.000Z');
   if(c.id==='ja_old_article'){assert.equal(input.publicationDateHint,'2022-08-12');assert.equal(input.lastModifiedHint,'2026-11-06T01:00:00Z');}
   if(c.id==='ja_useful_unknown_date'){assert.equal(input.publicationDateHint,null);assert.equal(input.lastModifiedHint,null);}
   assert(!JSON.stringify(input).includes('expected'));assert(!JSON.stringify(input).includes('basis'));
   return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[estimate]})}}]};
  }},model)([c.input]);
  assert.equal(calls,1);assert.deepEqual(out.map(validateEstimate),[estimate]);
 }
});

test('invalid metadata cannot become a date, formal proof and private fields never enter the model',async()=>{
 const h={...inputs[0].input,search_meta_json:JSON.stringify({publishedAtHint:'2026-02-30',lastModifiedHint:'secret',verification:{publishedAt:'2026-11-06',candidateId:'PRIVATE'},body:'NEVER_SEND'}),product_facts:'NEVER_SEND',reviewed_by:'PRIVATE'};
 await llmAdapter({run:async(_,p)=>{const t=p.messages[1].content;assert(!t.includes('PRIVATE'));assert(!t.includes('NEVER_SEND'));const i=JSON.parse(t)[0];assert.equal(i.publicationDateHint,null);assert.equal(i.lastModifiedHint,null);return {response:{items:[estimate]}};}},model)([h]);
});

test('Gemma refuses truncated/refused/invalid responses without another call or model',async()=>{
 for(const response of [{choices:[{finish_reason:'length',message:{content:'{"items":['}}]},{choices:[{finish_reason:'stop',message:{refusal:'no',content:null}}]},{choices:[{finish_reason:'stop',message:{content:'not JSON'}}]}]){
  let calls=0;await assert.rejects(llmAdapter({run:async name=>{calls++;assert.equal(name,model);return response;}},model)([inputs[0].input]));assert.equal(calls,1);
 }
});

test('all six retained real responses replay through the adapter offline without new inference',async()=>{
 for(const c of retained){let calls=0;const input=inputs.find(x=>x.id===c.id);
  const result=await llmAdapter({run:async name=>{calls++;assert.equal(name,model);return c.response;}},model)([input.input]);
  assert.equal(calls,1);assert.equal(result.length,1);assert.deepEqual(result.map(validateEstimate),JSON.parse(c.response.choices[0].message.content).items);
  assert.match(result[0].reason,/[\u3040-\u30ff\u3400-\u9fff]/u);
 }
});

test('a captured high-priority estimate cannot bypass unverified-date limits or create formal NEWS',async()=>{
 const s=await store(),at=Date.parse('2026-11-08T00:00:00Z'),input=inputs[0].input;
 const high=JSON.parse(retained[0].response.choices[0].message.content).items[0];assert.equal(high.priority,'high');
 // Adversarial offline replay: use the captured high estimate with publication
 // removed. It does NOT claim the real model saw this changed input.
 await runWebDiscovery({NEWS_DB:s.db,NEWS_WEB_ENABLED:'true',NEWS_WEB_QUERIES:'["mock"]'},at,{search:async()=>[{url:input.url,title:input.title,lastModifiedDate:'2026-11-06T01:00:00Z'}],classify:async()=>[high]});
 const hint=(await listWebHints({NEWS_DB:s.db,NEWS_WEB_ENABLED:'true'},at)).items[0];
 assert.equal(hint.estimate.priority,'low');assert.equal(hint.status,'hold');assert.equal(hint.reason,'publication_verification_pending');assert.equal(hint.publishedAt,null);assert.equal(hint.verification.path,'C');
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM candidate_items').first()).n,0);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
});
