# Account参加・再訪問の安全な初回Sync — Port 1.25.2候補

基準main: `397d4492b9d0e37152a16f4ed328f58d7be6afe2`（Port 1.25.1 / Studio 0.71.3）。
独立branch: `codex/port-safe-first-resume-20261102`。
既存 #164 → #165 → #166 の累積公開 #167、および #168 を含むmainから開始。
Studio製品34ファイルは変更しない。main merge / Pages公開 / 実Account操作は未実施。

## 確認した原因

1. 既存自動再開はAccount別DBの初回同期完了証拠を必須とする。旧版の参加処理だけ完了し、初回Sync未完了だった空端末には、自動初期化する経路がなかった。
2. 受信済み機材の `order` は既存 `PortSyncAdapter.applyRemoteSnapshot` により `gear_order` の0始まり順位へ変換され、未指定の `manufacturer` は空文字になる。shadowの元payloadHashとの厳密比較だけでは、この正規受信の表現差を帰属不明として拒否した。実AdapterのNode試験と、製品再訪問E2Eで再現・修正確認した。
3. ユーザーの現在のMacのAccount DB、Outbox、画像・添付は調査・操作していない。上記のどちらが実機の停止原因かは未確定。Account ID・資格情報・個人データを取得していない。

## 最小修正と契約

- 既存の参加用空端末確認を関数として共用。ローカルrecord、削除intent、未同期binary、legacy/現在AccountのOutbox・conflictが残れば自動初期化しない。
- 起動・復帰時、上記確認が成立し、正規Account credentialで取得したDevice一覧が現在Device ID / Port環境 / 未失効を示す場合だけ、既存 `activate` → `provisionPortDevice` → `initializeDataset` を再利用する。Account DBの存在やPro表示だけでは許可しない。既知の失効資格は自動初期化しない。
- 初回同期済み端末の検証は維持。機材だけ、既存受信処理の順位・manufacturer正規化を適用した**比較用コピー**も照合する。名前・実際の順序・画像・削除を無視しない。shadowやローカル保存値は比較時に変更しない。
- 帰属不明の非空端末は自動送信しない。正規の「同期を開始・再開」から一度の明示確認へ進み、キャンセル時は全入力・Outboxを保持。承認時は同じ操作内で既存ensureを継続し、二度目の開始クリックは不要。確認前後のAccount generation変更は拒否。
- 名前変更・招待画面終了・端末一覧更新のrefreshは引き続き読み取り専用。runtimeが無い状態から起動させない。
- 既存runtimeの初期化は bootstrap、snapshot、merge、Outbox flush、migration complete の一連の処理であり、「受信専用」とは扱わない。旧Aデータを残してBのクラウドだけ受信する新経路は作らない。
- 新Worker、DB、保存キー、資格発行、Owner経路、Syncエンジン、API payload/schema変更なし。Account別の旧Outboxや画像を削除・移管しない。

## 試験（使い捨てChrome、合成Account/Device、隔離Miniflare）

- Port全Node: 1234件、1230 PASS / 4 FAIL / skip 0。
- 4 FAILは `theme.test.mjs` の既存CSS期待値。基準mainを一時ディレクトリへgit archiveして単独実行しても同じ4 FAIL（22 PASS / 4 FAIL）。CSSとテーマ製品コードは変更していない。
- Controller専用: 44/44 PASS。旧版空参加、現Device照合、失効拒否、Account変更中止、機材の正規受信表現、実編集拒否を含む。
- Studio入口・Account関連Node: 35/35 PASS。
- 製品E2E: 39/39 PASSを2回。旧版空端末再訪問、正式Studio入口、初回受信、非空参加・名前変更等の無送信、明示確認キャンセル/承認、A→B→A、現端末、通常自動再開、Device拒否、Offline/429/503、機材・画像・添付を含む。
- 画像/添付/ACK喪失/二端末CAS/競合UI復旧: 12/12 PASSを2回（うち1回は最終差分）。
- Studio製品Browser重点回帰: 15/15 PASS。5テーマ・1440/1024/768/390px、中央/右ペイン同一frame、Account状態、未保存保護、音声停止、5ツール/4アプリ/NEWSを含む。合成権限fixtureによるUI試験と、上記の正規認証APIを通る製品E2Eは区別する。
- Jekyll safe実ビルド: Studio34ファイルのhash一致、開発用URL除外、native配布811ファイルのbyte一致。
- shared / Worker / 公開4アプリ製品treeは基準mainと同一。Studio製品34ファイルも同一。Portの変更はController・既存アプリ接続・バージョン/キャッシュキーに限定。

## 実機受入（未実施、公開後に運営者が実施）

1. 現在のMac AccountとスマホのAccountが同じであることを、本人が画面で照合する。追加コードや資格を報告書へ記載しない。
2. 初回同期済み、または空端末と証明できる参加済み端末は、開くだけで「確認中…」→「同期中」→「同期済み」へ進むことを確認。
3. 帰属不明の旧データがある場合は自動開始しない。「同期を開始・再開」の確認内容を読んで、現在Accountとの同期を本人が意図する場合だけ承認する。旧Accountのデータならキャンセルする。
4. 旧AデータをBへ含めず、Bのクラウドを安全に確認したい場合は、Aのprofileをそのまま保護し、別の空ブラウザprofileから既存の参加コード手順でBへ参加する。
5. 同一Accountで合成の小さな機材1件を本人が作成し、双方向確認。画像・添付・CAS・Offlineはその後に運営者が確認する。本作業は実Accountへ送信していない。

実Pro、Mac/iPhone実機、Safari/PWA、Productionの通信・二端末受入は未検証。合成PASSを実機PASSとしない。候補公開には別途承認が必要。
