import { authenticateDevice } from './auth.js';
import { authenticateAccountDevice } from './account-auth.js';
import {
  accountManagedRecoveryVerifier,
  accountOperationFingerprint
} from './account-crypto.js';
import { createD1ChordAccountBridgeRepository } from './account-bridge-database.js';
import {
  validateAccountReadQuery,
  validateChordBridgeDualPayload,
  validateChordBridgePreparePayload,
  validateChordBridgeTransitionPayload
} from './account-validation.js';
import { readBodyWithLimit } from './validation.js';
import { authenticateQaRequest } from './account-qa-auth.js';

export const CHORD_BRIDGE_ROUTES = Object.freeze({
  '/v2/accounts/bridges/chord': {
    method: 'GET',
    headers: ['authorization', 'x-sound-cruise-app-authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/bridges/chord/prepare': {
    method: 'POST',
    headers: ['content-type', 'authorization', 'x-sound-cruise-app-authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/bridges/chord/dual': {
    method: 'POST',
    headers: ['content-type', 'authorization', 'x-sound-cruise-app-authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/bridges/chord/finalize': {
    method: 'POST',
    headers: ['content-type', 'authorization', 'x-sound-cruise-app-authorization', 'x-d1-bookmark']
  },
  '/v2/accounts/bridges/chord/rollback': {
    method: 'POST',
    headers: ['content-type', 'authorization', 'x-sound-cruise-app-authorization', 'x-d1-bookmark']
  }
});

async function parseJson(request, maxBytes) {
  const parsed = await readBodyWithLimit(request, maxBytes);
  if (!parsed.ok) return {
    ok: false,
    status: parsed.tooLarge ? 413 : 400,
    code: parsed.tooLarge ? 'payload_too_large' : 'invalid_json'
  };
  try { return { ok: true, value: JSON.parse(parsed.text) }; } catch {
    return { ok: false, status: 400, code: 'invalid_json' };
  }
}

async function bridgeContext(request, env, dependencies, createSession) {
  if (!env.SYNC_DB || !env.SYNC_ACCOUNT_CREDENTIAL_PEPPER || !env.SYNC_CREDENTIAL_PEPPER ||
      !env.SYNC_ACCOUNT_RECOVERY_PEPPER) {
    return { error: 'account_server_unavailable', status: 503 };
  }
  const session = createSession(env, request);
  if (!session) return { error: 'invalid_bookmark', status: 400 };
  const accountAuth = dependencies.authenticateAccountDevice || authenticateAccountDevice;
  const appAuth = dependencies.authenticateDevice || authenticateDevice;
  const account = await accountAuth(
    session,
    request.headers.get('Authorization'),
    env.SYNC_ACCOUNT_CREDENTIAL_PEPPER
  );
  if (!account) return { error: 'invalid_account_credential', status: 401 };
  const app = await appAuth(
    session,
    request.headers.get('X-Sound-Cruise-App-Authorization'),
    'chord',
    env.SYNC_CREDENTIAL_PEPPER
  );
  if (!app) return { error: 'invalid_app_credential', status: 401 };
  const qa = dependencies.qaIdentity || await (
    dependencies.authenticateQaRequest || authenticateQaRequest
  )(
    session,
    request.headers.get('X-Sound-Cruise-QA-Authorization'),
    env,
    { scope: 'app', accountId: account.accountId, appId: 'chord', appDeviceId: app.deviceId },
    dependencies
  );
  if (!qa || qa.scope !== 'app' || qa.appId !== 'chord' ||
      qa.accountId !== account.accountId || qa.appDeviceId !== app.deviceId) {
    return { error: 'qa_admission_required', status: 403 };
  }
  return {
    session,
    identity: {
      accountId: account.accountId,
      accountDeviceId: account.accountDeviceId,
      accountGeneration: account.generation,
      accountRecoveryVersion: account.recoveryVersion,
      syncUserId: app.userId,
      appDeviceId: app.deviceId,
      appId: app.appId,
      appUserState: app.userState
    },
    repository: (dependencies.createChordAccountBridgeRepository ||
      createD1ChordAccountBridgeRepository)(session)
  };
}

function responseBody(result) {
  return {
    ok: true,
    operation: result.bridge.state,
    bridge: result.bridge,
    ...(result.summary ? { summary: result.summary } : {}),
    alreadyApplied: Boolean(result.alreadyApplied || result.alreadyPrepared)
  };
}

function bridgeError(result, helpers, origin, route) {
  const errors = {
    not_found: [404, 'bridge_not_found'],
    operation_conflict: [409, 'operation_conflict'],
    ownership_conflict: [409, 'bridge_ownership_conflict'],
    ineligible: [409, 'bridge_ineligible'],
    precondition_failed: [409, 'bridge_precondition_failed'],
    recovery_active: [409, 'legacy_recovery_active'],
    forward_only: [409, 'bridge_forward_only']
  };
  const [status, code] = errors[result.status] || [503, 'account_server_error'];
  return helpers.errorResponse(status, code, origin, route);
}

async function limitFresh(env, key, helpers, origin, route) {
  const result = await helpers.rateLimit(env.ACCOUNT_BRIDGE_RATE_LIMITER, key);
  return result.ok ? null : helpers.rateError(result, origin, route, 60);
}

export async function handleChordAccountBridgeRequest(
  request,
  env,
  origin,
  route,
  dependencies,
  helpers
) {
  const url = new URL(request.url);
  let context;
  try {
    context = await bridgeContext(request, env, dependencies, helpers.createSession);
  } catch {
    return helpers.errorResponse(503, 'account_server_error', origin, route);
  }
  if (context.error) return helpers.errorResponse(context.status, context.error, origin, route);
  const bookmark = () => ({ 'X-D1-Bookmark': helpers.sessionBookmark(context.session) });

  if (request.method === 'GET') {
    if (!validateAccountReadQuery(url).ok) {
      return helpers.errorResponse(400, 'invalid_request', origin, route);
    }
    try {
      const result = await context.repository.state(context.identity);
      if (result.status !== 'ok') return bridgeError(result, helpers, origin, route);
      return helpers.jsonResponse(200, responseBody(result), origin, route, bookmark());
    } catch {
      return helpers.errorResponse(503, 'account_server_error', origin, route);
    }
  }

  const parsed = await parseJson(request, helpers.maxBodyBytes);
  if (!parsed.ok) return helpers.errorResponse(parsed.status, parsed.code, origin, route);
  const validators = {
    '/v2/accounts/bridges/chord/prepare': validateChordBridgePreparePayload,
    '/v2/accounts/bridges/chord/dual': validateChordBridgeDualPayload,
    '/v2/accounts/bridges/chord/finalize': validateChordBridgeTransitionPayload,
    '/v2/accounts/bridges/chord/rollback': validateChordBridgeTransitionPayload
  };
  const validation = validators[url.pathname]?.(parsed.value);
  if (!validation?.ok) return helpers.errorResponse(400, 'invalid_request', origin, route);
  const value = validation.value;
  const fingerprintParts = [
    `chord-bridge-${url.pathname.split('/').at(-1)}`,
    context.identity.accountId,
    context.identity.accountDeviceId,
    context.identity.syncUserId,
    context.identity.appDeviceId,
    value.operationId,
    value.bridgeId || '',
    String(value.expectedAccountGeneration || ''),
    String(value.expectedBridgeGeneration || ''),
    String(value.accountRecoveryVersion || ''),
    String(value.recoverySaved || false)
  ];
  let fingerprint;
  try {
    fingerprint = await (dependencies.accountOperationFingerprint || accountOperationFingerprint)(fingerprintParts);
  } catch {
    return helpers.errorResponse(503, 'account_server_error', origin, route);
  }
  const input = { ...value, requestFingerprint: fingerprint, now: Date.now() };

  try {
    if (url.pathname.endsWith('/prepare')) {
      const retry = await context.repository.resolvePrepareRetry(context.identity, input);
      if (retry) {
        if (retry.status === 'operation_conflict') return bridgeError(retry, helpers, origin, route);
        return helpers.jsonResponse(200, responseBody(retry), origin, route, bookmark());
      }
      const limited = await limitFresh(
        env,
        `account-bridge:${context.identity.accountId}:${context.identity.syncUserId}`,
        helpers,
        origin,
        route
      );
      if (limited) return limited;
      const result = await context.repository.prepare(context.identity, {
        ...input,
        bridgeId: crypto.randomUUID()
      });
      if (result.status === 'bridge_exists') {
        return helpers.jsonResponse(200, responseBody(result), origin, route, bookmark());
      }
      if (result.status !== 'prepared') return bridgeError(result, helpers, origin, route);
      return helpers.jsonResponse(201, responseBody(result), origin, route, bookmark());
    }

    const kind = url.pathname.endsWith('/dual')
      ? 'dual' : url.pathname.endsWith('/finalize') ? 'finalize' : 'rollback';
    const retry = await context.repository.resolveTransitionRetry(kind, context.identity, input);
    if (retry) {
      if (['operation_conflict', 'not_found'].includes(retry.status)) {
        return bridgeError(retry, helpers, origin, route);
      }
      return helpers.jsonResponse(200, responseBody(retry), origin, route, bookmark());
    }
    const limited = await limitFresh(
      env,
      `account-bridge:${context.identity.accountId}:${context.identity.syncUserId}`,
      helpers,
      origin,
      route
    );
    if (limited) return limited;

    let result;
    if (kind === 'dual') {
      result = await context.repository.commitDual(context.identity, input);
    } else if (kind === 'finalize') {
      const material = await context.repository.finalizeMaterial(context.identity, input.bridgeId);
      if (!material) return bridgeError({ status: 'not_found' }, helpers, origin, route);
      const disabledLegacyRecoveryVerifier = await (
        dependencies.accountManagedRecoveryVerifier || accountManagedRecoveryVerifier
      )(material.accountRecoveryVerifier, 'chord', env.SYNC_ACCOUNT_RECOVERY_PEPPER);
      result = await context.repository.finalize(context.identity, {
        ...input,
        legacyRecoveryVerifier: material.legacyRecoveryVerifier,
        disabledLegacyRecoveryVerifier
      });
    } else {
      result = await context.repository.rollback(context.identity, input);
    }
    const successStatus = {
      dual: 'dual',
      finalize: 'finalized',
      rollback: 'rolled_back'
    }[kind];
    if (result.status !== successStatus) return bridgeError(result, helpers, origin, route);
    return helpers.jsonResponse(result.alreadyApplied ? 200 : 201, responseBody(result), origin, route, bookmark());
  } catch {
    return helpers.errorResponse(503, 'account_server_error', origin, route);
  }
}
