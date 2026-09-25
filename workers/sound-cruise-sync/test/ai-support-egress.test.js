import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runSupportTurn } from '../src/ai-support-chat.js';
import { checkEgress, guardedProvider, EgressBlockedError, ModelCallBudgetError } from '../src/ai-support-egress.js';
import { GUARD_FALLBACK_REPLY, repairInstruction, validateSupportReply } from '../src/ai-support-guard.js';
import { AI_SUPPORT_LIMITS, AI_SUPPORT_SYSTEM_PROMPT, SECRET_REFUSAL, containsSecret } from '../src/ai-support-policy.js';
import { containsSecret as detectorContainsSecret } from '../src/secret-detector.js';
import { createSyncDiagnostics, userControlledPaths } from '../src/ai-diagnostics.js';

// AI1-C security fix: the final provider egress guard and the 4-call budget. Synthetic data only.

const GOOD = 'コードクルーズの行にある ⓘ を開き、「もう一度確認」が表示されている場合はタップしてください。';
const ID_A = 'b91c7f00-0000-4000-8000-00000000000a';
const ID_B = 'c82d6e11-0000-4000-8000-00000000000b';
const now = 1_800_000_000_000;

function diagnostics(targets) {
  return createSyncDiagnostics({
    session: {}, identity: { accountId: 'synthetic' }, now: () => now,
    createAccountRepository: () => ({ async getAccountSummary() {
      return { account: { state: 'active' }, memberships: [{ appId: 'chord', state: 'active', activeAppDeviceCount: targets.length,
        attentionConflictCount: 0, removalSafety: 'safe', dataset: { state: 'ready' } }] };
    } }),
    createLifecycleRepository: () => ({ async listAppEnvironments() {
      return targets.map((target) => ({ appId: 'chord', revokedAt: null, isCurrent: false,
        lastReport: { state: 'clean', reportedAt: now, attentionCount: 0 }, ...target }));
    } })
  });
}
const plain = () => diagnostics([{ id: ID_A, label: 'Chord Cruise', userLabel: 'Pixel' }]);
const text = (content) => ({ text: content, toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } });
const tools = (...names) => ({ text: '', toolCalls: names.map((name, index) => ({ id: `c${index}`, name,
  arguments: name === 'getAppSyncTargets' ? { appId: 'chord' } : {} })), usage: { inputTokens: 1, outputTokens: 1 } });
function provider(script) {
  const calls = [];
  return { calls, async complete(input) { calls.push(JSON.parse(JSON.stringify(input))); const next = script.shift();
    if (next instanceof Error) throw next; return next ?? text(GOOD); } };
}
// Every string anywhere in a request, recursively, with tool-result JSON parsed.
function allStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
    try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object') allStrings(parsed, out); } catch { /* text */ }
  } else if (Array.isArray(value)) value.forEach((item) => allStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => allStrings(item, out));
  return out;
}
function assertCleanRequests(calls) {
  for (const call of calls) {
    const withoutSystem = { ...call, messages: call.messages.filter((message) => message.role !== 'system') };
    for (const value of allStrings(withoutSystem)) assert.equal(containsSecret(value), false, `secret-like text reached the provider: ${value.slice(0, 20)}`);
  }
}

test('detector: context-aware split 4-digit codes are caught; ordinary numbers are not', () => {
  assert.equal(containsSecret, detectorContainsSecret, 'one detector for the whole Worker');
  for (const secret of ['Proの番号は 12 34', '暗証番号 1 2 3 4', 'コードは12-34', 'コードは2026', 'PIN: 9 8 7 6',
    'パスコード　１２　３４', '4桁は 0000 です', '1234 がProの番号です', '認証番号は12 34', 'パスワード 5 5 5 5']) {
    assert.equal(containsSecret(secret), true, secret);
  }
  for (const safe of ['2026年から使っています', 'エラー404', 'HTTP 500 が出ます', 'version 1234 です', 'エラー 404 が出ます',
    'コードクルーズが2026年から同期できない', 'コードクルーズが反映されない', 'Pro版で 2026-09-25 から同期できない',
    'Pro版 12/25 13:22 から', 'Port Pro 0.67.0', '4桁の番号は入力しないでください', '同期先 1234', '確認が3件あります']) {
    assert.equal(containsSecret(safe), false, safe);
  }
});

test('A/B/C: a split code in the message or in user/assistant history never reaches the provider', async () => {
  const cases = [
    { message: 'Proの番号は 12 34 です' },
    { message: '同期できません', history: [{ role: 'user', content: '暗証番号 1 2 3 4' }, { role: 'assistant', content: '了解です' }] },
    { message: '同期できません', history: [{ role: 'user', content: '質問' }, { role: 'assistant', content: 'コードは12-34ですね' }] }
  ];
  for (const input of cases) {
    const p = provider([text(GOOD)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: plain(), ...input });
    assert.equal(turn.egressBlocked, true);
    assert.equal(turn.reply, SECRET_REFUSAL);
    assert.equal(SECRET_REFUSAL, '4桁の番号や復旧コードなどが相談内容に含まれている可能性があります。該当部分を削除してから、もう一度お試しください。');
    assert.equal(p.calls.length, 0, 'no provider call');
  }
});

test('D/E: a secret-like sync target name falls back (registered → short ID → ref) and the turn continues', async () => {
  const d = diagnostics([
    { id: ID_A, userLabel: 'Proの番号 12 34', label: 'Chord Cruise' },
    { id: ID_B, userLabel: '暗証番号1234', label: 'PIN 5 6 7 8' }
  ]);
  const result = await d.getAppSyncTargets('chord');
  assert.deepEqual(result.targets.map((target) => [target.nameSource, target.displayName]), [
    ['registered', 'Chord Cruise'], ['shortId', `同期先 ${result.targets[1].shortId}`]]);
  assert.ok(result.targets[1].shortId.length <= 8, 'bounded short ID, never a full ID');
  assert.deepEqual(userControlledPaths(result), ['/data/targets/0/displayName', '/data/targets/0/reference'],
    'userControlledPaths matches the projection');
  const p = provider([tools('getAppSyncTargets'), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: d, message: 'コードクルーズがおかしい' });
  assert.equal(turn.reply, GOOD, 'the turn is not blocked');
  assert.equal(p.calls.length, 2);
  const sent = JSON.stringify(p.calls);
  for (const secret of ['12 34', '暗証番号1234', '5 6 7 8', ID_A, ID_B, ID_B.replace(/-/g, '')]) assert.equal(sent.includes(secret), false, secret);
  assertCleanRequests(p.calls);
  // With only a secret-like name and a too-short ID, the session ref is used.
  const refOnly = await diagnostics([{ id: 'ab', userLabel: 'Proの番号 12 34', label: null }]).getAppSyncTargets('chord');
  assert.deepEqual([refOnly.targets[0].nameSource, refOnly.targets[0].displayName], ['ref', `同期先 ${refOnly.targets[0].ref}`]);
});

test('F: any secret-like string in a tool result blocks the follow-up call', async () => {
  const leaky = { async getSyncOverview() { return { note: '暗証番号 1 2 3 4' }; }, async getAppSyncTargets() { return {}; } };
  const p = provider([tools('getSyncOverview'), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: leaky, message: '同期できません' });
  assert.equal(turn.egressBlocked, true);
  assert.equal(p.calls.length, 1, 'only the first (clean) call was sent');
});

test('G/H: a secret-like bad reply is never sent back in the repair; categories only in the fixed instruction', async () => {
  const bad = 'Proの番号 12 34 を入力して再同期ボタンを押してください。';
  assert.deepEqual(validateSupportReply(bad).violations, ['resync_button', 'secret_like']);
  const p = provider([tools('getSyncOverview'), text(bad), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません' });
  assert.equal(turn.reply, GOOD);
  assert.equal(p.calls.length, 3);
  const repair = p.calls[2];
  assert.equal(JSON.stringify(repair).includes('12 34'), false, 'the bad reply is not resent');
  assert.equal(repair.messages.some((message) => message.role === 'assistant' && message.content === bad), false);
  assert.equal(repair.messages.at(-1).content, repairInstruction(['resync_button', 'secret_like']));
  assert.match(repair.messages.at(-1).content, /4桁の番号やコードのように見える/);
  assertCleanRequests(p.calls);
  // A secret-like reply that fails again becomes the fixed fallback; it is never shown.
  const again = provider([text('暗証番号 1 2 3 4 です'), text('暗証番号 1 2 3 4 です')]);
  const fallback = await runSupportTurn({ provider: again, diagnostics: plain(), message: '同期できません' });
  assert.equal(fallback.reply, GUARD_FALLBACK_REPLY);
  assert.equal(JSON.stringify(again.calls[1]).includes('1 2 3 4'), false);
  // A bad reply without a secret is still passed back as its own assistant message (unchanged).
  const ui = provider([text('再同期ボタンを押してください。'), text(GOOD)]);
  await runSupportTurn({ provider: ui, diagnostics: plain(), message: '同期できません' });
  assert.deepEqual(ui.calls[1].messages.at(-2), { role: 'assistant', content: '再同期ボタンを押してください。' });
});

test('I: ordinary numbers without secret context still reach the model', async () => {
  const p = provider([text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '2026年から HTTP 500 とエラー404 が出ます。version 1234 です',
    history: [{ role: 'assistant', content: '同期先 1234 は 2026-09-25 に報告しています。' }] });
  assert.equal(turn.reply, GOOD);
  assert.equal(p.calls.length, 1);
});

test('J: text the model writes next to a tool call is checked before the follow-up call', async () => {
  const p = provider([{ text: 'Proの番号 12 34 を確認します', toolCalls: [{ id: 'c0', name: 'getSyncOverview', arguments: {} }] }, text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません' });
  assert.equal(turn.egressBlocked, true);
  assert.equal(p.calls.length, 1);
});

test('K: recursive inspection of every request in a full tool + repair turn', async () => {
  const p = provider([tools('getSyncOverview'), tools('getAppSyncTargets'), text('スナップショットが未検証です。'), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: diagnostics([
    { id: ID_A, userLabel: 'Proの番号 12 34', label: 'Chord Cruise' }, { id: ID_B, userLabel: 'iPhone', label: null }]),
  message: 'コードクルーズがおかしい', history: [{ role: 'user', content: '前回' }, { role: 'assistant', content: '前回の回答' }] });
  assert.equal(turn.reply, GOOD);
  assert.equal(p.calls.length, 4);
  assertCleanRequests(p.calls);
  for (const call of p.calls) {
    assert.equal(call.messages[0].content, AI_SUPPORT_SYSTEM_PROMPT);
    assert.equal(checkEgress(call), true);
  }
});

test('L: checkEgress covers user, assistant, tool_calls and tool content; system text is fixed and skipped', () => {
  const base = [{ role: 'system', content: AI_SUPPORT_SYSTEM_PROMPT }, { role: 'user', content: '同期できません' }];
  assert.equal(checkEgress({ messages: base }), true);
  assert.equal(checkEgress({ messages: [...base, { role: 'assistant', content: 'PIN 1 2 3 4' }] }), false);
  assert.equal(checkEgress({ messages: [...base, { role: 'assistant', content: '', tool_calls: [{ function: {
    name: 'getAppSyncTargets', arguments: JSON.stringify({ appId: '暗証番号 1234' }) } }] }] }), false);
  assert.equal(checkEgress({ messages: [...base, { role: 'tool', content: JSON.stringify({ data: { targets: [{ displayName: 'コードは12-34' }] } }) }] }), false);
  assert.equal(checkEgress({ messages: [...base, { role: 'tool', content: JSON.stringify({ data: { a: [{ b: { c: 'SAR1QF3G6WAY5XX090XFNZFK' } }] } }) }] }), false);
  assert.equal(checkEgress({ messages: [...base, { role: 'user', content: [{ type: 'text', text: 'Proの番号 12 34' }] }] }), false);
  const source = fs.readFileSync(path.join(import.meta.dirname, '../src/ai-support-egress.js'), 'utf8');
  assert.doesNotMatch(source, /console\.|match\(|\.exec\(/, 'only a yes/no leaves the guard; nothing is logged');
});

test('budget: at most 4 provider calls per turn; a 5th never reaches the provider', async () => {
  assert.equal(AI_SUPPORT_LIMITS.maxModelCalls, 4);
  assert.equal(AI_SUPPORT_LIMITS.maxModelCalls, AI_SUPPORT_LIMITS.maxModelRounds + 1);
  // Worst case: two tool rounds, a failing answer and a failing repair.
  const worst = provider([tools('getSyncOverview'), tools('getAppSyncTargets'), text('ログインし直してください。'),
    text('再同期ボタンを押してください。'), text(GOOD), text(GOOD)]);
  const turn = await runSupportTurn({ provider: worst, diagnostics: plain(), message: '同期できません' });
  assert.equal(worst.calls.length, 4);
  assert.equal(turn.reply, GUARD_FALLBACK_REPLY);
  // Endless tool calls stop at the round cap.
  const looping = provider(Array.from({ length: 10 }, () => tools('getSyncOverview')));
  await runSupportTurn({ provider: looping, diagnostics: plain(), message: 'ループ' });
  assert.ok(looping.calls.length <= 4);
  // The central budget itself.
  const raw = provider(Array.from({ length: 6 }, () => text(GOOD)));
  const guarded = guardedProvider(raw, { maxCalls: 4 });
  const request = { messages: [{ role: 'user', content: 'x' }], tools: [] };
  for (let index = 0; index < 4; index += 1) await guarded.complete(request);
  await assert.rejects(guarded.complete(request), ModelCallBudgetError);
  assert.equal(raw.calls.length, 4);
  await assert.rejects(guardedProvider(raw, { maxCalls: 4 }).complete({ messages: [{ role: 'user', content: 'PIN 1234' }] }), EgressBlockedError);
  assert.equal(raw.calls.length, 4, 'a blocked request is not sent');
});
