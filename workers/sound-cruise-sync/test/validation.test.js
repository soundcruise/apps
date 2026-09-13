import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isJsonContentType, readBodyWithLimit, validateStartPayload,
  validateRecoveryPayload, validateRecoveryIssuePayload
} from '../src/validation.js';

const env = { SYNC_ALLOWED_APP_IDS: 'chord' };
const hash = 'a'.repeat(64);

function validPayload() {
  return {
    appId: 'chord',
    turnstileToken: 'token',
    deviceLabel: ' QA iPhone ',
    initialSummary: { schemaVersion: 1, recordCount: 5, manifestHash: hash }
  };
}

test('valid start payload is normalized without accepting identity fields', () => {
  const result = validateStartPayload(validPayload(), env);
  assert.equal(result.ok, true);
  assert.equal(result.value.deviceLabel, 'QA iPhone');
  assert.deepEqual(result.value.initialSummary, { schemaVersion: 1, recordCount: 5, manifestHash: hash });
  const cohortPayload = validPayload();
  cohortPayload.enrollmentCode = 'SCE1-0123-4567-89ab-cdef-ghjk';
  assert.equal(validateStartPayload(cohortPayload, env).value.enrollmentCode, 'SCE10123456789ABCDEFGHJK');
  cohortPayload.enrollmentCode = '0123-4567-89AB-CDEF-GHJK';
  assert.equal(validateStartPayload(cohortPayload, env).ok, false, 'Recovery-shaped input cannot become an Enrollment Code');
  for (const forbidden of ['userId', 'deviceId', 'credential', 'recoveryCode']) {
    const payload = validPayload();
    payload[forbidden] = 'attacker-controlled';
    assert.equal(validateStartPayload(payload, env).ok, false, `${forbidden} is rejected`);
  }
});

test('app allowlist, summary, token, label, and unknown fields are fail closed', () => {
  const cases = [];
  const wrongApp = validPayload(); wrongApp.appId = 'pitch'; cases.push(wrongApp);
  const wrongSchema = validPayload(); wrongSchema.initialSummary.schemaVersion = 2; cases.push(wrongSchema);
  const wrongCount = validPayload(); wrongCount.initialSummary.recordCount = -1; cases.push(wrongCount);
  const wrongHash = validPayload(); wrongHash.initialSummary.manifestHash = 'bad'; cases.push(wrongHash);
  const noToken = validPayload(); noToken.turnstileToken = ''; cases.push(noToken);
  const controlLabel = validPayload(); controlLabel.deviceLabel = 'bad\nlabel'; cases.push(controlLabel);
  const unknown = validPayload(); unknown.extra = true; cases.push(unknown);
  cases.forEach((payload) => assert.equal(validateStartPayload(payload, env).ok, false));
});

test('JSON content type and bounded UTF-8 reader reject unsafe requests', async () => {
  assert.equal(isJsonContentType('application/json'), true);
  assert.equal(isJsonContentType('application/json; charset=UTF-8'), true);
  assert.equal(isJsonContentType('text/json'), false);
  const valid = await readBodyWithLimit(new Request('https://sync.test', { method: 'POST', body: '{"ok":true}' }), 20);
  assert.equal(valid.ok, true);
  const oversized = await readBodyWithLimit(new Request('https://sync.test', { method: 'POST', body: 'x'.repeat(21) }), 20);
  assert.equal(oversized.tooLarge, true);
  const invalidUtf8 = await readBodyWithLimit(new Request('https://sync.test', {
    method: 'POST', body: new Uint8Array([0xc3, 0x28])
  }), 20);
  assert.equal(invalidUtf8.ok, false);
});

test('Recovery prepare/commit payloads normalize codes and reject identity injection', () => {
  const prepared = validateRecoveryPayload({
    operation: 'prepare', appId: 'chord', recoveryCode: '0123-4567-89ab-cdef-ghjk',
    turnstileToken: 'token', deviceLabel: ' QA Recovery '
  }, env);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.value.recoveryCode, '0123456789ABCDEFGHJK');
  assert.equal(prepared.value.deviceLabel, 'QA Recovery');
  assert.equal(validateRecoveryPayload({ ...prepared.value, userId: 'attacker' }, env).ok, false);
  assert.equal(validateRecoveryPayload({ ...prepared.value, recoveryCode: 'O'.repeat(20) }, env).ok, false);
  assert.equal(validateRecoveryPayload({ operation: 'commit', appId: 'chord', claimToken: 'token' }, env).ok, true);
  assert.equal(validateRecoveryPayload({ operation: 'commit', appId: 'pitch', claimToken: 'token' }, env).ok, false);
  assert.equal(validateRecoveryPayload({ operation: 'commit', appId: 'chord', claimToken: 'x'.repeat(129) }, env).ok, false);
  assert.equal(validateRecoveryIssuePayload({ appId: 'chord' }, env).ok, true);
  assert.equal(validateRecoveryIssuePayload({ appId: 'chord', recoveryCode: 'secret' }, env).ok, false);
});
