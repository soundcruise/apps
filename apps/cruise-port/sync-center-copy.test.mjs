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
  assert.match(ui, /app\.action === 'setup' \? '接続コードを表示' : 'アプリを開く'/);
  assert.match(ui, /addEnvironment\.textContent = '別の環境を追加'/);
  assert.match(ui, /lifecycleConfirm\.textContent = '削除を確定'/);
});
