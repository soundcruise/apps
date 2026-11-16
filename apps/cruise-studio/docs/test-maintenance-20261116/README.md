# 既存試験の整理・印刷の修正 — 2026-11-16

ローカル候補 **0.135.1-dev.1**。基準 `7f69b433`、作業ブランチ `codex/score-toolbar-ui`。先行する0.132〜0.135の未コミット差分を保持。正式版は0.88.1のまま。コミット・push・本番配信・実アカウント接続は行っていない。

## 結果

- Node：修正前2,148成功／39失敗／5skip → **2,191成功／0失敗／1skip**。
- 既存39失敗は古い試験前提38件と、その失敗を集約する親試験1件。今回のNode失敗から、保存・Undo・移調・音声・MIDIの製品バグは検出されなかった。
- ブラウザ：譜面回帰Chrome **122件**、現行編集・保存・JSON・MIDI・印刷Chrome **12件**、キー／カポ・MIDI継続・実音声・ローカル入口・長い曲の表示設定Chrome/WebKit **23件**成功。
- 最終印刷確認はChrome/WebKit各4件成功（Chrome12件と重複する確認を含む）。WebKitはprintメディアのDOM/CSS確認で、OS印刷やWebKitからのPDF出力ではない。件数にはrunnerの親試験を含む。
- 検証中に別途発見した印刷の行分断とフォーカス枠残りを修正した。

## 既存39失敗の分類

| 分類 | 件数 | 修正した試験の前提 |
| --- | ---: | --- |
| Chord/Rhythm依存 | 4 | 古いowner/cache版。script参照と画像参照を区別。固定Rhythm oracleと現在の本体mirrorは別に検査 |
| テーマ | 11 | StudioのMidnightと既定値、Portの既存4色を区別。4色の156投影はbyte単位の一致を維持し、Midnightの11個の上書き値も検査 |
| metadataとGit試験への連鎖 | 5 | 旧APP_VERSION固定値をsource/metadata照合へ更新。schemaVersionの固定契約は別に維持。Git親試験の集約1件を含む |
| インストール資源 | 2 | Standard/Pro分離前の生成元・manifest不存在・旧アイコンhash。現在のtemplate生成一致と承認済み原本hash／寸法を検査 |
| 旧Shell・native入口 | 14 | 廃止Dock、旧readonly画面、古い入口名／geometry。現在の入口とnative所有、旧adapterのreadonly境界を検査。sidebar幅の保存をテーマ保存と誤認しない |
| Undo再描画 | 1 | 履歴通知だけでなく構造変更operationも再描画する現行分岐を検査 |
| パッケージ資源 | 2 | ファイル件数81/108/90の固定値を完全な名前一覧／hash／重複・除外境界の照合へ変更。権利文・元の許諾hash検査を維持 |

個別名・元の位置・理由は [verification.json](verification.json) に記録。成功させるための製品側の版戻しやmanifest変更はしていない。

## 現行ブラウザ試験への更新

旧Phase 1試験のフォーム採用は、現在は隠された`#sc-chord-forms`をクリックしていた。実際の編集カードからコード選択→CAGED→使用弦の確定を操作し、単一Projectのフォーム／Undo／Redo／MIDI出力を確認するよう更新した。隔離fixtureには現行と同じownerフォーム・表示設定・自動フォーム生成を接続する。実認証や利用者のブラウザprofileは使わない。

旧「PDFは必ず1ページ」試験は、実際には28小節を生成する新規曲を使用していた。4小節の短い曲と28小節の長い曲を明示的に分ける。短い曲はコード・フォーム・歌詞・ドレミ付きで1440px／390pxの両方からA4の1ページを出力し、Projectが無変更であることを検査する。

## 実際に修正した印刷不具合

**原因**：画面の`.studio-main { container-type: size; }`が印刷にも残っていた。layout containmentにより譜面全体が分割しにくい大きな描画領域となり、既存の`.sheet-line { break-inside: avoid; }`が効かず、最終行の罫線だけが次ページへはみ出していた。

**修正**：print.cssで中央領域の`container-type`を`normal`、`contain`を`none`にする。grid/subgridと文字・フォームの配置は維持し、セクション見出しと次行の分離も抑制する。印刷時に残っていた`:focus-visible`の枠と小節番号の選択強調も除く。画面レイアウト・選択・音楽データの処理には変更を加えていない。

**確認**：Chromium生成PDFをPopplerで画像化して確認。pypdfで長い曲の全28個の識別ラベルが重複なく残ることも検査し、1ページ目は1〜24小節、2ページ目は25〜28小節の行全体となった。短い曲はコードフォームを含めて1ページ。印刷前後のProjectは同一。

![長い曲の最終ページ。25〜28小節の行が途中で切れずに残る](print-long-page-2.png)

[長い曲の1ページ目](print-long-page-1.png)／[フォーム付き短い曲](print-short.png)

## 実行条件と残る未確認

Nodeの通常実行ではfake-indexeddbを参照できない4件がskipする。既存の一時ランタイムを`STUDIO_TEST_RUNTIME`に指定して同じ試験を実行し、この4件も成功した。実データや実Accountを使う試験ではない。最後の1skipは`studio-session-recovery.test.mjs`の専用disposable backend/outputが必要なE2Eであり、今回のローカルUI検証では起動していない。

```bash
node --test --test-reporter=spec apps/cruise-studio/tests/*.test.mjs
# fake-indexeddb入り一時ランタイムのpackage.jsonをSTUDIO_TEST_RUNTIMEに指定すると4件も実行される。
# ブラウザ試験には同ランタイムのnode_modulesをNODE_PATHへ指定する。
node --test apps/cruise-studio/tests/score-phase1.browser.cjs
SCORE_ENGINE=webkit SCORE_CASE='print|no script' node --test apps/cruise-studio/tests/score-phase1.browser.cjs
SCORE_OWNER_UI=1 node --test apps/cruise-studio/tests/score-view.browser.cjs
```

既存のローカルサーバー `http://127.0.0.1:18874/` を再利用した。新しいサーバーは起動していない。ブラウザ試験は予約`.invalid`またはloopbackに閉じ、他origin／backendアクセスを遮断。公開HTML・template・manifest、認証・js/cloud、Worker、他アプリ、apps/sharedへの差分はない。差分／index確認を行い、未stageのまま。

Safari実アプリ・OSの印刷ダイアログ／実プリンター・実アカウント本棚・聴感による音質評価は未実施。将来1行自体が1ページより高くなるような極端な表示設定までは保証しない。
