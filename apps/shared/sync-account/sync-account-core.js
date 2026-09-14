(function installSyncAccountCore(global) {
  'use strict';

  const root = global.SoundCruiseSyncAccount = global.SoundCruiseSyncAccount || {};
  const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const RECOVERY_PREFIX = 'SAR1';
  const JOIN_PREFIX = 'SCJ1';
  const JOIN_BODY_LENGTH = 20;
  const SECRET_BYTES = 32;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TOKEN_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

  function randomUuid(cryptoImpl) {
    if (cryptoImpl && typeof cryptoImpl.randomUUID === 'function') return cryptoImpl.randomUUID();
    if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
      throw new Error('secure_random_unavailable');
    }
    const bytes = new Uint8Array(16);
    cryptoImpl.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function base64Url(bytes, btoaImpl) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoaImpl(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function createCredential(prefix, cryptoImpl, btoaImpl) {
    const id = randomUuid(cryptoImpl);
    const bytes = new Uint8Array(SECRET_BYTES);
    cryptoImpl.getRandomValues(bytes);
    return { id, value: `${prefix}.${id}.${base64Url(bytes, btoaImpl)}` };
  }

  function validToken(value, prefix) {
    if (typeof value !== 'string') return false;
    const parts = value.split('.');
    return parts.length === 3 && parts[0] === prefix &&
      UUID_PATTERN.test(parts[1]) && TOKEN_SECRET_PATTERN.test(parts[2]);
  }

  function createAccountMaterial(cryptoImpl = global.crypto, btoaImpl = global.btoa.bind(global)) {
    const account = createCredential('sca1', cryptoImpl, btoaImpl);
    const recovery = new Uint8Array(20);
    cryptoImpl.getRandomValues(recovery);
    return Object.freeze({
      operationId: randomUuid(cryptoImpl),
      accountDeviceId: account.id,
      accountCredential: account.value,
      recoveryCode: RECOVERY_PREFIX +
        Array.from(recovery, (value) => RECOVERY_ALPHABET[value & 31]).join('')
    });
  }

  function createAccountCredential(cryptoImpl = global.crypto, btoaImpl = global.btoa.bind(global)) {
    const account = createCredential('sca1', cryptoImpl, btoaImpl);
    return Object.freeze({ accountDeviceId: account.id, accountCredential: account.value });
  }

  function createAccountRecoveryMaterial(cryptoImpl = global.crypto, btoaImpl = global.btoa.bind(global)) {
    const claim = createCredential('sarc1', cryptoImpl, btoaImpl);
    const account = createCredential('sca1', cryptoImpl, btoaImpl);
    const recovery = new Uint8Array(20);
    cryptoImpl.getRandomValues(recovery);
    return Object.freeze({
      prepareOperationId: randomUuid(cryptoImpl),
      commitOperationId: randomUuid(cryptoImpl),
      claimId: claim.id,
      claimToken: claim.value,
      accountDeviceId: account.id,
      accountCredential: account.value,
      nextRecoveryCode: RECOVERY_PREFIX +
        Array.from(recovery, (value) => RECOVERY_ALPHABET[value & 31]).join('')
    });
  }

  function createAccountDeleteMaterial(cryptoImpl = global.crypto, btoaImpl = global.btoa.bind(global)) {
    const intent = createCredential('sadi1', cryptoImpl, btoaImpl);
    return Object.freeze({
      issueOperationId: randomUuid(cryptoImpl),
      commitOperationId: randomUuid(cryptoImpl),
      intentId: intent.id,
      intentToken: intent.value
    });
  }

  function createAppCredential(cryptoImpl = global.crypto, btoaImpl = global.btoa.bind(global)) {
    const app = createCredential('scd1', cryptoImpl, btoaImpl);
    return Object.freeze({ appDeviceId: app.id, appDeviceCredential: app.value });
  }

  function createQaCredential(cryptoImpl = global.crypto, btoaImpl = global.btoa.bind(global)) {
    const qa = createCredential('scq1', cryptoImpl, btoaImpl);
    return Object.freeze({ qaSessionId: qa.id, qaCredential: qa.value });
  }

  function createHandoffMaterial(cryptoImpl = global.crypto, btoaImpl = global.btoa.bind(global)) {
    const handoff = createCredential('sch1', cryptoImpl, btoaImpl);
    return Object.freeze({
      operationId: randomUuid(cryptoImpl),
      handoffId: handoff.id,
      handoffToken: handoff.value
    });
  }

  function normalizeJoinCode(value) {
    if (typeof value !== 'string') return null;
    const compact = value.toUpperCase().replace(/[\s-]/g, '');
    if (!compact.startsWith(JOIN_PREFIX) || compact.length !== JOIN_PREFIX.length + JOIN_BODY_LENGTH) return null;
    const body = compact.slice(JOIN_PREFIX.length);
    return [...body].every((character) => RECOVERY_ALPHABET.includes(character)) ? compact : null;
  }

  function formatJoinCode(value) {
    const compact = normalizeJoinCode(value);
    if (!compact) return null;
    return `${JOIN_PREFIX}-${compact.slice(4).match(/.{4}/g).join('-')}`;
  }

  function createJoinMaterial(cryptoImpl = global.crypto) {
    const bytes = new Uint8Array(JOIN_BODY_LENGTH);
    cryptoImpl.getRandomValues(bytes);
    return Object.freeze({
      operationId: randomUuid(cryptoImpl),
      invitationId: randomUuid(cryptoImpl),
      joinCode: JOIN_PREFIX + Array.from(bytes, (value) => RECOVERY_ALPHABET[value & 31]).join('')
    });
  }

  function formatRecoveryCode(value) {
    if (typeof value !== 'string') return null;
    const compact = value.toUpperCase().replace(/[\s-]/g, '');
    if (!compact.startsWith(RECOVERY_PREFIX) || compact.length !== 24) return null;
    const body = compact.slice(4);
    if ([...body].some((character) => !RECOVERY_ALPHABET.includes(character))) return null;
    return `${RECOVERY_PREFIX}-${body.match(/.{4}/g).join('-')}`;
  }

  function createHandoffUrl(appUrl, handoffToken) {
    if (!validToken(handoffToken, 'sch1')) throw new Error('handoff_invalid');
    const url = new URL(appUrl);
    url.hash = `sound-cruise-handoff=${encodeURIComponent(handoffToken)}`;
    return url.toString();
  }

  function takeHandoffFromLocation(locationLike = global.location, historyLike = global.history) {
    const raw = String(locationLike.hash || '').replace(/^#/, '');
    const params = new URLSearchParams(raw);
    const token = params.get('sound-cruise-handoff');
    if (!token) return null;
    const clean = `${locationLike.pathname || '/'}${locationLike.search || ''}`;
    historyLike.replaceState(null, '', clean);
    if (!validToken(token, 'sch1')) throw new Error('handoff_invalid');
    return token;
  }

  const RETRYABLE_SENSITIVE_FAILURES = new Set([
    'network_error', 'network_unavailable', 'invalid_response',
    'account_runtime_unavailable', 'account_server_unavailable',
    'recovery_uncertain', 'remote_post_verify_failed'
  ]);

  function sensitiveFailureIsRetryable(reason) {
    const status = Number(reason?.status);
    const code = reason?.code || reason?.message || '';
    return reason?.retryable === true || status === 429 || status >= 500 ||
      RETRYABLE_SENSITIVE_FAILURES.has(code) ||
      (reason?.name === 'TypeError' && reason?.code == null);
  }

  function createSensitiveInputController(input) {
    if (!input || typeof input !== 'object') throw new Error('sensitive_input_required');
    let retryValue = null;

    function clearDom() {
      input.value = '';
      if (typeof input.removeAttribute === 'function') input.removeAttribute('value');
    }

    return Object.freeze({
      take() {
        const entered = typeof input.value === 'string' ? input.value.trim() : '';
        if (entered) retryValue = entered;
        clearDom();
        return retryValue;
      },
      resolve() {
        retryValue = null;
        clearDom();
      },
      reject(reason) {
        const retryable = sensitiveFailureIsRetryable(reason);
        if (!retryable) retryValue = null;
        clearDom();
        return retryable;
      },
      hasRetryValue() { return retryValue !== null; }
    });
  }

  root.core = Object.freeze({
    ACCOUNT_API_VERSION: 2,
    ACCOUNT_APPS: Object.freeze(['chord', 'pitch', 'fretboard', 'rhythm']),
    createAccountMaterial,
    createAccountCredential,
    createAccountRecoveryMaterial,
    createAccountDeleteMaterial,
    createAppCredential,
    createQaCredential,
    createHandoffMaterial,
    createJoinMaterial,
    createHandoffUrl,
    formatRecoveryCode,
    formatJoinCode,
    normalizeJoinCode,
    createSensitiveInputController,
    sensitiveFailureIsRetryable,
    takeHandoffFromLocation,
    validAccountCredential: (value) => validToken(value, 'sca1'),
    validAccountRecoveryClaim: (value) => validToken(value, 'sarc1'),
    validAccountDeleteIntent: (value) => validToken(value, 'sadi1'),
    validAppCredential: (value) => validToken(value, 'scd1'),
    validQaCredential: (value) => validToken(value, 'scq1'),
    validHandoffToken: (value) => validToken(value, 'sch1'),
    validJoinCode: (value) => normalizeJoinCode(value) !== null,
    createOperationId: (cryptoImpl = global.crypto) => randomUuid(cryptoImpl)
  });
})(globalThis);
