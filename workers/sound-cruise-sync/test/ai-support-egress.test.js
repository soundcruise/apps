import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runSupportTurn } from '../src/ai-support-chat.js';
import { EgressBlockedError, ModelCallBudgetError, guardedProvider, isProviderInputSafe } from '../src/ai-support-egress.js';
import { GUARD_FALLBACK_REPLY, repairInstruction, validateSupportReply } from '../src/ai-support-guard.js';
import {
  AI_SUPPORT_LIMITS, AI_SUPPORT_SYSTEM_PROMPT, AI_SUPPORT_TOOLS, FALLBACK_REPLIES, SECRET_REFUSAL, containsSecret
} from '../src/ai-support-policy.js';
import { containsFullId, containsSecret as detectorContainsSecret, containsSensitive } from '../src/secret-detector.js';
import { createNameSafety, createSyncDiagnostics, userControlledPaths } from '../src/ai-diagnostics.js';
import { createWorkersAiProvider } from '../src/ai-support-provider.js';

// AI1-C security fixes: the final provider egress guard, tool metadata, ID-like names and the
// 4-call budget. Synthetic data only; no real provider.

const GOOD = 'コードクルーズの行にある ⓘ を開き、「もう一度確認」が表示されている場合はタップしてください。';
const ACCOUNT_ID = '4714bf0c-f6bb-4edb-a29f-01fa9ae44daa';
const ACCOUNT_DEVICE_ID = '0d9e1c2b-3a4f-4b5c-8d6e-7f8091a2b3c4';
const ID_A = 'b91c7f00a1b2c3d4e5f60718293a4b5c';
const ID_B = 'c82d6e11f0e1d2c3b4a5968778695a4b';
const now = 1_800_000_000_000;
const forms = (id) => [id, id.toUpperCase(), id.replace(/-/g, ''), id.replace(/-/g, '').toUpperCase()];

function diagnostics(targets, identity = { accountId: ACCOUNT_ID, accountDeviceId: ACCOUNT_DEVICE_ID }) {
  return createSyncDiagnostics({
    session: {}, identity, now: () => now,
    createAccountRepository: () => ({ async getAccountSummary() {
      return { account: { state: 'active' }, memberships: [{ appId: 'chord', state: 'active', activeAppDeviceCount: targets.length,
        attentionConflictCount: 0, removalSafety: 'safe', dataset: { state: 'ready' } }] };
    } }),
    createLifecycleRepository: () => ({ async listAppEnvironments() {
      return targets.map((target) => ({ appId: 'chord', revokedAt: null, isCurrent: false, accountDeviceId: ACCOUNT_DEVICE_ID,
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
// Every string anywhere in a request (keys too), recursively, with JSON text parsed as well.
function allStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
    try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object') allStrings(parsed, out); } catch { /* text */ }
  } else if (Array.isArray(value)) value.forEach((item) => allStrings(item, out));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => { out.push(key); allStrings(item, out); });
  return out;
}
// The final provider request inspection: no secret-like text and no full ID anywhere dynamic.
function assertCleanRequests(calls, ids = [ACCOUNT_ID, ACCOUNT_DEVICE_ID, ID_A, ID_B]) {
  for (const call of calls) {
    const dynamic = { ...call, tools: undefined, messages: call.messages.filter((message) => message.content !== AI_SUPPORT_SYSTEM_PROMPT) };
    for (const value of allStrings(dynamic)) assert.equal(containsSensitive(value), false, `sensitive text reached the provider: ${value.slice(0, 16)}`);
    const whole = JSON.stringify(call);
    for (const id of ids) for (const form of forms(id)) assert.equal(whole.includes(form), false, `full ID reached the provider (${form.slice(0, 6)}…)`);
    assert.equal(isProviderInputSafe(call), true);
  }
}

// ------------------------------------------------------------------ Part A: detector

test('A: strong context catches 4 digits split by spaces, hyphens, slashes, dots and colons', () => {
  assert.equal(containsSecret, detectorContainsSecret, 'one detector for the whole Worker');
  for (const secret of ['Proコードは12/34', '暗証番号は1.2.3.4', 'PINは1:2:3:4', 'コードは12-34', 'Proの番号は 1 2 3 4',
    'Proの番号は 12 34', '暗証番号 1 2 3 4', 'コードは2026', 'PINは12:34', 'コードは1.2.3.4', 'Proのコードは１２／３４',
    '接続コード 12.34', '復旧コード：1・2・3・4', 'パスコード　１２　３４', '1234 がProの番号です', 'PIN:\n1234',
    'コードクルーズのProコードは12/34', '認証番号は12 34', '4桁は 0000 です']) {
    assert.equal(containsSecret(secret), true, secret);
  }
});

test('A: ordinary dates, times, versions, errors and 「コードクルーズ」 pass', () => {
  for (const safe of ['2026/09/25', '12:34', '1.2.3.4', 'version 1234', 'v1.2.3.4', 'version 1.2.3.4', 'HTTP 404', 'error 500',
    'エラー404', 'HTTP 500 が出ます', 'コードクルーズ', 'コードクルーズ 12/34', 'コードクルーズが12:34から同期できない',
    '2026年から使っています', 'Pro版で 2026-09-25 から同期できない', 'Pro版 12/25 13:22 から', 'Port Pro 0.67.0',
    '4桁の番号は入力しないでください', '同期先 1234', 'コードは2026年から', 'PINは入力しません。12:34に同期しました',
    'product 1234', 'problem 12 34', 'Proの番号は2026/09/25に変更', 'iPhone 15 Pro を使っています']) {
    assert.equal(containsSecret(safe), false, safe);
  }
});

test('A: full IDs are detected in any case and width; short IDs and refs are not', () => {
  for (const id of [...forms(ACCOUNT_ID), ...forms(ID_A), 'ｂ９１ｃ' + ID_A.slice(4)]) assert.equal(containsFullId(id), true, id);
  for (const safe of ['T1', 'T12', 'B91C7F', 'B91C7F00', 'deadbeef', 'Pixel', ID_A.slice(0, 31)]) assert.equal(containsFullId(safe), false, safe);
});

test('A/33: split codes in the message or in user/assistant history → provider call 0', async () => {
  const secrets = ['Proコードは12/34', '暗証番号は1.2.3.4', 'PINは1:2:3:4', 'コードは12-34', 'Proの番号は 1 2 3 4'];
  for (const secret of secrets) {
    for (const input of [
      { message: secret },
      { message: '同期できません', history: [{ role: 'user', content: secret }, { role: 'assistant', content: '了解です' }] },
      { message: '同期できません', history: [{ role: 'user', content: '質問' }, { role: 'assistant', content: secret }] }
    ]) {
      const p = provider([text(GOOD)]);
      const turn = await runSupportTurn({ provider: p, diagnostics: plain(), ...input });
      assert.equal(turn.egressBlocked, true, secret);
      assert.equal(turn.reply, SECRET_REFUSAL);
      assert.equal(p.calls.length, 0, 'no provider call');
    }
  }
  assert.equal(SECRET_REFUSAL, '4桁の番号や復旧コードなどが相談内容に含まれている可能性があります。該当部分を削除してから、もう一度お試しください。');
});

// ------------------------------------------------------------------ Part B: final egress

test('B: the provider itself refuses unsafe input right before AI.run (no bypass)', async () => {
  const runs = [];
  const ai = { async run(model, inputs) { runs.push(inputs); return { choices: [{ message: { content: 'はい' } }] }; } };
  const p = createWorkersAiProvider({ ai });
  const system = { role: 'system', content: AI_SUPPORT_SYSTEM_PROMPT };
  await p.complete({ messages: [system, { role: 'user', content: '同期できません' }], tools: AI_SUPPORT_TOOLS });
  assert.equal(runs.length, 1, 'the trusted system prompt and tool schema pass');
  const unsafe = [
    [system, { role: 'user', content: 'PINは1:2:3:4' }],
    [system, { role: 'assistant', content: '', tool_calls: [{ id: 'PIN 1234', type: 'function', function: { name: 'getSyncOverview', arguments: '{}' } }] }],
    [system, { role: 'tool', tool_call_id: 'コードは12/34', name: 'getSyncOverview', content: '{}' }],
    [system, { role: 'tool', tool_call_id: 'call_1', name: '暗証番号 1234', content: '{}' }],
    [system, { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'PIN 1234', function: { name: 'getSyncOverview', arguments: '{}' } }] }],
    [system, { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'getSyncOverview', arguments: '{"a":"Proコードは12/34"}' } }] }],
    [system, { role: 'tool', tool_call_id: 'call_1', name: 'getSyncOverview', content: JSON.stringify({ data: { x: [{ y: ACCOUNT_ID }] } }) }],
    [system, { role: 'user', content: '同期', extra: { nested: [ID_A.toUpperCase()] } }],
    [system, { role: 'user', content: [{ type: 'text', text: 'Proの番号 12 34' }] }],
    [{ role: 'system', content: `${AI_SUPPORT_SYSTEM_PROMPT} PIN 1234` }, { role: 'user', content: 'x' }],
    [{ role: 'system', content: 'PINは1:2:3:4' }, { role: 'user', content: 'x' }]
  ];
  for (const messages of unsafe) {
    await assert.rejects(p.complete({ messages }), EgressBlockedError);
  }
  await assert.rejects(p.complete({ messages: [system, { role: 'user', content: 'x' }],
    tools: [{ type: 'function', function: { name: 'PIN 1234', parameters: {} } }] }), EgressBlockedError, 'unknown tool schema');
  assert.equal(runs.length, 1, 'nothing unsafe reached AI.run');
});

test('B: exactly one AI.run call site, behind the guard', () => {
  const dir = path.join(import.meta.dirname, '../src');
  const sites = fs.readdirSync(dir).filter((file) => file.endsWith('.js')).flatMap((file) => {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    return /\bai\.run\(|\bAI\.run\(/.test(code) ? [file] : [];
  });
  assert.deepEqual(sites, ['ai-support-provider.js']);
  const provider = fs.readFileSync(path.join(dir, 'ai-support-provider.js'), 'utf8');
  assert.ok(provider.indexOf('isProviderInputSafe(inputs)') < provider.indexOf('ai.run('), 'checked before AI.run');
  const egress = fs.readFileSync(path.join(dir, 'ai-support-egress.js'), 'utf8');
  assert.doesNotMatch(egress, /console\.|\.exec\(/, 'only a yes/no leaves the guard; nothing is logged');
});

test('B/35: model tool-call metadata is never resent; the Worker writes ids, names and arguments', async () => {
  const hostile = { text: '暗証番号 1 2 3 4 を確認します', usage: {}, toolCalls: [
    { id: 'PIN 1234', name: 'getSyncOverview', arguments: {} },
    { id: 'コードは12/34', name: 'getAppSyncTargets', arguments: { appId: 'chord', note: 'Proコードは12/34' } }] };
  const p = provider([hostile, text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません' });
  assert.equal(turn.reply, GOOD);
  assert.equal(p.calls.length, 2);
  const follow = p.calls[1].messages;
  const assistant = follow.find((message) => message.role === 'assistant');
  assert.equal(assistant.content, '', 'the model text next to a tool call is not resent');
  assert.deepEqual(assistant.tool_calls, [
    { id: 'call_1', type: 'function', function: { name: 'getSyncOverview', arguments: '{}' } },
    { id: 'call_2', type: 'function', function: { name: 'getAppSyncTargets', arguments: '{}' } }]);
  assert.deepEqual(follow.filter((message) => message.role === 'tool').map((message) => [message.tool_call_id, message.name]),
    [['call_1', 'getSyncOverview'], ['call_2', 'getAppSyncTargets']]);
  assertCleanRequests(p.calls);
  // An unexpected function name ends the turn (fail closed): no follow-up call at all.
  for (const name of ['PIN 1234', 'コードは12/34', 'runSql', '', null]) {
    const q = provider([{ text: '', usage: {}, toolCalls: [{ id: 'x', name, arguments: {} }] }, text(GOOD)]);
    const failed = await runSupportTurn({ provider: q, diagnostics: plain(), message: '同期できません' });
    assert.equal(failed.reply, FALLBACK_REPLIES.noAnswer, String(name));
    assert.equal(failed.unsafeToolCall, true);
    assert.equal(q.calls.length, 1, 'never resent');
  }
});

test('B: a secret-like string inside a tool result blocks the follow-up call', async () => {
  const leaky = { async getSyncOverview() { return { note: 'PINは1:2:3:4' }; }, async getAppSyncTargets() { return {}; } };
  const p = provider([tools('getSyncOverview'), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: leaky, message: '同期できません' });
  assert.equal(turn.egressBlocked, true);
  assert.equal(p.calls.length, 1);
  const idLeak = { async getSyncOverview() { return { note: ID_A }; }, async getAppSyncTargets() { return {}; } };
  const q = provider([tools('getSyncOverview'), text(GOOD)]);
  assert.equal((await runSupportTurn({ provider: q, diagnostics: idLeak, message: '同期できません' })).egressBlocked, true);
  assert.equal(q.calls.length, 1);
});

// ------------------------------------------------------------------ Part C: ID-like names

test('C/36/37: ID-like names fall back to a safe registered label, then short ID, then T-ref', async () => {
  const idLabels = [...forms(ACCOUNT_ID), ...forms(ACCOUNT_DEVICE_ID), ID_A, ID_A.toUpperCase(),
    ID_A.match(/.{4}/g).join(' '), `端末 ${ID_B.toUpperCase()}`, '0123456789abcdef0123456789abcdef'];
  for (const idLabel of idLabels) {
    const d = diagnostics([{ id: ID_A, userLabel: idLabel, label: 'Chord Cruise' }, { id: ID_B, userLabel: 'iPhone', label: idLabel }]);
    const result = await d.getAppSyncTargets('chord');
    assert.deepEqual(result.targets.map((target) => [target.nameSource, target.displayName]),
      [['registered', 'Chord Cruise'], ['user', 'iPhone']], idLabel);
    const both = await diagnostics([{ id: ID_A, userLabel: idLabel, label: idLabel }, { id: ID_B, userLabel: null, label: idLabel }]).getAppSyncTargets('chord');
    assert.deepEqual(both.targets.map((target) => target.nameSource), ['shortId', 'shortId'], idLabel);
    for (const target of both.targets) assert.ok(target.shortId.length <= 8 && target.displayName === `同期先 ${target.shortId}`);
    assert.deepEqual(userControlledPaths(both), [], 'no user-written name is left');
    assert.equal(JSON.stringify(both).includes(idLabel), false);
  }
  // Too-short IDs → session refs, never a longer piece of an ID.
  const refs = await diagnostics([{ id: 'ab', userLabel: ACCOUNT_ID, label: null }]).getAppSyncTargets('chord');
  assert.deepEqual([refs.targets[0].nameSource, refs.targets[0].displayName], ['ref', '同期先 T1']);
  // Known internal IDs are caught even when they would not look like a UUID any more.
  const safe = createNameSafety([ACCOUNT_ID]);
  assert.equal(safe(`id:${ACCOUNT_ID.replace(/-/g, '_').toUpperCase()}`), false);
  assert.equal(safe('Pixel 8'), true);
  assert.equal(safe('B91C7F'), true, 'a short prefix is fine');
});

test('C/38: a turn with ID-like names sends no full Account or Device ID in any form', async () => {
  const d = diagnostics([{ id: ID_A, userLabel: ACCOUNT_ID.toUpperCase(), label: ID_A }, { id: ID_B, userLabel: ID_B.toUpperCase(), label: 'iPhone Safari' }]);
  const p = provider([tools('getSyncOverview'), tools('getAppSyncTargets'), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: d, message: 'コードクルーズがおかしい' });
  assert.equal(turn.reply, GOOD, 'not blocked: the names fell back');
  assert.equal(p.calls.length, 3);
  assertCleanRequests(p.calls);
  const targets = JSON.parse(p.calls[2].messages.find((message) => message.name === 'getAppSyncTargets').content).data.targets;
  assert.deepEqual(targets.map((target) => target.displayName), [`同期先 ${targets[0].shortId}`, 'iPhone Safari']);
});

test('39: bounded short IDs and T-refs are never blocked', async () => {
  const d = diagnostics([{ id: ID_A, userLabel: null, label: null }, { id: 'b91c7f00ffff0000', userLabel: null, label: null }, { id: 'x', label: null }]);
  const p = provider([tools('getAppSyncTargets'), text('同期先 B91C7F と T3 を確認してください。')]);
  const turn = await runSupportTurn({ provider: p, diagnostics: d, message: '同期先 B91C7F00 と T1 は？' });
  assert.equal(turn.reply, '同期先 B91C7F と T3 を確認してください。');
  assert.equal(p.calls.length, 2);
  assertCleanRequests(p.calls);
});

// ------------------------------------------------------------------ Part D: repair

test('D/34: a bad reply with a code or full ID is never sent back; categories only', async () => {
  const cases = [
    ['Proコードは12/34です。再同期ボタンを押してください。', ['resync_button', 'secret_like'], '12/34'],
    [`端末 ${ID_A} で再同期ボタンを押してください。`, ['resync_button', 'full_id'], ID_A],
    // A UUID also has the legacy recovery-code shape (4-character groups); both categories apply.
    [`アカウント ${ACCOUNT_ID} です。`, ['secret_like', 'full_id'], ACCOUNT_ID],
    [`アカウント ${ACCOUNT_ID.toUpperCase()} です。`, ['secret_like', 'full_id'], ACCOUNT_ID.toUpperCase()]
  ];
  for (const [bad, violations, raw] of cases) {
    assert.deepEqual(validateSupportReply(bad).violations, violations);
    const p = provider([tools('getSyncOverview'), text(bad), text(GOOD)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません' });
    assert.equal(turn.reply, GOOD);
    assert.equal(p.calls.length, 3);
    const repair = p.calls[2];
    assert.equal(JSON.stringify(repair).includes(raw), false, 'the bad reply is not resent');
    assert.equal(repair.messages.at(-1).content, repairInstruction(violations));
    assertCleanRequests(p.calls);
  }
  // A code-like reply that fails again becomes the fixed fallback; it is never shown.
  const again = provider([text('PINは1:2:3:4 です'), text('PINは1:2:3:4 です')]);
  const fallback = await runSupportTurn({ provider: again, diagnostics: plain(), message: '同期できません' });
  assert.equal(fallback.reply, GUARD_FALLBACK_REPLY);
  assert.equal(JSON.stringify(again.calls[1]).includes('1:2:3:4'), false);
  // A bad reply without a secret is still passed back as its own assistant message (unchanged).
  const ui = provider([text('再同期ボタンを押してください。'), text(GOOD)]);
  await runSupportTurn({ provider: ui, diagnostics: plain(), message: '同期できません' });
  assert.deepEqual(ui.calls[1].messages.at(-2), { role: 'assistant', content: '再同期ボタンを押してください。' });
});

test('D/25: when a safe repair request cannot be built, the fallback comes without a model call', async () => {
  // Simulate conversation state that became unsafe after the earlier checks (defence in depth):
  // the repair request is checked before it is sent, and no call is made.
  const calls = [];
  const mutating = { async complete(input) {
    calls.push(input);
    input.messages.push({ role: 'user', content: 'PINは1:2:3:4' });
    return text('再同期ボタンを押してください。');
  } };
  const turn = await runSupportTurn({ provider: mutating, diagnostics: plain(), message: '同期できません' });
  assert.equal(turn.reply, GUARD_FALLBACK_REPLY);
  assert.equal(turn.stats.fallback, true);
  assert.equal(calls.length, 1, 'no repair call');
});

// ------------------------------------------------------------------ K / budget

test('K: recursive inspection of every request in a full tool + repair turn', async () => {
  const p = provider([tools('getSyncOverview'), tools('getAppSyncTargets'), text('スナップショットが未検証です。'), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: diagnostics([
    { id: ID_A, userLabel: 'Proの番号 12/34', label: 'Chord Cruise' }, { id: ID_B, userLabel: ACCOUNT_ID, label: null }]),
  message: 'コードクルーズがおかしい', history: [{ role: 'user', content: '前回 12:34 に同期' }, { role: 'assistant', content: 'v1.2.3.4 ですね' }] });
  assert.equal(turn.reply, GOOD);
  assert.equal(p.calls.length, 4);
  assertCleanRequests(p.calls);
  for (const call of p.calls) assert.equal(call.messages[0].content, AI_SUPPORT_SYSTEM_PROMPT);
});

test('42: at most 4 provider calls per turn; blocked requests add no retries', async () => {
  assert.equal(AI_SUPPORT_LIMITS.maxModelCalls, 4);
  assert.equal(AI_SUPPORT_LIMITS.maxModelCalls, AI_SUPPORT_LIMITS.maxModelRounds + 1);
  const worst = provider([tools('getSyncOverview'), tools('getAppSyncTargets'), text('ログインし直してください。'),
    text('再同期ボタンを押してください。'), text(GOOD), text(GOOD)]);
  const turn = await runSupportTurn({ provider: worst, diagnostics: plain(), message: '同期できません' });
  assert.equal(worst.calls.length, 4);
  assert.equal(turn.reply, GUARD_FALLBACK_REPLY);
  const looping = provider(Array.from({ length: 10 }, () => tools('getSyncOverview')));
  await runSupportTurn({ provider: looping, diagnostics: plain(), message: 'ループ' });
  assert.ok(looping.calls.length <= 4);
  // Blocked turns stop at once.
  const leaky = { async getSyncOverview() { return { note: 'PIN 1234' }; }, async getAppSyncTargets() { return {}; } };
  const blocked = provider(Array.from({ length: 6 }, () => tools('getSyncOverview')));
  await runSupportTurn({ provider: blocked, diagnostics: leaky, message: '同期できません' });
  assert.equal(blocked.calls.length, 1);
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

// ------------------------------------------------------------------ Final focused review blockers

const REVERSE = ['12/34がPINです', '1.2.3.4 が暗証番号です', '1:2:3:4 がProコードです', '12-34 が接続コードです',
  '１２／３４がＰＩＮです', '１．２．３．４ が暗証番号です', '「12/34」がPINです', '12/34  が  復旧コードです'];
// Every separator form of an ID: canonical, upper, hyphenless, _, /, whitespace, 4-char groups, mixed, full-width.
function idVariants(id) {
  const hex = id.replace(/-/g, '');
  const groups = hex.match(/.{4}/g);
  return [id, id.toUpperCase(), hex, hex.toUpperCase(), id.replace(/-/g, '_'), id.replace(/-/g, '/'), id.replace(/-/g, ' '),
    groups.join('_'), groups.join(' / '), `${hex.slice(0, 8)}_${hex.slice(8, 12).toUpperCase()}/${hex.slice(12, 16)} ${hex.slice(16, 20)}-${hex.slice(20)}`,
    id.replace(/-/g, '＿').replace(/[0-9a-f]/g, (char) => String.fromCodePoint(char.codePointAt(0) + 0xfee0))];
}
const APP_DEVICE_ID = 'e3f2a1b0-9c8d-4e7f-a6b5-c4d3e2f1a0b9';
const KNOWN = [ACCOUNT_ID, ACCOUNT_DEVICE_ID, APP_DEVICE_ID];

test('R1: reverse strong context blocks slash/dot/colon/hyphen codes; forward blocks and allows unchanged', () => {
  for (const secret of [...REVERSE, 'Proコードは12/34', '暗証番号は1.2.3.4', 'PINは1:2:3:4', 'コードは12-34', 'Proの番号は 1 2 3 4']) {
    assert.equal(containsSecret(secret), true, secret);
  }
  for (const safe of ['2026/09/25', '12:34', 'version 1.2.3.4', 'v1.2.3.4', 'version 1234', 'error 404', 'HTTP 500',
    'コードクルーズ 12/34', '2026年', '12:34にPINを入力しました', '12/25のPINの変更', '12:34は私のPINを入れた時刻', '2026/09/25がPINの変更日']) {
    assert.equal(containsSecret(safe), false, safe);
  }
});

test('R4: reverse-context codes in the message or user/assistant history → provider call 0', async () => {
  for (const secret of REVERSE) {
    for (const input of [
      { message: secret },
      { message: '同期できません', history: [{ role: 'user', content: secret }, { role: 'assistant', content: '了解です' }] },
      { message: '同期できません', history: [{ role: 'user', content: '質問' }, { role: 'assistant', content: secret }] }
    ]) {
      const p = provider([text(GOOD)]);
      const turn = await runSupportTurn({ provider: p, diagnostics: plain(), ...input });
      assert.equal(turn.egressBlocked, true, secret);
      assert.equal(p.calls.length, 0);
    }
  }
});

test('R5: a reverse-context bad reply is never resent; fixed categories only; unsafe repair → no call', async () => {
  const bad = '12/34がPINです。再同期ボタンを押してください。';
  assert.deepEqual(validateSupportReply(bad).violations, ['resync_button', 'secret_like']);
  const p = provider([tools('getSyncOverview'), text(bad), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません' });
  assert.equal(turn.reply, GOOD);
  assert.equal(p.calls.length, 3, 'one repair, no extra loop');
  assert.equal(JSON.stringify(p.calls[2]).includes('12/34'), false);
  assert.equal(p.calls[2].messages.at(-1).content, repairInstruction(['resync_button', 'secret_like']));
  assertCleanRequests(p.calls);
  const twice = provider([text(bad), text(bad), text(GOOD)]);
  const fallback = await runSupportTurn({ provider: twice, diagnostics: plain(), message: '同期できません' });
  assert.equal(fallback.reply, GUARD_FALLBACK_REPLY);
  assert.equal(twice.calls.length, 2);
  // Unsafe repair context (state changed after the earlier checks) → deterministic fallback, no call.
  const calls = [];
  const mutating = { async complete(input) { calls.push(input); input.messages.push({ role: 'user', content: '12/34がPINです' }); return text(bad); } };
  const closed = await runSupportTurn({ provider: mutating, diagnostics: plain(), message: '同期できません' });
  assert.equal(closed.reply, GUARD_FALLBACK_REPLY);
  assert.equal(calls.length, 1);
});

test('R6: known internal IDs in any separator form never reach the provider (message, history, reply)', async () => {
  for (const id of KNOWN) {
    for (const form of idVariants(id)) {
      for (const input of [
        { message: `端末は ${form} です` },
        { message: '同期できません', history: [{ role: 'user', content: form }, { role: 'assistant', content: '了解です' }] },
        { message: '同期できません', history: [{ role: 'user', content: '質問' }, { role: 'assistant', content: `ID ${form}` }] }
      ]) {
        const p = provider([text(GOOD)]);
        const turn = await runSupportTurn({ provider: p, diagnostics: plain(), knownIds: KNOWN, ...input });
        assert.equal(turn.egressBlocked, true, 'known ID form must be blocked');
        assert.equal(p.calls.length, 0);
      }
      // A reply carrying the ID is a full_id violation and is never resent in the repair.
      const q = provider([text(`端末 ${form} で再同期ボタンを押してください。`), text(GOOD)]);
      const turn = await runSupportTurn({ provider: q, diagnostics: plain(), knownIds: KNOWN, message: '同期できません' });
      assert.equal(turn.reply, GOOD);
      assert.equal(q.calls.length, 2);
      assert.ok(turn.stats.guardViolations.includes('full_id'));
      assert.equal(JSON.stringify(q.calls[1]).includes(form), false);
      assertCleanRequests(q.calls, KNOWN);
    }
  }
  // Short prefixes and ordinary text stay allowed.
  const ok = provider([text(GOOD)]);
  await runSupportTurn({ provider: ok, diagnostics: plain(), knownIds: KNOWN, message: `同期先 ${APP_DEVICE_ID.slice(0, 8)} と T1 は？` });
  assert.equal(ok.calls.length, 1);
});

test('R7: the final AI.run guard refuses known IDs and reverse-context codes on its own', async () => {
  const runs = [];
  const ai = { async run(model, inputs) { runs.push(inputs); return { choices: [{ message: { content: 'はい' } }] }; } };
  const p = createWorkersAiProvider({ ai, knownIds: KNOWN });
  const system = { role: 'system', content: AI_SUPPORT_SYSTEM_PROMPT };
  for (const id of KNOWN) {
    for (const form of idVariants(id)) {
      await assert.rejects(p.complete({ messages: [system, { role: 'user', content: form }] }), EgressBlockedError);
      await assert.rejects(p.complete({ messages: [system, { role: 'tool', tool_call_id: 'call_1', name: 'getSyncOverview',
        content: JSON.stringify({ data: { note: form } }) }] }), EgressBlockedError);
    }
  }
  for (const secret of REVERSE) await assert.rejects(p.complete({ messages: [system, { role: 'user', content: secret }] }), EgressBlockedError);
  assert.equal(runs.length, 0, 'nothing reached AI.run');
});

test('R11 (LOW): unknown top-level keys are inspected like any other key', () => {
  const messages = [{ role: 'system', content: AI_SUPPORT_SYSTEM_PROMPT }, { role: 'user', content: '同期できません' }];
  assert.equal(isProviderInputSafe({ messages }), true);
  assert.equal(isProviderInputSafe({ messages, 'PIN 1234': 1 }), false);
  assert.equal(isProviderInputSafe({ messages, [ACCOUNT_ID]: true }), false);
  assert.equal(isProviderInputSafe({ messages, [ACCOUNT_ID.replace(/-/g, '_')]: true },
    { containsKnownId: (value) => value.replace(/[^0-9a-z]/gi, '').toLowerCase().includes(ACCOUNT_ID.replace(/-/g, '')) }), false);
});

test('R6: diagnostics know Account, Account device and App device IDs and refuse them as names in any form', async () => {
  const d = createSyncDiagnostics({
    session: {}, identity: { accountId: ACCOUNT_ID, accountDeviceId: ACCOUNT_DEVICE_ID }, now: () => now,
    createAccountRepository: () => ({ async getAccountSummary() {
      return { account: { state: 'active' }, memberships: [{ appId: 'chord', state: 'active', activeAppDeviceCount: 2,
        attentionConflictCount: 0, removalSafety: 'safe', dataset: { state: 'ready' } }] };
    } }),
    createLifecycleRepository: () => ({
      async listEnvironments() { return [{ id: ACCOUNT_DEVICE_ID }, { id: 'f00dcafe-0000-4000-8000-00000000beef' }]; },
      async listAppEnvironments() {
        return [APP_DEVICE_ID, ID_B].map((id, index) => ({ id, appId: 'chord', revokedAt: null, isCurrent: false,
          lastReport: { state: 'clean', reportedAt: now, attentionCount: 0 },
          userLabel: index ? 'f00dcafe_0000_4000_8000_00000000beef'.slice(0, 40) : APP_DEVICE_ID.replace(/-/g, '/'), label: 'iPhone Safari' }));
      }
    })
  });
  const known = await d.knownIds();
  for (const id of [ACCOUNT_ID, ACCOUNT_DEVICE_ID, APP_DEVICE_ID, ID_B, 'f00dcafe-0000-4000-8000-00000000beef']) assert.ok(known.includes(id));
  const result = await d.getAppSyncTargets('chord');
  assert.deepEqual(result.targets.map((target) => [target.nameSource, target.displayName]),
    [['registered', 'iPhone Safari'], ['registered', 'iPhone Safari']], 'ID-like names fell back');
  const safe = createNameSafety(known);
  for (const id of KNOWN) for (const form of idVariants(id)) assert.equal(safe(`端末 ${form}`), false);
});

// ------------------------------------------------------------------ Four-digit false positive fix

const BENIGN_FOUR_DIGITS = ['同期先の番号は1234です', '同期先番号は1234です', '端末の番号は1234です', '端末番号は1234です',
  '機器番号は1234です', '管理番号は1234です', '対象番号は1234です',
  '同期先1234で同期に不具合があるみたいなんですが、解消の仕方がわかりません', '同期先 1234 だけ同期されません',
  '端末ID 1234を確認したいです', 'エラー1234が表示されました'];
const SECRET_FOUR_DIGITS = ['PINは1234です', '1234がPINです', '暗証番号は1234です', '1234が暗証番号です', 'Proコードは1234です',
  '1234がProコードです', 'Proの番号は1234です', '1234がProの番号です', '認証番号は1234です', '1234が認証番号です',
  '接続コードは1234です', '復旧コードは1234です', 'Proコードは12/34', '12/34がPINです', '1.2.3.4 が暗証番号です', '1:2:3:4 がProコードです'];

test('FP: a bare 番号 is not a secret context; explicit secret contexts still block', async () => {
  for (const benign of BENIGN_FOUR_DIGITS) assert.equal(containsSecret(benign), false, benign);
  for (const secret of SECRET_FOUR_DIGITS) assert.equal(containsSecret(secret), true, secret);
  // The direct regression reaches the model; Proの番号 does not.
  const ok = provider([text(GOOD)]);
  const turn = await runSupportTurn({ provider: ok, diagnostics: plain(), message: '同期先の番号は1234です' });
  assert.equal(turn.reply, GOOD);
  assert.equal(ok.calls.length, 1);
  for (const secret of ['Proの番号は1234です', '認証番号は1234です']) {
    const p = provider([text(GOOD)]);
    assert.equal((await runSupportTurn({ provider: p, diagnostics: plain(), message: secret })).egressBlocked, true);
    assert.equal(p.calls.length, 0);
  }
});

test('FP: benign four-digit display names are kept; secret-like and ID-like names fall back', () => {
  const safe = createNameSafety(KNOWN);
  for (const name of ['同期先の番号は1234', '同期先1234', 'iPhone 1234', 'Pixel 1234', 'MacBook 1234']) assert.equal(safe(name), true, name);
  for (const name of ['PIN 1234', '暗証番号1234', 'Proの番号1234', ACCOUNT_ID, ID_A, APP_DEVICE_ID.replace(/-/g, '_')]) {
    assert.equal(safe(name), false, 'unsafe name falls back');
  }
});

// ------------------------------------------------------------------ Degenerate output guard

import { DEGENERATE_FALLBACK_REPLY, isDegenerateReply } from '../src/ai-support-guard.js';

const DEGENERATE = ['!'.repeat(900), '！'.repeat(300), '?'.repeat(40), `\n${'! '.repeat(200)}\n`, `  ${'。'.repeat(30)}  `];
const NORMAL_REPLIES = ['はい！', 'いいえ。', '同期済みです！', '同期済みです。', 'Pixel側を確認してください。', '確認が必要です！',
  '「同期済み」と表示されています。', 'エラー404が表示されている場合は、もう一度状態を確認してください。', 'T1を確認してください。', GOOD,
  'まず同期センターでコードクルーズの行にある ⓘ を開いてください。次に Pixel でアプリを開き、設定 → クラウド同期を確認してください。'];

test('DG1-4 / 5-10: only obviously broken output is degenerate', () => {
  for (const bad of DEGENERATE) {
    assert.equal(isDegenerateReply(bad), true, JSON.stringify(bad.slice(0, 8)));
    assert.deepEqual(validateSupportReply(bad).violations, ['degenerate_output']);
  }
  for (const ok of NORMAL_REPLIES) {
    assert.equal(isDegenerateReply(ok), false, ok);
    assert.equal(validateSupportReply(ok).ok, true, ok);
  }
  assert.equal(validateSupportReply(DEGENERATE_FALLBACK_REPLY).ok, true, 'the fallback passes the guard itself');
  assert.doesNotMatch(DEGENERATE_FALLBACK_REPLY, /エラー|provider|AI|番号|コード|ボタン/, 'no internal cause, no UI claim, no code request');
  assert.match(repairInstruction(['degenerate_output']), /意味のある文章になっていなかった/);
});

test('Case A: degenerate → one repair (bad reply not resent) → only the repaired reply reaches the user', async () => {
  const p = provider([text('!'.repeat(900)), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期先の番号は1234です' });
  assert.equal(turn.reply, GOOD);
  assert.equal(p.calls.length, 2);
  assert.deepEqual(turn.stats.guardViolations, ['degenerate_output']);
  const repair = p.calls[1];
  assert.equal(repair.messages.some((message) => message.role === 'assistant'), false, 'the degenerate reply is not sent back');
  assert.equal(repair.messages.at(-1).content, repairInstruction(['degenerate_output']));
  assert.equal(p.calls[0].messages.at(-1).content, '同期先の番号は1234です', 'the benign 4-digit input still reaches the model');
  assertCleanRequests(p.calls);
});

test('Case B: degenerate twice → short fixed reply, no further call', async () => {
  for (const second of [text('！'.repeat(300)), text('?'.repeat(40)), new Error('provider down'), text('')]) {
    const p = provider([text('!'.repeat(900)), second, text(GOOD)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期先の番号は1234です' });
    assert.equal(turn.reply, DEGENERATE_FALLBACK_REPLY);
    assert.equal(p.calls.length, 2, 'one repair only');
    assert.equal(turn.stats.fallback, true);
  }
});

test('Case C: no call left in the budget → fixed reply without a model call; never more than 4 calls', async () => {
  const p = provider([tools('getSyncOverview'), tools('getAppSyncTargets'), text('!'.repeat(900)), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません', maxModelCalls: 3 });
  assert.equal(turn.reply, DEGENERATE_FALLBACK_REPLY);
  assert.equal(p.calls.length, 3, 'no repair call without budget');
  assert.equal(turn.stats.repairAttempted, false);
  // Full budget: tool, tool, degenerate, repair = 4, and a degenerate repair adds nothing.
  const worst = provider([tools('getSyncOverview'), tools('getAppSyncTargets'), text('!'.repeat(900)), text('!'.repeat(900)), text(GOOD)]);
  const full = await runSupportTurn({ provider: worst, diagnostics: plain(), message: '同期できません' });
  assert.equal(worst.calls.length, 4);
  assert.equal(full.reply, DEGENERATE_FALLBACK_REPLY);
  // The budget can only be lowered, never raised.
  const raised = provider(Array.from({ length: 8 }, () => tools('getSyncOverview')).concat([text('!'.repeat(50)), text(GOOD)]));
  await runSupportTurn({ provider: raised, diagnostics: plain(), message: '同期できません', maxModelCalls: 99 });
  assert.ok(raised.calls.length <= 4);
});

test('Case D: a degenerate reply carrying a code or a known ID is never resent', async () => {
  for (const bad of [`${'!'.repeat(60)} PINは1:2:3:4`, `${'!'.repeat(60)} ${ACCOUNT_ID.replace(/-/g, '_')}`]) {
    const p = provider([text(bad), text(GOOD)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: plain(), knownIds: KNOWN, message: '同期できません' });
    assert.equal(turn.reply, GOOD);
    assert.equal(p.calls.length, 2);
    assert.equal(JSON.stringify(p.calls[1]).includes('!!!!!'), false);
    assertCleanRequests(p.calls, KNOWN);
  }
});
