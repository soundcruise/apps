import { timingSafeHexEqual } from './crypto.js';
import { ACCOUNT_QA } from './account-qa-crypto.js';

function changes(result) {
  return Number(result?.meta?.changes || 0);
}

export function createD1AccountQaRepository(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 Account QA session is unavailable');
  }

  async function readSession(sessionId) {
    return db.prepare(`
      SELECT q.*, e.cancelled_at AS enrollment_cancelled_at,
             parent.scope AS parent_scope,
             parent.account_id AS parent_account_id,
             parent.revoked_at AS parent_revoked_at,
             parent.expires_at AS parent_expires_at
      FROM sync_account_qa_sessions q
      JOIN sync_account_qa_enrollments e ON e.id = q.enrollment_id
      LEFT JOIN sync_account_qa_sessions parent ON parent.id = q.parent_session_id
      WHERE q.id = ?
    `).bind(sessionId).first();
  }

  async function authenticate(input) {
    const row = await readSession(input.sessionId);
    const stored = row?.credential_verifier || '0'.repeat(64);
    if (!timingSafeHexEqual(input.credentialVerifier, stored) || !row) return null;
    if (row.revoked_at != null || row.enrollment_cancelled_at != null || Number(row.expires_at) <= input.now) return null;
    if (row.scope === 'app' && (row.parent_session_id == null || row.parent_scope !== 'port' ||
        row.parent_account_id !== row.account_id || row.parent_revoked_at != null ||
        Number(row.parent_expires_at) <= input.now)) return null;
    if (input.scope && row.scope !== input.scope) return null;
    if (input.accountId && row.account_id !== input.accountId) return null;
    if (input.appId && row.app_id !== input.appId) return null;
    if (input.appDeviceId && row.app_device_id !== input.appDeviceId) return null;
    return {
      sessionId: row.id,
      enrollmentId: row.enrollment_id,
      scope: row.scope,
      accountId: row.account_id,
      appId: row.app_id,
      appDeviceId: row.app_device_id,
      parentSessionId: row.parent_session_id,
      expiresAt: Number(row.expires_at),
      generation: Number(row.generation)
    };
  }

  async function consumeEnrollment(input) {
    const enrollment = await db.prepare(`
      SELECT id, code_verifier, created_at, expires_at, consumed_at, cancelled_at
      FROM sync_account_qa_enrollments WHERE code_verifier = ?
    `).bind(input.codeVerifier).first();
    if (!enrollment) return { status: 'invalid' };
    if (enrollment.cancelled_at != null) return { status: 'cancelled' };
    if (enrollment.consumed_at != null) return { status: 'used' };
    if (Number(enrollment.expires_at) <= input.now) return { status: 'expired' };
    const expiresAt = Math.min(input.now + ACCOUNT_QA.SESSION_TTL_MS, input.maxExpiresAt || Number.MAX_SAFE_INTEGER);
    const insert = db.prepare(`
      INSERT INTO sync_account_qa_sessions (
        id, credential_verifier, enrollment_id, scope, account_id, app_id,
        app_device_id, parent_session_id, created_at, expires_at,
        last_used_at, revoked_at, generation
      ) VALUES (?, ?, ?, 'port', NULL, NULL, NULL, NULL, ?, ?, ?, NULL, 1)
    `).bind(input.sessionId, input.credentialVerifier, enrollment.id, input.now, expiresAt, input.now);
    const consume = db.prepare(`
      UPDATE sync_account_qa_enrollments
      SET consumed_at = ?, consumed_by_session_id = ?
      WHERE id = ? AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
    `).bind(input.now, input.sessionId, enrollment.id, input.now);
    try {
      const results = await db.batch([insert, consume]);
      if (results.length !== 2 || results.some((result) => result?.success === false || changes(result) !== 1)) {
        throw new Error('QA enrollment transaction incomplete');
      }
      return { status: 'created', sessionId: input.sessionId, expiresAt };
    } catch {
      const raced = await db.prepare(`
        SELECT consumed_by_session_id FROM sync_account_qa_enrollments WHERE id = ?
      `).bind(enrollment.id).first();
      if (raced?.consumed_by_session_id) return { status: 'used' };
      throw new Error('QA enrollment transaction failed');
    }
  }

  async function revoke(sessionId, now) {
    const result = await db.prepare(`
      UPDATE sync_account_qa_sessions SET revoked_at = ?, generation = generation + 1
      WHERE (id = ? OR parent_session_id = ?) AND revoked_at IS NULL
    `).bind(now, sessionId, sessionId).run();
    return changes(result) >= 1;
  }

  return Object.freeze({ readSession, authenticate, consumeEnrollment, revoke });
}
