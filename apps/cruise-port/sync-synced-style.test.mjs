import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('「✓ 同期済み」 in 2 (Cruise apps, --available) uses exactly the style of 1 (Cruise Port, --synced)', () => {
  const rule = css.match(/\.sync-center-app-status-chip--synced,\s*\.sync-center-app-status-chip--available \{([^}]*)\}/);
  assert.ok(rule, 'one shared rule');
  assert.match(rule[1], /border-color: rgba\(232, 201, 122, 0\.72\);\s*color: #241d0d;\s*background: rgba\(232, 201, 122, 0\.88\);/);
  // No other rule sets the available chip's colours (the shared rule is the only one naming it).
  assert.equal((css.match(/\.sync-center-app-status-chip--available\b/g) || []).length, 1);
  // Other states keep their own colours.
  for (const state of ['attention', 'syncing', 'connecting', 'deleting', 'offline', 'detached', 'unavailable', 'recheck', 'checking']) {
    assert.match(css, new RegExp(`\\.sync-center-app-status-chip--${state}[ ,{]`), state);
  }
  assert.match(css, /\.sync-center-app-status-chip--recheck \{ border-style: dashed;/);
});
