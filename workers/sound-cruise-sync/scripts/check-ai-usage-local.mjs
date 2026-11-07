// Disposable local workerd/D1 SQL verification. No AI binding or remote D1 binding is created.
// AI_USAGE_MINIFLARE_MODULE may point to this repository's already installed Miniflare entry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reserveAiUsage, cleanupAiUsage, AI_TURN_RESERVE_MICROS } from '../src/ai-support-usage.js';
const { Miniflare, convertV4MiniflareOptions } = await import(process.env.AI_USAGE_MINIFLARE_MODULE || 'miniflare');
const statements = sql => sql.replace(/^\s*--[^\n]*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("local fixture"); } };',
  compatibilityDate: '2026-09-01', d1Databases: { AI_SUPPORT_USAGE_DB: 'local-ai-usage-only' } }));
try {
  const db = await mf.getD1Database('AI_SUPPORT_USAGE_DB');
  const migration = fs.readFileSync(new URL('../ai-usage-migrations/0001_ai_usage.sql', import.meta.url), 'utf8');
  await db.batch(statements(migration).map(s => db.prepare(s)));
  const env = { AI_SUPPORT_USAGE_DB: db, AI_SUPPORT_USAGE_HMAC_KEY: 'synthetic-local-only-usage-hmac-secret-32' };
  await db.prepare('UPDATE ai_usage_policy SET daily_micros=?').bind(2 * AI_TURN_RESERVE_MICROS).run();
  const result = await Promise.all(Array.from({ length: 16 }, (_, i) => reserveAiUsage(env, `synthetic-${i}`, 'gpt-oss-120b')));
  assert.equal(result.filter(r => r.ok).length, 2);
  const lease = result.find(r => r.ok);
  await lease.beforeCall({ messages: [{ role: 'user', content: '合成の同期相談' }] });
  lease.record({ input_tokens: 100, output_tokens: 20 }); await lease.finish({ outcome: 'ok' });
  const counts = await db.prepare('SELECT COUNT(*) AS n,SUM(model_calls) AS calls FROM ai_usage').first();
  assert.equal(counts.n, 2); assert.equal(counts.calls, 1);
  const report = fs.readFileSync(new URL('./ai-usage-report.sql', import.meta.url), 'utf8');
  for (const sql of statements(report)) await db.prepare(sql).all();
  await cleanupAiUsage(env); await cleanupAiUsage(env);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ai_usage').first()).n, 2);
  process.stdout.write('PASS: local workerd/D1 migration, 16 concurrent reservations, settlement, report SQL and retention\n');
} finally { await mf.dispose(); }
