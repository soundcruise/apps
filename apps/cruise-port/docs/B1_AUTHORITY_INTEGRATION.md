# Asset Cleanup vs Reference Addition Race — 修正結果

2026-10-12。前回の停止報告は下部に原文を保持する。
**Asset raceの限定修正。B1-6の残りの製品統合には進んでいない。**
詳細な排他・復旧契約は[ASSET_LIFECYCLE](../../../workers/sound-cruise-sync/ASSET_LIFECYCLE.md)。

## 原因・修正・coverage（報告項目3–25）

元の再現2件は開始時FAILを確認し、元の競合順序を保持したままPASSへ変更。
参照公開はrecord INSERT/UPDATE trigger、削除予約は現在refs/identity/eligibilityを確認するD1 batchで調停する。
legacyでも新protocolでも「参照commitが先なら予約不可、予約が先なら参照commit不可」。
予約UUID・Account/membership generation・epoch・object key/version/hashを固定し、R2成功後のD1 finalizeまで保持する。
結果不明はrecovery-required、crashではdeletingも回収対象。TTL解除・無条件cancelなし。
同asset ID/keyの再利用は禁止し、再uploadは新ID/key。削除済み予約を永久保持して旧cleanupから新objectを分離する。

Gear / My Apps / Practice attachment / owner refs / migration push / tombstone復活に同じSQL guardが適用される。
prepare再送・upload・commitも予約を確認し、upload途中の予約はD1公開を止める。
unreferenceやremoval safetyだけでは削除資格にならない。既存Account/AppDevice/Pro/epoch/CAS/dedupeを緩和しない。
Port migration inventoryはcleanup証拠をmanifest/hashへ保存し、予約中・復旧待ちassetのstage/sealを拒否する。
本番のfresh evidence取得・Host接続は未実装。

## 開始状態（1–2）

HEAD / origin/main / remote main = `cdc112ad7985ade5857c9a57ff1960df984dc77c`。
main、tracked clean、staged空、ahead/behind0/0。
前回追加の再現テストと本停止報告は未commitのまま存在し、両方を保持して本修正に含める。
既存untracked `.claude/`、`workers/sound-cruise-sync/node_modules/`には変更しない。

## 検証（26–36）

| 検証 | 結果 |
|---|---:|
| Worker / Account | 727 PASS（既存672＋元再現2＋lifecycle53） |
| 元再現 | 2 PASS。R2 delete待機中のpushは409 / asset_reference_unavailable |
| Lifecycle / failure injection | 53 PASS。予約の前後、record transaction直前、D1/R2故障、response loss、crash前後、retry、世代変更、stale claim、recreate等 |
| 実workerd / D1 / R2 | 新規3 + 既存fence1 = 4 PASS |
| Port / shared | 1588 PASS（既存1583＋migration5） |
| Other apps | 85 PASS |
| Studio | 機能314 PASS。Git cleanを含む315全件はcommit後・push前に確認 |
| Port Chrome | 18 desktop/mobile routes、保存26（既存20＋画像・添付6）、runtime safety10、local authority26、writer12 requests、migration18、transaction fence10 |
| Studio Chrome | 97 + read-only Host10 PASS。M1/M2、Structure、Editing Session、Pre-DTM、4themes、printを既存suiteで確認 |
| console / app404 / unexpected Sync | 0。拒否を検証するHTTP fixtureの期待済み409/503は別扱い |

実workerdで実HTTP pushと待機中R2 deleteを競合させ、D1 triggerで拒否した。
さらに別名の2 Worker instanceが同じ隔離D1/R2で同時cleanupするケースも成功。
テスト用runtime control / AppDevice resolverとsynthetic Pro資格を使用。本番サービスへの接続はない。
ChromeでGear画像・My Appsアイコン・Practice添付の実表示、owner参照、reload後のbytesをdesktop/mobileで確認。
実Safari/iPhone PWAは今回の対象外・未検証。viewport変更をその実機検証とは呼ばない。

## Production・version・Git（37–51）

本番Worker deploy / D1 migration / cutoverは禁止のまま、実行なし。
ACCEPT_COMPAT / legacy / enforcement OFF / shared write OFF / PortDataHost.canWrite=falseを維持。
production bundleにfixture route / cutover controllerの混入なし、ESM bundle生成成功。
Portは内部migration safety修正のpatch **1.22.6**。64ファイルの既存version/cache差分は機械的一致を確認。
Studio **0.26.1 / schema1**維持。他アプリ本体・version変更なし。shared変更はPort importを持つ既存testのcache参照だけ。

変更文書: 本報告、Worker SYNC_WRITER_AUTHORITY / ASSET_LIFECYCLE、Port AUTHORITY_MIGRATION / LOCAL_AUTHORITY。
新0036はadditive。既存asset metadata・旧claimの非rewriteをテストした。本番適用はしていない。
`git diff --check`を確認し、承認済みの各ファイルだけを個別stageする。
commit messageは `Sync Asset cleanupと参照競合を修正`。
commit後はdirect child / staged空 / tracked clean / ahead1 behind0、push前にremote実値一致を確認する。
commit hash・対象file一覧・push前後Git実測は最終応答とcommit差分に記録する。

## 判定と次工程（52–58）

- Asset race: 隔離検証で解消。本番には未反映。
- B1-6: 残りの製品統合を再開可能だが、この作業では未実施。B1全体は未解消。
- Production shared write: 解禁不可。
- 旧B1-5 claimのidentity不足、世代不一致claimは自動解除せず保持する。別途operator復旧判断が必要。
- 遅い旧uploadのbytesは未公開orphanとして残り得る。永久tombstoneを解除せず、追加の掃除方針は別工程。
- 本番公開は0036、対応Worker、運用/rollbackを別gateで検証する。旧Workerへの無条件rollbackは禁止。
- 次工程はB1-6 Phase A–Hの残り。operator認可、Host/full snapshot連携、fresh evidence、実partition等の判断を続ける。
- モデル適性: Sol / 高は原因が特定済みの本安全修正に適する。B1-6全体の横断設計はAstra / 中〜高を推奨する。

---

## 限定commit対象（87 files）

実装・テスト・文書23、version/cache更新のみ64。既存untracked2件は含めない。

```text
apps/cruise-port/ai-support-client.js
apps/cruise-port/ai-support-ui.js
apps/cruise-port/app-version.js
apps/cruise-port/app-version.test.mjs
apps/cruise-port/cruise-port-capabilities.js
apps/cruise-port/cruise-port-edition.test.mjs
apps/cruise-port/docs/B1_AUTHORITY_INTEGRATION.md
apps/cruise-port/docs/PORT_AUTHORITY_MIGRATION.md
apps/cruise-port/docs/PORT_LOCAL_AUTHORITY.md
apps/cruise-port/gear-category-store.js
apps/cruise-port/gear-list-store.js
apps/cruise-port/gear-photo-store.js
apps/cruise-port/gear-photo-workflow.js
apps/cruise-port/home-display.js
apps/cruise-port/index.html
apps/cruise-port/metronome-app.js
apps/cruise-port/metronome-presets-store.js
apps/cruise-port/metronome-store.js
apps/cruise-port/metronome-timing.js
apps/cruise-port/module-cache-keys.test.mjs
apps/cruise-port/my-apps-capabilities.js
apps/cruise-port/my-apps-capabilities.test.mjs
apps/cruise-port/my-apps-icon-store.js
apps/cruise-port/my-apps-icon-workflow.js
apps/cruise-port/my-apps-store.js
apps/cruise-port/port-account-join.js
apps/cruise-port/port-asset-sync.js
apps/cruise-port/port-dataset-repository.test.mjs
apps/cruise-port/port-dataset-storage.js
apps/cruise-port/port-local-authority.test.mjs
apps/cruise-port/port-migration-candidate.mjs
apps/cruise-port/port-sync-local-validation.js
apps/cruise-port/practice-calendar-sp610.test.mjs
apps/cruise-port/practice-calendar-sp611.test.mjs
apps/cruise-port/practice-calendar-sp612.test.mjs
apps/cruise-port/practice-calendar-sp613.test.mjs
apps/cruise-port/practice-calendar-sp614.test.mjs
apps/cruise-port/practice-capabilities.js
apps/cruise-port/practice-capabilities.test.mjs
apps/cruise-port/practice-dataset-writes.js
apps/cruise-port/practice-menu-app-resolver.js
apps/cruise-port/practice-menu-app.js
apps/cruise-port/practice-menu-attachment-store.js
apps/cruise-port/practice-menu-calendar-store.js
apps/cruise-port/practice-menu-history-store.js
apps/cruise-port/practice-menu-pending-attachments.js
apps/cruise-port/practice-menu-progress-store.js
apps/cruise-port/practice-menu-sets-store.js
apps/cruise-port/practice-menu-sp615.test.mjs
apps/cruise-port/practice-menu-store.js
apps/cruise-port/practice-unsaved-edit.test.mjs
apps/cruise-port/pro-app-boot.js
apps/cruise-port/pro-readiness.test.mjs
apps/cruise-port/pro_9a3943176561/index.html
apps/cruise-port/settings-store.js
apps/cruise-port/sync-center-navigation.js
apps/cruise-port/sync-center-orchestrator.js
apps/cruise-port/sync-center-ui.js
apps/cruise-port/sync-pro-lock.js
apps/cruise-port/tests/asset-cleanup-migration.test.mjs
apps/cruise-port/tests/feature-help-browser.cjs
apps/cruise-port/tests/feature-tutorial-browser.cjs
apps/cruise-port/tests/readiness-core-browser.cjs
apps/cruise-port/tests/runtime-regression-browser.cjs
apps/cruise-port/tests/standard-readiness-browser.cjs
apps/cruise-port/tests/standard-readiness-revision-browser.cjs
apps/cruise-port/tool-capabilities.js
apps/cruise-port/tuner-app.js
apps/cruise-port/tuner-store.js
apps/shared/sync-account/multi-app-sync-runtime.test.mjs
workers/sound-cruise-sync/ASSET_LIFECYCLE.md
workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md
workers/sound-cruise-sync/migrations/0036_add_asset_deletion_reservations.sql
workers/sound-cruise-sync/src/app.js
workers/sound-cruise-sync/src/asset-database.js
workers/sound-cruise-sync/src/asset-deletion.js
workers/sound-cruise-sync/src/writer-fence.js
workers/sound-cruise-sync/test/ai-diagnostics.test.js
workers/sound-cruise-sync/test/asset-app.test.js
workers/sound-cruise-sync/test/asset-lifecycle-fixture.js
workers/sound-cruise-sync/test/asset-lifecycle-worker-entry.js
workers/sound-cruise-sync/test/asset-lifecycle-workerd.mjs
workers/sound-cruise-sync/test/asset-lifecycle.test.js
workers/sound-cruise-sync/test/authority-cleanup-race.test.js
workers/sound-cruise-sync/test/sqlite-d1.js
workers/sound-cruise-sync/test/sync-target-naming.test.js
workers/sound-cruise-sync/test/transaction-fence.test.js
```

## 前回停止報告（履歴・原文保持）

# B1-6 Authority Integration — 停止報告

2026-10-12。**B1-6未完了。commit / pushなし。**
開始時点の既存コードで、参照中binaryをscheduled cleanupが削除できる競合を隔離再現した。
依頼の停止条件「cleanupで参照中binary削除可能」に従い、統合実装を停止した。
この文書はIntegration Contractの完成版ではない。

## 再現したblocker

対象は`workers/sound-cruise-sync/src/app.js`の`handleScheduled`、
`asset-database.js`の`claimCleanup` / `isReferenced` / `markDeleted`、
`writer-fence.js`のmutation guard。

1. Account Aに、猶予期間を過ぎたunreferencedのGear画像を用意する。
2. scheduled cleanupがAccount claimを取得し、現在参照なしを確認する。
3. R2 deleteのawait中に、同AccountのGear recordから画像を参照する正式push handlerを実行する。
4. pushはHTTP 200、operationは`applied`。live recordにassetIdが保存される。
5. R2 deleteが完了し、D1 assetは`deleted`になる。live owner referenceは残る。

claimはcutover prepareを排除するが、通常のrecord mutationからの参照追加を排除しない。
隔離writer policyを使ってもasset参照guardは`available` / `unreferenced`を許可し、cleanup claimを照合しない。
参照確認とR2削除の間に別requestが成立するため、最後にもう一度SELECTを追加するだけでは安全性を証明できない。

再現テスト:

```sh
node --test workers/sound-cruise-sync/test/authority-cleanup-race.test.js
```

結果: **2件FAIL**（既存legacy経路、isolated writer policy付きlegacy epoch経路）。両方:

```json
{"responseStatus":200,"status":"applied","referencedBeforeDeletion":true,"objectPresent":false,"assetState":"deleted"}
```

本番入口と同じpush/scheduled handler、SQLite migrations 0001–0035、実Pro verifierを使う。
AppDevice resolverとruntime controlは既存test fixture、R2はmemory fake。
R2 deleteの非同期境界にpushを挿入する決定的な競合テストであり、実Cloudflare/R2の実測ではない。
本番network、credentials、本番データは使用していない。

**enforced ledger付きAccountでの削除を再現したものではない。**
現状はledger付きAccount全体をcleanupから除外している。
今回の問題はcutover前のlegacy Accountで成立し、B1-6のcleanup recoveryを接続する前に解消が必要。
前工程の全テストが成功したことを、この競合の安全性証明とは扱わない。

## 依頼項目ごとの実施状況

| 依頼項目 | 結果 |
|---|---|
| 1 開始時Git | HEAD / origin/main / remote main = `cdc112ad7985ade5857c9a57ff1960df984dc77c`。main、tracked clean、staged空、ahead/behind 0/0 |
| 2–6 Architecture / Port・Studio Host / read-only / readiness | 接続点調査の途中で停止。製品コード変更なし。Studio canWrite=false、dormant Facadeは未接続のまま |
| 7–12 Migration / evidence / barrier / epoch / idempotency / crash | B1-6結合は未実装・未検証。B1-5の既存テストはbaselineに含む。pointer公開の新規実証なし |
| 13–14 Operator認可 / API | 既存Pro運用は運営者のCloudflare/D1操作。cutover controllerは隔離code capabilityのみ、公開routeなし。B1-6の認可方式確定・API追加には至っていない |
| 15–17 Cleanup / orphan / binary | 上記競合を再現。claim recoveryは未実装。Gear以外の新規横断検証には進んでいない |
| 18–22 Account / Pro / runtime / full・partial snapshot | 既存契約・コード不変更。B1-6 operation contextとfull snapshot連携の新規実装なし |
| 23–30 同時動作 / settings・preset・delete競合 / offline / Account切替 / Pro expiry / external Sync | 実Port + Studio 2-tab fixtureは未実装・未実行。既存baselineの成功と区別する |
| 31 Safari/PWA | 実機未検証。storage partitionは別Authorityの境界として扱う。Chrome viewportをSafari実証としない |
| 32–37 Node / 各suite | 開始baselineはWorker672、Port/shared1583、他app85、Studio315、全PASS。追加cleanup回帰2件FAIL。追加後の全suite再実行はしていない |
| 33、38–40 Browser / console / 404 | 停止前に未実行。前工程の97+Host10等を今回の実測として扱わない。今回console/404ゼロは未判定 |
| 41–45 production状態 | Worker deploy / D1本番適用 / production cutoverなし。コード定数ACCEPT_COMPAT、production activation変更なし、Studio canWrite=false。live productionを再監査したとの主張はしない |
| 46–47 Version / schema | Port1.22.5、Studio0.26.1、Studio schema1維持。追加は失敗を示す回帰テストと停止報告のみ、製品コードのversion変更なし |
| 48 Docs | 本停止報告だけ追加。指定既存契約の更新・全件精読は停止により未完了。B1-6完了とは記載しない |
| 49 Diff | 既存trackedファイル変更なし。新規2ファイルは未stageで保持。git diff --checkを確認 |
| 50–53 Commit / files / push | commitなし（新hashなし）、stageなし、pushなし。予定message「PortとStudioのAuthority統合基盤を整備」は未使用 |
| 54–57 最終Git | HEAD / origin / remoteは開始コミットのまま、ahead/behind 0/0。既存untrackedに加え本報告と再現テストを保持 |
| 58–60 完了判定 | B1-6未完了、B1全体未解消、production shared write解禁不可 |
| 61 Blocker | cleanup中の参照再追加とR2 deleteが排他されていない。残りのB1-6要件も未検証であり、追加blockerなしとは断定しない |
| 62 次工程 | cleanup claimと全writerの参照・公開mutationを同じD1境界で排他する設計・修正を先行。その後B1-6 Phase Aから残作業を再開 |
| 63 モデル適性 | Astra / 高を推奨。複数の永続化境界と競合の判断が必要。停止原因はモデル能力でなく、再現された安全条件違反 |

## 修正工程の受入条件（未実装）

- claim取得と削除対象のstate / identity / owner refs検査をtransactionで固定する。
- 削除claim中の参照追加とasset公開を、legacyを含む全mutationのtransaction内で拒否するか、安全な順序に直列化する。
- R2結果不明ではclaimを保持し、Account / membership / epoch / object identityを固定して回復する。
- 経過時間だけでclaimを解除しない。D1更新失敗、Worker crash、重複request、Account変更も検証する。
- 本再現2件を成功させ、既存全回帰と実workerd/D1検証を実施した後、残りのB1-6統合へ進む。
- 修正工程でもproduction deploy / migration / cutover / enforcement / shared writeの有効化は別途承認範囲とする。
