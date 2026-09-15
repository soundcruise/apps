# Sound Cruise Sync production rollout and incident runbook

Status: M10 general production release activated for Pro editions.
This runbook does not authorize a later gate change or an ad-hoc Remote D1
mutation.

## Current production baseline

Record fresh Git, Pages, Worker, D1 and runtime values before every change. Do
not treat deployment identifiers copied from an earlier report as current.

- Pages source must be the audited release-candidate commit.
- Migration `0018_add_account_admission_provenance.sql` is the only expected
  public-admission schema delta after the `0001`-`0017` baseline.
- Legacy runtime is `open`, but new Legacy Chord start is independently frozen
  because `CHORD_LEGACY_NEW_START_ENABLED` is not exactly `true`.
- Account runtime is `open` with its six operation flags enabled.
- `SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED` is `"true"` and
  `apps/shared/sync-account/production-config.js` has `enabled: true`.
- `SYNC_ACCOUNT_PUBLIC_APP_IDS` lists the four Account apps. This allowlist is
  not an enable switch; invalid or missing configuration fails closed.
- The QA allowlist and exact `soundcruise.jp?sound-cruise-qa=1` activation are
  unchanged. Production Account flow is exposed only by Cruise Port and the
  four Pro editions; Standard editions remain local-only.

## Public-admission security contract

Do not attempt general release by changing one flag or allowlist alone. New
production admission requires all of the following:

1. Worker static gate `SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED` is exactly
   `"true"`.
2. `SYNC_ACCOUNT_PUBLIC_APP_IDS` is present, unique and contains only known app
   IDs.
3. The Account runtime row is valid, has the required operation flag enabled
   and uses `rollout_mode = 'open'` for public bootstrap.
4. The client `production-config.js` is explicitly enabled.
5. Account start arrives from exact origin `https://soundcruise.jp`, passes the
   `sound_cruise_account_start` Turnstile action and Account-start limiter, and
   contains the operation-bound client candidate plus Recovery-save guard.

QA and production do not share provenance. QA requests continue to require the
scoped QA session. Production Account rows and Join invitations use explicit
`production` provenance; production invitations require null QA session fields
and the authenticated issuer Account device. Supplying QA material cannot turn
a QA request into production or vice versa.

After bootstrap, Account summary/device/lifecycle routes require the Account
credential, data-plane routes require the app credential, and Recovery requires
the verifier-only Recovery authority. Turning new public admission OFF does not
disable existing production credentials, data access, Recovery or delete exit
paths. Production handoff remains unsupported; production uses the five-minute
verifier-only App Join path.

## Release-day preflight

1. Require Git `main`, `HEAD == origin/main`, ahead/behind `0/0`, no tracked or
   staged changes, and only reviewed untracked paths.
2. Run the complete app/shared/Cruise Port suite, Sync Worker suite, Requests
   Worker suite, JavaScript syntax checks, `git diff --check`, secret scan and
   both Worker dry-runs. Require zero known failures.
3. Record the exact Pages commit and current Sync/Requests Worker deployment and
   version IDs. Confirm the release commit contains the reviewed public-access
   implementation and its tests.
4. Export or create the approved Remote D1 backup using the Cloudflare operator
   workflow. Never copy credentials, verifiers or payloads into the release
   report. Record only backup identity, time and success.
5. Read and record both runtime-control rows, generations and flags; public and
   QA app allowlists; origin; secret-name presence; limiter bindings; migration
   journal; active unused admission artifacts; Legacy counts; and the protected
   QA Account counts. All database checks are read-only.
6. Require no pending migration except the reviewed public-admission migration.
   Apply it through Wrangler, verify the journal and preservation queries, and
   stop on any orphan, duplicate, cross-scope link or unexpected row change.

## Deploy and enable order

Foundation deployment, while general public admission remains OFF:

1. Apply `0018` first. Both new provenance columns default to `qa`, so the old
   Worker can continue issuing QA invitations during this interval. Verify the
   migration journal, foreign-key audit and preservation counts.
2. Deploy the new Worker with
   `SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED="false"`. The new Worker expects the
   `0018` columns, so reversing these first two steps is unsafe.
3. Deploy Pages with `production-config.js` still `enabled: false`. Verify exact
   source/cache versions and that every Standard app remains local-only.
4. Run health, CORS, public-OFF, QA, existing Legacy and Standard smoke checks.

Later enablement requires separate explicit release approval:

1. Reconfirm the foundation Worker version, Pages commit, migration journal,
   protected QA Account and all read-only integrity checks.
2. Keep client activation OFF while preparing the Worker static gate and
   Account runtime. Each individual layer must still leave public bootstrap
   closed until the approved cutover.
3. If an independently controlled client cohort is available, enable only that
   small cohort and observe it. The current Account `cohort` state by itself is
   not public-cohort proof and therefore does not admit anonymous production
   Account start.
4. Run the minimum smoke and observe error/write amplification before expansion.
5. Only after explicit general-enable approval, set the client config on and
   complete the Worker/runtime cutover. Never enable Legacy Chord new start as
   part of the Multi-App release.

The public static switch, client visibility switch, allowlist and Account
runtime are separately reversible. Do not combine them into one irreversible
state change.

## Minimum release smoke

- Cruise Port: production entry, Account start, one current Recovery Code save
  acknowledgement, and 4-app status.
- One Pro app: initial connect, local-first save, Remote push and second
  container pull; require outbox zero and no duplicate write.
- Lifecycle entry points: Recovery summary, environment list and delete
  confirmation UI without committing a destructive action on production data.
- Conflict UI: Local, Remote and Later choices render for a controlled fixture.
- Existing Legacy Chord: authenticated pull and a normal save still work; new
  Legacy start remains HTTP 423.
- Standard Chord, Pitch, Fretboard and Rhythm: no Account wiring or network
  path.
- Security: exact-origin CORS, unauthenticated rejection, wrong-scope rejection,
  QA/public separation and no secret/payload logging.

## Abort criteria

Stop expansion immediately for unexpected sustained 5xx, Account creation or
credential failures, CORS failures, Legacy regression, duplicate/write
amplification, retry storms, conflict spikes, Recovery failure, cross-app data
movement, QA gate exposure, unexpected lifecycle state, migration mismatch or
loss of rollback capability. Preserve local outboxes and all Remote data while
investigating.

## Runtime kill switches

All Remote control changes require an explicit reviewed SQL file, the observed
generation in the `WHERE` clause, exactly one changed row, and an immediate
readback. Never expose a public admin endpoint.

For an Account admission incident, set Account rollout `closed`, disable
`account_admission_enabled`, `membership_admission_enabled` and
`port_orchestration_enabled`, while initially leaving read, Recovery and delete
enabled so existing users retain safe access and exit paths. For a data-plane
incident, independently freeze writes before reads. Disable Recovery or delete
only when that exact flow is unsafe. Leave
`CHORD_LEGACY_NEW_START_ENABLED` unset/false so Legacy new start stays frozen.
At the next reviewed Worker deployment, also restore
`SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED="false"`; at the Pages layer restore
`production-config.js` to `enabled: false`. Neither action revokes credentials
or removes Account, dataset, record, change, device or outbox state.

## Rollback

### Bad Pages release

1. Disable the public UI/config switch first.
2. Revert the release commit with a normal reviewed `git revert`; do not rewrite
   history or force push.
3. Push, wait for Pages, verify source/cache hashes, and repeat Standard plus
   existing-credential smoke checks.

### Bad Sync Worker release

1. Close Account admission with the runtime kill switch if the current Worker
   can safely read the control row.
2. Use `wrangler rollback --name sound-cruise-sync <known-good-version-id>` with
   the fresh pre-release version ID, not a memorized value.
3. Verify deployment percentage, health, CORS, existing Legacy operations and
   Account read/recovery/delete gates. Do not reverse a forward-only D1
   migration; the old Worker must be schema-compatible before deploy.

### Bad Requests Worker release

Use its fresh pre-release version ID with Wrangler rollback, then verify the
same endpoint routing, headers, CORS and status-only probes. Never inspect a
request or response body to diagnose a secret-bearing operation.

Client or Worker rollback must never delete Account, membership, dataset,
record, change, tombstone, device or outbox state. A migration rollback is a
new reviewed migration, never ad-hoc destructive SQL.

## Incident first response

| Incident | First action | Preserve |
|---|---|---|
| Sync outage | close admission; freeze writes only if required | local data and outboxes |
| Bad client | disable public UI; revert Pages | Remote state and credentials |
| Bad Worker | close admission; roll back Worker | forward-compatible D1 data |
| Write amplification | freeze writes; keep reads/recovery/delete | outboxes and operation IDs |
| Conflict spike | stop admission/writes; keep conflict markers | local, shadow and backups |
| Recovery issue | disable Recovery only; preserve Account reads | current credentials and data |
| QA exposure | disable public UI and Account admission | QA evidence and audit metadata |

Observe Worker error/request rates, D1 rows read/written and latency, Account
creation/Join/Recovery failures, outbox/conflict reports and cleanup batch
results. Never add payloads, credentials, codes, verifiers or Authorization to
logs. Expand a cohort only after the observation window is explicitly approved.

## Legacy v1 production service policy (preserved)

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

## Historical P-ROLL-3 prerequisites

- Approve and apply migration `0007_add_production_rollout_control.sql` to the intended D1.
- Provision `SYNC_ENROLLMENT_PEPPER` as a Worker secret without logging it.
- Validate the temporary `workers.dev` production endpoint and the dedicated production Turnstile hostname separately. Custom Domain remains a future phase.
- Keep the tracked client `DEFAULT_ENABLED=false`; activate only the explicitly selected Pro browser/PWA containers. Production session/global/query overrides remain locked out.
- Run the complete local/test gate matrix before any production rollout change.
