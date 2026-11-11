import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createAiUsageD1 } from './ai-usage-fixture.js';
import { AI_BILLING_BOUND, AI_CALL_RESERVE_MICROS, AI_TURN_RESERVE_MICROS,
  AiUsageError, AiContextLimitError, cleanupAiUsage, jstPeriod, normalizeBillableUsage, reserveAiUsage } from '../src/ai-support-usage.js';
import { createWorkersAiProvider } from '../src/ai-support-provider.js';

const NOW = Date.parse('2026-11-07T03:00:00Z');
const KEY = 'synthetic-usage-identity-secret-32-characters';
const setup = () => { const db = createAiUsageD1(); db.raw.exec('UPDATE ai_usage_policy SET usage_verified=1');
  return { db, env: { AI_SUPPORT_USAGE_DB: db, AI_SUPPORT_USAGE_HMAC_KEY: KEY } }; };
const reserve = (env, id = 'synthetic-account-A', now = NOW) => reserveAiUsage(env, id, 'gpt-oss-120b', { now });
const rows = db => db.raw.prepare('SELECT * FROM ai_usage ORDER BY rowid').all();
const providerInput = { messages: [{ role: 'user', content: '同期について' }] };
const runOne = async lease => { await lease.beforeCall(providerInput); lease.record({ prompt_tokens: 100, completion_tokens: 20 }); await lease.finish({ outcome: 'ok' }); };

test('JST day and month reset exactly at local midnight, including leap/year boundaries', () => {
  for (const [before, after, day, month] of [
    ['2026-11-07T14:59:59.999Z', '2026-11-07T15:00:00Z', '2026-11-08', '2026-11'],
    ['2026-11-30T14:59:59.999Z', '2026-11-30T15:00:00Z', '2026-12-01', '2026-12'],
    ['2026-12-31T14:59:59.999Z', '2026-12-31T15:00:00Z', '2027-01-01', '2027-01'],
    ['2028-02-29T14:59:59.999Z', '2028-02-29T15:00:00Z', '2028-03-01', '2028-03']]) {
    const a = jstPeriod(Date.parse(before)), b = jstPeriod(Date.parse(after));
    assert.equal(a.nextDay, Date.parse(after)); assert.equal(b.day, day); assert.equal(b.month, month);
    if (a.month !== b.month) assert.equal(a.nextMonth, Date.parse(after));
  }
});

test('Account day/month quotas are independent, isolated and reset at their JST boundaries', async () => {
  const { db, env } = setup();
  db.raw.exec('UPDATE ai_usage_policy SET account_daily=2, account_monthly=3');
  await runOne(await reserve(env)); await runOne(await reserve(env));
  assert.equal((await reserve(env)).code, 'ai_account_daily_limit');
  await runOne(await reserve(env, 'other-account'));
  const tomorrow = NOW + 86400_000;
  await runOne(await reserve(env, undefined, tomorrow));
  const blocked = await reserve(env, undefined, tomorrow);
  assert.equal(blocked.code, 'ai_account_monthly_limit'); assert.equal(blocked.resetAt, jstPeriod(NOW).nextMonth);
  const month = await reserve(env, undefined, jstPeriod(NOW).nextMonth);
  assert.equal(month.ok, true);
  const keys = rows(db).filter(r => r.month === '2026-11').map(r => r.account_key);
  assert.notEqual(rows(db).at(-1).account_key, keys[0]);
  assert.equal(new Set(keys).size, 2); db.close();
});

test('global daily and monthly money ceilings include reservations across Accounts', async () => {
  for (const scope of ['daily', 'monthly']) {
    const { db, env } = setup();
    db.raw.exec(`UPDATE ai_usage_policy SET ${scope}_micros=${AI_TURN_RESERVE_MICROS}`);
    assert.equal((await reserve(env)).ok, true);
    const denial = await reserve(env, 'other-account');
    assert.equal(denial.code, `ai_global_${scope}_budget`);
    assert.equal(denial.resetAt, scope === 'daily' ? jstPeriod(NOW).nextDay : jstPeriod(NOW).nextMonth);
    assert.equal(rows(db).length, 1); db.close();
  }
});

test('32 simultaneous requests cannot oversubscribe either coupled Account or global quotas', async () => {
  for (const scope of ['account', 'money']) {
    const { db, env } = setup();
    db.raw.exec(scope === 'account'
      ? 'UPDATE ai_usage_policy SET account_daily=2, daily_micros=100000000, monthly_micros=1000000000'
      : `UPDATE ai_usage_policy SET daily_micros=${2 * AI_TURN_RESERVE_MICROS}`);
    const result = await Promise.all(Array.from({ length: 32 }, (_, i) => reserve(env, scope === 'account' ? 'A' : `account-${i}`)));
    assert.equal(result.filter(r => r.ok).length, 2);
    assert.equal(rows(db).length, 2);
    assert.equal(rows(db).reduce((n, r) => n + r.budget_micros, 0), 2 * AI_TURN_RESERVE_MICROS); db.close();
  }
});

test('independent worker threads and SQLite connections share one atomic budget', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-quota-concurrency-')), filename = join(dir, 'usage.sqlite');
  const db = createAiUsageD1(filename);
  db.raw.exec(`UPDATE ai_usage_policy SET daily_micros=${2 * AI_TURN_RESERVE_MICROS}`);
  const fixture = new URL('./ai-usage-fixture.js', import.meta.url).href;
  const module = new URL('../src/ai-support-usage.js', import.meta.url).href;
  try {
    const result = await Promise.all(Array.from({ length: 12 }, (_, i) => new Promise((resolve, reject) => {
      const worker = new Worker(`const {parentPort,workerData}=await import('node:worker_threads');
        const {createAiUsageD1}=await import(workerData.fixture);
        const {reserveAiUsage}=await import(workerData.module);
        const db=createAiUsageD1(workerData.filename,{migrate:false});
        try { const r=await reserveAiUsage({AI_SUPPORT_USAGE_DB:db,AI_SUPPORT_USAGE_HMAC_KEY:workerData.key},
          'account-'+workerData.i,'gpt-oss-120b',{now:workerData.now}); parentPort.postMessage(r.ok); }
        finally {db.close();}`, { eval: true, type: 'module', workerData: { filename, fixture, module, key: KEY, now: NOW, i } });
      worker.once('message', resolve); worker.once('error', reject);
    })));
    assert.equal(result.filter(Boolean).length, 2); assert.equal(rows(db).length, 2);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('all four calls, including repair, are reserved; known usage settles conservatively and once', async () => {
  const { db, env } = setup(), lease = await reserve(env);
  assert.equal(rows(db)[0].budget_micros, AI_TURN_RESERVE_MICROS);
  for (let i = 0; i < 4; i++) { await lease.beforeCall(providerInput); lease.record({ input_tokens: 100, output_tokens: 20 }); }
  await assert.rejects(() => lease.beforeCall(providerInput), AiUsageError);
  await lease.finish({ outcome: 'ok', durationMs: 17000, repair: true, fallback: true });
  const row = rows(db)[0];
  assert.equal(row.budget_micros, 228); assert.equal(row.estimated_micros, 200);
  assert.equal(row.input_tokens, 400); assert.equal(row.output_tokens, 80); assert.equal(row.model_calls, 4);
  assert.equal(row.repair, 1); assert.equal(row.fallback, 1); assert.equal(row.latency, '15to30s');
  await assert.rejects(() => lease.finish({ outcome: 'ok' }), AiUsageError);
  assert.equal(rows(db)[0].budget_micros, 228); db.close();
});

test('missing, partial, coerced, negative, excessive and inconsistent usage is unknown, never free', async () => {
  const invalid = [undefined, {}, { prompt_tokens: 100 }, { prompt_tokens: '100', completion_tokens: 20 },
    { prompt_tokens: -1, completion_tokens: 2 }, { prompt_tokens: 100, completion_tokens: NaN },
    { prompt_tokens: 100, completion_tokens: 20, total_tokens: 121 },
    { prompt_tokens: 100, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 21 } },
    { prompt_tokens: AI_BILLING_BOUND.inputTokens + 1, completion_tokens: 20 }];
  for (const usage of invalid) {
    assert.equal(normalizeBillableUsage(usage), null);
    const { db, env } = setup(), lease = await reserve(env);
    await lease.beforeCall(providerInput); lease.record(usage); await lease.finish({ outcome: 'ok' });
    assert.equal(rows(db)[0].unknown_calls, 1); assert.equal(rows(db)[0].budget_micros, AI_CALL_RESERVE_MICROS); db.close();
  }
});

test('provider failure, malformed completion and timeout retain unknown dispatched-call liability', async () => {
  for (const mode of ['throw', 'malformed', 'timeout']) {
    const { db, env } = setup(), lease = await reserve(env);
    const ai = { run() { if (mode === 'throw') throw new Error('private provider detail');
      return mode === 'timeout' ? new Promise(() => {}) : {}; } };
    const provider = createWorkersAiProvider({ ai, timeoutMs: 5, usageMeter: lease });
    if (mode === 'malformed') {
      // Existing normalization can return an empty answer. Missing billing is still unknown.
      await provider.complete(providerInput);
    } else await assert.rejects(() => provider.complete(providerInput), /ai_provider_unavailable/);
    await lease.finish({ outcome: 'provider_error' });
    assert.equal(rows(db)[0].unknown_calls, 1); assert.equal(rows(db)[0].budget_micros, AI_CALL_RESERVE_MICROS); db.close();
  }
});

test('context ceiling includes system, history, tool data and repair; no dispatch or call charge on refusal', async () => {
  const { db, env } = setup(), lease = await reserve(env); let runs = 0;
  const provider = createWorkersAiProvider({ ai: { run() { runs++; } }, usageMeter: lease });
  await assert.rejects(() => provider.complete({ messages: [{ role: 'user', content: 'あ'.repeat(AI_BILLING_BOUND.maxInputBytes) }] }), AiContextLimitError);
  assert.equal(runs, 0); assert.equal(rows(db)[0].model_calls, 0);
  await lease.finish({ outcome: 'context_limit' }); assert.equal(rows(db)[0].budget_micros, 0); db.close();
});

test('HMAC rotation and missing/invalid/separate binding fail closed, never reset the quota', async () => {
  const { db, env } = setup(); await reserve(env);
  for (const overrides of [{ AI_SUPPORT_USAGE_HMAC_KEY: 'different-strong-identity-key-at-least32' },
    { AI_SUPPORT_USAGE_HMAC_KEY: '' }, { AI_SUPPORT_USAGE_DB: null }, { SYNC_DB: db }]) {
    await assert.rejects(() => reserve({ ...env, ...overrides }), AiUsageError);
  }
  await assert.rejects(() => reserveAiUsage(env, 'A', 'qwen3-30b', { now: NOW }), AiUsageError);
  assert.equal(rows(db).length, 1); db.close();
});

test('live shared policy changes cannot be bypassed by cached Worker configuration', async () => {
  const { db, env } = setup(); await runOne(await reserve(env));
  db.raw.exec('UPDATE ai_usage_policy SET account_daily=1');
  assert.equal((await reserve(env)).code, 'ai_account_daily_limit');
  db.raw.exec('UPDATE ai_usage_policy SET enabled=0');
  await assert.rejects(() => reserve(env, 'other'), AiUsageError); db.close();
});

test('unverified provider usage cannot release dispatched-call liability, even when numeric usage is present', async () => {
  const { db, env } = setup(); db.raw.exec('UPDATE ai_usage_policy SET usage_verified=0');
  const lease = await reserve(env); await runOne(lease);
  const row = rows(db)[0];
  assert.equal(row.budget_micros, AI_CALL_RESERVE_MICROS);
  assert.equal(row.estimated_micros, 50); assert.equal(row.input_tokens, 100);
  assert.equal(row.output_tokens, 20); assert.equal(row.unknown_calls, 0); db.close();
});

test('accounting write failure stops provider dispatch; failed settlement retains the whole reservation', async () => {
  const { db, env } = setup(), lease = await reserve(env);
  db.raw.exec(`CREATE TRIGGER reject_call BEFORE UPDATE OF model_calls ON ai_usage BEGIN SELECT RAISE(ABORT,'injected'); END`);
  let runs = 0;
  const provider = createWorkersAiProvider({ ai: { run() { runs++; } }, usageMeter: lease });
  await assert.rejects(() => provider.complete(providerInput), AiUsageError); assert.equal(runs, 0);
  await assert.rejects(() => lease.finish({ outcome: 'accounting_error' }), AiUsageError);
  assert.equal(rows(db)[0].budget_micros, AI_TURN_RESERVE_MICROS);
  db.raw.exec('DROP TRIGGER reject_call');
  const second = await reserve(env, 'B'); // full first reservation still applies: not enough space
  assert.equal(second.ok, false);
  db.close();
  const h = setup(), l = await reserve(h.env); await l.beforeCall(providerInput); l.record({ prompt_tokens: 100, completion_tokens: 20 });
  h.db.raw.exec(`CREATE TRIGGER reject_finish BEFORE UPDATE OF state ON ai_usage BEGIN SELECT RAISE(ABORT,'injected'); END`);
  await assert.rejects(() => l.finish({ outcome: 'ok' }), AiUsageError);
  assert.equal(rows(h.db)[0].state, 'reserved'); assert.equal(rows(h.db)[0].budget_micros, AI_TURN_RESERVE_MICROS); h.db.close();
});

test('a lost call-accounting response cannot cause a refund for an uncertain dispatch', async () => {
  const { db, env } = setup(), original = db.prepare;
  const lease = await reserve(env);
  db.prepare = (sql) => {
    const s = original(sql);
    if (!sql.includes('SET model_calls')) return s;
    const bind = s.bind;
    s.bind = (...values) => { const bound = bind(...values); return { ...bound, async run() { await bound.run(); throw new Error('lost'); } }; };
    return s;
  };
  await assert.rejects(() => lease.beforeCall(providerInput), AiUsageError);
  await assert.rejects(() => lease.finish({ outcome: 'accounting_error' }), AiUsageError);
  assert.equal(rows(db)[0].model_calls, 1); assert.equal(rows(db)[0].budget_micros, AI_TURN_RESERVE_MICROS); db.close();
});

test('cross-midnight in-flight calls remain charged to their JST acceptance cohort, never expire', async () => {
  const { db, env } = setup();
  const end = Date.parse('2026-11-30T14:59:59.999Z');
  const old = await reserve(env, 'A', end); await old.beforeCall(providerInput);
  const next = await reserve(env, 'A', end + 1); assert.equal(next.ok, true);
  await cleanupAiUsage(env, end + 86400_000);
  assert.deepEqual(rows(db).map(r => r.month), ['2026-11', '2026-12']);
  await old.finish({ outcome: 'provider_error' });
  assert.equal(rows(db)[0].budget_micros, AI_CALL_RESERVE_MICROS);
  assert.equal(rows(db)[1].budget_micros, AI_TURN_RESERVE_MICROS); db.close();
});

test('35-day archive is atomic, anonymous and repeatable; 400-day aggregates expire; current caps survive', async () => {
  const { db, env } = setup();
  await runOne(await reserve(env, 'private-account-A', NOW - 37 * 86400_000));
  const incomplete = await reserve(env, 'private-account-B', NOW - 36 * 86400_000); await incomplete.beforeCall(providerInput);
  await reserve(env, 'private-account-C');
  const current = JSON.stringify(rows(db).at(-1));
  await cleanupAiUsage(env, NOW); await cleanupAiUsage(env, NOW);
  assert.equal(rows(db).length, 1); assert.equal(JSON.stringify(rows(db)[0]), current);
  const archived = db.raw.prepare('SELECT * FROM ai_usage_daily').all();
  assert.equal(archived.reduce((n, r) => n + r.consultations, 0), 2);
  assert.equal(archived.reduce((n, r) => n + r.incomplete, 0), 1);
  assert.equal(JSON.stringify(archived).includes('account_key'), false);
  assert.equal(JSON.stringify(archived).includes('private-account'), false);
  await cleanupAiUsage(env, NOW + 401 * 86400_000);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM ai_usage_daily').get().n, 0); db.close();
});

test('retention failure rolls back archive/delete together and cannot change any live reservation', async () => {
  const { db, env } = setup(); await reserve(env, 'A', NOW - 36 * 86400_000);
  db.raw.exec(`CREATE TRIGGER reject_delete BEFORE DELETE ON ai_usage BEGIN SELECT RAISE(ABORT,'injected'); END`);
  await assert.rejects(() => cleanupAiUsage(env, NOW));
  assert.equal(rows(db).length, 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM ai_usage_daily').get().n, 0); db.close();
});
