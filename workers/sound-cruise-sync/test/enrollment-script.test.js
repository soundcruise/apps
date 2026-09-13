import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeEnrollmentCode } from '../src/crypto.js';

const script = path.join(import.meta.dirname, '../scripts/create-enrollment-code.mjs');

test('Enrollment operator helper emits a one-time code plus verifier without echoing the pepper', () => {
  const pepper = 'operator-test-pepper-that-is-never-production-123456789';
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, SYNC_ENROLLMENT_PEPPER: pepper, ENROLLMENT_LIFETIME_MINUTES: '30' }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes(pepper), false);
  const lines = result.stdout.trim().split('\n');
  assert(normalizeEnrollmentCode(lines[0].split(': ').slice(1).join(': ')));
  assert.match(lines[1], /^Verifier: [0-9a-f]{64}$/);
  assert.equal(lines[2], 'App ID: chord');
  const createdAt = Number(lines[3].split(': ').pop());
  const expiresAt = Number(lines[4].split(': ').pop());
  assert.equal(expiresAt - createdAt, 30 * 60 * 1000);
});

test('Enrollment operator helper refuses to run without the dedicated pepper', () => {
  const env = { ...process.env };
  delete env.SYNC_ENROLLMENT_PEPPER;
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SYNC_ENROLLMENT_PEPPER/);
});
