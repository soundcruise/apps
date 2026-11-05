# Studio 0.82.0 — フッター・接続UX

基準main: `468e9a5e004a26630ef72f70203511c7a0197087`（0.81.0）。単一の通常Studio sourceを変更。Worker、Port、shared、4アプリ、Account/Device/Pro/Owner契約、Syncエンジン、保存schemaは変更なし。

## 実装・原因

- 中央containerに共通footerを1つ追加。版表示は既存 `CruiseStudio.portPC.version`、更新は既存ヘッダーボタンのclickへ委譲し、未保存保護・Pro・iframeの更新guardを共有。結果文もfooterへ投影。footerの実高さを既存下部余白から差し引き、最終カードの読みやすい位置を維持。移動したworkspaceがfooterの後へappendされてもCSS orderで最後に表示。
- 情報dialogはChord info.htmlのYouTube/規約/privacy/mailtoの実URLを再利用。Appsリンクなし。Studio以外の文面・ページは変更なし。
- Sync SVGは画像の76px/64pxと一致。Portのhome-calendar-button SVGをそのまま再利用。カレンダーだけdata-workspaceを持たずgrid整列から漏れていたこと、従来iconのgrid-row span2が補足行非表示後も残っていたことを修正。gear-list画像のalpha bboxは512px中(108,76)-(404,436)で中心が一致しており、画像の加工・根拠のないoffsetは不要。
- Account観測は既存getAccount/getGeneration/summary/subscribeAccountを継続。接続UIはこの結果の表示だけ。Device/各アプリの同期・競合・開始操作はnative Port Sync Centerが正本。Account確認と同期完了を同一視しない。
- 未接続は追加コードの接続を主操作にし、native Portの既存接続ボタンへ委譲。native側が準備完了するまで主操作はdisabled。既存資格ありの復旧・接続済みの同期状況はnative Account領域へスクロール・フォーカスする。端末内情報や資格を自動変更しない。
- Account summaryの401/403/410は要再確認、503等は通信障害、offlineはオフライン、credentialなしだけを未接続と表示。診断errorCodeは維持し、主説明へraw codeを出さない。
- Project上部はAccount状態と既存onAdmissionによって操作表示を変える。未接続は操作なし、正常AccountでOwner未許可なら理由と通常Syncの継続を説明、Owner許可時だけ既存一覧への入口を表示。既存Session発行・サーバー認可は変更しない。通信失敗は保存情報保持と再試行を説明。
- Chromeで長いiframeの下に接続dialogが開き、キャンセルがviewport外になる実不具合も検出。Studioの既存native presentation adapterで、開く前にframeへスクロールし、Port接続dialogの位置とmax-heightを中央viewportへ合わせる。単独Port・右ペインの認証/接続処理は変更しない。

## 検証

合成Chrome/WebKit各8群PASS（追加UX3群＋既存UI5群）、pageerror0。4幅1440/1024/768/390、footer版表示・情報リンク4件・更新後の再入場、未接続からnative追加コードdialogへの移動と実キャンセル、Account正常、Owner OFF拒否と限定canary許可、503/410/offlineと復帰・credential不変。既存UI試験は4アプリ起動/設定/5テーマ、88スクロール状態と末尾ボタンtrial click。Node60/60、skip0（Account A/B帰属保護・stale応答・Pro入場・共有Session等も含む）。配布179ファイルとJekyll safe buildのhash一致。

実Account/ProjectやProductionには接続せず、既存隔離fixtureを使用。試験内AccountとOwner対象は合成値のみ。大規模Sync試験の全面再実行はしない。新試験は既存project-cloud.browser.mjsの環境で `STUDIO_FOOTER_SYNC_ONLY=1` を指定。既存UI限定回帰は `STUDIO_DEVICE_UI_ONLY=1`。

## 比較・実機受入

[Home変更前](before-home.png) / [変更後](after-home.png)、[Sync変更前](before-sync.png) / [変更後](after-sync.png)、[PC footer](footer-1440.png) / [390px footer](footer-390.png)、[接続dialog](connect-dialog-390.png)。すべて同じ合成Pro profile条件で撮影。

Mac/iPhone実機PASSではない。実機では保存済みのPro・Account状態をそのまま使い、Home→Syncの状態案内、接続済みPortで発行した追加コードの正規接続、既存Account番号、再確認と同期開始の区別、長い復旧画面/キーボード表示中のdialog、5テーマのfooter/情報表示を確認する。実データの切替・接続・同期は運営者の判断で行う。今回は自動作成・切替・移行・削除なし。

Draftで実機受入へ進める候補。main merge・Pages公開はしない。
