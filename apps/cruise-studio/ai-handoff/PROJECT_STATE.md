# Cruise Studio Project State

## 0. AIエージェントへの最初の指示

- 作業開始時は、この `ai-handoff/PROJECT_STATE.md` を最初に読む。
- 次に `ai-handoff/AI_WORKFLOW.md` を読む。
- `git status -sb` を必ず確認する。
- 今回の作業範囲を明示してから作業する。
- 不明点があれば、実装前にユーザーへ質問する。
- commit / push はユーザーの明示指示がある時だけ行う。
- `git add .` は禁止。stageする場合は対象ファイルを個別に明示する。

## 1. 現在の最新状態

- 最新push済みcommit（cruise-studio以外を含む、このリポジトリ全体の最新。origin/main）:
  - full hash: `ac8acc961e1305340e0b52a229cf02228f79ec07`
  - short hash: `ac8acc96`
  - commit message: `譜面クルーズの小節編集UIを下部ドック化`
  - 内容: `v0.17.0 / UI再編 D2 MVP` までリモート反映済み
- ローカルcheckpoint（未push。origin/mainより1コミット先行）:
  - full hash: `a3a1618f02f3d727ed0d32400cd76169c129bc08`
  - short hash: `a3a1618f`
  - commit message: `譜面クルーズに選択小節のタイムグリッド編集を追加`
  - 内容: `v0.18.0 / UI再編 D3a` をローカルcommit済み・未push
  - 運用方針: D3aは実機確認でUIの見た目・配置に追加改善が必要と判明したため、
    origin/mainへは一旦pushせず、次のF1（小節ルーペ化）実装後にD3a＋F1をまとめてpushする
- `main` は `origin/main` より1コミット（D3a checkpoint）先行している。
- クルーズスタジオ側の未commit差分は、`v0.19.0 / F1 小節ルーペ化` 実装分のみを想定する。
- rhythm-cruise 側の差分や未追跡ファイルが出ていても、この作業では触らない。

## 2. クルーズスタジオの目的

- クルーズスタジオは、サウンドクルーズ系アプリの母艦。
- 1つの曲データ `StudioProject` を中心に、複数モジュールを展開する。
- 含まれる主な領域:
  - 譜面クルーズ
  - プレDTMクルーズ
  - 既存アプリランチャー
- 最終的には、同じ曲データから以下へ展開する。
  - コード譜
  - 歌詞
  - ドレミ
  - ストローク
  - メロディ五線譜
  - コード+リズム譜
  - MIDI / DAW準備
- 弾き語り教材制作を強く意識した、PCファーストの制作アプリ。

## 3. モジュール全体像

### 譜面クルーズ

- 曲情報
- セクション
- 小節
- コード
- 歌詞
- ドレミ / メロディ
- タイミンググリッド
- ストローク / リズム譜
- A4紙面
- 将来の五線譜変換

### プレDTMクルーズ

- 譜面クルーズのプロジェクトを読み込む。
- 伴奏イベントを生成する。
- Bass / Drums MIDIを書き出す。
- Acoustic Guitarは現状MIDI対象外。

### 既存アプリランチャー

- 音感クルーズ
- 指板クルーズ
- リズムクルーズ
- コードクルーズ

## 4. 完了済みフェーズ

- `v0.1.0`: クルーズスタジオ母艦と設計基盤
- `v0.2.0`: 譜面クルーズ骨格・曲情報フォーム
- `v0.3.0`: セクション管理・小節グリッド・コード入力
- `v0.4.0`: 譜面クルーズMVP、歌詞/ドレミ/印刷/JSON
- `v0.5.0`: プレDTMクルーズ骨格、既存アプリランチャー
- `v0.6.0`: プレDTM伴奏設定、MIDI書き出し
- `v0.6.1`: beforeunload、currentProjectId、inspectSmf、コードクルーズ導線
- `v0.7.0`: A4固定紙面レンダリング
- Phase S0: スロット編集プロトタイプ
- `v0.8.0 / S1a`: タイミンググリッド、段区切り線、ON/OFF、PDF反映
- `v0.9.0 / R1`: 基本ストローク入力・ストローク段表示
  - 基本ストローク入力欄
  - `↓` / `↑` / `・` / `〜` / `x` の記号パース
  - `strum_custom_basic` への保存
  - `basicStrumPatternId` への反映
  - A4譜面のコード段下にストローク段表示
  - `showStrum` トグル
  - 保存/復元
  - JSON往復
  - プレDTM読み込み
  - MIDI書き出し
  - `schemaVersion` は1のまま
- `v0.10.0 / S1b`: 本番側に小節クリック選択 + 空の編集レイヤー土台
  - `.sheet-bar` へ `data-bar-number` 付与
  - A4紙面上で小節クリック選択
  - 選択ハイライト
  - `.slot-overlay` の位置追従
  - `chord / strum / lyrics / doremi` 行定義DOM
  - overlayは印刷除外
  - 選択状態は保存しない一時UI状態
- `v0.11.0 / S1c`: 歌詞・ドレミ入力を本番overlayへ移植
  - 選択中小節overlayに `lyrics` 入力欄を追加
  - 選択中小節overlayに `doremi` 入力欄を追加
  - 既存 `bar.lyrics` / `bar.melody` 構造へそのまま反映
  - A4紙面を即時更新
  - 既存カード型入力UIとも同期
  - IME入力中のキー操作を小節選択と分離
  - overlayは印刷/PDFに出さない
  - `schemaVersion` は1のまま
- `v0.12.0 / S1e`: コード入力を本番overlayへ統合
  - 選択中小節overlayに `chord` 入力欄を追加
  - 既存 `bar.chords` / `setBarChord()` 構造へそのまま反映
  - 1小節1コードの既存仕様を維持
  - 既存カード型コード入力UIとも同期
  - コード検証は既存UIと同じ警告ベース
  - A4紙面のコード段を即時更新
  - 歌詞・ドレミoverlay入力は維持
  - overlayは印刷/PDFに出さない
  - `schemaVersion` は1のまま
- `v0.13.0 / S1d`: まとめて入力・Alt移動
  - `Alt + ArrowLeft` / `Alt + ArrowRight` で選択小節を前後移動
  - overlay内の「前へ」「次へ」ボタン
  - 移動先小節へoverlay位置を追従
  - コード / 歌詞 / ドレミのまとめて入力
  - 既存 `bar.chords` / `bar.lyrics` / `bar.melody` 構造へ順に反映
  - A4紙面と既存カード型入力UIを即時同期
  - 選択状態やまとめて入力UI状態は保存しない
  - `schemaVersion` は1のまま
- `v0.14.0 / R2`: ストローク行を編集レイヤーに追加、小節別 `strumOverride` UI
  - overlayに `strum` 入力欄を追加
  - 空欄なら基本ストローク継承、入力ありなら小節別上書き
  - `bar.strumOverride` と `project.strumPatterns` の既存構造を再利用
  - 小節専用パターンIDを作成/更新し、未参照パターンは最小限掃除
  - A4紙面のストローク段へ即時反映
  - 小節別上書きの16分相当をグリッド自動判定へ反映
  - 既存のコード / 歌詞 / ドレミoverlay入力、小節移動、まとめて入力を維持
  - 保存/復元、JSON、プレDTM、MIDI既存経路を維持
  - `schemaVersion` は1のまま
- `v0.15.0 / R3`: コード＋ストローク段の文字ベースリズム譜表示改善（push済み: `a167f007`）
  - VexFlow / 五線譜 / 正規休符 / タイ曲線 / MusicXMLは未導入のまま
  - 既存の文字ベース表示（↓ / ↑ / ・ / 〜 / x）を読みやすく整形
  - ストローク段に8分/16分の識別classと記号種別classを付与
  - コード段直下の余白、休符/伸ばし/ミュートの濃淡、画面/印刷サイズを調整
  - showStrum OFF時はストローク段を生成せず、不自然な余白を残さない
  - タイミンググリッドON/OFFと共存
  - overlay編集、小節移動、まとめて入力、保存/復元、JSON、プレDTM、MIDI既存経路を維持
  - `schemaVersion` は1のまま
- `v0.16.0 / UI再編 D1`: 譜面全幅化・曲情報等のドロワー化（push済み: `19ea503e`）
  - 背景: 実機確認で、曲情報が常設で左カラムを占有し、A4紙面が縮小表示されて
    編集しづらいことが判明した。Fable5による設計レビューの結果、将来的には案A
    「下部ドック型スロットエディタ」を推奨方針とし、まず土台としてD1（譜面全幅化・
    ドロワー化）を先行実装する方針とした（`docs/DECISIONS.md` ADR-025）
  - `.sheet-layout` を左右2ペイン（編集パネル+A4紙面）から1カラム構成に変更
  - 曲情報・セクション・表示設定・小節グリッド（旧一覧編集）を上部の折りたたみドロワー
    （`<details id="sc-editor-drawer">`）へ移動。既定は閉じた状態
  - 小節グリッド（旧一覧編集カード）はドロワー内でさらにネストした
    `<details id="sc-bar-grid-drawer">` に収め、常設表示から外す（機能・データは維持）
  - A4紙面プレビューはドロワー下にフル幅表示。`.sheet-preview-viewport` の
    `max-width: 794px` は紙面の自然サイズと一致するため、画面幅が十分あれば
    常に等倍（scale=1）表示になり、以前の2ペイン時（scale<1で縮小）より大きく見える
  - 紙面上の小節クリック選択・ミニoverlay編集（コード/ストローク/歌詞/ドレミ入力、
    Alt+←/→、前へ/次へ、まとめて入力）は暫定維持、ロジック変更なし
  - print.css の非表示リストに `.sheet-editor-drawer` を追加
  - データ構造・保存/復元/JSON/プレDTM/MIDI経路は無変更。`schemaVersion` は1のまま
  - VexFlow / 五線譜 / MusicXML / 下部ドック型スロットエディタ本体はD1では未着手
- `v0.17.0 / UI再編 D2 MVP`: 極小overlayを画面下部の編集ドックへ移設（push済み: `ac8acc96`）
  - 背景: D1実機確認で、譜面が主役に見えるレイアウトにはなったが、小節クリック時に出る
  `.slot-overlay`（S1b〜R2）が小節上に出る小さな箱のままで、入力欄が狭く操作しづらいままだった。
  Fable5の設計レビューで推奨された案A「下部ドック型スロットエディタ」に沿って、
  まずD2としてドックの器（画面下部固定・大きな入力欄）だけを先に作り、
  拍/裏拍/16分セル入力（本格スロット入力）はD3へ送る（`docs/DECISIONS.md` ADR-025）。
- 主な内容:
  - `#sc-slot-overlay` のDOM位置を `#sc-preview` 内（紙面と一緒にスケールされる場所）から
    `#screen-sheet-cruise` 直下（`.sheet-layout` の外）へ移動し、`position: fixed; bottom: 0;`
    の画面下部ドックとして常に等倍サイズで表示する（紙面のスケール・スクロールに影響されない）
  - 内部の行構造（chord/strum/lyrics/doremi）・入力ロジック・まとめて入力・小節移動
    （`applyOverlayFieldChange` / `buildOverlayInput` / `buildBulkInputPanel` / `moveSelectedBar` 等）は
    S1b〜R2からそのまま流用。保存先・検証ロジックは無変更
  - ドックヘッダーに「〇小節目を編集中」表示、分かる場合はセクション名バッジ、
    「← 前へ」「次へ →」、補助テキスト「Alt+←/→でも移動できます」、「✕ 閉じる」を追加
  - 「閉じる」は選択解除（`deselectBar()`）として実装。紙面上の小節を再クリックすると
    同じ小節が再選択され、ドックも再表示される
  - 入力欄を明らかに拡大（旧: font-size 10.5px・padding 2px 6px → 新: font-size 17px・padding 12px 14px）
  - ドック本文は「入力4行（左）＋まとめて入力（右）」の2カラム（900px未満は1カラムに畳む）
  - ドック表示中は `body.dock-open` クラスを付け、`#screen-sheet-cruise` に
    `padding-bottom: 56vh` を与えて紙面下部がドックに隠れすぎないようにする
  - 座標追従用だった `positionSlotOverlay()` は、選択中の小節が紙面から消えた場合の
    安全側クローズ処理のみへ簡素化（固定表示のため逐次のleft/top計算は不要）
  - 選択ハイライト（`.sheet-bar.is-selected`）は既存のまま維持
  - print.css は無変更で動作（`.slot-overlay` は既存の `display:none!important` ルールで
    印刷除外のまま。D1の `.sheet-editor-drawer` 除外ルールも維持）
  - データ構造・保存/復元/JSON/プレDTM/MIDI経路は無変更。`schemaVersion` は1のまま
  - 拍/裏拍/16分セル入力・`_proto/slot-editor.*` の移植・VexFlow/五線譜/MusicXMLはD2 MVPでは未着手
- `v0.18.0 / UI再編 D3a`: 選択小節タイムグリッド・ドック（ストロークセル編集）
  （ローカルcheckpoint済み: `a3a1618f`。origin/mainへは未push。次のF1と合わせてpush予定）
  - 背景: D2実機確認で、ドックが画面下半分近くを占有するただの大きなフォームになり、
    拍・裏拍・16分の時間軸が見えず、まとめて入力が常時表示で邪魔になり、
    「選択小節を拡大した感覚」がないという課題が判明した。Fable5の設計レビューで
    「選択小節のX線写真」方針（紙面上の選択小節と同じ段順・同じ時間軸を保ったまま、
    横方向へ拡大し各位置を編集できるタイムグリッド・ドックにする）が確定した
    （`docs/DECISIONS.md` ADR-026）。
  - ドック全体を高さ約200〜220px（`max-height: 240px`）へコンパクト化。
    `body.dock-open` の `padding-bottom` も `56vh` → `260px` に変更
  - ヘッダーを1行に集約: 小節番号・セクション名・前へ/次へ・8分/16分セグメント切替・
    （ストロークoverride中のみ）「基本に戻す」・「まとめて入力」ボタン・
    「Alt+←/→で移動」ヒント・閉じる（✕）
  - 拍ルーラー（`.slot-overlay-ruler`）を新設。紙面のタイミンググリッドと同じ
    強弱階層（小節端 ＞ 拍頭 ＞ 8分位置 ＞ 16分位置）の境界線を、ストローク行とも共有
  - コード/ストローク/歌詞/ドレミを同じ時間軸グリッド上に配置。コードは1小節1コードの
    大きな1セル（`setBarChord()` を継続使用）、歌詞・ドレミは時間軸に揃えた1つの入力欄
    （`setBarLyricsText()` / `setBarDoremiText()` を継続使用。tick位置セル分解はD3bで扱う）
  - **ストローク行を本格的にセル編集化**（D3aの主実装）:
    - `song-model.js` に `setBarStrumSlots(project, barNumber, slots)` を新設し、
      パターンID管理（allocate・衝突回避・未参照掃除）を共通化。
      `setBarStrumText()` は「文字列パース → slots生成 → `setBarStrumSlots()`」の
      薄いラッパーへリファクタリング（既存の保存構造・パターンID管理ロジックは無変更）
    - `sheet-renderer.js` の `strumNeedsSixteenth()` を公開APIへ追加（ロジック自体は無変更。
      紙面のストローク段描画とドックのセル表示解像度判定が同じ基準を共有するため）
    - セルクリックで循環: rest → down → up → mute → rest
    - キーボード: `d`/`u`/`x`/Space で直接入力、Delete/Backspaceでrest、
      ArrowLeft/ArrowRightで隣セルへ、Alt+←/→で前後の小節へ移動、
      Enterで確定後に右セルへ移動
    - 連続する「伸ばし継続セル」は直前の実音セルの `durationTicks` を延長して保存する
      （既存のテキスト入力パーサーと同じ「直前を伸ばす」思想を、セル編集でも踏襲）
    - 基本ストローク継承中（`bar.strumOverride` 未設定）はゴースト表示（`.is-inherited`）。
      継承中のセルを1つでも編集すると、継承内容をコピーしたうえで
      その1セルだけ変えた内容を `setBarStrumSlots()` へ渡す＝「最初の編集でoverride化」
    - 「基本に戻す」ボタン（override中のみ表示）は `setBarStrumSlots(project, barNumber, [])`
      を呼ぶだけで `bar.strumOverride` を `null` に戻す（既存の空文字列と同じ挙動を利用）
  - 8分/16分の表示解像度は「データから必要な解像度」と
    「ユーザーが一時的に選んだ解像度」の大きい方を使う。手動選択は `state.dockManualRes`
    （barNumberをキーとするUI一時状態。`_proto/slot-editor.js` の `barResOverride` と同じ
    「小節ごとに憶えておく」思想。保存しない・schema変更なし）で、小節を移動しても
    その小節の手動選択は保持される。データ側が16分を要求する小節は8分表示に戻せない
  - 「まとめて入力」を常設右カラムから、ヘッダーのボタンで開くポップオーバー
    （`.slot-overlay-bulk-popover`。ドック上側にフロート表示し、通常のドック高さ・幅を
    消費しない）へ変更。外クリック・Escapeで閉じる。中身（コード/歌詞/ドレミのまとめて
    入力ロジック）はD2までのものをそのまま再利用。ストロークのまとめて入力は追加していない
  - 選択小節の自動スクロール（`scrollSelectedBarIntoDockView` /
    `maybeAutoScrollToSelection`）を追加。小節クリック・前へ/次へ・Alt+←/→の直後、
    選択小節がドックの裏に隠れる場合だけスクロールする（入力中の再描画毎には行わない）
  - 座標追従用だった `positionSlotOverlay()` は従来どおり「選択小節が紙面から消えたら
    閉じる」安全処理のみ
  - 旧・小節グリッドカード（`#sc-bar-grid`）は今回も現状維持（削除しない・ロジック変更なし）
  - print.cssは `.slot-overlay-bulk` → `.slot-overlay-bulk-popover` のクラス名変更のみ反映
    （`.slot-overlay` 自体の除外により実質は元から印刷除外されていた）
  - データ構造・保存/復元/JSON/プレDTM/MIDI経路は無変更。`schemaVersion` は1のまま
  - 歌詞/ドレミのtick位置セル編集、拍単位コード入力、`_proto` のスロット入力そのものの
    移植、VexFlow/五線譜/MusicXMLはD3aでは未着手

## 5. 現在作業中のフェーズ

### F1: フローティング小節ルーペ化

- 予定バージョン: `v0.19.0`
- 実装・検証済み。
- commit / push はまだ未実施。
- 背景: D3a実機確認で、機能的には良いものの「黒い編集パネル・画面下固定・紙面と色/罫線/
  フォントが異なる」ため「選択した小節そのものを拡大した表示」に見えないという課題が
  判明した。今回はD3aのタイムグリッド編集機能（拍ルーラー・8分/16分・ストロークセル編集・
  setBarStrumSlots()等）はそのまま維持し、表示方式・デザイン・位置・サイズだけを変更する
  （`docs/DECISIONS.md` ADR-027）。
- 主な内容:
  - **紙面デザイン化**: `.slot-overlay`（ルーペ本体）を黒基調ドックから、A4紙面と同じ
    アイボリー背景（`--paper-bg: #fdfbf5`）・墨色文字（`--paper-ink`）・
    紙面フォントスタック（`--paper-font`）へ変更。外枠は選択小節と同じアンバー2px実線、
    角丸9px。コード/歌詞/ドレミの文字色、ストローク段の濃淡、拍グリッドの線の強弱
    （小節端＞拍頭＞8分＞16分）はすべて紙面の実値と一致させた
  - **ペーパートークン**: `theme.css` の `:root` に `--paper-bg` / `--paper-ink` /
    `--paper-muted` / `--paper-chord` / `--paper-lyrics` / `--paper-doremi*` /
    `--paper-strum*` / `--paper-line-*` / `--paper-border*` / `--paper-font` を追加。
    既存の `.sheet-page` 系ルールもこれらの変数を参照するようリファクタリングしたが、
    値は完全に同一のため画面・印刷の見た目は変化しない（実機確認済み）
  - **フローティング化**: `position: fixed` は維持しつつ `bottom: 0` / `translateX(-50%)` を
    廃止し、`left` / `top` の px指定による自由配置へ変更。初期位置は水平中央・
    垂直はビューポート52%（`viewportHeight * 0.52`）。既存の `body.dock-open`
    `padding-bottom` は撤去（フローティング化により紙面下部の予備余白確保が不要になったため）
  - **タイトルバードラッグ**: `.slot-overlay-head`（既存のヘッダー）自体をドラッグ領域にし、
    Pointer Events（pointerdown/setPointerCapture/pointermove/pointerup）で実装。
    button/input/select/textarea/a・ポップオーバー・リサイズハンドルの上ではドラッグを
    開始しない（`event.target.closest()` で判定）。ドラッグ中は `body.loupe-dragging`
    （user-select:none・cursor:grabbing）を付与し、終了時に位置をappSettingsへ保存する
  - **右下ハンドルでの比例リサイズ**: `.slot-overlay-resize-handle` を新設し、
    同じくPointer Eventsで幅だけを変更する。`--bar-loupe-scale`（=現在幅/960）を
    ルート要素へ`style.setProperty`し、フォントサイズ・行高さ・セルサイズ等を
    `calc(基準px * var(--bar-loupe-scale, 1))` で比例させた。ストロークセルの
    クリック領域・フォントサイズには `max()` で最小フロアを設定し、16分表示でも
    操作不能にならないようにした。高さは内容に応じた自動のまま（単独では変更不可）
  - **クランプ処理**: 初期化（`initLoupeGeometry`）・ドラッグ・リサイズ・ウィンドウ
    リサイズ（`reclampLoupeOnResize`）のすべてで、幅は
    `min(1240, viewportWidth-32)`〜`680`、水平位置は左右最低120pxが画面内に残る範囲、
    垂直位置は`8px`以上かつタイトルバーが画面内に残る範囲へクランプする
  - **appSettings保存**: `cruiseStudio.appSettings` の `barLoupe` キー（`{x, y, width}`）へ
    ドラッグ終了時・リサイズ終了時にのみ保存する（既存の
    `storage.getAppSetting`/`setAppSetting` を再利用）。projectデータ・`schemaVersion` は
    無変更。壊れた値・異常値を読み込んだ場合は初期値へフォールバックする
  - **小節移動時の状態維持**: 前へ/次へ・Alt+←/→・紙面上の別小節クリックでも、
    `state.loupe` はJS状態としてルート要素の再描画（`innerHTML=''`）をまたいで保持され、
    `renderSlotOverlayContent()` の末尾で毎回 `applyLoupeGeometry()` を呼ぶことで
    位置・幅・scaleが飛ばないことを実機確認済み
  - **まとめて入力ポップオーバー**: D3aの方針（常設表示しない・ヘッダーのボタンから開く・
    外クリック/Escapeで閉じる）を維持。ルーペの子要素なのでドラッグ・リサイズに自動で
    追従する。画面外へはみ出す場合は `positionBulkPopover()` がルーペ上側→下側、
    右寄せ→左寄せへ自動反転する（`is-flip-down` / `is-flip-left`）
  - **狭い画面（680px未満）フォールバック**: 幅を `viewportWidth-28px` に強制し、
    リサイズハンドルを非表示にする（`.slot-overlay--narrow`）。PCファーストのため
    大規模なモバイル最適化は行わない
  - **Escapeの優先順位整理**: ポップオーバーが開いていれば閉じる→ルーペ内の入力欄/
    ストロークセルにフォーカスがあればblur（セル編集解除）→それ以外は選択解除して
    ルーペを閉じる、の順に整理（`onDocumentKeydownForLoupe`）。フォーカストラップは
    付けない非モーダルなツールパレットとして扱う（`role="dialog"` `aria-modal="false"`）
  - キーボードによる移動代替として `Alt+Shift+矢印`（16pxずつ）をタイトルバーに実装
  - D3aのタイムグリッド編集機能（拍ルーラー・8分/16分・ストロークセル編集・
    基本ストローク継承/override/基本に戻す・コード/歌詞/ドレミ入力・前へ/次へ・
    Alt+←/→・showStrum・グリッドON/OFF・保存/JSON/プレDTM/MIDI・印刷除外）は
    すべて回帰なしで実機確認済み
  - `song-model.js` の `setBarStrumSlots()` はD3aのまま変更していない
  - `sheet-renderer.js` は変更していない（strumNeedsSixteenthの公開はD3a時点のまま）
  - データ構造・保存/復元/JSON/プレDTM/MIDI経路は無変更。`schemaVersion` は1のまま
  - 歌詞/ドレミのtick位置セル編集・`setBarLyricSlot`/`setBarMelodySlot`・
    旧小節グリッドカードの撤去・bulk自動分解配置・拍単位コード入力はF1では未着手（F2以降）

### R1の記号ルール

- `↓` = ダウンストローク
- `↑` = アップストローク
- `・` = 休符 / 弾かない
- `〜` = 直前の音を伸ばす / タイ候補
- `x` = ミュートストローク
- `X` / `×` もmuteとして受け付ける方針
- スペース / タブは区切りとして無視
- 8記号以内は8分、9記号以上は16分
- `〜` は `durationTicks` 延長
- 正しい休符記号 / タイ曲線はまだ描画しない

### R1の設計上の重要点

- `strumPatterns` / `basicStrumPatternId` / `bar.strumOverride` は既にスキーマに存在する。
- R1では `schemaVersion` を上げない。
- 基本ストロークは文字列ではなく `slots` が正。
- 空欄の場合、既定8ビートを勝手に紙面へ印字しない。
- プレDTMは既存の `basicStrumPatternId` 経路で自然に恩恵を受ける。

## 6. 次にやること

1. F1実機確認（紙面デザインの一致・ドラッグ/リサイズの手触り・appSettings保存の確認）
2. F1 commit
3. D3a（`a3a1618f`）＋ F1 をまとめて push
4. F2: 歌詞のtick位置セル編集（`setBarLyricSlot` 相当。`_proto/slot-editor.*` のモーラ分解を参考にする）
5. F3: ドレミのtick位置セル編集（`setBarMelodySlot` 相当）
6. F4: まとめて入力の自動分解配置、旧・小節グリッドカード撤去、整合仕上げ
   （9章「既知課題」の *** 印の項目を参照）
7. 上記UI再編（D1〜D3a・F1〜F4）が落ち着いた後に本格記譜（VexFlow / 五線譜 / MusicXML）を検討

## 7. 重要な設計方針

- A4紙面DOMは表示/印刷用としてきれいに保つ。
- 直接編集感は、紙面上に重ねる編集レイヤーで実現する。
- 印刷用DOMそのものを `input` / `contenteditable` にしない。
- 編集レイヤーは印刷に出さない。
- グリッドONならPDFにも出る。
- グリッドOFFならPDFに出ない。
- `schemaVersion` は安易に上げない。
- 表示専用フィールドは補完で読む。
- 音や出力に影響するスキーマ変更は `schemaVersion` 検討が必要。
- `strumPatterns` 既存構造を活かす。
- 小節別ストローク上書きは `bar.strumOverride` で行う。
- 休符/タイの本格記譜はVexFlow等のフェーズで行う。
- プレDTMへの影響は慎重に分離する。
- 既存アプリは絶対に壊さない。

## 8. 触ってはいけないもの

- `apps/fretboard_cruise`
- `apps/pitch-cruise`
- `apps/rhythm-cruise`
- `apps/chord-cruise`
- `apps/shared`
- `service-worker`
- `manifest`
- PRO認証まわり
- `apps/rhythm-cruise/rhythm-cruise-icon-proposal.png`
- `apps/rhythm-cruise/rhythm-cruise-icon-proposal.svg`

## 9. 既知課題

- *** D3b/D3cで扱う重要課題: 旧・小節グリッドカード（`#sc-bar-grid`。曲情報ドロワー内の
  「小節グリッド（一覧編集・任意）」）は、歌詞・ドレミを `setBarLyricsText()` /
  `setBarDoremiText()` 経由で **小節単位の文字列** として書き込む。D3bで歌詞・ドレミを
  tick位置セル編集化したあとも、この旧UIから編集すると全イベントが `tick:0` の
  単一イベントへ潰れてしまい、セル編集で作ったtick位置情報を破壊する。D3bの実装時に
  旧UIを読み取り専用にする／隠す／警告を出すなどの対応を検討すること。D3aでは
  現状維持（削除しない・ロジック変更しない）。
- R1の実PDF確認は最終目視が必要。
- 8分ストローク時にグリッドが16分になることがある可能性。
- 正しい休符マーク・タイ曲線は未実装。
- 休符記号の本格描画は未実装。
- タイ曲線の本格描画は未実装。
- VexFlowによる記譜表示は未実装。
- 本格的なコード+リズム譜の記譜表示は未実装。
- S0プロトタイプは本番に未統合。
- メロディ五線譜は未実装。
- コード+リズム譜の五線譜化は未実装。
- MusicXMLは未実装。

## 10. 次のAIへの指示

- このファイルを読んだ後、`ai-handoff/AI_WORKFLOW.md` を読む。
- `git status -sb` を確認する。
- 現在の未commit差分を確認する。
- 未commit差分がある場合は、それを勝手に変更せず、まず報告する。
- ユーザーに確認せずcommit / pushしない。
- 触ってよい範囲を明示してから作業する。
