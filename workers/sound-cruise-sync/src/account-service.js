import {
  ACCOUNT_GATE_ACTIONS,
  accountGateDecision
} from './account-rollout-control.js';

export const ACCOUNT_APP_IDS = Object.freeze(['chord', 'pitch', 'fretboard', 'rhythm', 'port']);

const HEX_VERIFIER = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function validId(value) {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function validVerifier(value) {
  return typeof value === 'string' && HEX_VERIFIER.test(value);
}

function normalizeMemberships(memberships) {
  if (!Array.isArray(memberships) || memberships.length < 1 ||
      memberships.length > ACCOUNT_APP_IDS.length) return null;
  const seenApps = new Set();
  const seenIds = new Set();
  const normalized = [];
  for (const membership of memberships) {
    if (!membership || !validId(membership.id) ||
        !ACCOUNT_APP_IDS.includes(membership.appId) ||
        seenApps.has(membership.appId) || seenIds.has(membership.id)) return null;
    seenApps.add(membership.appId);
    seenIds.add(membership.id);
    normalized.push({ id: membership.id, appId: membership.appId });
  }
  return normalized;
}

function normalizeProvisionInput(input) {
  if (!input || !validId(input.accountId) || !validId(input.accountDeviceId) ||
      !validVerifier(input.recoveryVerifier) ||
      !validVerifier(input.accountCredentialVerifier) ||
      input.recoveryVerifier === input.accountCredentialVerifier ||
      (input.accountDeviceLabel != null && typeof input.accountDeviceLabel !== 'string') ||
      !Number.isInteger(input.now) || input.now < 0) return null;
  const memberships = normalizeMemberships(input.memberships);
  if (!memberships) return null;
  const accountDeviceLabel = input.accountDeviceLabel == null
    ? null
    : input.accountDeviceLabel.trim().slice(0, 120) || null;
  return {
    accountId: input.accountId,
    accountDeviceId: input.accountDeviceId,
    recoveryVerifier: input.recoveryVerifier,
    accountCredentialVerifier: input.accountCredentialVerifier,
    accountDeviceLabel,
    memberships,
    now: input.now
  };
}

function normalizeActivationInput(input) {
  if (!input || !validId(input.accountId) || !validId(input.membershipId) ||
      !ACCOUNT_APP_IDS.includes(input.appId) || !validId(input.syncUserId) ||
      !validId(input.appDeviceId) ||
      (input.accountDeviceId != null && !validId(input.accountDeviceId)) ||
      !['dual', 'account'].includes(input.recoveryMode) ||
      !Number.isInteger(input.now) || input.now < 0) return null;
  return {
    accountId: input.accountId,
    membershipId: input.membershipId,
    appId: input.appId,
    syncUserId: input.syncUserId,
    appDeviceId: input.appDeviceId,
    accountDeviceId: input.accountDeviceId || null,
    recoveryMode: input.recoveryMode,
    now: input.now
  };
}

export function createAccountService({ repository, readControl }) {
  if (!repository || typeof repository.createAccountBackbone !== 'function' ||
      typeof repository.getAccountSummary !== 'function' ||
      typeof repository.activateMembership !== 'function' ||
      typeof readControl !== 'function') {
    throw new Error('Account service dependencies are unavailable');
  }

  async function provisionAccount(input) {
    const control = await readControl();
    const decision = accountGateDecision(ACCOUNT_GATE_ACTIONS.ACCOUNT_ADMISSION, control);
    if (!decision.allowed) {
      return {
        status: 'paused',
        httpStatus: decision.status,
        code: decision.code,
        gate: decision.gate || null
      };
    }
    const normalized = normalizeProvisionInput(input);
    if (!normalized) return { status: 'invalid' };
    return repository.createAccountBackbone(normalized);
  }

  async function getAccountSummary(accountId) {
    const control = await readControl();
    const decision = accountGateDecision(ACCOUNT_GATE_ACTIONS.ACCOUNT_READ, control);
    if (!decision.allowed) {
      return {
        status: 'paused',
        httpStatus: decision.status,
        code: decision.code,
        gate: decision.gate || null
      };
    }
    if (!validId(accountId)) return { status: 'invalid' };
    const summary = await repository.getAccountSummary(accountId);
    return summary ? { status: 'ok', ...summary } : { status: 'not_found' };
  }

  async function activateMembership(input) {
    const control = await readControl();
    const decision = accountGateDecision(ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION, control);
    if (!decision.allowed) {
      return {
        status: 'paused',
        httpStatus: decision.status,
        code: decision.code,
        gate: decision.gate || null
      };
    }
    const normalized = normalizeActivationInput(input);
    if (!normalized) return { status: 'invalid' };
    return repository.activateMembership(normalized);
  }

  return Object.freeze({ provisionAccount, getAccountSummary, activateMembership });
}
