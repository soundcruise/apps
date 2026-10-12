import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { seed } from './writer-authority-fixture.js';
import { readAuthorityEvidence } from '../src/authority-cutover.js';
const dir = new URL('../migrations/', import.meta.url);
const migration = readFileSync(new URL('0037_bind_cutover_generations.sql', dir), 'utf8');

function previous(t) {
  const db = new DatabaseSync(':memory:'), source = seed();
  t.after(() => { db.close(); source.close(); });
  for (const file of readdirSync(dir).sort().filter(f => f.endsWith('.sql') && f < '0037'))
    db.exec(readFileSync(new URL(file, dir), 'utf8'));
  source.raw.prepare(`INSERT INTO sync_records(user_id,app_id,record_type,record_id,payload_json,
    payload_hash,revision,updated_at,updated_by_device_id,last_operation_id,schema_version)
    VALUES ('port-user-a','port','practice_menu','practice-a','{}',?,1,1,
      '323e4567-e89b-42d3-a456-426614174000','practice-a',1)`).run('4'.repeat(64));
  const tables = source.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables) {
    const rows = source.raw.prepare(`SELECT * FROM ${name}`).all();
    const initial = db.prepare(`SELECT * FROM ${name}`).all();
    if (initial.length) {
      // Migrations themselves seed control singletons; retain and verify them.
      assert.equal(initial.length, rows.length);
      continue;
    }
    for (const row of rows) {
      const keys = Object.keys(row);
      db.prepare(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
    }
  }
  const contents = () => JSON.stringify(tables.map(({ name }) => db.prepare(`SELECT * FROM ${name}`).all()));
  return { db, contents };
}
function ledger(db, bound = '') {
  db.exec(`INSERT INTO sync_authority_cutovers(account_id,app_id,membership_id,sync_user_id,migration_id,generation,
    phase,base_epoch,target_epoch,minimum_protocol,prepare_operation_id,pause_operation_id,created_at,updated_at${bound ? ',account_generation,membership_generation' : ''})
    VALUES ('account-a','port','port-membership-a','port-user-a','old-migration','g1','paused',1,2,2,'prepare','pause',1,1${bound ? ',' + bound : ''})`);
}

test('0037 is additive: existing records/memberships/assets remain byte-equivalent and legacy is inert', t => {
  const { db, contents } = previous(t), before = contents();
  db.exec(migration);
  assert.equal(contents(), before);
  assert.equal(db.prepare('SELECT authority_state FROM sync_account_memberships').get().authority_state, 'legacy');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_records').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_account_memberships').get().n, 1);
  const names = db.prepare('PRAGMA table_info(sync_authority_cutovers)').all().map(r => r.name);
  assert(names.includes('account_generation')); assert(names.includes('membership_generation'));
});

test('0037 leaves historical paused ledger unbound; read/update cannot infer or retag current generations', async t => {
  const { db } = previous(t); ledger(db);
  db.exec("UPDATE sync_account_memberships SET authority_state='paused'");
  const before = db.prepare('SELECT * FROM sync_authority_cutovers').get();
  db.exec(migration);
  const { account_generation, membership_generation, ...preserved } = db.prepare('SELECT * FROM sync_authority_cutovers').get();
  assert.deepEqual(preserved, { ...before });
  assert.equal(account_generation, null); assert.equal(membership_generation, null);
  const binding = { prepare(sql) { return { bind(...values) { return { first: async () => db.prepare(sql).get(...values) }; } }; } };
  await assert.rejects(readAuthorityEvidence(binding, { accountId: 'account-a', membershipId: 'port-membership-a' }),
    e => e.reason === 'migration_generation_stale');
  assert.throws(() => db.exec('UPDATE sync_authority_cutovers SET account_generation=1,membership_generation=1'), /b15_migration_generation_stale/);
  assert.throws(() => db.exec("UPDATE sync_authority_cutovers SET phase='enforced',enforce_operation_id='enforce',checkpoint_json='{}'"), /b15_migration_generation_stale/);
  assert.equal(db.prepare('SELECT write_epoch FROM sync_account_memberships').get().write_epoch, 1);
});

test('0037 new ledger rejects missing/fake/invalid generations and admits only server-matching pair', t => {
  const { db } = previous(t); db.exec(migration);
  for (const bound of ['', '2,1', '1,2', '0,1', '1.5,1', '9007199254740992,1']) assert.throws(() => ledger(db, bound));
  ledger(db, '1,1');
  const row = db.prepare('SELECT * FROM sync_authority_cutovers').get();
  assert.equal(row.account_generation, 1); assert.equal(row.membership_generation, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_records').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_account_memberships').get().n, 1);
});
