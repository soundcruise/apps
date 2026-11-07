// AI1-B model evaluation runner. Synthetic data only; never production Account data.
//
//   node scripts/ai-eval/run-eval.mjs --model gpt-oss-120b --dry      (mock model, no network)
//   node scripts/ai-eval/run-eval.mjs --model gpt-oss-120b            (real Workers AI, capped)
//
// The real run uses a remote AI binding from wrangler.ai-eval.jsonc via getPlatformProxy (the
// logged-in wrangler account). It does not touch the production Worker, its config, D1 or secrets.
// Hard cap: one call per non-FAQ case. No automatic retry. Synthetic responses may be saved;
// this evaluator is not imported by the HTTP route and never uses production Account data.
import fs from 'node:fs';
import path from 'node:path';
import { SCENARIOS, QUALITY_CONTRAST_CASES, autoScore, diagnosticsFor } from './scenarios.mjs';
import { AI_SUPPORT_MODELS, createWorkersAiProvider } from '../../src/ai-support-provider.js';
import { runSupportTurn } from '../../src/ai-support-chat.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg, index, all) =>
  arg.startsWith('--') ? [arg.slice(2), all[index + 1]?.startsWith('--') || all[index + 1] == null ? true : all[index + 1]] : null)
  .filter(Boolean));
const modelKey = args.model;
if (!AI_SUPPORT_MODELS[modelKey]) throw new Error(`--model must be one of ${Object.keys(AI_SUPPORT_MODELS).join(', ')}`);
const dry = args.dry === true;
// --targeted: the 12 cases used to check a prompt change (2 phrasings each of attention, error,
// pending, mismatch, unknown and hostile names) instead of the full set. --ui-guidance adds the captured-question regression to its 12.
const TARGETED = Object.freeze({ S3: [0, 2], S4: [0, 1], S2: [0, 1], S6: [1, 2], S9: [0, 1], S10: [0, 2] });
const qualityContract = args['quality-contract'] === true;
if (qualityContract && modelKey !== 'gpt-oss-120b') throw new Error('quality acceptance uses the existing GPT model only');
const uiGuidance = args['ui-guidance'] === true || qualityContract;
const UI_TARGETED = Object.freeze({ S1: [0], S2: [0], S3: [0], S4: [0], S6: [1], S8: [0], S9: [0, 2], S10: [0], S11: [0, 1, 2] });
const selection = qualityContract ? { ...UI_TARGETED, ...Object.fromEntries(QUALITY_CONTRAST_CASES.map((c) => [c.id, [0]])) } : uiGuidance ? UI_TARGETED : TARGETED;
const targeted = args.targeted === true || uiGuidance;
const MAX_CASES = qualityContract ? 16 : targeted ? 12 : SCENARIOS.reduce((count, scenario) => count + scenario.phrasings.length, 0);
const MAX_AI_RUNS = qualityContract ? 13 : MAX_CASES; // three audited FAQ cases require no model call
const label = typeof args.label === 'string' ? `.${args.label.replace(/[^a-z0-9-]/gi, '')}` : '';
const outDir = path.join(import.meta.dirname, 'results');

let aiRuns = 0;
const billedTokens = { input: 0, output: 0 };
let unknownUsageCalls = 0;
let inFlightCalls = 0;
function capped(ai) {
  return { async run(model, inputs) {
    if (unknownUsageCalls) throw new Error('usage uncertain; evaluation stopped');
    if (aiRuns >= MAX_AI_RUNS) throw new Error('evaluation call cap reached');
    aiRuns += 1;
    inFlightCalls += 1;
    checkpoint();
    try {
      const response = await ai.run(model, inputs);
      const usage = response?.usage;
      if (!Number.isFinite(Number(usage?.prompt_tokens ?? usage?.input_tokens)) ||
          !Number.isFinite(Number(usage?.completion_tokens ?? usage?.output_tokens))) unknownUsageCalls += 1;
      billedTokens.input += Number(usage?.prompt_tokens ?? usage?.input_tokens) || 0;
      billedTokens.output += Number(usage?.completion_tokens ?? usage?.output_tokens) || 0;
      return response;
    } catch (error) { unknownUsageCalls += 1; throw error; }
    finally { inFlightCalls -= 1; checkpoint(); }
  } };
}
function mockAi() {
  return { async run() {
    return { response: { explanation: '前回の同期報告を基にした案内です。原因については、症状と合わせた判断が必要です。',
      actions: [], questionId: 'none' }, usage: { prompt_tokens: 1500, completion_tokens: 100 } };
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
fs.mkdirSync(outDir, { recursive: true });
function checkpoint() {
  fs.writeFileSync(path.join(outDir, `${modelKey}${label}${dry ? '.dry' : ''}.checkpoint.json`),
    JSON.stringify({ dry, aiRuns, billedTokens, unknownUsageCalls, inFlightCalls, results }, null, 2) + '\n');
}
try {
  for (const scenario of [...SCENARIOS, ...(qualityContract ? QUALITY_CONTRAST_CASES : [])]) {
    if (targeted && !selection[scenario.id]) continue;
    for (const [phrasingIndex, phrasing] of scenario.phrasings.entries()) {
      if (targeted && !selection[scenario.id].includes(phrasingIndex)) continue;
      if (results.length >= MAX_CASES) break;
      let attempt = 0;
      let run;
      while (!run && attempt < 1) {
        attempt += 1;
        const toolCalls = [];
        const modelOutputs = [];
        const provider = createWorkersAiProvider({ ai: capped(ai), modelKey, timeoutMs: uiGuidance ? 25_000 : 60_000 });
        const started = Date.now();
        try {
          const turn = await runSupportTurn({ provider, diagnostics: tracked(diagnosticsFor(scenario.build()), toolCalls), message: phrasing, history: scenario.history || [],
            observeModelResult: (output) => modelOutputs.push(output) });
          run = { reply: turn.reply, modelOutputs, toolCalls, stats: turn.stats, latencyMs: Date.now() - started, attempts: attempt };
        } catch (error) {
          if (attempt >= 1) {
            run = { reply: null, error: error.message, toolCalls, stats: null, latencyMs: Date.now() - started, attempts: attempt };
          }
          if (aiRuns >= MAX_AI_RUNS) break;
        }
      }
      const score = run.reply == null ? { hardFails: [], flags: ['provider_error'], pass: false } : autoScore(scenario, run, { actionContract: true });
      results.push({ scenario: scenario.id, title: scenario.title, phrasing, ...run, score });
      checkpoint();
      process.stdout.write(`${scenario.id} ${score.pass ? 'PASS' : 'CHECK'} ${score.hardFails.join(',')} ${score.flags.join(',')}\n`);
    }
  }
} finally {
  await proxy?.dispose();
}

const price = AI_SUPPORT_MODELS[modelKey].price;
// Binding usage includes calls made before an egress refusal, whose turn stats have no usage.
const tokens = billedTokens;
const summary = {
  model: AI_SUPPORT_MODELS[modelKey].id, dry, targeted, uiGuidance, qualityContract, unknownUsageCalls: unknownUsageCalls + inFlightCalls, cases: results.length, aiRuns,
  diagnosticSummaries: results.filter((result) => result.stats?.diagnosticSummaryUsed).length,
  directAnswers: results.filter((result) => result.stats?.directAnswer).length,
  malformedPlans: results.filter((result) => result.stats?.fallback).length,
  omittedDescriptionSentences: results.reduce((n, result) => n + (result.stats?.explanationSentencesOmitted || 0), 0),
  rejectedActions: results.reduce((n, result) => n + (result.stats?.rejectedActions || 0), 0),
  rawModelMarkdown: results.filter((result) => result.stats?.rawMarkdown).length,
  repairs: results.filter((result) => result.stats?.repairAttempted).length,
  repaired: results.filter((result) => result.stats?.repaired).length,
  fallbacks: results.filter((result) => result.stats?.fallback).length,
  guardViolations: results.flatMap((result) => (result.stats?.guardViolations || []).map((category) => `${result.scenario}:${category}`)),
  knownTargetFalseUnknown: results.filter((result) => result.score.flags.includes('known_target_false_unknown')).length,

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
  approxCostUsd: dry ? 0 : Number(((tokens.input / 1e6) * price.inputPerM + (tokens.output / 1e6) * price.outputPerM).toFixed(4))
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${modelKey}${label}${dry ? '.dry' : ''}.json`), `${JSON.stringify({ summary, results }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
