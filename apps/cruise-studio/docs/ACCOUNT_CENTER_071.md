# Studio 0.71.0 — Account確認とPort同期状態の分離

基準main: `71916c19e73a813086a2f425688b5667186faa49`（Port 1.24.24 / Studio 1.0.3）。この候補以降のStudioバージョンは0.xx.xx系、今回は **0.71.0**。main/Pagesへは反映しない。変更はStudio配下のみ。Port/4アプリ/shared/Worker/D1/R2/保存schema/Sync契約は変更しない。

## 原因の確定範囲

1. **入口とSync Centerは別の状態を示す。** 入口は既存Pro Device SessionとAccount summary（ID一致）を検証する。一方、Port `renderSyncCenterView({activate:false})` は `syncCenterController.loadLocal()` を呼ぶ。新しいdocumentのcontrollerはキャッシュがなく、Accountが存在しても `kind:unknown / accountState:unknown` を返す。`renderSyncCenter()` はunknownを含む既定値を「確認が必要」と表示する。したがって「Account自体が無効」や「通信を3分待っている」とは限らない。
2. **初回は同期情報の通信を開始していない。** 既存の明示「同期を開始・最新状態を確認」は `ensureQaAdmission` と `portSyncController.ensure()` を先に実行し、その後Account summary/devices等を取得する。単にAccount番号を知るためにこの書込み可能な初期化を自動クリックする修正は採用しない。
3. **ホームの一瞬の表示。** Port HTMLはhome-viewが初期表示で、Pro gate→動的Controller初期化→requested hash復元→hashchange描画の順になる。旧Studioはiframeを最初から表示し、hashが合っているだけでready扱いできた。Controllerのreadyと要求viewの表示完了は同時ではなかった。
4. **PCの別Accountが見えるのは共有DBの再利用。** 両方とも同一originのIndexedDB `sound-cruise-sync-account` v1 / meta / accountを読む。パスやタブごとの別Accountではない。Pro番号は会員資格であり、スマホ側のAccountを指定する識別子ではない。別端末・別profileのDBは自動共有されない。Studioが新Accountを自動作成したわけではない。

**実機の約3分・スマホ約5分の正確な通信原因は未確定。** Production資格・ログ・通信traceを取得していない。固定180秒待機は見つからない。既存Account APIとAccount DBは各20秒の待機上限、入口Proリクエストは8秒、入口の定期確認は60秒、既存Sync runtimeの通信再試行は最大300秒のbackoffを持つ。これらの事実だけから実機の原因を断定しない。スマホでも発生したため、ネットワーク・共通Pro Session/API/429等も別途切り分け対象。今回その契約やtimeoutは変更しない。

## 最小修正

- 既存 `port-sync-status.mjs` に読取り専用の表示状態を集約。正本DBのgetAccountと既存AccountClient.summaryだけを使い、未接続/確認中/確認済み/通信失敗/offline/資格再確認を区別する。Account IDはPortと同じformatAccountDisplayIdで表示。
- 「Studio：Pro認証済み」と「Cruise Sync接続先」を別行にし、PCの既存Accountを使うこと、新規作成/移管は自動で行わないことを説明する。Account確認をデータ同期完了とは表示しない。
- Sync Centerを開く際と利用者の再確認操作で接続先を読取り確認。多重呼出しは同一flightを共有し、Account世代/応答ID/再読込後credential一致を照合する。古いA応答をBへ採用しない。429/503等は失敗表示し、無制限再試行・Account削除はしない。
- Studioのiframe内だけでunknownの「確認が必要」を「同期情報は未確認」、通信失敗はその旨、未接続は「未接続」、activeの「作成済み」は「Account接続済み」と表示する。**nativeのdataset属性・controller cache・操作ガード・Port欄の実attention/conflictは変更しない。** 接続先の確認とPortデータ同期状態を別に示す。
- iframeはController readyだけでなく実viewの表示までvisibilityを保留する。新規起動/実navigationで適用し、Global Stop等の合成pagehideでは隠さない。既存single-owner/未保存確認/音声停止を維持する。
- 入口のAccount DB read/Pro validation/Account summary/recheck/全体と、iframe ready・native初回表示の経過msをメモリ上で計測。`CruiseStudio.accountStatus.diagnostics()` は状態・時間・安全なerror codeだけを返す。Account ID、credential、API body/header、Pro番号は含まず、保存・送信・ログ出力もしない。

新しいAccount正本、資格、永続cache、Sync runtime、Outbox経路はない。既存AccountClientのtimeoutや権限検証も変更しない。Pro認証未成立では追加のAccount確認要求を行わない。

## 比較・測定（すべて合成、Productionではない）

同じPort 1.24.24・使い捨てChrome profile・合成Account Aで比較し、native Pro bootを250ms遅らせた。

| 観測 | 1.0.3 baseline | 0.71.0 |
|---|---|---|
| cold Sync CenterのAccount表示 | 「確認が必要」・unknown | 接続先IDを別枠で確認、native欄は「同期情報は未確認」 |
| cold native CenterのAccount取得 | 0件（通信待ちではない） | Studioの既存Account APIによる読取り確認 |
| Port Homeが見えたrAF | 18フレーム | 0フレーム |

最終測定値は `account-center-071/validation.json` に保存。例: 接続先確認7.2ms（DB3.7ms/API3.5ms）、iframe ready387.4ms（人工boot遅延250msを含む）、native初回状態91.5ms。実Pro暗号/APIを使う別のローカル製品E2Eでは入口合計22ms、Pro validation12.8ms、Account summary8.8ms。環境・同時試験負荷で変わるため、本番の性能保証や「3分問題の本番解消」とは扱わない。

Nodeでは仮想時計180,000msの応答待機を測定し、待ち時間を短縮/隠蔽しないことも確認した。Browserでは実350ms遅延、429/503、offline/online、Account世代変更を確認した。

## スマホの正しいAccountへの接続

1. スマホのPortとStudioの **SC-…のAccount番号** を比較する。Proの認証番号では比較しない。
2. 異なる場合、PCにあるAの未保存入力・画像・添付・pendingは保持する。Accountを新規作成して合わせようとしない。
3. 最も安全な既存手段は、PCの別ブラウザprofileから接続すること。AのoriginデータとOutboxをそのまま残し、空のprofileで正規Pro認証する。
4. スマホPortの「アカウントを同期」からCruise Portの追加コードを発行し、新profileの「既存のアカウントに接続」へ入力する。コードや資格をチャット/ログへ出さない。
5. 同じAccount番号を確認し、既存の初回Sync画面で受信内容を確認する。Account Bへの接続だけを理由にAのデータを採用・統合・上書きしない。

同じprofileは既存契約上1つのAccount DBと端末内Port datasetを共有する。Studio専用のAccount一覧/自動切替/データ移管は作らない。既存ローカルdatasetを別Accountへ移す一般的な採用・統合の安全性は、この表示修正では受け入れない。同じprofileでの切替が必要なら、未同期データを保全して既存Portの正規操作と採用条件を確認する。別profileへの正規参加は既存の端末追加契約であり、新Account作成や第二保存正本ではない。

## 試験・保護範囲

- Studio Node31 PASS（新状態/計測/既存入口/ライセンス）。Port関連Node49 PASS（controller/refresh/Account guard/互換ready/画像）。
- 製品ページBrowser14/14 PASS（新Account5ケース＋既存UI9）。5テーマ、1440/1024/768/390、状態遅延/失敗、再確認、フラッシュ0、Aフォーム/実IDB Outbox保持、Bへの送信なし、既存ツール・4アプリ・音声/更新/未保存保護を含む。
- 実際のnative Account/Pro cryptoとローカルDB/R2を使う既存製品E2E30/30 PASSを2回。最終のUI案内文だけの更新後にも上記Browser14件を再実行。native source/権限/同期操作は同一。Fixture単独だけの判定ではない。
- 初期の試験失敗はlocalhost fixtureのconnect-src selfによる合成API遮断、隠れたHomeカードのvisibility待ち、ボタン追加後の旧曖昧selectorを修正した。試験のCSP許可先はmockで必ず処理し、Production通信を許可しない。製品の権限sourceやtimeoutは緩めていない。
- Jekyll実ビルドはStudio34ファイル、native出力774ファイルが元のバイトと一致。新test/docは非配信。公開済みPort/4アプリ/shared/WorkerのGit tree不変。

実資格、実Account、実スマホでの双方向Sync、Safari/実mic、実際の遅延traceは未受入。公開main/Pagesへは反映せずDraftで保全する。正式告知前に、0.71.0の公開を別途承認してから運営者が同一Accountで限定受入し、必要なら秘密情報を含まないdiagnosticsだけを取得する。スマホの状態が同時に悪化する場合はStudio専用表示の問題と共通通信/Sessionの問題を分けて記録する。
