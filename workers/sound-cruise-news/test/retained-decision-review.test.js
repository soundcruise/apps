import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,put,approveInput,source,now} from './operator-case.js';
import {pepper} from './helpers.js';
import {decisionInput,fixtureActor} from './operator-fixtures.js';
import {operatorDecision,reviewQueue} from '../src/operator-review.js';

test('retained decision prevents rediscovery and a second decision on an old collector shell',async()=>{
 const store=await setup();
 const item=await put(store);
 const pending=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first();
 const input=await approveInput(store,item);
 const decide=i=>operatorDecision(store,i,now,[source],pepper,fixtureActor);
 await decide(input);
 await store.db.prepare('DELETE FROM candidate_items WHERE id=?').bind(item.id).run();
 assert.equal(await store.put(item),false);
 assert.equal((await store.candidates()).length,0);

 // Recreate the pre-fix shell found after expiry on production.
 const columns=Object.keys(pending);
 await store.db.prepare(`INSERT INTO candidate_items (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...Object.values(pending)).run();
 assert.equal((await reviewQueue(store)).length,0);
 const reject=await decisionInput(store,{id:item.id,action:'reject',reason:'operator_review'});
 await assert.rejects(decide(reject));
 assert.equal((await store.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,1);
 assert.equal((await decide(input)).decisionId,(await store.db.prepare('SELECT decision_id FROM news_decision_ledger').first()).decision_id);
});
