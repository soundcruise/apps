import test from 'node:test';
import assert from 'node:assert/strict';
import { toModelToolResult } from '../src/ai-diagnostics.js';
import { runSupportTurn } from '../src/ai-support-chat.js';
import { AI_SUPPORT_SYSTEM_PROMPT, AI_SUPPORT_TOOLS } from '../src/ai-support-policy.js';
import { repairInstruction } from '../src/ai-support-guard.js';
import { SCENARIOS, diagnosticsFor } from '../scripts/ai-eval/scenarios.mjs';
import { createPortSyncStatus } from '../../../apps/cruise-port/port-sync-status.js';

// All examples are synthetic. No beta conversation, device name or diagnostic JSON is copied.
const scenario = id => diagnosticsFor(SCENARIOS.find(s => s.id === id).build());
const text = content => ({ text: content, toolCalls: [], usage: {} });
const tool = name => ({ text: '', toolCalls: [{ name,
  arguments: name === 'getAppSyncTargets' ? { appId: 'chord' } : {} }], usage: {} });
function provider(script) {
  const requests = [];
  return { requests, async complete(request) {
    requests.push(structuredClone(request));
    assert.ok(script.length, 'no unexpected provider call');
    return script.shift();
  } };
}
function assertPortNotObserved(envelope) {
  assert.equal(envelope.scope.evidence, 'cloud_registration_and_last_app_reports');
  assert.equal(envelope.scope.portLocalSync, 'not_observed');
  assert.equal(envelope.scope.portRestartCause, 'outside_diagnostic_scope');
  assert.equal(envelope.scope.subjectAppIds.includes('port'), false);
}
const history = [
  { role: 'user', content: 'コードクルーズの状態は？' },
  { role: 'assistant', content: 'Pixelからの前回の完了報告が未確認です。Pixelでアプリを開いて確認しましょう。' },
  { role: 'user', content: 'Portに確認ボタンがありません。' },
  { role: 'assistant', content: '表示だけでは確認不要とは限りません。Pixelで設定 → クラウド同期の表示を確認してから、Portへ戻って報告時刻を確認できます。' }
];
const usefulPortReply = '同じ端末のPortで同期センターを開き、上部のCruise Portの状態表示と説明を確認してください。一般仕様として、この端末の同期処理が動作中と確認できない場合などに「同期を開始・再開」が表示されます。今回のツール結果にはこの端末のPortの動作状態が無く、別アプリの前回報告はその表示理由を示していません。操作直後とページを開き直した後の、どちらで再表示されますか。解決しなければ相談画面下部の「メールで報告」からお問い合わせください。';

test('scope: pending app report and Port registration relation remain facts only about that app', async () => {
  const fixture = SCENARIOS.find(s => s.id === 'S2').build();
  const pending = fixture.apps.find(a => a.membership.appId === 'chord').targets.find(t => t.lastReport.state === 'pending');
  pending.isCurrent = true;
  pending.userLabel = null;
  pending.label = 'Cruise Studio'; // A display label is not verified installed-app inventory.
  const diagnostics = diagnosticsFor(fixture);
  for (const [name, data] of [
    ['getSyncOverview', await diagnostics.getSyncOverview()],
    ['getAppSyncTargets', await diagnostics.getAppSyncTargets('chord')]
  ]) {
    const envelope = JSON.parse(toModelToolResult(name, data));
    assertPortNotObserved(envelope);
    assert.deepEqual(envelope.data, data, 'retain every existing diagnostic fact and timestamp');
    assert.equal(envelope.scope.targetNames, 'display_labels_only');
    assert.equal(envelope.scope.connectedFromThisPort, 'registration_relation_only');
    assert.deepEqual(envelope.scope.subjectAppIds, name === 'getSyncOverview'
      ? ['pitch', 'fretboard', 'rhythm', 'chord'] : ['chord']);
    if (name === 'getAppSyncTargets') {
      const row = envelope.data.targets.find(t => t.reportState === 'pending');
      assert.equal(row.connectedFromThisPort, true);
      assert.ok(row.reportedAt < envelope.data.observedAt);
      assert.equal(row.displayName, 'Cruise Studio');
    }
  }
});

test('scope: even four normal apps do not constitute a Port-local observation', async () => {
  const data = await scenario('S1').getSyncOverview();
  assert.ok(data.apps.every(app => app.displayStatus === 'available'));
  const envelope = JSON.parse(toModelToolResult('getSyncOverview', data));
  assertPortNotObserved(envelope);
  assert.deepEqual(envelope.data, data);
});

test('real Port presentation: the same app evidence is compatible with stopped or running Port sync', async () => {
  const structured = { known: true, credentialExists: true, credentialState: 'usable', connected: true,
    runtimeState: 'ready', migrationState: 'complete', datasetState: 'ready', lastSyncAt: 1 };
  for (const id of ['S1', 'S2']) {
    const overview = await scenario(id).getSyncOverview();
    const before = structuredClone(overview);
    const local = { accountState: overview.accountState, structured, assets: { known: true, pendingCount: 0 } };
    const stopped = createPortSyncStatus({ ...local, runtimeActive: false });
    const running = createPortSyncStatus({ ...local, runtimeActive: true });
    assert.equal(stopped.state, 'unstarted');
    assert.match(stopped.detail, /同期を開始・再開/);
    assert.equal(running.state, 'synced');
    assert.deepEqual(overview, before, 'the same four-app evidence cannot identify the local Port state');
  }
});

test('scope: untrusted names and unsupported app IDs cannot expand evidence coverage', async () => {
  const data = await scenario('S10').getAppSyncTargets('chord');
  const envelope = JSON.parse(toModelToolResult('getAppSyncTargets', data));
  assertPortNotObserved(envelope);
  assert.deepEqual(envelope.scope.subjectAppIds, ['chord']);
  assert.ok(envelope.trust.userControlledPaths.length > 0);
  for (const pointer of envelope.trust.userControlledPaths) assert.ok(pointer.startsWith('/data/targets/'));
  const unsupported = JSON.parse(toModelToolResult('getAppSyncTargets', { app: { appId: 'port' }, targets: [] }));
  assert.deepEqual(unsupported.scope.subjectAppIds, []);
  assertPortNotObserved(unsupported);
});

test('conversation: pending app evidence carries its scope beside the facts despite preceding app-focused history', async () => {
  // Include a deliberately wrong, invented earlier explanation; it stays history, not evidence.
  const prior = [...history, { role: 'user', content: '別アプリの保留がPortにも関係しますか。' },
    { role: 'assistant', content: '別アプリの保留でPortの再開表示が出ると考えられます。' }];
  for (const id of ['S2', 'S1']) {
    const p = provider([tool('getSyncOverview'), tool('getAppSyncTargets'), text(usefulPortReply)]);
    const result = await runSupportTurn({ provider: p, diagnostics: scenario(id), history: prior,
      message: 'Portの開始・再開が繰り返し出ます。原因と問い合わせ方法は？' });
    const request = p.requests.at(-1);
    assert.deepEqual(request.messages.slice(1, 1 + prior.length), prior);
    const evidence = request.messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content));
    assert.equal(evidence.length, 2);
    evidence.forEach(assertPortNotObserved);
    assert.equal(evidence[1].data.targets.some(t => t.reportState === 'pending'), id === 'S2');
    assert.equal(result.reply, usefulPortReply);
    assert.equal(result.stats.repairAttempted, false);
    assert.equal(result.stats.fallback, false);
    assert.equal(p.requests.length, 3);
  }
});

test('Port-only advice: useful general specification, concrete next step and follow-up can pass without tools or stock wording', async () => {
  const p = provider([text(usefulPortReply)]);
  const result = await runSupportTurn({ provider: p, message: 'Portで再開表示が繰り返し出ます。',
    diagnostics: { getSyncOverview() { assert.fail('unnecessary diagnostic call'); },
      getAppSyncTargets() { assert.fail('unnecessary diagnostic call'); } } });
  assert.equal(result.reply, usefulPortReply);
  assert.doesNotMatch(result.reply, /原因不明|原因を特定できません/);
  assert.deepEqual(p.requests[0].tools, AI_SUPPORT_TOOLS, 'the same two tools remain available; no forced router');
  assert.equal(result.stats.fallback, false);
  assert.equal(result.stats.modelCalls, 1);
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('一般仕様や切り分けの考え方（C）は説明してよい'));
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('Portだけの相談には、ツールで得られないローカル状態の確認や一般仕様の説明から答えてよい'));
});

test('repair: one existing UI repair keeps scope and does not redirect a Port question into app diagnosis', async () => {
  const p = provider([tool('getSyncOverview'), tool('getAppSyncTargets'),
    text('再同期ボタンを押してください。'), text(usefulPortReply)]);
  const result = await runSupportTurn({ provider: p, diagnostics: scenario('S2'), history,
    message: 'Portの開始・再開について教えてください。' });
  assert.equal(result.reply, usefulPortReply);
  assert.equal(result.stats.repaired, true);
  assert.equal(result.stats.fallback, false);
  assert.equal(p.requests.length, 4);
  const request = p.requests.at(-1);
  request.messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content)).forEach(assertPortNotObserved);
  assert.deepEqual(request.tools, []);
  assert.equal(request.messages.at(-1).content, repairInstruction(['resync_button']));
  assert.match(request.messages.at(-1).content, /4アプリの確認を案内する場合/);
  assert.match(request.messages.at(-1).content, /一般仕様による確認案内を分け/);
});

test('recheck absence: uncertainty still permits concrete device/app and refreshed-report guidance', async () => {
  const answer = '「もう一度確認」が無いことだけでは、確認不要や同期完了とは言えません。Pixelでコードクルーズをインターネット接続中に開き、設定 → クラウド同期の現在の表示を確認してください。Portへ戻って同期センターを開き直し、コードクルーズの「同期先2件」で前回報告と報告時刻を確認できます。';
  const p = provider([tool('getSyncOverview'), tool('getAppSyncTargets'), text(answer)]);
  const result = await runSupportTurn({ provider: p, diagnostics: scenario('S2'), message: '確認ボタンがありません。' });
  assert.equal(result.reply, answer);
  assert.equal(result.stats.fallback, false);
  assert.equal(result.stats.repairAttempted, false);
  assert.ok(AI_SUPPORT_SYSTEM_PROMPT.includes('非表示は確認不要や同期完了を意味するとは限らず'));
});
