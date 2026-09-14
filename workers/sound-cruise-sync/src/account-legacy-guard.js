function missingAccountSchema(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('no such table') || message.includes('no such column');
}

export async function readLegacyAccountPolicy(db, syncUserId) {
  try {
    const row = await db.prepare(`
      SELECT m.account_id, m.id AS membership_id, m.state AS membership_state,
             m.recovery_mode, b.bridge_id, b.state AS bridge_state
      FROM sync_account_memberships m
      LEFT JOIN sync_chord_account_bridges b
        ON b.account_id = m.account_id AND b.membership_id = m.id
          AND b.sync_user_id = ? AND b.state IN ('prepared', 'dual', 'finalized')
      WHERE m.app_id = 'chord'
        AND (m.sync_user_id = ? OR b.sync_user_id = ?)
      ORDER BY CASE COALESCE(b.state, '')
        WHEN 'finalized' THEN 1 WHEN 'dual' THEN 2 WHEN 'prepared' THEN 3 ELSE 4 END
      LIMIT 1
    `).bind(syncUserId, syncUserId, syncUserId).first();
    if (!row) return Object.freeze({ schemaAvailable: true, mode: 'legacy', bridgeState: null });
    const mode = row.membership_state === 'active' ? row.recovery_mode : 'legacy';
    return Object.freeze({
      schemaAvailable: true,
      mode,
      bridgeState: row.bridge_state || null,
      accountId: row.account_id,
      membershipId: row.membership_id
    });
  } catch (error) {
    if (missingAccountSchema(error)) {
      return Object.freeze({ schemaAvailable: false, mode: 'legacy', bridgeState: null });
    }
    throw error;
  }
}

export async function readLegacyAccountPolicyByRecoveryVerifier(db, recoveryVerifier, appId) {
  const user = await db.prepare(`
    SELECT id FROM sync_users
    WHERE recovery_verifier = ? AND state = 'active' AND deleted_at IS NULL
  `).bind(recoveryVerifier).first();
  if (!user || appId !== 'chord') return null;
  return { userId: user.id, policy: await readLegacyAccountPolicy(db, user.id) };
}

export function legacyOperationDecision(policy, operation) {
  if (!policy || !['legacy', 'dual', 'account'].includes(policy.mode)) {
    return { allowed: false, code: 'account_ownership_unavailable' };
  }
  if (['push', 'pull', 'snapshot', 'migration', 'pairing', 'device_list', 'device_revoke'].includes(operation)) {
    return { allowed: true };
  }
  if (['recovery_prepare', 'recovery_commit', 'recovery_issue'].includes(operation)) {
    return policy.mode === 'account'
      ? { allowed: false, code: 'account_recovery_required' }
      : { allowed: true };
  }
  if (['cloud_delete_intent', 'cloud_delete_commit'].includes(operation)) {
    const bridgeInProgress = policy.bridgeState === 'prepared' || policy.bridgeState === 'dual' ||
      policy.bridgeState === 'finalized';
    return policy.mode === 'legacy' && !bridgeInProgress
      ? { allowed: true }
      : { allowed: false, code: 'account_membership_delete_required' };
  }
  return { allowed: false, code: 'account_ownership_unavailable' };
}

export const LEGACY_ACCOUNT_OPERATION_MATRIX = Object.freeze({
  pushPull: Object.freeze({ legacy: 'allow', dual: 'allow', account: 'allow' }),
  pairing: Object.freeze({ legacy: 'allow', dual: 'allow', account: 'allow' }),
  deviceRevoke: Object.freeze({ legacy: 'allow', dual: 'allow', account: 'allow' }),
  legacyRecovery: Object.freeze({ legacy: 'allow', dual: 'allow', account: 'deny' }),
  legacyRecoveryIssue: Object.freeze({ legacy: 'allow', dual: 'allow', account: 'deny' }),
  legacyCloudDelete: Object.freeze({ legacy: 'allow', dual: 'deny', account: 'deny' })
});
