// B1-6 v2 stop-condition reproducer. These safety assertions intentionally fail
// until cutover binds Account/membership generations in its D1 transaction.
// Isolated SQLite only; no production services, credentials or data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from './writer-authority-fixture.js';
import { createIsolatedWriterPolicy } from '../src/writer-fence.js';
import { createIsolatedCutoverController, readAuthorityEvidence } from '../src/authority-cutover.js';

for (const owner of ['account', 'membership']) {
  for (const boundary of ['after-paused', 'before-enforce-batch']) {
    test(`cutover rejects stale ${owner} generation: ${boundary}`, async t => {
      const db = seed();
      t.after(() => db.close());
      const controller = createIsolatedCutoverController(db, createIsolatedWriterPolicy('account-a'));
      const transition = phase => controller.transition({
        accountId: 'account-a', migrationId: 'generation-race', generation: 'g1',
        operationId: `${phase}-operation`, phase
      });
      await transition('prepared');
      await transition('paused');
      const table = owner === 'account' ? 'sync_accounts' : 'sync_account_memberships';
      const ownerId = owner === 'account' ? 'account-a' : 'port-membership-a';
      assert.equal(db.raw.prepare(`SELECT generation FROM ${table} WHERE id=?`).get(ownerId).generation, 1);

      // Inject the same generation invalidation used by recovery/detach flows,
      // independently of their other effects, with the Account ID unchanged.
      let changed = false;
      const changeGeneration = () => {
        db.raw.prepare(`UPDATE ${table} SET generation=generation+1 WHERE id=?`).run(ownerId);
        changed = true;
      };
      if (boundary === 'after-paused') changeGeneration();
      else {
        const batch = db.batch.bind(db);
        db.batch = async statements => {
          if (!changed && statements.some(statement => statement.sql.includes('UPDATE sync_authority_cutovers'))) {
            changeGeneration();
          }
          return batch(statements);
        };
      }

      let rejected = false;
      try { await transition('enforced'); }
      catch (error) {
        // A safe failure must retain the durable paused barrier and its epoch.
        assert.equal(error.code, 'dataset_authority_unavailable');
        rejected = true;
      }
      assert.equal(changed, true, 'generation change must reach the intended boundary');
      assert.equal(db.raw.prepare(`SELECT generation FROM ${table} WHERE id=?`).get(ownerId).generation, 2);
      const ledger = db.raw.prepare('SELECT phase FROM sync_authority_cutovers').get();
      const membership = db.raw.prepare('SELECT write_epoch FROM sync_account_memberships').get();
      let evidence;
      try { evidence = await readAuthorityEvidence(db, { accountId: 'account-a', membershipId: 'port-membership-a' }); }
      catch (error) { assert.equal(error.code, 'dataset_authority_unavailable'); }

      assert.deepEqual({
        rejected, phase: ledger.phase, writeEpoch: membership.write_epoch,
        exposesEnforcedEvidence: evidence?.state === 'enforced' && evidence?.fence?.transactionalAdmission === true
      }, {
        rejected: true, phase: 'paused', writeEpoch: 1, exposesEnforcedEvidence: false
      });
    });
  }
}
