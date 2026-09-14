import { hmacVerifier } from './crypto.js';

const QA_CREDENTIAL_PREFIX = 'scq1';
const QA_CODE_PREFIX = 'SQA1';
const SECRET_BYTES = 32;
const CODE_BYTES = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const CODE = /^[A-Z2-9]{20}$/;

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createQaCredential(cryptoImpl = crypto) {
  const id = cryptoImpl.randomUUID();
  const bytes = new Uint8Array(SECRET_BYTES);
  cryptoImpl.getRandomValues(bytes);
  return { sessionId: id, credential: `${QA_CREDENTIAL_PREFIX}.${id}.${base64Url(bytes)}` };
}

export function parseQaCredential(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  return parts.length === 3 && parts[0] === QA_CREDENTIAL_PREFIX && UUID.test(parts[1]) && SECRET.test(parts[2])
    ? { version: 1, sessionId: parts[1], secret: parts[2] }
    : null;
}

export async function qaCredentialVerifier(value, pepper, cryptoImpl = crypto) {
  if (!parseQaCredential(value)) throw new Error('Invalid QA credential');
  return hmacVerifier(`sound-cruise-account-qa-credential:v1:${value}`, pepper, cryptoImpl);
}

export function createQaEnrollmentCode(cryptoImpl = crypto) {
  const bytes = new Uint8Array(CODE_BYTES);
  cryptoImpl.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return QA_CODE_PREFIX + Array.from(bytes, (value) => alphabet[value & 31]).join('');
}

export function normalizeQaEnrollmentCode(value) {
  if (typeof value !== 'string') return null;
  const compact = value.toUpperCase().replace(/[\s-]/g, '');
  if (!compact.startsWith(QA_CODE_PREFIX)) return null;
  const code = compact.slice(QA_CODE_PREFIX.length);
  return CODE.test(code) ? compact : null;
}

export function formatQaEnrollmentCode(value) {
  const normalized = normalizeQaEnrollmentCode(value);
  if (!normalized) return null;
  return `${QA_CODE_PREFIX}-${normalized.slice(QA_CODE_PREFIX.length).match(/.{4}/g).join('-')}`;
}

export async function qaEnrollmentCodeVerifier(value, pepper, cryptoImpl = crypto) {
  const normalized = normalizeQaEnrollmentCode(value);
  if (!normalized) throw new Error('Invalid QA enrollment code');
  return hmacVerifier(`sound-cruise-account-qa-enrollment:v1:${normalized}`, pepper, cryptoImpl);
}

export const ACCOUNT_QA = Object.freeze({
  CREDENTIAL_PREFIX: QA_CREDENTIAL_PREFIX,
  CODE_PREFIX: QA_CODE_PREFIX,
  SESSION_TTL_MS: 7 * 24 * 60 * 60 * 1000
});
