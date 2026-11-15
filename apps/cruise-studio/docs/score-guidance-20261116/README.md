# 譜面の曲設定・再生対象・操作案内 — 0.131.2-dev.1

基準 `f54c0c32`、作業ブランチ `codex/score-toolbar-ui`。0.131.0〜0.131.2の修正をユーザー承認によりまとめてコミット。pushは未実施。正式版0.88.1、公開HTML、本番配信、認証、実Account/Sync、他アプリは変更していない。

## 変更

- 曲メニューの「新しい曲を作成」も、既存の「曲の設定」と同じ2タブのダイアログを開く。曲名は全選択し、すぐ入力できる。旧ドロワーは自動で開かない。
- 再生ボタンの横に「最初から」「5小節目から」「5〜7小節をループ」を表示。音楽時間を持つ小節がない場合は「再生する小節なし」として無効にする。ボタン自体の「再生／停止」は維持。再生中の位置はその下に表示する。
- 選択範囲を「第5〜7小節（3小節選択）」と表示。未選択ではドラッグによる範囲選択、選択中はドラッグによる小節移動、Shiftによる範囲選択、外側クリックによる解除を短い案内で示す。小節の説明ツールチップも揃えた。
- 再生対象の表示幅を確保して、範囲選択の途中で譜面位置が動くことを防ぐ。狭い画面ではUndo/Redoを一組で折り返す。これらの案内は印刷には出ない。

0.131.1で操作案内の区切りを読点へ変更し、0.131.2で省略表現をやめて「小節をクリックすると選択できます」などの自然な文へ変更した。最終文面でChrome/WebKitの専用14件が成功。下記191件の集計と画面記録は0.131.0時点のもの。

## 保存・操作の境界

新規作成前の未保存確認、保存失敗時の保護、全Sessionのdirty確認、入力不正・IME・競合時のガードは従来どおり。設定の適用は既存の単一Undo操作を使い、明示保存までは未保存。新規作成後の設定をキャンセルした場合、設定の入力は捨てるが、新しく作った空の曲は未保存のまま残る。

再生対象と操作案内の表示だけではProjectもUndoも変更しない。音声イベント生成、範囲ループ、ドラッグ移動の処理そのものは変更していない。旧ドロワーは互換経路のためDOMに残している。

## 検証

隔離Chrome/WebKit、合成Project、loopbackまたは予約済みfixture originのみ。ユーザーの保存領域・資格情報は使わない。

- 譜面のChrome回帰122件成功。
- 新規作成・設定取消/適用・保存境界・再生対象・実音声ループ・範囲ドラッグ・移動ハンドラ・レスポンシブ表示の専用14件成功。
- 既存メニュー14件、未保存保護9件、範囲ループ14件、模擬本棚16件、ローカル入口2件成功。主要ブラウザ検証は合計191件（親テスト込み）。
- 関連Node試験26件成功。全Node試験は今回未再実行。
- 320/390/768/1440pxで主要な案内が画面内に収まり、印刷CSSで非表示になることを確認。範囲ドラッグは実マウス操作、移動はDataTransfer付きイベントで既存ハンドラを確認。OSのネイティブドラッグは別途実機確認対象。

旧score-phase1試験は、変更前/今回とも8成功・3失敗（親1件＋個別2件）で一致。個別失敗は、既に非表示の旧コードフォームボタンを押す試験と、PDFを1ページと仮定する試験が2ページになるもの。今回追加の失敗ではない。Safari実機、OS印刷ダイアログ、実アカウント本棚は今回確認していない。

旧active-document/editing-session試験をローカル専用入口に接続する診断も試したが、旧入口の初期状態・離脱契約を前提とするため適合せず中止した。この結果は合格件数には含めない。実装範囲を広げず、その2試験の変更も残していない。

集計は [verification.json](verification.json)。

## ローカル確認

`http://127.0.0.1:18874/` を再読み込みして確認する。

1. 曲メニュー → 新しい曲を作成。曲の設定が開き、曲名をすぐ入力できる。
2. 小節未選択/単独選択/範囲選択で、再生対象と操作案内が変わる。
3. 範囲選択して再生すると、その範囲を繰り返し、停止後も範囲が残る。

画面記録: [デスクトップ](toolbar-1440.png)、[390px幅](toolbar-390.png)、[新規作成の曲設定](new-song.png)。

## コミット対象ファイル（17件）

- `apps/cruise-studio/ai-handoff/PROJECT_STATE.md`
- `apps/cruise-studio/docs/score-guidance-20261116/README.md`
- `apps/cruise-studio/docs/score-guidance-20261116/new-song.png`
- `apps/cruise-studio/docs/score-guidance-20261116/toolbar-1440.png`
- `apps/cruise-studio/docs/score-guidance-20261116/toolbar-390.png`
- `apps/cruise-studio/docs/score-guidance-20261116/verification.json`
- `apps/cruise-studio/js/modules/sheet-cruise/README.md`
- `apps/cruise-studio/js/modules/sheet-cruise/score-settings.mjs`
- `apps/cruise-studio/js/modules/sheet-cruise/sheet-cruise.js`
- `apps/cruise-studio/scripts/local-ui-entry.mjs`
- `apps/cruise-studio/tests/helpers/score-toolbar.cjs`
- `apps/cruise-studio/tests/local-ui.browser.cjs`
- `apps/cruise-studio/tests/mock-bookshelf.browser.cjs`
- `apps/cruise-studio/tests/score-feedback.browser.cjs`
- `apps/cruise-studio/tests/score-guidance.browser.cjs`
- `apps/cruise-studio/tests/score-phase1.browser.cjs`
- `apps/cruise-studio/tests/score-view.browser.cjs`
