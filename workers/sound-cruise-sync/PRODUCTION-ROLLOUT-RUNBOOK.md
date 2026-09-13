# Sound Cruise Sync production rollout runbook

P-ROLL-2B deploys the production foundation to the temporary `workers.dev` endpoint. It keeps the authoritative runtime state `closed`, leaves the Chord production rollout flag OFF, issues no Enrollment Code, and does not begin a cohort or public rollout.

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

## Local/test verification before a rollout-state change

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

## Sensitive UI operation

Treat Enrollment, Pairing, Recovery and Turnstile screens as sensitive surfaces. This section applies to production QA, incident support and browser automation. It does not relax any Worker gate or authorization check.

### Never capture

Never place any of the following in a Codex/browser-automation result, command output, console, operation log, report, screenshot, recording, accessibility snapshot, network dump, HAR, clipboard read, form serialization or storage inspection:

- Recovery Code, including the initial code and the replacement code shown during Recovery or rotation
- Pairing Code
- Enrollment Code
- device credential, `Authorization` value, Recovery claim, delete intent or another bearer value
- Turnstile token

On a sensitive surface, do not read the full DOM, `document.body.textContent`, full `innerText`, a full accessibility tree, an AX snapshot, a page dump or OCR. Do not inspect input values, the clipboard, request/response bodies, IndexedDB or local storage to find a secret. A normal page-capture workflow is not permitted merely to locate a button.

### User-only operations

Only the user may type, copy, save or transfer a plaintext secret. Codex may open the known page and then must stop before the secret is entered or displayed.

For Recovery input, instruct the user to enter the Recovery Code and reply only `入力済み`. Never read the field after entry. For a newly displayed Recovery Code, do not read or capture the page; instruct the user to save it and reply only `保存済み`. The same rule applies to Enrollment input and Pairing transfer between storage containers. The Enrollment issuance helper must be run by the user in a terminal that is not being captured by Codex; Codex must not invoke it because its one-time plaintext output would enter the tool log.

### Information Codex may verify

Use source inspection, narrowly scoped non-secret UI state and verifier-only D1 queries. Codex may verify success/failure, app ID, counts, shortened user/device IDs, user and dataset state, Recovery version, claim/consumed/cancelled state, verifier presence and HTTP status. It must not select verifier values when a Boolean presence check is sufficient.

Turnstile is verified only as a Boolean success/failure state. Never inspect its callback token, hidden fields, widget internals or request body. The non-secret container `#sound-cruise-sync-turnstile` may be used only to establish widget presence; it must not be dumped.

### Recovery operation sequence

1. Confirm the production gates, target identity metadata and expected summary with read-only queries.
2. Open the known Recovery page. Stop and ask the user to enter the code and reply `入力済み`.
3. Do not inspect the Recovery input. Operate a control only when it has a pre-audited stable selector; never discover it from a page-wide scan or a positional selector.
4. Read only dedicated non-secret summary elements for app, Chord count, Folder count, total records, active device count and last update. Compare them with the read-only baseline.
5. Before the replacement Recovery Code is shown, stop again. Once it is displayed, do not capture the screen or DOM. Ask the user to save it and reply `保存済み`.
6. After the user confirms, operate the pre-audited save/commit control. Verify completion from non-secret state and read-only D1 metadata.

If any required stable selector or non-secret state marker is absent, stop. Do not substitute text search across the page, `nth-child`, coordinates learned from a screenshot or an accessibility snapshot.

### Static selector audit and current limitation

The current Sync section has these stable non-secret containers:

- `#cc-sync-pairing-section`
- `[data-sync-pairing-status]`
- `[data-sync-pairing-actions]`
- `[data-sync-pairing-result]`
- `#sound-cruise-sync-turnstile`

`[data-sync-recovery-code]` and `[data-sync-sensitive="recovery-code"]` identify the displayed secret and are forbidden targets; their existence does not authorize reading them. `[data-sync-sensitive="recovery-code-input"]`, `[data-sync-sensitive="pairing-code"]`, `[data-sync-sensitive="pairing-code-input"]` and `[data-sync-sensitive="enrollment-code-input"]` are likewise avoidance markers, not readable selectors.

Recovery automation must read only the root marker `[data-sync-recovery-phase]`: `input`, `summary`, `new-code`, `commit` or `complete`. An absent or unknown phase is fail-safe: stop. The only permitted Recovery actions are `[data-sync-recovery-action="open"]`, `[data-sync-recovery-action="prepare"]`, `[data-sync-recovery-action="continue"]`, `[data-sync-recovery-action="confirm-saved"]` and `[data-sync-recovery-action="resume-commit"]`. In the Recovery path, `confirm-saved` transitions from `new-code` to `commit`; it is the commit trigger and must be used only after the user has replied `保存済み`.

On the `summary` phase, read only these individual non-secret elements: `[data-sync-recovery-summary="app"]`, `chords`, `folders`, `records`, `devices` and `updated-at`. Do not read the action container, a sibling text node, or an unspecified element as a substitute. These selectors are the complete Sensitive UI automation contract; full DOM/AX exploration remains prohibited.

### Incident handling

If a secret appears in an operation log, stop capture immediately, do not repeat the value, classify the capture source, rotate or invalidate the secret through the normal product flow where appropriate, and record only the remediation state. A full DOM/AX state containing an input value counts as disclosure even if the log is local.

## Per-container client activation

Client activation is a UX visibility gate, not an authentication or admission boundary. The Worker runtime row, one-time Enrollment Code, Turnstile, and device credential remain authoritative.

- Chord Cruise Standard never loads the activation controller or Sync bootstrap. A copied activation state cannot enable Standard.
- Chord Cruise Pro stores `{ "version": 1, "enabled": true|false }` under `chordCruise.syncProductionCohort` in the current container's local storage.
- Missing state, invalid JSON, malformed fields, or an unknown version fail closed.
- Query parameters, the local-QA session flag, and the local-QA global flag cannot enable production.
- Safari and an installed Home Screen PWA must each be activated inside their own storage container. Do not copy storage between them.

The activation page is `apps/chord-cruise/pro_k7m4q9v2x8/sync-cohort.html`. It is Pro-gated and intentionally absent from normal navigation. To reach it from the currently open Pro container, open Settings and tap the displayed app version seven times within five seconds. This same-container entry is required for an installed PWA, which has no address bar.

After selecting **この端末で先行テストを有効にする**, the page returns to Chord Cruise and only that container loads the Sync implementation. Runtime `closed` still rejects admission with HTTP 423. Runtime `cohort` still requires a valid unused Enrollment Code.

To deactivate, open the same page and select **この端末の先行テスト表示を解除する**. Deactivation only writes the disabled activation state. It must never delete or revoke the device credential, IndexedDB, outbox, local Chord data, or cloud data. Re-enabling the same container restores the UI around the retained Sync state.

## P-ROLL-3 prerequisites

- Approve and apply migration `0007_add_production_rollout_control.sql` to the intended D1.
- Provision `SYNC_ENROLLMENT_PEPPER` as a Worker secret without logging it.
- Validate the temporary `workers.dev` production endpoint and the dedicated production Turnstile hostname separately. Custom Domain remains a future phase.
- Keep the tracked client `DEFAULT_ENABLED=false`; activate only the explicitly selected Pro browser/PWA containers. Production session/global/query overrides remain locked out.
- Run the complete local/test gate matrix before any production rollout change.
