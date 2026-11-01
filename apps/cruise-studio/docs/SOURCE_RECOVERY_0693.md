# Studio 0.69.3 / Port 1.28.2 — UNKNOWN recovery and source Worker candidate

Fixed #143 `2467ea461346b9f8a65a4fe6369e0fdca02d6219` matched at start. New isolated branch only. No Production API, deployment, remote DDL, credentials, freeze or existing PR/main/worktree update.

## UNKNOWN: root cause and exact-operation recovery

The previous client persisted UNKNOWN before dispatch, then paused the entire Port dataset. Readback only recognized committed operations; a request that never reached the server had no matching operation to recognize and could remain blocked forever. Known HTTP rejections were also treated like ambiguous writes.

Keep the existing Outbox and explicit recovery action. Read the authenticated snapshot and changes from the cursor saved before dispatch. A matching current/historical operation is acknowledged exactly as before. Only when the retained history is read completely, with a nonempty saved cursor, valid saved operation and unchanged writer context, replay the exact operationId, payload/hash, schemaVersion, baseRevision and deletion bit through the existing push method. Existing CAS handles conflicts; no new ID or payload substitution. An expired cursor, incomplete bounded scan, missing legacy cursor, changed qualification or mismatching echo retains UNKNOWN and never triggers replay. Limits are still bounded; no unlimited retries.

400 invalid_request/invalid_json/invalid_bookmark and 429 rate_limited are known pre-mutation route refusals: keep the payload with terminal/backoff state instead of UNKNOWN. Generic 503 can follow partial batch application and remains UNKNOWN. Recovery uses current/historical receipts before replay. Conflict results become explicit conflicts and are not overwritten. The button now truthfully says recovery rather than promising that no replay occurred.

Initial migration also captures its authenticated snapshot cursor before dispatch. Source `/v1/sync/changes` allows authenticated initializing Port datasets to expose their existing history (other apps retain the ready-only rule), enabling the same recovery mechanism without a new API or ledger.

## Why blind idempotent replay is not accepted

Existing changes/operation hashes retain 90 days; tombstones retain 365 days. The real schema0033 cleanup test checks the exact boundaries, cursor watermark and tombstone purge. After both history and record are gone, the same old create operation can be accepted again. Therefore unconditional replay is unsafe, even with an unchanged ID. No new retention floor/table/key was invented. Retained-history cursor coverage is the proof used for replay. Legacy/expired UNKNOWN still requires explicit further recovery design, never silent deletion.

## Worker source and schema0033

`studio-release-entry.js` now composes the existing `index.js`, not the 724 KiB compiled snapshot. Both product E2Es import this source. The build graph verifies no `studio-legacy-v137.mjs` dependency. The old file is unchanged and retained for comparison; no exact deployed v138 artifact was available locally, and no Production fetch was made. This is a single-source technical candidate, not a declaration of v138 artifact equivalence.

Identified 0034–0037 dependencies: membership writer columns and writer assertion/cutover tables; asset-operation writer columns; asset deletion reservations; cleanup exclusions. On schema0033, an ordinary compatibility request returns no optional writer admission; claimed unsupported writer protocol is rejected. Existing Account/device/Pro checks and final record SQL fences remain. Partial newer writer schemas fail closed. Asset operations use baseline columns on 0033; advanced schemas keep their existing path. Retention cleanup avoids querying absent cutover tables. These are SQL variants in existing repositories, not another SQL Owner or storage path.

Important functional difference/HOLD: physical Asset cleanup uses reservations from 0036. On 0033 the candidate will not guess a physical delete: reservation inventory is empty and claiming deletion reports `asset_cleanup_requires_review`; scheduled handling returns `HOLD_SCHEMA0033_ASSET_CLEANUP` when encountered while ordinary D1 retention continues. Current wrangler enables asset cleanup, so this is a release blocker, not a harmless optional omission. The exact deployed v138 cleanup behavior/artifact must be obtained through a separately authorized process before choosing its existing baseline implementation or approving a migration. No cleanup mechanism or new schema was created here.

JS Pro checks serve request admission; SQL Pro checks serve mutation-time revocation/lease races. Neither was removed as a superficial duplicate. Production configuration, wrangler entry, existing authentication, Project schema2/CAS/Outbox and public app save formats remain unchanged. Dormant maintenance candidates were not broadly refactored or activated.

## Validation

- Source-based native Port/Studio product suite: 16 PASS, including Account switch, Device/Pro revocation, metadata and source/final binary roundtrip, and shared Project UNKNOWN preservation.
- Source-based remaining/recovery suite: 19 PASS, including pre-commit network failure/503 and same-ID recovery, applied ACK loss/no automatic resend/read-only receipt resolution, two-device CAS, Pro final SQL generation/lease, recrop/delete conflicts, attachment replacement and Device final SQL rejection.
- Project client suite: 32 PASS; separate from Port common Sync acceptance.
- Targeted Port/Shared/Worker Node: 271 PASS; retention/baseline schema suite 13 PASS after strengthening to real cleanup boundaries.
- Studio Node: 1,938 PASS / 2 dedicated environment skips. Project was run separately; Session dedicated suite was not rerun.
- UI Chrome: 10 PASS, five themes/four widths, four apps, Port tools/pane, NEWS, score save/JSON/A4 PDF.
- Standard Worker Node: 941 PASS / 1 FAIL. The unchanged user_label source-text ownership test also matches preexisting maintenance-account-device.js and maintenance-v2-profiles.js. The baseline file scan yields the identical three modules. No skip or weakened expectation; this existing failure is retained as evidence.

Synthetic profiles only; native D1/R2 and in-memory SQLite are disposable/local. DDL is permitted by this task and no remote schema operation occurred. E2E state copies have schema0033 plus the existing isolated Project release tables, whose base fingerprint is checked. The direct SQLite compatibility/cleanup tests use schema0033 without 0034–0037 or Project extensions. Tests and build are not copied PASS results from prior PRs.

Fixture correction: wait for the actual My Apps edit form before setting its hidden file input. The old test could dispatch upload before route initialization. No wait extension, mutation retry or relaxed success condition was added.

## Cost, remaining HOLD and next steps

No new Worker/DB/DO/key/Control/Freeze/second Owner. Existing request/repository/cleanup paths are reused. No snapshot code was deleted: runtime duplication is removed from the candidate graph, while the original artifact is preserved. Most changed app files are coordinated cache references (runtime 35 / Port 1.28.2 / Studio 0.69.3).

UNKNOWN recovery is accepted in the retained-history synthetic scope. Expired/legacy/incomplete-history cases stay explicit HOLD with bytes retained. Worker source basic Sync on 0033 is accepted in synthetic scope; full Production equivalence is NOT accepted because v138 artifact/physical cleanup remain unverified. Real Account/Pro, physical two-device, final Studio entrance gate, midnight Sync enum and historical writer boundary acceptance remain separate. Independent review was not performed in this task.

Shortest release path: review exact-operation recovery and source compatibility delta; fix/review the unchanged Worker ownership test; compare the known v138 artifact and cleanup implementation; settle physical cleanup without inventing infrastructure; then final trusted entrance auth and dedicated real-device acceptance. Do not publish or merge this candidate to main while those release holds remain.
