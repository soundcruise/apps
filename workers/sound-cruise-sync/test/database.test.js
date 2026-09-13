import test from 'node:test';
import assert from 'node:assert/strict';
import { createProvisioningIdentity } from '../src/database.js';

function fakeDb(results = [{ success: true }, { success: true }, { success: true }]) {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      return {
        bind(...values) {
          const statement = { sql, values };
          statements.push(statement);
          return statement;
        }
      };
    },
    async batch(input) {
      assert.equal(input.length, 3);
      return results;
    }
  };
}

function input() {
  return {
    userId: 'user-id', deviceId: 'device-id', appId: 'chord',
    credentialVerifier: 'v'.repeat(64), deviceLabel: 'QA iPhone', now: 1234,
    recoveryVerifier: 'r'.repeat(64),
    initialSummary: { schemaVersion: 1, recordCount: 4, manifestHash: 'a'.repeat(64) }
  };
}

test('provisioning writes user, verifier-only device, and initializing dataset in one batch', async () => {
  const db = fakeDb();
  const result = await createProvisioningIdentity(db, input());
  assert.deepEqual(result, { status: 'created', userId: 'user-id', deviceId: 'device-id', datasetState: 'initializing' });
  assert.equal(db.statements.length, 3);
  assert.equal(db.statements[1].values.includes('v'.repeat(64)), true);
  assert.equal(db.statements[0].values.includes('r'.repeat(64)), true);
  assert.equal(db.statements[0].sql.includes("'active', 1"), true);
  assert.equal(db.statements.some((statement) => statement.values.some((value) => String(value).startsWith('scd1.'))), false,
    'plaintext credential never reaches D1');
});

test('missing D1 or any failed batch result fails closed', async () => {
  await assert.rejects(createProvisioningIdentity(null, input()), /D1/);
  await assert.rejects(createProvisioningIdentity(fakeDb([{ success: true }, { success: false }, { success: true }]), input()), /transaction/);
});
