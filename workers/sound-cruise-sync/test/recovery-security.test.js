import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Recovery implementation stores and logs no plaintext credential material', () => {
  const root = path.join(import.meta.dirname, '..');
  const database = fs.readFileSync(path.join(root, 'src/recovery-database.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'migrations/0005_add_recovery_lifecycle.sql'), 'utf8');
  assert.equal(/recovery_code\s+TEXT/i.test(migration), false);
  assert.equal(/device_credential\s+TEXT/i.test(migration), false);
  assert.equal(/claim_token\s+TEXT/i.test(migration), false);
  assert.equal(database.includes('currentRecoveryCode'), false);
  assert.equal(database.includes('nextRecoveryCode'), false);
  assert.equal(database.includes('deviceCredential'), false);
  assert.equal(/console\.(?:log|error|warn)/.test(app + database), false);
  for (const forbidden of ['Authorization', 'turnstileToken', 'recoveryCode', 'deviceCredential', 'claimToken']) {
    assert.equal(new RegExp(`console\\.[^(]+\\([^)]*${forbidden}`).test(app), false);
  }
});
