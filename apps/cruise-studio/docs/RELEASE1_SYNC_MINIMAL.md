# Release 1.0: main-based Sync compatibility correction

Status: **Draft / release HOLD**. Image compatibility is corrected. This is not Production acceptance or authorization to deploy.

## Fixed sources and scope

- main: `cb48d8c17b4757a0404d031272a1f36ba92618b5` (Port 1.24.20).
- Port prerequisite #149: `b2f9cf474a8eb50697c7c1e42895c2a1165811af` (1.24.21), branch base.
- Studio public source #150: `7542a19659fd672a7e40eadd36e32914b98c585c`.
- Technical comparison #145: `70cd871a09c36e3394f112f84c37df6555f0a136`.
- All three PR heads and remote main were rechecked and unchanged. No merge/rebase/reset of an existing line.

This candidate descends from main through #149, not the experimental Cloud/UI ancestry. It copies only #150's 34 public Studio files, additive Pages exclusions, and scoped test/build helpers. Of those 34 files, 29 remain byte-identical to #150; five differ for the 1.0.2 version and native Sync navigation below. The existing future-development work is preserved on #150 and preceding PRs. No future Project backend/schema/migration is imported.

Port correction commit: `09c6f676537797584a4ff429b6f7fc031f40e635`. It changes 12 files, +96/-62 including tests, version and cache edges. Core implementation delta: adapter +7/-1; Asset Sync +25/-45. No Port 1.28.2 wholesale import. Port becomes 1.24.22.

Worker, shared, four apps, Service Workers, authentication, wire schemas, storage keys and CAS/Outbox runtime remain unchanged from fixed main. No new Worker/DB/DO/key/Control/Freeze/service or second save path.

## Exact image failure

The sender uses `createGearItem`, real photo crop UI and the original Asset Sync upload. The structured wire record intentionally omits device-local binary IDs. A received image legitimately has remote `asset.source`, `asset.final` and `asset.crop` before its binaries are downloaded.

Before this correction, `restoreAsset` produced the following **local** tuple:

| Stage | Local final/source IDs | Local crop | Remote published metadata |
|---|---|---|---|
| sender after crop | both present | present | source/final/hash/crop present after upload |
| wire | omitted by design | held under asset metadata | present |
| receiver before hydration, broken | both null | non-null | present |
| receiver before hydration, fixed | both null | null | unchanged, including crop |
| receiver after hydration | both new local IDs | published crop | matching binary binding |

Main's actual `isValidV4GearItem` accepts either all three local photo fields null or a complete ID/crop tuple. The broken intermediate tuple fails `validatePortLocalCollections` with `port_storage_invalid:cruisePort.gearList`, subsequently surfaced as read-failed. The fixture's crop is valid `{x,y,size}` and the receiver's **existing validator is not relaxed**. Two added tests fail before the fix with that exact validator/crop mismatch and pass afterward.

A pending local edit must also retain its own crop until resolved; it must not combine local binaries with a remote generation's crop.

Only the relevant existing #145 logic is reused:

1. Keep a complete local tuple or all-null placeholder; retain the remote crop in published metadata.
2. Commit hydrated binary IDs, crop and metadata binding together through the existing dataset repository, checking both the expected metadata and prior local tuple. Mark this as a sync-origin write, not a fresh local edit.
3. A remote image without a downloaded local cache is not a user deletion. Only an existing local binding/removal or missing item is deletion evidence; sync-origin and unrelated-key events do not generate removal intent.
4. Existing prepare/upload/commit/download/hash verification, local stores and delayed release are reused.

## Studio/main lifecycle compatibility

Main explicitly activates native Port Sync and intentionally reloads its document after remote application. It does not supply the newer automatic-start/UNKNOWN lifecycle.

The existing Account・Sync sidebar/status command now opens the native Sync Center **inside the active Practice/Gear/My Apps document** after its existing leave guards. No automatic enrollment/start or permission is added. The user uses the existing native activation control. Back returns to that tool. After native reload, the return route is reconstructed from the existing Studio surface owner, not another storage key. Practice accepts the native Sync Center subroute. This avoids destroying its controller merely to open settings/download a lazy attachment.

A product Browser regression covers all three surfaces, the same frame, explicit Sync navigation, native reload and Back. Existing unsaved refresh/leave guards remain.

The suites were adjusted to this real lifecycle: canonical main module query keys; wait for the expected original operation's server commit; reselect the existing explicit activation control in a newly loaded document; bounded read-only/navigation stabilization when the document really changes. No extra network retries, longer test budgets, skipped assertions or synthesized product rights were introduced. Global `networkidle` is not a valid completion signal for the polling native runtime and was replaced by document readiness plus operation/state assertions.

## Acceptance evidence

All data/profiles/Accounts/Devices/DB/R2 are disposable local fixtures. External browser requests are intercepted; Miniflare outbound fails closed. The native product suite uses real Pro Device Session crypto and main Account/Pro handlers with test-only anti-abuse input. The ordinary Sync/Asset fixture uses the preserved original v137 artifact, **not a guessed v138 artifact**.

- Scoped Node (image/main-validator, binary atomicity, cache/version, edition parity, Studio entrance): **103 PASS, 0 FAIL**.
- Entire top-level Port `*.test.*`: **1,155 PASS / 4 FAIL**, no skips. All four failures are unchanged theme-structure tests; exact frozen-main test/CSS bytes reproduce the same four (22 PASS/4 FAIL). Edition cache assertion was updated to the real new adapter key, retaining strict Standard/Pro shell parity.
- Unchanged shared runtime Node: **182 PASS**, including own echo, same-operation retry, CAS, deletion response loss and Account execution scopes.
- Public Studio UI Browser: **9 PASS**, no skips: all five tools, four Pro apps, NEWS, five themes/four widths, same-frame right pane, unsaved refresh, native Sync/Back after reload.
- Main-native product suite: **22 PASS, then FAIL** at old standalone Account A form saving after Account B replacement; reproduced twice. Earlier cases include formal Studio entrance, wrong/right Pro gate, retained offline metronome/reconnect, Account/Device/Pro refusal/re-auth, four apps, two-way Gear/settings, actual source/final hash equality, lazy Practice binary, offline save recovery, revoked AppDevice Sync refusal. Full suite is **not PASS**.
- Release-specific recovery/assets suite: **12/12 PASS**, repeated on fresh fixture copies. Includes pre-dispatch network/503, committed ACK loss + reload, exact original operation/payload retention, one server change per original operation, near-limit 15MiB photo/upload-ACK loss, image re-edit/delete, My Apps source/final, explicit re-edit-versus-removal conflict, attachment delete ACK loss/replacement, simultaneous two-device CAS and native conflict UI resolution. This does not assert the newer UNKNOWN UI exists.
- Real Jekyll 3.10 safe output: exactly **34** Studio files, all SHA256-equal to the release artifact; **773** emitted native files byte-identical to their fixed-main-plus-Port-patch inputs. All 34 output URLs return HTTP200/hash match; eight deferred development/Project/Pre-DTM/test/script URLs return404. No Pages publication.

Sanitized machine-readable counts/protected trees are in `release1-sync-minimal/validation.json`. Earlier failures were retained locally during diagnosis; their partial passes are not summed into the final counts. No independent second reviewer was used.

## UNKNOWN / recovery decision

| Class | Release decision |
|---|---|
| A — Existing main contract | Keep its Account-scoped durable Outbox, operationId/baseRevision/payload retention, retry policy, own-echo acknowledgement, CAS conflict UI and Asset logical-operation retry. Local synthetic tests confirm short-lived ACK loss/reconnect; deployed v138 behavior is not certified. |
| B — Required for Studio/main compatibility | The image tuple/atomic hydration/removal fixes above and same-document native Sync navigation. Reuse `/v1/sync/*` and the native repository/runtime. |
| C — Separate Port follow-up | Newer UNKNOWN outcome/reconcileUnknown state machine, new writer-admission/Account-affinity model, extended/expired-history recovery and stronger final-SQL candidate contracts. Do not import them wholesale just to satisfy a newer fixture. |

The unchanged source deduplicates by `(user_id, app_id, operation_id)` and operation hash; same-ID changed payload is rejected, while baseRevision remains CAS-protected. The local legacy fixture proves identical retries/own echoes for retained operations, not unlimited replay. Source retention is 90 days for change history and 365 days for tombstones; exact deployed retention and expired/incomplete-history/recreation behavior were not accepted. No operation was silently discarded, re-IDed or CAS-overwritten to make a test pass.

## Explicit remaining HOLD

1. **Account affinity / prior writer P2:** main stops the previous Account runtime and scopes its Outbox, but does not implement the newer local dataset Account binding. On standalone Port, changing A→B while a Gear form is open still permits a local form save. The product negative test remains failing; there is no claim that data is safely adopted by B. Studio's entrance separately freezes retained old-Account forms, and those tests pass. A small image patch cannot establish the missing dataset-owner contract. Do not auto-adopt/enroll old local data under a different Account. A subsequent scoped Port ownership decision is needed before claiming mixed-Account safety. No alternative Owner store/path was invented here.
2. Exact Production **v138 artifact/config/flags** are unavailable. Preserved original v137 SHA256 is `9d880d845b22d7905a5fe5be5b453f074ee28956ce2044ac769c9ee726bbe0b5`; the similarly named edited technical candidate is rejected by checksum. Main Worker source is not assumed to equal the deployed Worker. No Production access/credential acquisition occurred.
3. Physical Asset cleanup on0033, old-client/writer coexistence, expired operation history, real Account/Pro/two-device/macOS/Safari/microphone acceptance, and operational backup/restore/OFF/Canary remain unaccepted. No schema0036 adoption or remote cleanup was performed.

## Reproduction and next steps

Use the committed `package-port-pc.mjs` into a new directory outside the repository; keep the native root at this candidate. Public production code contains no synthetic authority. The loopback `serve-local-pro.py` is a **test-only** UI server with same-origin-only connection CSP; never enter real credentials. Native auth/Sync acceptance uses `port-product-sync.browser.mjs` and `release1-sync.browser.mjs` with `STUDIO_RELEASE1=1`, the 34-file artifact, this native root, a checksum-pinned original local artifact, an isolated synthetic schema seed and the existing local Playwright/Miniflare runtime. The fixture copies the seed and removes Project tables only in its new disposable local copy.

Minimum next work: (1) review the known standalone Account/dataset-affinity boundary and decide the smallest compatible Port follow-up; preserve this negative test; (2) compare an operator-provided, already preserved exact v138 artifact/flags offline and rerun these same suites/retention cases; (3) only after those HOLDs are resolved and separately authorized, run real dedicated test-Account/Pro/two-device acceptance. Main merge, publication and deploy are not authorized by this Draft.
