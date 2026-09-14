import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccountCredential,
  createAccountDeleteIntent,
  createAccountHandoff,
  createAccountRecoveryClaim,
  createAccountRecoveryCode
} from '../src/account-crypto.js';
import { createQaCredential } from '../src/account-qa-crypto.js';
import { createIdentityMaterial } from '../src/crypto.js';
import {
  validateAccountReadQuery,
  validateAccountDeleteCommitPayload,
  validateAccountDeleteIntentPayload,
  validateAccountDeviceRevokePayload,
  validateAccountRecoveryCommitPayload,
  validateAccountRecoveryPreparePayload,
  validateAccountStartPayload,
  validateChordBridgeDualPayload,
  validateChordBridgePreparePayload,
  validateChordBridgeTransitionPayload,
  validateHandoffCancelPayload,
  validateHandoffConsumePayload,
  validateHandoffIssuePayload,
  validateMembershipPreparePayload
} from '../src/account-validation.js';

const operationId = '123e4567-e89b-42d3-a456-426614174000';
const pepper = 'm3-test-pepper-material-at-least-32-characters';

test('strict Account payloads accept only known apps and normalized bounded labels', async () => {
  const account = createAccountCredential();
  const recoveryCode = createAccountRecoveryCode();
  const valid = {
    operationId,
    appIds: ['rhythm', 'chord'],
    accountCredential: account.credential,
    recoveryCode,
    turnstileToken: 'test-turnstile-token',
    deviceLabel: '  Cafe\u0301  '
  };
  const result = validateAccountStartPayload(valid);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.appIds, ['chord', 'rhythm']);
  assert.equal(result.value.deviceLabel, 'Café');
  assert.equal(validateAccountStartPayload({ ...valid, accountId: operationId }).ok, false);
  assert.equal(validateAccountStartPayload({ ...valid, appIds: ['chord', 'chord'] }).ok, false);
  assert.equal(validateAccountStartPayload({ ...valid, appIds: ['unknown'] }).ok, false);
});

test('Chord bridge payloads are strict, generation-bound and accept no identity selectors', () => {
  const membershipId = '123e4567-e89b-42d3-a456-426614174001';
  const bridgeId = '123e4567-e89b-42d3-a456-426614174002';
  assert.equal(validateChordBridgePreparePayload({
    operationId, membershipId, expectedAccountGeneration: 1
  }).ok, true);
  assert.equal(validateChordBridgePreparePayload({
    operationId, membershipId, expectedAccountGeneration: 0
  }).ok, false);
  assert.equal(validateChordBridgePreparePayload({
    operationId, membershipId, expectedAccountGeneration: 1, syncUserId: 'victim'
  }).ok, false);
  assert.equal(validateChordBridgeDualPayload({
    operationId,
    bridgeId,
    expectedBridgeGeneration: 1,
    accountRecoveryVersion: 1,
    recoverySaved: true
  }).ok, true);
  assert.equal(validateChordBridgeDualPayload({
    operationId,
    bridgeId,
    expectedBridgeGeneration: 1,
    accountRecoveryVersion: 1,
    recoverySaved: false
  }).ok, false);
  assert.equal(validateChordBridgeTransitionPayload({
    operationId, bridgeId, expectedBridgeGeneration: 2
  }).ok, true);
  assert.equal(validateChordBridgeTransitionPayload({
    operationId, bridgeId, expectedBridgeGeneration: 2, accountId: 'attacker'
  }).ok, false);
});

test('membership and handoff validation rejects identity injection and wrong credential kinds', async () => {
  const account = createAccountCredential();
  const handoff = createAccountHandoff();
  const app = await createIdentityMaterial(pepper);
  const qa = createQaCredential();
  assert.equal(validateMembershipPreparePayload({ operationId, appId: 'pitch' }).ok, true);
  assert.equal(validateHandoffIssuePayload({
    operationId, appId: 'pitch', handoffToken: handoff.handoffToken
  }).ok, true);
  assert.equal(validateHandoffConsumePayload({
    operationId,
    appId: 'pitch',
    handoffToken: handoff.handoffToken,
    accountCredential: account.credential,
    appDeviceCredential: app.credential,
    qaCredential: qa.credential,
    deviceLabel: null,
    consumeMode: 'new_app'
  }).ok, true);
  assert.equal(validateHandoffConsumePayload({
    operationId,
    appId: 'pitch',
    handoffToken: handoff.handoffToken,
    accountCredential: app.credential,
    appDeviceCredential: account.credential,
    qaCredential: qa.credential,
    deviceLabel: null,
    consumeMode: 'new_app'
  }).ok, false);
  assert.equal(validateHandoffConsumePayload({
    operationId, appId: 'chord', handoffToken: handoff.handoffToken,
    accountCredential: account.credential, appDeviceCredential: app.credential,
    qaCredential: qa.credential,
    deviceLabel: null, consumeMode: 'existing_chord'
  }).ok, true);
  assert.equal(validateHandoffConsumePayload({
    operationId, appId: 'pitch', handoffToken: handoff.handoffToken,
    accountCredential: account.credential, appDeviceCredential: app.credential,
    qaCredential: qa.credential,
    deviceLabel: null, consumeMode: 'existing_chord'
  }).ok, false);
  assert.equal(validateHandoffCancelPayload({ handoffId: handoff.handoffId }).ok, true);
  assert.equal(validateHandoffCancelPayload({ handoffId: handoff.handoffId, accountId: 'x' }).ok, false);
  assert.equal(validateAccountReadQuery(new URL('https://example.test/v2/accounts/summary')).ok, true);
  assert.equal(validateAccountReadQuery(new URL('https://example.test/v2/accounts/summary?account=x')).ok, false);
});

test('Account lifecycle validation is exact, scoped and accepts no Account selector', () => {
  const account = createAccountCredential();
  const claim = createAccountRecoveryClaim();
  const intent = createAccountDeleteIntent();
  const recoveryCode = createAccountRecoveryCode();
  const nextRecoveryCode = createAccountRecoveryCode();
  const prepare = {
    operationId, claimToken: claim.claimToken,
    accountCredential: account.credential, recoveryCode, nextRecoveryCode,
    turnstileToken: 'verified', deviceLabel: null
  };
  assert.equal(validateAccountRecoveryPreparePayload(prepare).ok, true);
  assert.equal(validateAccountRecoveryPreparePayload({ ...prepare, accountId: 'victim' }).ok, false);
  assert.equal(validateAccountRecoveryCommitPayload({
    operationId, claimToken: claim.claimToken, accountCredential: account.credential
  }).ok, true);
  assert.equal(validateAccountDeviceRevokePayload({
    operationId, accountDeviceId: account.deviceId
  }).ok, true);
  assert.equal(validateAccountDeleteIntentPayload({
    operationId, intentToken: intent.intentToken, appId: 'pitch'
  }, 'app').ok, true);
  assert.equal(validateAccountDeleteCommitPayload({
    operationId, intentToken: intent.intentToken
  }, 'account').ok, true);
  assert.equal(validateAccountDeleteCommitPayload({
    operationId, intentToken: intent.intentToken, appId: 'chord'
  }, 'account').ok, false);
});
