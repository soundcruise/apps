import {
  accountCredentialVerifier,
  parseAccountCredential
} from './account-crypto.js';
import { timingSafeHexEqual } from './crypto.js';

const LAST_SEEN_WRITE_INTERVAL_MS = 60 * 60 * 1000;

export async function authenticateAccountDevice(db, authorization, pepper, now = Date.now()) {
  if (!db || typeof db.prepare !== 'function' || typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ') || typeof pepper !== 'string') return null;
  const credential = authorization.slice(7);
  const parsed = parseAccountCredential(credential);
  if (!parsed) return null;

  let row;
  try {
    row = await db.prepare(`
      SELECT d.id AS device_id, d.account_id, d.credential_version,
             d.credential_verifier, d.last_seen_at, d.revoked_at,
             a.state AS account_state, a.recovery_version, a.generation,
             a.admission_provenance
      FROM sync_account_devices d
      JOIN sync_accounts a ON a.id = d.account_id
      WHERE d.id = ?
    `).bind(parsed.deviceId).first();
  } catch {
    throw new Error('Account authentication database failure');
  }

  const calculated = await accountCredentialVerifier(credential, pepper);
  const verifier = row?.credential_verifier || '0'.repeat(64);
  const matches = timingSafeHexEqual(calculated, verifier);
  if (!row || !matches || row.revoked_at != null || row.account_state !== 'active') return null;

  try {
    if (!Number.isFinite(row.last_seen_at) || now - Number(row.last_seen_at) >= LAST_SEEN_WRITE_INTERVAL_MS) {
      const result = await db.prepare(`
        UPDATE sync_account_devices
        SET last_seen_at = ?
        WHERE id = ? AND account_id = ? AND revoked_at IS NULL AND last_seen_at = ?
      `).bind(now, row.device_id, row.account_id, row.last_seen_at).run();
      if (result?.success === false) throw new Error('Account device touch failed');
    }
  } catch {
    throw new Error('Account authentication database failure');
  }

  return Object.freeze({
    accountId: row.account_id,
    accountDeviceId: row.device_id,
    accountState: row.account_state,
    recoveryVersion: Number(row.recovery_version),
    generation: Number(row.generation),
    admissionProvenance: row.admission_provenance
  });
}
