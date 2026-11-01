# Studio 0.71.1 — Account・Cruise Sync実機受入準備

基準は公開main `276bf5cd6dde6c4e68b0366633c82e0367c16b44`（PR #155、Studio 0.71.0）。独立branchで保全し、main反映・Pages公開・実資格利用は行わない。変更はStudio配下のみ。公開版は別途承認されるまで0.71.0のまま。

## 確認できた原因と、確認できていない原因

0.71.0の読み取り確認はStudioの追加枠だけを更新していた。Port本来のSync Centerは `renderSyncCenterView({activate:false})` → `syncCenterController.loadLocal()` で、新しいdocumentの空キャッシュを読み続ける。Accountが正しくてもnative表示は `unknown`、「同期情報は未確認」、Port欄は「確認が必要」のままになれる。この経路には、待てば必ず終わるネットワーク要求はない。0.71.0の公開ファイルを使った使い捨てChromeでも再現した。

**実機の3〜5分の通信原因は未確定。** Productionの通信・実資格を調べていない。スマホでも発生したことは共通Session/API/429等を切り分ける理由になるが、それだけで原因は断定しない。既存のAccount API/Account DBは20秒、入口Proは8秒、入口再確認は60秒、既存Sync backoffは最大300秒という別々の待機を持つ。今回これらを短縮・延長しない。

## 実装

- 既存 `AccountClient.summary()` と、表示中のSync Centerについて `devices()` を並列GETする。未接続時は要求せず、同一flightは共有。Account世代・応答Account・credentialの一致を再確認し、古いAの応答をBへ反映しない。Account DBを作り替えたり、set/clearで接続先を変えたりしない。
- 既存Portの `normalizeSyncCenterSummary()` と `renderSyncCenter()` をそのまま再利用し、**Studio内のnative Sync Center自身**にも実応答を表示する。別のSync Centerを実装しない。Account確認済みとデータ同期未開始を分ける。native操作のready/error、操作中・モーダル・旧Accountのinertフォームは上書きしない。cold/localのunknownだけを再投影し、自己描画の監視反復を防ぐ。
- 正しいsummaryによってnativeのactive/ready表示と正規操作の入口が使える。これは保存資格の発行ではない。作成・参加・復旧・解除・各アプリ追加などの処理とサーバー検証は既存Portが担当する。Proだけでwriter admissionを認めない。
- 既存 `createPortSyncReader()` でAccountに紐づくローカルmetadata/outbox件数を読む。このreaderにはensure/bootstrap/pull/push操作がない。readerの読取り完了をAccount APIの成功待ちへ結合しない。ローカル状態が未取得なら未取得と示し、credentialがあるだけで「同期済み」としない。nativeが実Sync結果を表示している場合はその結果を維持する。
- 429/503は通信失敗、offlineはoffline、明示的なDevice拒否は資格確認が必要、と表示し、再確認ボタンを使えるようにする。端末一覧だけの非terminal失敗はAccount成功と区別する。再試行ループや永続cacheは追加しない。
- 読み込みを「Cruise Syncを開いています」に変更。Controller readyと目的view表示までiframeを覆う既存処理を維持する。
- `CruiseStudio.accountStatus.diagnostics()` はAccount DB/API、入口Pro、Account summary、端末一覧、iframeの所要時間・安全な状態/codeだけを返す。未完了のAPI時間はnull。ID、資格、API body/header、追加コードを含まず、保存・送信しない。

既存 `#port-sync-activate` の「同期を開始・最新状態を確認」は読取り専用ではない。`ensureQaAdmission()` → `portSyncController.ensure()` → Port Device準備・初回dataset同期またはruntime.syncに進み、その後summary/devicesを取得する。自動クリックはしない。開始ボタンの近くにも「初回同期・データ送受信へ進む」旨を表示する。Account切替、bootstrap、pull、push、Outbox送信、adoptionは今回の自動確認に含めない。

## 検証

全てlocalhost/使い捨てprofile/合成Account・Device・DB/R2。製品の公開34ファイルを使った試験であり、別画面だけのfixture判定ではない。

| 試験 | 結果 |
|---|---|
| Studio Node（状態観測・入口・ライセンス） | 33 PASS |
| 既存Port Node（Sync Center controller/UI・readonly reader/owner） | 74 PASS、製品コード無変更 |
| 製品Browser（Account 8＋既存UI 9） | 17/17 PASS |
| native Account/Pro暗号・既存Syncを使用する製品E2E | 30/30 PASS、最終公開ファイルで実行 |
| 既存Release 1.0復旧E2E | 12/12 PASS × 2 |
| 実Jekyll safe build | Studio34ファイル一致、native出力774ファイルがsourceとbyte一致 |

Account未接続、確認成功、450ms遅延、429/503、offline/復帰、端末一覧のみの503、Device拒否、遅れたA応答とB切替、旧Aフォーム・画像・添付・実IDB Outbox保持、Bへの無断移管なしを含む。自動確認中の通信はsummary/devicesのGETのみと検証。単一flightに加え、native setAccountが書込み前後に世代通知することも考慮し、世代変更後の新確認を無制限再試行と混同しない。

5テーマ×1440/1024/768/390pxを撮影。中央/右ペイン、5ツール、4アプリ、NEWS、Global Stop/音声・未保存保護、Port保存テーマ不変、再表示・再読込を回帰。Homeの可視フラッシュ0。Project/Pre-DTM/APIは404・未起動・保存非干渉を維持。

復旧E2Eの初回は11件後、競合解決に伴うnativeのcache-bust再読込が旧runtimeを破棄した際のAbortをfixtureが認識せず停止した。既存待機枠内で `performance.timeOrigin` が実際に変わったことを確認する場合だけ、そのAbortから再読込後の既存操作へ引き継ぐ。live documentのAbortはPASSにしない。timeout延長・製品runtime変更・競合期待値緩和はない。新Account試験のfixtureも、正規APIのok応答形式・実際の要求開始・世代通知順序を正した。

実マイク、Safari、実Account/Pro、実スマホ↔PC、Productionの遅延は未受入。既存UNKNOWN/冪等再送/明示競合解決契約を変更していない。新Worker/DB/DO/鍵/保存経路/Account管理/認証方式は追加していない。

画面比較・hash・計測結果は `account-center-0711/validation.json`。ID表示をマスクした比較画像も同フォルダーに保全。

## 朝の最小実機受入手順

1. **この候補は未公開。** まず差分と試験結果を確認し、別途0.71.1のmain反映・Pages公開を承認する。公開後に表示versionとAccount画面を確認する。合成プレビューには実Account・Pro・追加コードを入力しない。
2. いまPCで使うAccount Aのprofileをそのまま残す。未保存フォーム・画像・添付、未同期データやOutboxを削除しない。ブラウザのデータ消去や新Account作成で合わせない。
3. **空の別Chrome profile**で公開Studioを開き、運営者自身が正規Pro認証する。「Accountを接続」から既存Portの接続画面へ進む。
4. スマホPortの「アカウントを同期」でCruise Portの追加コードを発行し、新しいPC profileの「既存のアカウントに接続」に運営者が入力する。復旧コード更新・新規作成は選ばない。コード/資格/Account番号をチャット・ログへ出さない。
5. 両端末のAccount番号が同じことを画面上で比較する。Studioは開くだけでAccount・端末を読取り確認する。「Account確認済み／データ同期は未開始」は正常に区別された状態で、データ一致の証明ではない。
6. 同じAccount・空のPC環境であることを確認して、運営者が「同期を開始・最新状態を確認」を押し、既存Portの初回受信内容を確認する。既存PC AのデータをBへ自動採用しない。
7. まず小さな受入用練習メニューをPCで1件作成し、スマホで確認、スマホでメモを1回変更しPCで確認する。既存データは変更・削除しない。その後、画像/添付、競合、offline復帰、Safari/マイクを別の限定操作で受け入れる。

遅延が再発したら、version、発生時刻、Account確認中/通信失敗/停止中の表示、上記diagnosticsの状態・code・所要時間だけを確認する。DevToolsの資格を含むNetwork/HAR/API本文は共有しない。スマホ側でも同時に失敗したかを記録する。Account不一致、予期しない採用/上書き要求、未保存内容の消失、復帰後の旧Account表示があれば開始/再試行を止め、両profileのデータを保持する。

公開0.71.0がそのままなら、この0.71.1の自動表示改善を実機PASSとしない。実Accountによる同一Account双方向Syncと遅延の原因確認は、運営者が公開候補を受け入れる次工程で実施する。
