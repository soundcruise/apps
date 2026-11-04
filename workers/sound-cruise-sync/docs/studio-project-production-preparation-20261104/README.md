# Studio Project Cloud — 本番導入準備（2026-11-04）

後続の[0033 source互換受入](../schema0033-source-compat-20261104/README.md)で、ここに記録したsource阻害点を限定修正した。本書は導入前調査の証跡として保持する。

候補Studio 0.76.0。#186 → #187の累積成果を保持する。
固定headはそれぞれ c9b742912430b3fad4eec22fb19faa23b35330e9 / 695d533241ee6552484d653143dff14feb79d4da。
#187 tree: 845ed65617f4ef5286ff6655d14bba840a7eee5e。
今回取得したremote mainは c862e590ead36f41e39574997bf34517120e51dd。
ユーザーの更新情報と実際の取得結果を区別し、後者では前回基準から移動していなかった。
旧PR、main、既存worktreeと未コミット作業は変更しない。

**判定：schema受入と隔離リハーサルは完了。Production適用は未承認であり、まだ実行不可。**
具体的な阻害点として、現在mainの既存Worker sourceがschema0033にないwriter構造を参照する。
Owner OFFだけではこの既存API問題を解消しない。本番で稼働するWorkerが現在main sourceと同じと推測しない。
この既存source互換差分を限定修正・確認する工程を、最初の実行条件とする。
本番artifactの完全取得がないこと自体を無期限HOLDの理由にはしない。

## 取得した本番メタデータ

既存Wrangler 4.131.1・既存SYNC_DB設定・既存CLI認証を利用した。
実行したD1操作は以下のSELECTのみ。結果のD1 metaは両方とも rows_written=0。

```sql
SELECT type,name,tbl_name,sql FROM sqlite_schema
WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name;
SELECT id,name FROM d1_migrations ORDER BY id;
```

- アプリ構造102件：table43、index59。view/trigger/Project構造は0。
- Cloudflare内部 `_cf_KV` は既存照合契約に従い除外。内部行は取得しない。
- journalは連続した1〜33、最終0033_add_pro_device_sessions.sql。旧fixtureと全件一致。
- アプリDDLは既存schema0033 fixtureと名前・SQL本文で完全一致。
- 本番fingerprint: fac6295ff89f2f6a2a754329baba3f1c2264b48670249def9d0ac7b8886843d1。
- DB容量metaは約4.3MB。ユーザー本文・件数・Account/Device ID・資格・Cookieは取得していない。

旧合成profile a449ac77… はMiniflareが自動生成する `_cf_METADATA` も含む103構造だった。
以前のprofileだけでは実本番は studio_migration_base_unknown / base_schema_unknown になる。
今回の最小修正は、取得した本番102構造の**別の完全一致profile**を追加すること。
未知のtableやjournalを許可せず、旧Miniflare profileも保持する。
導入markerのbase fingerprintを実際のprofileへ固定し、導入後・最終SQLでも照合する。
実ユーザーデータの変更はない。

読み取り専用のWorker deployment metadataも取得した。
最新記録は2026-10-30T06:00:19.87217Z、version fb755ee6-e9dd-41f1-8e6e-e71b6b7ee054、100%。
復旧時に使う候補値であり、実適用直前に再確認する。versionの内部コードとv138呼称の同一性は未確認。
生の管理出力はprivate tmp内、公開証跡には日時・version・weightのみを残す。

## DDLの最小採用範囲

既存RC4 `studio_0001_rc4` の83 CREATE（23table / 2view / 55trigger / 3index）を変更せず採用する。
適用計画は事前SQL assertion＋83 CREATE＋独立journal/marker/control＋最終assertionの88文。
元のDDL hash: 9fe8c42228f08df58c165d616780a252b45d7b58590ead1c70e394f6f3de00a9。
本番にはこの83構造はいずれも存在しない。追加対象はstudio_document_*のみ。

| 既存グループ | 役割・依存 |
|---|---|
| DOCUMENT 15文 | Owner enrollment、pending/chunks/receipts、head/change/dataset、Account/Device view |
| RELEASE_EXTRA 6文 | 独立migration marker、recovery proof、Account単位rate |
| RC2 21文 | usage、resolution、retention/erase evidenceとimmutable/usage trigger |
| EVIDENCE 37文 | operation epoch/revision/checkpoint、各証拠変更のrevision trigger |
| ACTIVATION 4文 | 既存の初期OFF/canary/general台帳と不変log |

release Ownerは83構造の正確なDDL hashを検証し、usageやrecoveryを通常経路でも参照する。
基本15文だけは隔離core試験用であり、release profileの代わりにはしない。
一部の管理操作は初回canaryで使わなくても、今回の既存release契約からtableを抜くと安全停止する。
83文を理由なく削る別profile設計は行わない。新しい一覧/コピー復元tableは不要。
maintenance-v2のtable、0034〜0037、別DB/Worker/DO/Controlサービスは導入しない。

共有 `d1_migrations` は33件のまま。0034等の番号を流用せず、独立marker `studio_0001_rc4` が順序1で記録する。
再実行と部分導入は拒否する。失敗・応答喪失時は先にschema/markerを読み直し、盲目的に再送しない。
適用後のschemaを破壊的に巻き戻さない。

## 再現・生成（ローカル専用、実行済み）

```sh
node workers/sound-cruise-sync/scripts/studio-release-plan.mjs \
  workers/sound-cruise-sync/test/fixtures/studio-production-schema33.json \
  /private/tmp/studio-offline-plan
node --test workers/sound-cruise-sync/test/studio-production-preparation.test.mjs
```

generatorは既存studioReleasePlanを再利用するofflineツール。接続・DDL適用・deploy機能はない。
出力SQLはこの文書の隣にも固定。移行windowでは最新の同じ読み取り結果から再生成する。
同梱PLAN.jsonのSQL hashと一致させ、変更されたschemaなら停止する。
実本番での適用前に、このSQLがD1ファイルimportの1回の原子的適用となることを確認する。
ローカルでは既存D1 batchとSQLite transaction双方で、途中失敗のrollbackを検証した。
remote importサービス自体の受入は今回行っていない。

## Owner配備方法（準備のみ）

#147の studio-release-entry.js / studio-release-worker.js / studio-scheduled-rc2.js をそのまま保全した。
既存indexをdelegateする同じWorkerのalternate entryで、新Workerや複製legacy bundleを作らない。
wrangler.jsonc/main設定は変更しない。既定構成はcapability/configurationなしでProject routeを423 studio_offにする。
HTTP header/query/env flagから有効化できない。OFFで既存HTTP requestは同じlegacy関数へ渡される。
Scheduledは既存のProject recovery proof保護を再利用する。未知/部分Project schemaは安全停止する。
追加DDL後に最初に外へ配る版はこのOFF構成。まだfrontend Cloudファイルも配布しない。

将来有効化する際は、既存createStudioActivatedWorkerへtrusted build側で次を渡す。

- 現行Account/Pro helperと同じSYNC_DB/bindings。Project専用enrollment、Port writerとは別。
- 既存Studio schema2 validator（現在製品E2Eが組み立てる同じmodule順序）。HTTPからvalidatorを受け付けない。
- Project routeのOrigin、既存SYNC_RATE_LIMITERへのalias。新しいrate bindingを作らない。
- 明示承認したlimits/rate/evidence/retention policy。既存Controlとactivation台帳の初期OFFを維持する。
- 最初は既存canary対象Account/Device/Projectだけ。既存changeStudioActivationのrevision CASを使う。

正式なfrontend配布変更とproduction transport/origin許可は別の明示承認が必要。
今はCloud6moduleとstylesheetはJekyll81件から除外され、本番接続も拒否されたまま。
Projectの状態はPort/4アプリの状態と分ける。Project一覧はread-only、受信は既存raw CAS、
削除後はローカル保持・新IDコピー復元。Account不明のデータやUNKNOWNを勝手に採用/破棄しない。

### 初期運用値の提案と停止条件

今回のactivation試験値はdocuments100、operations200、bytes128MiB、rate600/60秒、
evidence4096rows/16MiB、rateKeep120秒、intentLifetime60秒、minHistoryAge0であり**合成専用**。
本番へそのまま持ち込まない。特にoperationsは履歴を含む上限なので、通常編集の回数で到達し得る。

本番の初期canary案はdocuments100、operations2048、bytes128MiB、rate600/60秒、
evidence4096rows/16MiB、rateKeep24時間、intentLifetime10分、minHistoryAge30日。
これらは候補値であり容量/料金と通常の保存頻度を運営者が承認してから設定する。
既存IP limiterの上限も別に効く。quota/budget到達は保留を明示し、データやUNKNOWNを削除しない。
operation証拠に自動TTLを設けず、既存の明示的な確認・epoch compactionを使う。
Projectの自動物理削除jobは追加しない。共有Asset cleanup/R2/Scheduled運用値を変更しない。

## 具体的な既存Worker sourceの阻害点

現在mainのsrc/writer-admission.js:admitWriterは、Account管理下のPortへのmutationで
sync_account_memberships.minimum_writer_protocol / write_epoch / authority_state等を読む。
取得済み本番0033にはこれらがなく、同じ構造のローカル試験は no such column: minimum_writer_protocol を再現した。
sync_writer_fence_assertion / sync_authority_cutovers / sync_asset_deletionsも存在しない。
従って「現行indexをwrapしてOwner OFFにすれば既存サービスは本番互換」とは判定できない。
これは本番サービスが現在壊れているという意味ではない。稼働versionの実装とmain sourceの差は未確定。

最小の解決候補は#145固定70cd871a…のschema0033互換ハンクを再利用し、
未採用authority配線を通常経路から分離すること。writer-admission、PortのPro最終SQL、
Asset read/write、Scheduled cleanupを対象に限定する。旧Worker全体・maintenanceサービス・
旧Studioをコピーしない。既存Portの通常/画像/削除/cleanupを**そのsource entry**で通す必要がある。
今回のprepではこの既存Sync変更に拡大せず、再現証拠と具体的な採用先を固定した。
本番DDL追加で穴埋めする案は採用しない。

## 合成試験と証明範囲

- 本番構造そのままのローカルSQLite：追加88文、初期OFF、共有構造/journal不変、再適用・drift・部分導入拒否。
- Miniflare：既存schema0033＋内部_metadataにRC4追加、非空の共有行不変・初期OFF。
- 実製品入口：既存のactivated配備factoryを追加して14/14。catalogue/別端末受信、更新・自動再開、
  Offline、二端末CAS、ACK/UNKNOWN照合、削除・新ID復元、copy ACK喪失、encrypted backup/別DB restore、
  Port双方向Sync共存、5テーマ/4幅、別Account拒否。実Accountは使わない。
- Owner直接境界33/33、現行Account/Pro/repository helper Node29/29。
- OFF wrapperと既存source互換阻害点の固定試験4/4、DDL1/1、Wrangler alternate entry dry-run成功。
- #187のNode336/46、protocol48、Port/Apps/制作51、画像/添付復旧12を継承。無目的な全面再実行なし。
- Port/4アプリ/shared/NEWSのtree、既存index/設定は変更しない。Jekyllの公開81ファイルも同一。

注意：製品E2EのPort通常APIは、既存のhash固定legacy fixtureを利用する。
そのPASSを「現在mainのWorker sourceがそのまま0033で本番配備可能」の証明には使わない。
Productionデータ行をローカルへコピーした試験でもない。metadataだけを合成データと組み合わせた。

## 本番実行時の最小手順（今は実施しない）

1. 上記source/schema互換ハンクを限定適用・隔離受入する。既存route/binding/cron/secret名を維持し、
   正規schema2 validatorと正式policyを組み込んだ同一Worker候補を固定する。
2. 適用window直前にschema/journal、現在main/Worker version/config/Pagesをread-onlyで再固定。
   既存の通常D1 backup/exportを運営者の保護領域へ取得し、bookmark/復旧対象/versionを記録する。
   現在は構造以外の読出し未承認なので、backup本文の取得はしていない。
3. 明示承認後、同じWorkerへProject OFF版だけ配備。既存APIの認証境界と通常運用を確認する。
4. 別の明示承認後、直前metadataから生成・hash照合したstudio_0001_rc4.sqlを1回適用する。
   コマンド形は既存Wranglerの `d1 execute SYNC_DB --remote --file <固定SQL>`。
   通常の `d1 migrations apply` は0034等を巻き込むため使用しない。途中で複数commandへ分割しない。
   shared journal不変、独立marker/hash/base、83構造、enabled=0を再度SELECTして確認する。
5. Ownerのtrusted configuration、既存activation canary、frontendの配布7ファイル/production transportを
   明示承認された順序で有効化。実Account/Pro・二端末/Safariで一覧、保存、CAS、Offline、復旧を限定受入。
   競合の選択や本番データ作成は運営者が行う。正常結果だけを根拠に段階的に公開範囲を広げる。

新規Worker/DB/Control/鍵サービスは不要。Project本文は既存D1 chunk経路を利用し、R2変更は不要。
NEWSの別backendや既存アプリの保存schemaへ影響させない。

## 復旧条件

- 初期OFF段階でProject送受信が一度もなければ、直前Worker versionへ戻し、frontendは既存公開のまま。
  DDLが追加済みでも削除・逆migrationしない。実際のversion/rollback可能性はwindow時に再確認する。
- 有効化後はまずProject route/clientをOFFへ戻し、既存Scheduled proof保持を残す。
  Project recovery証拠を保持しない旧Schedulerへ無条件に戻す判断はしない。
- 共有CloudデータのTime Travel巻き戻し、Outbox消去、R2削除を通常rollbackに含めない。
- D1 import応答喪失/部分状態なら再適用前にmarkerと全schemaを照合。ClientはOFFのまま。
- backupからの実本番Restoreは別承認。fixture専用backup scriptをProductionに転用しない。

参考：
[Wrangler D1 execute](https://developers.cloudflare.com/workers/wrangler/commands/d1/#d1-execute)、
[D1 batchのtransaction保証](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)、
[Wrangler rollbackの制限](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)。

### コマンドの固定形

以下は将来の明示承認後の手順例であり、今回remote書込みは実行していない。
WRANGLERはインストール済み4.131.1のbin、CONFIGはこのWorkerの固定config、WORKER_ENTRYは上記互換試験済みの候補entryを指す。
最初のread-only２要求は今回実行済みだが、window直前に再取得する。

```sh
node "$WRANGLER" d1 execute SYNC_DB --config "$CONFIG" --remote --json \
  --command "SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_cf_KV' ORDER BY type,name" > "$PRIVATE_DIR/schema.json"
node "$WRANGLER" d1 execute SYNC_DB --config "$CONFIG" --remote --json \
  --command "SELECT id,name FROM d1_migrations ORDER BY id" > "$PRIVATE_DIR/journal.json"
```

両方success=true/rows_written=0を確認し、resultsをそれぞれschema/journalキーへまとめた構造JSONをgeneratorへ渡す。
PRIVATE_DIRは運営者の保護ディレクトリ（権限0700）。認証tokenを引数に記載しない。
DDL/Worker/有効化は個別承認範囲を確認し、順番に実施する。

```sh
# source互換性を合格させた同一Workerの初期OFF候補だけ。先にdry-run。
node "$WRANGLER" deploy "$WORKER_ENTRY" --config "$CONFIG" --dry-run --outdir "$PRIVATE_DIR/bundle"
# Worker配備の承認がある場合だけ、同じentry/configでdry-runを外す。
# DDL適用の承認がある場合だけ、既存DBへ固定SQLファイルを1回import。
node "$WRANGLER" d1 execute SYNC_DB --config "$CONFIG" --remote --file "$PRIVATE_DIR/plan/studio_0001_rc4.sql"
```

Backup、source互換性、直前version、preflight/SQL hash、initial OFFのいずれかが未確認なら書込み段階へ進まない。
canary/general activationやfrontend有効化はこれらのコマンドに含まれない。
