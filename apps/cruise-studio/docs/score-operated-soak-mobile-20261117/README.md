# 最終版の操作を交えた30分確認とスマホ検証の準備

2026-11-17。基準3247c5e6、codex/score-toolbar-ui、使用モデルSol。Studio local 0.160.2-dev.1／Viewer0.16.0-dev.1。製品コードに新規変更なし。追加は検証用スクリプトと記録のみで、アプリの候補版番号は維持する。

## 最終版の長時間確認

前回の停止対策を含む最終版を、新規Chrome contextで両画面同時に実行。実AudioContext・同梱音源・実発音予約を使い、最後のGainだけ無音にした。物理スピーカーでの聴感確認ではない。

1分ごとに両画面で停止／一時停止と再開を行う。200ms後の再開と1.2秒後の再開を交互に実行。3分ごとに再生中の練習BPMを100／120／160間で変更し、5分ごとに1小節／2小節の選択範囲を切り替えて反復を有効にする。Viewerは開始時に12小節の全曲反復も実行する。

- 棒の数・表示、未終了source数、発音総数、出力時計との拍位相差を1秒間隔で採取。
- 意図した停止／再開の操作中と再開直後800msは、計測の対象から除外。予期しない棒の欠落は別カウンタで検出する。
- 各画面の元Project全体／原本hashが最初と同じことを最後に照合。
- 最後はEditorの通常停止後の自動close、Viewerの一時停止と画面離脱によるcloseを確認。終了前に全停止を使って不具合を隠さない。
- source計測はendedとdisconnectを冪等に集計。閉じたcontextの確認用参照をプローブが保持するため、JS heap増減を製品のメモリリーク判定には使わない。

**最終結果：1,809.259秒（30分超）・30ラウンド・両画面で計60セットの操作に成功。**

| 項目 | 譜面クルーズ | ビューワー |
|---|---:|---:|
| 有効計測サンプル | 1,762 | 1,761 |
| 発音予約数 | 48,177 | 46,474 |
| 接続中sourceの最大数 | 47 | 15 |
| 予期しない棒の欠落 | 0 | 0 |
| 拍位相差の絶対95％点 | 16.00ms | 16.10ms |
| 同・最大 | 19.21ms未満 | 19.11ms未満 |

元のProject全体／原本hashの一致、全contextの終了を確認。Editorは操作中にcontextを29個作成したが、最終停止前にrunningなのは最新の1個のみで、最後の通常停止後に全て閉じた。Viewerは1個を再利用し、最後の一時停止・画面離脱で閉じた。計測値はブラウザ内の出力時計に対する拍位相であり、物理出音の遅延ではない。

追加の製品不具合は再現しなかった。操作を交えた30分1件、隔離コピーのNode2件・Chrome／WebKit2件の計5件成功。前回の2,352件を今回再実行したという意味ではない。詳細は `measurements.json`、`operations.json`、各log。生データは一時ファイル `/private/tmp/score-playback-operated-soak.json`。

## スマホ用の隔離コピー

`build-mobile-viewer-fixture.mjs` は元の静的asset-listを全bytes／SHA-256照合してから一時ディレクトリにコピー。コピーのboot／workerだけに指定したプライベートHTTPS originを設定し、コピーのasset-listを再計算する。元のboot、SW、manifest、Portは変更しない。

`serve-mobile-viewer-fixture.py` は明示したプライベートIPだけにbindし、列挙した静的素材だけを配信する。Host検査、ディレクトリ外参照の拒否、実Account・Sync APIなし。模擬Syncの起動処理・ボタンもコピー側では除去する。秘密鍵、作業フォルダ、fixture-config、.git、本番HTMLを配信しない。

Mac内だけの https://127.0.0.1:18875/ で自己署名証明書を使用して検証。自動ブラウザの一時contextに証明書例外を設定したものであり、OSの証明書信頼設定は変更していない。実機がそのまま信頼できる証明書という意味ではない。

- 新規Node2件成功：接続先／出力先制限、コピーのorigin制限と全静的hash、元SW不変、危険なパスを含めないこと。
- Chrome／自動WebKit2件成功：HTTPS起動、縦横UI、ライブラリ保存／復元、API等の404・異なるHostの403、オフライン準備、SW制御。
- Chromeは通信を切ってページを再読み込みし、保存済み原本hashの一致を確認。WebKitの実ネットワーク断・cold restartとスマホ実機は今回未確認。
- 新規試験の初期失敗は、非同期のオフライン準備を待たずにreloadした試験側の誤りだった。画面上の準備完了とSW制御を待つ方法へ修正し、両エンジンで成功した。

## 実機の接続と確認

利用者はiPhone／iPad・USBを希望したが、端末のインターネット共有がグレーアウトしており、同じWi-Fiを使用。MacのWi-Fi側IPに限定した静的HTTPSコピー（18875）と、公開検証用証明書・合成譜面・合成PDFだけのダウンロードページ（18876）を使用した。実Account・Syncへは接続しない。証明書は7日間の一時CA。利用者が端末側へ手動導入し、HTTPS到達後、iPhoneミラーリングを解除した。Macや端末の信頼設定を自動変更していない。

### iPhone縦画面で実際に確認したこと

- 合成譜面 `スマホ確認用 — 海辺の散歩` をSafariのファイル選択から読み込み、日本語・コード・フォーム・歌詞を表示。
- この端末に保存し、成功通知、ライブラリの未分類に1曲、ライブラリから開き直せることを確認。
- フォームをタップすると閲覧専用の拡大カードが開き、編集ボタンなし。外側タップ・閉じるで終了。
- カウントイン後の再生、ゴールドの小節ハイライト・棒、下のセクションへの自動スクロール、一時停止を確認。これは視覚操作確認で、iPhoneの出音と棒の聴感比較ではない。
- 全画面モードの出入りを確認。ネイティブ横回転は行っていない。
- オフライン準備完了を確認後、Mac側18875のHTTPSサーバーを実際に停止。接続拒否（socket結果61）を照合した状態でSafariを再読み込みし、保存済み譜面を表示。再生・棒・スクロール・一時停止が動くことも確認。直後に同じIP／ポートへサーバーを復旧した。Wi-Fi自体を切った試験やSafari強制終了後のcold起動とは区別する。

### 実機で発見した修正

BPM入力欄へフォーカスするとSafariが紙面を拡大し、下部バーの左端が欠けた。小画面用CSSで数値入力が12px、音モードが11pxだったため、共通のタッチ操作用CSSで入力・選択を16pxにし、バー内の幅を調整。ピンチ拡大を禁止せず対応した。修正版を隔離コピーへ反映し、実機でフォーカス時に勝手に拡大されなくなったことを確認した。

Studio local **0.160.3-dev.1**／Viewer **0.16.1-dev.1**。正式Studio0.88.1、原本形式、DB、音エンジン、元SW／manifestは維持。元の30分試験は0.160.2で実施し、その後の変更はタッチ用CSSとローカル版情報・静的索引のみ。CSS修正後に30分を再実施したとは主張しない。

修正後の検証：

- Node6件成功（共通UI4＋隔離コピー2）。
- Chrome／WebKitのタッチ操作2件成功。両画面・幅320／390／430／844で下部バー1行、入力文字16px以上、BPM120入力、Viewerのタッチでファイル選択を開くことを確認。
- 共通UI／表示試聴のブラウザ回帰24件成功（親を含むNode集計）。
- 更新したWi-Fi HTTPSコピーのChrome／WebKit2件成功。静的ハッシュ、保存／復元、SW制御、Chromeの通信断reloadも再確認。
- `git diff --check` 成功。前回の全Node2,352件を今回再実行したという意味ではない。

### 確認の限界・保留

利用者の指定により**今回は実機縦向きまで**。横向きは自動Chrome／WebKitの縦横ビューポート試験のみ。iPad実機、物理的な画面消灯防止、実音の聴感同期、Safari強制終了後のオフライン起動は未確認。

PDFはテスト用demo.pdfを端末へダウンロードし、Safari標準プレビューの3ページを確認したが、Viewer内へのPDF読み込み・保存・送りの実機確認は未完了。ミラーリング経由ではBPMの文字入力が最後の1文字になることと、メニューのファイル項目タップが背後のフォームへ抜ける挙動を観察。製品側の確定した不具合とはせず、実タッチでの切り分けを保留する。自動WebKit／Chromeのタッチによる同操作は成功している。入力不正時は元のBPM100へ戻り、譜面の音楽データは変更していない。

ミラーリングは終了し、再生は一時停止の状態で端末を返した。[接続方法・確認計画](MOBILE_CHECK_PLAN.md)。

### 検証環境の終了時

既存18874は維持。18875（HTTPSコピー）と18876（検証ファイル）は端末で続けて確認できるよう起動したまま。外部公開トンネルなし。公開素材以外、秘密鍵、リポジトリ全体は配信しない。18876には後から操作しやすい検証用index.htmlを追加した（一時ディレクトリのみ）。

確認を終えたら一時サーバーを停止し、iPhoneの「設定 → 一般 → VPNとデバイス管理」から **Cruise Viewer LOCAL TEST 20261117** の検証用プロファイルを削除する。端末の証明書設定の操作は利用者が行う。証明書は11月24日19:10 JSTで期限終了。検証用保存データは本番originと別の端末内データである。

本番配信・公開HTML・実Account・認証／Sync設定・Workers・他アプリ・apps/sharedは不変更。ステージング・コミット・pushなし。

## 追加：横向き実機を保留し、PDF操作を先行確認

2026-11-17。利用者の「私だけで横向き実機を確認できないなら、他の項目を先行」の指示を受け、横向き実機は保留を維持。この環境でSafariを任意の横向きへ切り替える手順は確立していない。AssistiveTouch等の端末設定は変更せず、追加の端末操作も依頼していない。

`viewer-pdf-touch-flow.browser.cjs` を追加し、390×844・touch/mobile contextのChrome／WebKitで、強制的にメニューを開く処理やAPIからの直接読み込みを使わず、メニューのタップとファイル選択から確認した。

- 3ページPDFの読み込み、端末ライブラリへの保存、再読み込みによる復元。
- メニューから110%ズーム、保存後にも倍率を維持。
- 送り設定を開いたままの自動送りと速度変更。自動スクロールOFFでも時計は進み、紙面位置は停止する。
- 設定内の一時停止と設定保存。再読み込み後に勝手に再生しない。
- PDF再書き出しは元PDFとバイト単位で一致。端末内保存後も原本SHA-256一致。
- 上下バーの横溢れ・二段化なし、JavaScriptエラー・外部送信なし。

既存のモバイル回帰も再実行し、Portからの入口・縦横小画面、キャッシュ破損の検出／修復、Wake Lockの取得／解放・失効／再試行・拒否／非対応の表示を確認。**計12件成功（親テストを含むNode集計）**。ログは `pdf-touch-mobile-browser.log`。新テスト作成時の初期失敗は、ズーム後にもメニューが開いているという試験側の想定と、非表示の別readerの同名ボタンを含むセレクターが原因。実際のメニュー開閉と表示中のボタンを使うよう修正した。製品の追加不具合は再現せず、製品コード・版番号の追加変更はない。

これは自動ブラウザの確認であり、実機PDF操作・物理的な画面消灯防止の確認済みとはしない。先行する実機ミラーリングでの入力／メニュータップの不安定さも、実タッチでの未切り分けとして残す。本番・実Account・認証／Sync変更なし、コミット・pushなし。

## コミット対象ファイル（30件）

利用者承認により、以下をローカルコミットする。pushは保留。

- `apps/cruise-studio/ai-handoff/PROJECT_STATE.md`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/MOBILE_CHECK_PLAN.md`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/README.md`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/measurements.json`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/mobile-fixture-browser.log`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/mobile-fixture-current-browser.log`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/mobile-fixture-node.log`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/mobile-node-final.log`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/operated-30min.log`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/operations.json`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/pdf-touch-mobile-browser.log`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/shared-ui-browser.log`
- `apps/cruise-studio/docs/score-operated-soak-mobile-20261117/touch-controls-browser.log`
- `apps/cruise-studio/js/modules/score-ui.mjs`
- `apps/cruise-studio/js/modules/sheet-cruise/sheet-cruise.js`
- `apps/cruise-studio/scripts/build-local-viewer-offline.mjs`
- `apps/cruise-studio/scripts/build-mobile-viewer-fixture.mjs`
- `apps/cruise-studio/scripts/local-port-viewer.mjs`
- `apps/cruise-studio/scripts/local-ui-entry.mjs`
- `apps/cruise-studio/scripts/local-viewer-bootstrap.js`
- `apps/cruise-studio/scripts/local-viewer-studio.mjs`
- `apps/cruise-studio/scripts/serve-mobile-viewer-fixture.py`
- `apps/cruise-studio/tests/mobile-viewer-fixture.browser.cjs`
- `apps/cruise-studio/tests/mobile-viewer-fixture.test.mjs`
- `apps/cruise-studio/tests/score-playback-operated-soak.browser.cjs`
- `apps/cruise-studio/tests/score-touch-controls.browser.cjs`
- `apps/cruise-studio/tests/viewer-pdf-touch-flow.browser.cjs`
- `apps/score-viewer/core/file-format.mjs`
- `apps/score-viewer/local/asset-list.js`
- `apps/score-viewer/local/index.html`
