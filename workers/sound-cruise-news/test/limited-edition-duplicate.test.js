import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicatePredicate} from '../src/decision-policy.js';
import {setup,put} from './operator-case.js';

const signal={action:'limited_edition',basis:'verified_primary_article',signal:'explicit_limited_edition'};
const input={brand:'Fender',product:'Limited Artist Testcaster',models:['Limited Artist Testcaster'],version:null,category:'electric_guitar_bass',identifierBasis:'explicit_shimamura_product_fields',productEvent:signal};
const row={id:'incoming',source_url:'https://example.test/incoming',normalized_url:'https://example.test/incoming',topic_key:'incoming',category:'electric_guitar_bass',event_type:'new_product',published_at:'2026-10-27T15:00:00.000Z'};
async function matching(overrides={}){
 const s=await setup();await put(s,'existing');
 const f={brand:'Fender MEX',product:'Limited Edition Artist Testcaster',models:['Limited Edition Artist Testcaster'],version:null,category:'electric_guitar_bass',identifierBasis:'explicit_article_product_fields',productEvent:signal,...overrides};
 await s.db.prepare("UPDATE candidate_items SET review_status='approved',category='electric_guitar_bass',event_type='new_product',published_at=?,product_facts=? WHERE id='existing'").bind('2026-10-27T15:00:00.000Z',JSON.stringify(f)).run();
 const p=duplicatePredicate(row,input);return (await s.db.prepare('SELECT d.id FROM candidate_items d WHERE '+p.sql).bind(...p.args).all()).results.length;
}
test('same-day reviewed brand and limited-edition wording variants match',async()=>assert.equal(await matching(),1));
test('reviewed limited-edition variants match in the reverse arrival order',async()=>{
 const s=await setup();await put(s,'existing');
 await s.db.prepare("UPDATE candidate_items SET review_status='approved',category='electric_guitar_bass',event_type='new_product',published_at=?,product_facts=? WHERE id='existing'").bind(row.published_at,JSON.stringify(input)).run();
 const incoming={...input,brand:'Fender MEX',product:'Limited Edition Artist Testcaster',models:['Limited Edition Artist Testcaster'],identifierBasis:'explicit_article_product_fields'};
 const p=duplicatePredicate(row,incoming);assert.equal((await s.db.prepare('SELECT d.id FROM candidate_items d WHERE '+p.sql).bind(...p.args).all()).results.length,1);
});
for(const [name,change] of Object.entries({otherBrand:{brand:'Another Brand'},otherModel:{product:'Limited Edition Artist Testcaster Blue'},otherVersion:{version:'2'},otherAction:{productEvent:{...signal,action:'new_color',signal:'explicit_new_color'}},unverified:{identifierBasis:'ai_guess'}})){
 test('different '+name+' stays distinct',async()=>assert.equal(await matching(change),0));
}
