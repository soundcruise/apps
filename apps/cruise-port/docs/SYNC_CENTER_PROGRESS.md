# Shared native Cruise Sync status — Port 1.24.29 / Studio 0.71.2

## Basis and scope

Base main: `420ab0a1e9b736758cdd5cd0d01002d0c349535b` (Port 1.24.28 / Studio 0.71.1, PR #161 merged).
Isolated branch: `codex/sync-center-progress-20261102`.
No real Account, connected iPhone, Production service, main branch or existing worktree was operated on.

## Confirmed causes

1. `PortSyncController.ensure()` already tracked an activation Promise, but its status did not expose that flight. Automatic eligibility also awaited asset metadata before entering ensure, without a shared flight. The renderer therefore saw a retained/stale credential and no active runtime, and painted stopped/attention during genuine work. Simultaneous focus/pageshow/online events could repeat the asset eligibility check.
2. `markAppRowsChecking()` covered the four app rows, but not the Port chip, detail, start action or old alert. Both entry HTMLs initially contained an attention chip and a visible start action. An activation rejection could exit the render before replacing those placeholders.
3. The native status snapshot was obtained before awaiting the Account GET. It could be stale by the time that GET finished. A final paint now reads the existing host's current cache.
4. Studio separately normalized Account responses, derived `portObservation`, acquired a reader, injected a second Account panel and rewrote the embedded native renderer. This competing paint could overwrite a native state or require separate recovery. It is removed.

These conclusions concern the measured synthetic transitions and inspected code, not any unobserved Production latency.

## Source of truth and retained layout

- Account identity/Device responses: existing Account DB and AccountClient, through native `SyncCenterController`.
- Data/runtime eligibility: the existing single-owner `PortSyncController`, Account-scoped store and MultiAppSyncRuntime.
- Binary/reference readiness: existing PortAssetSync.
- Status wording, action conditions and conflict entry: `port-sync-status.js` and `sync-center-ui.js`, rendered by native `renderSyncCenterView`.
- Conflict resolution, selections, busy/progress and completion: unchanged shared conflict controller/dialog. It never selects a resolution automatically.
- Studio: the same native iframe/controller, its existing display-only themes, frame sizing and independent scroll. The native Account/Sync workspace can use the existing right window and move back to center while retaining the same iframe. Moving does not reactivate the controller.

Studio Home retains only entrance Pro status, a read-only Account identity observation and instructions for connecting an existing phone Account. It explicitly distinguishes Account confirmation from data Sync completion. It cannot paint the native Sync Center and cannot call ensure/bootstrap/pull/push. Its frame hook now measures timing only; no summary/devices request or native reader is created there. The second embedded Account panel, its recheck button, reader, Sync observation enum and mutation-driven projection are removed.

## Actual async progress, not a timer

The host publishes the existing presentation-only `checking` flag while ensure or automatic asset/Device/runtime activation is in flight. The automatic phase coalesces lifecycle wake-ups into one Promise; completion, rejection, Account invalidation and disposal end that flag. Late asset replies cannot revive an invalidated epoch. Error codes are retained only for the current host and cleared on Account/owner invalidation. No persistent state or new runtime enum is introduced; `checking` reuses the native checking CSS/status vocabulary.

The renderer hides start/retry/conflict actions and stale warning copy while checking. Resolved stopped or failed states restore the appropriate native action. A small native **再確認** button invokes the existing read-only Account load, separately from **同期を開始・再開**, which can exchange real data. Device failure, offline and Account failures terminate the checking paint. Account changes re-check the visible Center using the existing Account subscription and native generation fences; the watcher survives BFCache return.

## State acceptance and user actions

| Existing evidence | Native presentation / action |
| --- | --- |
| No Account | 未接続; existing create/connect actions, no Sync start |
| Account request in progress | 確認中…; no warning or failed-start action |
| Account confirmed, no completed Port connection | 同期は未開始; explicit 同期を開始・再開 |
| Automatic eligibility/Device/initial Sync in progress | 確認中…; no start/retry/conflict action |
| Active incremental or binary work | 同期中; no redundant start action |
| Valid native completion, clean structured/binary state | ✓ 同期済み; no start action |
| Offline | オフライン and retained-data guidance; normal online lifecycle remains responsible for resume |
| 429 / 503 / network failure | Actual communication guidance and native recheck/resume, no endless checking |
| Device / Pro refusal | Existing qualification refusal and retained-input guidance; no bypass |
| Account generation changes | Old flight invalidated; read-only check of current Account; no automatic adoption |
| Unattributable local data | 同期は停止中 and existing explicit review/start action |
| Actual conflict | 競合を確認する (or existing resume-to-load wording if inactive); no duplicate start button |
| Resolution in progress | Existing dialog's busy controls/progress, choices preserved |
| Resolution complete | Existing runtime completion re-renders synced after convergence |

The offline and conflict cases continue using the existing resolution/runtime semantics; this patch does not silently retry a choice, clear pending work or change a conflict payload.

## Contract protection

No storage schema, key, operation payload, Outbox attribution, admission condition, credential issuer, bootstrap rule, Asset Sync, shared code, Worker or four-app Sync contract changes. Initial setup/adoption remains explicit. Proven completed connections retain the existing automatic path. Pro/Account/Device checks remain native. No fixed delay, extra polling, unlimited retry or alternate Sync engine is added.

The only CSS addition in Port wraps the Account status row and prevents the native recheck label from collapsing at phone widths. The remaining mobile layout is preserved. Studio keeps its existing five display-only themes and width/scroll policy.

## Verification and screenshots

All Browser tests use disposable local profiles, synthetic Accounts/Devices and isolated local SQLite/Miniflare. No Production requests are sent.

- Controller/status/UI tests cover actual Promise start/end, coalesced wake-ups, failure, stale Account completion, cause retention and action visibility.
- Product E2E holds the real Device GET at a barrier on both standalone Port and Studio iframe. It asserts **確認中…**, hidden start/conflict actions, empty error detail, then releases that exact request and asserts **同期済み**. Account summary/Device display is allowed to complete first, while the automatic-resume Device request remains held; therefore a completed Account check cannot disguise a still-running data qualification. No sleep is used to manufacture the transition.
- Separate actual cold-start cases inject 429 and 503 into Device confirmation, assert the error action and retained local bytes, then restore service and auto-resume without provisioning/bootstrap.
- Product E2E also covers normal Account connect/join, initial receive, Pro/Device revocation, all tools/apps, Account A/B isolation and local/Cloud storage.
- Recovery E2E covers image source/final, attachment deletion, ACK loss, stable pending operation recovery and two-device CAS with the existing resolution UI.
- Native Studio Browser covers delayed/failed read-only confirmation, Account replacement, no automatic POST/adoption, no Port-home flash, 5 themes × 4 widths, central/right movement with the same iframe and no duplicated Account panel.
- Four known Port base theme/CSS assertions remain independently failing. An additional legacy Studio theme audit has 31/35 passing; its four failures still require the old four-theme/Port-identical bootstrap instead of the current five-theme release. Both groups were reproduced unchanged from archived base source and their failure names match this candidate. No expectations are skipped or weakened. Current five-theme rendering is exercised by the actual product Browser matrix.

See `sync-center-progress-129/validation.json` for final counts. Synthetic comparison captures:

- [Phone checking](sync-center-progress-129/checking-phone.png) → [phone synced](sync-center-progress-129/synced-phone.png).
- [Studio checking](sync-center-progress-129/checking-studio.png).
- [Studio midnight](sync-center-progress-129/studio-midnight.png).
- [Right window at 390px](sync-center-progress-129/right-sync-390.png).

## Repetition finding and fixture correction

A strengthened product-suite repetition exposed a pre-existing fixture sequencing race: the previous case returned when an Account runtime existed, while photo hydration was still in progress. The next case captured byte-for-byte storage before hydration completed, then treated that legitimate original-Account binary binding update as a stale-form save. One repetition timed out after 33 passed cases; another caught the earlier byte assertion. No product save/Account guard was relaxed. The fixture now waits for the **native synced chip**, including binary readiness, before starting the independent form test, and waits for the exact original Account's requalified, non-inert frame rather than any authorized Account. Failure runs and two final full 36/36 successful repetitions after that fixture correction are distinguished in the validation evidence.

## Remaining acceptance / next step

No publication or real-device Sync is performed. After review and separately approved publication, verify the actual iPhone PWA and Mac/Safari using the intended same Account: checking → synced without intervention; offline/online and background return; genuine conflict and selected resolution. Never clear site data or switch Accounts merely to dismiss a status. Real credentials, Production v138 equivalence and real two-device acceptance are not certified by these synthetic results.
