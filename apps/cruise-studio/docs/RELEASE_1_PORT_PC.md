# Studio 1.0 candidate — Port PC edition

Follow-up: [main compatibility, offline correction and verified legacy Pages output](RELEASE1_COMPAT_OFFLINE.md). That report supersedes the initial raw-root publication assumptions below.

Fixed starting point: PR #147 `066780ffce9e09cb97762cd35e1b0bfff9fca9da`, tree `5c4dc192ecc304283035d6647797668cd18a9c78`. Head/tree matched. Independent worktree/branch only. This candidate has not been published or accepted against Production.

## First-publication scope

| Included | Implementation/authority |
| --- | --- |
| Studio entrance Pro + Account | unchanged shared gate, native Device Session and Account DB/API |
| Tuner, metronome, practice/calendar, Gear, My Apps | canonical Port Pro documents/controllers/local stores |
| NEWS | existing Port NEWS screen/provider |
| Pitch, Fretboard, Rhythm, Chord Pro | existing app DOM/controllers and trusted entrance source |
| Port common-data Cruise Sync | existing native Port runtime/repository, `/v1/sync/*`, Account/Pro, D1/R2 |
| Central/right pane, resize, navigation, five display themes | existing shared Studio shell/presentation, same iframe owner |

The Home and sidebar agree: Home → Account/Sync → five tools → NEWS → four apps. Account/Sync opens the existing native Sync Center. Status reports verified Account/Pro, without pretending the Port dataset has already been connected or the last transfer succeeded. Native Sync Center remains the authoritative detailed status/settings UI.

## Deferred, preserved and absent from publication

Score editing, Pre-DTM, Project model/repository/registry, Project Sync/Outbox/Identity Host and the Project-specific backend remain development work. `development.html` retains the full product DOM/controllers and Pro entrance. Existing model/schema2/CAS/Outbox code is not removed or replaced. The scroll owner was extracted intact for both entries; the shell registers only actual workspace nodes. Existing development tests explicitly target that development page.

Public `index.html` uses `js/port-pc.js`, not `js/app.js`. It loads no Project model, storage/repository, editor, VexFlow, Pre-DTM, Project Cloud panel/client or Identity Host. No such save API, command registration, handler or background Project Sync exists in the public runtime. Unknown/future hashes and workspace commands cannot activate missing workspaces. Old Project bytes remain untouched; no migration or cleanup is performed.

**Publish only the fresh artifact produced by `scripts/package-port-pc.mjs`, never the repository root.** The explicit34-file artifact excludes `development.html`, tests/fixtures/docs, all Project/Pre-DTM modules, workers/migrations and every native app/shared file. Direct requests/imports to future modules or the development page return404 in that artifact. A URL/query/runtime config cannot install code that is absent. Merely hiding menus was rejected as insufficient.

Packaging command (local output only):

    node apps/cruise-studio/scripts/package-port-pc.mjs --out /absolute/new/external/directory

The script refuses an existing destination or a repository-internal output. Its manifest pins every published file hash and records source head/dirty state. `productionReady:false` is evidence metadata, not a new security control. Build from a clean fixed commit for acceptance. A clean Studio publication prefix is required; overlaying this subset onto an old full-development publication can leave forbidden files reachable. No existing remote files were changed here.

Four-app native midnight addition is also deferred. Its prior development code remains in the repository but **no native app/shared file is included in this release artifact**. Studio's five themes are display-only projections and do not require native midnight. A separate compatibility run serves the four apps from fixed pre-addition commit `7dbfa5b51352ecca8c9497eefa9932d88c0b82d2`. That is compatibility evidence, not a claim this commit exactly equals deployed apps.

## Dependencies and data boundaries

Required: existing same-origin Port/four-app/shared deployment, Pro APIs, Account APIs and ordinary Port Sync/Asset APIs. Same origin is necessary for the current shared Account/Pro storage and native iframe DOM contract. Another hostname is not accepted by assuming storage/qualification transfers.

Not required: `/v2/studio/*`, `/isolated/studio/*`, Project enrollment/session, Project model validators in the Worker, Project SQL tables/views, Project Outbox or Project-specific Worker activation. No Project DDL or two-table proposal is implemented/adopted. Port's own Outbox/CAS/UNKNOWN/Asset paths are retained, not disabled with Project Sync.

The synthetic release backend imports existing `index.js` plus the existing test-only native Account/Pro anti-abuse fixtures. It does not activate the Project worker. Only in the newly copied disposable local DB, Project extension tables/views/triggers are removed before boot. Tests assert that no `studio_%` schema object is required. This is fixture preparation, not a Production migration proposal. No deployed Worker/configuration or D1/R2 state was accessed or changed.

The source candidate and inherited local frontend dependencies are not proof of deployed v138/frontend equivalence. Check the actually deployed Port ready/stop contract (`componentState`, `studio-port-ready`, native media/timer stop), shared qualification versions, native URLs and origin/CORS/Turnstile compatibility before publishing. The artifact deliberately does not silently update those dependencies.

## Acceptance and regression evidence

See `release1/validation.json` for final counts/scopes. Release product E2E uses the artifact's actual `index.html`, disposable Chrome profiles, native Account/Pro cryptography and local workerd/D1/R2. Other network requests are aborted. No real credential or user data is used.

- Release product suite covers entrance/Account, five tools, four Pro controllers, five themes, Account/Device/Pro expiry/re-entry, old-form retention/discard, native metadata/preset/settings roundtrip, Gear photo and practice binary, bidirectional Port Sync, offline reconnect, native Device refusal and old Account adoption rejection.
- Dedicated remaining-Port suite covers same-base CAS, UNKNOWN, ACK loss/reconcile, mutation-time Pro/Device refusal, matched source/final, icon/photo deletion/re-edit and attachments. It runs with the same Project-free release profile.
- Explicitly deferred development-only Project cases are recorded separately rather than counted as release PASS. The release checks missing API/module/route/command entry, untouched existing Project sentinel, and no Project backend requests/schema.
- Release Browser covers the artifact, central/right same-frame transfer, central unsaved refresh refusal, widths1440/1024/768/390, five themes, sidebar, NEWS, four apps and Sync Center. It uses the existing loopback synthetic-authority fixture and is not formal entrance proof; the native suite above is that separate proof.
- Development Browser preserves the original song → save/re-edit → JSON/print/Pre-DTM flow and score/right-pane state. Full Studio Node still covers the retained model/history/save contracts.
- Existing Port/shared/Worker Node and unchanged Git trees provide candidate regression evidence. They do not certify every deployed Standard/Pro app, actual microphone, Safari or physical devices.

A discovered update-protection gap was fixed in the shared shell: visible central forms/crops are now included as well as right-pane forms. The update handler also checks parent IME and still rechecks before reload. No Port form/save logic was changed.

## Release 1.0 gates

| Required before public use | Current state / minimum next evidence |
| --- | --- |
| Real Account/Pro, registration/recovery/expiry | synthetic native API entry accepted; actual credentials and full native recovery UI remain unaccepted |
| Real two-device Port Sync, CAS/UNKNOWN/images/deletion | synthetic two-profile accepted; real device/old-build compatibility and noncooperating writer policy still HOLD |
| Deployed Port/four apps/shared and existing Worker contract | candidate and pre-midnight app runs accepted; exact deployed artifacts/interfaces/origin/cache/CORS remain unverified |
| Mac Chrome/Safari, microphone/audio/timers | headless Chrome synthetic only; real permission denial/retry/device changes and Safari lifecycle remain unaccepted |
| Asset cleanup on0033 | physical-cleanup HOLD retained; obtain existing v138 implementation/config evidence and approve its operational handling separately before image Sync release |
| Minimum Backup/Restore | define a coherent existing D1/R2 recovery point, retain prior artifact/config, rehearse on a disposable restore; no new backup service and no Production action here |
| Production OFF / Canary / rollback | not executed; approve an existing-route frontend-only rollout/observability/stop plan that does not stop existing Port users or discard client data |

Prefer leaving the deployed Worker unchanged for this frontend-only release. Full candidate single-source v138 replacement equivalence/old-bundle removal is conditional on **later deploying that candidate**; it need not force Project/backend reconstruction into1.0. Nevertheless actual deployed Port Sync/Account/Pro compatibility is a mandatory1.0 gate. If that contract is insufficient, identify a minimal existing-Worker patch and separately accept/deploy it; do not assume the local source is Production-equivalent. Physical cleanup uncertainty is not waived by removing Project Sync.

Deferred after1.0: score/Pre-DTM feature completion and schema decisions; Project Cloud storage design/DDL/activation/acceptance; native midnight releases for the four apps; removal of the preserved Worker snapshot after equivalent replacement is proven. No new flag service, Control, Freeze, DO, key, DB or Owner path is introduced.

## Shortest three stages

1. Review this fixed artifact and obtain deployed frontend/Worker evidence. Confirm same-origin dependency contracts, old-client/writer policy and the existing cleanup handling. Keep all failing/unknown release gates HOLD.
2. With separate operator authorization, complete real Account/Pro + two-device + Mac/Safari acceptance, native recovery UI, and the minimal existing D1/R2 backup/restore rehearsal. No new safety infrastructure.
3. After those gates pass, authorize frontend-artifact-only Canary using the existing deployment/monitoring/rollback process. Keep Project paths absent, native app/theme releases separate, and Worker/D1/R2 unchanged unless a separately accepted compatibility patch is necessary. No publish/deploy/merge is performed by this task.

## Local reproduction

Use the fixed branch, Node with `node:sqlite`, an external existing Playwright/Miniflare/esbuild test runtime and disposable Chrome only. Do not copy operator credentials into the fixture. The native suites intercept every request and use local workerd; they must not be pointed at a real database.

    node --test apps/cruise-studio/tests/*.test.mjs
    node apps/cruise-studio/scripts/package-port-pc.mjs --out "$ARTIFACT"

For each native run, create a new external `$OUTPUT` directory. `$SEED` must be the existing synthetic disposable fixture, never an operator database; the suite copies it before local preparation. `$RUNTIME` is the external test-runtime package.json. Chrome's test profile is created by the suite.

    STUDIO_RELEASE1=1 STUDIO_RELEASE_ARTIFACT="$ARTIFACT" STUDIO_SCHEMA_SEED="$SEED" STUDIO_TEST_RUNTIME="$RUNTIME" STUDIO_CLIENT_OUTPUT="$OUTPUT" node apps/cruise-studio/tests/port-product-sync.browser.mjs

Run `port-remaining-e2e.browser.mjs` with the same profile and a different fresh output. To repeat pre-native-midnight compatibility, also set `STUDIO_APP_REVISION=7dbfa5b51352ecca8c9497eefa9932d88c0b82d2`. To verify retained development, omit both `STUDIO_RELEASE1` and the artifact override; the native suite then exercises `development.html` and its original Project fixture.

For visual/UI acceptance only, run the existing loopback-only synthetic-authority server with `--release-root "$ARTIFACT" --port PORT`; point `STUDIO_URL` at its `/apps/cruise-studio/index.html`, set `CHROME_PATH` and the external `NODE_PATH`, then run:

    node --test --test-concurrency=2 apps/cruise-studio/tests/release1.browser.cjs apps/cruise-studio/tests/internal-apps.browser.cjs apps/cruise-studio/tests/port-news-series.browser.cjs

The synthetic-authority preview is **not** the formal authentication test and must never receive real Account/Pro data. Native authentication acceptance is the separate local product suite above. Screenshots default to a temporary directory or explicit `STUDIO_SHOTS` and are not published with the artifact.
