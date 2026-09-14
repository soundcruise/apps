import { spawnSync as nodeSpawnSync } from 'node:child_process';

function defaultRunWrangler(args) {
  return nodeSpawnSync('npx', ['wrangler', ...args], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
}

export function cancelOrphanEnrollment({
  argv = process.argv.slice(2),
  runWrangler = defaultRunWrangler,
  stdout = process.stdout
} = {}) {
  const id = argv.find((value) => value.startsWith('--id='))?.slice(5);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('provide exactly one Enrollment UUID with --id=');
  }
  const sql = `UPDATE sync_account_qa_enrollments
    SET cancelled_at = CAST(strftime('%s','now') AS INTEGER) * 1000
    WHERE id = '${id}' AND consumed_at IS NULL AND cancelled_at IS NULL
      AND expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000;`;
  const result = runWrangler(['d1', 'execute', 'sound-cruise-sync', '--remote', '--json', '--yes', '--command', sql]);
  if (result.status !== 0) throw new Error('remote cancellation failed');
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error('remote cancellation returned an invalid response'); }
  const changes = Number(parsed?.[0]?.meta?.changes);
  if (changes !== 1) throw new Error('expected exactly one active Enrollment to be cancelled');
  stdout.write('Cancelled exactly one orphan QA Enrollment.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { cancelOrphanEnrollment(); }
  catch (error) {
    process.stderr.write(`QA Enrollment orphan cancellation stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}
