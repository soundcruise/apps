import { authenticateAccountDevice, inspectAccountCredential } from './account-auth.js';
import { authenticateDevice, isRetiredLegacyDeviceCredential } from './auth.js';
import {
  accountAppCredentialVerifier,
  accountCredentialVerifier,
  accountDeleteIntentVerifier,
  accountHandoffVerifier,
  appJoinCodeVerifier,
  portJoinCodeVerifier,
  accountOperationFingerprint,
  accountRecoveryCodeVerifier,
  accountRecoveryClaimVerifier,
  parseAccountDeleteIntent,
  parseAccountAppCredential,
  parseAccountCredential,
  parseAccountRecoveryClaim,
  parseAccountHandoff
} from './account-crypto.js';
import { createD1AccountRepository } from './account-database.js';
import { createD1AccountLifecycleRepository } from './account-lifecycle-database.js';
import { createD1AccountHandoffRepository } from './account-handoff-database.js';
import { createD1AppJoinRepository } from './account-join-database.js';
import { createD1PortJoinRepository } from './account-port-join-database.js';
import { authenticateQaRequest } from './account-qa-auth.js';
import { createD1AccountQaRepository } from './account-qa-database.js';
import {
  parseQaCredential,
  qaCredentialVerifier,
  qaEnrollmentCodeVerifier
} from './account-qa-crypto.js';
import {
  CHORD_BRIDGE_ROUTES,
  handleChordAccountBridgeRequest
} from './account-bridge-app.js';
import {
  ACCOUNT_GATE_ACTIONS,
  accountGateDecision,
  readAccountRuntimeControl
} from './account-rollout-control.js';
import {
  ACCOUNT_MAX_BODY_BYTES,
  validateAccountReadQuery,
  validateAccountDeleteCommitPayload,
  validateAccountDeleteIntentPayload,
  validateAccountAppDetachPayload,
  validateAccountDeviceRevokePayload,
  validateAccountRecoveryCommitPayload,
  validateAccountRecoveryPreparePayload,
  validateAccountRecoveryRotationCommitPayload,
  validateAccountRecoveryRotationPreparePayload,
  validateAppJoinCancelPayload,
  validateAppJoinConsumePayload,
  validateAppJoinIssuePayload,
  validateAppJoinStatusQuery,
  validatePortJoinCancelPayload,
  validatePortJoinConsumePayload,
  validatePortJoinIssuePayload,
  validatePortJoinStatusQuery,
  validateAccountStartPayload,
  validateHandoffCancelPayload,
  validateHandoffConsumePayload,
  validateHandoffIssuePayload,
  validateMembershipPreparePayload,
  validateQaEnrollmentPayload
} from './account-validation.js';
import { verifyTurnstileToken } from './turnstile.js';
import { isJsonContentType, readBodyWithLimit } from './validation.js';
import {
  ACCOUNT_ADMISSION_PROVENANCE,
  publicAccountAdmissionEnabled,
  publicAccountAppAllowed
} from './account-admission.js';

const ACCOUNT_ROUTES = Object.freeze({
  '/v2/accounts/qa/enroll': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_ADMISSION,
    headers: ['content-type', 'x-d1-bookmark']
  },
  '/v2/accounts/start': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_ADMISSION,
    headers: ['content-type', 'x-d1-bookmark']
  },
  '/v2/accounts/summary': {
    method: 'GET', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_READ,
    headers: ['authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/memberships': {
    method: 'MULTI', action: null,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/devices': {
    method: 'GET', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_READ,
    headers: ['authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/devices/revoke': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_DELETE,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/recovery/prepare': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_RECOVERY,
    headers: ['content-type', 'x-d1-bookmark']
  },
  '/v2/accounts/recovery/commit': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_RECOVERY,
    headers: ['content-type', 'x-d1-bookmark']
  },
  '/v2/accounts/recovery-rotation/prepare': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_RECOVERY,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/recovery-rotation/commit': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_RECOVERY,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/delete-intent': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_DELETE,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts': {
    method: 'DELETE', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_DELETE,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/handoffs': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/handoffs/consume': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION,
    headers: ['content-type', 'x-d1-bookmark']
  },
  '/v2/accounts/handoffs/cancel': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/app-join-invitations': {
    method: 'MULTI', action: null,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/app-join-invitations/consume': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION,
    headers: ['content-type', 'x-d1-bookmark']
  },
  '/v2/accounts/app-join-invitations/cancel': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/port-join-invitations': {
    method: 'MULTI', action: null,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/port-join-invitations/consume': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_ADMISSION,
    headers: ['content-type', 'x-d1-bookmark']
  },
  '/v2/accounts/port-join-invitations/cancel': {
    method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_ADMISSION,
    headers: ['content-type', 'authorization', 'x-d1-bookmark']
  },
  ...Object.fromEntries(Object.entries(CHORD_BRIDGE_ROUTES).map(([path, route]) => [
    path,
    {
      ...route,
      action: path === '/v2/accounts/bridges/chord'
        ? ACCOUNT_GATE_ACTIONS.ACCOUNT_READ
        : ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION
    }
  ]))
});

const QA_HEADER = 'x-sound-cruise-qa-authorization';

function resolvedRoute(pathname, method) {
  const membershipDetach = pathname.match(/^\/v2\/accounts\/memberships\/(chord|pitch|fretboard|rhythm)\/detach$/);
  if (membershipDetach) {
    return {
      method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_DELETE,
      headers: ['content-type', 'authorization', 'x-d1-bookmark'],
      appId: membershipDetach[1]
    };
  }
  const membershipDelete = pathname.match(/^\/v2\/accounts\/memberships\/(chord|pitch|fretboard|rhythm)(\/delete-intent)?$/);
  if (membershipDelete) {
    return {
      method: membershipDelete[2] ? 'POST' : 'DELETE',
      action: ACCOUNT_GATE_ACTIONS.ACCOUNT_DELETE,
      headers: ['content-type', 'authorization', 'x-d1-bookmark'],
      appId: membershipDelete[1]
    };
  }
  const base = ACCOUNT_ROUTES[pathname];
  if (!base) return null;
  if (pathname === '/v2/accounts/app-join-invitations') {
    if (method === 'GET' || method === 'OPTIONS') {
      return { ...base, method: 'GET', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_READ };
    }
    return { ...base, method: 'POST', action: ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION };
  }
  if (pathname === '/v2/accounts/port-join-invitations') {
    if (method === 'GET' || method === 'OPTIONS') {
      return { ...base, method: 'GET', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_READ };
    }
    return { ...base, method: 'POST', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_ADMISSION };
  }
  if (pathname !== '/v2/accounts/memberships') return base;
  if (method === 'GET' || method === 'OPTIONS') {
    return { ...base, method: 'GET', action: ACCOUNT_GATE_ACTIONS.ACCOUNT_READ };
  }
  return { ...base, method: 'POST', action: ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION };
}

function configuredOrigins(env) {
  return new Set(String(env.ACCOUNT_ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean));
}

function headerCase(value) {
  return value.replace(/(^|-)([a-z])/g, (_match, prefix, letter) => prefix + letter.toUpperCase());
}

function corsHeaders(origin, route) {
  const allowedHeaders = Array.from(new Set([...route.headers, QA_HEADER]));
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': `${route.method}, OPTIONS`,
    'Access-Control-Allow-Headers': allowedHeaders.map(headerCase).join(', '),
    'Access-Control-Expose-Headers': 'X-D1-Bookmark',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  });
}

function jsonResponse(status, body, origin = null, route = null, extraHeaders = null) {
  const headers = origin && route ? corsHeaders(origin, route) : new Headers({ Vary: 'Origin' });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (extraHeaders) Object.entries(extraHeaders).forEach(([name, value]) => {
    if (value != null && value !== '') headers.set(name, value);
  });
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(status, code, origin = null, route = null, headers = null) {
  return jsonResponse(status, { ok: false, code }, origin, route, headers);
}

function validBookmark(value) {
  return value === null || (value.length > 0 && value.length <= 1024 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value));
}

function createSession(env, request) {
  if (!env.SYNC_DB || typeof env.SYNC_DB.prepare !== 'function') throw new Error('D1 unavailable');
  const bookmark = request.headers.get('X-D1-Bookmark');
  if (!validBookmark(bookmark)) return null;
  return typeof env.SYNC_DB.withSession === 'function'
    ? env.SYNC_DB.withSession(bookmark || 'first-primary')
    : env.SYNC_DB;
}

function sessionBookmark(session) {
  if (!session || typeof session.getBookmark !== 'function') return null;
  try { return session.getBookmark() || null; } catch { return null; }
}

async function readJson(request) {
  const parsed = await readBodyWithLimit(request, ACCOUNT_MAX_BODY_BYTES);
  if (!parsed.ok) return {
    ok: false,
    status: parsed.tooLarge ? 413 : 400,
    code: parsed.tooLarge ? 'payload_too_large' : 'invalid_json'
  };
  try { return { ok: true, value: JSON.parse(parsed.text) }; } catch {
    return { ok: false, status: 400, code: 'invalid_json' };
  }
}

async function rateLimit(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return { ok: false, unavailable: true };
  try {
    const result = await binding.limit({ key });
    return result?.success === true ? { ok: true } : { ok: false, unavailable: false };
  } catch {
    return { ok: false, unavailable: true };
  }
}

function requestIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'missing';
}

function rateError(result, origin, route, retryAfter) {
  return result.unavailable
    ? errorResponse(503, 'account_rate_limiter_unavailable', origin, route)
    : errorResponse(429, 'rate_limited', origin, route, { 'Retry-After': String(retryAfter) });
}

function requiresPublicAdmission(pathname, method) {
  if (pathname === '/v2/accounts/start') return true;
  if (pathname === '/v2/accounts/memberships' && method === 'POST') return true;
  if (pathname === '/v2/accounts/app-join-invitations' && method === 'POST') return true;
  if (pathname === '/v2/accounts/port-join-invitations' && method === 'POST') return true;
  return pathname === '/v2/accounts/bridges/chord/prepare' ||
    pathname === '/v2/accounts/bridges/chord/dual' ||
    pathname === '/v2/accounts/bridges/chord/finalize';
}

async function accountContext(request, env, dependencies) {
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER) {
    return { error: 'account_server_unavailable', status: 503 };
  }
  const session = createSession(env, request);
  if (!session) return { error: 'invalid_bookmark', status: 400 };
  let identity;
  if (dependencies.authenticateAccountDevice) {
    identity = await dependencies.authenticateAccountDevice(
      session,
      request.headers.get('Authorization'),
      env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
    );
  } else {
    const inspected = await inspectAccountCredential(
      session,
      request.headers.get('Authorization'),
      env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
    );
    if (inspected?.error) return { error: inspected.error, status: 410 };
    identity = inspected?.identity || null;
  }
  if (!identity) return { error: 'invalid_account_credential', status: 401 };
  if (identity.admissionProvenance !== dependencies.admissionProvenance) {
    return { error: 'account_admission_mismatch', status: 403 };
  }
  if (dependencies.admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.QA) {
    const qa = dependencies.qaIdentity;
    if (!qa || (qa.accountId !== null && qa.accountId !== identity.accountId)) {
      return { error: 'qa_admission_required', status: 403 };
    }
  }
  return {
    session,
    identity,
    repository: (dependencies.createAccountRepository || createD1AccountRepository)(session)
  };
}

async function handleQaEnrollment(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateQaEnrollmentPayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_QA_ENROLLMENT_PEPPER ||
      !env.SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER) {
    return errorResponse(503, 'account_qa_unavailable', origin, route);
  }
  const limited = await rateLimit(env.ACCOUNT_QA_ENROLL_RATE_LIMITER, `account-qa-enroll:${requestIp(request)}`);
  if (!limited.ok) return rateError(limited, origin, route, 60);
  const verify = dependencies.verifyTurnstileToken || verifyTurnstileToken;
  let turnstile;
  try {
    turnstile = await verify(validation.value.turnstileToken, env, {
      expectedAction: env.TURNSTILE_ACCOUNT_QA_ENROLL_EXPECTED_ACTION || 'sound_cruise_account_qa_enroll'
    });
  } catch {
    return errorResponse(503, 'turnstile_failed', origin, route);
  }
  if (!turnstile.ok) return errorResponse(turnstile.unavailable ? 503 : 403, 'turnstile_failed', origin, route);
  try {
    const session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    const qa = parseQaCredential(validation.value.qaCredential);
    const codeVerifier = await (dependencies.qaEnrollmentCodeVerifier || qaEnrollmentCodeVerifier)(
      validation.value.enrollmentCode,
      env.SYNC_ACCOUNT_QA_ENROLLMENT_PEPPER
    );
    const credentialVerifier = await (dependencies.qaCredentialVerifier || qaCredentialVerifier)(
      validation.value.qaCredential,
      env.SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER
    );
    const repository = (dependencies.createAccountQaRepository || createD1AccountQaRepository)(session);
    const result = await repository.consumeEnrollment({
      sessionId: qa.sessionId,
      codeVerifier,
      credentialVerifier,
      now: Date.now()
    });
    const errors = {
      invalid: [400, 'qa_enrollment_invalid'],
      expired: [409, 'qa_enrollment_expired'],
      used: [409, 'qa_enrollment_used'],
      cancelled: [409, 'qa_enrollment_cancelled']
    };
    if (result.status !== 'created') {
      const [status, code] = errors[result.status] || [503, 'account_server_error'];
      return errorResponse(status, code, origin, route);
    }
    return jsonResponse(201, {
      ok: true,
      qaSessionId: result.sessionId,
      scope: 'port',
      expiresAt: result.expiresAt
    }, origin, route, bookmarkHeader(session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

function bookmarkHeader(session) {
  return { 'X-D1-Bookmark': sessionBookmark(session) };
}

async function handleStart(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountStartPayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (dependencies.admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.PRODUCTION &&
      validation.value.appIds.some((appId) => !publicAccountAppAllowed(env, appId))) {
    return errorResponse(403, 'account_app_not_available', origin, route);
  }
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER || !env.SYNC_ACCOUNT_RECOVERY_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }

  let session;
  try {
    session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    const value = validation.value;
    const accountDevice = parseAccountCredential(value.accountCredential);
    const credentialVerifier = await (dependencies.accountCredentialVerifier || accountCredentialVerifier)(
      value.accountCredential,
      env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
    );
    const recoveryVerifier = await (dependencies.accountRecoveryCodeVerifier || accountRecoveryCodeVerifier)(
      value.recoveryCode,
      env.SYNC_ACCOUNT_RECOVERY_PEPPER
    );
    const fingerprint = await (dependencies.accountOperationFingerprint || accountOperationFingerprint)([
      'start',
      credentialVerifier,
      recoveryVerifier,
      value.appIds.join(','),
      value.deviceLabel || '',
      dependencies.admissionProvenance
    ]);
    const repository = (dependencies.createAccountRepository || createD1AccountRepository)(session);
    const previous = await repository.getStartOperation(value.operationId);
    if (previous) {
      if (previous.requestFingerprint !== fingerprint || previous.accountDeviceId !== accountDevice.deviceId) {
        return errorResponse(409, 'operation_conflict', origin, route);
      }
      return jsonResponse(200, {
        ok: true,
        operation: 'existing',
        accountId: previous.accountId,
        accountDeviceId: previous.accountDeviceId,
        recoveryVersion: 1,
        memberships: previous.memberships
      }, origin, route, bookmarkHeader(session));
    }

    const limited = await rateLimit(env.ACCOUNT_START_RATE_LIMITER, `account-start:${requestIp(request)}`);
    if (!limited.ok) return rateError(limited, origin, route, 60);

    const verify = dependencies.verifyTurnstileToken || verifyTurnstileToken;
    let turnstile;
    try {
      turnstile = await verify(value.turnstileToken, env, {
        expectedAction: env.TURNSTILE_ACCOUNT_START_EXPECTED_ACTION || 'sound_cruise_account_start'
      });
    } catch {
      return errorResponse(503, 'turnstile_failed', origin, route);
    }
    if (!turnstile.ok) {
      return errorResponse(turnstile.unavailable ? 503 : 403, 'turnstile_failed', origin, route);
    }

    const now = Date.now();
    const accountId = crypto.randomUUID();
    const memberships = value.appIds.map((membershipAppId) => ({
      id: crypto.randomUUID(),
      appId: membershipAppId
    }));
    const created = await repository.createAccountBackbone({
      accountId,
      accountDeviceId: accountDevice.deviceId,
      recoveryVerifier,
      accountCredentialVerifier: credentialVerifier,
      accountDeviceLabel: value.deviceLabel,
      memberships,
      admissionProvenance: dependencies.admissionProvenance,
      qaSessionId: dependencies.qaIdentity?.sessionId || null,
      startOperation: {
        operationId: value.operationId,
        requestFingerprint: fingerprint
      },
      now
    });
    return jsonResponse(201, {
      ok: true,
      operation: 'created',
      accountId: created.accountId,
      accountDeviceId: created.accountDeviceId,
      recoveryVersion: 1,
      memberships: created.memberships
    }, origin, route, bookmarkHeader(session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleSummary(request, env, origin, route, dependencies, url, membershipOnly = false) {
  if (!validateAccountReadQuery(url).ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const summary = await context.repository.getAccountSummary(context.identity.accountId);
    if (!summary) return errorResponse(404, 'account_not_found', origin, route);
    const body = membershipOnly
      ? { ok: true, memberships: summary.memberships }
      : {
          ok: true, ...summary,
          ...(dependencies.qaIdentity
            ? { qaSessionExpiresAt: dependencies.qaIdentity.expiresAt }
            : {})
        };
    return jsonResponse(200, body, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleDevices(request, env, origin, route, dependencies, url) {
  if (!validateAccountReadQuery(url).ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const repository = (
      dependencies.createAccountLifecycleRepository || createD1AccountLifecycleRepository
    )(context.session);
    const devices = await repository.listEnvironments(context.identity);
    return jsonResponse(200, { ok: true, devices }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function authenticatedRotationContext(request, env, origin, route, dependencies) {
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return { response: errorResponse(503, 'account_server_error', origin, route) };
  }
  if (context.error) {
    const status = context.error === 'invalid_account_credential' ? 403 : context.status;
    return { response: errorResponse(status, context.error, origin, route) };
  }
  return context;
}

async function handleAccountRecoveryRotationPrepare(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountRecoveryRotationPreparePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_RECOVERY_PEPPER || !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  const context = await authenticatedRotationContext(request, env, origin, route, dependencies);
  if (context.response) return context.response;
  const limited = await rateLimit(
    env.ACCOUNT_RECOVERY_RATE_LIMITER,
    `account-recovery-rotation:${context.identity.accountId}:${requestIp(request)}`
  );
  if (!limited.ok) return rateError(limited, origin, route, 60);
  const verify = dependencies.verifyTurnstileToken || verifyTurnstileToken;
  let turnstile;
  try {
    turnstile = await verify(validation.value.turnstileToken, env, {
      expectedAction: env.TURNSTILE_ACCOUNT_RECOVERY_ROTATION_EXPECTED_ACTION ||
        'sound_cruise_recovery_rotation'
    });
  } catch {
    return errorResponse(503, 'turnstile_failed', origin, route);
  }
  if (!turnstile.ok) {
    return errorResponse(turnstile.unavailable ? 503 : 403, 'turnstile_failed', origin, route);
  }
  try {
    const value = validation.value;
    const claim = parseAccountRecoveryClaim(value.claimToken);
    const claimVerifier = await (
      dependencies.accountRecoveryClaimVerifier || accountRecoveryClaimVerifier
    )(value.claimToken, env.SYNC_ACCOUNT_RECOVERY_PEPPER);
    const nextRecoveryVerifier = await (
      dependencies.accountRecoveryCodeVerifier || accountRecoveryCodeVerifier
    )(value.nextRecoveryCode, env.SYNC_ACCOUNT_RECOVERY_PEPPER);
    const requestFingerprint = await (
      dependencies.accountOperationFingerprint || accountOperationFingerprint
    )([
      'account-recovery-rotation-prepare', context.identity.accountId,
      context.identity.accountDeviceId, String(context.identity.recoveryVersion),
      String(context.identity.generation), claimVerifier, nextRecoveryVerifier,
      dependencies.qaIdentity?.sessionId || '', dependencies.admissionProvenance
    ]);
    const repository = (
      dependencies.createAccountLifecycleRepository || createD1AccountLifecycleRepository
    )(context.session);
    const result = await repository.prepareRecoveryRotation(context.identity, {
      operationId: value.operationId,
      requestFingerprint,
      claimId: claim.claimId,
      claimVerifier,
      nextRecoveryVerifier,
      now: Date.now()
    });
    if (result.status === 'conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (result.status !== 'prepared') {
      return errorResponse(403, 'account_recovery_rotation_invalid', origin, route);
    }
    return jsonResponse(result.alreadyPrepared ? 200 : 201, {
      ok: true,
      operation: result.alreadyPrepared ? 'existing' : 'prepared',
      claimId: claim.claimId,
      expiresAt: result.expiresAt,
      recoveryVersion: result.recoveryVersion
    }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleAccountRecoveryRotationCommit(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountRecoveryRotationCommitPayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_RECOVERY_PEPPER || !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  const context = await authenticatedRotationContext(request, env, origin, route, dependencies);
  if (context.response) return context.response;
  try {
    const value = validation.value;
    const claim = parseAccountRecoveryClaim(value.claimToken);
    const claimVerifier = await (
      dependencies.accountRecoveryClaimVerifier || accountRecoveryClaimVerifier
    )(value.claimToken, env.SYNC_ACCOUNT_RECOVERY_PEPPER);
    const requestFingerprint = await (
      dependencies.accountOperationFingerprint || accountOperationFingerprint
    )([
      'account-recovery-rotation-commit', context.identity.accountId,
      context.identity.accountDeviceId, claimVerifier,
      dependencies.qaIdentity?.sessionId || '', dependencies.admissionProvenance
    ]);
    const repository = (
      dependencies.createAccountLifecycleRepository || createD1AccountLifecycleRepository
    )(context.session);
    const result = await repository.commitRecoveryRotation(context.identity, {
      operationId: value.operationId,
      requestFingerprint,
      claimId: claim.claimId,
      claimVerifier,
      now: Date.now()
    });
    if (result.status === 'conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (result.status !== 'rotated') {
      return errorResponse(403, 'account_recovery_rotation_invalid', origin, route);
    }
    return jsonResponse(result.alreadyRotated ? 200 : 201, {
      ok: true,
      operation: result.alreadyRotated ? 'existing' : 'rotated',
      recoveryVersion: result.recoveryVersion
    }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleAccountRecoveryPrepare(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountRecoveryPreparePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_RECOVERY_PEPPER || !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  const limited = await rateLimit(
    env.ACCOUNT_RECOVERY_RATE_LIMITER,
    `account-recovery:${requestIp(request)}`
  );
  if (!limited.ok) return rateError(limited, origin, route, 60);
  const verify = dependencies.verifyTurnstileToken || verifyTurnstileToken;
  let turnstile;
  try {
    turnstile = await verify(validation.value.turnstileToken, env, {
      expectedAction: env.TURNSTILE_ACCOUNT_RECOVERY_EXPECTED_ACTION || 'sound_cruise_account_recovery'
    });
  } catch {
    return errorResponse(503, 'turnstile_failed', origin, route);
  }
  if (!turnstile.ok) {
    return errorResponse(turnstile.unavailable ? 503 : 403, 'turnstile_failed', origin, route);
  }
  try {
    const value = validation.value;
    const session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    const claim = parseAccountRecoveryClaim(value.claimToken);
    const accountDevice = parseAccountCredential(value.accountCredential);
    const currentRecoveryVerifier = await (dependencies.accountRecoveryCodeVerifier || accountRecoveryCodeVerifier)(
      value.recoveryCode, env.SYNC_ACCOUNT_RECOVERY_PEPPER
    );
    const nextRecoveryVerifier = await (dependencies.accountRecoveryCodeVerifier || accountRecoveryCodeVerifier)(
      value.nextRecoveryCode, env.SYNC_ACCOUNT_RECOVERY_PEPPER
    );
    const claimVerifier = await (dependencies.accountRecoveryClaimVerifier || accountRecoveryClaimVerifier)(
      value.claimToken, env.SYNC_ACCOUNT_RECOVERY_PEPPER
    );
    const nextAccountCredentialVerifier = await (
      dependencies.accountCredentialVerifier || accountCredentialVerifier
    )(value.accountCredential, env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
    const requestFingerprint = await (
      dependencies.accountOperationFingerprint || accountOperationFingerprint
    )([
      'account-recovery-prepare', claimVerifier, currentRecoveryVerifier,
      nextRecoveryVerifier, accountDevice.deviceId, nextAccountCredentialVerifier,
      value.deviceLabel || '', dependencies.qaIdentity?.sessionId || '',
      dependencies.admissionProvenance
    ]);
    const repository = (
      dependencies.createAccountLifecycleRepository || createD1AccountLifecycleRepository
    )(session);
    const prepareInput = {
      operationId: value.operationId,
      requestFingerprint,
      claimId: claim.claimId,
      claimVerifier,
      currentRecoveryVerifier,
      nextRecoveryVerifier,
      nextAccountDeviceId: accountDevice.deviceId,
      nextAccountCredentialVerifier,
      deviceLabel: value.deviceLabel,
      qaSessionId: dependencies.qaIdentity?.sessionId || null,
      admissionProvenance: dependencies.admissionProvenance,
      now: Date.now()
    };
    let result = await repository.resolveRecoveryPrepare(prepareInput);
    if (!result) {
      const attempt = await repository.reserveRecoveryAttempt(
        currentRecoveryVerifier,
        prepareInput.now
      );
      if (attempt.status !== 'allowed') {
        return errorResponse(400, 'account_recovery_invalid', origin, route);
      }
      result = await repository.prepareRecovery(prepareInput);
    }
    if (result.status === 'conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (result.status !== 'prepared') return errorResponse(400, 'account_recovery_invalid', origin, route);
    const summary = result.summary;
    return jsonResponse(result.alreadyPrepared ? 200 : 201, {
      ok: true,
      operation: result.alreadyPrepared ? 'existing' : 'prepared',
      claimId: claim.claimId,
      expiresAt: summary.expiresAt,
      summary: {
        recoveryVersion: summary.recoveryVersion,
        activeDeviceCount: summary.activeDeviceCount,
        updatedAt: summary.updatedAt,
        memberships: summary.memberships
      }
    }, origin, route, bookmarkHeader(session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleAccountRecoveryCommit(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountRecoveryCommitPayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_RECOVERY_PEPPER || !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  try {
    const value = validation.value;
    const session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    const claim = parseAccountRecoveryClaim(value.claimToken);
    const accountDevice = parseAccountCredential(value.accountCredential);
    const claimVerifier = await (dependencies.accountRecoveryClaimVerifier || accountRecoveryClaimVerifier)(
      value.claimToken, env.SYNC_ACCOUNT_RECOVERY_PEPPER
    );
    const nextAccountCredentialVerifier = await (
      dependencies.accountCredentialVerifier || accountCredentialVerifier
    )(value.accountCredential, env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
    const requestFingerprint = await (
      dependencies.accountOperationFingerprint || accountOperationFingerprint
    )(['account-recovery-commit', claimVerifier, accountDevice.deviceId,
      nextAccountCredentialVerifier, dependencies.qaIdentity?.sessionId || '',
      dependencies.admissionProvenance]);
    const repository = (
      dependencies.createAccountLifecycleRepository || createD1AccountLifecycleRepository
    )(session);
    const result = await repository.commitRecovery({
      operationId: value.operationId,
      requestFingerprint,
      claimId: claim.claimId,
      claimVerifier,
      nextAccountCredentialVerifier,
      qaSessionId: dependencies.qaIdentity?.sessionId || null,
      admissionProvenance: dependencies.admissionProvenance,
      now: Date.now()
    });
    if (result.status === 'conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (result.status !== 'recovered') return errorResponse(400, 'account_recovery_invalid', origin, route);
    return jsonResponse(result.alreadyRecovered ? 200 : 201, {
      ok: true,
      operation: result.alreadyRecovered ? 'existing' : 'recovered',
      accountId: result.accountId,
      accountDeviceId: result.accountDeviceId,
      recoveryVersion: result.recoveryVersion
    }, origin, route, bookmarkHeader(session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleEnvironmentRevoke(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountDeviceRevokePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_ACCOUNT_CREDENTIAL_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  let session;
  let identity;
  try {
    session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    identity = await (dependencies.authenticateAccountDevice || authenticateAccountDevice)(
      session,
      request.headers.get('Authorization'),
      env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
    );
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  try {
    const value = validation.value;
    const rawCredential = String(request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const accountDevice = parseAccountCredential(rawCredential);
    if (!accountDevice) return errorResponse(401, 'invalid_account_credential', origin, route);
    const credentialVerifier = await (
      dependencies.accountCredentialVerifier || accountCredentialVerifier
    )(rawCredential, env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
    const repository = (
      dependencies.createAccountLifecycleRepository || createD1AccountLifecycleRepository
    )(session);
    if (!identity) {
      // A current-environment revoke invalidates its own credential before the
      // response reaches the browser. Resolve only the exact operation using
      // the now-revoked verifier; no Account selector comes from the client.
      const exact = await repository.resolveRevokeAfterCredentialLoss({
        operationId: value.operationId,
        requestFingerprint: null,
        targetDeviceId: value.accountDeviceId,
        accountCredentialVerifier: credentialVerifier,
        admissionProvenance: dependencies.admissionProvenance
      });
      if (exact.status !== 'revoked') {
        return errorResponse(401, 'invalid_account_credential', origin, route);
      }
      return jsonResponse(200, { ok: true, ...exact }, origin, route, bookmarkHeader(session));
    }
    if (identity.admissionProvenance !== dependencies.admissionProvenance) {
      return errorResponse(403, 'account_admission_mismatch', origin, route);
    }
    const requestFingerprint = await (
      dependencies.accountOperationFingerprint || accountOperationFingerprint
    )(['account-device-revoke', identity.accountId, value.accountDeviceId,
      dependencies.admissionProvenance]);
    const result = await repository.revokeEnvironment(identity, {
      operationId: value.operationId,
      requestFingerprint,
      targetDeviceId: value.accountDeviceId,
      now: Date.now()
    });
    if (result.status === 'not_found') return errorResponse(404, 'account_device_not_found', origin, route);
    if (result.status === 'conflict') return errorResponse(409, 'operation_conflict', origin, route);
    return jsonResponse(200, { ok: true, ...result }, origin, route, bookmarkHeader(session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleAppDetach(request, env, origin, route, dependencies, appId) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountAppDetachPayload(parsed.value);
  if (!validation.ok || validation.value.appId !== appId) {
    return errorResponse(400, 'invalid_request', origin, route);
  }
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const value = validation.value;
    const requestFingerprint = await (
      dependencies.accountOperationFingerprint || accountOperationFingerprint
    )(['account-app-detach', context.identity.accountId, value.appId,
      dependencies.admissionProvenance]);
    const repository = (
      dependencies.createAccountLifecycleRepository || createD1AccountLifecycleRepository
    )(context.session);
    const input = {
      operationId: value.operationId,
      requestFingerprint,
      appId: value.appId,
      now: Date.now()
    };
    const retry = await repository.resolveAppDetachRetry(context.identity, input);
    if (retry?.status === 'conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (retry?.status === 'detached') {
      return jsonResponse(200, { ok: true, operation: 'existing', ...retry },
        origin, route, bookmarkHeader(context.session));
    }
    const limited = await rateLimit(
      env.ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER,
      `account-app-detach:${context.identity.accountDeviceId}`
    );
    if (!limited.ok) return rateError(limited, origin, route, 60);
    const result = await repository.detachApp(context.identity, input);
    if (result.status === 'conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (result.status !== 'detached') return errorResponse(409, 'membership_state_invalid', origin, route);
    return jsonResponse(200, { ok: true, operation: 'detached', ...result },
      origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleDeleteIntent(request, env, origin, route, dependencies, scope, appId = null) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountDeleteIntentPayload(parsed.value, scope);
  if (!validation.ok || (scope === 'app' && validation.value.appId !== appId)) {
    return errorResponse(400, 'invalid_request', origin, route);
  }
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const value = validation.value;
    const intent = parseAccountDeleteIntent(value.intentToken);
    const intentVerifier = await (dependencies.accountDeleteIntentVerifier || accountDeleteIntentVerifier)(
      value.intentToken, env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
    );
    const requestFingerprint = await (
      dependencies.accountOperationFingerprint || accountOperationFingerprint
    )(['account-delete-intent', context.identity.accountId, scope, appId || '', intentVerifier]);
    const repository = (
      dependencies.createAccountLifecycleRepository || createD1AccountLifecycleRepository
    )(context.session);
    const result = await repository.issueDeleteIntent(context.identity, {
      operationId: value.operationId,
      requestFingerprint,
      intentId: intent.intentId,
      intentVerifier,
      scope,
      appId,
      now: Date.now()
    });
    if (result.status === 'conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (result.status !== 'issued') return errorResponse(409, 'account_delete_invalid', origin, route);
    return jsonResponse(result.alreadyIssued ? 200 : 201, {
      ok: true,
      operation: result.alreadyIssued ? 'existing' : 'issued',
      scope: result.scope,
      appId,
      expiresAt: result.expiresAt
    }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleDeleteCommit(request, env, origin, route, dependencies, scope, appId = null) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountDeleteCommitPayload(parsed.value, scope);
  if (!validation.ok || (scope === 'app' && validation.value.appId !== appId)) {
    return errorResponse(400, 'invalid_request', origin, route);
  }
  if (!env.SYNC_ACCOUNT_CREDENTIAL_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  let session;
  let identity = null;
  try {
    session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    identity = await (dependencies.authenticateAccountDevice || authenticateAccountDevice)(
      session,
      request.headers.get('Authorization'),
      env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
    );
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  try {
    const value = validation.value;
    const parsedIntent = parseAccountDeleteIntent(value.intentToken);
    const intentVerifier = await (dependencies.accountDeleteIntentVerifier || accountDeleteIntentVerifier)(
      value.intentToken, env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
    );
    const rawCredential = String(request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const accountDevice = parseAccountCredential(rawCredential);
    if (!accountDevice) return errorResponse(401, 'invalid_account_credential', origin, route);
    const credentialVerifier = await (
      dependencies.accountCredentialVerifier || accountCredentialVerifier
    )(rawCredential, env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
    const requestFingerprint = await (
      dependencies.accountOperationFingerprint || accountOperationFingerprint
    )(['account-delete-commit', scope, appId || '', intentVerifier, accountDevice.deviceId,
      dependencies.admissionProvenance]);
    const repository = (
      dependencies.createAccountLifecycleRepository || createD1AccountLifecycleRepository
    )(session);
    if (!identity) {
      const resolved = await repository.resolveDeleteAfterCredentialLoss({
        operationId: value.operationId,
        requestFingerprint,
        intentId: parsedIntent.intentId,
        intentVerifier,
        accountCredentialVerifier: credentialVerifier,
        scope,
        admissionProvenance: dependencies.admissionProvenance
      });
      if (resolved.status !== 'deleting') {
        return errorResponse(401, 'invalid_account_credential', origin, route);
      }
      return jsonResponse(200, { ok: true, operation: 'existing', ...resolved },
        origin, route, bookmarkHeader(session));
    }
    if (identity.admissionProvenance !== dependencies.admissionProvenance) {
      return errorResponse(403, 'account_admission_mismatch', origin, route);
    }
    if (dependencies.admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.QA &&
        (!dependencies.qaIdentity ||
          (dependencies.qaIdentity.accountId !== null && dependencies.qaIdentity.accountId !== identity.accountId))) {
      return errorResponse(403, 'qa_admission_required', origin, route);
    }
    const result = await repository.commitDelete(identity, {
      operationId: value.operationId,
      requestFingerprint,
      intentId: parsedIntent.intentId,
      intentVerifier,
      scope,
      appId,
      now: Date.now()
    });
    if (result.status === 'conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (result.status !== 'deleting') return errorResponse(409, 'account_delete_invalid', origin, route);
    return jsonResponse(result.alreadyDeleting ? 200 : 202, {
      ok: true,
      operation: result.alreadyDeleting ? 'existing' : 'deleting',
      scope,
      appId,
      purgeAfter: result.purgeAfter
    }, origin, route, bookmarkHeader(session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleMembershipPrepare(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateMembershipPreparePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (dependencies.admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.PRODUCTION &&
      !publicAccountAppAllowed(env, validation.value.appId)) {
    return errorResponse(403, 'account_app_not_available', origin, route);
  }
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const result = await context.repository.prepareMembership(context.identity, {
      ...validation.value,
      membershipId: crypto.randomUUID(),
      now: Date.now()
    });
    if (result.status === 'invalid') return errorResponse(409, 'membership_state_invalid', origin, route);
    return jsonResponse(result.alreadyPrepared ? 200 : 201, {
      ok: true,
      membershipId: result.membershipId,
      appId: result.appId,
      state: result.status,
      alreadyPrepared: result.alreadyPrepared
    }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleHandoffIssue(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateHandoffIssuePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_ACCOUNT_HANDOFF_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const value = validation.value;
    const handoff = parseAccountHandoff(value.handoffToken);
    const verifier = await (dependencies.accountHandoffVerifier || accountHandoffVerifier)(
      value.handoffToken,
      env.SYNC_ACCOUNT_HANDOFF_PEPPER
    );
    const fingerprint = await (dependencies.accountOperationFingerprint || accountOperationFingerprint)([
      'handoff-issue', context.identity.accountId, context.identity.accountDeviceId,
      value.appId, handoff.handoffId, verifier
    ]);
    const repository = (dependencies.createAccountHandoffRepository || createD1AccountHandoffRepository)(context.session);
    const issueInput = {
      operationId: value.operationId,
      appId: value.appId,
      handoffId: handoff.handoffId,
      handoffVerifier: verifier,
      requestFingerprint: fingerprint,
      admissionProvenance: dependencies.admissionProvenance,
      qaIssuerSessionId: dependencies.qaIdentity?.sessionId || null,
      now: Date.now()
    };
    const retry = typeof repository.resolveIssueRetry === 'function'
      ? await repository.resolveIssueRetry(context.identity, issueInput)
      : null;
    if (retry?.status === 'operation_conflict') {
      return errorResponse(409, 'operation_conflict', origin, route);
    }
    if (retry?.status === 'issued') {
      return jsonResponse(200, {
        ok: true,
        handoffId: retry.handoffId,
        appId: retry.appId,
        membershipId: retry.membershipId,
        expiresAt: retry.expiresAt,
        alreadyIssued: true
      }, origin, route, bookmarkHeader(context.session));
    }
    const limited = await rateLimit(
      env.ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER,
      `account-handoff-issue:${context.identity.accountDeviceId}`
    );
    if (!limited.ok) return rateError(limited, origin, route, 60);
    const result = await repository.issue(context.identity, issueInput);
    if (result.status === 'operation_conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (result.status === 'membership_unavailable') return errorResponse(409, 'membership_state_invalid', origin, route);
    if (result.status === 'handoff_exists') return errorResponse(409, 'handoff_already_active', origin, route);
    return jsonResponse(result.alreadyIssued ? 200 : 201, {
      ok: true,
      handoffId: result.handoffId,
      appId: result.appId,
      membershipId: result.membershipId,
      expiresAt: result.expiresAt,
      alreadyIssued: result.alreadyIssued
    }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleHandoffCancel(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateHandoffCancelPayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const repository = (dependencies.createAccountHandoffRepository || createD1AccountHandoffRepository)(context.session);
    const result = await repository.cancel(context.identity, validation.value.handoffId, Date.now());
    if (result.status === 'not_found') return errorResponse(404, 'handoff_not_found', origin, route);
    if (result.status === 'used') return errorResponse(409, 'handoff_consumed', origin, route);
    return jsonResponse(200, {
      ok: true,
      handoffId: validation.value.handoffId,
      cancelled: true,
      alreadyCancelled: result.alreadyCancelled
    }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

function handoffError(status, origin, route) {
  const errors = {
    invalid: [400, 'handoff_invalid'],
    wrong_app: [400, 'wrong_app'],
    expired: [409, 'handoff_expired'],
    cancelled: [409, 'handoff_cancelled'],
    used: [409, 'handoff_consumed'],
    membership_unavailable: [409, 'membership_state_invalid'],
    qa_admission_unavailable: [403, 'qa_admission_required']
  };
  const [httpStatus, code] = errors[status] || [503, 'account_server_error'];
  return errorResponse(httpStatus, code, origin, route);
}

async function handleHandoffConsume(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateHandoffConsumePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_HANDOFF_PEPPER ||
      !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER || !env.SYNC_ACCOUNT_RECOVERY_PEPPER ||
      !env.SYNC_CREDENTIAL_PEPPER || !env.SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  let session;
  try {
    session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    const value = validation.value;
    const handoff = parseAccountHandoff(value.handoffToken);
    const accountDevice = parseAccountCredential(value.accountCredential);
    const appDevice = parseAccountAppCredential(value.appDeviceCredential);
    let existingAppIdentity = null;
    if (value.consumeMode === 'existing_chord') {
      existingAppIdentity = await (dependencies.authenticateDevice || authenticateDevice)(
        session,
        `Bearer ${value.appDeviceCredential}`,
        'chord',
        env.SYNC_CREDENTIAL_PEPPER
      );
      if (!existingAppIdentity) {
        const retiredLegacy = await (
          dependencies.isRetiredLegacyDeviceCredential || isRetiredLegacyDeviceCredential
        )(
          session,
          `Bearer ${value.appDeviceCredential}`,
          'chord',
          env.SYNC_CREDENTIAL_PEPPER
        );
        if (retiredLegacy) {
          return errorResponse(409, 'retired_legacy_device', origin, route);
        }
        return errorResponse(401, 'invalid_app_credential', origin, route);
      }
    }
    const handoffVerifier = await (dependencies.accountHandoffVerifier || accountHandoffVerifier)(
      value.handoffToken,
      env.SYNC_ACCOUNT_HANDOFF_PEPPER
    );
    const accountVerifier = await (dependencies.accountCredentialVerifier || accountCredentialVerifier)(
      value.accountCredential,
      env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
    );
    const appVerifier = await (dependencies.accountAppCredentialVerifier || accountAppCredentialVerifier)(
      value.appDeviceCredential,
      env.SYNC_CREDENTIAL_PEPPER
    );
    const qaCredential = parseQaCredential(value.qaCredential);
    const qaVerifier = await (dependencies.qaCredentialVerifier || qaCredentialVerifier)(
      value.qaCredential,
      env.SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER
    );
    const fingerprint = await (dependencies.accountOperationFingerprint || accountOperationFingerprint)([
      'handoff-consume', value.appId, handoff.handoffId, accountDevice.deviceId,
      appDevice.deviceId, accountVerifier, appVerifier, qaVerifier, value.deviceLabel || '', value.consumeMode
    ]);
    const repository = (dependencies.createAccountHandoffRepository || createD1AccountHandoffRepository)(session);
    const consumeInput = {
      operationId: value.operationId,
      appId: value.appId,
      handoffId: handoff.handoffId,
      handoffVerifier,
      requestFingerprint: fingerprint,
      accountDeviceId: accountDevice.deviceId,
      accountCredentialVerifier: accountVerifier,
      appDeviceId: appDevice.deviceId,
      appCredentialVerifier: appVerifier,
      qaSessionId: qaCredential.sessionId,
      qaCredentialVerifier: qaVerifier,
      syncUserId: existingAppIdentity?.userId || crypto.randomUUID(),
      consumeMode: value.consumeMode,
      deviceLabel: value.deviceLabel,
      accountRecoveryPepper: env.SYNC_ACCOUNT_RECOVERY_PEPPER,
      now: Date.now()
    };
    const retry = typeof repository.resolveConsumeRetry === 'function'
      ? await repository.resolveConsumeRetry(consumeInput)
      : null;
    if (['activated', 'bridge_required'].includes(retry?.status)) {
      return jsonResponse(200, {
        ok: true,
        operation: retry.status === 'bridge_required' ? 'bridge_required' : 'activated',
        accountId: retry.accountId,
        membershipId: retry.membershipId,
        appId: value.appId,
        accountDeviceId: retry.accountDeviceId,
        appDeviceId: retry.appDeviceId,
        qaSessionId: retry.qaSessionId,
        syncUserId: retry.syncUserId,
        membershipState: retry.status === 'bridge_required' ? 'pending' : 'active',
        datasetState: retry.status === 'bridge_required' ? 'ready' : 'not_created',
        consumeMode: value.consumeMode,
        alreadyActivated: true
      }, origin, route, bookmarkHeader(session));
    }
    const limited = await rateLimit(
      env.ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER,
      `account-handoff-consume:${requestIp(request)}`
    );
    if (!limited.ok) return rateError(limited, origin, route, 60);
    const result = await repository.consume(consumeInput);
    if (!['activated', 'bridge_required'].includes(result.status)) return handoffError(result.status, origin, route);
    return jsonResponse(result.alreadyActivated ? 200 : 201, {
      ok: true,
      operation: result.status === 'bridge_required' ? 'bridge_required' : 'activated',
      accountId: result.accountId,
      membershipId: result.membershipId,
      appId: value.appId,
      accountDeviceId: result.accountDeviceId,
      appDeviceId: result.appDeviceId,
      qaSessionId: result.qaSessionId,
      syncUserId: result.syncUserId,
      membershipState: result.status === 'bridge_required' ? 'pending' : 'active',
      datasetState: result.status === 'bridge_required' ? 'ready' : 'not_created',
      consumeMode: value.consumeMode,
      alreadyActivated: result.alreadyActivated
    }, origin, route, bookmarkHeader(session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

function appJoinError(status, origin, route) {
  const errors = {
    invalid: [400, 'app_join_invalid'],
    wrong_app: [400, 'app_join_wrong_app'],
    expired: [409, 'app_join_expired'],
    cancelled: [409, 'app_join_cancelled'],
    used: [409, 'app_join_consumed'],
    membership_unavailable: [409, 'membership_state_invalid'],
    qa_admission_unavailable: [403, 'qa_admission_required']
  };
  const [httpStatus, code] = errors[status] || [503, 'account_server_error'];
  return errorResponse(httpStatus, code, origin, route);
}

async function handleAppJoinIssue(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAppJoinIssuePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (dependencies.admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.PRODUCTION &&
      !publicAccountAppAllowed(env, validation.value.appId)) {
    return errorResponse(403, 'account_app_not_available', origin, route);
  }
  if (!env.SYNC_ACCOUNT_APP_JOIN_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const value = validation.value;
    const codeVerifier = await (dependencies.appJoinCodeVerifier || appJoinCodeVerifier)(
      value.joinCode,
      env.SYNC_ACCOUNT_APP_JOIN_PEPPER
    );
    const fingerprint = await (dependencies.accountOperationFingerprint || accountOperationFingerprint)([
      'app-join-issue', context.identity.accountId, context.identity.accountDeviceId,
      value.appId, value.invitationId, codeVerifier, dependencies.admissionProvenance
    ]);
    const repository = (dependencies.createAppJoinRepository || createD1AppJoinRepository)(context.session);
    const input = {
      operationId: value.operationId,
      invitationId: value.invitationId,
      appId: value.appId,
      codeVerifier,
      requestFingerprint: fingerprint,
      admissionProvenance: dependencies.admissionProvenance,
      qaIssuerSessionId: dependencies.qaIdentity?.sessionId || null,
      now: Date.now()
    };
    const retry = await repository.resolveIssueRetry(context.identity, input);
    if (retry?.status === 'operation_conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (retry?.status === 'issued') {
      return jsonResponse(200, {
        ok: true, invitationId: retry.invitationId,
        expiresAt: retry.expiresAt, alreadyIssued: true
      }, origin, route, bookmarkHeader(context.session));
    }
    const limited = await rateLimit(
      env.ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER,
      `account-app-join-issue:${context.identity.accountDeviceId}`
    );
    if (!limited.ok) return rateError(limited, origin, route, 60);
    const result = await repository.issue(context.identity, input);
    if (result.status === 'operation_conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (result.status === 'membership_unavailable') return errorResponse(409, 'membership_state_invalid', origin, route);
    if (result.status === 'invitation_exists') return errorResponse(409, 'app_join_already_active', origin, route);
    return jsonResponse(result.alreadyIssued ? 200 : 201, {
      ok: true,
      invitationId: result.invitationId,
      appId: result.appId,
      membershipId: result.membershipId,
      expiresAt: result.expiresAt,
      alreadyIssued: result.alreadyIssued
    }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleAppJoinStatus(request, env, origin, route, dependencies, url) {
  const validation = validateAppJoinStatusQuery(url);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const repository = (dependencies.createAppJoinRepository || createD1AppJoinRepository)(context.session);
    const result = await repository.status(context.identity, validation.value.invitationId);
    if (result.status === 'not_found') return errorResponse(404, 'app_join_not_found', origin, route);
    const invitation = result.invitation;
    const state = invitation.consumedAt != null ? 'consumed'
      : invitation.cancelledAt != null ? 'cancelled'
        : invitation.expiresAt <= Date.now() ? 'expired' : 'active';
    return jsonResponse(200, { ok: true, invitation, state }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleAppJoinCancel(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAppJoinCancelPayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const repository = (dependencies.createAppJoinRepository || createD1AppJoinRepository)(context.session);
    const result = await repository.cancel(context.identity, validation.value.invitationId, Date.now());
    if (result.status === 'not_found') return errorResponse(404, 'app_join_not_found', origin, route);
    if (result.status === 'used') return errorResponse(409, 'app_join_consumed', origin, route);
    return jsonResponse(200, {
      ok: true,
      invitationId: validation.value.invitationId,
      cancelled: true,
      alreadyCancelled: result.alreadyCancelled
    }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleAppJoinConsume(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAppJoinConsumePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_APP_JOIN_PEPPER ||
      !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER || !env.SYNC_ACCOUNT_RECOVERY_PEPPER ||
      !env.SYNC_CREDENTIAL_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  let session;
  try {
    session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    const value = validation.value;
    const admissionProvenance = value.qaCredential === undefined
      ? ACCOUNT_ADMISSION_PROVENANCE.PRODUCTION
      : ACCOUNT_ADMISSION_PROVENANCE.QA;
    if (admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.PRODUCTION &&
        (!dependencies.publicAdmissionEnabled || !publicAccountAppAllowed(env, value.appId))) {
      return errorResponse(403, 'account_public_admission_closed', origin, route);
    }
    if (admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.QA &&
        !env.SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER) {
      return errorResponse(503, 'account_server_unavailable', origin, route);
    }
    const accountDevice = parseAccountCredential(value.accountCredential);
    const appDevice = parseAccountAppCredential(value.appDeviceCredential);
    let existingAppIdentity = null;
    if (value.consumeMode === 'existing_chord') {
      existingAppIdentity = await (dependencies.authenticateDevice || authenticateDevice)(
        session,
        `Bearer ${value.appDeviceCredential}`,
        'chord',
        env.SYNC_CREDENTIAL_PEPPER
      );
      if (!existingAppIdentity) {
        const retiredLegacy = await (
          dependencies.isRetiredLegacyDeviceCredential || isRetiredLegacyDeviceCredential
        )(
          session,
          `Bearer ${value.appDeviceCredential}`,
          'chord',
          env.SYNC_CREDENTIAL_PEPPER
        );
        if (retiredLegacy) {
          return errorResponse(409, 'retired_legacy_device', origin, route);
        }
        return errorResponse(401, 'invalid_app_credential', origin, route);
      }
    }
    const codeVerifier = await (dependencies.appJoinCodeVerifier || appJoinCodeVerifier)(
      value.joinCode,
      env.SYNC_ACCOUNT_APP_JOIN_PEPPER
    );
    const accountVerifier = await (dependencies.accountCredentialVerifier || accountCredentialVerifier)(
      value.accountCredential,
      env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
    );
    const appVerifier = await (dependencies.accountAppCredentialVerifier || accountAppCredentialVerifier)(
      value.appDeviceCredential,
      env.SYNC_CREDENTIAL_PEPPER
    );
    const qaCredential = admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.QA
      ? parseQaCredential(value.qaCredential) : null;
    const qaVerifier = qaCredential
      ? await (dependencies.qaCredentialVerifier || qaCredentialVerifier)(
        value.qaCredential,
        env.SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER
      ) : null;
    const fingerprint = await (dependencies.accountOperationFingerprint || accountOperationFingerprint)([
      'app-join-consume', value.appId, codeVerifier, accountDevice.deviceId,
      appDevice.deviceId, accountVerifier, appVerifier, qaVerifier || '',
      value.deviceLabel || '', value.consumeMode, admissionProvenance
    ]);
    const repository = (dependencies.createAppJoinRepository || createD1AppJoinRepository)(session);
    const input = {
      operationId: value.operationId,
      appId: value.appId,
      codeVerifier,
      requestFingerprint: fingerprint,
      accountDeviceId: accountDevice.deviceId,
      accountCredentialVerifier: accountVerifier,
      appDeviceId: appDevice.deviceId,
      appCredentialVerifier: appVerifier,
      admissionProvenance,
      qaSessionId: qaCredential?.sessionId || null,
      qaCredentialVerifier: qaVerifier,
      syncUserId: existingAppIdentity?.userId || crypto.randomUUID(),
      consumeMode: value.consumeMode,
      deviceLabel: value.deviceLabel,
      accountRecoveryPepper: env.SYNC_ACCOUNT_RECOVERY_PEPPER,
      now: Date.now()
    };
    const retry = await repository.resolveConsumeRetry(input);
    if (['activated', 'bridge_required'].includes(retry?.status)) {
      return jsonResponse(200, {
        ok: true,
        operation: retry.status === 'bridge_required' ? 'bridge_required' : 'activated',
        accountId: retry.accountId,
        membershipId: retry.membershipId,
        appId: value.appId,
        accountDeviceId: retry.accountDeviceId,
        appDeviceId: retry.appDeviceId,
        qaSessionId: retry.qaSessionId,
        syncUserId: retry.syncUserId,
        membershipState: retry.status === 'bridge_required' ? 'pending' : 'active',
        datasetState: retry.status === 'bridge_required' ? 'ready' : 'not_created',
        consumeMode: value.consumeMode,
        alreadyActivated: true
      }, origin, route, bookmarkHeader(session));
    }
    const limited = await rateLimit(
      env.ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER,
      `account-app-join-consume:${requestIp(request)}`
    );
    if (!limited.ok) return rateError(limited, origin, route, 60);
    const result = await repository.consume(input);
    if (!['activated', 'bridge_required'].includes(result.status)) return appJoinError(result.status, origin, route);
    return jsonResponse(result.alreadyActivated ? 200 : 201, {
      ok: true,
      operation: result.status === 'bridge_required' ? 'bridge_required' : 'activated',
      accountId: result.accountId,
      membershipId: result.membershipId,
      appId: value.appId,
      accountDeviceId: result.accountDeviceId,
      appDeviceId: result.appDeviceId,
      qaSessionId: result.qaSessionId,
      syncUserId: result.syncUserId,
      membershipState: result.status === 'bridge_required' ? 'pending' : 'active',
      datasetState: result.status === 'bridge_required' ? 'ready' : 'not_created',
      consumeMode: value.consumeMode,
      alreadyActivated: result.alreadyActivated
    }, origin, route, bookmarkHeader(session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

function portJoinError(status, origin, route) {
  const errors = {
    invalid: [400, 'port_join_invalid'],
    expired: [409, 'port_join_expired'],
    cancelled: [409, 'port_join_cancelled'],
    used: [409, 'port_join_consumed'],
    issuer_unavailable: [409, 'port_join_issuer_unavailable'],
    qa_admission_unavailable: [403, 'qa_admission_required']
  };
  const [httpStatus, code] = errors[status] || [503, 'account_server_error'];
  return errorResponse(httpStatus, code, origin, route);
}

async function handlePortJoinIssue(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validatePortJoinIssuePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_ACCOUNT_APP_JOIN_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const value = validation.value;
    const verifier = await (dependencies.portJoinCodeVerifier || portJoinCodeVerifier)(
      value.joinCode, env.SYNC_ACCOUNT_APP_JOIN_PEPPER
    );
    const fingerprint = await (dependencies.accountOperationFingerprint || accountOperationFingerprint)([
      'port-join-issue', context.identity.accountId, context.identity.accountDeviceId,
      value.invitationId, verifier, dependencies.admissionProvenance
    ]);
    const repository = (dependencies.createPortJoinRepository || createD1PortJoinRepository)(context.session);
    const input = {
      operationId: value.operationId,
      invitationId: value.invitationId,
      codeVerifier: verifier,
      requestFingerprint: fingerprint,
      admissionProvenance: dependencies.admissionProvenance,
      qaIssuerSessionId: dependencies.qaIdentity?.sessionId || null,
      now: Date.now()
    };
    const retry = await repository.resolveIssueRetry(context.identity, input);
    if (retry?.status === 'operation_conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (retry?.status === 'issued') {
      return jsonResponse(200, {
        ok: true, invitationId: retry.invitationId,
        expiresAt: retry.expiresAt, alreadyIssued: true
      }, origin, route, bookmarkHeader(context.session));
    }
    const limited = await rateLimit(
      env.ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER,
      `account-port-join-issue:${context.identity.accountDeviceId}`
    );
    if (!limited.ok) return rateError(limited, origin, route, 60);
    const result = await repository.issue(context.identity, input);
    if (result.status === 'operation_conflict') return errorResponse(409, 'operation_conflict', origin, route);
    if (result.status === 'issuer_unavailable') return portJoinError(result.status, origin, route);
    if (result.status === 'invitation_exists') return errorResponse(409, 'port_join_already_active', origin, route);
    return jsonResponse(result.alreadyIssued ? 200 : 201, {
      ok: true, invitationId: result.invitationId,
      expiresAt: result.expiresAt, alreadyIssued: result.alreadyIssued
    }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handlePortJoinStatus(request, env, origin, route, dependencies, url) {
  const validation = validatePortJoinStatusQuery(url);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const repository = (dependencies.createPortJoinRepository || createD1PortJoinRepository)(context.session);
    const result = await repository.status(context.identity, validation.value.invitationId);
    if (result.status === 'not_found') return errorResponse(404, 'port_join_not_found', origin, route);
    const invitation = result.invitation;
    const state = invitation.consumedAt != null ? 'consumed'
      : invitation.cancelledAt != null ? 'cancelled'
        : invitation.expiresAt <= Date.now() ? 'expired' : 'active';
    return jsonResponse(200, { ok: true, invitation, state }, origin, route,
      bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handlePortJoinCancel(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validatePortJoinCancelPayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await accountContext(request, env, dependencies); } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const repository = (dependencies.createPortJoinRepository || createD1PortJoinRepository)(context.session);
    const result = await repository.cancel(context.identity, validation.value.invitationId, Date.now());
    if (result.status === 'not_found') return errorResponse(404, 'port_join_not_found', origin, route);
    if (result.status === 'used') return errorResponse(409, 'port_join_consumed', origin, route);
    return jsonResponse(200, {
      ok: true, invitationId: validation.value.invitationId,
      cancelled: true, alreadyCancelled: result.alreadyCancelled
    }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handlePortJoinConsume(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validatePortJoinConsumePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_APP_JOIN_PEPPER ||
      !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER) {
    return errorResponse(503, 'account_server_unavailable', origin, route);
  }
  let session;
  try {
    session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    const value = validation.value;
    const admissionProvenance = value.qaCredential === undefined
      ? ACCOUNT_ADMISSION_PROVENANCE.PRODUCTION
      : ACCOUNT_ADMISSION_PROVENANCE.QA;
    if (admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.PRODUCTION &&
        !dependencies.publicAdmissionEnabled) {
      return errorResponse(403, 'account_public_admission_closed', origin, route);
    }
    if (admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.QA &&
        !env.SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER) {
      return errorResponse(503, 'account_server_unavailable', origin, route);
    }
    const accountDevice = parseAccountCredential(value.accountCredential);
    const verifier = await (dependencies.portJoinCodeVerifier || portJoinCodeVerifier)(
      value.joinCode, env.SYNC_ACCOUNT_APP_JOIN_PEPPER
    );
    const accountVerifier = await (dependencies.accountCredentialVerifier || accountCredentialVerifier)(
      value.accountCredential, env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
    );
    const qaCredential = admissionProvenance === ACCOUNT_ADMISSION_PROVENANCE.QA
      ? parseQaCredential(value.qaCredential) : null;
    const qaVerifier = qaCredential
      ? await (dependencies.qaCredentialVerifier || qaCredentialVerifier)(
        value.qaCredential, env.SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER
      ) : null;
    const fingerprint = await (dependencies.accountOperationFingerprint || accountOperationFingerprint)([
      'port-join-consume', verifier, accountDevice.deviceId,
      accountVerifier, qaVerifier || '', value.deviceLabel || '', admissionProvenance
    ]);
    const repository = (dependencies.createPortJoinRepository || createD1PortJoinRepository)(session);
    const input = {
      operationId: value.operationId,
      codeVerifier: verifier,
      requestFingerprint: fingerprint,
      accountDeviceId: accountDevice.deviceId,
      accountCredentialVerifier: accountVerifier,
      admissionProvenance,
      qaSessionId: qaCredential?.sessionId || null,
      qaCredentialVerifier: qaVerifier,
      deviceLabel: value.deviceLabel,
      now: Date.now()
    };
    const retry = await repository.resolveConsumeRetry(input);
    if (retry?.status === 'joined') {
      return jsonResponse(200, { ok: true, operation: 'existing', ...retry }, origin, route,
        bookmarkHeader(session));
    }
    const limited = await rateLimit(
      env.ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER,
      `account-port-join-consume:${requestIp(request)}`
    );
    if (!limited.ok) return rateError(limited, origin, route, 60);
    const result = await repository.consume(input);
    if (result.status !== 'joined') return portJoinError(result.status, origin, route);
    return jsonResponse(result.alreadyJoined ? 200 : 201, {
      ok: true, operation: result.alreadyJoined ? 'existing' : 'joined',
      accountId: result.accountId, accountDeviceId: result.accountDeviceId,
      recoveryVersion: result.recoveryVersion, qaSessionId: result.qaSessionId,
      qaExpiresAt: result.qaExpiresAt,
      alreadyJoined: result.alreadyJoined
    }, origin, route, bookmarkHeader(session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

export async function handleAccountApiRequest(request, env = {}, _ctx, dependencies = {}) {
  const url = new URL(request.url);
  const routingMethod = request.method === 'OPTIONS'
    ? request.headers.get('Access-Control-Request-Method')
    : request.method;
  const route = resolvedRoute(url.pathname, routingMethod);
  if (!route) return errorResponse(404, 'not_found');
  const origin = request.headers.get('Origin');
  const originAllowed = Boolean(origin && configuredOrigins(env).has(origin));

  if (request.method === 'OPTIONS') {
    if (!originAllowed) return errorResponse(403, 'invalid_origin');
    const requestedMethod = request.headers.get('Access-Control-Request-Method');
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
      .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
    const optionRoute = resolvedRoute(url.pathname, requestedMethod);
    if (!optionRoute || requestedMethod !== optionRoute.method ||
        requestedHeaders.some((header) => ![...optionRoute.headers, QA_HEADER].includes(header))) {
      return errorResponse(403, 'invalid_origin', origin, route);
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin, optionRoute) });
  }
  if (request.method !== route.method) {
    return errorResponse(405, 'method_not_allowed', originAllowed ? origin : null,
      originAllowed ? route : null, { Allow: `${route.method}, OPTIONS` });
  }
  if (!originAllowed) return errorResponse(403, 'invalid_origin');
  if (['POST', 'DELETE'].includes(request.method) &&
      !isJsonContentType(request.headers.get('Content-Type'))) {
    return errorResponse(415, 'invalid_content_type', origin, route);
  }

  const readControl = dependencies.readAccountRuntimeControl || readAccountRuntimeControl;
  let control = null;
  try { control = await readControl(env.SYNC_DB); } catch {}
  const gate = accountGateDecision(route.action, control);
  if (!gate.allowed) return errorResponse(gate.status, gate.code, origin, route);
  const publicAdmissionEnabled = publicAccountAdmissionEnabled(env, control);
  dependencies = { ...dependencies, publicAdmissionEnabled };

  if (url.pathname === '/v2/accounts/qa/enroll') {
    return handleQaEnrollment(request, env, origin, route, dependencies);
  }

  if (url.pathname !== '/v2/accounts/handoffs/consume' &&
      url.pathname !== '/v2/accounts/app-join-invitations/consume' &&
      url.pathname !== '/v2/accounts/port-join-invitations/consume') {
    const qaHeader = request.headers.get('X-Sound-Cruise-QA-Authorization');
    if (qaHeader !== null) {
      let session;
      let qaIdentity;
      try {
        session = createSession(env, request);
        if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
        qaIdentity = await (dependencies.authenticateQaRequest || authenticateQaRequest)(
          session,
          qaHeader,
          env,
          url.pathname === '/v2/accounts/start' || url.pathname === '/v2/accounts/handoffs' ||
            url.pathname === '/v2/accounts/handoffs/cancel' || url.pathname === '/v2/accounts/memberships' ||
            url.pathname === '/v2/accounts/app-join-invitations' ||
            url.pathname === '/v2/accounts/app-join-invitations/cancel' ||
            url.pathname === '/v2/accounts/port-join-invitations' ||
            url.pathname === '/v2/accounts/port-join-invitations/cancel'
            ? { scope: 'port' }
            : {},
          dependencies
        );
      } catch {
        return errorResponse(503, 'account_qa_unavailable', origin, route);
      }
      if (!qaIdentity) return errorResponse(403, 'qa_admission_required', origin, route);
      dependencies = {
        ...dependencies,
        qaIdentity,
        admissionProvenance: ACCOUNT_ADMISSION_PROVENANCE.QA
      };
    } else {
      if (url.pathname.startsWith('/v2/accounts/handoffs')) {
        return errorResponse(403, 'account_public_handoff_unavailable', origin, route);
      }
      if (requiresPublicAdmission(url.pathname, request.method) && !publicAdmissionEnabled) {
        return errorResponse(403, 'account_public_admission_closed', origin, route);
      }
      dependencies = {
        ...dependencies,
        admissionProvenance: ACCOUNT_ADMISSION_PROVENANCE.PRODUCTION
      };
    }
  } else if (url.pathname === '/v2/accounts/handoffs/consume') {
    dependencies = { ...dependencies, admissionProvenance: ACCOUNT_ADMISSION_PROVENANCE.QA };
  }

  if (url.pathname === '/v2/accounts/bridges/chord' ||
      url.pathname.startsWith('/v2/accounts/bridges/chord/')) {
    return handleChordAccountBridgeRequest(request, env, origin, route, dependencies, {
      createSession,
      sessionBookmark,
      jsonResponse,
      errorResponse,
      rateLimit,
      rateError,
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES
    });
  }

  if (url.pathname === '/v2/accounts/start') return handleStart(request, env, origin, route, dependencies);
  if (url.pathname === '/v2/accounts/summary') return handleSummary(request, env, origin, route, dependencies, url);
  if (url.pathname === '/v2/accounts/devices') return handleDevices(request, env, origin, route, dependencies, url);
  if (url.pathname === '/v2/accounts/devices/revoke') {
    return handleEnvironmentRevoke(request, env, origin, route, dependencies);
  }
  const membershipDetach = url.pathname.match(
    /^\/v2\/accounts\/memberships\/(chord|pitch|fretboard|rhythm)\/detach$/
  );
  if (membershipDetach) {
    return handleAppDetach(request, env, origin, route, dependencies, membershipDetach[1]);
  }
  if (url.pathname === '/v2/accounts/recovery/prepare') {
    return handleAccountRecoveryPrepare(request, env, origin, route, dependencies);
  }
  if (url.pathname === '/v2/accounts/recovery/commit') {
    return handleAccountRecoveryCommit(request, env, origin, route, dependencies);
  }
  if (url.pathname === '/v2/accounts/recovery-rotation/prepare') {
    return handleAccountRecoveryRotationPrepare(request, env, origin, route, dependencies);
  }
  if (url.pathname === '/v2/accounts/recovery-rotation/commit') {
    return handleAccountRecoveryRotationCommit(request, env, origin, route, dependencies);
  }
  if (url.pathname === '/v2/accounts/delete-intent') {
    return handleDeleteIntent(request, env, origin, route, dependencies, 'account');
  }
  if (url.pathname === '/v2/accounts' && request.method === 'DELETE') {
    return handleDeleteCommit(request, env, origin, route, dependencies, 'account');
  }
  const membershipDelete = url.pathname.match(
    /^\/v2\/accounts\/memberships\/(chord|pitch|fretboard|rhythm)(\/delete-intent)?$/
  );
  if (membershipDelete?.[2]) {
    return handleDeleteIntent(request, env, origin, route, dependencies, 'app', membershipDelete[1]);
  }
  if (membershipDelete && request.method === 'DELETE') {
    return handleDeleteCommit(request, env, origin, route, dependencies, 'app', membershipDelete[1]);
  }
  if (url.pathname === '/v2/accounts/memberships' && request.method === 'GET') {
    return handleSummary(request, env, origin, route, dependencies, url, true);
  }
  if (url.pathname === '/v2/accounts/memberships') {
    return handleMembershipPrepare(request, env, origin, route, dependencies);
  }
  if (url.pathname === '/v2/accounts/handoffs') return handleHandoffIssue(request, env, origin, route, dependencies);
  if (url.pathname === '/v2/accounts/handoffs/cancel') return handleHandoffCancel(request, env, origin, route, dependencies);
  if (url.pathname === '/v2/accounts/handoffs/consume') return handleHandoffConsume(request, env, origin, route, dependencies);
  if (url.pathname === '/v2/accounts/app-join-invitations' && request.method === 'GET') {
    return handleAppJoinStatus(request, env, origin, route, dependencies, url);
  }
  if (url.pathname === '/v2/accounts/app-join-invitations') {
    return handleAppJoinIssue(request, env, origin, route, dependencies);
  }
  if (url.pathname === '/v2/accounts/app-join-invitations/cancel') {
    return handleAppJoinCancel(request, env, origin, route, dependencies);
  }
  if (url.pathname === '/v2/accounts/port-join-invitations' && request.method === 'GET') {
    return handlePortJoinStatus(request, env, origin, route, dependencies, url);
  }
  if (url.pathname === '/v2/accounts/port-join-invitations') {
    return handlePortJoinIssue(request, env, origin, route, dependencies);
  }
  if (url.pathname === '/v2/accounts/port-join-invitations/cancel') {
    return handlePortJoinCancel(request, env, origin, route, dependencies);
  }
  if (url.pathname === '/v2/accounts/port-join-invitations/consume') {
    return handlePortJoinConsume(request, env, origin, route, dependencies);
  }
  return handleAppJoinConsume(request, env, origin, route, dependencies);
}
