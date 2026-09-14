import { spawnSync as nodeSpawnSync } from 'node:child_process';
import {
  createQaEnrollmentCode,
  formatQaEnrollmentCode,
  qaEnrollmentCodeVerifier
} from '../src/account-qa-crypto.js';

const DATABASE = 'sound-cruise-sync';
const SECRET_NAME = 'SYNC_ACCOUNT_QA_ENROLLMENT_PEPPER';
const DEFAULT_TTL_MINUTES = 60;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 1440;
const ACTIVE_GUARD_SQL = `SELECT COUNT(*) AS active_unused_enrollments
  FROM sync_account_qa_enrollments
  WHERE consumed_at IS NULL
    AND cancelled_at IS NULL
    AND expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000;`;

function parseTtl(argv) {
  const argument = argv.find((value) => value.startsWith('--ttl-minutes='));
  const ttlMinutes = argument ? Number(argument.split('=')[1]) : DEFAULT_TTL_MINUTES;
  if (!Number.isSafeInteger(ttlMinutes) || ttlMinutes < MIN_TTL_MINUTES || ttlMinutes > MAX_TTL_MINUTES) {
    throw new Error(`ttl must be between ${MIN_TTL_MINUTES} and ${MAX_TTL_MINUTES} minutes`);
  }
  return ttlMinutes;
}

function secureRandomPepper(cryptoImpl = crypto) {
  const bytes = new Uint8Array(48);
  cryptoImpl.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function defaultRunWrangler(args, { input } = {}) {
  return nodeSpawnSync('npx', ['wrangler', ...args], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

function parseD1Json(result, operation) {
  if (result.status !== 0) throw new Error(`${operation} failed`);
  try {
    const parsed = JSON.parse(result.stdout);
    if (!Array.isArray(parsed) || parsed.some((entry) => entry?.success !== true)) {
      throw new Error('unsuccessful result');
    }
    return parsed;
  } catch {
    throw new Error(`${operation} returned an invalid response`);
  }
}

function d1CommandArgs(sql) {
  return ['d1', 'execute', DATABASE, '--remote', '--json', '--yes', '--command', sql];
}

function readActiveUnused(runWrangler) {
  const parsed = parseD1Json(runWrangler(d1CommandArgs(ACTIVE_GUARD_SQL)), 'active Enrollment guard');
  const count = Number(parsed[0]?.results?.[0]?.active_unused_enrollments);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('active Enrollment guard returned an invalid count');
  return count;
}

export async function rotateAndIssue({
  argv = process.argv.slice(2),
  cryptoImpl = crypto,
  now = () => Date.now(),
  runWrangler = defaultRunWrangler,
  stdout = process.stdout,
  createCode = createQaEnrollmentCode,
  createVerifier = qaEnrollmentCodeVerifier
} = {}) {
  const remote = argv.includes('--remote');
  const ttlMinutes = parseTtl(argv);
  if (!remote) {
    stdout.write(JSON.stringify({
      dryRun: true,
      remoteWrite: false,
      rotatesSecret: false,
      issuesEnrollment: false,
      requiresActiveUnusedCount: 0,
      ttlMinutes,
      note: 'Add --remote to rotate the Enrollment pepper and issue exactly one Enrollment.'
    }, null, 2) + '\n');
    return { dryRun: true };
  }

  if (readActiveUnused(runWrangler) !== 0) {
    throw new Error('active unused Enrollment exists; rotation was not attempted');
  }

  const issuedAt = now();
  const expiresAt = issuedAt + ttlMinutes * 60 * 1000;
  const enrollmentId = cryptoImpl.randomUUID();
  const pepper = secureRandomPepper(cryptoImpl);
  const code = createCode(cryptoImpl);
  const verifier = await createVerifier(code, pepper, cryptoImpl);

  const secretResult = runWrangler(['secret', 'put', SECRET_NAME], { input: `${pepper}\n` });
  if (secretResult.status !== 0) throw new Error('Enrollment pepper rotation failed; no Enrollment was issued');

  if (readActiveUnused(runWrangler) !== 0) {
    throw new Error('active unused Enrollment appeared after rotation; no Enrollment was issued');
  }

  const sql = `INSERT INTO sync_account_qa_enrollments
    (id, code_verifier, created_at, expires_at, consumed_at, cancelled_at, consumed_by_session_id)
    VALUES ('${enrollmentId}', '${verifier}', ${issuedAt}, ${expiresAt}, NULL, NULL, NULL);`;
  const inserted = parseD1Json(runWrangler(d1CommandArgs(sql)), 'Enrollment issuance');
  if (Number(inserted[0]?.meta?.rows_written) !== 1) {
    throw new Error('Enrollment issuance did not write exactly one row');
  }

  stdout.write(`QA Enrollment Code (displayed once): ${formatQaEnrollmentCode(code)}\n`);
  stdout.write(`Enrollment ID: ${enrollmentId}\nExpires at: ${new Date(expiresAt).toISOString()}\n`);
  return { dryRun: false, enrollmentId, expiresAt };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await rotateAndIssue();
  } catch (error) {
    process.stderr.write(`QA Enrollment rotation/issuance stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}

