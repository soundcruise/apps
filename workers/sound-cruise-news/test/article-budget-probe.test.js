import test from 'node:test';import assert from 'node:assert/strict';
import {store} from './helpers.js';import {recoveryBudget} from '../src/recovery-budget.js';
const now=Date.parse('2026-11-06T09:00:00+09:00');
async function record(s,id,outcome='facts_extraction_incomplete',at=now-1000){await s.db.prepare('INSERT INTO news_facts_sources(source_id,lease_token,lease_until,checked_at,outcome) VALUES(?,?,?,?,?)').bind(id,'fixture-token',0,at,outcome).run();}
test('AGM counts actual detail requests from the shared cache, including failures',async()=>{
 const s=await store(),source={id:'agm'};
 await record(s,'agm:maintenance-probe:2026-11-06','maintenance_robots_restored');
 await record(s,'agm:article:robots-only','facts_daily_budget_deferred');
 let budget=await recoveryBudget(s,source,now);
 assert.equal(budget.used,0);
 assert.equal(budget.recoveryUsed,0);
 await s.db.prepare('INSERT INTO news_agm_article_cache(canonical_url,attempted_at) VALUES(?,?)').bind('https://acousticguitarmagazine.jp/gears/2026-1106-fixture/',now-2000).run();
 budget=await recoveryBudget(s,source,now);
 assert.equal(budget.used,1);
 assert.equal(budget.limit,9);
 assert.equal(budget.nextAt,Date.parse('2026-11-07T00:00:00+09:00'));
});
test('Shimamura keeps its probe without consuming an article slot',async()=>{
 const s=await store(),source={id:'shimamura',dailyPrimaryArticleLimit:1};
 await record(s,'shimamura:maintenance-probe:2026-11-06','maintenance_robots_restored');
 const afterProbe=await recoveryBudget(s,source,now);
 assert.equal(afterProbe.used,0);
 assert.equal(afterProbe.recoveryUsed,0);
 await record(s,'shimamura:article:failed');
 assert.equal((await recoveryBudget(s,source,now)).used,1);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_facts_sources').first()).n,2);
});
test('failed probes are not articles; failed real attempts and recovery grants stay accounted',async()=>{const s=await store(),source={id:'shimamura',dailyPrimaryArticleLimit:6};await record(s,'shimamura:maintenance-probe:2026-11-06','maintenance_probe_failed');await record(s,'shimamura:attempt:a');await record(s,'shimamura:recovery:approved');await record(s,'other:maintenance-probe:2026-11-06');const b=await recoveryBudget(s,source,now);assert.equal(b.used,1);assert.equal(b.recoveryUsed,1);assert.equal(b.limit,6);});
