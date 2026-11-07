import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSupportTurn } from '../src/ai-support-chat.js';
import { SUPPORT_ACTION_IDS, SUPPORT_QUESTIONS, CONTACT_GUIDANCE, renderSupportAction, supportModelData,
  decodeSupportPlan, supportDescription } from '../src/ai-support-actions.js';
import { validateSupportReply as validateSupportExplanation } from '../src/ai-support-guard.js';
import { SCENARIOS, diagnosticsFor } from '../scripts/ai-eval/scenarios.mjs';
import { IPHONE_THIRD_QUESTION, IPHONE_THIRD_REPLY } from './fixtures/iphone-support-20261107.js';
import { syncTargetsTabLabel } from '../../../apps/cruise-port/sync-center-ui.js';
import { describeAppSyncDetail, appHasSyncDetail } from '../../../apps/cruise-port/sync-center-device-detail.js';
const diag = (id) => diagnosticsFor(SCENARIOS.find((s) => s.id === id).build());
function provider(explanation, actions = [], questionId = 'none', raw = false) {
  const calls = [];
  return { calls, async complete(input) { calls.push(structuredClone(input));
    return { text: raw ? explanation : JSON.stringify({ explanation, actions, questionId }), toolCalls: [], usage: { inputTokens: 100, outputTokens: 30 } }; } };
}
async function turn(id, message, explanation, actions, questionId) {
  const p = provider(explanation, actions, questionId);
  return { ...await runSupportTurn({ provider: p, diagnostics: diag(id), message }), requests: p.calls };
}

test('captured iPhone question receives the exact current contact route with zero inference', async () => {
  const p = provider(IPHONE_THIRD_REPLY, [], 'none', true);
  const result = await runSupportTurn({ provider: p, diagnostics: diag('S1'), message: IPHONE_THIRD_QUESTION });
  assert.equal(p.calls.length, 0);
  assert.equal(result.stats.directAnswer, true);
  assert.match(result.reply, /分かっている症状/);
  assert.ok(result.reply.includes(CONTACT_GUIDANCE));
  assert.doesNotMatch(result.reply, /設定|ⓘ|サポート画面/);
});

test('unrecognised contact wording still supports AI explanation plus the real contact action', async () => {
  const result = await turn('S9', '直らず原因も不明です。相談できる窓口はありますか。',
    '現在の情報だけでは原因を特定できません。症状が起きるタイミングも判断の手掛かりになります。', [{ id: 'contact_support', appId: 'none' }]);
  assert.equal(result.requests.length, 1);
  assert.match(result.reply, /タイミングも判断の手掛かり/);
  assert.ok(result.reply.includes(CONTACT_GUIDANCE));
  assert.equal(result.stats.diagnosticSummaryUsed, false);
});

test('misplaced operations are removed sentence by sentence, preserving useful natural explanations', async () => {
  for (const bad of ['Pixelを選んでください。', 'Pixelを選ぶと状態が見られます。',
    '設定 → サポートを開いてください。', '「管理者修復」ボタンがあります。', '全データを削除してください。',
    '同期の解除がおすすめです。', 'Proの番号を教えてください。', 'ログインしてください。', 'ログインが必要です。', 'サインインが必要です。']) {
    const result = await turn('S3', 'コードクルーズに確認が必要と出ます。',
      `前回の報告に確認事項があります。${bad}今も問題が続いているかは、この情報だけでは分かりません。`,
      [{ id: 'inspect_app', appId: 'chord' }]);
    assert.match(result.reply, /前回の報告に確認事項があります/);
    assert.match(result.reply, /今も問題が続いているかは/);
    assert.equal(result.reply.includes(bad), false, bad);
    assert.equal(result.stats.explanationSentencesOmitted, 1, bad);
    assert.equal(result.stats.diagnosticSummaryUsed, false);
    assert.equal(result.stats.repairAttempted, false);
    assert.equal(result.requests.length, 1);
    assert.match(result.reply, /同期先\d+件/);
  }
});

test('normal Japanese explanations and harmless state words do not trigger whole-answer rejection', () => {
  for (const text of ['前回の同期報告に確認事項があります。', '同期は完了しています。',
    '保留中というだけで故障とは限りません。', '最新の完了報告はまだ確認できていません。',
    '通信状態が一時的に不安定だった可能性もありますが、原因は断定できません。',
    '同期の状況を確認しています。', '今も同じ症状が続いているかは分かりません。']) {
    assert.equal(supportDescription(text, (s) => validateSupportExplanation(s).ok).text, text, text);
  }
});

test('unknown IDs, model-written labels, target names, URLs and app IDs never become instructions', async () => {
  for (const action of [{ id: 'select_pixel', appId: 'chord' }, { id: 'inspect_app', appId: 'chord', label: 'Pixelを選ぶ' },
    { id: 'delete_account', appId: 'chord' }, { id: 'contact_support', appId: 'unknown' },
    { id: 'contact_support', appId: 'none', url: 'https://invalid.example' }, null]) {
    const result = await turn('S3', 'コードクルーズの同期状態を教えてください。', '前回の報告に確認事項があります。', [action]);
    assert.equal(result.stats.rejectedActions, 1);
    assert.equal(result.stats.repairAttempted, false);
    assert.equal(result.requests.length, 1);
    assert.doesNotMatch(result.reply, /select_pixel|delete_account|invalid|Pixel|unknown/);
    assert.match(result.reply, /同期先\d+件/);
  }
});

test('diagnosis precedes every non-FAQ answer, including synced and disconnected; redundant questions are omitted', async () => {
  for (const [id, match] of [['S1', /同期済み/], ['S8', /未接続/]]) {
    const result = await turn(id, '現在の同期状態について教えてください。', '今確認できる同期状態を基に説明します。', [], 'which_app');
    assert.equal(result.requests.length, 1);
    assert.equal(result.stats.toolCalls, 1);
    assert.equal(result.requests[0].messages.filter((m) => m.role === 'tool').length, 1);
    assert.match(result.reply, match);
    assert.doesNotMatch(result.reply, /どのアプリ/);
  }
  const focused = await turn('S3', 'コードクルーズについて', '前回の報告に確認事項があります。', [], 'which_app');
  assert.equal(focused.stats.toolCalls, 2);
  assert.doesNotMatch(focused.reply, /どのアプリ/);
  const mixed = await turn('S9', '状況がよく分かりません。', '原因を絞るには、症状についても情報が必要です。', [], 'which_environment');
  assert.ok(mixed.reply.includes(SUPPORT_QUESTIONS.which_environment));
});

test('action visibility conditions match actual Port controls for all diagnostic scenarios', async () => {
  for (const scenario of SCENARIOS.filter((s) => s.id !== 'S7')) {
    const d = diagnosticsFor(scenario.build()); const overview = await d.getSyncOverview();
    for (const app of overview.apps) {
      const context = { overview, appId: app.appId, details: new Map([[app.appId, await d.getAppSyncTargets(app.appId)]]) };
      const rendered = renderSupportAction({ id: 'inspect_targets', appId: app.appId }, context);
      if (rendered) assert.ok(rendered.includes(syncTargetsTabLabel(app.activeTargetCount)));
      const actual = { status: app.cloudState, snapshot: app.snapshotState, presentationStatus: { state: app.displayStatus }, environments: [] };
      assert.equal(Boolean(renderSupportAction({ id: 'inspect_targets', appId: app.appId }, context)), appHasSyncDetail(actual), `${scenario.id}/${app.appId}/detail`);
      assert.equal(Boolean(renderSupportAction({ id: 'recheck_app', appId: app.appId }, context)),
        appHasSyncDetail(actual) && describeAppSyncDetail(actual).retry, `${scenario.id}/${app.appId}/retry`);
      assert.equal(Boolean(renderSupportAction({ id: 'connect_app', appId: app.appId }, context)), app.displayStatus === 'detached');
      if (app.snapshotState === 'mismatch') assert.equal(renderSupportAction({ id: 'inspect_app', appId: app.appId }, context), null);
    }
  }
});

test('deleting, unknown, user assertions and old history cannot enable a connection or retry action', async () => {
  const context = { overview: { apps: [{ appId: 'chord', cloudState: 'deleting', displayStatus: 'deleting' }] }, details: new Map() };
  for (const id of ['connect_app', 'recheck_app', 'inspect_app']) assert.equal(renderSupportAction({ id, appId: 'chord' }, context), null);
  const result = await runSupportTurn({ provider: provider('前回の報告があります。', [{ id: 'connect_app', appId: 'chord' }]),
    diagnostics: diag('S1'), message: 'コードクルーズは未接続です。', history: [{ role: 'assistant', content: 'コードクルーズは未接続です。' }] });
  assert.equal(result.stats.rejectedActions, 1);
  assert.doesNotMatch(result.reply, /Cruise Portと接続|同期コード/);
});

test('provider projection retains diagnostic meaning without target names, IDs or hostile metadata', async () => {
  const data = await diag('S10').getAppSyncTargets('chord');
  const projected = supportModelData(data);
  assert.equal(projected.app.displayStatus, data.app.displayStatus);
  assert.deepEqual(projected.targets.map((t) => t.reportState), data.targets.map((t) => t.reportState));
  for (const key of ['displayName', 'userLabel', 'shortId', 'reference', 'ref', 'accountId']) assert.equal(JSON.stringify(projected).includes(`"${key}"`), false, key);
});

test('malformed structured output fails closed; plain prose cannot bypass the required action contract', () => {
  for (const raw of ['{broken', '[]', 'null', '{"explanation":"説明","actions":[],"questionId":"invented"}',
    '{"explanation":"説明","actions":[],"questionId":"none","route":"設定"}']) assert.equal(decodeSupportPlan(raw).malformed, true);
  const legacy = decodeSupportPlan('Pixelを選んでください。');
  assert.equal(legacy.malformed, true);
  assert.deepEqual(legacy.actions, []);
  assert.equal(supportDescription(legacy.explanation, () => true).text, '');
});

test('verified labels and footer remain anchored to current UI source', () => {
  const file = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.equal(syncTargetsTabLabel(3), '同期先3件');
  assert.match(file('../../../apps/cruise-port/ai-support-ui.js'), /footerLink: 'メールで報告'/);
  assert.match(file('../../../apps/cruise-port/sync-center-ui.js'), /設定 → クラウド同期 → 「Cruise Portと接続」を押す/);
  assert.equal(SUPPORT_ACTION_IDS.some((id) => /delete|revoke|rename/.test(id)), false);
});

test('diagnostic errors and provider errors never trigger automatic retries', async () => {
  const p = provider('説明です。');
  const fail = await runSupportTurn({ provider: p, diagnostics: { async getSyncOverview() { throw new Error('offline'); } }, message: '同期の状態は？' });
  assert.equal(p.calls.length, 0);
  assert.equal(fail.diagnosticsFailed, true);
  let calls = 0;
  await assert.rejects(runSupportTurn({ provider: { async complete() { calls++; throw new Error('timeout'); } }, diagnostics: diag('S1'), message: '同期の状態は？' }), /timeout/);
  assert.equal(calls, 1);
});

test('a dangerous proposed workaround gets app-owned preservation guidance without losing natural reasoning', async () => {
  const result = await turn('S3', '解除してデータを消せば直りますか。',
    '前回の報告だけでは原因は分かりません。データを保ったままでも、症状を絞るための情報は得られます。',
    [{ id: 'preserve_data', appId: 'none' }, { id: 'inspect_app', appId: 'chord' }]);
  assert.match(result.reply, /データの削除や同期解除は行わず/);
  assert.match(result.reply, /症状を絞るための情報/);
  assert.equal(result.stats.diagnosticSummaryUsed, false);
  assert.equal(result.requests.length, 1);
});

test('a state transition between overview and detail cannot enable a stale connection action', async () => {
  const detached = diag('S8'); const connected = diag('S1');
  const result = await runSupportTurn({
    provider: provider('前回の報告があります。', [{ id: 'connect_app', appId: 'chord' }]),
    diagnostics: { getSyncOverview: () => detached.getSyncOverview(), getAppSyncTargets: (appId) => connected.getAppSyncTargets(appId) },
    message: 'コードクルーズが未接続です。'
  });
  assert.equal(result.stats.rejectedActions, 1);
  assert.match(result.reply, /同期済み/);
  assert.doesNotMatch(result.reply, /Cruise Portと接続|同期コード/);
});

test('a follow-up retains the app context while obtaining fresh state; a multi-app question stays overview-only', async () => {
  const history = [{ role: 'user', content: 'コードクルーズが未接続です。' }];
  const result = await runSupportTurn({ provider: provider('前回の報告があります。', [{ id: 'inspect_app', appId: 'chord' }]),
    diagnostics: diag('S1'), message: '今の状態はどうですか。', history });
  assert.equal(result.stats.toolCalls, 2);
  assert.equal(result.stats.rejectedActions, 0);
  assert.match(result.reply, /コードクルーズの表示は「✓ 同期済み」/);
  assert.match(result.reply, /設定 → クラウド同期/);
  const multi = await runSupportTurn({ provider: provider('前回の報告があります。'), diagnostics: diag('S1'),
    message: 'コードクルーズと音感クルーズはどうですか。', history });
  assert.equal(multi.stats.toolCalls, 1);
});
