import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('「✓ 同期済み」 in 2 (Cruise apps, --available) uses exactly the style of 1 (Cruise Port, --synced)', () => {
  const rule = css.match(/\.sync-center-app-status-chip--synced,\s*\.sync-center-app-status-chip--available \{([^}]*)\}/);
  assert.ok(rule, 'one shared rule');
  assert.match(rule[1], /border-color: rgba\(232, 201, 122, 0\.72\);\s*color: #241d0d;\s*background: rgba\(232, 201, 122, 0\.88\);/);
  // The mobile layout may adjust spacing, but no other rule changes the shared colours.
  const availableRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector.includes('.sync-center-app-status-chip--available'));
  assert.equal(availableRules.length, 2);
  assert.doesNotMatch(availableRules[1][2], /(?:^|;)\s*(?:color|background|border-color)\s*:/);
  // Other states keep their own colours.
  for (const state of ['attention', 'syncing', 'connecting', 'deleting', 'offline', 'detached', 'unavailable', 'recheck', 'checking']) {
    assert.match(css, new RegExp(`\\.sync-center-app-status-chip--${state}[ ,{]`), state);
  }
  assert.match(css, /\.sync-center-app-status-chip--recheck \{ border-style: dashed;/);
});
