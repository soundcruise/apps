import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSupportReply, GUARD_FALLBACK_REPLY } from '../src/ai-support-guard.js';
import { runSupportTurn } from '../src/ai-support-chat.js';
import { AI_SUPPORT_SYSTEM_PROMPT } from '../src/ai-support-policy.js';
import { VERIFIED_UI_PATHS } from '../src/ai-support-ui-guidance.js';
import { IPHONE_THIRD_QUESTION, IPHONE_THIRD_REPLY } from './fixtures/iphone-support-20261107.js';
import { SCENARIOS, diagnosticsFor, autoScore } from '../scripts/ai-eval/scenarios.mjs';
import { syncTargetsTabLabel } from '../../../apps/cruise-port/sync-center-ui.js';
import { describeAppSyncDetail } from '../../../apps/cruise-port/sync-center-device-detail.js';

const GOOD = '現在の情報だけでは原因を特定できません。コードクルーズの行の「同期先」を開き、「もう一度確認」が表示されている場合はタップしてください。どの端末で起きているか教えていただけますか？';
const text = (value) => ({ text: value, toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 } });
const tool = (name = 'getSyncOverview', args = {}) => ({ text: '', toolCalls: [{ id: 'model-id', name, arguments: args }] });
function scripted(script) {
  const calls = [];
  return { calls, async complete(request) { calls.push(request); assert.ok(script.length, 'no unexpected extra inference'); const next = script.shift(); if (next instanceof Error) throw next; return next; } };
}
const diag = (id) => diagnosticsFor(SCENARIOS.find((s) => s.id === id).build());

test('captured third iPhone reply cannot reach the user; one repair still works', async () => {
  assert.equal(validateSupportReply(IPHONE_THIRD_REPLY).ok, false);
  const p = scripted([text(IPHONE_THIRD_REPLY), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: diag('S1'), message: IPHONE_THIRD_QUESTION });
  assert.equal(turn.reply, GOOD);
  assert.ok(turn.stats.guardViolations.includes('unsupported_ui_path'));
  assert.equal(turn.stats.repaired, true);
  assert.equal(p.calls.length, 2);
  assert.deepEqual(p.calls[1].tools, []);
  assert.equal(p.calls[0].messages.at(-1).content, IPHONE_THIRD_QUESTION);
});

test('repair failure, timeout, and exhausted budget never expose the captured bad answer', async () => {
  for (const bad of [IPHONE_THIRD_REPLY, '設定 → 高度な診断 → 自動修復を開いてください。']) {
    const p = scripted([text(bad), text(bad)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: diag('S1'), message: IPHONE_THIRD_QUESTION });
    assert.equal(turn.reply, GUARD_FALLBACK_REPLY);
    assert.equal(p.calls.length, 2);
    const capped = scripted([text(bad)]);
    const limited = await runSupportTurn({ provider: capped, diagnostics: diag('S1'), message: IPHONE_THIRD_QUESTION, maxModelCalls: 1 });
    assert.equal(limited.reply, GUARD_FALLBACK_REPLY);
    assert.equal(capped.calls.length, 1);
  }
  const unavailable = scripted([text(IPHONE_THIRD_REPLY), new Error('provider unavailable')]);
  const failure = await runSupportTurn({ provider: unavailable, diagnostics: diag('S1'), message: IPHONE_THIRD_QUESTION });
  assert.equal(failure.reply, GUARD_FALLBACK_REPLY);
  assert.equal(unavailable.calls.length, 2);
});

test('unknown paths and unknown controls are checked by evidence, across names and notation', () => {
  for (const reply of [
    '設定 → サポートを開いてください。',
    '「設定」→「サポート」からお問い合わせください。',
    '設定 > 詳細診断 > 自動修復を開いてください。',
    '詳細設定 → クラウド同期を開いてください。',
    '高速設定 → お問い合わせを開いてください。',
    '設定からサポートを開いてください。',
    '設定のサポートからお問い合わせください。',
    '設定のクラウド同期からサポートを開いてください。',
    '「サポート」画面があります。そこでお問い合わせください。',
    '自動修復ボタンがあります。',
    '設定の「ヘルプ」を開いてください。',
    '設定の「クラウド同期」から「自動修復」を開いてください。',
    '同期センターの「同期先」から「管理者診断」を押してください。',
    '同期センターの「Cruise Portと接続」を開いてください。',
    'Cruise Port のヘルプ画面にあるサポートリンクをご利用ください。',
    '「クラウド修復」ボタンをタップしてください。',
    '「秘密の設定」から診断画面を開いてください。',
    '同期センターの「管理者設定」を開いてください。',
    'コードクルーズの行の ⓘ を開いてください。',
    '「全データを削除」ボタンを押してください。',
    '同期を解除してください。',
    'ボタンがあれば同期コードを表示してください。',
    'メールがあれば「もう一度確認」ボタンを押してください。',
    'アカウントを削除してください。'
  ]) assert.equal(validateSupportReply(reply).ok, false, reply);
});

test('real paths, harmless names, denials and clarification remain answerable without repair', async () => {
  for (const reply of [
    GOOD,
    'その端末でコードクルーズを開き、設定 → クラウド同期を確認してください。',
    '設定の「クラウド同期」を開いてください。',
    '「コードクルーズ」の設定 → クラウド同期を開いてください。',
    '「送信内容の取り扱い」ボタンがあります。',
    'Cruise Port の設定 → クラウド同期を開くを押してください。',
    '同期センター → クラウド同期で困ったときは → AIに相談を開いてください。',
    '相談画面下部の「メールで報告」からご相談ください。',
    '未接続の場合は設定のクラウド同期からCruise Portと接続を開いてください。',
    '「同期先3件」ボタンがあります。',
    '「送信内容の取り扱い」を開いてください。',
    '設定 → お問い合わせからご相談ください。',
    '同期先「設定→サポート」の前回の報告を確認してください。',
    '「設定→サポート」という画面はありません。',
    '設定→サポートはありません。',
    'データを削除していません。',
    '同期コードを表示できません。どのアプリで起きていますか？',
    '「もう一度確認」ボタンが見つかりません。画面の状態を教えてください。',
    '「設定 → サポート」の存在は確認できません。どのアプリの同期についてお困りですか？',
    'サポート機能について確認できません。どの画面で起きていますか？',
    '未接続と表示されている場合、設定 → クラウド同期 → Cruise Portと接続を開いてください。',
    '現在の情報だけでは原因を特定できません。どのアプリの同期について確認したいですか？',
    '「同期済み」を確認してください。',
    '同期を解除する場合は、同期センターの公式の確認画面をよく読んでから行ってください。',
    GUARD_FALLBACK_REPLY
  ]) {
    assert.deepEqual(validateSupportReply(reply), { ok: true, violations: [] }, reply);
    const p = scripted([text(reply)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: diag('S1'), message: '同期について教えてください。' });
    assert.equal(turn.reply, reply);
    assert.equal(p.calls.length, 1, 'normal answer costs no repair call');
  }
});

test('connection preconditions use this turn’s tools, not user assertions or old history', async () => {
  const connect = 'コードクルーズで設定 → クラウド同期 → Cruise Portと接続を開いてください。';
  for (const id of ['S1', 'S6', 'S8']) {
    const p = scripted([tool(), text(connect), text(GOOD)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: diag(id), message: 'コードクルーズは未接続なので接続してください。',
      history: [{ role: 'assistant', content: '未接続です。' }] });
    assert.equal(turn.reply, id === 'S8' ? connect : GOOD, id);
    assert.equal(turn.stats.repairAttempted, id !== 'S8', id);
  }
  for (const reply of ['同期コードを表示してください。', '「もう一度確認」ボタンを押してください。']) {
    assert.ok(validateSupportReply(reply).violations.includes('ui_precondition'), reply);
  }
});

test('state semantics remain intact for clean, pending, recheck, error and disconnected tools', async () => {
  const cases = [
    ['S1', 'available', 'コードクルーズは「同期済み」です。'],
    ['S2', 'available', '前回の報告は保留中です。故障とは限りません。'],
    ['S4', 'available', '前回の報告にエラーがあります。現在も止まっているかは確認できません。'],
    ['S6', 'recheck', GOOD],
    ['S8', 'detached', 'コードクルーズは未接続です。同期コードを表示し、設定 → クラウド同期 → Cruise Portと接続を開いてください。']
  ];
  for (const [id, expected, answer] of cases) {
    const diagnostic = diag(id); const overview = await diagnostic.getSyncOverview();
    const app = overview.apps.find((a) => a.appId === 'chord');
    if (id !== 'S4') assert.equal(app.displayStatus, expected, id);
    const p = scripted([tool(), text(answer)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: diagnostic, message: '同期状態は？' });
    assert.equal(turn.reply, answer, id);
    assert.equal(turn.stats.repairAttempted, false, id);
  }
});

test('UI grounding detects future label drift and verifies conditional controls', () => {
  assert.equal(syncTargetsTabLabel(3), '同期先3件');
  const file = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const html = file('../../../apps/cruise-port/pro_9a3943176561/index.html');
  assert.match(html, /id="settings-sync-center-open"[^>]*>クラウド同期を開く</);
  assert.match(html, /class="sync-center-support-link"[^>]*>不具合を報告（メール）</);
  assert.match(html, />クラウド同期で困ったときは</);
  assert.match(file('../../../apps/cruise-port/ai-support-ui.js'), /footerLink: 'メールで報告'/);
  assert.match(file('../../../apps/cruise-port/sync-center-ui.js'), /設定 → クラウド同期 → 「Cruise Portと接続」を押す/);
  const ready = { status: 'synced', presentationStatus: { state: 'available' }, environments: [] };
  assert.equal(describeAppSyncDetail(ready).retry, false);
  assert.equal(describeAppSyncDetail({ ...ready, snapshot: 'mismatch' }).retry, true);
  assert.ok(VERIFIED_UI_PATHS.every(Object.isFrozen));
  assert.match(AI_SUPPORT_SYSTEM_PROMPT, /同期先N件/);
  assert.match(AI_SUPPORT_SYSTEM_PROMPT, /状態が未確認なら/);
});


test('evaluation scores the captured bad route and still tolerates support clarification', () => {
  const scenario = SCENARIOS.find((s) => s.id === 'S11');
  const bad = autoScore(scenario, { reply: IPHONE_THIRD_REPLY, toolCalls: [] });
  assert.equal(bad.pass, false);
  assert.ok(bad.flags.includes('unsupported_ui_path'));
  assert.equal(autoScore(scenario, { reply: 'どのアプリの同期について確認したいですか？', toolCalls: [] }).pass, true);
});

test('two diagnostic tools plus repair stay within four calls, without losing the diagnostic context', async () => {
  const p = scripted([tool(), tool('getAppSyncTargets', { appId: 'chord' }),
    text('コードクルーズで設定 → クラウド同期 → Cruise Portと接続を開いてください。'), text(GOOD)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: diag('S1'), message: 'コードクルーズの同期について教えてください。' });
  assert.equal(turn.reply, GOOD);
  assert.equal(p.calls.length, 4);
  assert.equal(turn.stats.toolCalls, 2);
  assert.ok(p.calls[3].messages.filter((m) => m.role === 'tool').length === 2);
});


test('an app identified in the previous sentence keeps its verified connection state', () => {
  const answer = 'コードクルーズは未接続です。設定 → クラウド同期 → Cruise Portと接続を開いてください。';
  const apps = [{ appId: 'pitch', displayStatus: 'available' }, { appId: 'chord', displayStatus: 'detached' }];
  assert.equal(validateSupportReply(answer, { apps }).ok, true);
  assert.equal(validateSupportReply(answer, { apps: apps.map((a) => ({ ...a, displayStatus: 'available' })) }).ok, false);
});
