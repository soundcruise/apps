import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSearchHints} from '../src/web-discovery.js';
test('untrusted search hints are bounded, deduplicated, and never treated as facts',()=>{
 const items=[{url:'https://example.com/model#one',title:'新製品'},{url:'https://example.com/model#two',title:'duplicate'},{url:'javascript:alert(1)',title:'bad'},{url:'https://u:p@example.com/',title:'bad'}];
 const result=normalizeSearchHints(items,{provider:'exa',searchedAt:1});
 assert.equal(result.length,1); assert.equal(result[0].publishedAt,null); assert.equal(result[0].status,'unreviewed');
 assert.throws(()=>normalizeSearchHints(Array(11).fill({}),{provider:'exa',searchedAt:1}));
});

test('model estimate schema is closed and rejects invented states',async()=>{
 const {validateEstimate}=await import('../src/web-discovery.js');
 const e={category:'acoustic',brand:'unknown',product:'unknown',event:'launch',value:'medium',priority:'high',relevance:'high',duplicate:'unknown',reason:'needs review'};
 assert.deepEqual(validateEstimate(e),e);
 assert.throws(()=>validateEstimate({...e,duplicate:'none'}));
 assert.throws(()=>validateEstimate({...e,formalFacts:true}));
});

test('daily rotation and fenced JSON preserve Japanese and reject oversized output',async()=>{
 const {rotatedQueries,DEFAULT_QUERIES,parseModelJson,discoveryConfig}=await import('../src/web-discovery.js');
 const now=Date.parse('2026-11-01T00:00:00+09:00');
 assert.notDeepEqual(rotatedQueries(DEFAULT_QUERIES,now),rotatedQueries(DEFAULT_QUERIES,now+86400000));
 assert.equal(rotatedQueries(DEFAULT_QUERIES,now).length,3);
 assert.deepEqual(parseModelJson('```json\n[{"brand":"工房"}]\n```'),[{brand:'工房'}]);
 assert.throws(()=>parseModelJson('```json\nnot-json\n```'));assert.throws(()=>parseModelJson('あ'.repeat(7000)));
 assert.throws(()=>discoveryConfig({NEWS_WEB_ENABLED:'true',NEWS_WEB_DAILY_LIMIT:'6'}));
});

test('Qwen structured array is accepted and oversized arrays are refused',async()=>{
 const {llmAdapter}=await import('../src/web-discovery.js');
 const item={category:'アコギ',brand:'工房',product:'試作',event:'新製品',value:'high',priority:'high',relevance:'high',duplicate:'unknown',reason:'要確認'};
 const ai={run:async()=>({response:[item]})};assert.deepEqual(await llmAdapter(ai,'@cf/test')([]),[item]);
 await assert.rejects(llmAdapter({run:async()=>({response:[{reason:'あ'.repeat(7000)}]})},'@cf/test')([]));
});
