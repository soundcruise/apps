import test from 'node:test';
import assert from 'node:assert/strict';
import { runAudit } from './fixtures/midnight-audit.mjs';

// Fixed, synthetic reproductions from RESUME-REVIEW.md. A failing test is a release HOLD.
const results = await runAudit();
test('A: published v1 Midnight send, local/remote resolution and subsequent sync converge', () => {
  for (const row of results.legacy.filter(r => r.scenario === 'published-v1-explicit-midnight')) {
    assert.equal(row.rounds[0].ok, true, `${row.app}: first send`);
    assert.equal(row.localResolution.ok, true, `${row.app}: local resolution`);
    assert.equal(row.remoteResolution.ok, true, `${row.app}: remote resolution`);
    assert.equal(row.afterResolution.resync.ok, true, `${row.app}: resync`);
  }
});
test('B: frozen four-theme v1 explicit Light persists without repeated writes', () => {
  for (const row of results.legacy.filter(r => r.scenario === 'frozen-v1-explicit-light')) {
    assert(row.rounds.every(r => r.ok && r.localTheme === 'light' && r.cloudTheme === 'light'), row.app);
    assert.equal(row.rounds[0].cloudRevision, row.rounds[2].cloudRevision, `${row.app}: no write churn`);
  }
});
test('C: Chord capability upgrade refreshes Midnight past the persisted cursor', () => {
  assert.equal(results.chordUpgrade.pull.ok, true);
  assert.equal(results.chordUpgrade.localTheme, 'midnight');
  assert.equal(results.chordUpgrade.cloudTheme, 'midnight');
  assert.equal(results.chordUpgrade.retainedCursor, true);
  assert.equal(results.chordUpgrade.restartNoExtraSnapshot, true);
  assert.equal(results.chordUpgrade.pending.code, 'theme_view_upgrade_pending');
  assert.equal(results.chordUpgrade.pendingPreserved, true);
  assert.equal(results.chordUpgrade.badManifest.code, 'invalid_cloud_snapshot');
  assert.equal(results.chordUpgrade.badManifestPreserved, true);
  assert.equal(results.chordUpgrade.retry.ok, true);
  assert.equal(results.chordUpgrade.retryTheme, 'midnight');
  assert(results.upgrades.every(r => r.restoredTheme === 'midnight' && !r.conflicts));
});
test('D: Port failed overlay deletion preserves Midnight after restart', () => {
  assert.equal(results.portPartialCommit.saveOk, false);
  assert.equal(results.portPartialCommit.restartTheme, results.portPartialCommit.before);
});
