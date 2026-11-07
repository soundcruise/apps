import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runSupportTurn } from '../src/ai-support-chat.js';
import { EgressBlockedError, ModelCallBudgetError, guardedProvider, isProviderInputSafe } from '../src/ai-support-egress.js';
import { GUARD_FALLBACK_REPLY, validateSupportReply } from '../src/ai-support-guard.js';
import {
  AI_SUPPORT_LIMITS, AI_SUPPORT_SYSTEM_PROMPT, AI_SUPPORT_TOOLS, FALLBACK_REPLIES, SECRET_REFUSAL, containsSecret
} from '../src/ai-support-policy.js';
import { containsFullId, containsSecret as detectorContainsSecret, containsSensitive } from '../src/secret-detector.js';
import { createNameSafety, createSyncDiagnostics, userControlledPaths } from '../src/ai-diagnostics.js';
import { createWorkersAiProvider } from '../src/ai-support-provider.js';

// AI1-C security fixes: the final provider egress guard, tool metadata, ID-like names and the
// 4-call budget. Synthetic data only; no real provider.

const GOOD = '前回の報告に完了したものがあります。';
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
const text = (content) => ({ text: JSON.stringify({ explanation: content, actions: [], questionId: 'none' }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } });
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

test('B/35: model tool metadata is discarded; only preloaded trusted diagnostics are sent', async () => {
  for (const name of ['getSyncOverview', 'PIN 1234', 'コードは12/34', 'runSql', '', null]) {
    const p = provider([{ text: '', usage: {}, toolCalls: [{ id: 'PIN 1234', name, arguments: { note: 'コードは12/34' } }] }]);
    const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: 'コードクルーズがおかしい' });
    assert.equal(p.calls.length, 1);
    assert.equal(turn.stats.rejectedToolCalls, 1);
    assert.equal(turn.stats.toolCalls, 2);
    assert.equal(turn.stats.fallback, true);
    assert.doesNotMatch(turn.reply, /PIN|12\/34|runSql/);
    assert.deepEqual(p.calls[0].messages.filter((m) => m.role === 'tool').map((m) => m.name), ['getSyncOverview', 'getAppSyncTargets']);
    assertCleanRequests(p.calls);
  }
});

test('B: unexpected diagnostic fields are projected away; secrets in an allowed field still block', async () => {
  for (const note of ['PINは1:2:3:4', ID_A]) {
    const p = provider([text(GOOD)]);
    const projected = { async getSyncOverview() { return { apps: [], note }; } };
    await runSupportTurn({ provider: p, diagnostics: projected, message: '同期できません' });
    assert.equal(p.calls.length, 1);
    assert.equal(JSON.stringify(p.calls).includes(note), false);
    assertCleanRequests(p.calls);
  }
  const p = provider([text(GOOD)]);
  const leaky = { async getSyncOverview() { return { accountState: 'PINは1:2:3:4', apps: [] }; } };
  assert.equal((await runSupportTurn({ provider: p, diagnostics: leaky, message: '同期できません' })).egressBlocked, true);
  assert.equal(p.calls.length, 0);
});

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

test('C/38: ID-like and private names are absent from the single model request', async () => {
  const d = diagnostics([{ id: ID_A, userLabel: ACCOUNT_ID.toUpperCase(), label: ID_A }, { id: ID_B, userLabel: ID_B.toUpperCase(), label: 'iPhone Safari' }]);
  const p = provider([text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: d, message: 'コードクルーズがおかしい' });
  assert.ok(turn.reply.includes(GOOD));
  assert.equal(p.calls.length, 1);
  assertCleanRequests(p.calls);
  const targets = JSON.parse(p.calls[0].messages.find((m) => m.name === 'getAppSyncTargets').content).data.targets;
  for (const target of targets) assert.deepEqual(Object.keys(target), ['reportState', 'reportedAt', 'attentionCount']);
  assert.equal(JSON.stringify(p.calls).includes('iPhone Safari'), false);
});

test('39: bounded short IDs and T-refs in the user question remain permitted', async () => {
  const p = provider([text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期先 B91C7F00 と T1 は？' });
  assert.ok(turn.reply.includes(GOOD));
  assert.equal(p.calls.length, 1);
  assertCleanRequests(p.calls);
});

test('D/34: secret-bearing model output is refused without resending or another inference', async () => {
  for (const bad of ['Proコードは12/34です。', ID_A, ACCOUNT_ID, ACCOUNT_ID.toUpperCase()]) {
    const p = provider([text(bad), text(GOOD)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません' });
    assert.equal(turn.reply, GUARD_FALLBACK_REPLY);
    assert.equal(p.calls.length, 1);
    assert.deepEqual(turn.stats.guardViolations, ['sensitive_output']);
    assertCleanRequests(p.calls);
  }
});

test('D/25: no repair request is built even if provider input mutates', async () => {
  const calls = [];
  const p = { async complete(input) { calls.push(input); input.messages.push({ role: 'user', content: 'PINは1:2:3:4' }); return text('Proコードは12/34です。'); } };
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません' });
  assert.equal(turn.reply, GUARD_FALLBACK_REPLY);
  assert.equal(calls.length, 1);
});

test('K: recursively inspect the complete request including preloaded tools and response schema', async () => {
  const p = provider([text(GOOD)]);
  await runSupportTurn({ provider: p, diagnostics: plain(), message: 'コードクルーズが同期しません' });
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].responseFormat.type, 'json_schema');
  assertCleanRequests(p.calls);
});

test('42: one inference per turn; a caller cannot raise that limit', async () => {
  for (const maxModelCalls of [0, 1, 4, 99]) {
    const p = provider(Array.from({ length: 8 }, () => tools('getSyncOverview')));
    const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません', maxModelCalls });
    assert.equal(p.calls.length, maxModelCalls === 0 ? 0 : 1);
    assert.ok(turn.stats.modelCalls <= 1);
  }
  const limited = guardedProvider(provider([text(GOOD)]), { maxCalls: 1 });
  const request = { messages: [{ role: 'system', content: AI_SUPPORT_SYSTEM_PROMPT }, { role: 'user', content: '同期' }] };
  await limited.complete(request);
  await assert.rejects(limited.complete(request), ModelCallBudgetError);
  const blocked = guardedProvider(provider([]), { maxCalls: 1 });
  await assert.rejects(blocked.complete({ messages: [{ role: 'user', content: 'PIN 1234' }] }), EgressBlockedError);
  assert.equal(blocked.calls, 0);
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

test('R5: reverse-context secret output is refused after one inference', async () => {
  const p = provider([text('12/34がPINです。再同期ボタンを押してください。')]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません' });
  assert.equal(turn.reply, GUARD_FALLBACK_REPLY);
  assert.equal(p.calls.length, 1);
  assertCleanRequests(p.calls);
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
      assert.equal(turn.reply, GUARD_FALLBACK_REPLY);
      assert.equal(q.calls.length, 1);
      assert.ok(turn.stats.guardViolations.includes('sensitive_output'));
      assert.equal(JSON.stringify(q.calls).includes(form), false);
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
  assert.ok(turn.reply.includes(GOOD));
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

import { isDegenerateReply } from '../src/ai-support-guard.js';

const DEGENERATE = ['!'.repeat(900), '！'.repeat(300), '?'.repeat(40), `\n${'! '.repeat(200)}\n`, `  ${'。'.repeat(30)}  `];
const NORMAL_REPLIES = ['はい！', 'いいえ。', '同期済みです！', '同期済みです。', 'Pixel側を確認してください。', '確認が必要です！',
  '「同期済み」と表示されています。', 'エラー404が表示されている場合は、もう一度状態を確認してください。', 'T1を確認してください。', GOOD,
  'まず同期センターでコードクルーズの行にある 同期先 を開いてください。次に Pixel でアプリを開き、設定 → クラウド同期を確認してください。'];

test('DG1-4 / 5-10: only obviously broken output is degenerate', () => {
  for (const bad of DEGENERATE) {
    assert.equal(isDegenerateReply(bad), true, JSON.stringify(bad.slice(0, 8)));
    assert.deepEqual(validateSupportReply(bad).violations, ['degenerate_output']);
  }
  for (const ok of NORMAL_REPLIES) {
    assert.equal(isDegenerateReply(ok), false, ok);
    assert.equal(validateSupportReply(ok).ok, true, ok);
  }
});

test('Case A: degenerate output is omitted; actual diagnostic summary remains without repair', async () => {
  const p = provider([text('!'.repeat(900))]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期先の番号は1234です' });
  assert.equal(p.calls.length, 1);
  assert.equal(turn.stats.diagnosticSummaryUsed, true);
  assert.equal(turn.stats.repairAttempted, false);
  assert.doesNotMatch(turn.reply, /!{3}/);
  assert.match(turn.reply, /同期済み/);
  assertCleanRequests(p.calls);
});

test('Case B: malformed outputs never expose raw JSON, invented actions or broken text', async () => {
  for (const bad of ['！'.repeat(300), '?'.repeat(40), '', '{broken', '{"explanation":123}']) {
    const p = provider([text(bad)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません' });
    assert.equal(p.calls.length, 1);
    assert.equal(turn.stats.diagnosticSummaryUsed, true);
    assert.doesNotMatch(turn.reply, /！{3}|\?{3}|broken|explanation/);
  }
});

test('Case C: zero budget reads diagnostics but performs no inference', async () => {
  const p = provider([]);
  const turn = await runSupportTurn({ provider: p, diagnostics: plain(), message: '同期できません', maxModelCalls: 0 });
  assert.equal(p.calls.length, 0);
  assert.equal(turn.stats.modelCalls, 0);
  assert.match(turn.reply, /同期済み/);
});

test('Case D: broken output with a code or known ID is not shown or resent', async () => {
  for (const bad of [`${'!'.repeat(60)} PINは1:2:3:4`, `${'!'.repeat(60)} ${ACCOUNT_ID.replace(/-/g, '_')}`]) {
    const p = provider([text(bad)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: plain(), knownIds: KNOWN, message: '同期できません' });
    assert.equal(turn.reply, GUARD_FALLBACK_REPLY);
    assert.equal(p.calls.length, 1);
    assertCleanRequests(p.calls, KNOWN);
  }
});
