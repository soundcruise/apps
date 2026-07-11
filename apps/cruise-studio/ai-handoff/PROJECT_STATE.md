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

- 最新push済みcommit（cruise-studio以外を含む、このリポジトリ全体の最新。origin/main。
  chord-cruise・rhythm-cruise側の並行作業によりHEADが頻繁に進むが、cruise-studio側には
  影響しない。作業前に必ず`git log`でcruise-studioの最新commitが祖先に含まれることを
  確認すること）:
  - cruise-studio側の最新push済みcommitが、リポジトリ全体でも最新とは限らない
    （他アプリの並行commitがその後に積まれるため）
- cruise-studioの直近push済みcommit:
  - `2f5922f2` 歌詞セルの位置管理をtick基準へ移行（`v0.21.1 / G2a`）
  - `08139d18` 小節ルーペの拍グリッド表示を統一（`v0.21.0 / G1`。表示修正2点を含む）
  - `4e27b8c0` 譜面クルーズに歌詞セル編集とtick配置表示を追加（`v0.20.0 / F2a`）
  - D3a・F1・F2a・G1・G2aとも既にpush済み。
- クルーズスタジオ側の未commit差分は、`v0.22.0 / G2b 歌詞行の拍別8分・16分切替`
  実装分のみを想定する（下記5章を参照。実装・検証済み、commit/pushはまだ実施していない）。
- chord-cruise側にも別途、このセッションとは無関係な未commit差分が存在することがある。
  cruise-studio側の作業ではchord-cruiseには一切触れない。
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
  （push済み: `a3a1618f`）
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

- `v0.19.0 / F1 フローティング小節ルーペ化`（push済み: `0906b8f4`）
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
- `v0.20.0 / F2a 歌詞のtick位置セル編集`（docs/DECISIONS.md ADR-028。push済み: `4e27b8c0`）
  - `setBarLyricSlot()` / `getBarLyricSlots()` / `barNeedsSixteenthResolution()` を
    `song-model.js` に新設。ルーペの歌詞行をストロークと同じ共有時間軸のセル
    （8/16マス、`<input>`）へ置き換え、IME 3層ガード付きで1セル=1イベントの
    単発入力に対応。既存tick:0全文は自動分割せず先頭セルへそのまま表示。
    16分位置の歌詞があれば8分ボタンをdisabled化。紙面の歌詞段はtick配置表示
    （tick:0単一イベントは従来どおり全文表示の後方互換）。旧・小節グリッドカードの
    歌詞inputはreadonly化、まとめて入力の歌詞は一時停止。詳細はADR-028を参照
- `v0.21.0 / G1 小節ルーペの拍グループ構造化＋縦線追加`（docs/DECISIONS.md ADR-029。
  push済み: `08139d18`）
  - `populateBeatGroups()` を新設し、拍ルーラー・ストロークセル・歌詞セル・コード/ドレミ
    背面線のすべてがこの1関数を経由するリファクタ。拍・8分・16分の境界線が全行で
    ピクセル単位で一致する。コード・ドレミは1小節1入力を維持、セルのDOM順序・
    `data-cell-index`・IME・フォーカス復元は既存のフラットindexと完全に同じ。
    解像度ロジックは変更しない機能等価リファクタ。実機確認後の表示修正2点
    （歌詞行の縦線が見えない不具合の修正、拍ルーラー表示「1/2/3/4」→「1拍/2拍/3拍/4拍」）
    を含む。詳細はADR-029を参照
- `v0.21.1 / G2a 歌詞セルのtick識別化＋無変更commit防止`（push済み: `2f5922f2`）
  - `song-model.js`に純粋読み取り関数`getBarLyricSlotRanges()`を新設。歌詞セルの位置管理を
    `data-cell-index`（連番）から`data-slot-tick`/`data-slot-ticks`（tick）中心へ移し、
    `getOrderedLyricCells()`/`findLyricCellByTick()`/`getAdjacentLyricCellTick()`/
    `focusLyricCellByTick()`を新設。表示済みの初期値（`input._initialValue`）と現在値が
    一致する場合は`setBarLyricSlot`・`markDirty`・`renderPreview`を一切呼ばない
    「無変更commit防止」を導入（G2bの集約セル非破壊編集の前提整備）。IME3層ガード・
    Alt+←/→の安全策は無変更。`syncBarGridInput()`のF2a由来の既存不具合（旧グリッド
    歌詞inputのaria-label完全一致セレクタがF2aの接尾辞追記で外れていた）も修正。
    詳細は`docs/DECISIONS.md`の関連記述を参照

## 5. 現在作業中のフェーズ

### G2b: 歌詞行の拍別8分・16分切替（`docs/DECISIONS.md` ADR-030）

- 予定バージョン: `v0.22.0`
- 実装・検証済み。commit / push はまだ未実施。
- 背景: G1で拍グループDOM、G2aでtick中心の位置管理・無変更commit防止を整備した。
  G2bはその上に、歌詞行だけ拍ごとに独立して8分/16分表示を切り替えられる
  mixed resolutionを実装する（例: 1拍目8分・2拍目16分・3拍目8分・4拍目16分）。
- 主な内容:
  - **`state.lyricBeatRes`（`WeakMap<bar, Map<beatIndex, 8|16>>`）を新設**。
    projectデータ・localStorage・appSettingsのいずれにも保存しない一時UI状態。
    同一セッション内の小節移動では維持され、全体8分/16分を変更してもローカル指定は
    維持される。JSON読込・新規project・再読込では`bar`オブジェクトが新しくなるため
    自然に消える（GC可能）。詳細は`docs/DECISIONS.md` ADR-030を参照
  - **実効解像度の優先順位は2段階**: 1) その拍のローカル指定
    （`getLyricBeatLocalRes`） 2) ヘッダーの全体8分/16分設定
    （`getStrumGridResolution`）。歌詞データのtickを理由に自動的に16分へ昇格する
    処理は実装していない（「自動」は必ず全体設定へ追従するだけ）
  - **全体8分ロックを歌詞由来とストローク由来で分離**: `isBarDataForcedSixteenth`を
    ストロークのみを見る`isStrumDataForcedSixteenth`へ置き換えた。歌詞に16分位置
    データがあるだけなら全体8分ボタンは押せるようになり（対応する8分セルへ
    自動集約表示される）、ストロークに16分位置データがある場合は従来どおり
    全体8分ボタンがdisabledのまま（`getForcedSixteenthReason`も歌詞判定を削除）
  - **拍別ローカル解像度切替ボタン**（各拍グループ右下。`自8`/`自16`＝自動・全体設定へ
    追従中、`8`/`16`＝ローカル固定）を新設。クリックサイクルは、自動状態からの
    最初のクリックで必ず全体設定と逆の解像度へ固定され、もう一方のローカル固定を
    経て再度押すと自動へ戻る3状態サイクル
  - **解像度変更前の共通安全処理**（`prepareLyricResolutionChange`/
    `finishLyricResolutionChange`）を新設し、拍別ボタン・全体8分/16分ボタンの
    両方へ適用: IME変換中は無操作→アクティブな歌詞セルがあれば変更時のみ1回commit
    （`skipRender:true`）→tick・選択範囲を保存→解像度状態を変更→1回だけ再描画→
    G2aのtick中心フォールバック（同tick→含む→直前→先頭）でフォーカス復元。
    ボタンは`pointerdown`で`preventDefault`し、編集中セルの先行blurによる
    委譲commitの遅延（＝同期的な再描画に追い越されてのデータロス）を防ぐ
  - **mixed resolutionのセル生成**: `buildLyricsGridRow()`を全面書き換え。拍ごとの
    実効解像度からセルrange（`slotTick`/`slotTicks`）を一括生成し、
    `getBarLyricSlotRanges()`（G2a）でまとめて読み出す。8分セルの範囲に複数の
    16分イベントが入っていればtick順に連結され、`isMulti`が立つ（既存表現を再利用。
    titleへ「複数位置の歌詞をまとめて表示中。編集して確定すると、このセルの範囲へ
    統合されます。」を追記）。DOM順は常にslotTick昇順
  - **集約セルの非破壊編集**: G2aの無変更commit防止をそのまま使うため、新たな判定
    ロジックは追加していない。クリック・フォーカス・無変更blur・Enter/Tab移動だけでは
    `setBarLyricSlot`を一切呼ばないことを実機で直接確認済み（`setBarLyricSlot`を
    スパイしてcallCountで検証）。実際に編集して確定した場合のみ、その8分範囲内の
    イベントが1つへ統合され、隣の8分セル・別拍のイベントは変更されない
  - **拍内の境界線class**は新設の`lyricLocalBoundaryClass()`が1拍分に閉じたロジックで
    計算する（既存の`timelineBoundaryClass()`は小節全体で単一解像度を前提にしており
    拍ごとに解像度が異なる歌詞行では使えないため）。全拍が同じ解像度のときは
    `timelineBoundaryClass()`と完全に同じ結果になることを確認済み。拍グループ自体は
    引き続き均等幅（`flex:1 1 0`）のため、拍境界のx座標は他行と常に一致する
  - `sheet-renderer.js` / `print.css` / `DATA_MODEL.md` / `song-model.js`（バージョン行のみ）は
    変更していない（G2aの`getBarLyricSlotRanges()`をそのまま再利用したため、model層の
    新規追加は不要だった）
  - projectデータ構造・localStorage構造・`schemaVersion`は無変更。8/16/8/16・16/8/16/8・
    全拍8分・全拍16分のmixed resolution、tick順のセル生成、拍境界の他行との整列、
    IME・ナビゲーション・Alt+←/→の安全性、コード/ストローク/ドレミ/基本に戻す/
    まとめて入力/bulk歌詞disabled/保存・再読込/JSON往復/紙面表示無変更はすべて
    実機確認済み
  - ストロークの拍別8分/16分・ストロークの「〜」候補追加・コード/ドレミのセル化・
    紙面横4小節固定は今回未着手（G3・F3・別フェーズ）

### ユーザー確定要望（未実装・G1範囲外）

以下はユーザーから確定した要望だが、G1のスコープを超えるため今回は実装していない。
設計が固まっていない変換ルールもあるため、未確定部分は断定せず記録する。

- **A. コードのセル入力化**: 将来、コードも見えている各時間セルへ入力できるようにする
  （拍単位コード編集フェーズで実装予定）。現在は`setBarChord()`・1小節1コードのまま維持
- **B. ドレミのセル入力化**: F3でドレミも時間セル単位で入力できるようにする。
  現在は1小節1入力・既存保存経路のまま維持
- **C. 16分→8分の切替許可**: 将来の拍別8分/16分切替では、16分位置に入力があっても
  8分へ切り替え可能にし、切替時は16分位置の内容を対応する8分セルへ移す。
  対象は歌詞・ストローク・ドレミ・コード。
  **歌詞はG2bで実装済み**: 拍別ローカル解像度ボタンで8分に切り替えると、その拍の
  16分位置イベントはtick順に連結して対応する8分セルへ集約表示される
  （`getBarLyricSlotRanges`。マージルールは「tick順の文字列連結」で確定）。
  歌詞由来の全体8分ロックも解除済み（ストローク由来のロックのみ維持）。
  **ストローク・ドレミ・コードは未実装のまま**（G3・F3・拍単位コード編集フェーズで
  個別に設計する。マージ/優先ルールが歌詞と同じ「tick順連結」になるとは限らない）
- **D. ストロークの「〜」候補追加**: 将来のストロークセル編集で、クリック循環の
  切替候補に「〜」を追加する。今回、クリック循環（`STRUM_CELL_CYCLE`）・保存値は
  無変更
- **E. 紙面を常に横4小節固定表示**: 将来、楽譜本体（紙面）は入力状況にかかわらず
  常に横4小節並びへ固定する。独立した紙面レイアウトフェーズとして扱い、
  `sheet-renderer.js` / `print.css` / 紙面レイアウト / 画面の2小節化判定 / 印刷PDFには
  今回一切触れていない
- **F. 最終歌詞セルEnterでの次小節移動**: 小節の最終歌詞セル（4拍目の最後、
  小節全体の最終セル。各拍の最後ではない）でEnterを押した場合、次小節の
  先頭歌詞セルへ移動する。次の小フェーズで実装予定。現時点では未着手・未実装

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

1. G2b実機確認（ユーザーによる目視確認。拍別ローカル解像度ボタンのサイクル・
   mixed resolutionの見た目/整列・集約セルの非破壊編集・IME・Alt+←/→の安全性）
2. G2b commit
3. G2b push
4. G3: ストロークの行別/拍別8分/16分切替（G2bの`prepareLyricResolutionChange`等の
   仕組みを再利用。ストロークは`bar.strumOverride`の単一slots配列構造のため、
   歌詞と同じ形でそのまま流用できるかは要検討）
6. F2b: 貼り付けの自動展開、既存全文の自動分割（明示操作のみ）、小節をまたぐ自動移動、
   「セルへ割り当て」ボタン等の新しいまとめて配置方式、行間の上下矢印移動
7. F3: ドレミのtick位置セル編集（`setBarMelodySlot` 相当。`barNeedsSixteenthResolution` に
   `melody` を統合。ドレミのセル化時はG1の拍グループ機構をそのまま適用する）
8. F4: まとめて入力の自動分解配置の総仕上げ、整合仕上げ
9. 拍単位コード編集を実装する場合も、G1の拍グループ機構（`populateBeatGroups`）を
   そのまま適用する
10. 上記UI再編（D1〜D3a・F1・F2a〜F4・G1〜G3）が落ち着いた後に本格記譜
    （VexFlow / 五線譜 / MusicXML）を検討

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

- [F2aで解決済み] 旧・小節グリッドカード（`#sc-bar-grid`）の歌詞inputが
  `setBarLyricsText()` 経由でtick位置情報を `tick:0` の単一イベントへ潰してしまう問題は、
  F2aで歌詞inputを `readOnly` 化し書き込み経路を断つことで解決した。ドレミ側は
  まだ同じ経路（`setBarDoremiText()`）で書き込み可能なままのため、F3でドレミを
  セル編集化する際は同様の対応（readonly化）が必要になる見込み。
- *** F3で扱う課題: 旧・小節グリッドカードのドレミinputは、まだ `setBarDoremiText()`
  経由で **小節単位の文字列** として書き込む。F3でドレミをtick位置セル編集化したら、
  この旧UIから編集すると `bar.melody` のtick位置情報を破壊しうるため、F2aの歌詞input
  と同様にreadonly化する対応を検討すること。
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
