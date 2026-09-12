const DEVICE_SECRET_BYTES = 32;
const CREDENTIAL_PREFIX = 'scd1';
const PAIRING_CODE_RANGE = 100000000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hmacVerifier(value, pepper, cryptoImpl = crypto) {
  if (typeof pepper !== 'string' || pepper.length < 32) throw new Error('Credential pepper is unavailable');
  const encoder = new TextEncoder();
  const key = await cryptoImpl.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await cryptoImpl.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

export async function createIdentityMaterial(pepper, cryptoImpl = crypto) {
  const userId = cryptoImpl.randomUUID();
  const deviceId = cryptoImpl.randomUUID();
  const secretBytes = new Uint8Array(DEVICE_SECRET_BYTES);
  cryptoImpl.getRandomValues(secretBytes);
  const secret = toBase64Url(secretBytes);
  const credential = `${CREDENTIAL_PREFIX}.${deviceId}.${secret}`;
  return {
    userId,
    deviceId,
    credential,
    credentialVerifier: await hmacVerifier(credential, pepper, cryptoImpl)
  };
}

export function normalizePairingCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\s-]/g, '');
  return /^\d{8}$/.test(normalized) ? normalized : null;
}

export function formatPairingCode(value) {
  const normalized = normalizePairingCode(value);
  return normalized ? `${normalized.slice(0, 4)} ${normalized.slice(4)}` : null;
}

// Rejection sampling avoids the modulo bias that an eight-digit code would get
// from directly reducing a 32-bit random value.
export function createPairingCode(cryptoImpl = crypto) {
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
    throw new Error('Secure random source is unavailable');
  }
  const ceiling = Math.floor(0x100000000 / PAIRING_CODE_RANGE) * PAIRING_CODE_RANGE;
  const value = new Uint32Array(1);
  do {
    cryptoImpl.getRandomValues(value);
  } while (value[0] >= ceiling);
  return String(value[0] % PAIRING_CODE_RANGE).padStart(8, '0');
}

export async function pairingCodeVerifier(code, pepper, cryptoImpl = crypto) {
  const normalized = normalizePairingCode(code);
  if (!normalized) throw new Error('Invalid pairing code');
  return hmacVerifier(`sound-cruise-pairing:v1:${normalized}`, pepper, cryptoImpl);
}

export function parseDeviceCredential(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== CREDENTIAL_PREFIX || !UUID_PATTERN.test(parts[1]) ||
      !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return null;
  return { version: 1, deviceId: parts[1], secret: parts[2] };
}

export function timingSafeHexEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const max = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < max; index += 1) {
    difference |= (left.charCodeAt(index % (left.length || 1)) || 0) ^
      (right.charCodeAt(index % (right.length || 1)) || 0);
  }
  return difference === 0;
}
