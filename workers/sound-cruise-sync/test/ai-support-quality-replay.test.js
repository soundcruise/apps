import test from 'node:test';
import assert from 'node:assert/strict';
import { replayHold } from '../scripts/ai-eval/replay-hold.mjs';
import { runSupportTurn } from '../src/ai-support-chat.js';
import { SCENARIOS, diagnosticsFor, autoScore } from '../scripts/ai-eval/scenarios.mjs';
import { createWorkersAiProvider } from '../src/ai-support-provider.js';
import { SUPPORT_PLAN_FORMAT } from '../src/ai-support-actions.js';
const diagnostic = () => diagnosticsFor(SCENARIOS.find((s) => s.id === 'S3').build());

test('saved 12 final replies replay offline; unavailable explanations and diagnostic-only replies stay visible in metrics', async () => {
  const result = await replayHold();
  assert.equal(result.realInferenceCalls, 0);
  assert.equal(result.summary.cases, 12);
  assert.equal(result.summary.originalRepairs, 7);
  assert.equal(result.summary.originalFixed, 5);
  assert.equal(result.summary.repairs, 0);
  assert.equal(result.summary.directAnswers, 3);
  assert.equal(result.summary.retainedDescription, 2);
  assert.equal(result.summary.diagnosticOnly, 7);
  assert.equal(result.summary.unavailableSourceDescriptions, 6);
  assert.equal(result.summary.simulatedCalls, 9);
  assert.match(result.results[9].reply, /メールで報告/);
});

test('eight structured explanation/action contrasts are preserved; an invalid action alone cannot replace the full answer', async () => {
  const descriptions = [
    '前回の報告に確認事項があります。今も同じ症状が続いているかは分かりません。',
    '保留中というだけで故障とは限りません。最新の完了報告はまだ確認できていません。',
    '原因は、この情報だけでは特定できません。症状の起きるタイミングも判断材料になります。',
    '同期の状況を確認しています。前回の報告と現在の症状が異なる可能性もあります。'
  ];
  for (let index = 0; index < 8; index++) {
    let calls = 0;
    const explanation = descriptions[Math.floor(index / 2)];
    const turn = await runSupportTurn({ diagnostics: diagnostic(), message: 'コードクルーズがおかしい',
      provider: { async complete() { calls++; return { text: JSON.stringify({ explanation,
        actions: [{ id: index % 2 ? 'select_pixel' : 'inspect_app', appId: 'chord' }], questionId: 'none' }), toolCalls: [] }; } } });
    assert.ok(turn.reply.includes(explanation));
    assert.equal(turn.stats.diagnosticSummaryUsed, false);
    assert.equal(turn.stats.fallback, false);
    assert.equal(turn.stats.repairAttempted, false);
    assert.equal(calls, 1);
    assert.equal(turn.stats.rejectedActions, index % 2);
    assert.doesNotMatch(turn.reply, /select_pixel|Pixel/);
  }
});

test('schema reaches the single guarded AI.run site and object responses decode without exposing JSON', async () => {
  const calls = [];
  const ai = { async run(model, input) { calls.push({ model, input });
    return { response: { explanation: '前回の報告に確認事項があります。', actions: [{ id: 'inspect_app', appId: 'chord' }], questionId: 'none' },
      usage: { prompt_tokens: 120, completion_tokens: 35 } };
  } };
  const turn = await runSupportTurn({ provider: createWorkersAiProvider({ ai }), diagnostics: diagnostic(), message: 'コードクルーズの同期状態は？' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, '@cf/openai/gpt-oss-120b');
  assert.deepEqual(calls[0].input.response_format, SUPPORT_PLAN_FORMAT);
  assert.equal(calls[0].input.tools, undefined);
  assert.deepEqual(turn.stats.usage, { inputTokens: 120, outputTokens: 35 });
  assert.match(turn.reply, /前回の報告に確認事項/);
  assert.doesNotMatch(turn.reply, /explanation|questionId/);
});

test('synthetic observer is optional and not reachable from the production route', async () => {
  const output = { explanation: '前回の報告に確認事項があります。', actions: [], questionId: 'none' };
  const observed = [];
  await runSupportTurn({ diagnostics: diagnostic(), message: 'コードクルーズについて',
    provider: { async complete() { return { text: JSON.stringify(output), toolCalls: [] }; } },
    observeModelResult: (value) => observed.push(value) });
  assert.deepEqual(JSON.parse(observed[0].text), output);
  const fs = await import('node:fs');
  assert.doesNotMatch(fs.readFileSync(new URL('../src/ai-support-app.js', import.meta.url), 'utf8'), /observeModelResult/);
});

test('scoring never hides malformed plans, missing explanations or discarded operations behind PASS', () => {
  const scenario = SCENARIOS.find((s) => s.id === 'S3');
  const score = autoScore(scenario, { reply: '前回の報告に確認事項があります。', toolCalls: [{ name: 'getSyncOverview' }],
    stats: { diagnosticSummaryUsed: true, explanationSentencesOmitted: 1, rejectedActions: 1, fallback: true } }, { actionContract: true });
  assert.equal(score.pass, false);
  for (const flag of ['description_missing_review', 'description_contract_review', 'rejected_actions_review', 'malformed_or_sensitive_plan']) assert.ok(score.flags.includes(flag));
});
