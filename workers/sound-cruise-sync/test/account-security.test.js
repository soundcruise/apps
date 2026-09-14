import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workerDirectory = path.join(import.meta.dirname, '../src');
const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const accountSources = fs.readdirSync(workerDirectory)
  .filter((name) => name.startsWith('account-') && name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(workerDirectory, name), 'utf8'))
  .join('\n');
const sharedDirectory = path.join(repositoryRoot, 'apps/shared/sync-account');
const sharedSources = fs.readdirSync(sharedDirectory)
  .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js'))
  .map((name) => fs.readFileSync(path.join(sharedDirectory, name), 'utf8'))
  .join('\n');

test('Account implementation has no plaintext logging or browser key-value secret storage surface', () => {
  assert.equal(/\bconsole\s*\./u.test(accountSources), false);
  assert.equal(/\bconsole\s*\./u.test(sharedSources), false);
  assert.equal(/\blocalStorage\b/u.test(sharedSources), false);
  assert.equal(/\bsessionStorage\b/u.test(sharedSources), false);
  assert.equal(sharedSources.includes('transient_secret_persistence_blocked'), true);
});

test('M3 shared primitives are additive and not imported by any current app client', () => {
  const appDirectories = [
    'apps/chord-cruise',
    'apps/cruise-port',
    'apps/pitch-cruise',
    'apps/fretboard_cruise',
    'apps/rhythm-cruise'
  ];
  for (const relative of appDirectories) {
    const root = path.join(repositoryRoot, relative);
    const stack = [root];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.(?:js|mjs|html)$/u.test(entry.name)) {
          const source = fs.readFileSync(full, 'utf8');
          assert.equal(source.includes('shared/sync-account'), false, `${full} must remain unintegrated in M3`);
        }
      }
    }
  }
});

test('production config is not widened for Account secrets, origins, app IDs or rate namespaces', () => {
  const config = fs.readFileSync(path.join(import.meta.dirname, '../wrangler.jsonc'), 'utf8');
  assert.equal(config.includes('SYNC_ACCOUNT_CREDENTIAL_PEPPER'), false);
  assert.equal(config.includes('SYNC_ACCOUNT_RECOVERY_PEPPER'), false);
  assert.equal(config.includes('SYNC_ACCOUNT_HANDOFF_PEPPER'), false);
  assert.equal(config.includes('ACCOUNT_ALLOWED_ORIGINS'), false);
  assert.equal(config.includes('ACCOUNT_START_RATE_LIMITER'), false);
  assert.match(config, /"SYNC_ALLOWED_APP_IDS"\s*:\s*"chord"/u);
});
