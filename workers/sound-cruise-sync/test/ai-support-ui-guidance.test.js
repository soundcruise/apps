import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSupportTurn } from '../src/ai-support-chat.js';
import { validateSupportReply } from '../src/ai-support-guard.js';
import { AI_SUPPORT_SYSTEM_PROMPT } from '../src/ai-support-policy.js';
import { SCENARIOS, diagnosticsFor } from '../scripts/ai-eval/scenarios.mjs';
import { IPHONE_THIRD_QUESTION, IPHONE_THIRD_REPLY } from './fixtures/iphone-support-20261107.js';
import { syncTargetsTabLabel } from '../../../apps/cruise-port/sync-center-ui.js';

test('normal useful explanation is delivered intact, with no new output contract or correction', async () => {
  const explanation = '同期が保たれている限り、毎回特別な操作は不要です。';
  let calls = 0;
  const result = await runSupportTurn({ message: '毎回操作が必要ですか？', diagnostics: diagnosticsFor(SCENARIOS[0].build()),
    provider: { async complete(request) { calls++; assert.equal(request.responseFormat, undefined);
      return { text: explanation, toolCalls: [], usage: {} }; } } });
  assert.equal(result.reply, explanation); assert.equal(calls, 1); assert.equal(result.stats.fallback, false);
});

test('saved v143 useful replies retain the existing validator behavior and natural text', () => {
  const saved = JSON.parse(fs.readFileSync(new URL('./fixtures/v143-synthetic-replies.json', import.meta.url)));
  for (const row of saved) assert.equal(validateSupportReply(row.reply).ok, true, row.question);
});

test('current UI and real contact route are explicit; old captured failure is a model reacceptance case', () => {
  assert.equal(syncTargetsTabLabel(2), '同期先2件');
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('同期先N件'));
  assert.equal(AI_SUPPORT_SYSTEM_PROMPT.includes('ⓘ'), false);
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('問い合わせ方法を尋ねられたら、相談画面下部の「メールで報告」'));
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('「設定 → サポート」やヘルプ画面のリンクを推測しない'));
  assert.match(IPHONE_THIRD_QUESTION, /問い合わせ方法/);
  assert.match(IPHONE_THIRD_REPLY, /サポート/);
  // No claim that prompt changes deterministically block a previously unseen model mistake.
  assert.equal(validateSupportReply(IPHONE_THIRD_REPLY).ok, true);
});

test('state knowledge preserves previous report versus present state and registration versus missing report', () => {
  for (const text of ['現在も同期が未完了だと断定しない', 'activeTargetCount', '未登録・未接続と読み替えない',
    '前回の報告', '全端末が一致している保証ではない']) assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes(text));
});
