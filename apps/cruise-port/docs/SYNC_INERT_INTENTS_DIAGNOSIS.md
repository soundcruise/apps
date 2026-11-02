# Port 1.24.28 — inert deletion intents must not prevent automatic resume

## Scope and fixed basis

Base: published main `513418e5c211322ecc01bcf7167eb1636453c709` (Port 1.24.27, PR #160).
Branch: `codex/port-sync-inert-intents-20261102`. Studio stays 0.71.1.
Only the isolated candidate is modified. No real-device Sync, Account operation, storage mutation, reload, cache removal, deployment or main update was performed.

## Actual iPhone, read-only findings

USB and Safari Web Inspector connection to the existing iPhone PWA succeeded. The page reported Port 1.24.27, standalone mode, visible/online and an unlocked native Pro gate. Port Sync was stopped with `local_data_unconfirmed`; no Port runtime was active. Resource timing contained six Account API entries and zero `/v1/sync` entries. This is not evidence of fresh server authorization: no API request was made for this investigation.

Existing IndexedDB stores were opened only after confirming their existence, with upgrade aborted and transactions restricted to `readonly`. Credentials and record identifiers remained inside the phone's closure. Output was limited to counts, booleans and type names. No image binary was read. Account IDs, credentials, hashes, image bodies and user records are not included in this evidence.

The current Account-scoped store showed:

- Valid credential shape, active membership, migration complete, dataset ready, positive lastSyncAt and legacy inspected; no pending provision or recorded credential invalidity.
- Native Account generation zero and no pending Account operation.
- Zero Outbox items, terminal items and conflicts.
- 497 shadow records: 436 live and 61 deleted.
- Six deletion intents.
- No repository pending transaction. Existing binary/reference metadata reported no pending Gear photo, icon, attachment, release or discard work and no binding mismatch (four Gear photos, no custom icons).

Metadata records use a `{value, updatedAt}` wrapper. An initial raw-record probe was discarded; the results above unwrap `.value`, matching the native store API. The Asset Sync object's private historical error flag was not separately inspected; do not infer a complete live Asset Sync status from metadata alone.

The **existing Port serializer**, running against a private in-memory copy of the managed localStorage values, produced 436 records. All matched the current Account's live shadow by key and payload hash; mismatch count was zero. The original managed localStorage bytes were unchanged after the comparison. This inspected local ownership evidence, not unseen Cloud changes or the complete history of Account use. No Account mixing was observed, but a general historical safety certification is not claimed.

The six intents cannot represent a new incremental deletion against a live shadow when every live shadow record still has an identical local counterpart. A few inspected entries were orphan practice-history intents; individual contents of all six were not exported. No claim is made that all six have the same record type.

## Confirmed product defect

PR #160 (`042db4d00a9a6498cd328588a12d4330b9ff5df2`) introduced an overly strict test: **every** deletion intent had to match an Account-scoped pending deletion operation and its generation. The real phone had six intents and no pending operations, so that test returned `local_data_unconfirmed` despite an otherwise matching local/shadow dataset.

The existing `MultiAppSyncRuntime.queueDiff()` iterates local/shadow keys, not remote-only or journal-only keys. It skips identical records and cannot create a fresh deletion for an orphan or already-deleted entry. Intents are acknowledged through the existing delete-operation ACK path. A successful ordinary manual Sync therefore need not remove an inert intent: no operation was generated and no deletion ACK exists. The next cold automatic check previously rejected it again.

Synthetic product E2E reproduces that cycle in both standalone Port and the Studio iframe: establish Sync, add six inert history intents in the disposable profile, perform ordinary manual Sync, cold boot, and automatically reach synced while retaining the journal byte for byte.

## Minimal correction

In `port-sync-controller.js`, require an existing generation-matched Account Outbox deletion **only when** an intent corresponds to an absent/deleted local record against a live shadow. Do not delete, rewrite or migrate intents. All subsequent local/shadow/Outbox/conflict hash checks and existing Account generation, Device, Pro, asset and runtime admission checks remain unchanged.

Fresh unconfirmed deletion is still rejected, as is a pending deletion with the wrong intent generation. An existing same-generation own pending operation may resume. Orphan/already-deleted/currently-live-identical intents do not grant permission to write any different record. A test using the actual shared runtime confirms that a remote-only record cannot be deleted just because an intent could exist.

No new key, schema, DB, Owner state, controller, API, Worker or Sync path is added. The behavioral diff is confined to eleven changed lines in the existing controller; other product edits update the Port version and relevant cache edges to 1.24.28.

## Verification

See `sync-inert-intents-128/validation.json` for counts and protected trees.

- Before the fix: controller Node 30/33 passed; exactly the three new inert-intent cases failed.
- After the fix: focused Node 51/51; shared runtime Node 182/182.
- Entire Port Node: 1211/1215 passed. The four unchanged baseline theme/CSS assertions still fail; neither theme product code nor those assertions changed.
- Actual native Port + packaged Studio product E2E: 34/34.
- Existing recovery E2E: 12/12, including exact pending operation recovery, ACK loss, images, attachment deletion and two-device CAS.
- Studio Browser: 17/17, including Account center, release isolation, internal apps and NEWS/series.
- Real local Jekyll safe build: exactly 34 Studio release files with matching bytes; 791 emitted native files match the candidate. Future Project/Pre-DTM URLs remain absent.

All automated tests use disposable local profiles and synthetic Account/Device/DBs. The preserved local legacy Worker fixture is not proof of exact Production v138 artifact equivalence. The [screenshot](sync-inert-intents-128/synthetic-auto-resume.png) is synthetic, not a capture of the user's phone.

## Remaining real-device acceptance

The iPhone remains on unmodified published 1.24.27. No real Sync, push/pull, Account switch or data write was performed. Server Device/Pro qualification, remote updates and corrected automatic resume on Safari/PWA remain untested on real credentials.

Do not clear data, reinstall, switch Account or repeatedly press Sync to diagnose this condition. After separately approved publication of 1.24.28, verify the version and reopen/foreground the same Account. Confirm automatic synced status, then perform an operator-approved small two-device test. If a fresh local edit or genuine conflict remains, use the existing explicit action after reviewing the intended Account. This PR does not approve publication or real-data operations.
