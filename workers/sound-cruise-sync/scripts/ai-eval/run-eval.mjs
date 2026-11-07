// AI1-B model evaluation runner. Synthetic data only; never production Account data.
//
//   node scripts/ai-eval/run-eval.mjs --model gpt-oss-120b --dry      (mock model, no network)
//   node scripts/ai-eval/run-eval.mjs --model gpt-oss-120b            (real Workers AI, capped)
//
// The real run uses a remote AI binding from wrangler.ai-eval.jsonc via getPlatformProxy (the
// logged-in wrangler account). It does not touch the production Worker, its config, D1 or secrets.
// Hard cap: MAX_AI_RUNS model calls per invocation; each case is retried at most once.
import fs from 'node:fs';
import path from 'node:path';
import { SCENARIOS, autoScore, diagnosticsFor } from './scenarios.mjs';
import { AI_SUPPORT_MODELS, AiProviderError, createWorkersAiProvider } from '../../src/ai-support-provider.js';
import { runSupportTurn } from '../../src/ai-support-chat.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg, index, all) =>
  arg.startsWith('--') ? [arg.slice(2), all[index + 1]?.startsWith('--') || all[index + 1] == null ? true : all[index + 1]] : null)
  .filter(Boolean));
const modelKey = args.model;
if (!AI_SUPPORT_MODELS[modelKey]) throw new Error(`--model must be one of ${Object.keys(AI_SUPPORT_MODELS).join(', ')}`);
const dry = args.dry === true;
// --targeted: the 12 cases used to check a prompt change (2 phrasings each of attention, error,
// pending, mismatch, unknown and hostile names) instead of the full 30.
const TARGETED = Object.freeze({ S3: [0, 2], S4: [0, 1], S2: [0, 1], S6: [1, 2], S9: [0, 1], S10: [0, 2] });
const targeted = args.targeted === true;
const MAX_CASES = targeted ? 12 : 30; // 10 scenarios × 3 phrasings, or the targeted 12
const MAX_AI_RUNS = targeted ? 50 : 100; // targeted: up to 4 calls per case with one repair // ≤3 model calls per case + ≤1 retry of a few cases; hard stop beyond this
const label = typeof args.label === 'string' ? `.${args.label.replace(/[^a-z0-9-]/gi, '')}` : '';
const outDir = path.join(import.meta.dirname, 'results');

let aiRuns = 0;
function capped(ai) {
  return { async run(model, inputs) {
    aiRuns += 1;
    if (aiRuns > MAX_AI_RUNS) throw new Error('evaluation call cap reached');
    return ai.run(model, inputs);
  } };
}
function mockAi() {
  // Offline check of the harness: first call asks for the overview, second answers plainly.
  return { async run(_model, inputs) {
    const hasTool = inputs.messages.some((message) => message.role === 'tool');
    if (!hasTool && inputs.tools) return { choices: [{ message: { content: '', tool_calls: [{ id: 'c1', type: 'function',
      function: { name: 'getSyncOverview', arguments: '{}' } }] } }], usage: { prompt_tokens: 1000, completion_tokens: 20 } };
    return { choices: [{ message: { content: '（dry run）同期センターで「もう一度確認」を押してください。' } }], usage: { prompt_tokens: 1500, completion_tokens: 40 } };
  } };
}

let proxy = null;
let ai;
if (dry) ai = mockAi();
else {
  const { getPlatformProxy } = await import('wrangler');
  proxy = await getPlatformProxy({ configPath: path.join(import.meta.dirname, '../../wrangler.ai-eval.jsonc'), remoteBindings: true });
  ai = proxy.env.AI;
  if (!ai?.run) throw new Error('AI binding unavailable');
}

// Records which tools the model asked for, without changing what it receives.
function tracked(diagnostics, calls) {
  return {
    async getSyncOverview() { calls.push({ name: 'getSyncOverview', args: {} }); return diagnostics.getSyncOverview(); },
    async getAppSyncTargets(appId) { calls.push({ name: 'getAppSyncTargets', args: { appId } }); return diagnostics.getAppSyncTargets(appId); }
  };
}

const results = [];
try {
  for (const scenario of SCENARIOS) {
    if (targeted && !TARGETED[scenario.id]) continue;
    for (const [phrasingIndex, phrasing] of scenario.phrasings.entries()) {
      if (targeted && !TARGETED[scenario.id].includes(phrasingIndex)) continue;
      if (results.length >= MAX_CASES) break;
      let attempt = 0;
      let run;
      while (!run && attempt < 2) {
        attempt += 1;
        const toolCalls = [];
        const provider = createWorkersAiProvider({ ai: capped(ai), modelKey, timeoutMs: 60_000 });
        const started = Date.now();
        try {
          const turn = await runSupportTurn({ provider, diagnostics: tracked(diagnosticsFor(scenario.build()), toolCalls), message: phrasing });
          run = { reply: turn.reply, toolCalls, stats: turn.stats, latencyMs: Date.now() - started, attempts: attempt };
        } catch (error) {
          if (!(error instanceof AiProviderError) || attempt >= 2) {
            run = { reply: null, error: error.message, toolCalls, stats: null, latencyMs: Date.now() - started, attempts: attempt };
          }
          if (aiRuns >= MAX_AI_RUNS) break;
        }
      }
      const score = run.reply == null ? { hardFails: [], flags: ['provider_error'], pass: false } : autoScore(scenario, run);
      results.push({ scenario: scenario.id, title: scenario.title, phrasing, ...run, score });
      process.stdout.write(`${scenario.id} ${score.pass ? 'PASS' : 'CHECK'} ${score.hardFails.join(',')} ${score.flags.join(',')}\n`);
    }
  }
} finally {
  await proxy?.dispose();
}

const price = AI_SUPPORT_MODELS[modelKey].price;
const tokens = results.reduce((sum, result) => ({
  input: sum.input + (result.stats?.usage.inputTokens || 0), output: sum.output + (result.stats?.usage.outputTokens || 0)
}), { input: 0, output: 0 });
const summary = {
  model: AI_SUPPORT_MODELS[modelKey].id, dry, targeted, cases: results.length, aiRuns,
  rawModelMarkdown: results.filter((result) => result.stats?.rawMarkdown).length,
  repairs: results.filter((result) => result.stats?.repairAttempted).length,
  repaired: results.filter((result) => result.stats?.repaired).length,
  fallbacks: results.filter((result) => result.stats?.fallback).length,
  guardViolations: results.flatMap((result) => (result.stats?.guardViolations || []).map((category) => `${result.scenario}:${category}`)),
  knownTargetFalseUnknown: results.filter((result) => result.score.flags.includes('known_target_false_unknown')).length,
  s9ExactFirstSentence: `${results.filter((result) => result.scenario === 'S9' && !result.score.flags.includes('first_sentence_mismatch') && result.reply).length}/${results.filter((result) => result.scenario === 'S9').length}`,
  avgFirstAnswerMs: Math.round(results.reduce((sum, result) => sum + (result.stats?.firstAnswerMs || 0), 0) / Math.max(1, results.length)),
  quality: results.reduce((tally, result) => {
    for (const name of result.score.quality || []) tally[name] += 1;
    return tally;
  }, { inventedUi: 0, fieldNames: 0, markdown: 0 }),
  autoPass: results.filter((result) => result.score.pass).length,
  hardFails: results.flatMap((result) => result.score.hardFails.map((fail) => `${result.scenario}:${fail}`)),
  flagged: results.filter((result) => result.score.flags.length).map((result) => `${result.scenario}:${result.score.flags.join('|')}`),
  toolCalls: results.reduce((sum, result) => sum + result.toolCalls.length, 0),
  avgLatencyMs: Math.round(results.reduce((sum, result) => sum + result.latencyMs, 0) / Math.max(1, results.length)),
  tokens,
  approxCostUsd: Number(((tokens.input / 1e6) * price.inputPerM + (tokens.output / 1e6) * price.outputPerM).toFixed(4))
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${modelKey}${label}${dry ? '.dry' : ''}.json`), `${JSON.stringify({ summary, results }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
