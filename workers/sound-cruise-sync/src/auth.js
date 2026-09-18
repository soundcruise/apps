import { hmacVerifier, parseDeviceCredential, timingSafeHexEqual } from './crypto.js';
import { touchAccountActivity } from './account-activity.js';

const LAST_SEEN_WRITE_INTERVAL_MS = 60 * 60 * 1000;

export async function isRetiredLegacyDeviceCredential(db, authorization, expectedAppId, pepper) {
  if (!db || typeof db.prepare !== 'function' || typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ') || typeof pepper !== 'string') return false;
  const credential = authorization.slice(7);
  const parsed = parseDeviceCredential(credential);
  if (!parsed) return false;
  let row = null;
  try {
    row = await db.prepare(`
      SELECT d.app_id, d.credential_verifier, d.revoked_at,
             u.state AS user_state, u.deleted_at,
             EXISTS (
               SELECT 1 FROM sync_account_managed_users am
               WHERE am.sync_user_id = d.user_id
             ) AS account_managed
      FROM sync_devices d
      JOIN sync_users u ON u.id = d.user_id
      WHERE d.id = ?
    `).bind(parsed.deviceId).first();
  } catch {
    throw new Error('Device retirement lookup database failure');
  }
  const calculated = await hmacVerifier(credential, pepper);
  const verifier = row?.credential_verifier || '0'.repeat(64);
  const matches = timingSafeHexEqual(calculated, verifier);
  if (!row || !matches || row.app_id !== expectedAppId || Number(row.account_managed) !== 0) {
    return false;
  }
  return row.revoked_at != null || (row.user_state === 'deleted' && row.deleted_at != null);
}

export async function authenticateDevice(db, authorization, expectedAppId, pepper) {
  const inspected = await inspectDeviceCredential(db, authorization, expectedAppId, pepper);
  return inspected?.identity || null;
}

export async function inspectDeviceCredential(db, authorization, expectedAppId, pepper) {
  if (!db || typeof db.prepare !== 'function' || typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ') || typeof pepper !== 'string') return null;
  const credential = authorization.slice(7);
  const parsed = parseDeviceCredential(credential);
  if (!parsed) return null;
  let row = null;
  try {
    row = await db.prepare(`
      SELECT d.id AS device_id, d.user_id, d.app_id, d.credential_verifier,
             d.revoked_at, d.last_seen_at, d.paired_at, u.state AS user_state,
             a.state AS account_state, am.account_id, m.state AS membership_state
      FROM sync_devices d
      JOIN sync_users u ON u.id = d.user_id
      LEFT JOIN sync_account_managed_users am ON am.sync_user_id = d.user_id
      LEFT JOIN sync_accounts a ON a.id = am.account_id
      LEFT JOIN sync_account_memberships m ON m.id = am.membership_id
      WHERE d.id = ?
    `).bind(parsed.deviceId).first();
  } catch {
    throw new Error('Device authentication database failure');
  }
  const calculated = await hmacVerifier(credential, pepper);
  const verifier = row?.credential_verifier || '0'.repeat(64);
  const matches = timingSafeHexEqual(calculated, verifier);
  if (!row || !matches || row.app_id !== expectedAppId) return null;
  if (row.account_state === 'deleting') return Object.freeze({ error: 'account_deleting' });
  if (row.account_state === 'deleted') return Object.freeze({ error: 'account_deleted' });
  if (row.membership_state === 'deleting') return Object.freeze({ error: 'membership_deleting' });
  if (row.membership_state === 'deleted') return Object.freeze({ error: 'membership_deleted' });
  if (row.revoked_at != null) return Object.freeze({ error: 'app_device_revoked' });
  if (row.user_state === 'deleting') return Object.freeze({ error: 'app_identity_deleting' });
  if (row.user_state === 'deleted') return Object.freeze({ error: 'app_identity_deleted' });
  if (!['provisioning', 'active'].includes(row.user_state)) return null;
  // A paired device becomes claimed only after it presents the returned
  // credential. A lost pair response therefore cannot become a permanent,
  // indistinguishable device record.
  try {
    const now = Date.now();
    const shouldWriteLastSeen = !Number.isFinite(row.last_seen_at) || now - row.last_seen_at >= LAST_SEEN_WRITE_INTERVAL_MS;
    const shouldTouch = row.paired_at == null || shouldWriteLastSeen;
    const claim = await db.prepare(`
      UPDATE sync_devices
      SET last_seen_at = CASE WHEN ? THEN ? ELSE last_seen_at END,
          paired_at = COALESCE(paired_at, ?)
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND ?
    `).bind(shouldWriteLastSeen ? 1 : 0, now, now, row.device_id, row.user_id, shouldTouch ? 1 : 0).run();
    if (claim?.success === false) throw new Error('Device claim failed');
    await touchAccountActivity(db, row.account_id, now);
  } catch {
    throw new Error('Device authentication database failure');
  }
  return Object.freeze({ identity: {
    userId: row.user_id, deviceId: row.device_id, appId: row.app_id, userState: row.user_state
  } });
}
