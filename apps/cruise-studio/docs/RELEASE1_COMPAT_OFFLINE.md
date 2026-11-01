# Release 1.0 compatibility / offline correction (1.0.1 candidate)

Status: two targeted corrections implemented; **public release remains HOLD**. No Production request, deployment, DDL or real qualification was used. This report supersedes assumptions about native dependencies and Pages publication in the initial 1.0 plan; it does not waive its acceptance gates.

## Frozen inputs and independent changes

- UI baseline PR #148: `fdb4cf0718dd186940d022e53ba87d85bc6e60ef`.
- Main and the latest successful Pages build at investigation start: `cb48d8c17b4757a0404d031272a1f36ba92618b5`; Port **1.24.20**, not 1.28.2.
- GitHub repository Pages metadata: `build_type: legacy`, `source.branch: main`, `source.path: /`, successful build at 2026-11-01T04:07:13Z. The generated workflow is `dynamic/pages/pages-build-deployment`. No `.nojekyll` is in this source. Only GitHub metadata was read; no production website/Worker/D1/R2 was probed.
- Minimal Port branch `codex/port-studio-ready-20261101`, based directly on frozen main; commit `b2f9cf474a8eb50697c7c1e42895c2a1165811af`. Independent Studio branch is based on #148. **Do not merge the UI/Cloud ancestry into main to obtain this release.**

## Minimal Port compatibility patch

Independent main-based [Draft PR #149](https://github.com/soundcruise/apps/pull/149).

Only five production files change in the main-based Port patch:

1. `pro-app-boot.js`: after the existing Pro gate admits and the canonical application import finishes, framed documents expose `body.dataset.componentState=ready`, emit `studio-port-ready`, and restore the originally requested route. `CruiseStudioPortTool.pause/stop` delegates to the existing timer control and pagehide teardown. This is initialization notification, not an authentication or writer grant. Failed/locked boot never emits readiness. Standalone boot creates none of these Studio hooks.
2. `app-version.js` / `practice-menu-app.js`: an opt-in `preserveRoute` is passed only by the already-existing framed data-refresh reload. Without this tiny companion correction, a successful Sync reload dropped the hash and Studio detached the tool. Standalone reload defaults/normal refresh remain unchanged.
3. Two HTML cache edges and version/import edges move to **1.24.21**. Unchanged modules retain their reviewed keys. Tests pin those edges and preserve prior NEWS keys.

No store, IndexedDB schema, Pro gate, Account, writer admission, Port Sync runtime, asset protocol or backend was changed. The new readiness hook has no Account/provision/adoption behavior. Native main Sync is explicitly started through its existing `#port-sync-activate` control; tests do not silently substitute the newer 1.28.2 attribution/autostart UX.

## Offline entrance

The previous entrance rejected every native `ok + offline` result and invalidated an admitted owner whenever Account summary failed to reach the server.

The existing Device Session client remains authoritative. Only a **previously online-admitted, still-current in-memory owner in this document** can retain its existing positive finite native offline allowance. Account id, credential, local generation, Pro credential/generation/session/revision, gate state and entrance epoch must still match after awaits. A monotonic deadline can shorten, never renew, that native allowance. No persistent cached Account/Pro proof, credential, key, service or new grace period is created.

- Cold offline opening/reload, stored Account alone, changed Account/generation, replaced qualification, terminal Pro failure, native expiry, and recognized Account refusal stay locked. A reload needs online Account admission again; an open admitted document can continue local work during a transient outage.
- Network/timeout and temporary 429/5xx summary failures can retain only that same verified owner and native allowance. Explicit Account 401/403/410, mismatched/invalid summary and generation change cannot be adopted as offline success.
- Offline state is visible on Home. It grants no backend or writer admission. Existing cloud requests still carry existing Account/device/Pro credentials and face the unchanged server-side authorization/CAS. No Project API is loaded by the release.
- Product Browser verifies the same playing native main metronome iframe survives disconnection/reconnection; an explicit pending Pro revocation locks entry and stops it. Native reauthentication then uses the unchanged Pro gate/API. Existing form/draft retention and Account replacement assertions remain active.

## Actual Pages output, not an exclude assumption

The existing `_config.yml` previously published deferred score/Project/Pre-DTM JavaScript. Its existing rules are retained; 62 additive Studio-only exclusions omit every non-allowlisted path. A static guard catches unclassified new Studio files. No workflow, plugin, flag service or deployment mode was added.

A real **Jekyll 3.10.0 safe build** was executed in disposable local directories. The baseline main build contains deferred Project/Pre-DTM files. The corrected minimal source consists of frozen main plus the Port patch, the exact 34 Studio release files and `_config.yml` — even old main Studio files left on disk are excluded. Result:

- Exactly 34 Studio files; every byte equals the package allowlist source.
- 772 emitted native Port/four-app/shared files byte-identical to frozen main plus the reviewed Port-only patch (including changed Port tests). No native midnight release or shared change.
- A plain static HTTP server over that real output serves all 34 files with matching hashes. Eight forbidden development/module/test URLs return 404, including `development.html`, model/repository, Project Identity/client, app bootstrap and Pre-DTM.

Reproduce with the existing package script and Jekyll `build --safe`, then:

    node apps/cruise-studio/tests/verify-pages-output.mjs "$SITE" "$NATIVE_MAIN_PATCH_ROOT"

Do not serve/publish raw repository files, add `.nojekyll`, use an unreviewed custom-action copy, or overlay an old generated destination without verifying its full contents. A future change must rerun both the exclusion test and the actual output verifier. Hosted plugin/cache behavior and the eventual remote build still require authorized release acceptance; this task did not publish anything.

## Backend evidence and incomplete main acceptance

Production v138's exact artifact was **not obtained**. Git history preserves an original v137 comparison artifact at Cloud PR #56 commit `a4d85ffa7b6fc23b2845fd21ed7e48af33f6162e`; SHA256 `9d880d845b22d7905a5fe5be5b453f074ee28956ce2044ac769c9ee726bbe0b5`. The current similarly named bundle is an edited candidate with hash `94d97e5623c40b09761fb08a3f16691e3f840a6e3ed7521c801661a97ee794cc`, not that original artifact. A hash guard rejected it. Original bytes were reconstructed **only into a temporary fixture**; no Worker file was edited or deleted.

In the pinned-artifact profile, ordinary Sync/Asset routes delegate to that exact original bundle. Native Account/Pro API handlers come from frozen main with existing test-only anti-abuse fixtures and real qualification crypto. Account/Port rollout flags are synthetic fixture configuration, not proof of current production flags. A separate attempt using current main Worker source on local0033 returned bootstrap503 after13 passed cases; this is another reason not to identify source/main with deployed v138. No backend fix is mixed into this task.

**What passes with main frontend + minimal Port patch:** native entrance, five real Pro tools, four real Pro controllers/themes, offline playing/re-entry/expiry/revocation, retained old Account form, basic two-profile Port↔Studio Gear Sync and settings/preset/calendar/My Apps local roundtrip. 18 product cases passed before the first image failure. Eight UI Browser cases pass with main native files. These are not full-main-suite PASS.

**Additional HOLDs exposed by that combination:**

- Gear photo source/final pull fails native local collection validation: `port_storage_invalid:cruisePort.gearList`, surfaced as repository `read-failed`. A test-only diagnostic identified the native validator; that diagnostic was removed. The same failure repeated. The initial normal Sync and saves had passed. This is a reproducible candidate-combination failure, not a new assertion of production data loss. Do not weaken the validator or import the 1.28.2 asset runtime wholesale.
- Main's shared runtime has no `outcome: UNKNOWN` / `reconcileUnknown` implementation. The full remaining suite reaches two passed CAS/conflict cases, then fails the newer pre-commit UNKNOWN assertion. An ACK-targeted run also fails that assertion after the same two passed setup cases. The newer protocol's durable UNKNOWN/read-only reconcile/no-resend contract is **not implemented/accepted for this old client**. This is not a regression introduced by the readiness hook. Do not relabel ordinary retry as that protocol or silently discard pending data.
- Image/attachment/deletion and recovery cases after those failures were not executed in the main suites. Their PASS on the newer candidate is separate evidence, never main/v138 acceptance.

The untouched #148 native dependencies/backend with the corrected Studio entry pass23 product cases and19 remaining recovery/asset cases. That guards the entrance change, but **cannot replace the blocked main/v138 acceptance**. Port's four existing theme-structure Node failures reproduce unchanged on an exact main archive; no skip/expectation relaxation/CSS change is included. See validation.json for counts/scopes and exclusions.

## Reproduction and next gate

For native product/remaining suites use a fresh disposable output, existing local synthetic seed/runtime and:

    STUDIO_RELEASE1=1 STUDIO_RELEASE_ARTIFACT="$ARTIFACT" STUDIO_NATIVE_ROOT="$NATIVE_MAIN_PATCH_ROOT" STUDIO_WORKER_ROOT="$NATIVE_MAIN_PATCH_ROOT" STUDIO_PINNED_WORKER="$ORIGINAL_V137_FIXTURE" STUDIO_SCHEMA_SEED="$SYNTHETIC_SEED" STUDIO_TEST_RUNTIME="$TEST_RUNTIME_PACKAGE" STUDIO_CLIENT_OUTPUT="$NEW_OUTPUT" node apps/cruise-studio/tests/port-product-sync.browser.mjs

The pinned file must match the exact original hash above. Run `port-remaining-e2e.browser.mjs` likewise. `STUDIO_REMAINING_ACK_ONLY=1` is an explicitly partial diagnostic scope, not a full-suite PASS. Omitting native/pinned overrides retains the ordinary candidate regression. All remote browser requests are locally fulfilled/aborted; Miniflare outbound network throws. No production qualification is permitted.

To prepare a future main-based publication candidate, start a **new** isolation from frozen main, apply only the small Port commit, copy only the 34 artifact files plus reviewed Pages exclusions, and run the actual Jekyll/output verifier and native suites. Preserve the full future-development UI on its existing independent branch. Do not merge the Cloud/1.28.2 ancestry or deploy it as a shortcut.

Before real-Account **Sync** acceptance: obtain existing v138 artifact/rollout evidence through a separately authorized read/export; resolve whether the main image and recovery mismatches need a narrowly reviewed client fix, outside this task's no-Sync-runtime-change boundary; then complete the main-based synthetic suites. Only after that should a separately authorized test Account/Pro/two-device/Mac/Safari trial proceed. Real microphone, real qualification, physical devices, native recovery UI, old-writer policy, Asset cleanup, backup/restore and hosted OFF/Canary remain unaccepted. No new safety foundation is proposed. A second independent reviewer was not used for these corrections.
