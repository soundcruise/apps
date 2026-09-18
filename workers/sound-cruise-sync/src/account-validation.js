import {
  normalizeAppJoinCode,
  normalizeAccountRecoveryCode,
  parseAccountDeleteIntent,
  parseAccountAppCredential,
  parseAccountCredential,
  parseAccountRecoveryClaim,
  parseAccountHandoff
} from './account-crypto.js';
import { normalizeQaEnrollmentCode, parseQaCredential } from './account-qa-crypto.js';

export const ACCOUNT_API_APP_IDS = Object.freeze(['chord', 'pitch', 'fretboard', 'rhythm']);
export const ACCOUNT_MAX_BODY_BYTES = 16 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function exactObject(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function operationId(value) {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

function appId(value) {
  return ACCOUNT_API_APP_IDS.includes(value) ? value : null;
}

function label(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || CONTROL.test(value)) return undefined;
  const normalized = value.normalize('NFC').trim();
  return normalized && normalized.length <= 80 ? normalized : undefined;
}

function validTurnstile(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 4096 && !CONTROL.test(value);
}

export function validateAccountStartPayload(value) {
  const keys = ['operationId', 'appIds', 'accountCredential', 'recoveryCode', 'turnstileToken', 'deviceLabel'];
  if (!exactObject(value, keys) || !operationId(value.operationId) ||
      !parseAccountCredential(value.accountCredential) ||
      !normalizeAccountRecoveryCode(value.recoveryCode) ||
      !validTurnstile(value.turnstileToken)) return { ok: false };
  const deviceLabel = label(value.deviceLabel);
  if (deviceLabel === undefined || !Array.isArray(value.appIds) || value.appIds.length < 1 ||
      value.appIds.length > ACCOUNT_API_APP_IDS.length) return { ok: false };
  const appIds = [];
  for (const valueAppId of value.appIds) {
    const normalized = appId(valueAppId);
    if (!normalized || appIds.includes(normalized)) return { ok: false };
    appIds.push(normalized);
  }
  appIds.sort((left, right) => ACCOUNT_API_APP_IDS.indexOf(left) - ACCOUNT_API_APP_IDS.indexOf(right));
  return { ok: true, value: { ...value, appIds, deviceLabel } };
}

export function validatePortDeviceProvisionPayload(value) {
  if (!exactObject(value, ['operationId', 'appDeviceCredential', 'deviceLabel'])) {
    return { ok: false };
  }
  const deviceLabel = label(value.deviceLabel);
  const appDevice = parseAccountAppCredential(value.appDeviceCredential);
  if (!operationId(value.operationId) || !appDevice || deviceLabel === undefined) {
    return { ok: false };
  }
  return { ok: true, value: {
    operationId: value.operationId,
    appDeviceCredential: value.appDeviceCredential,
    appDeviceId: appDevice.deviceId,
    deviceLabel
  } };
}

export function validateQaEnrollmentPayload(value) {
  const keys = ['enrollmentCode', 'qaCredential', 'turnstileToken'];
  if (!exactObject(value, keys) || !normalizeQaEnrollmentCode(value.enrollmentCode) ||
      !parseQaCredential(value.qaCredential) || !validTurnstile(value.turnstileToken)) {
    return { ok: false };
  }
  return { ok: true, value: {
    enrollmentCode: normalizeQaEnrollmentCode(value.enrollmentCode),
    qaCredential: value.qaCredential,
    turnstileToken: value.turnstileToken
  } };
}

export function validateMembershipPreparePayload(value) {
  if (!exactObject(value, ['operationId', 'appId'])) return { ok: false };
  const normalized = { operationId: operationId(value.operationId), appId: appId(value.appId) };
  return normalized.operationId && normalized.appId ? { ok: true, value: normalized } : { ok: false };
}

export function validateHandoffIssuePayload(value) {
  if (!exactObject(value, ['operationId', 'appId', 'handoffToken'])) return { ok: false };
  const normalized = {
    operationId: operationId(value.operationId),
    appId: appId(value.appId),
    handoffToken: value.handoffToken
  };
  return normalized.operationId && normalized.appId && parseAccountHandoff(normalized.handoffToken)
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateHandoffConsumePayload(value) {
  const requiredKeys = [
    'operationId', 'appId', 'handoffToken', 'accountCredential',
    'appDeviceCredential', 'deviceLabel', 'consumeMode'
  ];
  const keys = Object.keys(value || {}).sort();
  const expected = requiredKeys.filter((key) => key !== 'qaCredential').sort();
  const withQa = [...expected, 'qaCredential'].sort();
  if (keys.length !== expected.length && keys.length !== withQa.length) return { ok: false };
  if (!keys.every((key, index) => key === (keys.length === expected.length ? expected : withQa)[index])) {
    return { ok: false };
  }
  const deviceLabel = label(value.deviceLabel);
  const normalized = {
    ...value,
    operationId: operationId(value.operationId),
    appId: appId(value.appId),
    deviceLabel,
    consumeMode: ['new_app', 'existing_chord'].includes(value.consumeMode)
      ? value.consumeMode : null
  };
  return normalized.operationId && normalized.appId &&
    (normalized.consumeMode !== 'existing_chord' || normalized.appId === 'chord') &&
    parseAccountHandoff(normalized.handoffToken) &&
    parseAccountCredential(normalized.accountCredential) &&
    parseAccountAppCredential(normalized.appDeviceCredential) &&
    (normalized.qaCredential === undefined || parseQaCredential(normalized.qaCredential)) &&
    deviceLabel !== undefined ? { ok: true, value: normalized } : { ok: false };
}

export function validateHandoffCancelPayload(value) {
  if (!exactObject(value, ['handoffId']) || !operationId(value.handoffId)) return { ok: false };
  return { ok: true, value: { handoffId: value.handoffId } };
}

export function validateAppJoinIssuePayload(value) {
  const keys = ['operationId', 'invitationId', 'appId', 'joinCode'];
  if (!exactObject(value, keys)) return { ok: false };
  const normalized = {
    operationId: operationId(value.operationId),
    invitationId: operationId(value.invitationId),
    appId: appId(value.appId),
    joinCode: normalizeAppJoinCode(value.joinCode)
  };
  return Object.values(normalized).every(Boolean) ? { ok: true, value: normalized } : { ok: false };
}

export function validateAppJoinConsumePayload(value) {
  const requiredKeys = [
    'operationId', 'appId', 'joinCode', 'accountCredential',
    'appDeviceCredential', 'deviceLabel', 'consumeMode'
  ];
  const keys = Object.keys(value || {});
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !requiredKeys.every((key) => keys.includes(key)) ||
      keys.some((key) => ![...requiredKeys, 'qaCredential'].includes(key)) ||
      ![requiredKeys.length, requiredKeys.length + 1].includes(keys.length)) return { ok: false };
  const deviceLabel = label(value.deviceLabel);
  const normalized = {
    ...value,
    operationId: operationId(value.operationId),
    appId: appId(value.appId),
    joinCode: normalizeAppJoinCode(value.joinCode),
    deviceLabel,
    consumeMode: ['new_app', 'existing_chord'].includes(value.consumeMode)
      ? value.consumeMode : null
  };
  return normalized.operationId && normalized.appId && normalized.joinCode &&
    (normalized.consumeMode !== 'existing_chord' || normalized.appId === 'chord') &&
    parseAccountCredential(normalized.accountCredential) &&
    parseAccountAppCredential(normalized.appDeviceCredential) &&
    (normalized.qaCredential === undefined || parseQaCredential(normalized.qaCredential)) &&
    deviceLabel !== undefined
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateAppJoinCancelPayload(value) {
  if (!exactObject(value, ['invitationId']) || !operationId(value.invitationId)) return { ok: false };
  return { ok: true, value: { invitationId: value.invitationId } };
}

export function validateAppJoinStatusQuery(url) {
  if ([...url.searchParams.keys()].some((key) => key !== 'invitationId')) return { ok: false };
  const invitationId = operationId(url.searchParams.get('invitationId'));
  return invitationId ? { ok: true, value: { invitationId } } : { ok: false };
}

export function validatePortJoinIssuePayload(value) {
  if (!exactObject(value, ['operationId', 'invitationId', 'joinCode'])) return { ok: false };
  const normalized = {
    operationId: operationId(value.operationId),
    invitationId: operationId(value.invitationId),
    joinCode: normalizeAppJoinCode(value.joinCode)
  };
  return Object.values(normalized).every(Boolean) ? { ok: true, value: normalized } : { ok: false };
}

export function validatePortJoinConsumePayload(value) {
  const requiredKeys = ['operationId', 'joinCode', 'accountCredential', 'deviceLabel'];
  const keys = Object.keys(value || {});
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !requiredKeys.every((key) => keys.includes(key)) ||
      keys.some((key) => ![...requiredKeys, 'qaCredential'].includes(key)) ||
      ![requiredKeys.length, requiredKeys.length + 1].includes(keys.length)) return { ok: false };
  const deviceLabel = label(value.deviceLabel);
  const normalized = {
    ...value,
    operationId: operationId(value.operationId),
    joinCode: normalizeAppJoinCode(value.joinCode),
    deviceLabel
  };
  return normalized.operationId && normalized.joinCode &&
    parseAccountCredential(normalized.accountCredential) &&
    (normalized.qaCredential === undefined || parseQaCredential(normalized.qaCredential)) &&
    deviceLabel !== undefined
    ? { ok: true, value: normalized } : { ok: false };
}

export function validatePortJoinCancelPayload(value) {
  if (!exactObject(value, ['invitationId']) || !operationId(value.invitationId)) return { ok: false };
  return { ok: true, value: { invitationId: value.invitationId } };
}

export const validatePortJoinStatusQuery = validateAppJoinStatusQuery;

export function validateAccountReadQuery(url) {
  return url.search === '' ? { ok: true, value: {} } : { ok: false };
}

export function validateAccountRecoveryPreparePayload(value) {
  const keys = [
    'operationId', 'recoveryCode', 'claimToken', 'nextRecoveryCode',
    'accountCredential', 'deviceLabel', 'turnstileToken'
  ];
  if (!exactObject(value, keys)) return { ok: false };
  const deviceLabel = label(value.deviceLabel);
  const normalized = {
    ...value,
    operationId: operationId(value.operationId),
    recoveryCode: normalizeAccountRecoveryCode(value.recoveryCode),
    nextRecoveryCode: normalizeAccountRecoveryCode(value.nextRecoveryCode),
    deviceLabel
  };
  return normalized.operationId && normalized.recoveryCode && normalized.nextRecoveryCode &&
    normalized.recoveryCode !== normalized.nextRecoveryCode &&
    parseAccountRecoveryClaim(normalized.claimToken) &&
    parseAccountCredential(normalized.accountCredential) &&
    validTurnstile(normalized.turnstileToken) && deviceLabel !== undefined
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateAccountRecoveryCommitPayload(value) {
  if (!exactObject(value, ['operationId', 'claimToken', 'accountCredential'])) return { ok: false };
  const normalized = { ...value, operationId: operationId(value.operationId) };
  return normalized.operationId && parseAccountRecoveryClaim(normalized.claimToken) &&
    parseAccountCredential(normalized.accountCredential)
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateAccountRecoveryRotationPreparePayload(value) {
  const keys = ['operationId', 'claimToken', 'nextRecoveryCode', 'turnstileToken'];
  if (!exactObject(value, keys)) return { ok: false };
  const normalized = {
    ...value,
    operationId: operationId(value.operationId),
    nextRecoveryCode: normalizeAccountRecoveryCode(value.nextRecoveryCode)
  };
  return normalized.operationId && normalized.nextRecoveryCode &&
    parseAccountRecoveryClaim(normalized.claimToken) && validTurnstile(normalized.turnstileToken)
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateAccountRecoveryRotationCommitPayload(value) {
  if (!exactObject(value, ['operationId', 'claimToken'])) return { ok: false };
  const normalized = { ...value, operationId: operationId(value.operationId) };
  return normalized.operationId && parseAccountRecoveryClaim(normalized.claimToken)
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateAccountDeviceRevokePayload(value) {
  if (!exactObject(value, ['operationId', 'accountDeviceId'])) return { ok: false };
  const normalized = {
    operationId: operationId(value.operationId),
    accountDeviceId: operationId(value.accountDeviceId)
  };
  return normalized.operationId && normalized.accountDeviceId
    ? { ok: true, value: normalized } : { ok: false };
}

// This endpoint always acts on the authenticated Port Account Device.  Keeping
// the body to the idempotency key prevents a caller from selecting another
// environment by label, time, or a client-supplied device id.
export function validateCurrentEnvironmentDetachPayload(value) {
  if (!exactObject(value, ['operationId'])) return { ok: false };
  const normalized = { operationId: operationId(value.operationId) };
  return normalized.operationId ? { ok: true, value: normalized } : { ok: false };
}

// A Pro app can only detach the environment authenticated by its own app
// credential.  The request intentionally carries no device or Account id.
export function validateCurrentAppEnvironmentDetachPayload(value) {
  if (!exactObject(value, ['operationId'])) return { ok: false };
  const normalized = { operationId: operationId(value.operationId) };
  return normalized.operationId ? { ok: true, value: normalized } : { ok: false };
}

export function validateAccountAppDetachPayload(value) {
  if (!exactObject(value, ['operationId', 'appId'])) return { ok: false };
  const normalized = {
    operationId: operationId(value.operationId),
    appId: appId(value.appId)
  };
  return normalized.operationId && normalized.appId
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateAccountAppDeleteCancelPayload(value) {
  if (!exactObject(value, ['operationId', 'appId'])) return { ok: false };
  const normalized = {
    operationId: operationId(value.operationId),
    appId: appId(value.appId)
  };
  return normalized.operationId && normalized.appId
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateAccountAppEnvironmentRevokePayload(value) {
  if (!exactObject(value, ['operationId', 'appId', 'appDeviceId'])) return { ok: false };
  const normalized = {
    operationId: operationId(value.operationId),
    appId: appId(value.appId),
    appDeviceId: operationId(value.appDeviceId)
  };
  return normalized.operationId && normalized.appId && normalized.appDeviceId
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateAccountDeleteIntentPayload(value, scope) {
  const keys = scope === 'app' ? ['operationId', 'intentToken', 'appId'] : ['operationId', 'intentToken'];
  if (!exactObject(value, keys)) return { ok: false };
  const normalized = {
    ...value,
    operationId: operationId(value.operationId),
    appId: scope === 'app' ? appId(value.appId) : null
  };
  return normalized.operationId && parseAccountDeleteIntent(normalized.intentToken) &&
    (scope === 'account' || normalized.appId)
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateAccountDeleteCommitPayload(value, scope) {
  return validateAccountDeleteIntentPayload(value, scope);
}

function positiveGeneration(value) {
  return Number.isInteger(value) && value >= 1 ? value : null;
}

export function validateChordBridgePreparePayload(value) {
  if (!exactObject(value, ['operationId', 'membershipId', 'expectedAccountGeneration'])) {
    return { ok: false };
  }
  const normalized = {
    operationId: operationId(value.operationId),
    membershipId: operationId(value.membershipId),
    expectedAccountGeneration: positiveGeneration(value.expectedAccountGeneration)
  };
  return Object.values(normalized).every(Boolean) ? { ok: true, value: normalized } : { ok: false };
}

export function validateChordBridgeDualPayload(value) {
  const keys = [
    'operationId', 'bridgeId', 'expectedBridgeGeneration',
    'accountRecoveryVersion', 'recoverySaved'
  ];
  if (!exactObject(value, keys)) return { ok: false };
  const normalized = {
    operationId: operationId(value.operationId),
    bridgeId: operationId(value.bridgeId),
    expectedBridgeGeneration: positiveGeneration(value.expectedBridgeGeneration),
    accountRecoveryVersion: positiveGeneration(value.accountRecoveryVersion),
    recoverySaved: value.recoverySaved === true
  };
  return normalized.operationId && normalized.bridgeId && normalized.expectedBridgeGeneration &&
    normalized.accountRecoveryVersion && normalized.recoverySaved
    ? { ok: true, value: normalized } : { ok: false };
}

export function validateChordBridgeTransitionPayload(value) {
  if (!exactObject(value, ['operationId', 'bridgeId', 'expectedBridgeGeneration'])) {
    return { ok: false };
  }
  const normalized = {
    operationId: operationId(value.operationId),
    bridgeId: operationId(value.bridgeId),
    expectedBridgeGeneration: positiveGeneration(value.expectedBridgeGeneration)
  };
  return Object.values(normalized).every(Boolean) ? { ok: true, value: normalized } : { ok: false };
}
