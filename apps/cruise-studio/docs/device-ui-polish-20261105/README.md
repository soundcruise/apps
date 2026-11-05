# Studio UI実機改善・第1回

基準main: `2d18b4f70239319157463cf52040e1edd9bed265`（公開0.80.0）。独立branch `codex/studio-device-ui-polish-20261105`。新しいHome導線を含むためStudio候補0.81.0、指板の表示復元修正は2.27.1。他アプリの版は維持。

## 7項目の変更

1. ヘッダー・左メニュー・Homeカードで同じcloud＋sync SVGを利用。細線と既存テーマのゴールドを使用。
2. HomeのProject保存説明行とSyncボタンを撤去し、既存ツール一覧末尾へCruise Syncカードを追加。既存workspace/navigationを利用。非表示Account監視mountとProject hostの初期化・状態監視は維持。
3. アプリ起動時にSyncの再確認・復旧要求が既存attention guideを通して設定画面を自動表示していた。Studio adapterで自動表示を抑え、明示的な確認は同じnative guideへ委譲。資格・接続・review・競合・保存条件は変更しない。指板は保存された`course:settings`も起動時に復元していたため、Studio内だけメモリ上の表示先をHomeにする。保存済みcourse・設定・練習データは書き換えず、単独版の復元は維持する。
4. 中央scroller外側の余白を可視高さの42%基準（180〜480px＋safe-area）にする。カード自体の大きさは変更しない。
5. 同じ外側余白をツール・アプリへ適用。iframe内への余白追加やoverflowの一律無効化はしない。既存の高さ追従・右ペイン・内部リストを維持。Pitch/Chordの固定設定画面がChromeのiframe外へはみ出すケースも確認したため、この2画面だけ中央表示時は通常flowへ参加させた。右ペイン・単独版は維持。
6. MidnightをCharcoalへ投影していたうえ、native bootstrapが`data-midnight=false`へ戻す経路があった。初期の空iframeへ監視が付いたまま実文書へ移らないraceもあった。dark基底＋Midnight属性へ揃え、監視対象を実文書へ付け替える。Pitch開始画面のbackdropもStudio色を使う。DOM/CSS投影のみで、アプリの明示テーマ保存値は変更しない。変更module/CSSには候補版のcache queryを付ける。
7. PCのsidebarを216px以上にし、文字を折り返さず表示。既存resize・モバイルnavigationを維持。「音楽カレンダー」下の補足spanを削除。

## 検証と範囲

- `device-ui-polish.acceptance.mjs`: 通常の生成済み製品入口・native Pro/Account fixtureを使用。Chrome/WebKitで4幅（1440/1024/768/390）×4アプリの開始画面（Homeカード／1024pxの左メニュー）・明示設定表示と末尾ボタンへのtrial click・5テーマ投影、Home終端位置、PCメニュー1行表示を確認。
- 中央11画面×4幅×2engineの88状態で、実際に最下部へスクロールし、最後の操作ボタンの位置を計測・trial click。iframe自身の縦scrollが0で、rootがviewport内に収まることも確認。詳しい設定を展開する既存caseを再利用。
- Node 60/60、skip0。自動attention抑制と明示review、指板の保存済みtempo・courseの非破壊復元、iframe文書置換後の遅いtheme bootstrapを回帰試験に追加。
- 既存製品回帰は両engine各35/35 PASS。Sync・schema2・CAS/ACK・未保存保護・音声離脱・右ペイン等を確認。その後の最終theme監視・cache調整は上の限定製品試験で確認。詳細はresults.json。
- 最終配布179ファイルは実Jekyll safe buildとhash一致。Worker、shared、Port、旧canary資産に差分なし。Account/Pro/Owner、Project transport・Session・client、保存schemaは変更しない。

既存のruntime・隔離schema fixtureなどは#199の手順を再利用する。限定UIだけ実行する場合は同じ環境変数に`STUDIO_DEVICE_UI_ONLY=1`を追加して `node apps/cruise-studio/tests/project-cloud.browser.mjs` を実行する。`STUDIO_UI_BROWSER=chromium` または`webkit`、生成済み成果を`STUDIO_RELEASE_ARTIFACT`へ指定する。全通信は隔離fixture内で完結し、実Account/Projectは使用しない。

## 比較画像

添付画像の参照データはこの依頼にはなかったため、固定main0.80.0から合成profileで比較画像を生成した。`before-*` と `after-*` は同じviewport条件。Home上下と4アプリを1440/390pxで保存。

|画面|変更前|変更後|
|---|---|---|
|Home|[before](before-home-1440.png)|[after](after-home-1440.png)|
|Home終端|[before](before-home-bottom-1440.png)|[after](after-home-bottom-1440.png)|
|音感|[before](before-pitch-1440.png)|[after](after-pitch-1440.png)|
|指板|[before](before-fretboard-1440.png)|[after](after-fretboard-1440.png)|
|リズム|[before](before-rhythm-1440.png)|[after](after-rhythm-1440.png)|
|コード|[before](before-chord-1440.png)|[after](after-chord-1440.png)|

## 実機受入と公開判断

合成試験と実機PASSは区別する。MacではHome/左メニューから4アプリを開き、通常開始画面→明示設定→Home→再度起動を確認。Midnightと他テーマ、Home最終行、各ツールの最後の操作、sidebarの文字を確認する。既存保存済み設定・練習データをそのまま使い、初期化しない。

iPhoneではブラウザバー・safe-area・キーボード表示中の余白とnativeの長い設定一覧/モーダル、実マイク・音声停止を確認する。今回の比較はPlaywrightのChrome/WebKitであり、実iPhoneの受入ではない。

Draft候補として実機受入へ進行可能。今回main merge・Pages公開は行わない。ユーザーがこのチャットで確認した後の公開工程とする。
