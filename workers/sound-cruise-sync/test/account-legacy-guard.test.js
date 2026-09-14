import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_ACCOUNT_OPERATION_MATRIX,
  legacyOperationDecision,
  readLegacyAccountPolicy
} from '../src/account-legacy-guard.js';

const policy = (mode, bridgeState = null) => ({
  schemaAvailable: true,
  mode,
  bridgeState
});

test('legacy destructive-operation matrix preserves data plane and narrows only ownership authority', () => {
  for (const mode of ['legacy', 'dual', 'account']) {
    for (const operation of ['push', 'pull', 'snapshot', 'migration', 'pairing', 'device_list', 'device_revoke']) {
      assert.equal(legacyOperationDecision(policy(mode), operation).allowed, true, `${mode}:${operation}`);
    }
  }
  for (const operation of ['recovery_prepare', 'recovery_commit', 'recovery_issue']) {
    assert.equal(legacyOperationDecision(policy('legacy'), operation).allowed, true);
    assert.equal(legacyOperationDecision(policy('dual', 'dual'), operation).allowed, true);
    assert.deepEqual(legacyOperationDecision(policy('account', 'finalized'), operation), {
      allowed: false,
      code: 'account_recovery_required'
    });
  }
  for (const operation of ['cloud_delete_intent', 'cloud_delete_commit']) {
    assert.equal(legacyOperationDecision(policy('legacy'), operation).allowed, true);
    assert.equal(legacyOperationDecision(policy('legacy', 'prepared'), operation).allowed, false);
    assert.equal(legacyOperationDecision(policy('dual', 'dual'), operation).allowed, false);
    assert.equal(legacyOperationDecision(policy('account', 'finalized'), operation).allowed, false);
  }
  assert.deepEqual(LEGACY_ACCOUNT_OPERATION_MATRIX.legacyRecovery, {
    legacy: 'allow', dual: 'allow', account: 'deny'
  });
});

test('missing Account bridge schema is backward-compatible for an existing legacy Chord user', async () => {
  const missing = {
    prepare() {
      return {
        bind() {
          return { async first() { throw new Error('no such table: sync_chord_account_bridges'); } };
        }
      };
    }
  };
  const result = await readLegacyAccountPolicy(missing, 'legacy-user');
  assert.deepEqual(result, { schemaAvailable: false, mode: 'legacy', bridgeState: null });
  assert.equal(legacyOperationDecision(result, 'recovery_issue').allowed, true);
  assert.equal(legacyOperationDecision(result, 'cloud_delete_intent').allowed, true);
});

test('unexpected Account policy database failures fail closed instead of being treated as legacy', async () => {
  const failed = {
    prepare() {
      return {
        bind() {
          return { async first() { throw new Error('D1 transport unavailable'); } };
        }
      };
    }
  };
  await assert.rejects(readLegacyAccountPolicy(failed, 'legacy-user'), /D1 transport unavailable/);
  assert.deepEqual(legacyOperationDecision(null, 'cloud_delete_intent'), {
    allowed: false,
    code: 'account_ownership_unavailable'
  });
});
