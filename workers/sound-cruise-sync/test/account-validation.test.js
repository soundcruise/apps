import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccountCredential,
  createAccountHandoff,
  createAccountRecoveryCode
} from '../src/account-crypto.js';
import { createIdentityMaterial } from '../src/crypto.js';
import {
  validateAccountReadQuery,
  validateAccountStartPayload,
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

test('membership and handoff validation rejects identity injection and wrong credential kinds', async () => {
  const account = createAccountCredential();
  const handoff = createAccountHandoff();
  const app = await createIdentityMaterial(pepper);
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
    deviceLabel: null
  }).ok, true);
  assert.equal(validateHandoffConsumePayload({
    operationId,
    appId: 'pitch',
    handoffToken: handoff.handoffToken,
    accountCredential: app.credential,
    appDeviceCredential: account.credential,
    deviceLabel: null
  }).ok, false);
  assert.equal(validateHandoffCancelPayload({ handoffId: handoff.handoffId }).ok, true);
  assert.equal(validateHandoffCancelPayload({ handoffId: handoff.handoffId, accountId: 'x' }).ok, false);
  assert.equal(validateAccountReadQuery(new URL('https://example.test/v2/accounts/summary')).ok, true);
  assert.equal(validateAccountReadQuery(new URL('https://example.test/v2/accounts/summary?account=x')).ok, false);
});
