# Project Cloud Sync — 最終canary統合・導入手順

この文書を#192/#193統合後の運用正本とする。過去の日付付き文書・PASS証跡は保全し、そこに残る「正規Account purge後のProject本文保持HOLD」は本統合で解消した範囲について本書が置き換える。新しいProject機能の追加開発は終了し、以後は承認済み範囲の本番canary、実機受入、Studio UI最終調整へ進む。

## 固定成果・変更境界

- 最新main確認値: `210c2ff08a80402d03811656697c1b7b6f51d1ff`（Port 1.26.2 / Studio 0.74.1）。
- 共通基点#190: `2cfce456722c5f7c6a873ca10d67ec089b240821`。
- #192: `fe8fae374e819048ec224f866da150fb0d920809` / tree `c4d7337ea23d8728422e26d3b0b1f0f898deb09a`。
- #193: `e22b96be5ff27617ce731a3ff384993eab6511da` / tree `74ec4dd239fd84524580d830335e678dac91e70c`。
- 新規独立branch `codex/project-cloud-final-canary` を最新mainから作り、両固定commitをmerge。既存PR/branch/worktreeは変更しない。
- Studio候補 **0.76.1**、Worker package **0.1.1**をそれぞれ維持。統合のための追加version bumpなし。Worker package番号はProduction version/deployment番号ではない。
- 製品コードのmerge競合なし。追加の製品実装・保存形式・DDL変更なし。追加したのは接続境界の試験と本手順・証跡のみ。
- Port画像修正を含め、Port・4アプリ・sharedは最新mainと同一tree。NEWS・一般Studio制作UIの無関係な変更なし。

## canaryとAccount削除は異なる権限経路

| 操作 | 権限・時期 | 結果 |
| --- | --- | --- |
| 通常のProject API | Account / Account Device / Project UUIDの完全一致、正規Pro、最終SQL、既存activation CAS | 対象だけ許可。OFF時423。対象外・失効は拒否 |
| canaryからの個別erase/物理回収要求 | 既存Ownerのcanary maintenance HOLD | 引き続き拒否。HTTPや表示だけで本文を消さない |
| 真のCAS拒否操作の明示整理 | #192のProject-scoped discard、照合・明示確認 | UNKNOWNを破棄せず、ローカル草稿とOutbox証拠を保持 |
| 正規Account削除の猶予中 | native Account lifecycle | Project本文と未確定chunksを保持。削除中Accountの新規Project書込みは拒否 |
| 正規Account削除の取消・復旧が先行 | native最終DELETEが0件 | Project消去・receipt作成なし。既存の再資格取得契約は維持 |
| 正規Account purge確定 | native DELETEと同じD1 batch、`changes()=1`、Account不存在、既存schema/recovery guard | terminal erase receipt、chunks/heads削除、history payload NULL、enrollment失効。途中失敗は全rollback |
| 既に孤立していた本文 | Account不存在だけでは権限不足 | 自動消去しない。過去の削除経緯を推測しない |

Project control/activationがOFFでも、正規Account purgeの最終処理は実行する。ONでも猶予や取消を無視しない。Scheduledは新しい削除サービスではなく、既存native Account purgeへ#193のSQLを同一batchで接続するもの。既存の短期Studio erase intentを7日間へ延長したり、期限切れintentを復活させたりしない。

Project erase後も既存receipt、pending manifest、操作/復旧証拠のmetadataを保持する。クライアントのローカルschema2 ProjectやAccount別Outboxは消去しない。共有Port/4アプリのデータ削除契約は既存のnative lifecycleが担当し、Project用SQLが他アプリの表を消去することはない。

## v139との差分・schema互換性

前提のProductionはv139 version `b33b3776-5014-4fe8-8533-efe0134c3192` / deployment `94376026-664e-494f-8750-67faeebd091c`、RC4適用済み、Project OFF。本作業ではこのProduction状態を新たに変更/配備/データ操作していない。

配備entryは **`src/studio-canary-entry.js`**。既存`index.js`を唯一の一般API実装として使い、既存activated factory / Owner / Session / Outbox / CAS / recoveryを再利用する。Scheduledは同entry → 既存OFF wrapper → `studioScheduledDatabase` → native Scheduledへ接続し、#193のpurge連携が含まれる。Wrangler既定の`src/index.js`だけを直接配備してこのwrapperを落とさないこと。

v139からの実質差分は、(1)明示的な対象限定activated entry、(2)対象Projectに絞る一覧・Session grant・canary frontend、(3)正規Account purgeへのProject消去接続。一般Port/4アプリAPI実装・writer認可・Asset物理cleanup HOLDは維持する。既定`studio-release-entry.js`は引き続きProjectをOFFにする。

追加DDLは不要。既存RC4 83構造、共有102構造、journal33件、schema2、immutable codec bindingは変更なし。固定値をローカルで再照合した。

- schema0033 fingerprint: `fac6295ff89f2f6a2a754329baba3f1c2264b48670249def9d0ac7b8886843d1`
- RC4 DDL SHA-256: `9fe8c42228f08df58c165d616780a252b45d7b58590ead1c70e394f6f3de00a9`
- 既存88文SQL SHA-256: `2f65ddf9a5b6a564049d7370b4162e3d61b659e90720cc3aa4e30ed87da50017`

これらは再適用指示ではない。本番DDL、migration journal、R2、実Account/Projectは本作業で変更していない。

## 最小の本番canary手順（別途明示承認後だけ実施）

1. この単一統合PRの固定head/treeを配備元にする。直前にProduction version・RC4 marker/control・activation revision・vars/bindings/cron・通常backup/復旧先を読み取り照合する。追加DDLを行わない。
2. 正規の管理情報から運営者Accountと**Account Device ID**を選ぶ。Port AppDevice ID、表示名、同名端末から推測しない。双方の端末を個別指定し、datasetIdには承認した**Project UUID**を指定する。未使用のコピー復元用Project UUIDも必要な分だけ承認する。実ID・資格をsource/公開manifest/ログへ記載しない。
3. D1 control/activationをOFFのまま、既存Workerへ明示entryでdry-run → `--keep-vars`付き配備を行う。新Worker/DB/bindingを作らず、Production専用vars、cronを維持する。通常env flagだけではcanaryを有効化しない。`STUDIO_RELEASE_ROUTE_ENABLED=false`を無断で変更しない。
4. 既存`studio-canary-plan.mjs`を使い、fresh metadataからprivate activation SQLを生成・hash確認する。入力はexpectedRevision/new operationId/mode=canary/targets/reason。既存`changeStudioActivation`の監査/CASを使い、enabledは最後に設定する。

```sh
node workers/sound-cruise-sync/scripts/studio-canary-plan.mjs \
  --input /private/operator/canary-input.json --out /private/operator/canary-plan \
  --wrangler /absolute/existing/node_modules/wrangler/bin/wrangler.js \
  --config /absolute/frozen/workers/sound-cruise-sync/wrangler.jsonc \
  --database sound-cruise-sync
```

生成はSELECTのみ。SQLの承認後、対象DB・full hash・fresh revisionを照合し、既存`wrangler d1 execute sound-cruise-sync --remote --config ... --file /private/operator/canary-plan/activation.sql --json --yes`で**1回だけ**適用する。応答喪失時は再送せず、activation/log/controlを読む。migration applyは禁止。

5. frontendは既存packagerから **90ファイル**を`/apps/cruise-studio-canary/`用に生成する。現在のPagesは`legacy / main / /`のJekyll配信（GitHub設定をread-only確認）。通常Studioを置換せず公開する最小方式は、その時点の公開mainを基準とした**配布用commitに生成90ファイルだけを追加**し、明示承認済みのPages公開操作で反映すること。新しいworkflow/Feature Flag/別UIを作らない。現在の通常Studio81ファイル・Port/4アプリ/sharedをその公開commitでは変更しない。生成物は同じsourceから再生成し、手で保守する第二UIにしない。本PRに生成90ファイルを混入させて自動公開することはしていない。

```sh
node apps/cruise-studio/scripts/package-project-canary.mjs --out /absolute/new-release-directory
# 明示承認した公開checkoutへ、出力のapps/cruise-studio-canary/だけを反映する。
# Jekyll --safe実build、通常81/既存アプリ、canary90のhashを確認してから公開する。
```

将来のURLは `https://soundcruise.jp/apps/cruise-studio-canary/project-canary.html`。現在は公開していない。一般StudioはProject Cloudをロードしない。canary URLもPro/Account入口とserver grantが必要で、URLを知っているだけではCloud機能を使えない。

6. 運営者が既存資格で入場し、対象Projectの初回保存、二端末の一覧/受信/更新、Offline/復帰、競合・ACK復旧を確認する。実Accountを削除してpurgeを試験することはこの準備の承認範囲ではない。実機結果を合成PASSと混同しない。

## OFF・復旧

通常の停止は、fresh expectedRevision/new operationIdでmode=off/targets=[]の既存planを作成して適用し、control=0、両Project経路423を確認する。**新しい統合Workerを保持したままOFF**にすれば、#193の正規Account purge連携も維持できる。ローカルProject/Outbox/Cloud本文を巻き戻さない。

既存APIの重大な退行など、Worker自体の復旧が必要なら、別途承認した直前v139 versionへ戻す。v139には#193のpurge連携がないため、これは一般APIの継続性のためのfallbackであり、本文消去の機能同等性はない。canary運営者Accountの削除を停止中に新たに確定しない。既に孤立した本文を推測で削除しない。共有D1巻き戻し・逆DDL・R2/Outbox消去・追加の自動配備は行わない。

停止条件は固定値/設定/対象の不一致、activation audit不整合、新しい重大な認可/保存/既存Sync退行、backup/復旧先不備。通常OFFでもnative Account purgeは有効なので、停止を消去処理の無効化と誤認しない。

## 運用値・Scheduled・残る受入

#192の値を維持: 100 documents / 2,048 unresolved operations / 128 MiB per Account、600 authorized requests/minute（既存native limiterも適用）、recovery evidence 4,096 rows / 16 MiB、history最低30日、rate記録1日、短期intent10分。#193が使うAccount猶予は既存native契約であり、このintentとは別。新しいretention機構は追加しない。

2026-11-05 12:15 JST（03:15 UTC）のv139 Scheduledは、作業開始時点06:36 JSTでは予定前。Production実行のPASSとは扱わず、別途read-only受入を維持する。本番canaryの対象ID未選定、実機Project受入、実際の配備後Scheduledは未受入。Asset物理cleanup HOLDは維持する。これらを追加機能開発や無期限再監査の理由にはしない。

## 限定検証

- 統合製品E2E **25/25 PASS**: #192の23ケースを実際の製品入口で維持し、同じWorker/DBで削除猶予/取消と最終purgeを追加。Production captureの102構造＋journal33件と完全一致する隔離D1に既存RC4を適用。実際のcanary entry Scheduledを呼び、local Project/Outbox hash一致、peer/shared非干渉、erase receiptを確認。
- Worker Node **43 unique PASS**（最初の41ケース＋actual entry OFF/ON 2ケース）。#193の15ケースとcanary/0033 final guard等を再利用。Account/chunks削除途中のfault rollback、取消race、ACK再実行、FK cascade、無証拠orphan保持を含む。
- Studio関連Node **29 PASS / 4 conditional未実行**。#192の既知main由来テーマ4FAILはsource不変のため既存比較証拠を再利用し、今回再監査していない。今回実行分に新規FAILなし。
- 追加の製品コード修正なし。0.76.1通常Jekyll81/既存813ファイルbyte一致、canary90/hashは#192と同一。公開main0.74.1＋生成canary90だけの別リハーサルもJekyll実build/ローカルHTTPで確認。通常Cloud/development/Worker URLは404。
- 実Account・Production資格・本番Worker/D1/R2操作はなし。原子的SQLは実workerd D1で検証し、実機/Production PASSとは称していない。
