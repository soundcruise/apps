import { spawnSync } from 'node:child_process';
import {
  createQaEnrollmentCode,
  formatQaEnrollmentCode,
  qaEnrollmentCodeVerifier
} from '../src/account-qa-crypto.js';

const remote = process.argv.includes('--remote');
const ttlArgument = process.argv.find((value) => value.startsWith('--ttl-minutes='));
const ttlMinutes = ttlArgument ? Number(ttlArgument.split('=')[1]) : 60;
const pepper = process.env.SYNC_ACCOUNT_QA_ENROLLMENT_PEPPER;
if (!pepper || pepper.length < 32) throw new Error('SYNC_ACCOUNT_QA_ENROLLMENT_PEPPER is required');
if (!Number.isSafeInteger(ttlMinutes) || ttlMinutes < 5 || ttlMinutes > 1440) {
  throw new Error('ttl must be between 5 and 1440 minutes');
}

const enrollmentId = crypto.randomUUID();
const code = createQaEnrollmentCode();
const verifier = await qaEnrollmentCodeVerifier(code, pepper);
const now = Date.now();
const expiresAt = now + ttlMinutes * 60 * 1000;
const sql = `INSERT INTO sync_account_qa_enrollments (id, code_verifier, created_at, expires_at, consumed_at, cancelled_at, consumed_by_session_id) VALUES ('${enrollmentId}', '${verifier}', ${now}, ${expiresAt}, NULL, NULL, NULL);`;

if (!remote) {
  process.stdout.write(JSON.stringify({
    dryRun: true,
    enrollmentId,
    expiresAt,
    verifierOnlySql: sql,
    note: 'No D1 write was performed. Add --remote to issue and display the code once.'
  }, null, 2) + '\n');
  process.exit(0);
}

const result = spawnSync('npx', [
  'wrangler', 'd1', 'execute', 'sound-cruise-sync', '--remote', '--command', sql
], { cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (result.status !== 0) {
  process.stderr.write('QA enrollment issuance failed. No plaintext code was displayed.\n');
  process.exit(result.status || 1);
}
process.stdout.write(`QA Enrollment Code (displayed once): ${formatQaEnrollmentCode(code)}\n`);
process.stdout.write(`Enrollment ID: ${enrollmentId}\nExpires at: ${new Date(expiresAt).toISOString()}\n`);
