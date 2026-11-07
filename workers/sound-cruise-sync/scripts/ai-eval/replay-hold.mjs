// Offline regression replay. This file has no network/provider binding and never bills tokens.
// Saved final replies are not new model outputs, nor substitutes for missing intermediate text.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { runSupportTurn } from '../../src/ai-support-chat.js';
import { SCENARIOS, diagnosticsFor } from './scenarios.mjs';
import { qualityFlags } from './scenarios.mjs';
const saved = JSON.parse(fs.readFileSync(new URL('../../test/fixtures/pr222-hold-final-replies.json', import.meta.url), 'utf8'));
export async function replayHold() {
  const results = [];
  for (const row of saved.results) {
    const scenario = SCENARIOS.find((s) => s.id === row.scenario);
    const sourceUnavailable = Boolean(row.stats.fallback || row.stats.egressBlocked);
    let simulatedCalls = 0;
    const provider = { async complete() { simulatedCalls++;
      return { // This explicit synthetic wrapper projects archived prose through the new renderer.
      // It is not evidence that GPT emitted a structured plan.
      text: JSON.stringify({ explanation: sourceUnavailable ? '' : row.reply, actions: [], questionId: 'none' }),
        toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 } };
    } };
    const next = await runSupportTurn({ provider, diagnostics: diagnosticsFor(scenario.build()),
      message: row.phrasing, history: scenario.history || [] });
    assert.equal(next.stats.repairAttempted, false);
    assert.equal(next.stats.fallback, false);
    assert.doesNotMatch(next.reply, /Pixel\s*を選|ⓘ|正確な操作手順をまとめられませんでした/);
    results.push({ scenario: row.scenario, question: row.phrasing, sourceUnavailable, originalFixed: Boolean(row.stats.fallback),
      originalRepair: Boolean(row.stats.repairAttempted), originalLatencyMs: row.latencyMs,
      simulatedCalls, reply: next.reply, stats: next.stats, qualityReviewFlags: qualityFlags(next.reply) });
  }
  return { provenance: saved.provenance, realInferenceCalls: 0, realTokens: 0, costUsd: 0,
    warning: 'Archived final prose projected as description through a synthetic JSON wrapper, not GPT re-evaluation or observed structured output. Missing intermediate explanations are not reconstructed. Diagnostic summaries are counted separately from retained AI descriptions.',
    summary: { cases: results.length, originalRepairs: results.filter((r) => r.originalRepair).length,
      originalFixed: results.filter((r) => r.originalFixed).length, repairs: 0, genericErrorFallbacks: 0,
      directAnswers: results.filter((r) => r.stats.directAnswer).length,
      diagnosticOnly: results.filter((r) => r.stats.diagnosticSummaryUsed).length,
      retainedDescription: results.filter((r) => !r.stats.diagnosticSummaryUsed && !r.stats.directAnswer).length,
      simulatedCalls: results.reduce((n, r) => n + r.simulatedCalls, 0),
      unavailableSourceDescriptions: results.filter((r) => r.sourceUnavailable).length }, results };
}
if (process.argv[1] === new URL(import.meta.url).pathname) process.stdout.write(JSON.stringify(await replayHold(), null, 2) + '\n');
