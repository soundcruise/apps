# Native Port stale-Account save correction (1.24.23)

## Fixed baseline and result

Base #151: `0497fa029456a108defc0d82d983d43150fd5186`, tree `41574e5b2061d051eba13c26457b69eec324c476`. It descends from fixed main `cb48d8c17b4757a0404d031272a1f36ba92618b5` through #149 and the main-based image correction. #150 supplies the already-reviewed public Studio34 bytes; #145 is comparison evidence, not newly imported code. A new isolated branch preserves all existing heads/worktrees.

The old standalone-form defect is corrected in the synthetic product. This is not Production or complete dataset-Owner acceptance. Port advances1.24.22→1.24.23; Studio public code remains1.0.2, byte-identical across all34 release files.

## Root cause and minimum correction

Native Account storage already invalidates its generation before/after Account changes and broadcasts invalidation. Port's Sync controller subscribes and disposes the previous Account runtime. Its durable Outbox is already scoped to the Account. The local form, however, carries only the loaded item/input data; the dataset repository previously checked dataset CAS and caller guards, not the native Account context. The form therefore reached a valid local commit even after the old Sync runtime stopped. Studio additionally freezes retained frames at its entrance, which standalone Port does not have.

The production factory now supplies the existing native Account storage to its existing repository. The repository captures only an in-memory document context from that source (Account/device/credential fields), without a persistent Owner key, schema, dataset copy, permission grant or network request. It compares native fields as they exist, including historical records, rather than requiring a new Account schema.

For each existing repository operation:

1. Compare the current native DB context with the original document context before preparation and after asynchronous preparation.
2. Capture the native generation for this particular save; compose its checks with the **existing** caller `assertCurrent` and synchronous `commitGuard`.
3. Reuse existing final guard, rollback and publication handling. An Account change during preparation/lock wait/storage publication rejects or rolls back, and a post-publication invalidation cannot wake Sync as an authorized local save.
4. Reject a different Account, Account Device or credential. Returning to the same original Account/Device can save again in the retained document; a same-identity reauthentication generation does not permanently poison that document. A new/reloaded B document captures B normally.
5. Preserve missing/invalid caller permission-guard rejection. The Account guard is not an authorization substitute. Pro/backend Account/device/Sync checks are unchanged.

No form-specific grant, new adapter, Worker, DB, DO, key, Owner save path, Control or Freeze is introduced. No existing dataset field, API payload or CAS/Outbox runtime is changed.

Gear, categories, My Apps, Practice and other coordinated stores share this boundary. Gear/My Apps image workflows already persist references before deleting old binaries and clean up only new temporary binaries on failed metadata save, retaining the staged crop/input. Practice existing-file add/delete bypasses metadata persistence first, so it now performs a **no-change transaction through the same repository** before touching binary data. Rejected file selection stays selected, and rejected deletion does not touch the file/reference. This preflight is not another save path.

Production logic changes are confined to three existing Port files: repository, factory wiring and Practice binary preflight. `app-version.js` is a version-only change. The remaining Port JS changes are query-key propagation through the existing ES-module import graph: the new guard must not be mixed with cached old store factories. One shared **test** registry import changes to the canonical Port module URL; no shared product/auth code or four-app file changes.

## Reproduction and product acceptance

The fixed #151 native root was exercised before applying the fix:22 earlier product cases pass, then the original Gear A→B stale-form save assertion fails with the actual stored item changed. Initial runs also encountered a native document reload in a fixture read; that read uses the pre-existing bounded read-stabilization helper without changing the assertions.

After correction, the release product suite completes **25/25 PASS on three fresh fixture copies**, with zero browser errors and external Production requests blocked:

- Original formal Studio Pro/Account entrance, native five tools, four original Pro controllers, offline metronome/reconnect, Pro/Device revocation and reauthentication, retained old-Account frames, source/final image hash roundtrip, lazy Practice attachment and two-way Port↔Studio data.
- Standalone A form saves a normal A edit; a real A diff is staged by the existing runtime into its Account-scoped Outbox without sending. A further unsaved text/cropped-photo draft is held. After selecting a real synthetic B record through the native Account DB, the old form save fails. Stored Gear/asset metadata and the A pending operations remain unchanged; B Outbox is empty and no old runtime survives. After restoring A, that same form/crop saves successfully.
- Studio's retained frame is inert under B. Even a stale script's actual `requestSubmit()` cannot bypass the repository guard. Restoring the original Account Device unlocks and saves the same document.
- A fresh B standalone document saves normally without inheriting an A runtime or Outbox. Actual category, My Apps and Practice forms reject a foreign Account, retain input, then save under their original B context. A pending Practice file survives the rejected form save and later saves; existing-file deletion is refused under the foreign Account and succeeds after returning to B.

The fixture observes the existing repository's completed result for the direct attachment rejection and then verifies both the negative and positive real delete actions. It does not replace a guard or inject authority. The native gate fixture also now waits for the previous submit's `finally` (input cleared/button enabled) before entering the next code; it does not weaken authentication or extend deadlines. Cropped-photo retention compares bytes/SHA256 after crop completion, not disposable object-URL identity.

The prior final assertion for `inspectLocalAccount/chooseLocalAccount` belonged to an unadopted Owner architecture absent from main. It is replaced by concrete old-form rejection, actual A/B Outbox isolation, retained data and normal A/B save assertions. No stub Owner API was added to satisfy a fixture.

## Regression

- New Account guard/real-store Node:20 PASS, including changed Account/device/credential, null/local-only context, same-identity reauthentication, legacy shape, A-B-A during save, delayed cross-tab notification (DB changes without notification), lock wait, storage-I/O rollback, missing caller guard and post-commit notification suppression.
- Complete top-level Port `*.test.*`:1,175 PASS,4 existing theme FAIL,0 skip. These four unchanged tests/CSS are the same exact-main baseline failures retained in #151. No skips or weakened expectations.
- Nested Port candidate/regression Node:1,304 PASS,0 FAIL. Unadopted authority/backend test results do not activate those candidates in the product.
- Shared runtime + Studio entrance Node:199 PASS. A stale shared test import is updated to the same canonical Port registry URL used by the production store, retaining the deletion-generation/ACK assertion.
- Release recovery/assets E2E:12/12 PASS twice on this guard, covering exact-operation ACK retry/own echo, network/503, image source/final/re-edit/delete, attachment delete/replacement, explicit conflict resolution and two-device CAS.
- Release UI Browser:9 PASS:five tools, four apps, NEWS, five themes/four widths, central/right same frame, native Sync/Back after reload and unsaved refresh guard.
- Real Jekyll3.10 safe output:exactly34 Studio files matching unchanged release hashes,774 emitted native output files byte-equal to inputs. Development/Project/Pre-DTM files remain excluded. The extra native file is the new Port test, following the existing repository's publication behavior; no new app/backend product is added.

See `account-save-guard/validation.json` for sanitized case counts and protected-file evidence. No independent second reviewer was used. Source was self-reviewed for caller-guard composition and stale publication/rollback behavior.

## Scope and remaining release HOLD

This is a **stale-document operation guard**, not persistent dataset ownership or Account-based partitioning of the device-local Port collections. A Pro qualification or merely having an Account DB still does not grant Sync/writer admission. B's fresh local edit is tested with native Sync inactive; the patch does not automatically enroll B, transfer A pending work, relabel all existing local data, or add a second Owner. Explicit cross-Account dataset adoption/enrollment, old-client/writer coexistence and fully concurrent cross-context Account/binary commit contracts remain separate acceptance. The existing Account DB and dataset repository are not transformed into a new cross-DB transaction system.

Exact Production v138 artifact/configuration, physical Asset cleanup on0033, expired operation-history behavior, real Account/Pro/two-device/macOS/Safari/microphone and operational backup/restore/OFF/Canary remain unaccepted. Ordinary Sync/Asset synthetic tests reuse the checksum-pinned original v137 artifact; native Account/Pro handlers/crypto and all test data are local fixtures. No Production access, real credentials, remote DDL, deploy, publication or main merge.

Minimum next steps:review this scoped guard and retained release HOLDs; offline-compare an already-preserved exact v138 artifact/flags plus cross-Account explicit-adoption expectations; then, only under separate authorization, perform dedicated real test-Account/Pro and two-device acceptance. The old-form rejection itself no longer blocks synthetic Release1.0 product completion.
