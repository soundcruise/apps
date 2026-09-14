import { spawnSync } from 'node:child_process';

const sessionArgument = process.argv.find((value) => value.startsWith('--session-id='));
const sessionId = sessionArgument?.split('=')[1];
const remote = process.argv.includes('--remote');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sessionId || '')) {
  throw new Error('valid --session-id is required');
}
const now = Date.now();
const sql = `UPDATE sync_account_qa_sessions SET revoked_at = ${now}, generation = generation + 1 WHERE (id = '${sessionId}' OR parent_session_id = '${sessionId}') AND revoked_at IS NULL;`;
if (!remote) {
  process.stdout.write(JSON.stringify({ dryRun: true, sessionId, sql, note: 'No D1 write was performed.' }, null, 2) + '\n');
  process.exit(0);
}
const result = spawnSync('npx', [
  'wrangler', 'd1', 'execute', 'sound-cruise-sync', '--remote', '--command', sql
], { cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: 'inherit' });
process.exit(result.status || 0);
