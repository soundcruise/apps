// AI-only accounting. No Sync DB access and no conversation/diagnostic text accepted by this API.
// A single conditional INSERT serializes all four limits on D1's primary. A reservation is never
// released by a timeout/TTL. Only a successfully completed, matching settlement can lower it.
import { AI_SUPPORT_LIMITS } from './ai-support-policy.js';

export const AI_USAGE_POLICY_VERSION = 'pro-20261107-v1';
export const AI_USAGE_RETENTION = Object.freeze({ detailDays: 35, aggregateDays: 400 });
// Use full published context capacity for BOTH input and output, including hidden reasoning.
// Deliberately do not assume that 900 visible output tokens bound billed reasoning tokens, or
// that characters/UTF-8 bytes equal tokens. The byte ceiling is an independent payload limit.
// Padded rates exceed both displayed prices and the published neuron-to-USD conversion.
export const AI_BILLING_BOUND = Object.freeze({ model: 'gpt-oss-120b', inputTokens: 131072,
  outputTokens: 131072, inputMicrosPerM: 400000, outputMicrosPerM: 850000,
  maxInputBytes: 98304, maxCalls: AI_SUPPORT_LIMITS.maxModelCalls });
const charge = (input, output) => Math.ceil(input * AI_BILLING_BOUND.inputMicrosPerM / 1e6) +
  Math.ceil(output * AI_BILLING_BOUND.outputMicrosPerM / 1e6);
export const AI_CALL_RESERVE_MICROS = charge(AI_BILLING_BOUND.inputTokens, AI_BILLING_BOUND.outputTokens);
export const AI_TURN_RESERVE_MICROS = AI_CALL_RESERVE_MICROS * AI_BILLING_BOUND.maxCalls;
const JST = 9 * 3600_000;
const DAY = 86400_000;
const OUTCOMES = new Set(['ok', 'provider_error', 'diagnostics_error', 'secret_blocked', 'context_limit', 'accounting_error', 'support_error']);

export class AiUsageError extends Error {
  constructor() { super('ai_support_accounting_unavailable'); this.code = 'ai_support_accounting_unavailable'; }
}
export class AiContextLimitError extends Error {
  constructor() { super('ai_support_context_limit'); this.code = 'ai_support_context_limit'; }
}
export function jstPeriod(now = Date.now()) {
  const day = new Date(now + JST).toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const [year, number] = month.split('-').map(Number);
  return { day, month, nextDay: Date.parse(`${day}T00:00:00+09:00`) + DAY,
    nextMonth: Date.UTC(year, number, 1) - JST };
}
const primary = db => db?.withSession ? db.withSession('first-primary') : db;
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}
export function normalizeBillableUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const input = usage.prompt_tokens ?? usage.input_tokens;
  const output = usage.completion_tokens ?? usage.output_tokens;
  if (!Number.isSafeInteger(input) || input <= 0 || input > AI_BILLING_BOUND.inputTokens ||
      !Number.isSafeInteger(output) || output < 0 || output > AI_BILLING_BOUND.outputTokens) return null;
  if (usage.total_tokens !== undefined && usage.total_tokens !== input + output) return null;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens;
  if (reasoning !== undefined && (!Number.isSafeInteger(reasoning) || reasoning < 0 || reasoning > output)) return null;
  return { inputTokens: input, outputTokens: output };
}
function latencyBucket(ms) { return ms < 5000 ? 'lt5s' : ms < 15000 ? '5to15s' : ms < 30000 ? '15to30s' : 'gte30s'; }

// Periods belong to consultation ACCEPTANCE in JST, including all its tool/repair calls. Provider
// invoice dates (UTC/late posting), taxes and other applications are not these admission periods.
export async function reserveAiUsage(env, accountId, model, { now = Date.now() } = {}) {
  const db = primary(env.AI_SUPPORT_USAGE_DB);
  const secret = env.AI_SUPPORT_USAGE_HMAC_KEY;
  if (!db?.batch || db === env.SYNC_DB || env.AI_SUPPORT_USAGE_DB === env.SYNC_DB ||
      typeof secret !== 'string' || secret.length < 32 || !accountId || model !== AI_BILLING_BOUND.model) throw new AiUsageError();
  const period = jstPeriod(now);
  const accountKey = await hmac(secret, `ai-usage:account:${period.month}:${accountId}`);
  // Pin the key: accidental rotation must stop AI, never reset a current Account allowance.
  const identityTag = await hmac(secret, 'ai-usage:identity-key:v1');
  const id = crypto.randomUUID();
  let result;
  try {
    result = await db.batch([
      db.prepare('UPDATE ai_usage_policy SET identity_tag = ? WHERE id = 1 AND identity_tag IS NULL').bind(identityTag),
      db.prepare(`INSERT INTO ai_usage (id, day, month, account_key, model, policy_version, reserved_micros, budget_micros)
        SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM ai_usage_policy p WHERE p.id = 1 AND p.enabled = 1 AND p.identity_tag = ?
        AND (SELECT COUNT(*) FROM ai_usage WHERE day = ? AND account_key = ?) < p.account_daily
        AND (SELECT COUNT(*) FROM ai_usage WHERE month = ? AND account_key = ?) < p.account_monthly
        AND (SELECT COALESCE(SUM(budget_micros), 0) FROM ai_usage WHERE day = ?) + ? <= p.daily_micros
        AND (SELECT COALESCE(SUM(budget_micros), 0) FROM ai_usage WHERE month = ?) + ? <= p.monthly_micros`)
        .bind(id, period.day, period.month, accountKey, model, AI_USAGE_POLICY_VERSION, AI_TURN_RESERVE_MICROS,
          AI_TURN_RESERVE_MICROS, identityTag, period.day, accountKey, period.month, accountKey,
          period.day, AI_TURN_RESERVE_MICROS, period.month, AI_TURN_RESERVE_MICROS),
      db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM ai_usage WHERE day = ? AND account_key = ?) AS account_day_used,
        (SELECT COUNT(*) FROM ai_usage WHERE month = ? AND account_key = ?) AS account_month_used,
        (SELECT COALESCE(SUM(budget_micros),0) FROM ai_usage WHERE day = ?) AS day_used,
        (SELECT COALESCE(SUM(budget_micros),0) FROM ai_usage WHERE month = ?) AS month_used
        FROM ai_usage_policy p WHERE p.id = 1`).bind(period.day, accountKey, period.month, accountKey, period.day, period.month)
    ]);
  } catch { throw new AiUsageError(); }
  const policy = result[2]?.results?.[0];
  if (!policy || policy.enabled !== 1 || policy.identity_tag !== identityTag) throw new AiUsageError();
  if (result[1]?.meta?.changes !== 1) {
    const monthly = policy.account_month_used >= policy.account_monthly;
    const daily = policy.account_day_used >= policy.account_daily;
    const monthBudget = policy.month_used + AI_TURN_RESERVE_MICROS > policy.monthly_micros;
    const code = monthly ? 'ai_account_monthly_limit' : daily ? 'ai_account_daily_limit'
      : monthBudget ? 'ai_global_monthly_budget' : 'ai_global_daily_budget';
    const resetAt = monthly || (!daily && monthBudget) ? period.nextMonth : period.nextDay;
    return { ok: false, code, resetAt, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
  }
  const warning = policy.day_used * 100 >= policy.daily_micros * policy.warning_percent ||
    policy.month_used * 100 >= policy.monthly_micros * policy.warning_percent;
  let calls = 0, input = 0, output = 0, knownCost = 0, estimated = 0, known = 0, broken = false, closed = false;
  return { ok: true, warning,
    async beforeCall(inputs) {
      if (closed || broken || calls >= AI_BILLING_BOUND.maxCalls) throw new AiUsageError();
      if (new TextEncoder().encode(JSON.stringify(inputs)).length > AI_BILLING_BOUND.maxInputBytes) throw new AiContextLimitError();
      try {
        const r = await db.prepare(`UPDATE ai_usage SET model_calls = model_calls + 1
          WHERE id = ? AND state = 'reserved' AND model_calls = ? AND model_calls < ?`)
          .bind(id, calls, AI_BILLING_BOUND.maxCalls).run();
        if (r.meta?.changes !== 1) throw new AiUsageError();
        calls++;
      } catch { broken = true; throw new AiUsageError(); }
    },
    record(usage) {
      const value = normalizeBillableUsage(usage);
      if (!value) return; // one whole per-call ceiling remains charged, never silently zero
      input += value.inputTokens; output += value.outputTokens; known++;
      knownCost += charge(value.inputTokens, value.outputTokens);
      estimated += Math.ceil(value.inputTokens * 0.35 + value.outputTokens * 0.75);
    },
    async finish({ outcome = 'support_error', durationMs = 0, repair = false, fallback = false } = {}) {
      if (closed || broken) throw new AiUsageError();
      closed = true;
      if (!OUTCOMES.has(outcome) || known > calls) throw new AiUsageError();
      const unknown = calls - known;
      try {
        const r = await db.prepare(`UPDATE ai_usage SET state = 'settled', budget_micros = ?, input_tokens = ?, output_tokens = ?,
          estimated_micros = ?, unknown_calls = ?, outcome = ?, latency = ?, repair = ?, fallback = ?
          WHERE id = ? AND state = 'reserved' AND model_calls = ?`)
          .bind((policy.usage_verified === 1 ? knownCost : known * AI_CALL_RESERVE_MICROS) + unknown * AI_CALL_RESERVE_MICROS,
            input, output, estimated, unknown, outcome,
            latencyBucket(durationMs), repair ? 1 : 0, fallback ? 1 : 0, id, calls).run();
        if (r.meta?.changes !== 1) throw new AiUsageError();
      } catch { throw new AiUsageError(); } // retained full reservation if write did not commit
    }
  };
}

// Archive then delete in ONE transaction; repetition cannot double-count. Never expire a live
// period's reservation. A crashed Worker remains charged at its entire original reservation.
export async function cleanupAiUsage(env, now = Date.now()) {
  if (!env.AI_SUPPORT_USAGE_DB) return;
  if (env.AI_SUPPORT_USAGE_DB === env.SYNC_DB) throw new AiUsageError();
  const db = primary(env.AI_SUPPORT_USAGE_DB);
  const detailBefore = jstPeriod(now - AI_USAGE_RETENTION.detailDays * DAY).day;
  const aggregateBefore = jstPeriod(now - AI_USAGE_RETENTION.aggregateDays * DAY).day;
  await db.batch([
    db.prepare(`INSERT INTO ai_usage_daily
      SELECT day, model, policy_version, outcome, latency, COUNT(*), SUM(model_calls), SUM(input_tokens), SUM(output_tokens),
        SUM(estimated_micros), SUM(budget_micros), SUM(CASE WHEN state='reserved' THEN model_calls ELSE unknown_calls END),
        SUM(state='reserved'), SUM(repair), SUM(fallback)
      FROM ai_usage WHERE day < ? GROUP BY day, model, policy_version, outcome, latency
      ON CONFLICT(day, model, policy_version, outcome, latency) DO UPDATE SET
        consultations=consultations+excluded.consultations, model_calls=model_calls+excluded.model_calls,
        input_tokens=input_tokens+excluded.input_tokens, output_tokens=output_tokens+excluded.output_tokens,
        estimated_micros=estimated_micros+excluded.estimated_micros, budget_micros=budget_micros+excluded.budget_micros,
        unknown_calls=unknown_calls+excluded.unknown_calls, incomplete=incomplete+excluded.incomplete,
        repairs=repairs+excluded.repairs, fallbacks=fallbacks+excluded.fallbacks`).bind(detailBefore),
    db.prepare('DELETE FROM ai_usage WHERE day < ?').bind(detailBefore),
    db.prepare('DELETE FROM ai_usage_daily WHERE day < ?').bind(aggregateBefore)
  ]);
}
