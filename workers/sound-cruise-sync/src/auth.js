import { hmacVerifier, parseDeviceCredential, timingSafeHexEqual } from './crypto.js';

const LAST_SEEN_WRITE_INTERVAL_MS = 60 * 60 * 1000;

export async function authenticateDevice(db, authorization, expectedAppId, pepper) {
  if (!db || typeof db.prepare !== 'function' || typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ') || typeof pepper !== 'string') return null;
  const credential = authorization.slice(7);
  const parsed = parseDeviceCredential(credential);
  if (!parsed) return null;
  let row = null;
  try {
    row = await db.prepare(`
      SELECT d.id AS device_id, d.user_id, d.app_id, d.credential_verifier,
             d.revoked_at, d.last_seen_at, d.paired_at, u.state AS user_state
      FROM sync_devices d
      JOIN sync_users u ON u.id = d.user_id
      WHERE d.id = ?
    `).bind(parsed.deviceId).first();
  } catch {
    throw new Error('Device authentication database failure');
  }
  const calculated = await hmacVerifier(credential, pepper);
  const verifier = row?.credential_verifier || '0'.repeat(64);
  const matches = timingSafeHexEqual(calculated, verifier);
  if (!row || !matches || row.revoked_at != null || row.app_id !== expectedAppId ||
      !['provisioning', 'active'].includes(row.user_state)) return null;
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
  } catch {
    throw new Error('Device authentication database failure');
  }
  return { userId: row.user_id, deviceId: row.device_id, appId: row.app_id, userState: row.user_state };
}
