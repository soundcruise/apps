# 初期OFF配備直前 preflight — 2026-11-04

**判定：#189そのままのWorker先行配備は推奨しない。限定Port修正を含む候補は合成受入PASS。
Port 1.26.2のフロントエンド先行反映・確認を条件に、同じWorkerの初期OFF配備の承認へ進める。**
本工程は読み取り・ローカル試験のみ。main/Pages/Worker/D1/R2/実Accountは変更していない。
追加の全体監査や新基盤の開発は要求しない。

## 固定基準と範囲

- #189 head `2991992c3fae92f817e402a95b5ecf7736d21481` / tree `9cd2ea9880bbca98990547c055f3e2a8df09ba9d` は保持。
- remote main `c862e590ead36f41e39574997bf34517120e51dd`、公開Port 1.26.1 / Studio 0.74.1。
- 独立branch `codex/worker-off-final-preflight`。既存worktree、未コミット作業、過去PRは変更しない。
- 本候補Port 1.26.2、未公開Studio累積候補0.76.0。Project Cloudの公開・起動は行わない。
- 本追加差分ではWorker/src、DDL、wrangler設定、shared、4アプリ、NEWSを変更しない。

## 代表Assetケースと最小修正

既存の製品E2E・実製品UI・使い捨てChrome・合成Worker/D1/R2を再利用した。
AでGearを保存し、実画像選択・crop・保存でsource/finalをupload。
正規のAccount解除後、Bの正規参加コードをPort UIからconsumeした。

参加直後は旧GearとAsset metadataが残る。Aのscoped Outboxは保持、BのOutboxは空、runtimeは停止、
Bへの自動pushは0。この安全停止は正常であり変更しない。
その後、既存native確認の「端末のデータを送信・統合」を明示承認すると、#189では旧AのAsset IDを含む
初回datasetが送られ、最終writer fenceがHTTP503 `dataset_authority_unavailable`で拒否した。
AのAssetはBで読めず、Bに外国参照は保存されない。拒否を緩める修正は行わない。

限定修正は既存Port Asset Syncへ37行、controllerへ3行。
初回migrationのみ、正規Account/AppDevice資格取得後・bootstrap前に画像参照を準備する。

1. 現Account資格で既存Assetの取得可否を確認。成功なら参照はそのまま。
2. `asset_not_found`の場合だけ、端末にsource/final本体が残ることを確認する。
3. 既存`backupSnapshot`で旧metadataを保全し、既存`uploadPair`/prepare/upload/commitを再利用。
4. 明示承認されたローカル画像を新Accountの新しいIDで登録し、既存repository CASで参照を更新。
5. AのAssetの再利用・ダウンロード・unreference・削除はしない。AのOutbox、ローカル画像本体も保持。

空端末の自動初回同期では対象画像がなく、通常の同期再開ではこの処理を呼ばない。
ネットワーク/503/資格変更、ローカル本体欠落、別編集を指すpending、backup失敗は参照を置換せず停止。
一致する既存pendingは既存operation IDのまま再利用する。未確定操作を捨てて新IDへ付け替えない。
この修正はGear/My Appsの画像pairを対象とする。添付の別Account移管機能を新設してはいない。
画像が端末にない場合や旧Accountの未確定操作を自動解消する仕様は追加しない。

修正後の同じ製品ケースは同期済み、B Gear1件、Aの旧Asset参照受理0、A Asset2件保持。
同一Accountの画像・添付・再編集・削除・ACK/CAS回帰も既存試験で通過した。

## Production read-only preflight

既存CLI認証を利用し、管理APIはGET、D1はschema/journal/aggregate SELECTのみ。
Account APIへの資格付き要求、ユーザー本文/画像取得、書込み、R2 list/deleteは実施しない。

- Worker **v138**、version **`fb755ee6-e9dd-41f1-8e6e-e71b6b7ee054`**、100%。
- deployment `b17366fa-0ac6-4589-9d49-4c9563ecbcac`、2026-10-30T06:00:19.87217Z。
- schema fingerprint `fac6295ff89f2f6a2a754329baba3f1c2264b48670249def9d0ac7b8886843d1`。
  アプリtable43/index59、journal連続33、Project構造なし。D1 rows_written=0。
- Asset総数39、30日以上unreferenced0、24時間以上incomplete0、Account不在0。
  候補数の集計であり物理削除の承認ではない。0033物理cleanup HOLDは維持する。
- compatibility_date 2026-09-01、flagsなし、usage standard、cron **`15 3 * * *`**。
- D1/R2/AI/rate-limit bindingsと公開varsは候補と一致。
  **本番にのみ`STUDIO_RELEASE_ROUTE_ENABLED="false"`がある。** 配備時は`--keep-vars`で保持する。
  secretは値を取得・出力せず、既存secret bindingを保持する。資源の再作成は不要。
- observability/logs設定は一致、traces無効を維持。新しい監視構成は追加しない。
- 公開静的Port/Studio/4アプリの正規URLは200。Worker `/health`は200、
  Project `/v2/studio/document`は423 `studio_off`（正規Originの読み取りGET）。
  originなしの素の取得は403となったため、それをサービス障害や認証成功とは扱わない。
  音感/指板の正規公開URLは`standard/`であり、rootの404は正常な配信構成。
- 実Accountの認証・保存・Syncは操作しておらず、これらの本番実動作PASSとはしない。

## v138 artifactの出典と候補との差分

既存管理API GETで配布module `bundle.js`を読み取り取得した。
SHA256 **`de6b6fbd2f759fdc55a32662e10d224e11d876672405b604944270387cc19b15`**、1,187,440 bytes。
Git **`21d76600c5abcfd752a1564f7e8262815086c443`**の
`src/studio-production-entry.js`を既存esbuildで再ビルドしたものと、末尾の
`//# sourceMappingURL=studio-production-entry.js.map`を除いて**全byte一致**。
再ビルドhash `90018b4fda57aeb2ec9e736bcf1a87f8eaf33d639b63bba631f7ac1eb949f3f9`。
artifact・管理生出力・Time Travel metadataはprivate tmpに保存し、資格・実データを公開証跡へ入れない。
古い複製bundleをrepoへ再追加しない。

配備候補は同じWorker名の`src/studio-release-entry.js` → 現行`src/index.js`。
主な既知差分：

- v138は`studio-legacy-v137.mjs`を内包したproduction-entry。候補は現行単一source。
- v138はflag/policyが揃うとProject Ownerを起動し得る。候補の初期OFF entryはその起動経路を持たず423。
- v138の旧cleanupは予約なしの物理削除を含む。候補0033では参照復旧を維持し、物理削除をHOLDする。
- 候補のAccount/Device/Pro最終SQL fence・Asset所属チェックは#189の意図した追加。
  Project関連旧候補の非起動経路整理とschema0033互換差分は#188/#189の既存受入証跡を参照。
- ScheduledのProject proof保護は保持。schemaなしでは従来の共有cleanupへ進む。

旧snapshotと現行sourceのbyte同一性を主張せず、上記変更を含む別の固定技術候補として承認する。
出典不明のbundleを推測で採用している状態は解消した。

## 今回の検証

- 実製品E2E **52/52**、page error0。既存51ケース＋代表Assetケース1。
- 既存画像/添付/ACK/CAS復旧E2E **12/12**。
- Asset/controller/cache/Studio metadata追加・関連Node **107/107**。
- Port全Node **1248PASS / 5FAIL / 1253件**。後から追加したcontroller2件は上記107件でPASS。
  5件はmainの同じ2試験ファイルでも再現：theme4件、SP2 shared-runtime cache期待値1件。
  runtimeはv33、旧期待値v32。今回由来ではなく、無関係な期待値緩和・CSS修正はしない。
- Jekyll実build：Studio **81ファイル/hash一致**、native出力813ファイルは本checkoutとbyte一致。
- 初期OFF entryのWrangler4.131.1 `--dry-run --keep-vars`成功。実配備なし。
- Worker src/DDL/configは#189とbyte不変。#189のNode940、追加20、ProjectON14、Owner33、
  RC4 83CREATE/88文の合成受入は既存証跡として継承し、今回は再実行していない。
- 新しいDB/Worker/Owner/Sync engine/保存schema/保存キー/復旧基盤は0。

## Backup・復旧準備

既存`PRO_AUTH_OPERATIONS.md`の通常運用を利用する。
D1 Time Travel infoは読み取り成功、bookmark利用可能。bookmarkと管理出力はprivate保存。
この確認はバックアップ内容の検証や復元リハーサルではない。
実ユーザー行/Pro verifierを含むSQL export、バックアップの書き換え・復元は行わない。
初期OFFはDDLを適用しないため、Worker直前versionへの復旧が通常の第一手段。
Project DDLを後日適用する場合だけ、別承認された既存の暗号化backupと直前bookmarkを実施する。
共有D1のTime Travel巻戻し、逆DDL、Outbox消去、R2削除は通常rollbackに含めない。

## 承認後の最小手順（本工程では未実行）

1. **Portクライアントパッチを先行**。本PRのクライアント修正commitを、最新mainに限定適用する
   frontend公開候補として承認する。Project Cloudを有効化する必要はない。
   PagesがPort 1.26.2と新しいcontroller/Asset module cache keyを配信したことを確認。
   既存タブも正規の「ページを更新」で新moduleを読み込む。Account解除・再参加は要求しない。
2. 最新main/固定候補/直前version、schema0033/journal33、bindings/vars/cronを差分確認。
   上記値が動いていれば、その差分だけを判断して停止/続行する。古いpreflightを盲信しない。
3. 別途明示承認後、同じWorker・既存bindings・既存varsで初期OFF sourceを配備する。
   以下のコマンドは予定の記録であり**実行していない**。

```sh
# cwd: workers/sound-cruise-sync, fixed approved checkout
npx --no-install wrangler deploy src/studio-release-entry.js --config wrangler.jsonc --keep-vars
```

`--keep-vars`を省略しない。crons/資源/secretを変更せず、Project DDLは未適用のまま。
配備後はhealth200、Project423、version/traffic/vars/bindings/cronを読み取り確認。
運営者による既存Account/Pro/Port/4アプリの限定確認は別の実機操作であり、本工程のPASSに含めない。

異常時の通常復旧（その時点の明示承認範囲でのみ実施）：

```sh
npx --no-install wrangler rollback fb755ee6-e9dd-41f1-8e6e-e71b6b7ee054 --config wrangler.jsonc --name sound-cruise-sync --message "Restore pre-Project initial-OFF Worker"
```

復旧先は上記v138。frontendの必要な復旧も限定commitで行い、Cloudデータは巻き戻さない。

### 配備停止条件

- 固定候補、main、Production version/structureの未承認差分。
- Port画像パッチ未配信、または更新後も代表経路で重大な同期停止が残る。
- vars/bindings/cronの変更、Project経路の起動、想定外のDDLが必要になる。
- Account/Device/Proの資格退行、他Account Asset参照受理、データ混在・消失の具体的兆候。
- 保全した直前versionへの復旧手段が利用できない。

既存0033物理cleanup HOLD、Project本文物理削除未開発、実Account受入の未実施だけを理由に、
初期OFFの前へ新しい開発基盤や全面再監査を追加しない。
