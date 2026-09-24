import { hmacVerifier } from './crypto.js';

export const LOCKOUT_IDLE_MS = 24 * 60 * 60 * 1000;

export async function proLockoutKey(ip, pepper, cryptoImpl = crypto) {
  if (typeof pepper !== 'string' || pepper.length < 32) throw new Error('Pro lockout pepper unavailable');
  return hmacVerifier(`sound-cruise-pro-lockout:v1:${ip}`, pepper, cryptoImpl);
}

export async function proLockoutStatus(session, ipKey, now) {
  const row = await session.prepare(`SELECT locked_until FROM pro_auth_lockouts
    WHERE ip_key = ? AND last_failure_at > ?`).bind(ipKey, now - LOCKOUT_IDLE_MS).first();
  return row?.locked_until > now ? Math.ceil((row.locked_until - now) / 1000) : 0;
}

export async function recordWrongProPasscode(session, ipKey, now) {
  // One UPSERT serializes increments for a key. The WHERE prevents a request
  // that raced with a newly started lock from extending that lock.
  const row = await session.prepare(`INSERT INTO pro_auth_lockouts
    (ip_key, failure_count, lock_level, locked_until, last_failure_at, updated_at)
    VALUES (?, 1, 0, NULL, ?, ?)
    ON CONFLICT(ip_key) DO UPDATE SET
      failure_count = CASE
        WHEN pro_auth_lockouts.last_failure_at <= ? THEN 1
        WHEN pro_auth_lockouts.failure_count = 4 THEN 0
        ELSE pro_auth_lockouts.failure_count + 1 END,
      lock_level = CASE
        WHEN pro_auth_lockouts.last_failure_at <= ? THEN 0
        WHEN pro_auth_lockouts.failure_count = 4 THEN MIN(pro_auth_lockouts.lock_level + 1, 2)
        ELSE pro_auth_lockouts.lock_level END,
      locked_until = CASE
        WHEN pro_auth_lockouts.last_failure_at <= ? THEN NULL
        WHEN pro_auth_lockouts.failure_count = 4 THEN ? +
          CASE pro_auth_lockouts.lock_level
            WHEN 0 THEN 300000 WHEN 1 THEN 900000 ELSE 1800000 END
        ELSE NULL END,
      last_failure_at = ?, updated_at = ?
    WHERE pro_auth_lockouts.locked_until IS NULL OR pro_auth_lockouts.locked_until <= ?
    RETURNING failure_count, lock_level, locked_until`)
    .bind(ipKey, now, now, now - LOCKOUT_IDLE_MS, now - LOCKOUT_IDLE_MS,
      now - LOCKOUT_IDLE_MS, now, now, now, now).first();
  return Boolean(row);
}

export async function issueProCredentialAndReset(session, material, current, ipKey, now) {
  const results = await session.batch([
    session.prepare(`INSERT INTO pro_credentials
      (id, verifier, generation, scope, created_at, revoked_at)
      SELECT ?, ?, generation, 'global_pro', ?, NULL FROM pro_auth_state
      WHERE singleton_id = 1 AND generation = ? AND active_code_slot = ?
        AND NOT EXISTS (SELECT 1 FROM pro_auth_lockouts
          WHERE ip_key = ? AND last_failure_at > ? AND locked_until > ?)`)
      .bind(material.id, material.verifier, now, current.generation, current.active_code_slot,
        ipKey, now - LOCKOUT_IDLE_MS, now),
    session.prepare(`DELETE FROM pro_auth_lockouts WHERE ip_key = ?
      AND EXISTS (SELECT 1 FROM pro_credentials WHERE id = ?)`)
      .bind(ipKey, material.id)
  ]);
  if (!results.every((result) => result?.success !== false)) throw new Error('Pro credential batch failed');
  return Number(results[0]?.meta?.changes) === 1;
}

export async function cleanupProLockouts(db, now) {
  return db.prepare('DELETE FROM pro_auth_lockouts WHERE last_failure_at <= ?')
    .bind(now - LOCKOUT_IDLE_MS).run();
}
