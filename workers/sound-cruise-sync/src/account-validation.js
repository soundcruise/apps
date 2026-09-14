import {
  normalizeAccountRecoveryCode,
  parseAccountAppCredential,
  parseAccountCredential,
  parseAccountHandoff
} from './account-crypto.js';

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
  const keys = [
    'operationId', 'appId', 'handoffToken', 'accountCredential',
    'appDeviceCredential', 'deviceLabel'
  ];
  if (!exactObject(value, keys)) return { ok: false };
  const deviceLabel = label(value.deviceLabel);
  const normalized = {
    ...value,
    operationId: operationId(value.operationId),
    appId: appId(value.appId),
    deviceLabel
  };
  return normalized.operationId && normalized.appId &&
    parseAccountHandoff(normalized.handoffToken) &&
    parseAccountCredential(normalized.accountCredential) &&
    parseAccountAppCredential(normalized.appDeviceCredential) &&
    deviceLabel !== undefined ? { ok: true, value: normalized } : { ok: false };
}

export function validateHandoffCancelPayload(value) {
  if (!exactObject(value, ['handoffId']) || !operationId(value.handoffId)) return { ok: false };
  return { ok: true, value: { handoffId: value.handoffId } };
}

export function validateAccountReadQuery(url) {
  return url.search === '' ? { ok: true, value: {} } : { ok: false };
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
