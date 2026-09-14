import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rotateAndIssue } from '../scripts/rotate-account-qa-enrollment-pepper-and-issue.mjs';
import { cancelOrphanEnrollment } from '../scripts/cancel-account-qa-enrollment.mjs';

const scriptUrl = new URL('../scripts/rotate-account-qa-enrollment-pepper-and-issue.mjs', import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const testPepper = 'qa-enrollment-test-pepper-that-must-never-be-printed';
const testCode = ['SQA1', 'ABCDEFGH', 'JKLMNPQR', 'STUV'].join('');
const testVerifier = 'a'.repeat(64);
const enrollmentId = '00000000-0000-4000-8000-000000000099';

function d1Result(results) {
  return { status: 0, stdout: JSON.stringify([{ success: true, results, meta: { rows_written: 0 } }]), stderr: '' };
}

function cryptoFixture() {
  return {
    randomUUID: () => enrollmentId,
    getRandomValues(bytes) {
      bytes.fill(7);
      return bytes;
    }
  };
}

test('one-shot operator helper defaults to a secret-free dry-run', () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.dryRun, true);
  assert.equal(output.remoteWrite, false);
  assert.equal(output.rotatesSecret, false);
  assert.equal(output.issuesEnrollment, false);
  assert.doesNotMatch(result.stdout, /SQA1(?:-[A-Z2-9]{4}){5}/);
});

test('one-shot remote flow passes pepper only over secret-put stdin and issues one code', async () => {
  const calls = [];
  const chunks = [];
  const results = [
    d1Result([{ active_unused_enrollments: 0 }]),
    { status: 0, stdout: 'secret updated', stderr: '' },
    d1Result([{ active_unused_enrollments: 0 }]),
    d1Result([]),
    d1Result([{ enrollment_count: 1 }])
  ];
  const runWrangler = (args, options = {}) => {
    calls.push({ args, input: options.input });
    return results.shift();
  };
  await rotateAndIssue({
    argv: ['--remote'],
    cryptoImpl: cryptoFixture(),
    now: () => 1_700_000_000_000,
    runWrangler,
    stdout: { write: (chunk) => chunks.push(chunk) },
    createCode: () => testCode,
    createVerifier: async (_code, pepper) => {
      assert.notEqual(pepper, testPepper);
      return testVerifier;
    }
  });

  assert.equal(calls.length, 5);
  assert.deepEqual(calls[1].args, ['secret', 'put', 'SYNC_ACCOUNT_QA_ENROLLMENT_PEPPER']);
  assert.ok(calls[1].input.endsWith('\n'));
  const generatedPepper = calls[1].input.trim();
  assert.ok(generatedPepper.length >= 32);
  for (const call of calls) {
    assert.equal(call.args.includes(generatedPepper), false, 'pepper must not appear in argv');
  }
  const output = chunks.join('');
  assert.equal(output.includes(generatedPepper), false, 'pepper must not appear on stdout');
  assert.equal((output.match(/QA Enrollment Code \(displayed once\):/g) || []).length, 1);
  assert.equal(output.includes(['SQA1', 'ABCD', 'EFGH', 'JKLM', 'NPQR', 'STUV'].join('-')), true);
  assert.match(calls[3].args.at(-1), /INSERT INTO sync_account_qa_enrollments/);
  assert.doesNotMatch(calls[3].args.at(-1), /SQA1/);
  assert.match(calls[4].args.at(-1), /SELECT COUNT\(\*\) AS enrollment_count/);
});

test('one-shot remote flow does not display a code unless its generated UUID is verified', async () => {
  const chunks = [];
  await assert.rejects(() => rotateAndIssue({
    argv: ['--remote'], cryptoImpl: cryptoFixture(), now: () => 1_700_000_000_000,
    runWrangler: (() => {
      const results = [
        d1Result([{ active_unused_enrollments: 0 }]),
        { status: 0, stdout: 'secret updated', stderr: '' },
        d1Result([{ active_unused_enrollments: 0 }]),
        d1Result([]),
        d1Result([{ enrollment_count: 0 }])
      ];
      return () => results.shift();
    })(),
    createCode: () => testCode,
    createVerifier: async () => testVerifier,
    stdout: { write: (chunk) => chunks.push(chunk) }
  }), /did not write exactly one row/);
  assert.equal(chunks.join('').includes('QA Enrollment Code'), false);
});

test('one-shot remote flow stops before rotation when an active Enrollment exists', async () => {
  let calls = 0;
  await assert.rejects(() => rotateAndIssue({
    argv: ['--remote'],
    runWrangler() {
      calls += 1;
      return d1Result([{ active_unused_enrollments: 1 }]);
    },
    stdout: { write() { throw new Error('must not write'); } }
  }), /active unused Enrollment exists/);
  assert.equal(calls, 1);
});

test('one-shot remote flow stops without issuance when secret rotation fails', async () => {
  const calls = [];
  await assert.rejects(() => rotateAndIssue({
    argv: ['--remote'],
    cryptoImpl: cryptoFixture(),
    runWrangler(args, options = {}) {
      calls.push({ args, input: options.input });
      return calls.length === 1
        ? d1Result([{ active_unused_enrollments: 0 }])
        : { status: 1, stdout: '', stderr: 'redacted upstream failure' };
    },
    createCode: () => testCode,
    createVerifier: async () => testVerifier,
    stdout: { write() { throw new Error('must not write'); } }
  }), /rotation failed/);
  assert.equal(calls.length, 2);
  assert.equal(calls.some((call) => call.args.includes('INSERT')), false);
});

test('operator helper has no filesystem write path for secret material', () => {
  const source = readFileSync(scriptUrl, 'utf8');
  assert.doesNotMatch(source, /from ['"]node:fs['"]/);
  assert.doesNotMatch(source, /writeFile|mkdtemp|tmpdir/);
});

test('orphan cancellation targets one exact active UUID and rejects a missing or ambiguous target', () => {
  const id = '00000000-0000-4000-8000-000000000123';
  const output = [];
  cancelOrphanEnrollment({
    argv: [`--id=${id}`],
    runWrangler: (args) => {
      assert.match(args.at(-1), new RegExp(`WHERE id = '${id}'`));
      assert.match(args.at(-1), /consumed_at IS NULL AND cancelled_at IS NULL/);
      return { status: 0, stdout: JSON.stringify([{ success: true, meta: { changes: 1 } }]), stderr: '' };
    },
    stdout: { write: (chunk) => output.push(chunk) }
  });
  assert.equal(output.join(''), 'Cancelled exactly one orphan QA Enrollment.\n');
  assert.throws(() => cancelOrphanEnrollment({ argv: ['--id=not-a-uuid'] }), /exactly one Enrollment UUID/);
  assert.throws(() => cancelOrphanEnrollment({
    argv: [`--id=${id}`],
    runWrangler: () => ({ status: 0, stdout: JSON.stringify([{ success: true, meta: { changes: 0 } }]), stderr: '' })
  }), /exactly one active Enrollment/);
});
