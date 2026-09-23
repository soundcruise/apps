import { inspectDeviceCredential } from './auth.js';
import { authenticateQaRequest } from './account-qa-auth.js';
import { handleAccountApiRequest } from './account-app.js';
import {
  legacyOperationDecision,
  readLegacyAccountPolicy,
  readLegacyAccountPolicyByRecoveryVerifier
} from './account-legacy-guard.js';
import {
  createIdentityMaterial, createPairingCode, pairingCodeVerifier,
  createRecoveryClaim, createRecoveryCode, formatRecoveryCode,
  recoveryClaimVerifier, recoveryCodeVerifier, createDeleteIntent, deleteIntentVerifier,
  enrollmentCodeVerifier
} from './crypto.js';
import { createD1DeviceRepository } from './device-database.js';
import { createD1CleanupRepository } from './cleanup-database.js';
import { createProvisioningIdentity } from './database.js';
import { createD1PairingRepository } from './pairing-database.js';
import { createD1RecoveryRepository } from './recovery-database.js';
import { decodeCursor, encodeCursor } from './records.js';
import { createD1SyncRepository } from './sync-database.js';
import { createD1AssetRepository } from './asset-database.js';
import {
  ASSET_KINDS, inspectAssetContent, sha256Hex,
  validateAssetCommit, validateAssetPrepare, validateAssetUnreference
} from './asset-validation.js';
import { verifyTurnstileToken } from './turnstile.js';
import { gateDecision, readRuntimeControl } from './rollout-control.js';
import { productionAccountAppAllowed } from './account-admission.js';
import {
  isJsonContentType,
  MAX_BODY_BYTES,
  MAX_PUSH_BODY_BYTES,
  readBodyWithLimit,
  validateMigrationCompletePayload,
  validateDeviceRevokePayload,
  validateDeleteIntentPayload,
  validateAccountDeletePayload,
  validateBootstrapPayload,
  validatePairingIssuePayload,
  validatePairPayload,
  validateRecoveryIssuePayload,
  validateRecoveryPayload,
  validatePushPayload,
  validateReadQuery,
  validateStartPayload,
  validatePublicAppId
} from './validation.js';

const ROUTES = Object.freeze({
  '/v1/sync/start': { method: 'POST', headers: ['content-type'] },
  '/v1/sync/pairing-codes': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  '/v1/sync/pair': { method: 'POST', headers: ['content-type'] },
  '/v1/sync/bootstrap': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  '/v1/sync/recover': { method: 'POST', headers: ['content-type'] },
  '/v1/sync/recovery-codes': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  '/v1/sync/devices': { method: 'GET', headers: ['authorization', 'x-d1-bookmark'] },
  '/v1/sync/devices/revoke': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  '/v1/sync/account/delete-intent': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  '/v1/sync/account': { method: 'DELETE', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  '/v1/sync/push': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  '/v1/sync/migration/complete': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  '/v1/sync/changes': { method: 'GET', headers: ['authorization', 'x-d1-bookmark'] },
  '/v1/sync/snapshot': { method: 'GET', headers: ['authorization', 'x-d1-bookmark'] },
  '/v1/sync/removal-safety': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] }
});

const ASSET_ROUTES = Object.freeze({
  '/v1/sync/assets/prepare': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  '/v1/sync/assets/commit': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  '/v1/sync/assets/unreference': { method: 'POST', headers: ['content-type', 'authorization', 'x-d1-bookmark'] },
  content: { method: 'PUT', headers: ['content-type', 'authorization', 'x-d1-bookmark', 'x-sound-cruise-operation-id', 'x-content-sha256'] },
  download: { method: 'GET', headers: ['authorization', 'x-d1-bookmark'] }
});

const QA_HEADER = 'x-sound-cruise-qa-authorization';

// These binary-only switches deliberately default to enabled for the Phase 1
// production contract. Set a variable to the literal string "false" to stop
// just that operation without affecting structured sync or the four Pro apps.
function assetFeatureEnabled(env, name) { return env[name] !== 'false'; }

function configuredOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
}

function requestOrigin(request, env) {
  const explicitOrigin = request.headers.get('Origin');
  return explicitOrigin || null;
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
    'Access-Control-Expose-Headers': 'X-D1-Bookmark, X-Asset-SHA256, ETag',
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
    if (value !== null && value !== undefined && value !== '') headers.set(name, value);
  });
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(status, code, origin = null, route = null, extraHeaders = null) {
  return jsonResponse(status, { ok: false, code }, origin, route, extraHeaders);
}

async function isRateLimited(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return true;
  try {
    const result = await binding.limit({ key });
    return result?.success !== true;
  } catch {
    return true;
  }
}

function requestIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'missing';
}

function validBookmark(value) {
  return value === null || (value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value));
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

async function readJson(request, limit) {
  const result = await readBodyWithLimit(request, limit);
  if (!result.ok) return {
    ok: false,
    status: result.tooLarge ? 413 : 400,
    code: result.tooLarge ? 'payload_too_large' : 'invalid_json'
  };
  try { return { ok: true, value: JSON.parse(result.text) }; } catch { return { ok: false, status: 400, code: 'invalid_json' }; }
}

function publicRecord(record) {
  if (!record) return null;
  return {
    recordType: record.recordType,
    recordId: record.recordId,
    schemaVersion: record.schemaVersion,
    revision: record.revision,
    payload: record.payload,
    payloadHash: record.payloadHash,
    deletedAt: record.deletedAt,
    operationId: record.operationId,
    changeSeq: record.changeSeq
  };
}

async function authenticatedContext(request, env, appId, dependencies) {
  if (!env.SYNC_CREDENTIAL_PEPPER || !env.SYNC_DB) return { error: 'server_unavailable', status: 503 };
  const session = createSession(env, request);
  if (!session) return { error: 'invalid_bookmark', status: 400 };
  let identity;
  if (dependencies.authenticateDevice) {
    identity = await dependencies.authenticateDevice(
      session, request.headers.get('Authorization'), appId, env.SYNC_CREDENTIAL_PEPPER
    );
  } else {
    const inspected = await inspectDeviceCredential(
      session, request.headers.get('Authorization'), appId, env.SYNC_CREDENTIAL_PEPPER
    );
    if (inspected?.error) return { error: inspected.error, status: 410 };
    identity = inspected?.identity || null;
  }
  if (!identity) return { error: 'invalid_credential', status: 401 };
  let qaRequired = !validatePublicAppId(appId, env);
  let accountId = null;
  const qaApps = new Set(String(env.SYNC_QA_ALLOWED_APP_IDS || '').split(',').map((value) => value.trim()));
  const accountManagedApp = qaApps.has(appId) || productionAccountAppAllowed(env, appId);
  const managed = accountManagedApp ? await session.prepare(`
      SELECT am.account_id, am.membership_id, a.admission_provenance,
             a.state AS account_state, m.state AS membership_state,
             d.state AS dataset_state
      FROM sync_account_managed_users am
      JOIN sync_accounts a ON a.id = am.account_id
      JOIN sync_account_memberships m ON m.id = am.membership_id
      LEFT JOIN sync_datasets d ON d.user_id = am.sync_user_id AND d.app_id = am.app_id
      WHERE am.sync_user_id = ? AND am.app_id = ?
    `).bind(identity.userId, appId).first() : null;
  if (managed) {
    accountId = managed.account_id;
    if (managed.admission_provenance === 'qa') {
      qaRequired = true;
    } else if (managed.admission_provenance === 'production') {
      if (!productionAccountAppAllowed(env, appId)) {
        return { error: 'account_production_app_unavailable', status: 403 };
      }
      if (request.headers.get('X-Sound-Cruise-QA-Authorization') !== null) {
        return { error: 'account_admission_mismatch', status: 403 };
      }
      qaRequired = false;
    } else {
      return { error: 'account_admission_mismatch', status: 403 };
    }
  }
  if (qaRequired) {
    let qa;
    try {
      qa = await (dependencies.authenticateQaRequest || authenticateQaRequest)(
        session,
        request.headers.get('X-Sound-Cruise-QA-Authorization'),
        env,
        appId === 'port'
          ? { scope: 'port', ...(accountId ? { accountId } : {}) }
          : { scope: 'app', appId, appDeviceId: identity.deviceId,
              ...(accountId ? { accountId } : {}) },
        dependencies
      );
    } catch {
      return { error: 'qa_admission_unavailable', status: 503 };
    }
    if (!qa) return { error: 'qa_admission_required', status: 403 };
  }
  const createRepository = dependencies.createRepository || createD1SyncRepository;
  return {
    session, identity, repository: createRepository(session),
    authority: managed ? Object.freeze({
      accountId: managed.account_id, membershipId: managed.membership_id,
      accountState: managed.account_state, membershipState: managed.membership_state,
      datasetState: managed.dataset_state
    }) : null
  };
}

function assetRoute(pathname) {
  if (ASSET_ROUTES[pathname]) return { ...ASSET_ROUTES[pathname], gatePath: pathname };
  const content = pathname.match(/^\/v1\/sync\/assets\/([0-9a-f-]{36})\/content$/u);
  if (content) return { ...ASSET_ROUTES.content, gatePath: '/v1/sync/assets/content', assetId: content[1] };
  const download = pathname.match(/^\/v1\/sync\/assets\/([0-9a-f-]{36})$/u);
  if (download) return { ...ASSET_ROUTES.download, gatePath: '/v1/sync/assets/download', assetId: download[1] };
  return null;
}

async function assetContext(request, env, dependencies) {
  const context = await authenticatedContext(request, env, 'port', dependencies);
  if (context.error) return context;
  if (!context.authority || context.authority.accountState !== 'active' ||
      context.authority.membershipState !== 'active' || context.authority.datasetState !== 'ready') {
    return { error: 'asset_membership_unavailable', status: 409 };
  }
  return context;
}

async function fingerprintAsset(input) {
  return sha256Hex(new TextEncoder().encode(JSON.stringify([
    input.assetId, input.operationId, input.kind, input.hash, input.mime,
    input.byteSize, input.width, input.height, input.storageCategory,
    input.ownerRecordType || null, input.ownerRecordId || null, input.originalFilename || null
  ])));
}

function assetRepository(context, dependencies) {
  return (dependencies.createAssetRepository || createD1AssetRepository)(context.session);
}

function encodeContentDispositionFilename(value) {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function handleAssetPrepare(request, env, origin, route, dependencies) {
  if (!assetFeatureEnabled(env, 'SYNC_ASSET_WRITE_ENABLED')) {
    return errorResponse(503, 'asset_writes_disabled', origin, route);
  }
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const input = validateAssetPrepare(parsed.value);
  if (!input) return errorResponse(400, 'asset_invalid', origin, route);
  let context;
  try { context = await assetContext(request, env, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const result = await assetRepository(context, dependencies).prepare(context.identity, context.authority, {
      ...input, fingerprint: await fingerprintAsset(input),
      objectKey: `assets/${context.authority.accountId}/${context.identity.userId}/${input.assetId}/${input.kind}`,
      now: Date.now()
    });
    if (result.status === 'quota') return errorResponse(409, 'asset_quota_exceeded', origin, route);
    if (result.status === 'practice_limit') return errorResponse(409, 'practice_attachment_limit_exceeded', origin, route);
    if (result.status === 'relation_missing') return errorResponse(409, 'practice_relation_missing', origin, route);
    if (result.status === 'account_rate_limited' || result.status === 'global_rate_limited') {
      return errorResponse(429, result.status, origin, route, { 'Retry-After': '86400' });
    }
    if (result.status === 'global_guard') return errorResponse(503, 'asset_uploads_stopped', origin, route);
    if (result.status === 'conflict') return errorResponse(409, 'asset_operation_conflict', origin, route);
    return jsonResponse(result.status === 'prepared' ? 201 : 200, {
      ok: true, phase: result.status, asset: result.asset, storageGuard: result.storageGuard || 'normal'
    }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch { return errorResponse(503, 'server_error', origin, route); }
}

async function handleAssetUpload(request, env, origin, route, dependencies, assetId) {
  if (!assetFeatureEnabled(env, 'SYNC_ASSET_WRITE_ENABLED')) {
    return errorResponse(503, 'asset_writes_disabled', origin, route);
  }
  const operationId = request.headers.get('X-Sound-Cruise-Operation-Id');
  const claimedHash = request.headers.get('X-Content-SHA256');
  let context;
  try { context = await assetContext(request, env, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  if (!env.SYNC_ASSETS?.put) return errorResponse(503, 'asset_storage_unavailable', origin, route);
  try {
    const repository = assetRepository(context, dependencies);
    const target = await repository.uploadTarget(context.identity, context.authority, assetId, operationId);
    if (!target || target.content_hash !== claimedHash) return errorResponse(404, 'asset_not_found', origin, route);
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > Number(target.byte_size) || contentLength > ASSET_KINDS[target.kind].maxBytes) {
      return errorResponse(413, 'asset_too_large', origin, route);
    }
    const buffer = await request.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength !== Number(target.byte_size) || bytes.byteLength > ASSET_KINDS[target.kind].maxBytes) {
      return errorResponse(400, 'asset_size_mismatch', origin, route);
    }
    const detected = inspectAssetContent(bytes, target.kind);
    if (!detected || detected.mime !== target.mime_type || request.headers.get('Content-Type') !== target.mime_type) {
      return errorResponse(415, 'asset_mime_invalid', origin, route);
    }
    if (detected.width !== Number(target.width) || detected.height !== Number(target.height)) {
      return errorResponse(400, 'asset_dimensions_mismatch', origin, route);
    }
    if (await sha256Hex(buffer) !== target.content_hash) return errorResponse(400, 'asset_hash_mismatch', origin, route);
    await env.SYNC_ASSETS.put(target.object_key, buffer, {
      httpMetadata: { contentType: target.mime_type },
      customMetadata: { hash: target.content_hash, assetId: target.asset_id, kind: target.kind }
    });
    const result = await repository.markUploaded(target, Date.now());
    return jsonResponse(200, { ok: true, phase: result.status, asset: result.asset }, origin, route,
      { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
}

async function handleAssetCommit(request, env, origin, route, dependencies) {
  if (!assetFeatureEnabled(env, 'SYNC_ASSET_WRITE_ENABLED')) {
    return errorResponse(503, 'asset_writes_disabled', origin, route);
  }
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const input = validateAssetCommit(parsed.value);
  if (!input) return errorResponse(400, 'asset_invalid', origin, route);
  let context;
  try { context = await assetContext(request, env, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  if (!env.SYNC_ASSETS?.head) return errorResponse(503, 'asset_storage_unavailable', origin, route);
  try {
    const repository = assetRepository(context, dependencies);
    const target = await repository.uploadTarget(context.identity, context.authority, input.assetId, input.operationId);
    if (!target || target.content_hash !== input.hash) return errorResponse(404, 'asset_not_found', origin, route);
    if (target.state !== 'available') {
      const object = await env.SYNC_ASSETS.head(target.object_key);
      if (!object || Number(object.size) !== Number(target.byte_size) || object.customMetadata?.hash !== target.content_hash) {
        return errorResponse(409, 'asset_upload_incomplete', origin, route);
      }
    }
    const result = await repository.commit(context.identity, context.authority, { ...input, now: Date.now() });
    if (result.status !== 'available') return errorResponse(409, `asset_${result.status}`, origin, route);
    return jsonResponse(200, { ok: true, phase: 'available', asset: result.asset }, origin, route,
      { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch { return errorResponse(503, 'server_error', origin, route); }
}

async function handleAssetDownload(request, env, origin, route, dependencies, assetId) {
  if (!assetFeatureEnabled(env, 'SYNC_ASSET_DOWNLOAD_ENABLED')) {
    return errorResponse(503, 'asset_downloads_disabled', origin, route);
  }
  let context;
  try { context = await assetContext(request, env, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  if (!env.SYNC_ASSETS?.get) return errorResponse(503, 'asset_storage_unavailable', origin, route);
  try {
    const row = await assetRepository(context, dependencies).available(context.identity, context.authority, assetId);
    if (!row) return errorResponse(404, 'asset_not_found', origin, route);
    const object = await env.SYNC_ASSETS.get(row.object_key);
    if (!object?.body || Number(object.size) !== Number(row.byte_size) || object.customMetadata?.hash !== row.content_hash) {
      return errorResponse(503, 'asset_unavailable', origin, route);
    }
    const headers = corsHeaders(origin, route);
    headers.set('Content-Type', row.mime_type);
    headers.set('Content-Length', String(row.byte_size));
    headers.set('ETag', `"sha256-${row.content_hash}"`);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Asset-SHA256', row.content_hash);
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeContentDispositionFilename(
      row.original_filename || 'sound-cruise-file'
    )}`);
    return new Response(object.body, { status: 200, headers });
  } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
}

async function handleAssetUnreference(request, env, origin, route, dependencies) {
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const input = validateAssetUnreference(parsed.value);
  if (!input) return errorResponse(400, 'asset_invalid', origin, route);
  let context;
  try { context = await assetContext(request, env, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const changed = await assetRepository(context, dependencies).unreference(
      context.identity, context.authority, input.assetIds, Date.now()
    );
    return jsonResponse(200, { ok: true, unreferenced: changed }, origin, route,
      { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch { return errorResponse(503, 'server_error', origin, route); }
}

async function legacyGuard(session, userId, operation, dependencies) {
  const readPolicy = dependencies.readLegacyAccountPolicy || readLegacyAccountPolicy;
  const decide = dependencies.legacyOperationDecision || legacyOperationDecision;
  return { policy: await readPolicy(session, userId), decision: null, decide };
}

async function requireLegacyOperation(session, userId, operation, dependencies) {
  const result = await legacyGuard(session, userId, operation, dependencies);
  result.decision = result.decide(result.policy, operation);
  return result;
}

async function handleBootstrap(request, env, origin, route, dependencies) {
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateBootstrapPayload(parsed.value, env);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try {
    context = await authenticatedContext(request, env, validation.value.appId, dependencies);
  } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const result = await context.repository.bootstrapDataset(context.identity, validation.value);
    if (result.status === 'forbidden') return errorResponse(409, 'account_membership_required', origin, route);
    if (result.status !== 'ready') return errorResponse(503, 'server_error', origin, route);
    return jsonResponse(result.alreadyCreated ? 200 : 201, {
      ok: true,
      appId: context.identity.appId,
      datasetState: result.dataset.state,
      schemaVersion: Number(result.dataset.schema_version),
      alreadyCreated: result.alreadyCreated
    }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
}

async function handleStart(request, env, origin, route, dependencies, runtimeControl) {
  if (await isRateLimited(env.START_RATE_LIMITER, `sync-start:${requestIp(request)}`)) {
    return errorResponse(429, 'rate_limited', origin, route, { 'Retry-After': '60' });
  }
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateStartPayload(parsed.value, env);
  if (!validation.ok) return errorResponse(400, validation.reason === 'turnstile' ? 'turnstile_failed' : 'invalid_request', origin, route);
  if (!validatePublicAppId(validation.value.appId, env)) {
    return errorResponse(403, 'qa_handoff_required', origin, route);
  }
  // Chord's original standalone admission is frozen while existing authenticated
  // identities keep using the remaining /v1 routes. Account-managed Chord joins
  // are provisioned by the generic /v2 Account flow and never bypass this guard.
  if (validation.value.appId === 'chord' && env.CHORD_LEGACY_NEW_START_ENABLED !== 'true') {
    return errorResponse(423, 'sync_admission_paused', origin, route);
  }
  if (runtimeControl.rolloutMode === 'cohort' && !validation.value.enrollmentCode) {
    return errorResponse(403, 'enrollment_required', origin, route);
  }
  const verify = dependencies.verifyTurnstileToken || verifyTurnstileToken;
  let turnstile;
  try { turnstile = await verify(validation.value.turnstileToken, env); } catch { return errorResponse(503, 'turnstile_failed', origin, route); }
  if (!turnstile.ok) return errorResponse(turnstile.unavailable ? 503 : 403, 'turnstile_failed', origin, route);
  if (!env.SYNC_CREDENTIAL_PEPPER || !env.SYNC_RECOVERY_PEPPER || !env.SYNC_DB ||
      (runtimeControl.rolloutMode === 'cohort' && !env.SYNC_ENROLLMENT_PEPPER)) {
    return errorResponse(503, 'server_unavailable', origin, route);
  }
  let material;
  let recoveryCode;
  let session;
  try {
    session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    material = await (dependencies.createIdentityMaterial || createIdentityMaterial)(env.SYNC_CREDENTIAL_PEPPER);
    recoveryCode = (dependencies.createRecoveryCode || createRecoveryCode)();
    const recoveryVerifier = await (dependencies.recoveryCodeVerifier || recoveryCodeVerifier)(recoveryCode, env.SYNC_RECOVERY_PEPPER);
    const enrollmentVerifier = runtimeControl.rolloutMode === 'cohort'
      ? await (dependencies.enrollmentCodeVerifier || enrollmentCodeVerifier)(
          validation.value.enrollmentCode, env.SYNC_ENROLLMENT_PEPPER
        )
      : null;
    const created = await (dependencies.createProvisioningIdentity || createProvisioningIdentity)(session, {
      userId: material.userId,
      deviceId: material.deviceId,
      credentialVerifier: material.credentialVerifier,
      recoveryVerifier,
      appId: validation.value.appId,
      deviceLabel: validation.value.deviceLabel,
      initialSummary: validation.value.initialSummary,
      enrollmentVerifier,
      now: Date.now()
    });
    if (created?.status === 'enrollment_invalid') {
      return errorResponse(403, 'enrollment_invalid', origin, route);
    }
  } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
  return jsonResponse(201, {
    ok: true,
    appId: validation.value.appId,
    syncState: 'provisioning',
    datasetState: 'initializing',
    deviceId: material.deviceId,
    deviceCredential: material.credential,
    recoveryCode: formatRecoveryCode(recoveryCode),
    recoveryVersion: 1
  }, origin, route, { 'X-D1-Bookmark': sessionBookmark(session) });
}

async function handleRecover(request, env, origin, route, dependencies) {
  if (await isRateLimited(env.RECOVERY_RATE_LIMITER, `recover:${requestIp(request)}`)) {
    return errorResponse(429, 'rate_limited', origin, route, { 'Retry-After': '60' });
  }
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateRecoveryPayload(parsed.value, env);
  if (!validation.ok) {
    return errorResponse(400, validation.reason === 'turnstile' ? 'turnstile_failed' : 'invalid_request', origin, route);
  }
  if (!validatePublicAppId(validation.value.appId, env)) {
    return errorResponse(403, 'qa_handoff_required', origin, route);
  }
  if (!env.SYNC_CREDENTIAL_PEPPER || !env.SYNC_RECOVERY_PEPPER || !env.SYNC_DB) {
    return errorResponse(503, 'server_unavailable', origin, route);
  }
  let session;
  try {
    session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    const repository = (dependencies.createRecoveryRepository || createD1RecoveryRepository)(session);
    if (validation.value.operation === 'prepare') {
      const verify = dependencies.verifyTurnstileToken || verifyTurnstileToken;
      let turnstile;
      try {
        turnstile = await verify(validation.value.turnstileToken, env, {
          expectedAction: env.TURNSTILE_RECOVER_EXPECTED_ACTION || 'sound_cruise_sync_recover'
        });
      } catch {
        return errorResponse(503, 'turnstile_failed', origin, route);
      }
      if (!turnstile.ok) return errorResponse(turnstile.unavailable ? 503 : 403, 'turnstile_failed', origin, route);
      const currentVerifier = await (dependencies.recoveryCodeVerifier || recoveryCodeVerifier)(
        validation.value.recoveryCode, env.SYNC_RECOVERY_PEPPER
      );
      const readPolicyByVerifier = dependencies.readLegacyAccountPolicyByRecoveryVerifier ||
        readLegacyAccountPolicyByRecoveryVerifier;
      const recoveryIdentity = await readPolicyByVerifier(
        session, currentVerifier, validation.value.appId
      );
      if (recoveryIdentity) {
        const decision = (dependencies.legacyOperationDecision || legacyOperationDecision)(
          recoveryIdentity.policy, 'recovery_prepare'
        );
        if (!decision.allowed) return errorResponse(400, 'recovery_invalid', origin, route);
      }
      const attempt = await repository.reserveAttempt(currentVerifier, Date.now());
      if (attempt.status !== 'allowed') return errorResponse(400, 'recovery_invalid', origin, route);
      const nextRecoveryCode = (dependencies.createRecoveryCode || createRecoveryCode)();
      const nextRecoveryVerifier = await (dependencies.recoveryCodeVerifier || recoveryCodeVerifier)(
        nextRecoveryCode, env.SYNC_RECOVERY_PEPPER
      );
      const device = await (dependencies.createIdentityMaterial || createIdentityMaterial)(env.SYNC_CREDENTIAL_PEPPER);
      const claim = await (dependencies.createRecoveryClaim || createRecoveryClaim)(env.SYNC_RECOVERY_PEPPER);
      const prepared = await repository.prepare({
        currentRecoveryVerifier: currentVerifier,
        claimId: claim.claimId,
        claimVerifier: claim.claimVerifier,
        appId: validation.value.appId,
        nextRecoveryVerifier,
        nextDeviceId: device.deviceId,
        nextCredentialVerifier: device.credentialVerifier,
        deviceLabel: validation.value.deviceLabel,
        now: Date.now()
      });
      if (prepared.status !== 'prepared') return errorResponse(400, 'recovery_invalid', origin, route);
      return jsonResponse(200, {
        ok: true,
        operation: 'prepared',
        appId: validation.value.appId,
        claimToken: claim.claimToken,
        expiresAt: prepared.expiresAt,
        deviceId: device.deviceId,
        deviceCredential: device.credential,
        recoveryCode: formatRecoveryCode(nextRecoveryCode),
        summary: prepared.summary
      }, origin, route, { 'X-D1-Bookmark': sessionBookmark(session) });
    }
    let claim;
    try {
      claim = await (dependencies.recoveryClaimVerifier || recoveryClaimVerifier)(
        validation.value.claimToken, env.SYNC_RECOVERY_PEPPER
      );
    } catch {
      return errorResponse(400, 'recovery_invalid', origin, route);
    }
    const claimState = await repository.getClaim(claim.claimId);
    if (!claimState) return errorResponse(400, 'recovery_invalid', origin, route);
    const guard = await requireLegacyOperation(
      session, claimState.user_id, 'recovery_commit', dependencies
    );
    if (!guard.decision.allowed) return errorResponse(400, 'recovery_invalid', origin, route);
    const committed = await repository.commit({
      claimId: claim.claimId,
      claimVerifier: claim.claimVerifier,
      appId: validation.value.appId,
      dualBridge: guard.policy.mode === 'dual' ? {
        accountId: guard.policy.accountId,
        membershipId: guard.policy.membershipId
      } : null,
      now: Date.now()
    });
    if (committed.status !== 'recovered') return errorResponse(400, 'recovery_invalid', origin, route);
    return jsonResponse(200, {
      ok: true,
      operation: 'committed',
      appId: validation.value.appId,
      deviceId: committed.deviceId,
      recoveryVersion: committed.recoveryVersion,
      datasetState: 'remote_pending'
    }, origin, route, { 'X-D1-Bookmark': sessionBookmark(session) });
  } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
}

async function handleRecoveryIssue(request, env, origin, route, dependencies) {
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateRecoveryIssuePayload(parsed.value, env);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_RECOVERY_PEPPER) return errorResponse(503, 'server_unavailable', origin, route);
  let context;
  try { context = await authenticatedContext(request, env, validation.value.appId, dependencies); } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const guard = await requireLegacyOperation(
      context.session, context.identity.userId, 'recovery_issue', dependencies
    );
    if (!guard.decision.allowed) {
      return errorResponse(409, guard.decision.code, origin, route);
    }
    const code = (dependencies.createRecoveryCode || createRecoveryCode)();
    const verifier = await (dependencies.recoveryCodeVerifier || recoveryCodeVerifier)(code, env.SYNC_RECOVERY_PEPPER);
    const repository = (dependencies.createRecoveryRepository || createD1RecoveryRepository)(context.session);
    const rotated = await repository.regenerate(
      context.identity,
      verifier,
      Date.now(),
      guard.policy.mode === 'dual' ? {
        accountId: guard.policy.accountId,
        membershipId: guard.policy.membershipId
      } : null
    );
    if (rotated.status !== 'rotated') return errorResponse(409, 'recovery_rotation_failed', origin, route);
    return jsonResponse(201, {
      ok: true,
      appId: context.identity.appId,
      recoveryCode: formatRecoveryCode(code),
      recoveryVersion: rotated.recoveryVersion
    }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
}

function deviceRepository(session, dependencies) {
  return (dependencies.createDeviceRepository || createD1DeviceRepository)(session);
}

async function handleDevices(request, env, origin, route, dependencies, url) {
  const query = validateReadQuery(url, env, false);
  if (!query.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await authenticatedContext(request, env, query.appId, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const devices = await deviceRepository(context.session, dependencies).list(context.identity);
    return jsonResponse(200, { ok: true, appId: context.identity.appId, devices }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch { return errorResponse(503, 'server_error', origin, route); }
}

async function handleDeviceRevoke(request, env, origin, route, dependencies) {
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateDeviceRevokePayload(parsed.value, env);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await authenticatedContext(request, env, validation.value.appId, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const result = await deviceRepository(context.session, dependencies).revoke(context.identity, validation.value.deviceId, Date.now());
    if (result.status === 'not_found') return errorResponse(404, 'device_not_found', origin, route);
    return jsonResponse(200, { ok: true, appId: context.identity.appId, deviceId: result.deviceId, revoked: true, isCurrent: result.isCurrent }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch { return errorResponse(503, 'server_error', origin, route); }
}

async function handleDeleteIntent(request, env, origin, route, dependencies) {
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateDeleteIntentPayload(parsed.value, env);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await authenticatedContext(request, env, validation.value.appId, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const guard = await requireLegacyOperation(
      context.session, context.identity.userId, 'cloud_delete_intent', dependencies
    );
    if (!guard.decision.allowed) {
      return errorResponse(409, guard.decision.code, origin, route);
    }
    const intent = await (dependencies.createDeleteIntent || createDeleteIntent)(env.SYNC_CREDENTIAL_PEPPER);
    const result = await deviceRepository(context.session, dependencies).createDeleteIntent(context.identity, { ...intent, now: Date.now() });
    if (result.status !== 'issued') return errorResponse(409, 'delete_unavailable', origin, route);
    return jsonResponse(201, { ok: true, appId: context.identity.appId, intentToken: intent.intentToken, expiresAt: result.expiresAt }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch { return errorResponse(503, 'server_error', origin, route); }
}

async function handleAccountDelete(request, env, origin, route, dependencies) {
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateAccountDeletePayload(parsed.value, env);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  if (!env.SYNC_CREDENTIAL_PEPPER || !env.SYNC_DB) return errorResponse(503, 'server_unavailable', origin, route);
  let token;
  let session;
  try {
    token = await (dependencies.deleteIntentVerifier || deleteIntentVerifier)(validation.value.intentToken, env.SYNC_CREDENTIAL_PEPPER);
    session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
  } catch { return errorResponse(400, 'invalid_request', origin, route); }
  const repository = deviceRepository(session, dependencies);
  let context;
  try { context = await authenticatedContext(request, env, validation.value.appId, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) {
    // Response loss after the atomic revoke makes normal device auth fail. The
    // short-lived one-time token is the resumable proof and returns no dataset.
    try {
      const state = await repository.resolveDeletedIntent({ ...token, appId: validation.value.appId });
      if (state.status === 'deleted') return jsonResponse(200, { ok: true, appId: validation.value.appId, deleted: true, alreadyDeleted: true }, origin, route, { 'X-D1-Bookmark': sessionBookmark(session) });
    } catch { return errorResponse(503, 'server_error', origin, route); }
    return errorResponse(context.status, context.error, origin, route);
  }
  try {
    const guard = await requireLegacyOperation(
      context.session, context.identity.userId, 'cloud_delete_commit', dependencies
    );
    if (!guard.decision.allowed) {
      return errorResponse(409, guard.decision.code, origin, route);
    }
    const result = await repository.deleteAccount(context.identity, { ...token, now: Date.now() });
    if (result.status === 'expired') return errorResponse(409, 'delete_intent_expired', origin, route);
    if (result.status !== 'deleted') return errorResponse(400, 'delete_invalid', origin, route);
    return jsonResponse(200, { ok: true, appId: context.identity.appId, deleted: true, purgeAfter: result.purgeAfter || null }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch { return errorResponse(503, 'server_error', origin, route); }
}

function pairingError(status, result, origin, route) {
  const codes = {
    invalid: 'pairing_invalid',
    used: 'pairing_already_used',
    expired: 'pairing_expired',
    cancelled: 'pairing_cancelled',
    attempts_exhausted: 'pairing_attempts_exhausted',
    device_limit: 'device_limit',
    code_limit: 'pairing_code_limit'
  };
  return errorResponse(status, codes[result] || 'pairing_invalid', origin, route);
}

async function handlePairingIssue(request, env, origin, route, dependencies) {
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validatePairingIssuePayload(parsed.value, env);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await authenticatedContext(request, env, validation.value.appId, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  if (await isRateLimited(env.PAIRING_ISSUE_RATE_LIMITER, `pairing-issue:${context.identity.deviceId}`)) {
    return errorResponse(429, 'rate_limited', origin, route, { 'Retry-After': '600' });
  }
  if (!env.SYNC_PAIRING_CODE_PEPPER) return errorResponse(503, 'server_unavailable', origin, route);
  try {
    const code = (dependencies.createPairingCode || createPairingCode)();
    const verifier = await (dependencies.pairingCodeVerifier || pairingCodeVerifier)(code, env.SYNC_PAIRING_CODE_PEPPER);
    const repository = (dependencies.createPairingRepository || createD1PairingRepository)(context.session);
    const issued = await repository.issue(context.identity, {
      codeVerifier: verifier,
      ttlMs: 10 * 60 * 1000,
      windowMs: 10 * 60 * 1000,
      now: Date.now()
    });
    if (issued.status !== 'issued') return pairingError(issued.status === 'rate_limited' ? 429 : 409, issued.status, origin, route);
    return jsonResponse(201, {
      ok: true,
      appId: context.identity.appId,
      pairingCode: code,
      expiresAt: issued.expiresAt
    }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
}

async function handlePair(request, env, origin, route, dependencies) {
  if (await isRateLimited(env.PAIR_RATE_LIMITER, `pair:${requestIp(request)}`)) {
    return errorResponse(429, 'rate_limited', origin, route, { 'Retry-After': '60' });
  }
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validatePairPayload(parsed.value, env);
  if (!validation.ok) return errorResponse(400, validation.reason === 'turnstile' ? 'turnstile_failed' : 'invalid_request', origin, route);
  if (!validatePublicAppId(validation.value.appId, env)) {
    return errorResponse(403, 'qa_handoff_required', origin, route);
  }
  const verify = dependencies.verifyTurnstileToken || verifyTurnstileToken;
  let turnstile;
  try {
    turnstile = await verify(validation.value.turnstileToken, env, {
      expectedAction: env.TURNSTILE_PAIR_EXPECTED_ACTION || 'sound_cruise_sync_pair'
    });
  } catch { return errorResponse(503, 'turnstile_failed', origin, route); }
  if (!turnstile.ok) return errorResponse(turnstile.unavailable ? 503 : 403, 'turnstile_failed', origin, route);
  if (!env.SYNC_CREDENTIAL_PEPPER || !env.SYNC_PAIRING_CODE_PEPPER || !env.SYNC_DB) {
    return errorResponse(503, 'server_unavailable', origin, route);
  }
  let session;
  try {
    session = createSession(env, request);
    if (!session) return errorResponse(400, 'invalid_bookmark', origin, route);
    const verifier = await (dependencies.pairingCodeVerifier || pairingCodeVerifier)(validation.value.pairingCode, env.SYNC_PAIRING_CODE_PEPPER);
    const repository = (dependencies.createPairingRepository || createD1PairingRepository)(session);
    const attempt = await repository.reserveAttempt(verifier, Date.now());
    if (attempt.status !== 'allowed') return pairingError(400, attempt.status, origin, route);
    const material = await (dependencies.createIdentityMaterial || createIdentityMaterial)(env.SYNC_CREDENTIAL_PEPPER);
    const paired = await repository.consume(material, {
      codeVerifier: verifier,
      appId: validation.value.appId,
      deviceLabel: validation.value.deviceLabel,
      now: Date.now()
    });
    if (paired.status !== 'paired') return pairingError(paired.status === 'device_limit' ? 409 : 400, paired.status, origin, route);
    return jsonResponse(201, {
      ok: true,
      appId: validation.value.appId,
      syncState: 'paired_pending',
      datasetState: 'remote_pending',
      deviceId: material.deviceId,
      deviceCredential: material.credential
    }, origin, route, { 'X-D1-Bookmark': sessionBookmark(session) });
  } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
}

async function handlePush(request, env, origin, route, dependencies) {
  const parsed = await readJson(request, MAX_PUSH_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = await validatePushPayload(parsed.value, env);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await authenticatedContext(request, env, validation.value.appId, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  let dataset;
  try { dataset = await context.repository.getDataset(context.identity.userId, context.identity.appId); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (!dataset) return errorResponse(409, 'dataset_missing', origin, route);
  if (dataset.state === 'initializing' && validation.value.mode !== 'migration') {
    return errorResponse(409, 'migration_required', origin, route);
  }
  const results = [];
  try {
    for (const item of validation.value.operations) {
      if (!item.ok) {
        results.push({ index: item.index, operationId: item.operationId, status: 'invalid', code: item.code });
        continue;
      }
      const result = await context.repository.applyOperation(context.identity, item.operation);
      results.push({
        index: item.index,
        operationId: item.operation.operationId,
        status: result.status,
        code: result.code,
        record: publicRecord(result.record)
      });
    }
  } catch {
    return errorResponse(503, 'server_error', origin, route);
  }
  return jsonResponse(200, { ok: true, appId: context.identity.appId, results }, origin, route, {
    'X-D1-Bookmark': sessionBookmark(context.session)
  });
}

async function handleChanges(request, env, origin, route, dependencies, url) {
  const query = validateReadQuery(url, env, true);
  if (!query.ok) return errorResponse(400, 'invalid_request', origin, route);
  const sequence = decodeCursor(query.cursor);
  if (sequence === null) return errorResponse(400, 'invalid_cursor', origin, route);
  let context;
  try { context = await authenticatedContext(request, env, query.appId, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  let dataset;
  try { dataset = await context.repository.getDataset(context.identity.userId, context.identity.appId); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (!dataset || dataset.state !== 'ready') return errorResponse(409, 'dataset_not_ready', origin, route);
  if (sequence < dataset.min_change_seq) return errorResponse(409, 'cursor_expired', origin, route);
  let page;
  try { page = await context.repository.listChanges(context.identity, sequence, 100); } catch { return errorResponse(503, 'server_error', origin, route); }
  const changes = page.changes.map(publicRecord);
  const nextSequence = changes.length ? changes[changes.length - 1].changeSeq : sequence;
  return jsonResponse(200, {
    ok: true,
    appId: context.identity.appId,
    changes,
    nextCursor: encodeCursor(nextSequence),
    hasMore: page.hasMore
  }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
}

async function handleSnapshot(request, env, origin, route, dependencies, url) {
  const query = validateReadQuery(url, env, false);
  if (!query.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await authenticatedContext(request, env, query.appId, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  let snapshot;
  try { snapshot = await context.repository.readSnapshot(context.identity); } catch { return errorResponse(503, 'server_error', origin, route); }
  const records = snapshot.records.map((record) => {
    const value = publicRecord(record);
    if (snapshot.dataset.state === 'initializing') {
      value.ownedByCurrentDevice = record.updatedByDeviceId === context.identity.deviceId;
    }
    return value;
  });
  return jsonResponse(200, {
    ok: true,
    appId: context.identity.appId,
    datasetState: snapshot.dataset.state,
    schemaVersion: snapshot.dataset.schema_version,
    recordCount: snapshot.recordCount,
    manifestHash: snapshot.manifestHash,
    cursor: encodeCursor(snapshot.dataset.last_change_seq),
    records
  }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
}

async function handleRemovalSafety(request, env, origin, route, dependencies) {
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const value = parsed.value;
  if (!value || typeof value !== 'object' || !['clean', 'pending', 'attention', 'error'].includes(value.state) ||
      typeof value.appId !== 'string' || Object.keys(value).some((key) => !['appId', 'state', 'attentionCount'].includes(key)) ||
      (value.attentionCount !== undefined && (!Number.isSafeInteger(value.attentionCount) ||
        value.attentionCount < 0 || value.attentionCount > 10000))) {
    return errorResponse(400, 'invalid_request', origin, route);
  }
  let context;
  try { context = await authenticatedContext(request, env, value.appId, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  try {
    const result = await context.repository.reportRemovalSafety(context.identity, context.authority,
      value.state, value.state === 'attention' ? value.attentionCount || 0 : 0);
    if (result.status !== 'reported') return errorResponse(409, 'sync_safety_unavailable', origin, route);
    return jsonResponse(200, { ok: true }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
  } catch { return errorResponse(503, 'server_error', origin, route); }
}

async function handleMigrationComplete(request, env, origin, route, dependencies) {
  const parsed = await readJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.code, origin, route);
  const validation = validateMigrationCompletePayload(parsed.value, env);
  if (!validation.ok) return errorResponse(400, 'invalid_request', origin, route);
  let context;
  try { context = await authenticatedContext(request, env, validation.value.appId, dependencies); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (context.error) return errorResponse(context.status, context.error, origin, route);
  let result;
  try { result = await context.repository.completeMigration(context.identity, validation.value); } catch { return errorResponse(503, 'server_error', origin, route); }
  if (result.status === 'mismatch') {
    return jsonResponse(409, {
      ok: false,
      code: 'manifest_mismatch',
      serverRecordCount: result.snapshot.recordCount,
      serverManifestHash: result.snapshot.manifestHash
    }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
  }
  if (result.status === 'retry') return errorResponse(409, 'migration_retry', origin, route);
  return jsonResponse(200, {
    ok: true,
    appId: context.identity.appId,
    datasetState: 'ready',
    recordCount: result.snapshot.recordCount,
    manifestHash: result.snapshot.manifestHash,
    cursor: encodeCursor(result.snapshot.dataset.last_change_seq)
  }, origin, route, { 'X-D1-Bookmark': sessionBookmark(context.session) });
}

export async function handleRequest(request, env = {}, _ctx, dependencies = {}) {
  const url = new URL(request.url);
  if (url.pathname === '/health') {
    if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', null, null, { Allow: 'GET' });
    return jsonResponse(200, { ok: true, service: 'sound-cruise-sync', phase: 'p-roll-2b' });
  }
  if (url.pathname === '/v2/accounts' || url.pathname.startsWith('/v2/accounts/')) {
    return handleAccountApiRequest(request, env, _ctx, dependencies);
  }
  const resolvedAssetRoute = assetRoute(url.pathname);
  const route = ROUTES[url.pathname] || resolvedAssetRoute;
  if (!route) return errorResponse(404, 'not_found');
  const origin = requestOrigin(request, env);
  const originAllowed = Boolean(origin && configuredOrigins(env).has(origin));
  if (request.method === 'OPTIONS') {
    if (!originAllowed) return errorResponse(403, 'invalid_origin');
    const requestedMethod = request.headers.get('Access-Control-Request-Method');
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
      .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
    if (requestedMethod !== route.method ||
        requestedHeaders.some((header) => ![...route.headers, QA_HEADER].includes(header))) {
      return errorResponse(403, 'invalid_origin', origin, route);
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin, route) });
  }
  if (request.method !== route.method) {
    return errorResponse(405, 'method_not_allowed', originAllowed ? origin : null, originAllowed ? route : null, { Allow: `${route.method}, OPTIONS` });
  }
  if (!originAllowed) return errorResponse(403, 'invalid_origin');
  if ((route.method === 'POST' || route.method === 'DELETE') && !isJsonContentType(request.headers.get('Content-Type'))) {
    return errorResponse(415, 'invalid_content_type', origin, route);
  }
  const runtimeReader = dependencies.readRuntimeControl || readRuntimeControl;
  let runtimeControl = null;
  try { runtimeControl = await runtimeReader(env.SYNC_DB); } catch {}
  const gate = gateDecision(resolvedAssetRoute?.gatePath || url.pathname, runtimeControl);
  if (!gate.allowed) return errorResponse(gate.status, gate.code, origin, route);
  if (url.pathname !== '/v1/sync/start' && await isRateLimited(env.SYNC_RATE_LIMITER, `sync-api:${requestIp(request)}`)) {
    return errorResponse(429, 'rate_limited', origin, route, { 'Retry-After': '60' });
  }
  if (url.pathname === '/v1/sync/start') return handleStart(request, env, origin, route, dependencies, runtimeControl);
  if (url.pathname === '/v1/sync/bootstrap') return handleBootstrap(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/pairing-codes') return handlePairingIssue(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/pair') return handlePair(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/recover') return handleRecover(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/recovery-codes') return handleRecoveryIssue(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/devices') return handleDevices(request, env, origin, route, dependencies, url);
  if (url.pathname === '/v1/sync/devices/revoke') return handleDeviceRevoke(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/account/delete-intent') return handleDeleteIntent(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/account') return handleAccountDelete(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/push') return handlePush(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/changes') return handleChanges(request, env, origin, route, dependencies, url);
  if (url.pathname === '/v1/sync/snapshot') return handleSnapshot(request, env, origin, route, dependencies, url);
  if (url.pathname === '/v1/sync/removal-safety') return handleRemovalSafety(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/assets/prepare') return handleAssetPrepare(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/assets/commit') return handleAssetCommit(request, env, origin, route, dependencies);
  if (url.pathname === '/v1/sync/assets/unreference') return handleAssetUnreference(request, env, origin, route, dependencies);
  if (resolvedAssetRoute?.method === 'PUT') {
    return handleAssetUpload(request, env, origin, route, dependencies, resolvedAssetRoute.assetId);
  }
  if (resolvedAssetRoute?.method === 'GET') {
    return handleAssetDownload(request, env, origin, route, dependencies, resolvedAssetRoute.assetId);
  }
  return handleMigrationComplete(request, env, origin, route, dependencies);
}

export async function handleScheduled(_event, env = {}, dependencies = {}) {
  if (!env.SYNC_DB || typeof env.SYNC_DB.prepare !== 'function') return;
  if (assetFeatureEnabled(env, 'SYNC_ASSET_CLEANUP_ENABLED') && env.SYNC_ASSETS?.delete) {
    try {
      const assets = (dependencies.createAssetRepository || createD1AssetRepository)(env.SYNC_DB);
      const now = Date.now();
      const candidates = await assets.cleanupCandidates(
        now, 30 * 24 * 60 * 60 * 1000, 24 * 60 * 60 * 1000, 100
      );
      for (const asset of candidates) {
        if (asset.state === 'unreferenced' && await assets.isReferenced(asset)) {
          await assets.restoreReferenced(asset.asset_id, now);
          continue;
        }
        await env.SYNC_ASSETS.delete(asset.object_key);
        await assets.markDeleted(asset.asset_id, now);
      }
    } catch {
      // Asset cleanup is eventual and must never interrupt established D1 cleanup.
    }
  }
  const repository = (dependencies.createCleanupRepository || createD1CleanupRepository)(env.SYNC_DB);
  await repository.cleanup(Date.now());
}
