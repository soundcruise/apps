# Port / Studio 単一公開候補

基準origin/main: `aba0a6b25a7b86732be510fd74faa2a56047c4ae`。独立branch `codex/studio-port-unified-rc-20261105`。

## 統合内容

- #205 head `d37e38296ed83784a922e8a462d3e6f56967e869` / tree `d834a522afdb6046cce5b9d0af22127e716f42a3` を正本として再利用。Port1.27.0 / Studio0.84.0を維持。Portの製品ソースは#205とbyte単位で同一。
- #204 head `263005061a2ecea4b1a145359f7865858b17fbe3` からHomeコピー、右20px、明示実行だけの安全な読取り診断を意味的に統合。古い0.83.1版・cache変更は重ねない。Studioのcache/module参照は0.84.0、Port変更moduleは1.27.0へ統一。
- 配布の#205からの追加差分はStudio index.html / shell.css / js/port-sync-status.mjsの3ファイルだけ。診断はnative storage未起動を「資格なし」と誤表示しないよう、既存の不明状態(null)へ返す。新しい管理画面や接続操作は追加しない。
- #204/#205 headは変更していない。旧PRは独立Draftのまま、今回の新規Draftだけを最終公開候補とする。

## 完成仕様・保存保護

native Port Sync CenterがAccount管理の正本。削除中・削除済みの資格が残っていても、2つの主操作から新規作成または既存Account接続を開始・完了できる。削除猶予7日と無関係に利用可能。無効資格は削除済みと断定せず区別する。

利用者確認後に既存APIで状態を再検証し、changeAccountIfCurrentのCASを通った場合だけaccountキーを解除。キャンセル・通信障害・A/B変更中は解除しない。Port runtimeは既存retainTerminalIdentity設定で停止・保持し、旧Outboxを消さない。新Accountへ旧rawデータを自動送信せず、既存の帰属・送信確認を維持する。Studioの所有者holdも緩めず、明示再スタート時のSync専用iframeだけを認証更新後に再生成する。

## 統合受入

- Chrome12/12・WebKit12/12：単独Port/Studio × deleting/deleted/invalid × create/connect。実作成・追加コードconsume、キャンセル時資格保持、旧scope Outbox UNKNOWNマーカー・raw機材データ・Studio Project bytes保持、新Account Port資格なし=自動同期開始なし、操作可能なSync iframeを確認。
- UI/診断/通常接続/通信復帰/Owner境界はChrome3/3・WebKit3/3。Pro単独Home、Homeコピー、右20px/46px、4幅1440/1024/768/390のHome/チューナー・ツール開閉、診断の未接続/正常・資格保持、503/410/offline復帰、Owner未許可拒否/限定許可と既存Project入口を確認。
- Node210/210、skip0：CAS拒否・遅いA応答・B帰属保護・通信/資格区別・安全診断の秘密非出力・Pro/Session・cache契約。Account切替中のCAS拒否はこのNode境界試験を再利用し、同じ競合を製品UIで新規注入する試験は追加していない。
- 固定候補#205のHOLD解除済み調査は再実行しない。今回の統合試験は全てPASS、捕捉pageerror0。
- 配布181ファイルとJekyll safe buildがhash一致。commit後のclean sourceからも同じ成果を再生成して照合する。

試験は既存project-cloud.browser.mjsの隔離runtime・既存Worker fixture・隔離DB・合成資格を使用。`STUDIO_DELETED_RESTART_ONLY=1` と `STUDIO_FOOTER_SYNC_ONLY=1` を各engineで実行。実Account/Project/Outbox、Productionには接続・書込みしていない。既存Worker削除ライフサイクル29/29は変更がないため#205の結果を再利用する。

[Home1440](home-1440.png) / [Home390](home-390.png) / [Studio再スタート](restart-studio.png)

## 公開判断・実Safari受入

統合候補としてmain統合・Pages公開へ進行可能。ただしこの作業では実施しない。実機PASSや正式リリース宣言ではない。Production Worker/D1/R2、認証契約、Owner admission、schema、shared engine、4アプリに変更なし。

公開後はSafariで更新し、ProだけでHomeへ入場→Cruise Sync→削除済み/処理中の案内と2操作を確認する。最初は確認dialogをキャンセルし、旧資格とローカルデータが保持されることを確認する。資格解除・新規作成・追加コード発行/使用は個別承認後に限る。承認後、Chromeで使う既存Accountへ正規追加コードで接続するか新規作成を選び、Account接続完了とデータ同期開始を区別する。旧データを新Accountへ送信する確認は別途判断し、初期化・移行しない。Project Cloudの運営者限定許可も別に確認する。

診断は任意の `CruiseStudio.accountStatus.inspectConnection()`。通常利用の必須操作ではない。status/code/段階/存在booleanのみを返し、Account ID・資格・token・コード・本文を出さない。保存済みOwner Sessionの有無は現行の書込み認可を意味しない。
