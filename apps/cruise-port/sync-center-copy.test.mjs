import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ui = read('./sync-center-ui.js');

test('Account creation and Recovery rotation both expose safe copy controls', () => {
  for (const html of [read('./index.html'), read('./pro_9a3943176561/index.html')]) {
    assert.match(html, /id="sync-center-setup-copy"[^>]*hidden>復旧コードをコピー/);
    assert.match(html, /id="sync-center-recovery-copy"[^>]*hidden>復旧コードをコピー/);
    assert.match(html, /id="sync-center-setup-copy-status"[^>]*role="status"/);
    assert.match(html, /id="sync-center-recovery-copy-status"[^>]*role="status"/);
  }
  assert.match(ui, /コピーしました/);
  assert.match(ui, /コピーできませんでした。コードを選択してコピーしてください。/);
  assert.match(ui, /button\.disabled = true/);
  assert.match(ui, /aria-busy/);
  assert.doesNotMatch(ui, /console\.(?:log|info|debug)\([^)]*(?:recovery|Join|credential|token)/i);
});

test('Port action and destructive confirmation labels are explicit', () => {
  assert.match(ui, /const needsInitialConnection = \['unset', 'prepared', 'detached'\]\.includes\(app\.status\)/);
  assert.match(ui, /needsInitialConnection \? '同期コード' : canRemoveAppSync \? '同期を解除' : app\.statusLabel/);
  assert.match(ui, /querySelectorAll\('\[data-sync-app-delete\]'\)/);
  for (const html of [read('./index.html'), read('./pro_9a3943176561/index.html')]) {
    for (const appId of ['chord', 'pitch', 'fretboard', 'rhythm']) {
      assert.match(html, new RegExp(`data-sync-app-delete="${appId}"`));
    }
  }
  assert.match(ui, /Sound Cruise Syncアカウントを削除/);
  assert.match(ui, /action\.textContent = '追加コード'/);
  assert.match(ui, /lifecycleConfirm\.textContent = '削除を確定'/);
});
