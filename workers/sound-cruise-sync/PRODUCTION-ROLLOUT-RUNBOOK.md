# Sound Cruise Sync production rollout runbook

P-ROLL-1 adds the tracked gate architecture only. It does not enable production Sync, remove the production-host lockout, configure `sync.soundcruise.jp`, modify DNS/Turnstile, apply the remote migration, or deploy anything.

## Initial production service policy

- The initial rollout uses Workers Free and serves Chord Cruise Pro only. Standard never loads or exposes Sound Cruise Sync.
- The maximum planning assumption is approximately 1,000 users, but rollout starts with a very small enrollment-only cohort.
- During the initial cohort, review Worker requests and errors plus D1 rows read, rows written and latency in the Cloudflare dashboard every day. Also review pending client outboxes, conflicts, Recovery failures and Pairing failures from QA/incident reports without logging user payloads or credentials.
- Sustained usage at or above 50% of the current Workers or D1 Free allowance is the operational trigger to evaluate Workers Paid before expanding the cohort.
- Cloudflare limits can change. Treat the dashboard and current official documentation as authoritative instead of embedding quota values in code or this runbook.
- Reaching a Free limit can cause Worker or D1 operations to fail until the limit resets or the account is upgraded. Use the runtime emergency gates to stop admission first and freeze data traffic only when necessary; local Chord data and queued outbox operations must remain intact.

## Route and gate map

| Class | Routes | Gate |
|---|---|---|
| Health | `GET /health` | none |
| Admission | `POST /v1/sync/start` | rollout mode + `admission_enabled` |
| Pairing | `POST /v1/sync/pairing-codes`, `POST /v1/sync/pair` | rollout mode + `admission_enabled` |
| Data write | `POST /v1/sync/push`, `POST /v1/sync/migration/complete` | `data_write_enabled` |
| Data read | `GET /v1/sync/changes`, `GET /v1/sync/snapshot` | `data_read_enabled` |
| Recovery | `POST /v1/sync/recover`, `POST /v1/sync/recovery-codes` | `recovery_enabled` |
| Cloud Delete | `POST /v1/sync/account/delete-intent`, `DELETE /v1/sync/account` | `cloud_delete_enabled` |
| Device management | `GET /v1/sync/devices`, `POST /v1/sync/devices/revoke` | valid runtime record required; independent of data pause |

The Worker reads the singleton D1 row for every user request. A missing row, malformed value, unknown mode, or D1 read error fails closed. Recovery and Cloud Delete remain available during ordinary admission/write/read pauses only when the authoritative row is valid and their own gates are enabled.

## Supported states

| State | mode | admission | write | read | recovery | delete |
|---|---|---:|---:|---:|---:|---:|
| Initial closed | `closed` | 0 | 1 | 1 | 1 | 1 |
| Cohort | `cohort` | 1 | 1 | 1 | 1 | 1 |
| Open | `open` | 1 | 1 | 1 | 1 | 1 |
| Admission OFF | `closed` | 0 | 1 | 1 | 1 | 1 |
| Write Freeze | `closed` | 0 | 0 | 1 | 1 | 1 |
| Full Data Pause | `closed` | 0 | 0 | 0 | 1 | 1 |

`recovery_enabled` and `cloud_delete_enabled` are changed only for a specific incident affecting those flows. Do not revoke credentials or delete local data to implement a pause.

## Local/test verification before P-ROLL-2

From `workers/sound-cruise-sync`:

```sh
npm ci
npm test
npx wrangler d1 migrations apply SYNC_DB --local
npx wrangler deploy --dry-run
```

Use local D1 only to exercise `closed`, `cohort`, `open`, Admission OFF, Write Freeze, and Full Data Pause. Confirm that a write pause retains the client outbox and credential, a read pause leaves local Chord data usable, and Recovery/Delete follow only their independent gates.

## Runtime-control change procedure for a later approved production phase

1. Reconfirm the Cloudflare account, D1 database ID, Git revision, and approved target state.
2. Read the current singleton row and record its `generation` and all flags.
3. Prepare one explicit SQL file whose `UPDATE` includes `WHERE singleton_id = 1 AND generation = <observed generation>` and increments `generation` by one. Never use a public HTTP admin endpoint.
4. Execute that file with the repository-pinned Wrangler against the explicitly approved remote D1.
5. Read the row back. Require exactly the intended flags, incremented generation, and current millisecond `updated_at`.
6. Run route probes for the intended matrix. Stop on any mismatch.

Emergency shutdown proceeds in order: Admission OFF, then Write Freeze if needed, then Full Data Pause if needed. Recovery and Cloud Delete remain enabled unless the incident specifically requires their independent gates to close.

Example reviewed SQL shape (replace every placeholder and choose flags from the table above):

```sql
UPDATE sync_runtime_control
SET rollout_mode = '<closed|cohort|open>',
    admission_enabled = <0|1>,
    data_write_enabled = <0|1>,
    data_read_enabled = <0|1>,
    recovery_enabled = <0|1>,
    cloud_delete_enabled = <0|1>,
    generation = <observed generation> + 1,
    updated_at = <current Unix milliseconds>
WHERE singleton_id = 1 AND generation = <observed generation>;
```

After approval in the later production phase, execute and verify with explicit remote commands:

```sh
npx wrangler d1 execute SYNC_DB --remote --file /absolute/path/to/reviewed-runtime-control.sql
npx wrangler d1 execute SYNC_DB --remote --command "SELECT * FROM sync_runtime_control WHERE singleton_id = 1"
```

Require one changed row. Zero rows means the generation changed concurrently: stop, read again, and obtain a fresh approval rather than overwriting it.

## Enrollment issuance for a later approved cohort

Enrollment Codes are 100-bit random `SCE1` codes. D1 stores only a dedicated HMAC verifier. They are restricted to `app_id = chord`, expire, and are consumed atomically with successful identity creation.

Never put the plaintext code in a URL, SQL file, command argument, ticket, log, or shell history. Supply the dedicated pepper without typing its value into the command line, for example by securely populating an environment variable in the approved operator shell. The repository helper accepts no plaintext secret argument:

```sh
npm run enrollment:create
```

Show the emitted code once to the invited user. Insert only its verifier and the printed millisecond metadata into `sync_enrollment_codes` through an explicit, reviewed Wrangler D1 SQL file. Delete the temporary SQL file after verifying the row; the file must never contain the plaintext code or pepper. Cancellation sets `cancelled_at`; it does not reveal or recover the code.

The reviewed SQL file contains only this verifier form:

```sql
INSERT INTO sync_enrollment_codes (
  code_verifier, app_id, created_at, expires_at, consumed_at, consumed_by_user_id, cancelled_at
) VALUES ('<64-hex verifier>', 'chord', <created milliseconds>, <expiry milliseconds>, NULL, NULL, NULL);
```

Execute it only in the later approved production phase:

```sh
npx wrangler d1 execute SYNC_DB --remote --file /absolute/path/to/reviewed-enrollment-verifier.sql
```

Before issuing any code, ensure the Worker secret `SYNC_ENROLLMENT_PEPPER` and the operator environment use the same dedicated value. Do not reuse the credential, Pairing, Recovery, Turnstile, or delete-intent pepper.

## P-ROLL-2 prerequisites

- Approve and apply migration `0007_add_production_rollout_control.sql` to the intended D1.
- Provision `SYNC_ENROLLMENT_PEPPER` as a Worker secret without logging it.
- Configure and validate the custom domain and production Turnstile hostname separately.
- Keep the tracked client `DEFAULT_ENABLED=false` and production host lockout until an explicit release decision.
- Run the complete local/test gate matrix before any production rollout change.
