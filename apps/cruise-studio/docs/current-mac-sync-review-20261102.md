# 現在のMacを既存profileで同期させるための確認

## 固定基準と変更範囲

- PR #169: `bb2d9356e641971d7643e218bb068f79567becf3` / tree `8581b9dd0bbc78b59d993fdf31d897b33a10cdf4`。
- 最新main: `397d4492b9d0e37152a16f4ed328f58d7be6afe2`。#169はOPEN/Draft、mainへの競合なし。
- 作業branch: `codex/port-current-mac-review-20261102`、#169から独立。
- 今回の製品差分は非空端末の確認文だけ。送信・統合の承認であり、受信だけではないこと、旧Accountデータも送信対象になることを明記。既存Syncの開始条件・API・保存処理は変更しない。
- immutableな#169の候補1.25.2と区別するため、追加修正はPort 1.25.3候補。Studioは0.71.3のまま。

## 実機で確認できた範囲

ブラウザの読み取り接続を試みた。接続可能なIABタブはlocalhostの合成プレビュー。Chromeの既存画面はprofile選択、Safariの既存画面は対象外ページで、対象の本番Studioタブは確認できなかった。

本番Studioを新たに開くと既存自動再開を起動し得るため、開いていない。実Account DB・Cookie・資格・画像・Outboxを取得していない。現在のMacが旧Aデータで停止していると断定しない。新profile作成、Account再削除・再参加も行っていない。

## 既存保存構造と停止条件

| 項目 | 実装と意味 |
|---|---|
| 表示・編集データ | PortDatasetRepository経由の共通localStorage。Accountを切り替えてもこの正本自体が自動的に別datasetになる設計ではない |
| Account別Sync状態 | `sound-cruise-sync-data-port-account-*` のmeta/outbox/shadow/conflicts。Account資格と送信先の境界であり、旧ローカルデータを新Account所属と証明するものではない |
| 画像・添付 | 既存のGear/My Apps/Practice IndexedDBとlocalStorage参照・Asset metadata。通常のsnapshot backupにbinary本体は入らない |
| 自動再開 | Pro・online・表示中・安定したAccount generation・pending Account操作なし・Asset状態既知。初回完了証拠＋現在Accountのshadow/Outbox/conflictとのローカル整合＋正規Device結合が必要 |
| 初回完了証拠なし | #169では、既存の空端末確認と正規の現在Account Device/Port環境確認が成立する場合だけ既存初回同期へ進む |
| 残存ローカルデータ | 空端末証明に失敗する。Bのshadow等と不一致なら自動採用しない。削除intent・画像/添付pending・競合・失効・通信失敗でも停止し得る |
| 「この端末」 | 現在Deviceの正規ID照合を表す。Portのローカルデータ帰属・初回同期完了の証明ではない |

## 受信と送信の関係

`MultiAppSyncRuntime.initializeDataset` は次の順序。

1. ローカルsnapshotを読み、bootstrapへ件数・schemaVersion・manifestHashを送る（この要求自体はGear本文を送らない）。
2. サーバーsnapshotを受け取り、mergeSnapshotsする。
3. 同じrecord IDの不一致には既存の競合解決を要求する。
4. 競合がなければ既存backup/applyを実施し、queueDiff → flushOutbox → migration completeへ進む。

別IDの旧Aの機材等は、競合ダイアログなしで統合後のBへの送信対象になる。このため「競合があればクラウドを選ぶ」は受信専用操作の代わりにならない。既存backupはアプリ単位の直近5件のsnapshotで、Account別Outboxやbinary本体をまとめて保存・復元するarchiveではない。

**旧Aのactiveデータを保持し、そのデータをBへ送らず、同じ保存領域へBを受信・適用する既存経路は確認できない。** これを実現するには退避/復元・画像参照・Outboxを含むローカル切替の仕様が必要であり、確認文だけでは実装できない。今回、旧データの移動・削除、第二保存正本、受信専用Syncを新設しない。

## 製品E2Eの結果

使い捨てChrome・合成Account/Device・隔離Miniflare。実資格やProduction通信は使用しない。

- 製品E2E: 40/40 PASSを2回（うち1回は最終差分）。実Studio入口でBに参加し、同じprofileで再読み込みしてホームへ入場、Sync Centerの正規Deviceバッジを確認する追加ケースを含む。
- その追加ケースではAの機材、Account別Outbox、source/final画像binary、添付binary、Asset metadata、削除intentを保存前後で一致確認。B参加後・再訪問後・確認キャンセル後の `/v1/sync/*` 要求は0件。Bの受信も開始しないことを明示的に検証した。これを「旧Aを保持したB受信成功」とは判定しない。
- 空端末B初回受信、旧版空参加の自動開始、既存Account自動再開、Account変更、Device失効、Offline/429/503、正規Studio入口とProの正常/拒否系は既存製品E2EでPASS。
- 画像/添付/ACK喪失/二端末CAS/競合解決復旧E2E: 12/12 PASS。
- Port Node全体: 1234件、1230 PASS / 4 FAIL。残る4件は#169とmainにもあるテーマCSS期待値で、当該CSSは変更していない。skipなし。
- 関連Node（Controller/観測/バージョン/キャッシュ/Edition）: 78/78 PASS。確認文が「送信」「旧Accountも対象」「受信だけではない」と明示することも検証。
- Studio入口/Account Node: 35/35 PASS。製品Browser重点回帰: 15/15 PASS（5テーマ・4幅、中央/右ペイン、5ツール・4アプリ・NEWS）。
- Jekyll safe実ビルド: Studio34ファイルhash一致、開発URL除外、native配布811ファイルbyte一致。
- shared / Worker / 公開4アプリ製品tree、Studio公開34ファイルは#169と不変。

## 公開判断と現在のMacの最小操作

#169の正常系の自動開始・再開は合成受入済み。ただし#169を公開すれば現在のMacも必ず同期できる、という判定はできない。今回の明確な確認文を含めることを推奨する。新しい退避機構の開発を通常Accountの公開条件に加えるものではない。

公開には別途承認が必要。公開後、運営者が既存ブラウザのままStudioを一度再読み込みし、Account・Syncを開く。安全な同一Accountデータなら自動同期する。停止が残る場合は、受信専用のつもりで送信・統合確認を承認しない。

端末内の全データを現在のBへ送信・統合する意図が本人にある場合だけ、既存「同期を開始・再開」→明確な確認を1回承認する。そのまま既存Syncへ進み、開始ボタンの押し直しは不要。

旧AをBへ送らず残したい場合はキャンセルする。まず同じブラウザの対象Port frameの現在の停止code・Asset pending・B側shadow/Outboxとの一致を読み取り専用で確認する。この実機情報がないまま、削除や再参加、送信を勧めない。Macの停止原因確認と、実AccountでのB受信/双方向同期は未受入。
