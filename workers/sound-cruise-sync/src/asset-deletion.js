import { assertion, clearAssertions } from './writer-fence.js';

const changed = result => Number(result?.meta?.changes || 0);
const identityKeys = ['asset_id','claim_id','account_id','membership_id','sync_user_id',
  'account_generation','membership_generation','write_epoch','object_key','object_version','content_hash'];
const sameClaim = (a,b) => a && b && identityKeys.every(key => a[key] === b[key]);
const noReferences = `NOT EXISTS (SELECT 1 FROM sync_records r, json_tree(r.payload_json) j
  WHERE r.app_id='port' AND r.deleted_at IS NULL AND j.key='assetId' AND j.value=a.asset_id)`;
// NULL generations explicitly mean that the owner was already purged at reservation time.
const currentClaim = `a.asset_id=d.asset_id AND a.account_id=d.account_id
  AND a.membership_id=d.membership_id AND a.sync_user_id=d.sync_user_id
  AND a.object_key=d.object_key AND a.object_version=d.object_version AND a.content_hash=d.content_hash
  AND ac.generation IS d.account_generation AND m.generation IS d.membership_generation
  AND m.write_epoch IS d.write_epoch
  AND (m.id IS NULL OR (m.account_id=d.account_id AND m.sync_user_id=d.sync_user_id AND m.app_id='port'))
  AND c.account_id=d.account_id AND c.asset_id=d.asset_id
  AND NOT EXISTS (SELECT 1 FROM sync_authority_cutovers f WHERE f.account_id=d.account_id)
  AND ${noReferences}`;
const joins = `FROM sync_asset_deletions d JOIN sync_assets a ON a.asset_id=d.asset_id
  LEFT JOIN sync_accounts ac ON ac.id=d.account_id
  LEFT JOIN sync_account_memberships m ON m.id=d.membership_id
  LEFT JOIN sync_authority_cleanup_claims c ON c.account_id=d.account_id`;

export function createAssetDeletionRepository(db) {
  async function claimCleanup(row, now, { graceMs = 0, preparedMs = 0 } = {}) {
    const claimId = crypto.randomUUID();
    const result = await db.batch([
      db.prepare(`INSERT INTO sync_authority_cleanup_claims(account_id,asset_id,created_at)
        SELECT a.account_id,a.asset_id,? FROM sync_assets a WHERE a.asset_id=? AND a.account_id=?
          AND a.object_key=? AND a.object_version=? AND a.content_hash=? AND a.state=? AND a.updated_at=?
          AND ((a.state='unreferenced' AND a.unreferenced_at<=?)
            OR (a.state IN ('prepared','uploaded') AND a.updated_at<=?)
            OR (a.state<>'deleted' AND NOT EXISTS (SELECT 1 FROM sync_accounts ac WHERE ac.id=a.account_id)))
          AND NOT EXISTS (SELECT 1 FROM sync_authority_cutovers f WHERE f.account_id=a.account_id)
          AND NOT EXISTS (SELECT 1 FROM sync_asset_deletions d WHERE d.asset_id=a.asset_id)
          AND ${noReferences}
        ON CONFLICT(account_id) DO NOTHING`)
        .bind(now,row.asset_id,row.account_id,row.object_key,row.object_version,row.content_hash,row.state,row.updated_at,
          now-graceMs,now-preparedMs),
      db.prepare(`INSERT INTO sync_asset_deletions(asset_id,claim_id,account_id,membership_id,sync_user_id,
        account_generation,membership_generation,write_epoch,object_key,object_version,content_hash,state,created_at,updated_at)
        SELECT a.asset_id,?,a.account_id,a.membership_id,a.sync_user_id,ac.generation,m.generation,m.write_epoch,
          a.object_key,a.object_version,a.content_hash,'deleting',?,?
        FROM sync_assets a LEFT JOIN sync_accounts ac ON ac.id=a.account_id
          LEFT JOIN sync_account_memberships m ON m.id=a.membership_id
        WHERE changes()=1 AND a.asset_id=?`).bind(claimId,now,now,row.asset_id)
    ]);
    return changed(result[1]) === 1;
  }
  async function cleanupReservations(limit = 100) {
    return (await db.prepare(`SELECT * FROM sync_asset_deletions WHERE state<>'deleted'
      ORDER BY updated_at LIMIT ${Math.max(1,Math.min(100,Number(limit)||100))}`).all()).results || [];
  }
  async function getCleanupClaim(assetId) {
    return db.prepare('SELECT * FROM sync_asset_deletions WHERE asset_id=?').bind(assetId).first();
  }
  async function validateCleanupClaim(claim) {
    // Return the object identity from D1, never use an unverified caller object key for R2.
    const current = await db.prepare(`SELECT d.* ${joins} WHERE d.asset_id=? AND d.claim_id=?
      AND d.object_key=? AND d.object_version=? AND d.content_hash=?
      AND d.state IN ('deleting','recovery-required') AND ${currentClaim}`)
      .bind(claim.asset_id,claim.claim_id,claim.object_key,claim.object_version,claim.content_hash).first();
    return sameClaim(current,claim) ? current : null;
  }
  async function requireCleanupRecovery(claim, now) {
    await db.prepare(`UPDATE sync_asset_deletions SET state='recovery-required',updated_at=?
      WHERE asset_id=? AND claim_id=? AND state<>'deleted'`).bind(now,claim.asset_id,claim.claim_id).run();
  }
  async function completeCleanup(claim, now) {
    const done = await getCleanupClaim(claim.asset_id);
    if (!sameClaim(done,claim)) throw new Error('asset_cleanup_conflict');
    if (done.state === 'deleted') return true;
    try {
      await db.batch([
        db.prepare(`UPDATE sync_asset_deletions SET state='deleted',updated_at=?
          WHERE asset_id=? AND claim_id=? AND state IN ('deleting','recovery-required')
            AND EXISTS (SELECT 1 ${joins} WHERE d.asset_id=? AND d.claim_id=? AND ${currentClaim})`)
          .bind(now,claim.asset_id,claim.claim_id,claim.asset_id,claim.claim_id),
        assertion(db,'changes()=1'),
        db.prepare(`UPDATE sync_assets SET state='deleted',deleted_at=COALESCE(deleted_at,?),updated_at=?
          WHERE asset_id=? AND object_key=? AND object_version=? AND content_hash=?`)
          .bind(now,now,claim.asset_id,claim.object_key,claim.object_version,claim.content_hash),
        assertion(db,'changes()=1'),
        db.prepare('DELETE FROM sync_authority_cleanup_claims WHERE account_id=? AND asset_id=?')
          .bind(claim.account_id,claim.asset_id),
        clearAssertions(db)
      ]);
      return true;
    } catch (error) {
      const recovered = await getCleanupClaim(claim.asset_id);
      if (sameClaim(recovered,claim) && recovered.state === 'deleted') return true;
      throw error;
    }
  }
  async function releaseCleanup(row) {
    // Only a durably completed deletion may release the Account/cutover barrier.
    await db.prepare(`DELETE FROM sync_authority_cleanup_claims WHERE account_id=? AND asset_id=?
      AND EXISTS (SELECT 1 FROM sync_asset_deletions d WHERE d.asset_id=? AND d.state='deleted')`)
      .bind(row.account_id,row.asset_id,row.asset_id).run();
  }
  return Object.freeze({ claimCleanup, releaseCleanup, cleanupReservations, getCleanupClaim,
    validateCleanupClaim, requireCleanupRecovery, completeCleanup });
}

export async function recoverAssetDeletion(assets, bucket, claim, now = Date.now()) {
  try {
    const done = await assets.getCleanupClaim(claim.asset_id);
    if (sameClaim(done,claim) && done.state === 'deleted') return 'deleted';
    const current = await assets.validateCleanupClaim(claim);
    if (!current) {
      await assets.requireCleanupRecovery(claim,now);
      return 'recovery-required';
    }
    // The reservation cannot expire/cancel. Every reference mutation is SQL-trigger guarded.
    // Concurrent retries can delete only this permanently reserved, immutable object key.
    await bucket.delete(current.object_key);
    await assets.completeCleanup(current,now);
    return 'deleted';
  } catch {
    // A crash before this write still leaves 'deleting', which is equally non-referenceable.
    try { await assets.requireCleanupRecovery(claim,now); } catch { /* Durable reservation remains. */ }
    return 'recovery-required';
  }
}
