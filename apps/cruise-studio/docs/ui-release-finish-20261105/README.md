# Studio UI release finish — canary 0.79.0

## 基準・再生成

main `b9a26bba559ce41ed8d2d00a1449c60307e82807` の公開canary 0.78.0を基準とした。#195固定head `d14a3145b4261a0c16eb5ef2abd8bd36fee93ec5` に、mainの `header-sync-20261105/source.patch` を適用した生成物90ファイルと公開版はSHA-256完全一致。

今回の `source.patch` は同じ#195固定headに適用する累積Studio source/test差分。新しい隔離checkoutで `git apply --unidiff-zero source.patch` を実行し、既存 `node apps/cruise-studio/scripts/package-project-canary.mjs --out <empty-directory>` で生成する。生成canary90ファイルはこのbranchの配布物と全hash一致。通常Studioの旧sourceへCloud開発sourceを上書きしない。通常配布81ファイルはmainからbyte不変。4アプリのsource/test変更は本PRの各アプリ配下に直接保存している。製品試験ではそれらもcanonical checkoutへ反映する。

## 変更

- ヘッダーのeyebrowを独立したgrid行へ置き、クラウドボタンをh1の行の垂直中央に揃えた。既存navigationとタイトルサイズを維持。
- Studioの未設定時の既定値をMidnightにした。保存済みの明示選択、設定キーと形式は維持し、初期読込みで保存しない。
- Pitch 2.32.0 / Fretboard 2.27.0 / Rhythm 1.23.0 / Chord 1.23.0にMidnightを追加。既存色レイヤーとテーマ欄を利用し、5択を狭い画面で折り返す。3アプリのSync adapterは既存theme値の許可集合へmidnightを追加しただけで、同期アルゴリズム・record/schema/version・権限は変更しない。Chordは既存settings検証を利用。キャッシュキーも更新。
- 中央iframeの自然な内容高さとoverflow分をResizeObserver/MutationObserverで計測する。固定高さが作る二重スクロールを解消し、右ペインへ移すと元の高さ管理に戻す。音感の主画面overlayだけを中央表示時の通常レイアウトへ参加させる。別のモーダル、意図的な内部リスト、横方向の譜面スクロールは保持。
- entryAuthはnative Pro確認とローカル入場を担当する。Account確認をHome入場の条件にしない。Account snapshotとgenerationの競合フェンスは保持し、null ownerのframeもAccount切替時に保護する。Cloud側のshared Account資格・Device・Pro・Owner Session検証は独立の既存経路のまま。
- 検証中にPro revision/generationが変わった古い応答はsession-changedとして扱い、古いterminal応答で新資格を拒否しない。既存再確認のidentityにAccount generationも含める。現資格の失効は従来の拒否hookへ渡す。
- Studio media停止アダプターはnative Portの停止後に、利用したAudioContextも閉じる。Port単独のsuspend動作は変えない。

## 検証

- Node: entry/default theme/Account観測/4アプリテーマ/3 Sync adapterの対象116項目 PASS。
- 合成製品E2E: Chrome 34/34、WebKit 34/34。最終状態で各2回実行し、全runエラー0。`results.json` に保全。
- Proのみの初回Home、Accountなしの譜面・Pre-DTM・Metronome・4アプリ表示、Owner Session不成立とProject API要求なしを確認。Account接続後の既存保存・競合・復旧、別Account・Device・Pro失効のCloud拒否も既存製品fixtureで確認。
- 5テーマ、1440/1024/768/390px、明示テーマ維持。単独4アプリの390px設定UIでMidnightを選択し、決定操作とreload後の保持を確認。
- 中央11画面のroot overflow、最下部の表示中ボタンへのtrial click、inner scrollY=0を検証。チューナー入力設定・メトロノームdetailsの動的高さ、カレンダー、右ペイン、Modal、未保存draftと更新保護を含む。計測値を `center-scroll-*.json` に保存。
- 仮想AudioContext由来のマイクトラックとMetronome Contextが離脱時にended/closedとなることを確認。実マイクや実スピーカーの聴感PASSではない。

途中の試験では閉じたdetails内やoverlay背後のボタンを対象として失敗したため、表示中の画面とhit testに沿った対象選択へ修正した。初期の高さ計測不足と古いPro応答の分類も修正し、最終製品E2Eを通した。期待値skipやエラー監視の無効化は行っていない。

## 実機と公開

canary限定公開候補として合成受入PASS。main merge・Pages公開・Worker/DB/R2変更は行わない。実Account・Projectは操作していない。

正式リリース前には実iPhone Safariのキーボード・アドレスバー伸縮・safe-area、長い実保存一覧/大きなモーダル、実マイク精度と音声割り込みを確認する。全画面の全詳細・一覧パターンを実機PASSとはしていない。比較画像は合成ブラウザのMidnight表示で、アプリ画像に合成環境の音源準備表示が残る場合がある。
