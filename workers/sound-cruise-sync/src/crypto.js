const DEVICE_SECRET_BYTES = 32;
const CREDENTIAL_PREFIX = 'scd1';
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
