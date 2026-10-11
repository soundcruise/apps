# Port Runtime & Integration Safety v1 — 検証記録

2026-10-11 / Port 1.22.0 / Studio 0.25.1。
契約は[Runtime Host](PORT_SYNC_RUNTIME_HOST.md)、保存契約は[Dataset Repository](PORT_DATASET_REPOSITORY.md)を参照。

## Baselineと最終結果

開始時 HEAD / origin/main / remote main は `65ef058336b02c20d74610ad7f7df8a57369a175`。
main、ahead 0 / behind 0、tracked clean、staged空。
既存untracked `.claude/` と `workers/sound-cruise-sync/node_modules/` は操作対象外。

| 検証 | baseline | 最終 |
|---|---:|---:|
| Port / shared | 1346 PASS | 1370 PASS / failure 0 |
| Worker / Account | 592 PASS | 592 PASS / failure 0 |
| Chord / Pitch / Fretboard / Rhythm Sync | 85 PASS | 85 PASS / failure 0 |
| Chrome native 2-tab / IDB / lifecycle | — | 10 cases PASS |
| Chrome desktop/mobile write回帰 | — | 20 cases PASS |
| Chrome Standard navigation / Pro gate | — | 18 routes PASS + 4 Theme / gate確認 |

Studio Feature Metadataは機能21件PASS。作業中は「apps/shared等のtracked差分がない」という
Git状態テスト1件が今回の許可されたPort/shared差分を検出するため、機能検証ではその1件をskip。
Studioコードやテストは変更せず、commit後のtracked clean状態で全22件を再実行する。

## 実Browser

隔離Chrome contextの新build同士で、native localStorage / IndexedDB / Web Locksを使用。
1280pxと393pxでHome、Metronome、Presets、Tuner、Practice、Calendar、Gear、My Apps、Settings、
Account/Syncを確認。StandardのPro誘導と実Pro gate overlayを確認し、Pro内部の保存回帰は合成した資格fixtureで実行した。
4 Theme（light / gray / charcoal / dark）を確認。各browser suiteでconsole / page error 0、app 404 0。
保存済みAccountでSync画面を開くだけではSync/Account networkが発生せず、runtime未生成を確認。
本番Accountや本番Pro認証への接続・更新は行っていない。

2-tabでは同一base stale、意図的な同時保存、Metronome/Gear両方保持、migration race、future schema、
preset delete/edit、Sync/local stale拒否、故障注入rollbackとqueued writerを確認。
Account/app別DB、transaction abort、遅延Account応答拒否、50-cycle cleanupもnative Browserで確認。
遅延拒否のfixtureはAccount切替前にPromise rejection handlerを登録し、期待される拒否を未処理エラーにしない。

検証用serverはrepository rootの127.0.0.1:8766。検証終了後に停止し、既存Studioの8765は操作しない。
一時結果JSON/logは/private/tmpへ出力し、利用者のBrowser profileを使用しない。

## 境界検証

- count 49 / 50 / 51、wire body 262143 / 262144 / 262145 bytes、UTF-8多byte。
- oversized operationをterminalとして保持し、他の送信可能operationは送る。無限retry・silent dropなし。
- response loss再送のoperationId / dedupe、migration / conflict / bulkの同一wire境界。
- late provision / bootstrap / pull / push / credential / conflict / Account refresh / pending lookup。
- singleton、owner / read-only consumer解放、recreate、50-cycle listener / timer / subscription解除。
- strict cached statusはDB open / network / ensureなし。local statusはmigration / provision / server writeなし。
- repository publication直前のAccount guard、同一lock内のSync apply / rollback。
- scp1 / device session / revoke / expiry / offline validityは既存Pro回帰を維持。

## 保証しない範囲と次工程

旧build tabは新Web Lockに参加しない。旧build共存の安全性は未解消であり、M3 shared write解禁条件として残す。
Chrome mobile幅は実スマートフォンやSafari/PWAの実機検証を代替しない。
Studio M2 memory facade、Studio 0.25.1、Feature Metadata、domain schema、Workerは変更しない。
次はStudio read-only Host（cached status / read-only dataset / 独立した正式Pro status）。
Studioからのensure、正式dataset write、preset write、Studio独自AppDeviceは今回禁止のまま。

## Commit対象ファイル

全ファイルを個別stageする。次の一覧にはPortのmodule cache graph更新と、
root AGENTS.mdが要求するshared script参照HTMLのcache key更新を含む。
他4アプリはHTMLのshared script queryのみ変更し、domain code / app versionは変更しない。

対象: 92 files。

- `apps/chord-cruise/pro_k7m4q9v2x8/index.html`
- `apps/cruise-port/ai-support-client.js`
- `apps/cruise-port/ai-support-ui.js`
- `apps/cruise-port/app-version.js`
- `apps/cruise-port/app-version.test.mjs`
- `apps/cruise-port/cruise-port-capabilities.js`
- `apps/cruise-port/cruise-port-edition.test.mjs`
- `apps/cruise-port/docs/PORT_DATASET_REPOSITORY.md`
- `apps/cruise-port/docs/PORT_RUNTIME_SAFETY_VALIDATION.md`
- `apps/cruise-port/docs/PORT_SYNC_RUNTIME_HOST.md`
- `apps/cruise-port/gear-category-store.js`
- `apps/cruise-port/gear-list-store.js`
- `apps/cruise-port/gear-photo-store.js`
- `apps/cruise-port/gear-photo-workflow.js`
- `apps/cruise-port/home-display.js`
- `apps/cruise-port/index.html`
- `apps/cruise-port/metronome-app.js`
- `apps/cruise-port/metronome-presets-store.js`
- `apps/cruise-port/metronome-store.js`
- `apps/cruise-port/metronome-timing.js`
- `apps/cruise-port/module-cache-keys.test.mjs`
- `apps/cruise-port/my-apps-capabilities.js`
- `apps/cruise-port/my-apps-capabilities.test.mjs`
- `apps/cruise-port/my-apps-icon-store.js`
- `apps/cruise-port/my-apps-icon-workflow.js`
- `apps/cruise-port/my-apps-store.js`
- `apps/cruise-port/port-account-join.js`
- `apps/cruise-port/port-asset-sync.js`
- `apps/cruise-port/port-dataset-repository.js`
- `apps/cruise-port/port-dataset-repository.test.mjs`
- `apps/cruise-port/port-dataset-storage.js`
- `apps/cruise-port/port-sync-adapter.js`
- `apps/cruise-port/port-sync-controller.js`
- `apps/cruise-port/port-sync-controller.test.mjs`
- `apps/cruise-port/port-sync-local-validation.js`
- `apps/cruise-port/port-sync-status.js`
- `apps/cruise-port/port-sync-status.test.mjs`
- `apps/cruise-port/practice-calendar-sp610.test.mjs`
- `apps/cruise-port/practice-calendar-sp611.test.mjs`
- `apps/cruise-port/practice-calendar-sp612.test.mjs`
- `apps/cruise-port/practice-calendar-sp613.test.mjs`
- `apps/cruise-port/practice-calendar-sp614.test.mjs`
- `apps/cruise-port/practice-capabilities.js`
- `apps/cruise-port/practice-capabilities.test.mjs`
- `apps/cruise-port/practice-dataset-writes.js`
- `apps/cruise-port/practice-menu-app-resolver.js`
- `apps/cruise-port/practice-menu-app.js`
- `apps/cruise-port/practice-menu-attachment-store.js`
- `apps/cruise-port/practice-menu-calendar-store.js`
- `apps/cruise-port/practice-menu-history-store.js`
- `apps/cruise-port/practice-menu-pending-attachments.js`
- `apps/cruise-port/practice-menu-progress-store.js`
- `apps/cruise-port/practice-menu-sets-store.js`
- `apps/cruise-port/practice-menu-sp615.test.mjs`
- `apps/cruise-port/practice-menu-store.js`
- `apps/cruise-port/practice-unsaved-edit.test.mjs`
- `apps/cruise-port/pro-app-boot.js`
- `apps/cruise-port/pro-readiness.test.mjs`
- `apps/cruise-port/pro_9a3943176561/index.html`
- `apps/cruise-port/settings-store.js`
- `apps/cruise-port/sync-center-controller.js`
- `apps/cruise-port/sync-center-navigation.js`
- `apps/cruise-port/sync-center-orchestrator.js`
- `apps/cruise-port/sync-center-refresh.js`
- `apps/cruise-port/sync-center-ui.js`
- `apps/cruise-port/sync-center-ui.test.mjs`
- `apps/cruise-port/sync-pro-lock.js`
- `apps/cruise-port/sync-status-ux1.test.mjs`
- `apps/cruise-port/tests/feature-help-browser.cjs`
- `apps/cruise-port/tests/feature-tutorial-browser.cjs`
- `apps/cruise-port/tests/readiness-core-browser.cjs`
- `apps/cruise-port/tests/runtime-regression-browser.cjs`
- `apps/cruise-port/tests/runtime-safety-browser.cjs`
- `apps/cruise-port/tests/standard-readiness-browser.cjs`
- `apps/cruise-port/tests/standard-readiness-revision-browser.cjs`
- `apps/cruise-port/tool-capabilities.js`
- `apps/cruise-port/tuner-app.js`
- `apps/cruise-port/tuner-store.js`
- `apps/cruise-studio/ROADMAP.md`
- `apps/cruise-studio/ai-handoff/PROJECT_STATE.md`
- `apps/cruise-studio/docs/METRONOME_INTEGRATION.md`
- `apps/fretboard_cruise/pro_a9f4k7q2m8z/index.html`
- `apps/pitch-cruise/pro_x9v7q2m8/index.html`
- `apps/rhythm-cruise/pro_r4m8k7n2q9x/index.html`
- `apps/shared/sync-account/multi-app-conflict-ui.js`
- `apps/shared/sync-account/multi-app-sync-db.js`
- `apps/shared/sync-account/multi-app-sync-runtime.js`
- `apps/shared/sync-account/multi-app-sync-runtime.test.mjs`
- `apps/shared/sync-account/multi-app-sync-wiring.test.mjs`
- `apps/shared/sync-account/sync-account-client.js`
- `apps/shared/sync-account/sync-account-db.js`
- `apps/shared/sync-account/sync-account-primitives.test.js`
