# Single-source Worker: schema0033 cleanup review

Base: PR #144, commit `7138e8277324bfcb0526aa15012a867e38e1a7b1`, tree `3d858e20513fc47c0c3cb3e3b062705282d83c33`. Its head matched at start. Work is isolated from existing PR heads, main and other worktrees. No Production API, credentials, remote DB, R2, deployment or migration was used.

## Decision

The single-source ordinary Sync candidate is retained. **Physical Asset deletion on schema0033 remains a release HOLD.** The preserved v137 handler is known, but contains a reproducible reference/delete race. It is not evidence of safe v138 behavior. The exact deployed v138 artifact was not available in the examined local history/evidence; no Production retrieval was attempted. The compiled snapshot remains byte-identical and is not a product dependency.

Safe implementation completed here: restore expired `unreferenced` assets that have live references, using the existing repository methods, before attempting cleanup. An ineligible schema0033 physical deletion no longer prevents restoration of later referenced candidates. Retain both metadata and object bytes for physical-cleanup HOLD. Existing ordinary D1 retention continues. No table, service, Worker, DO, key, Control, floor, storage path or runtime adapter was added.

## Evidence and contract differences

| Property | Preserved v137 / baseline0033 | Existing source0036 path |
| --- | --- | --- |
| Grace | unreferenced 30 days; prepared/uploaded 24 hours; orphaned Account candidates | existing candidate policy retained |
| Reference protection | read/check before R2 delete; no atomic barrier against a later reference | durable deletion identity and reference-insert/update SQL triggers |
| Deletion identity | direct `object_key` delete then metadata mark | pinned key/version/hash/owner/generations; permanent reservation |
| Recovery | old handler does not durably reserve deletion | existing `deleting`/`recovery-required`/`deleted` ledger; exact claim retries |
| Tables | baseline `sync_assets`, `sync_records` | 0035 `sync_authority_cleanup_claims` plus 0036 `sync_asset_deletions` and triggers |

The evidence test executes the **exact extracted preserved v137 scheduled function** with a synthetic SQLite repository and mock R2. It commits a valid live record after the handler's reference check but before mock deletion. That record is accepted, yet the old handler deletes its bytes and marks the asset deleted. This proves the preserved implementation must not simply replace the reservation path. It does not establish what deployed v138 actually executes.

Normal upload/commit/download retain their existing hash/size checks. Those checks do not make the old scheduled reference check atomic. R2's [Worker API delete method](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) takes keys; checking a hash before that call would not prevent a concurrent SQL reference. No speculative hash-check-only cleanup was introduced.

Tests assert exact 24-hour/30-day boundaries; restoration; no reservation table on0033; HOLD with zero physical deletes; restoration even after an earlier HOLD; and the preserved-handler race. Existing0036 crash/ACK/race/reservation tests remain unchanged and pass. We did not install0036 or enable any authority protocol in a deployed environment.

## `user_label` failure

The old static test scanned every `.js` file and searched for a substring. It counted an unreachable maintenance Account/Device pinning candidate as a product owner and also counted the plural schema journal filename `0031_add_sync_target_user_labels.sql` as column access. PR #143 and #144 retain that candidate; it was not introduced by source entry selection.

The corrected guard follows both actual source entries (`index.js`, `studio-release-entry.js`), including `.mjs`, side-effect imports, re-exports and literal dynamic imports. Computed dynamic imports require an explicit audit rather than silently escaping the guard. It still requires the **sole** product column owner to be `account-lifecycle-database.js`, exactly two bound rename writes, no copying and no name logging. A negative fixture proves unauthorized reachable SELECT/UPDATE is detected. The esbuild metafile independently confirms the maintenance Account/Device candidate and legacy bundle are absent. The reachable maintenance schema profile is journal metadata, not a second column owner. No candidate or audit evidence was deleted.

## Validation and limits

See `source-cleanup-0693/validation.json` for scoped results and unchanged artifact hashes.

- Worker `.test.js`: 947 PASS, zero failures/skips (includes four new cleanup evidence tests and strengthened ownership test).
- Worker `.test.mjs`: 65 PASS, zero failures, **five dedicated Owner/RC fixture modes skipped**. These skips are not acceptance. An initial invocation lacked external `fake-indexeddb`; the final invocation uses both existing dedicated dependency directories and passes.
- Existing service regressions on baseline0033: 74 PASS, zero failures/skips. Account/Device, all five apps' Pro read/refusal coverage, CAS/operationId/retention and legacy records run with the unchanged source, changing only the disposable test helper's default migration cap from37 to33. This is route/repository coverage, not all five apps' native browser coverage on0033.
- Port/Shared related Node: 344 PASS, zero failures/skips.
- Actual Studio/native Port source product E2E: 16 PASS. Remaining recovery product E2E: 19 PASS. Project E2E: 32 PASS. Each records zero Production requests. These native suites use baseline0033 with the existing synthetic Project extension, not deployed Project activation.
- UI Browser: 10 PASS, zero failures/skips: song editing/save/JSON/print/Pre-DTM, five themes, four embedded apps, right pane, NEWS and responsive1440/1024/768/390. NEWS external distribution is not verified; external requests are aborted. Synthetic audio lifecycle does not certify a real microphone.
- Single-source build: 84 inputs, 1,025,924 bytes; neither preserved legacy bundle nor maintenance Account/Device candidate is bundled.
- Studio Node full result is recorded after the isolated code commit, so the existing protected-dirty-file guard is also evaluated in its intended clean state.

Reproduce Node suites using the repository's standard `node --test` globs. The dedicated runtime must provide Miniflare/esbuild/Playwright/fake-indexeddb; keep all output and DB state outside the repository. Product commands remain the existing `port-product-sync.browser.mjs`, `port-remaining-e2e.browser.mjs`, and `studio-sync-client.test.mjs`, with `STUDIO_TEST_RUNTIME`, external `STUDIO_CLIENT_OUTPUT` and the respective disposable `STUDIO_SCHEMA_SEED` / `STUDIO_CLIENT_SCHEMA_SEED`. Never point the seeds at a real or shared DB.

For the extra0033 regression, copy `workers/sound-cruise-sync/{src,test,migrations,package.json}` and `apps/shared` into an external temporary tree preserving those paths. In that **copy only**, change `schemaVersion = 37` to `schemaVersion = 33` in `test/sqlite-d1.js`. Run `pro-entitlement.test.js`, `account-app.test.js`, `account-auth.test.js`, `database.test.js`, `records.test.js`, `sync-database.test.js`, `device-app.test.js`. Source files and assertions must match this commit. No remote DDL is involved.

Worker package patch version is0.1.1. Studio0.69.3 and Port1.28.2 UI/assets are unchanged; no client cache URLs or published app files need updating for this backend-only candidate.

## Remaining release conditions

1. Obtain/review a pinned exact v138 artifact and its original cleanup path through separately authorized artifact access. Compare request/scheduled behavior and configuration; preserve the snapshot meanwhile.
2. Decide whether a demonstrably safe existing0033 cleanup can be reused. If not, physical deletion remains HOLD; migration approval is a separate task. This candidate does not authorize0034–0037 or invent a replacement mechanism.
3. Keep Port common-data Sync and Project Sync acceptance separate. Retained-history UNKNOWN recovery is synthetic-accepted; expired/legacy/incomplete history remains explicit HOLD with local data retained.
4. Final trusted Studio Pro entrance, real Account/Pro, physical two-device acceptance, Safari/mobile and real microphone remain unaccepted. Historical writer/old-client boundaries and the native midnight Sync enum require their own acceptance; Pro entitlement is not writer admission.
5. No independent reviewer was used in this task. Full Production equivalence and removal of the old snapshot are NOT approved. No main merge, public Pages or deployment is part of this work.
