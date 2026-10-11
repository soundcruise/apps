# Sync Writer Authority — B1-1

2026-10-11。Port 1.22.2 / Studio 0.26.1 / Studio schemaVersion 1。
B1-1は互換基盤だけ。B1-L/B1-C未解消、Studio shared write OFF / canWrite=false。
Worker deploy・production D1 migrationはこの工程に含めない。

## 独立したversion

| 契約 | 値 / 意味 |
|---|---|
| appVersion | 商品表示・診断だけ。admissionに使わない |
| repositoryProtocol | 1。既存local Repository / WAL / CAS |
| local writerProtocol | 1。既存Write Readinessの協調契約。変更しない |
| authority writerProtocol | 2。新authority対応wire契約。1も旧対応値として受理 |
| syncProtocol | 1。任意authority fieldを含むwire契約。API path /v1とは独立 |
| dataset schema | 全既存domain / Sync / Studio schemaを維持 |
| writeEpoch | membershipのauthority世代。appVersionでもlogin回数でもない |

数値の正本は `apps/shared/sync-account/writer-authority.mjs`。
Port / Studioでauthority protocol数値を別定義せず、Feature Metadataにも格納しない。
writerProtocol=2は認証資格でもlocal移行完了証拠でもない。Repository協調、identity固定、operationId保持、
期待epochを扱えること、stale epochでpublishを停止すること、旧outboxを無条件送信しないことを要求する。
ENFORCE参加には、さらにB1-3/4の新local authorityとmigration完了が必須。
B1-1対応clientがlegacy storageを使っているだけでreadyとは判定しない。

## Wire / deploy互換

mutation JSONの任意top-level field: writerProtocol / syncProtocol / expectedWriteEpoch。
field欠落はlegacy。存在時は正のsafe integerのみ。null・文字列・小数・0は禁止。
writerProtocolは1/2、syncProtocolは1を理解する。それより大きい値はunsupported。
個々のfieldはACCEPT_COMPATでは任意。missing epochを現在epochに置換しない。
read requestのqueryを変更しない。snapshot / changes / asset downloadは従来の認証・Pro・capability規則。
binary PUTでは X-Sound-Cruise-Writer-Protocol / X-Sound-Cruise-Sync-Protocol /
X-Sound-Cruise-Write-Epochを使い、CORS allowlistをcontent uploadだけに追加。

B1-1 production clientは従来のenvelopeのまま。Worker未deployなので自動送信すると旧Workerに拒否される。
新wireは `createWriterWireContext({expectedWriteEpoch?})` を明示生成し、MultiAppSyncRuntimeの
`writerWireContext`へ注入する対応環境でのみ使用。PortAssetSyncは同じowner contextを利用する。
localStorage / URL / debug flagから有効化しない。B1-2で認証済みauthority取得とadoptionを正式接続する。
operation epochを自動更新するAPIはない。unknown epochは省略し、推測値を送らない。

## D1 additive metadata

0034_add_writer_authority.sqlはALTER TABLE ADD COLUMNのみ。既存table再作成・recordコピー・削除なし。
sync_account_memberships（Account + app一意）に追加:

- minimum_writer_protocol INTEGER NOT NULL DEFAULT 0
- write_epoch INTEGER NOT NULL DEFAULT 1
- authority_state TEXT NOT NULL DEFAULT 'legacy'（legacy / prepared / enforced / paused）
- authority_updated_at INTEGER NOT NULL DEFAULT 0

既存行・新規行とも同じdefault。Account/membership generationやdataset initializing/readyは流用しない。
ログイン・device追加・Account切替でepochを増やさない。明示cutoverだけで変更する将来契約。
asset operationにはnullable writer_protocol / sync_protocol / expected_write_epoch / admitted_write_epochを追加。
prepare時にrequest値と観測server epochを別々に固定する。旧requestの欠落を新protocolへ偽装しない。
同じprepareの再送で保存済みmetadataを書き換えない。B1-5のpublish判定にこの元epochを使用する。

migrationはD1 migration ledgerによる一回適用。再度migrations applyを行っても適用済みをskipする。
SQLiteのALTER ADD COLUMNをSQLだけで繰り返してよいとは扱わない。raw SQL再実行は禁止。
local testは旧schema/既存dataからの適用、default、ledger再実行、data非損失を確認する。

## Admissionとmutation inventory

writer-admission.jsのmodeはコード定数ACCEPT_COMPAT。env・request・metadataでENFORCEへ切替不可。
minimum / epoch / authority_stateによる拒否はB1-5まで実装・有効化しない。
厳密field validation、認証済みidentityからのmembership照合、metadata構造検査を追加する。
既存standalone appの契約は維持。新Port fieldでmembership欠落を正当化することはできない。
protocolはAccount / AppDevice / membership / Pro / CAS / hash / operationIdを代替しない。

| 入口 | hook / data mutation |
|---|---|
| push sync / migration | 全operation、upsert / tombstone / changes / dataset metadata |
| bootstrap | dataset作成。既存dataset分岐も同じfield契約を検証 |
| migration/complete | ready状態 / manifest更新 |
| asset prepare | quota / asset / operation metadataの既存batch |
| asset content PUT | R2前のadmission、D1 uploaded更新 |
| asset commit | available遷移 |
| asset unreference | 参照解除batch |
| removal-safety | 既存4 appの報告。Port runtimeは従来どおり送らない |

管理者のAccount削除/recovery/device管理とscheduled asset cleanupは独立した認可・lifecycle。
新writer admissionで管理機能の利用権を付与しない。

## Transaction内fenceの準備

admission済みrepositoryはwriterMutationDatabaseを通す。既存の複数statement batchを分割せず、
同一D1 batch先頭で現在のmembership authorityをSELECTする。単独runも同じbatchに包む。
B1-1のSELECTは観測点であってfenceではない。結果不一致を拒否したと主張しない。
B1-5ではこのtransaction内の位置を、現在epoch/minimum/stateを検査して不成立時に全体をabortする
SQL guardへ変更し、TOCTOU・全mutation・dedupe前後を検証する。HTTPチェックだけでENFORCEしない。
既存record/change/dataset batchのatomicityは維持。SQL失敗時は全batch rollback。
D1とR2は一transactionではない。B1-5ではprepare epochを使用し、遅い旧uploadをpublishしない。
B1-1はR2/D1 cutover fenceの完成ではない。

## Error / retry

| code | HTTP | 復帰 |
|---|---|---|
| writer_protocol_invalid / sync_protocol_invalid / dataset_epoch_invalid | 400 | request修正 |
| writer_protocol_unsupported / sync_protocol_unsupported | 409 | 対応clientへ更新 |
| writer_protocol_required / writer_protocol_outdated | 409、B1-5用予約 | 更新・adoption |
| dataset_epoch_stale | 409、B1-5用予約 | authority再確認後、明示rebase/migration |
| dataset_authority_unavailable | 503 | authorityの確認・復旧 |

これらは通常network retryにもcredential terminalにも入れない。outboxをterminalError付きで保持し、
自動backoffを起動しない。local保存・draft・credentialを削除しない。変更payloadでもauthority blockedの
旧operationをqueueDiffで自動破棄しない。旧context/epochのoutboxはlegacy_outbox_needs_migrationで保持する。
operationId/hashにprotocolを混ぜない。同じmutationのresponse-loss retryは同じID・wire contextを維持。
B1-2でblocked表示・明示復帰・認証済みauthority readを接続する。旧clientへ新UIを強制できるとは扱わない。
256KiB計測はprotocol field込みのJSON全体。50 operations上限も維持する。

## Rollout / rollback

1. B1-1: Worker understands protocol, old allowed。D1 additive準備。新wireは注入のみ。
2. B1-2: 対応Worker公開後にnew client protocol adoption。authority read / UX。
3. B1-3: Port-owned新local authority（Sync DB / binaryも検討）。
4. B1-4: migration / cutover / legacy救出。dual-writeや自動再importなし。
5. B1-5: server minimum/epoch enforcement。transaction fence・asset publish境界を検証して明示有効化。
6. B1-6: Port / Studio製品統合とaction別解禁。

将来deploy順はproduction D1 additive migration → Worker互換版 → client adoption。
今回はいずれのproduction操作もしない。pushによる静的配信でもclientはlegacy wireを維持する。
B1-1は旧Workerへ戻しても新fieldを送るclientを先に停止すれば互換を維持できる。columnは削除しない。
B1-5後はfence対応版へだけrollbackし、minimum/epochを下げない。必要時write停止＋read/exportを維持する。
B1-L未解消なので本工程をB1解消・shared write解禁と扱わない。

## 今回の実測検証

開始時 HEAD / origin/main / remote main = `928fe0b9d5edf85e3816ed94dc744c59d3e5640c`、
ahead/behind 0/0、tracked clean、staged空。既存untracked 2ディレクトリは対象外。

| suite | baseline | B1-1 |
|---|---:|---:|
| Port/shared | 1417 | 1432 PASS |
| Worker/Account（test/*.test.js） | 592 | 618 PASS |
| Other apps | 85 | 85 PASS |
| Studio | 315 | 機能314 PASS、残るGit clean guard 1件はcommit直後・push前に実行 |

Studioの既存clean guardは `git diff HEAD` が空であることを要求するため、承認済み変更の未commit中は成立しない。
テストを改変せず、precommitではその1件だけ除外し、commit後に無除外の315件を実行する。

Port browser: Standard 18 route checks、Pro 20 cases、通信fixture PASS。
通信fixtureは実Worker handler + SQLite + memory R2を使用し、snapshot/bootstrap/complete/push再送/
asset prepare/PUT/commit/download/unreference/legacy pushを確認（外部APIなし）。
Studio browser: M1/M2/settings/Structure/Pre-DTM/keyboard計97 tests、read-only Host 10 cases PASS。
Worker dry-run bundle PASS（deployなし）。Wranglerの `/tmp` ローカルD1へ0034まで適用成功、
同じDBへの再適用は `No migrations to apply`。本番D1へ接続していない。
SQL rollback、旧schemaからのデータ保持、旧/new membership defaultはSQLite回帰でも確認。

再現コマンド（repository root、Workerは同ディレクトリで実行）:

```sh
node --test apps/cruise-port/*.test.mjs apps/shared/*.test.mjs apps/shared/sync-account/*.test.mjs apps/shared/sync-account/*.test.js
node --test apps/cruise-studio/tests/*.test.mjs
# workers/sound-cruise-sync 内
node --test test/*.test.js
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir /tmp/b11-worker-bundle
node node_modules/wrangler/bin/wrangler.js d1 migrations apply SYNC_DB --local --persist-to /tmp/b11-d1-migration-check
```

変更file一覧（個別stage対象）。Portの多数fileは1.22.2へのimport/cache参照更新。
他3アプリのHTMLはshared runtime cache v31のみ。Studio codeはPort参照のみ。

- `apps/cruise-port/ai-support-client.js`
- `apps/cruise-port/ai-support-ui.js`
- `apps/cruise-port/app-version.js`
- `apps/cruise-port/app-version.test.mjs`
- `apps/cruise-port/cruise-port-capabilities.js`
- `apps/cruise-port/cruise-port-edition.test.mjs`
- `apps/cruise-port/docs/PORT_SYNC_RUNTIME_HOST.md`
- `apps/cruise-port/docs/PORT_WRITE_READINESS.md`
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
- `apps/cruise-port/port-asset-sync.test.mjs`
- `apps/cruise-port/port-dataset-repository.test.mjs`
- `apps/cruise-port/port-dataset-storage.js`
- `apps/cruise-port/port-sync-local-validation.js`
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
- `apps/cruise-port/sync-center-navigation.js`
- `apps/cruise-port/sync-center-orchestrator.js`
- `apps/cruise-port/sync-center-ui.js`
- `apps/cruise-port/sync-pro-lock.js`
- `apps/cruise-port/tests/feature-help-browser.cjs`
- `apps/cruise-port/tests/feature-tutorial-browser.cjs`
- `apps/cruise-port/tests/runtime-regression-browser.cjs`
- `apps/cruise-port/tests/standard-readiness-browser.cjs`
- `apps/cruise-port/tests/standard-readiness-revision-browser.cjs`
- `apps/cruise-port/tests/writer-authority-browser.cjs`
- `apps/cruise-port/tool-capabilities.js`
- `apps/cruise-port/tuner-app.js`
- `apps/cruise-port/tuner-store.js`
- `apps/cruise-studio/ROADMAP.md`
- `apps/cruise-studio/ai-handoff/PROJECT_STATE.md`
- `apps/cruise-studio/docs/PORT_DATA_HOST.md`
- `apps/cruise-studio/js/core/component-metadata.mjs`
- `apps/cruise-studio/js/port-data/metronome-facade.mjs`
- `apps/fretboard_cruise/pro_a9f4k7q2m8z/index.html`
- `apps/pitch-cruise/pro_x9v7q2m8/index.html`
- `apps/rhythm-cruise/pro_r4m8k7n2q9x/index.html`
- `apps/shared/sync-account/multi-app-sync-runtime.js`
- `apps/shared/sync-account/multi-app-sync-runtime.test.mjs`
- `apps/shared/sync-account/multi-app-sync-wiring.test.mjs`
- `apps/shared/sync-account/writer-authority.mjs`
- `workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md`
- `workers/sound-cruise-sync/migrations/0034_add_writer_authority.sql`
- `workers/sound-cruise-sync/src/app.js`
- `workers/sound-cruise-sync/src/asset-database.js`
- `workers/sound-cruise-sync/src/validation.js`
- `workers/sound-cruise-sync/src/writer-admission.js`
- `workers/sound-cruise-sync/test/ai-diagnostics.test.js`
- `workers/sound-cruise-sync/test/sqlite-d1.js`
- `workers/sound-cruise-sync/test/sync-target-naming.test.js`
- `workers/sound-cruise-sync/test/writer-authority-fixture.js`
- `workers/sound-cruise-sync/test/writer-authority.test.js`
