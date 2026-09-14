import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_CRYPTO,
  accountCredentialVerifier,
  accountHandoffVerifier,
  accountOperationFingerprint,
  accountRecoveryCodeVerifier,
  createAccountCredential,
  createAccountHandoff,
  createAccountRecoveryCode,
  formatAccountRecoveryCode,
  normalizeAccountRecoveryCode,
  parseAccountCredential,
  parseAccountHandoff
} from '../src/account-crypto.js';

const pepper = 'm3-test-pepper-material-at-least-32-characters';

test('Account, handoff and Recovery material use separate explicit domains', async () => {
  const account = createAccountCredential();
  const handoff = createAccountHandoff();
  const recovery = createAccountRecoveryCode();
  assert.equal(parseAccountCredential(account.credential)?.deviceId, account.deviceId);
  assert.equal(parseAccountHandoff(handoff.handoffToken)?.handoffId, handoff.handoffId);
  assert.equal(normalizeAccountRecoveryCode(formatAccountRecoveryCode(recovery)), recovery);
  assert.equal(recovery.length, ACCOUNT_CRYPTO.ACCOUNT_RECOVERY_PREFIX.length + 20);

  const accountVerifier = await accountCredentialVerifier(account.credential, pepper);
  const handoffVerifier = await accountHandoffVerifier(handoff.handoffToken, pepper);
  const recoveryVerifier = await accountRecoveryCodeVerifier(recovery, pepper);
  assert.match(accountVerifier, /^[a-f0-9]{64}$/);
  assert.equal(new Set([accountVerifier, handoffVerifier, recoveryVerifier]).size, 3);
  assert.equal(accountVerifier.includes(account.credential), false);
});

test('operation fingerprints are canonical, length-delimited and secret-free hashes', async () => {
  const one = await accountOperationFingerprint(['ab', 'c']);
  const two = await accountOperationFingerprint(['a', 'bc']);
  const retry = await accountOperationFingerprint(['ab', 'c']);
  assert.match(one, /^[a-f0-9]{64}$/);
  assert.notEqual(one, two);
  assert.equal(one, retry);
  assert.equal(one.includes('ab'), false);
});

test('malformed Account and handoff tokens fail before verifier generation', async () => {
  assert.equal(parseAccountCredential('sca1.bad.secret'), null);
  assert.equal(parseAccountHandoff('sch1.bad.secret'), null);
  assert.equal(normalizeAccountRecoveryCode('SAR1-INVALID'), null);
  await assert.rejects(() => accountCredentialVerifier('invalid', pepper));
  await assert.rejects(() => accountHandoffVerifier('invalid', pepper));
  await assert.rejects(() => accountRecoveryCodeVerifier('invalid', pepper));
});
