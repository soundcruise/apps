// Isolated native workerd/D1 only. No remote binding, operator route or deployment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { seed } from './writer-authority-fixture.js';
import { createIsolatedWriterPolicy } from '../src/writer-fence.js';
import { createIsolatedCutoverController, readAuthorityEvidence } from '../src/authority-cutover.js';

async function runtime(t) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default {fetch(){return new Response("isolated");}}',
    compatibilityDate: '2026-09-01', d1Databases: { SYNC_DB: 'generation-isolated' } }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('SYNC_DB'), source = seed();
  t.after(() => source.close());
  const schema = source.raw.prepare(`SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL
    AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END`).all();
  for (const row of schema) await db.prepare(row.sql).run();
  for (const table of schema.filter(r => r.type === 'table')) {
    for (const row of source.raw.prepare(`SELECT * FROM ${table.name}`).all()) {
      const keys = Object.keys(row);
      await db.prepare(`INSERT INTO ${table.name} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
        .bind(...Object.values(row)).run();
    }
  }
  return db;
}

for (const owner of ['account', 'membership']) for (const boundary of ['after-paused', 'before-enforce-batch']) {
  test(`native D1: stale ${owner} ${boundary} aborts publication atomically`, async t => {
    const db = await runtime(t), session = db.withSession('first-primary'), sql = new WeakMap();
    let changed = false, armed = false;
    const change = async () => {
      await db.prepare(`UPDATE ${owner === 'account' ? 'sync_accounts' : 'sync_account_memberships'}
        SET generation=generation+1`).run();
      changed = true;
    };
    const wrap = (statement, source) => {
      const wrapped = { bind(...values) { return wrap(statement.bind(...values), source); },
        first: (...args) => statement.first(...args), all: () => statement.all(), run: () => statement.run(), statement };
      sql.set(wrapped, source); return wrapped;
    };
    const binding = { withSession: () => ({ prepare: source => wrap(session.prepare(source), source),
      batch: async statements => {
        if (armed && !changed && statements.some(s => sql.get(s).includes('UPDATE sync_authority_cutovers'))) await change();
        return session.batch(statements.map(s => s.statement));
      } }) };
    const ctl = createIsolatedCutoverController(binding, createIsolatedWriterPolicy('account-a'));
    const transition = phase => ctl.transition({ accountId: 'account-a', migrationId: 'native-generation',
      generation: 'g1', operationId: phase + '-op', phase });
    await transition('prepared'); await transition('paused');
    if (boundary === 'after-paused') await change(); else armed = true;
    await assert.rejects(transition('enforced'), error => error.reason === 'migration_generation_stale');
    assert(changed);
    const ledger = await db.prepare('SELECT * FROM sync_authority_cutovers').first();
    const member = await db.prepare('SELECT * FROM sync_account_memberships').first();
    assert.equal(ledger.phase, 'paused'); assert.equal(ledger.enforce_operation_id, null);
    assert.equal(ledger.account_generation, 1); assert.equal(ledger.membership_generation, 1);
    assert.equal(member.authority_state, 'paused'); assert.equal(member.write_epoch, 1);
    assert.equal(member.minimum_writer_protocol, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_writer_fence_assertion').first()).n, 0);
    await assert.rejects(readAuthorityEvidence(db, { accountId: 'account-a', membershipId: 'port-membership-a' }),
      error => error.reason === 'migration_generation_stale');
    const history = await ctl.recover('account-a', 'native-generation');
    assert.equal(history.recoveryRequired, true); assert.equal(history.authorizationFresh, false);
  });
}
