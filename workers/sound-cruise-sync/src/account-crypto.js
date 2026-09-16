import { hmacVerifier, parseDeviceCredential } from './crypto.js';

const SECRET_BYTES = 32;
const ACCOUNT_CREDENTIAL_PREFIX = 'sca1';
const HANDOFF_PREFIX = 'sch1';
const ACCOUNT_RECOVERY_PREFIX = 'SAR1';
const ACCOUNT_RECOVERY_CLAIM_PREFIX = 'sarc1';
const ACCOUNT_DELETE_INTENT_PREFIX = 'sadi1';
const ACCOUNT_RECOVERY_LENGTH = 20;
const APP_JOIN_CODE_PREFIX = 'SCJ1';
const APP_JOIN_CODE_LENGTH = 20;
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createToken(prefix, cryptoImpl = crypto) {
  if (!cryptoImpl || typeof cryptoImpl.randomUUID !== 'function' ||
      typeof cryptoImpl.getRandomValues !== 'function') {
    throw new Error('Secure random source is unavailable');
  }
  const id = cryptoImpl.randomUUID();
  const secret = new Uint8Array(SECRET_BYTES);
  cryptoImpl.getRandomValues(secret);
  return { id, token: `${prefix}.${id}.${toBase64Url(secret)}` };
}

function parseToken(value, prefix) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== prefix ||
      !UUID_PATTERN.test(parts[1]) || !SECRET_PATTERN.test(parts[2])) return null;
  return { id: parts[1], secret: parts[2] };
}

export function createAccountCredential(cryptoImpl = crypto) {
  const material = createToken(ACCOUNT_CREDENTIAL_PREFIX, cryptoImpl);
  return { deviceId: material.id, credential: material.token };
}

export function parseAccountCredential(value) {
  const parsed = parseToken(value, ACCOUNT_CREDENTIAL_PREFIX);
  return parsed ? { version: 1, deviceId: parsed.id, secret: parsed.secret } : null;
}

export async function accountCredentialVerifier(value, pepper, cryptoImpl = crypto) {
  if (!parseAccountCredential(value)) throw new Error('Invalid Account credential');
  return hmacVerifier(`sound-cruise-account-credential:v1:${value}`, pepper, cryptoImpl);
}

export function createAccountHandoff(cryptoImpl = crypto) {
  const material = createToken(HANDOFF_PREFIX, cryptoImpl);
  return { handoffId: material.id, handoffToken: material.token };
}

export function parseAccountHandoff(value) {
  const parsed = parseToken(value, HANDOFF_PREFIX);
  return parsed ? { version: 1, handoffId: parsed.id, secret: parsed.secret } : null;
}

export async function accountHandoffVerifier(value, pepper, cryptoImpl = crypto) {
  if (!parseAccountHandoff(value)) throw new Error('Invalid Account handoff');
  return hmacVerifier(`sound-cruise-account-handoff:v1:${value}`, pepper, cryptoImpl);
}

export function normalizeAppJoinCode(value) {
  if (typeof value !== 'string') return null;
  const compact = value.toUpperCase().replace(/[\s-]/g, '');
  if (!compact.startsWith(APP_JOIN_CODE_PREFIX)) return null;
  const code = compact.slice(APP_JOIN_CODE_PREFIX.length);
  if (code.length !== APP_JOIN_CODE_LENGTH) return null;
  for (const character of code) {
    if (!RECOVERY_ALPHABET.includes(character)) return null;
  }
  return `${APP_JOIN_CODE_PREFIX}${code}`;
}

export function formatAppJoinCode(value) {
  const normalized = normalizeAppJoinCode(value);
  if (!normalized) return null;
  const code = normalized.slice(APP_JOIN_CODE_PREFIX.length);
  return `${APP_JOIN_CODE_PREFIX}-${code.match(/.{4}/g).join('-')}`;
}

export function createAppJoinCode(cryptoImpl = crypto) {
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
    throw new Error('Secure random source is unavailable');
  }
  const random = new Uint8Array(APP_JOIN_CODE_LENGTH);
  cryptoImpl.getRandomValues(random);
  return APP_JOIN_CODE_PREFIX +
    Array.from(random, (value) => RECOVERY_ALPHABET[value & 31]).join('');
}

export async function appJoinCodeVerifier(value, pepper, cryptoImpl = crypto) {
  const normalized = normalizeAppJoinCode(value);
  if (!normalized) throw new Error('Invalid App Join Code');
  return hmacVerifier(`sound-cruise-account-app-join:v1:${normalized}`, pepper, cryptoImpl);
}

export async function portJoinCodeVerifier(value, pepper, cryptoImpl = crypto) {
  const normalized = normalizeAppJoinCode(value);
  if (!normalized) throw new Error('Invalid Port Join Code');
  return hmacVerifier(`sound-cruise-account-port-join:v1:${normalized}`, pepper, cryptoImpl);
}

export function normalizeAccountRecoveryCode(value) {
  if (typeof value !== 'string') return null;
  const compact = value.toUpperCase().replace(/[\s-]/g, '');
  if (!compact.startsWith(ACCOUNT_RECOVERY_PREFIX)) return null;
  const code = compact.slice(ACCOUNT_RECOVERY_PREFIX.length);
  if (code.length !== ACCOUNT_RECOVERY_LENGTH) return null;
  for (const character of code) {
    if (!RECOVERY_ALPHABET.includes(character)) return null;
  }
  return `${ACCOUNT_RECOVERY_PREFIX}${code}`;
}

export function formatAccountRecoveryCode(value) {
  const normalized = normalizeAccountRecoveryCode(value);
  if (!normalized) return null;
  const code = normalized.slice(ACCOUNT_RECOVERY_PREFIX.length);
  return `${ACCOUNT_RECOVERY_PREFIX}-${code.match(/.{4}/g).join('-')}`;
}

export function createAccountRecoveryCode(cryptoImpl = crypto) {
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
    throw new Error('Secure random source is unavailable');
  }
  const random = new Uint8Array(ACCOUNT_RECOVERY_LENGTH);
  cryptoImpl.getRandomValues(random);
  return ACCOUNT_RECOVERY_PREFIX +
    Array.from(random, (value) => RECOVERY_ALPHABET[value & 31]).join('');
}

export async function accountRecoveryCodeVerifier(value, pepper, cryptoImpl = crypto) {
  const normalized = normalizeAccountRecoveryCode(value);
  if (!normalized) throw new Error('Invalid Account Recovery Code');
  return hmacVerifier(`sound-cruise-account-recovery:v1:${normalized}`, pepper, cryptoImpl);
}

export function createAccountRecoveryClaim(cryptoImpl = crypto) {
  const material = createToken(ACCOUNT_RECOVERY_CLAIM_PREFIX, cryptoImpl);
  return { claimId: material.id, claimToken: material.token };
}

export function parseAccountRecoveryClaim(value) {
  const parsed = parseToken(value, ACCOUNT_RECOVERY_CLAIM_PREFIX);
  return parsed ? { version: 1, claimId: parsed.id, secret: parsed.secret } : null;
}

export async function accountRecoveryClaimVerifier(value, pepper, cryptoImpl = crypto) {
  if (!parseAccountRecoveryClaim(value)) throw new Error('Invalid Account Recovery claim');
  return hmacVerifier(`sound-cruise-account-recovery-claim:v1:${value}`, pepper, cryptoImpl);
}

export function createAccountDeleteIntent(cryptoImpl = crypto) {
  const material = createToken(ACCOUNT_DELETE_INTENT_PREFIX, cryptoImpl);
  return { intentId: material.id, intentToken: material.token };
}

export function parseAccountDeleteIntent(value) {
  const parsed = parseToken(value, ACCOUNT_DELETE_INTENT_PREFIX);
  return parsed ? { version: 1, intentId: parsed.id, secret: parsed.secret } : null;
}

export async function accountDeleteIntentVerifier(value, pepper, cryptoImpl = crypto) {
  if (!parseAccountDeleteIntent(value)) throw new Error('Invalid Account delete intent');
  return hmacVerifier(`sound-cruise-account-delete-intent:v1:${value}`, pepper, cryptoImpl);
}

export async function accountManagedRecoveryVerifier(accountVerifier, appId, pepper, cryptoImpl = crypto) {
  if (typeof accountVerifier !== 'string' || !/^[a-f0-9]{64}$/.test(accountVerifier) ||
      !['chord', 'pitch', 'fretboard', 'rhythm'].includes(appId)) {
    throw new Error('Invalid Account membership Recovery input');
  }
  return hmacVerifier(
    `sound-cruise-account-membership-recovery:v1:${appId}:${accountVerifier}`,
    pepper,
    cryptoImpl
  );
}

export function parseAccountAppCredential(value) {
  return parseDeviceCredential(value);
}

export async function accountAppCredentialVerifier(value, pepper, cryptoImpl = crypto) {
  if (!parseAccountAppCredential(value)) throw new Error('Invalid app credential');
  return hmacVerifier(value, pepper, cryptoImpl);
}

export async function accountOperationFingerprint(parts, cryptoImpl = crypto) {
  if (!Array.isArray(parts) || parts.some((part) => typeof part !== 'string')) {
    throw new Error('Invalid operation fingerprint input');
  }
  const encoded = new TextEncoder().encode(parts.map((part) => `${part.length}:${part}`).join('|'));
  const digest = await cryptoImpl.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}

export const ACCOUNT_CRYPTO = Object.freeze({
  ACCOUNT_CREDENTIAL_PREFIX,
  HANDOFF_PREFIX,
  ACCOUNT_RECOVERY_PREFIX,
  ACCOUNT_RECOVERY_LENGTH,
  APP_JOIN_CODE_PREFIX,
  APP_JOIN_CODE_LENGTH,
  ACCOUNT_RECOVERY_CLAIM_PREFIX,
  ACCOUNT_DELETE_INTENT_PREFIX,
  HANDOFF_FRAGMENT_KEY: 'sound-cruise-handoff'
});
