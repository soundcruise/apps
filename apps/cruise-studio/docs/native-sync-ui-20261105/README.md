# Studio 0.83.0 — アイコン統一・native Sync中心の画面

基準main: `9fe4dcfcd66a73bbb5f2d360c642707eb51b6d85`（0.82.0）。Studioのみの表示変更。Worker/Port/shared/4アプリ、認証契約、Owner admission、保存schema、Syncエンジンに差分なし。

## 変更と根拠

既存ツールPNGは512pxの中央約250〜300pxに描画。前版のcalendar/Sync線画は76px枠の大部分を使うため視覚的に大きかった。新SVG2点は同じ512px枠・近い描画範囲を使い、銀色の面・輪郭ハイライト・暗いエッジと控えめな金色を重ねる。カレンダーには小さな音符、Syncは雲と循環矢印。Homeとsidebarは同じassetを使い、headerもSync assetを共有。ツールカード寸法・操作は不変。

Studio独自の上部Accountパネルと「同期状況を見る」「Accountの資格を再確認」等を撤去。Port iframeとnative UIには手を加えない。非表示のAccount監視mount、getAccount/generation/summary/subscribeAccount、起動・復帰・資格変更時の監視は維持。Device/接続/再確認/同期/追加コード/復旧/競合は従来どおりPortが所有する。

Project上部カードを廃し、Port surfaceの後に小さな「制作Projectのクラウド同期」を置く。常設のProject再確認ボタンを撤去。Account未接続・要確認・通信不明では操作なし、正常AccountでOwner未許可なら短い説明、Owner許可ありの場合だけ既存譜面Project操作への入口1つを表示。既存onAdmission/refresh/focus/online/Account subscriptionを利用し、新たな再確認機構は追加しない。譜面側の保存・取得・CAS・Outbox・復旧UIとその再確認ボタンは不変。

## 検証

- Chrome/WebKit各8群PASS（UX3＋既存UI5）、pageerror0。Pro単独入場、4幅、native追加コードdialogの実click/cancel、Account観測の未接続/正常/410要確認/503通信障害/offlineと回復、credential保持、Owner OFF拒否/限定canary許可、入口から既存譜面Projectへ遷移を確認。
- Account障害fixtureはStudioの既存summary観測の区別と保持を試験する。Port独自の全てのDevice障害状態を新たに網羅したものではない。native UIの維持はPort資産全体の無差分と、標準接続操作の製品試験を根拠とする。
- 4アプリ・5テーマ、11画面×4幅×2engineの88スクロール状態、末尾操作trial clickを限定回帰。Node60/60、skip0。A/B帰属保護・非同期応答・Pro/Session境界を再利用。
- 配布181ファイル（新SVG2点）とJekyll safe buildがhash一致。合成資格・隔離DBのみ使用。実Account/Project/Outbox操作なし。

既存 `project-cloud.browser.mjs` 環境で `STUDIO_FOOTER_SYNC_ONLY=1` が更新後のnative Sync中心UX、`STUDIO_DEVICE_UI_ONLY=1` が既存UI限定回帰。重複パネルの削除に合わせ、前版UX試験の操作先をnativeボタンへ変更し、Project sectionの順序・ボタン数・実遷移を追加検証。

## 比較画像

|画面|変更前|変更後|
|---|---|---|
|ツール1440|[before](before-tools-1440.png)|[after](after-tools-1440.png)|
|ツール390|[before](before-tools-390.png)|[after](after-tools-390.png)|
|Sync1440|[before](before-sync-1440.png)|[after](after-sync-1440.png)|
|Sync390|[before](before-sync-390.png)|[after](after-sync-390.png)|

同一の隔離Pro profile条件。実機PASSではない。Mac/iPhoneではアイコンの金属感・サイズ、既存Accountの正規追加コード接続と復旧、キーボード中のdialog、Owner対象での入口を確認する。実Accountでの操作は運営者受入時に判断。Draftから実機受入へ進行可能。main merge・Pages公開は未実施。
