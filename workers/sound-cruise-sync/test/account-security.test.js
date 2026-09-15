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

test('M9 keeps Standard unintegrated and wires Account orchestration only into Pro apps', () => {
  const editions = [
    ['apps/chord-cruise/standard/index.html', 'apps/chord-cruise/pro_k7m4q9v2x8/index.html'],
    ['apps/pitch-cruise/standard/index.html', 'apps/pitch-cruise/pro_x9v7q2m8/index.html'],
    ['apps/fretboard_cruise/standard/index.html', 'apps/fretboard_cruise/pro_a9f4k7q2m8z/index.html'],
    ['apps/rhythm-cruise/standard/index.html', 'apps/rhythm-cruise/pro_r4m8k7n2q9x/index.html']
  ];
  for (const [standardPath, proPath] of editions) {
    const standard = fs.readFileSync(path.join(repositoryRoot, standardPath), 'utf8');
    const pro = fs.readFileSync(path.join(repositoryRoot, proPath), 'utf8');
    assert.equal(standard.includes('shared/sync-account'), false, `${standardPath} must remain unintegrated`);
    assert.equal(pro.includes('shared/sync-account'), true, `${proPath} must load M9 Account wiring`);
    assert.equal(pro.includes('__SOUND_CRUISE_MULTI_APP_SYNC__'), false, `${proPath} production M9 gate must remain off`);
  }
  const standardPort = fs.readFileSync(path.join(repositoryRoot, 'apps/cruise-port/index.html'), 'utf8');
  const proPort = fs.readFileSync(path.join(repositoryRoot, 'apps/cruise-port/pro_9a3943176561/index.html'), 'utf8');
  for (const source of [standardPort, proPort]) {
    assert.equal((source.match(/shared\/sync-account\/sync-account-(?:core|db|client)\.js/gu) || []).length, 3);
    assert.equal(source.includes('chord-account-bridge'), false);
    assert.equal(source.includes('sync-app-backup'), false);
  }
  const controller = fs.readFileSync(path.join(repositoryRoot, 'apps/cruise-port/sync-center-controller.js'), 'utf8');
  assert.match(controller, /client\.summary/u);
  assert.match(controller, /client\.devices/u);
  assert.doesNotMatch(controller, /client\.(?:prepareMembership|issueHandoff|recover|delete|revoke)\s*\(/u);
  const orchestrator = fs.readFileSync(path.join(repositoryRoot, 'apps/cruise-port/sync-center-orchestrator.js'), 'utf8');
  assert.doesNotMatch(orchestrator, /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/u);
});

test('production config exposes every independent Account-operation limiter', () => {
  const config = fs.readFileSync(path.join(import.meta.dirname, '../wrangler.jsonc'), 'utf8');
  assert.equal(config.includes('SYNC_ACCOUNT_CREDENTIAL_PEPPER'), false);
  assert.equal(config.includes('SYNC_ACCOUNT_RECOVERY_PEPPER'), false);
  assert.equal(config.includes('SYNC_ACCOUNT_HANDOFF_PEPPER'), false);
  assert.equal(config.includes('SYNC_ACCOUNT_APP_JOIN_PEPPER'), false);
  assert.equal(config.includes('ACCOUNT_ALLOWED_ORIGINS'), true);
  assert.match(config, /"ACCOUNT_ALLOWED_ORIGINS"\s*:\s*"https:\/\/soundcruise\.jp"/u);
  assert.match(config, /"name"\s*:\s*"ACCOUNT_QA_ENROLL_RATE_LIMITER"[\s\S]*?"namespace_id"\s*:\s*"32006"[\s\S]*?"limit"\s*:\s*5[\s\S]*?"period"\s*:\s*60/u);
  assert.match(config, /"name"\s*:\s*"ACCOUNT_START_RATE_LIMITER"[\s\S]*?"namespace_id"\s*:\s*"32007"[\s\S]*?"limit"\s*:\s*5[\s\S]*?"period"\s*:\s*60/u);
  for (const [name, namespaceId] of [
    ['ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER', '32008'],
    ['ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER', '32009'],
    ['ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER', '32010'],
    ['ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER', '32011'],
    ['ACCOUNT_RECOVERY_RATE_LIMITER', '32012'],
    ['ACCOUNT_BRIDGE_RATE_LIMITER', '32013']
  ]) {
    assert.match(config, new RegExp(`"name"\\s*:\\s*"${name}"[\\s\\S]*?"namespace_id"\\s*:\\s*"${namespaceId}"[\\s\\S]*?"limit"\\s*:\\s*5[\\s\\S]*?"period"\\s*:\\s*60`, 'u'));
  }
  assert.match(config, /"SYNC_ALLOWED_APP_IDS"\s*:\s*"chord"/u);
});
