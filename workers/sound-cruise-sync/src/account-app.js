import { authenticateAccountDevice } from './account-auth.js';
import {
  accountAppCredentialVerifier,
  accountCredentialVerifier,
  accountHandoffVerifier,
  accountOperationFingerprint,
  accountRecoveryCodeVerifier,
  parseAccountAppCredential,
  parseAccountCredential,
  parseAccountHandoff
} from './account-crypto.js';
import { createD1AccountRepository } from './account-database.js';
import { createD1AccountHandoffRepository } from './account-handoff-database.js';
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
  validateAccountStartPayload,
  validateHandoffCancelPayload,
  validateHandoffConsumePayload,
  validateHandoffIssuePayload,
  validateMembershipPreparePayload
} from './account-validation.js';
import { verifyTurnstileToken } from './turnstile.js';
import { isJsonContentType, readBodyWithLimit } from './validation.js';

const ACCOUNT_ROUTES = Object.freeze({
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

function resolvedRoute(pathname, method) {
  const base = ACCOUNT_ROUTES[pathname];
  if (!base) return null;
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
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': `${route.method}, OPTIONS`,
    'Access-Control-Allow-Headers': route.headers.map(headerCase).join(', '),
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

async function accountContext(request, env, dependencies) {
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER) {
    return { error: 'account_server_unavailable', status: 503 };
  }
  const session = createSession(env, request);
  if (!session) return { error: 'invalid_bookmark', status: 400 };
  const authenticate = dependencies.authenticateAccountDevice || authenticateAccountDevice;
  const identity = await authenticate(
    session,
    request.headers.get('Authorization'),
    env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
  );
  if (!identity) return { error: 'invalid_account_credential', status: 401 };
  return {
    session,
    identity,
    repository: (dependencies.createAccountRepository || createD1AccountRepository)(session)
  };
}

function bookmarkHeader(session) {
  return { 'X-D1-Bookmark': sessionBookmark(session) };
}

async function handleStart(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountStartPayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
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
      value.deviceLabel || ''
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
      : { ok: true, ...summary };
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
    const devices = await context.repository.listAccountDevices(context.identity);
    return jsonResponse(200, { ok: true, devices }, origin, route, bookmarkHeader(context.session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

async function handleMembershipPrepare(request, env, origin, route, dependencies) {
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateMembershipPreparePayload(parsed.value);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
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
    membership_unavailable: [409, 'membership_state_invalid']
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
      !env.SYNC_CREDENTIAL_PEPPER) {
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
    const fingerprint = await (dependencies.accountOperationFingerprint || accountOperationFingerprint)([
      'handoff-consume', value.appId, handoff.handoffId, accountDevice.deviceId,
      appDevice.deviceId, accountVerifier, appVerifier, value.deviceLabel || ''
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
      syncUserId: crypto.randomUUID(),
      deviceLabel: value.deviceLabel,
      accountRecoveryPepper: env.SYNC_ACCOUNT_RECOVERY_PEPPER,
      now: Date.now()
    };
    const retry = typeof repository.resolveConsumeRetry === 'function'
      ? await repository.resolveConsumeRetry(consumeInput)
      : null;
    if (retry?.status === 'activated') {
      return jsonResponse(200, {
        ok: true,
        operation: 'activated',
        accountId: retry.accountId,
        membershipId: retry.membershipId,
        appId: value.appId,
        accountDeviceId: retry.accountDeviceId,
        appDeviceId: retry.appDeviceId,
        syncUserId: retry.syncUserId,
        membershipState: 'active',
        datasetState: 'not_created',
        alreadyActivated: true
      }, origin, route, bookmarkHeader(session));
    }
    const limited = await rateLimit(
      env.ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER,
      `account-handoff-consume:${requestIp(request)}`
    );
    if (!limited.ok) return rateError(limited, origin, route, 60);
    const result = await repository.consume(consumeInput);
    if (result.status !== 'activated') return handoffError(result.status, origin, route);
    return jsonResponse(result.alreadyActivated ? 200 : 201, {
      ok: true,
      operation: 'activated',
      accountId: result.accountId,
      membershipId: result.membershipId,
      appId: value.appId,
      accountDeviceId: result.accountDeviceId,
      appDeviceId: result.appDeviceId,
      syncUserId: result.syncUserId,
      membershipState: 'active',
      datasetState: 'not_created',
      alreadyActivated: result.alreadyActivated
    }, origin, route, bookmarkHeader(session));
  } catch {
    return errorResponse(503, 'account_server_error', origin, route);
  }
}

export async function handleAccountApiRequest(request, env = {}, _ctx, dependencies = {}) {
  const url = new URL(request.url);
  const route = resolvedRoute(url.pathname, request.method);
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
        requestedHeaders.some((header) => !optionRoute.headers.includes(header))) {
      return errorResponse(403, 'invalid_origin', origin, route);
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin, optionRoute) });
  }
  if (request.method !== route.method) {
    return errorResponse(405, 'method_not_allowed', originAllowed ? origin : null,
      originAllowed ? route : null, { Allow: `${route.method}, OPTIONS` });
  }
  if (!originAllowed) return errorResponse(403, 'invalid_origin');
  if (request.method === 'POST' && !isJsonContentType(request.headers.get('Content-Type'))) {
    return errorResponse(415, 'invalid_content_type', origin, route);
  }

  const readControl = dependencies.readAccountRuntimeControl || readAccountRuntimeControl;
  let control = null;
  try { control = await readControl(env.SYNC_DB); } catch {}
  const gate = accountGateDecision(route.action, control);
  if (!gate.allowed) return errorResponse(gate.status, gate.code, origin, route);

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
  if (url.pathname === '/v2/accounts/memberships' && request.method === 'GET') {
    return handleSummary(request, env, origin, route, dependencies, url, true);
  }
  if (url.pathname === '/v2/accounts/memberships') {
    return handleMembershipPrepare(request, env, origin, route, dependencies);
  }
  if (url.pathname === '/v2/accounts/handoffs') return handleHandoffIssue(request, env, origin, route, dependencies);
  if (url.pathname === '/v2/accounts/handoffs/cancel') return handleHandoffCancel(request, env, origin, route, dependencies);
  return handleHandoffConsume(request, env, origin, route, dependencies);
}
