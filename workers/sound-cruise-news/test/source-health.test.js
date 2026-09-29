import test from 'node:test';
import assert from 'node:assert/strict';
import {NewsStore} from '../src/store.js';
import {healthForOutcome} from '../src/source-health.js';
import {scheduledPurge} from '../src/retention.js';
import {database} from './helpers.js';

const t=Date.parse('2026-09-29T12:00:00Z');
test('source health: healthy to error alerts once, repeat dedupes, recovery is visible',async()=>{
 const store=new NewsStore(database());
 await store.recordHealth({sourceId:'shimamura',status:'healthy',reasonCode:'ok',checkedAt:t,successfulAt:t});
 await store.recordHealth({sourceId:'shimamura',...healthForOutcome('not_modified'),checkedAt:t+1,successfulAt:t+1});
 assert.equal((await store.sourceAlerts()).length,0);
 await store.recordHealth({sourceId:'shimamura',status:'structure_changed',reasonCode:'listing_structure_changed',checkedAt:t+1,failureCount:1});
 await store.recordHealth({sourceId:'shimamura',status:'structure_changed',reasonCode:'listing_structure_changed',checkedAt:t+2,failureCount:2});
 assert.equal((await store.sourceAlerts()).length,1);
 await store.recordHealth({sourceId:'shimamura',status:'healthy',reasonCode:'ok',checkedAt:t+3,successfulAt:t+3});
 const health=(await store.sourceHealth())[0],alerts=await store.sourceAlerts();
 assert.equal(health.status,'healthy');assert.equal(health.last_successful_run_at,t+3);
 assert.equal(alerts.length,2);assert.equal(alerts[0].status,'healthy');
 assert.equal(alerts[1].reason_code,'listing_structure_changed');
 assert.ok(alerts.every(a=>!JSON.stringify(a).includes('<html>')));
});
test('source health: structured reason mapping covers robots, HTTP, 429 and repeated failures',()=>{
 assert.deepEqual(healthForOutcome('robots_changed_review'),{status:'robots_changed',reasonCode:'robots_changed_review'});
 assert.equal(healthForOutcome('robots_unparseable').status,'robots_changed');
 assert.deepEqual(healthForOutcome('http_403'),{status:'http_blocked',reasonCode:'http_403'});
 assert.deepEqual(healthForOutcome('listing_structure_changed'),{status:'structure_changed',reasonCode:'listing_structure_changed'});
 assert.equal(healthForOutcome('listing_too_large').status,'structure_changed');
 assert.equal(healthForOutcome('rate_limited',1).status,'warning');
 assert.equal(healthForOutcome('rate_limited',2).status,'rate_limited');
 assert.equal(healthForOutcome('network_or_internal_error',3).reasonCode,'collector_repeated_failure');
});
test('source health: explicit auto-disable alert and bounded operator projection',async()=>{
 const store=new NewsStore(database());
 await store.recordHealth({sourceId:'shimamura',status:'robots_changed',reasonCode:'robots_changed_review',checkedAt:t});
 await store.alertSourceDisabled('shimamura',t);
 assert.equal((await store.sourceHealth())[0].reason_code,'robots_changed_review');
 assert.equal((await store.sourceAlerts()).length,2);
 assert.equal((await store.sourceAlerts(1)).length,1);
 await assert.rejects(store.recordHealth({sourceId:'shimamura',status:'error',reasonCode:'raw-html-here',checkedAt:t}),/invalid_health_state/);
});
test('source health: failed retention creates an operator alert without storing DB error text',async()=>{
 const db=database(),originalBatch=db.batch;let fail=true;
 db.batch=async statements=>{if(fail){fail=false;throw Error('synthetic secret error text');}return originalBatch(statements);};
 await assert.rejects(scheduledPurge({}, {NEWS_DB:db},{},t),/news_physical_purge_failed/);
 const alerts=await new NewsStore(db).sourceAlerts();
 assert.equal(alerts.length,1);assert.equal(alerts[0].reason_code,'retention_purge_failed');
 assert.ok(!JSON.stringify(alerts).includes('synthetic secret'));
});
