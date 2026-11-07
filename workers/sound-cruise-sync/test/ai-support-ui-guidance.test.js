import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSupportTurn } from '../src/ai-support-chat.js';
import { repairInstruction, validateSupportReply } from '../src/ai-support-guard.js';
import { AI_SUPPORT_SYSTEM_PROMPT } from '../src/ai-support-policy.js';
import { SCENARIOS, autoScore, diagnosticsFor } from '../scripts/ai-eval/scenarios.mjs';
import { IPHONE_THIRD_QUESTION, IPHONE_THIRD_REPLY } from './fixtures/iphone-support-20261107.js';
import { syncTargetsTabLabel } from '../../../apps/cruise-port/sync-center-ui.js';
import { describeAppSyncDetail } from '../../../apps/cruise-port/sync-center-device-detail.js';

test('normal useful explanation is delivered intact, with no new output contract or correction', async () => {
  const explanation = '同期が保たれている限り、毎回特別な操作は不要です。';
  let calls = 0;
  const result = await runSupportTurn({ message: '毎回操作が必要ですか？', diagnostics: diagnosticsFor(SCENARIOS[0].build()),
    provider: { async complete(request) { calls++; assert.equal(request.responseFormat, undefined);
      return { text: explanation, toolCalls: [], usage: {} }; } } });
  assert.equal(result.reply, explanation); assert.equal(calls, 1); assert.equal(result.stats.fallback, false);
});

// Invented local examples, not captured beta text. A scripted provider proves transport/guard
// behavior, not what a real model will choose to say with the revised knowledge.
const completion = text => ({ text, toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 } });
const toolCall = (name, appId = 'chord') => ({ text: '', toolCalls: [{ name,
  arguments: name === 'getSyncOverview' ? {} : { appId } }], usage: {} });
function scriptedProvider(script) {
  const requests = [];
  return { requests, async complete(request) { requests.push(structuredClone(request));
    assert.ok(script.length, 'no unplanned provider call'); return script.shift(); } };
}
const scenario = id => diagnosticsFor(SCENARIOS.find(s => s.id === id).build());
const alternative = 'Pixelでコードクルーズをインターネット接続中に開き、設定 → クラウド同期の現在の表示を確認してください。Portへ戻り同期センターを開き直して、コードクルーズの「同期先2件」で前回報告と報告時刻を確認できます。';

test('A: current fetch time, last report and conversational history remain distinct', async () => {
  const diagnostics = scenario('S2');
  const targets = await diagnostics.getAppSyncTargets('chord');
  const pending = targets.targets.find(t => t.reportState === 'pending');
  assert.ok(targets.observedAt > pending.reportedAt);
  assert.equal(targets.app.displayLabel, '✓ 同期済み');
  assert.equal(targets.app.activeTargetCount, 2);
  assert.equal(targets.app.reportCounts.pending, 1);
  // The previous exchange contains no diagnostic tool result. Keep it as conversation,
  // without manufacturing a historical snapshot or substituting it for the fresh tool result.
  const history = [{ role: 'user', content: '前は完了していないように見えました。' },
    { role: 'assistant', content: 'その端末でアプリの表示を確認しましょう。' }];
  const answer = '今回取得したクラウド情報ではコードクルーズは「✓ 同期済み」で、同期先は2件です。Pixelの前回の完了報告は未確認ですが、今も未完了とは断定できません。先ほど伺った端末の表示と、今回取得した前回報告は別の情報です。';
  const p = scriptedProvider([toolCall('getSyncOverview'), toolCall('getAppSyncTargets'), completion(answer)]);
  const turn = await runSupportTurn({ provider: p, diagnostics, history, message: '前回報告と現在の違いは？' });
  assert.equal(turn.reply, answer);
  assert.deepEqual(p.requests[0].messages.slice(1, 3), history);
  assert.equal(p.requests[0].messages.filter(m => m.role === 'tool').length, 0);
  assert.equal(p.requests[2].messages.filter(m => m.role === 'tool').length, 2);
  assert.equal(turn.stats.repairAttempted, false);
  assert.equal(turn.stats.fallback, false);
  for (const fact of ['過去の診断結果を保存・取得しない', '過去の診断データそのものではない',
    '今回別々に取得した概要と同期先情報の不一致であり、過去からの変化ではない']) assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes(fact));
});

test('B: recheck visibility follows actual UI conditions, not a pending/error report alone', () => {
  const synced = { status: 'synced', snapshot: 'aligned', environments: [] };
  for (const report of ['pending', 'error']) {
    const app = { ...synced, presentationStatus: { state: report === 'error' ? 'attention' : 'available' },
      environments: [{ id: 'synthetic-device', label: 'Pixel', reportKnown: true,
        lastReport: { state: report, reportedAt: 1, attentionCount: 0 } }] };
    assert.equal(describeAppSyncDetail(app).retry, false, report);
  }
  for (const app of [
    { ...synced, snapshot: 'mismatch' },
    { status: 'connecting', presentationStatus: { state: 'connecting' } },
    { status: 'initial', presentationStatus: { state: 'syncing' } },
    { status: 'attention', presentationStatus: { state: 'attention' } }
  ]) assert.equal(describeAppSyncDetail(app).retry, true);
  assert.equal(describeAppSyncDetail(synced, { devicesState: 'unavailable' }).retry, true);
  assert.equal(describeAppSyncDetail(synced, { kind: 'error' }).retry, true);
  assert.equal(describeAppSyncDetail(synced, { kind: 'offline' }).retry, false);
});

test('B: useful target-specific alternative passes intact without repair or fallback', async () => {
  const answer = '「もう一度確認」が無いことだけでは異常ではありません。' + alternative;
  const p = scriptedProvider([toolCall('getSyncOverview'), toolCall('getAppSyncTargets'), completion(answer)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: scenario('S2'), message: 'ボタンが見つかりません。' });
  assert.equal(turn.reply, answer);
  assert.equal(turn.stats.modelCalls, 3);
  assert.deepEqual(turn.stats.guardViolations, []);
  assert.equal(turn.stats.fallback, false);
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('「もう一度確認」が表示されなくても、それだけで異常ではない'));
});

test('B: existing UI mistake gets only one repair; conditional and alternative guidance survive it', async () => {
  const answer = 'Portのコードクルーズの「同期先2件」を開き、「もう一度確認」が表示されている場合は押してください。表示されなければ、' + alternative;
  const p = scriptedProvider([toolCall('getSyncOverview'), toolCall('getAppSyncTargets'),
    completion('Pixelの同期先に「もう一度確認」があれば押してください。'), completion(answer)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: scenario('S2'), message: 'どこで確認しますか？' });
  assert.equal(turn.reply, answer);
  assert.equal(turn.stats.modelCalls, 4);
  assert.equal(turn.stats.repairAttempted, true);
  assert.equal(turn.stats.repaired, true);
  assert.equal(turn.stats.fallback, false);
  assert.deepEqual(p.requests[3].tools, []);
  assert.equal(p.requests[3].messages.at(-1).content, repairInstruction(['per_target_recheck']));
});

test('C: Port-local uncertainty can coexist with concrete Port steps and contact, despite pending app reports', async () => {
  const answer = '今回の診断ではPort自身のローカル状態は取得できないため、繰り返し表示される原因は分かりません。コードクルーズの前回報告は別の情報です。同じ端末のPortで同期センターを開き、上部のCruise Portの状態表示を確認してください。「同期を開始・再開」を押した直後に再表示されますか、それともページを開き直した後ですか。解決しなければ相談画面下部の「メールで報告」からお問い合わせください。';
  const p = scriptedProvider([toolCall('getSyncOverview'), toolCall('getAppSyncTargets'), completion(answer)]);
  const turn = await runSupportTurn({ provider: p, diagnostics: scenario('S2'), message: 'Portの開始・再開が繰り返し出ます。' });
  assert.equal(turn.reply, answer);
  assert.equal(turn.stats.repairAttempted, false);
  assert.equal(turn.stats.fallback, false);
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('その関連を裏付ける情報は今回の診断には無い'));
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('確認する同期先が分かることと、相談された症状の原因が分かることは別'));
  assert.doesNotMatch(AI_SUPPORT_SYSTEM_PROMPT, /回答の最初の一文を必ず/);
});

test('saved successful model answers from the targeted UI evaluation still pass unchanged offline', async () => {
  const saved = JSON.parse(fs.readFileSync(new URL('../scripts/ai-eval/results/gpt-oss-120b.prompt-v3-4-guard-targeted.json', import.meta.url)));
  for (const row of saved.results) {
    const p = scriptedProvider([completion(row.reply)]);
    const turn = await runSupportTurn({ provider: p, diagnostics: scenario(row.scenario), message: row.phrasing });
    assert.equal(turn.reply, row.reply, row.title);
    assert.equal(turn.stats.repairAttempted, false, row.title);
    assert.equal(turn.stats.fallback, false, row.title);
  }
});

test('offline scoring does not force a stock opening or confuse a known next target with a known cause', () => {
  for (const [id, reply] of [
    ['S9', 'Portの同期センターでコードクルーズの同期先の件数が表示されたボタンを開き、状態を確認してください。原因は今回の情報だけでは判断できません。'],
    ['S3', '現在の情報だけでは原因を特定できません。Pixelのコードクルーズを開き、設定 → クラウド同期の表示を確認してください。']
  ]) {
    const score = autoScore(SCENARIOS.find(s => s.id === id), { reply, toolCalls: [{ name: 'getSyncOverview' }] });
    assert.equal(score.pass, true, JSON.stringify(score));
  }
});

test('saved v143 useful replies retain the existing validator behavior and natural text', () => {
  const saved = JSON.parse(fs.readFileSync(new URL('./fixtures/v143-synthetic-replies.json', import.meta.url)));
  for (const row of saved) assert.equal(validateSupportReply(row.reply).ok, true, row.question);
});

test('current UI and real contact route are explicit; old captured failure is a model reacceptance case', () => {
  assert.equal(syncTargetsTabLabel(2), '同期先2件');
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('同期先N件'));
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('「同期先N件」と文字どおり回答しない'));
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('Cruise Portの同期センター側にあり'));
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('各アプリの「設定 → クラウド同期」には存在しない'));
  assert.equal(AI_SUPPORT_SYSTEM_PROMPT.includes('ⓘ'), false);
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('問い合わせ方法を尋ねられたら、相談画面下部の「メールで報告」'));
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('「設定 → サポート」やヘルプ画面のリンクを推測しない'));
  assert.match(IPHONE_THIRD_QUESTION, /問い合わせ方法/);
  assert.match(IPHONE_THIRD_REPLY, /サポート/);
  // No claim that prompt changes deterministically block a previously unseen model mistake.
  assert.equal(validateSupportReply(IPHONE_THIRD_REPLY).ok, true);
});

test('repair and fallback guidance do not expose a literal count placeholder', async () => {
  const { GUARD_FALLBACK_REPLY, repairInstruction } = await import('../src/ai-support-guard.js');
  assert.doesNotMatch(GUARD_FALLBACK_REPLY, /同期先N件/);
  assert.doesNotMatch(repairInstruction(['per_target_recheck']), /同期先N件/);
});

test('state knowledge preserves previous report versus present state and registration versus missing report', () => {
  for (const text of ['現在も同期が未完了だと断定しない', 'activeTargetCount', '未登録・未接続と読み替えない',
    '前回の報告', '全端末が一致している保証ではない']) assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes(text));
});

test('UI knowledge matches conditional native recheck and explicitly limits Port local diagnosis', () => {
  const ui = fs.readFileSync(new URL('../../../apps/cruise-port/sync-center-device-detail.js', import.meta.url), 'utf8');
  assert.match(ui, /retry: inProgress \|\| membershipAttention/);
  assert.match(ui, /snapshot === 'mismatch'/);
  for (const text of ['同期先の前回報告だけに確認事項やエラーがある場合は、表示されるとは限らない',
    'Port自身のローカル状態・未送信データ・画像処理・実行中の同期処理は取得しない',
    'Port自身には「同期を開始・再開」がある', 'reportedAt はその同期先から届いた前回報告の時刻']) assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes(text));
  // The existing guard accepts a correct Port-specific explanation unchanged.
  assert.equal(validateSupportReply('Cruise Portの「同期を開始・再開」はデータの送受信を始める操作です。表示されている状態を教えてください。').ok, true);
});
