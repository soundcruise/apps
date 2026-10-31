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
