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
  - `3f387b18` 紙面歌詞位置と拍別固定表示を改善（`v0.22.3`）
  - `e64cf1ee` 歌詞解像度切替時のデータ破壊を防止（`v0.22.2`）
  - `b2772103` 歌詞最終セルのEnterで次小節へ移動（`v0.22.1 / G4`）
  - `c9ab248f` 歌詞行に拍別8分・16分切替を追加（`v0.22.0 / G2b`）
  - `2f5922f2` 歌詞セルの位置管理をtick基準へ移行（`v0.21.1 / G2a`）
  - `08139d18` 小節ルーペの拍グリッド表示を統一（`v0.21.0 / G1`。表示修正2点を含む）
  - `4e27b8c0` 譜面クルーズに歌詞セル編集とtick配置表示を追加（`v0.20.0 / F2a`）
  - D3a・F1・F2a・G1・G2a・G2b・G4・v0.22.2・v0.22.3とも既にpush済み。
- クルーズスタジオ側の未commit差分は、`v0.22.4 フローター入力UIのデザイントーン調整`
  実装分のみを想定する（下記5章を参照。実装・検証済み、commit/pushはまだ
  実施していない）。
- chord-cruise側の並行作業によりHEADが進んでいることがあるが、cruise-studioの
  安定点`3f387b18`はその祖先であり影響しない。
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
- `v0.22.0 / G2b 歌詞行の拍別8分・16分切替`（docs/DECISIONS.md ADR-030。push済み: `c9ab248f`）
  - `state.lyricBeatRes`（`bar`オブジェクトをキーにしたWeakMap。project/localStorage/
    appSettingsへ保存しない一時UI状態）で拍ごとのローカル解像度を保持し、実効解像度は
    「ローカル指定 ＞ 全体設定」の2段階だけで決まる（歌詞データのtickによる自動16分
    昇格はしない）。全体8分ボタンのdisabledロックをストローク由来のみへ限定
    （`isStrumDataForcedSixteenth`）。拍グループ右下に自8/自16/手8/手16の3状態
    切替ボタンを新設し、切替前後で編集中セルの内容を保全する共通安全処理
    （`prepareLyricResolutionChange`/`finishLyricResolutionChange`）をローカル・
    全体ボタン両方へ適用。8分セルに複数の16分イベントが入る場合は
    `getBarLyricSlotRanges()`（G2a）でtick順に連結表示し、無変更commit防止（G2a）を
    そのまま使うことで、実際に編集確定した場合だけ範囲を統合することを実機確認済み。
    実機確認後の修正2点（手動固定ラベルを「手8/手16」へ変更、拍別ボタンのbox-model
    ・実クリック領域を明確に縮小）を含む。詳細はADR-030を参照
- `v0.22.1 / G4 歌詞行の最終セルEnterによる次小節移動`（push済み: `b2772103`）
  - 最終セル判定は`getOrderedLyricCells()`のDOM順（tick昇順）配列の末尾要素との一致で
    行い、セル数・tickをハードコードしないためmixed resolutionでも正しく動作する。
    次小節への移動は既存の`getMoveTarget(1)`/`moveSelectedBar(1,{focusRowId:'lyrics'})`
    （Alt+←/→・前へ/次へと同じ経路）をそのまま再利用し、`state.project.bars`の正規順序
    （セクション境界を含む）で移動する。移動前commitはAlt+←/→と同じ
    `commitLyricCell(...,{skipRender:true})`パターン。曲全体の最終小節では新しい
    小節・セクションを作らず現在セルに留まり、ステータス表示で案内する。新しい
    token/世代番号は追加せず、既存の`isConnected`チェック（blur）・`expectedBarNumber`
    比較（フォーカス復元）だけで古いコールバックの誤書き込みを防止。独立レビュー
    （Fable 5）でも健全と判定され、実機で全拍8分/16分・mixed resolution・セクション
    境界越え・曲全体の最終小節・無変更ガード・二重commit防止・IME・古いcallback
    安全性を確認済み
- `v0.22.2 歌詞解像度切替時のデータ破壊防止`（G2b由来の不具合修正。push済み: `e64cf1ee`）
  - 背景: G2bの拍別/全体解像度切替（`prepareLyricResolutionChange`/
    `finishLyricResolutionChange`）に起因するデータ破壊の可能性がFable 5の調査で
    発見された。歌詞セルへフォーカスがある状態でそのセルのrangeが変わる解像度切替
    （集約・分解）を行うと、`restoreLyricCellFocus()`が切替前セルのsnapshot valueを、
    range不一致の切替後セルへ代入してしまい、その後のblur/Enter/Tab等でG2aの
    無変更commit防止が誤って通過し、`setBarLyricSlot()`経由でprojectのlyrics
    イベントが恒久的に失われる可能性があった
  - 修正: `captureLyricCellFocus(slotTick, input)`の戻り値へ`slotTicks`（range幅）を
    追加し、`restoreLyricCellFocus()`のvalue/selection復元を「切替前後でslotTickと
    slotTicksが完全に一致する、全く同一rangeのセルへ戻す場合」だけに限定。フォーカス先
    の決定（`findLyricCellByTick()`のフォールバック）自体は変更せず、range不一致の
    場合はフォーカスのみ行い、再描画済みDOMのproject由来の値をそのまま残す
  - Fable 5独立レビュー総合判定A。ユーザー実機確認（16分→8分集約・8分→16分分解・
    拍別/全体ボタン双方・未確定編集後の切替・IME/G4/通常ナビゲーションの回帰なし）
    すべて合格

## 5. 現在作業中のフェーズ

### v0.22.3: 紙面歌詞位置の修正＋拍別固定表示の文言変更

- 予定バージョン: `v0.22.3`
- 実装・検証済み。commit / push はまだ未実施。
- 背景: ユーザー実機画像とFable 5の数値調査により、紙面上の歌詞が小節後半ほど
  左へずれる構造バグが確認されていた（8分配置で1セル進むごとに約-1.875px、
  4拍裏でカラム中心が約-6.56pxずれる等）。根本原因は、罫線グリッド
  （`.sheet-bar-grid`）が`position:absolute; inset:0;`で`.sheet-bar`のボーダーボックス
  全幅を等分するのに対し、歌詞グリッド（`.sheet-bar-lyrics--timed`）は通常のflex
  子要素として`.sheet-bar`の横padding（8px×2）を除いたコンテンツ幅から、さらに
  `column-gap:1px`を引いた幅を等分しており、母数が異なるため後半へ線形に位置誤差が
  累積していたこと
- 主な内容:
  - **CSSカスタムプロパティの導入**: `.sheet-bar`の横padding値（8px。既存値のまま
    変更なし）を`--sheet-bar-pad-x`として切り出し、`padding: 4px var(--sheet-bar-pad-x) 8px;`
    へ書き換え（縦paddingは個別値のまま維持し、横paddingだけを変数化。既存CSS構造を
    大きく変えずに罫線側と歌詞側で同じ値を共有できるため、この方式を採用した）
  - **`.sheet-bar-lyrics--timed`**: `margin-left`/`margin-right`へ
    `calc(-1 * var(--sheet-bar-pad-x))`を設定してpaddingを打ち消し、`column-gap`を
    1px→0へ。これにより罫線グリッドと歌詞グリッドが同じボーダーボックス全幅を
    同じ母数（gapなし）で等分するようになる
  - **`.sheet-bar-lyrics--timed > span`**: `text-align: center`を追加し、各セルの
    文字を中央揃えに。加えて`min-width: 0`を追加した（追加発見。下記の
    「長文歌詞と罫線整列のトレードオフ」参照）
  - 変更は`theme.css`のみ。`sheet-renderer.js`（DOM構造・`grid-template-columns`
    設定）・保存データ・`schemaVersion`は無変更。`print.css`は`.sheet-bar`へ
    `break-inside`/`page-break-inside`のみを設定しpaddingを上書きしていないため、
    `--sheet-bar-pad-x`の値がそのまま印刷にも継承されることをコード上確認済み
    （`print.css`自体は変更していない）
  - ストローク段（`.sheet-bar-strum`）にも同種の座標差が潜在する可能性をFableが
    指摘しているが、今回は歌詞段のみを対象とし、ストロークの座標・中央揃え・
    罫線・データ処理は一切変更していない（次タスク候補として記録）
  - **長文歌詞と罫線整列のトレードオフ（訂正記録）**: 当初「長文歌詞の重なりは
    `overflow:visible`という既存仕様に由来する」と説明していたが、Fable 5の
    再計測により不正確と判明したため訂正する。正確には、`white-space:nowrap`＋
    `overflow:visible`のgrid item（`.sheet-bar-lyrics--timed > span`）はデフォルトの
    自動最小サイズが「テキスト全文の幅」になるため、修正前は長文歌詞が1セルでも
    あるとCSS Gridの`repeat(N,1fr)`トラック計算自体が広がり、そのセル以降すべてが
    罫線グリッドとズレていた（そのため隣接文字とは重なりにくかった）。`min-width:0`
    でトラックを正しく等分すると、長文はトラックを押し広げなくなり、
    `overflow:visible`のとおり隣へあふれるようになる。つまり長文歌詞の重なりは、
    正しい罫線整列を実現したことで顕在化するトレードオフである。1〜2文字では
    十分な余裕があり通常の1モーラ運用では問題になりにくいことを実測済み
    （4文字ずつの組み合わせで約13px、8〜9文字の組み合わせで約69pxの重なりを確認）。
    4文字以上を1セルへ入れる長文表示の扱い（あふれセルだけフォント縮小／ellipsis／
    クリップ／モーラ分割案内強化）は、今回は実装せず将来の独立タスク
    「長文歌詞セルの表示方針検討」として記録する（下記6章参照）
  - **拍別固定表示の最終仕様**: `buildLyricBeatResButton()`の表示テキストは
    「自8/自16/固8/固16」という中間案を経て、ユーザー最終決定により
    `btn.textContent = String(effectiveRes)`（有効解像度の数字だけ。「8」「16」）へ
    変更した。固定状態（`is-local`）だけ、`.dock-lyrics-beat-res-btn.is-local::before`の
    CSS `mask-image`（南京錠のSVGデータURI、`background-color: currentColor`）で
    細いモノクロ線画アイコンを表示して区別する（Unicode絵文字🔒は不使用。
    OS/ブラウザ間の見た目差・カラー絵文字化を避けるため）。ボタン本体は
    `display:inline-flex; align-items:center; justify-content:center; gap:1px;`で
    アイコンと数字を中央配置。状態間（自動8/自動16/固定8/固定16）でボタン幅が
    変動しないよう、`min-width`ではなく`width:16px`の固定値へ変更した（実装当初は
    `min-width`のままだったため状態により14px〜21pxまで幅が動く問題があり、
    4状態とも同一幅になるよう修正済み）。アイコンサイズは`4.5px`角、`padding:0`。
    `position`/`right`/`bottom`/`z-index`/`border`は無変更。title/aria-labelは
    「全体設定へ自動追従中（現在はX分）。クリックすると、この拍だけY分に固定します」
    「この拍だけX分に固定中。全体設定を変えても追従しません。クリックすると、
    この拍だけY分に固定します/自動追従へ戻します」という文章に変更し、鍵アイコン
    自体は読み上げさせずボタンのaria-labelで意味を伝える。状態サイクル
    （8→固定16→固定8→8、16→固定8→固定16→16）・内部値（WeakMapへ保持する
    8/16の数値）・変数名・className（`is-local`/`is-auto`）・pointerdown処理・
    v0.22.2のsameRange修正は無変更
  - **ユーザー実機確認結果（完了・区切り）**: 紙面歌詞位置修正（罫線マス中央表示）・
    自動状態が8/16の数字のみ・固定状態が鍵アイコン＋8/16・自動/固定切替時に
    ボタンや歌詞セルが動かないこと・鍵アイコンの意味/モノクロ線画という方向性、
    いずれも実機確認OK。v0.22.2データ完全性修正・G4最終セルEnter移動の回帰もなし。
    **鍵アイコンの現在サイズ（4.5px）だけは実機で「小さすぎる」と判断された**。
    今回はサイズだけを追加調整せず、v0.22.3はここで一度区切る。鍵アイコンの
    意味・モノクロ線画という方向性は採用したまま、サイズ・線の見え方・数字との
    間隔・ボタン幅（現在の4.5px/16px等の数値）は最終仕様として固定せず、次の
    「フローター入力UIのデザイントーン調整」フェーズで、フローター全体の配色・
    枠線・背景・影・余白と合わせてまとめて評価・調整する。自動状態は数字のみ・
    固定状態だけ鍵を表示するという仕様自体、および内部ロジック（WeakMap・状態
    サイクル・IME処理等）は次フェーズでも変更しない前提とする
- `v0.22.4 フローター入力UIのデザイントーン調整`（実装・検証済み。commit/push未実施）
  - 背景: Codex GPT-5.6 Solが実コード・実DOM・computed style・ブラウザ上の一時CSS
    プレビューを使って設計した改善案を実装した。A案「ニュートラル・ミニマル」を
    基本に、B案のスレート系focus表現を統合。目標は洗練・大人っぽい・クール・
    シンプル・静かで落ち着いた印象、ポップ感の低減。操作性・情報構造・入力機能・
    自動/固定の内部状態は維持
  - **新規CSSトークン**: `.slot-overlay`直下へ`--slot-surface`(#f4f5f4)・
    `--slot-input-surface`(#ffffff。後述の見やすさ改善修正で#fbfcfbから変更)・
    `--slot-text`(#25292b)・`--slot-muted`(#62686b)・
    `--slot-subtle`(#687074)・`--slot-border`(#848c91)・
    `--slot-divider`(rgba(80,88,92,.22))・`--slot-focus`(rgba(74,101,126,.78))・
    `--slot-active`(#d5b06f)・`--slot-fixed`(#d9bf8b)・
    `--slot-fixed-border`(#9a754d)・`--slot-shadow`(0 14px 34px rgba(0,0,0,.36))を
    新設。`:root`・紙面共通トークン（`--primary-color`・`--paper-*`）は無変更
  - **フローター外枠**: 背景#fdfbf5→`--slot-surface`、外枠`2px solid #ff9f1c`（高彩度
    オレンジ）→`1px solid var(--slot-border)`（ニュートラルグレー）、角丸9px→8px、
    影`0 18px 48px rgba(0,0,0,.46)`→`--slot-shadow`（弱め）
  - **内部背景・入力面・区切り**: row-body・ストローク/歌詞グリッド・バルクpopover・
    各種input/selectの背景を`--slot-input-surface`へ、枠線を`--slot-border`/
    `--slot-divider`へ統一。暖色（`rgba(255,248,235,...)`等）の面積を除去
  - **hover / focus / 選択・固定**: 通常hoverはオレンジをやめてニュートラル
    （`--slot-divider`・`var(--slot-focus)`枠線）に統一。focus/focus-visibleは
    スレート系`--slot-focus`へ統一（入力欄・ストローク/歌詞セル・拍別ボタン・
    バルクボタン等）。8分/16分トグルの選択中（`is-active`）だけ低彩度ブロンズ
    `--slot-active`。拍別固定状態（`is-local`）は`--slot-fixed`/
    `--slot-fixed-border`。歌詞セルの`is-multi`下線・`is-composing`背景もオレンジ/
    黄色からニュートラル/スレートへ
  - **文字色・コントラスト**: `--paper-muted`/`--paper-faint`を参照していた補助文字・
    拍ラベル・セクション見出し・ヒント文言等を`--slot-muted`/`--slot-subtle`へ
    差し替え、拍別解像度ボタンの自動状態にかかっていた`opacity:0.65`（視認性低下の
    原因）を廃止。コード・歌詞・ドレミの色分け（`--paper-chord`/`--paper-lyrics`/
    `--paper-doremi`等。紙面と共通の意味付け）は無変更
  - **小節端境界**: `.dock-strum-cell.is-barend`等のオレンジ罫線を、境界の強弱階層
    （小節端＞拍頭＞8分＞16分）は維持したまま最も濃いニュートラルグレーへ
  - **鍵アイコンのサイズ調整**: v0.22.3で「小さすぎる」と判断されたサイズを、
    アイコン4.5px→6.5px・ボタン幅16px→19px・gap1px→1.5px・SVG stroke-width
    2.4→2.8へ拡大。高さ11px・4状態（自動8/自動16/固定8/固定16）間でのボタン外形
    寸法一致は維持。CSS mask方式・`currentColor`・`-webkit-mask`併記・Unicode
    絵文字不使用・自動状態は数字のみ表示・状態サイクル・title/aria-label・
    内部ロジックは無変更
  - **v0.22.4後修正1: フローター内部の見やすさ改善**（実装・検証済み）: ユーザー
    実機評価「内部が以前より見づらくなった」を受け、Fable計測（外側#f4f5f4と
    入力面#fbfcfbのコントラスト比が約1.06:1でほぼ無地、セクションチップ3.33:1、
    バルク注記3.73:1、IME変換中背景1.18:1、has-content歌詞セルのhover変化なし。
    いずれもWCAG輝度式で再計算し実測値と一致を確認済み）を踏まえ、色相は変えず
    明度・不透明度だけを調整した:
    - `--slot-input-surface`を#fbfcfb→#ffffffへ
    - `.slot-overlay-row-body`/`.dock-strum-grid`へ`box-shadow: inset 0 1px 2px
      rgba(37,41,43,.06)`を追加し「一段くぼんでいる」認識を付与
    - `.slot-overlay-row-label`（コード/ストローク/歌詞/ドレミ見出し）:
      `--slot-subtle`→`--slot-muted`
    - `.slot-overlay-section`（セクションチップ）・`.slot-overlay-bulk-lyrics-notice`
      （バルク注記）: 文字色を`--slot-text`へ（コントラスト3.33/3.73→9.67:1へ改善）
    - `.dock-lyrics-cell.is-composing`（IME変換中背景）: alpha 0.12→0.30
    - `.dock-lyrics-cell:hover`: `--slot-divider`と同値で`has-content`セルでは
      変化が見えなかったため`rgba(80,88,92,.34)`へ変更
    - フローター外枠・影・角丸・ブロンズ（active/fixed）・スレートfocus・
      鍵アイコン6.5px・拍別ボタン19px×11pxは無変更
  - **v0.22.4後修正2: フローター上端が固定ヘッダー裏へ入る問題の修正**
    （実装・検証済み）:
    - 根本原因: `clampLoupeY()`の上端下限`LOUPE_TOP_MARGIN`（固定8px）が画面左上
      固定の`#app-nav`（「← 戻る」/「🏠 TOP」。top:18px・高さ約39px・下端約57px）を
      考慮していなかった。加えて`initLoupeGeometry()`はアプリ起動直後・まだTOP画面で
      `#app-nav`が`hidden`化されている時点で1度だけ実行されるため、その時点の
      `getLoupeMinTop()`相当の計算はapp-navの高さを0として行われ、実際に譜面クルーズ
      画面でルーペが開かれる頃には既に無効なY座標が確定していた
    - 修正: `sheet-cruise.js`へ`getLoupeMinTop()`を新設。`#app-nav`の
      `getBoundingClientRect().bottom + 8`（非表示/未検出時は既存の
      `LOUPE_TOP_MARGIN`にフォールバック）を返し、`clampLoupeY()`がこれを上端
      下限として使うよう変更。加えて、実際にDOMへ座標を書き込む
      `applyLoupeGeometry()`の入口で`state.loupe.y = clampLoupeY(state.loupe.y)`を
      都度実行するようにし、ルーペが表示される瞬間（`renderSlotOverlayContent()`
      経由）に毎回、現在の`#app-nav`・viewportに合わせて再クランプされるようにした
      （ドラッグ・リサイズの呼び出し元は既にクランプ済みの値を渡すため冪等）
    - 実機確認: 意図的に不正な保存値（`{x:0,y:8,width:680}`）をappSettingsへ注入し、
      復元時に自動的にy=65（app-nav下端57px+8px）へ補正されること、大きく上方向へ
      ドラッグしてもy=65より上へ行けないこと、ウィンドウ高さ500pxへ縮小・900pxへ
      復元してもタイトルバーとapp-navの重なりが0のままであることを確認済み
    - `appSettings.barLoupe`の`{x,y,width}`形式・localStorage key・`schemaVersion`は
      無変更。ユーザーがドラッグした位置そのものはリセットせず、範囲外のときだけ
      補正する既存の`clampLoupeY`の設計をそのまま踏襲
  - **v0.22.4後修正3: 上部固定UI全体の再調査＋動的max-height**（実装・検証済み）:
    - commit前の再確認で、`#app-nav`だけでは不十分と判明。`.sheet-toolbar`
      （プロジェクト選択・新規・保存・印刷・JSON関連。`position:sticky; top:14px;`。
      DOM上は`<div class="sheet-toolbar">`、IDなし）は画面幅のほぼ全体
      （実測left:72.5〜right:1192.5、960px幅時）を占め、スクロールすると
      `top:14px`で画面上部に固定される。sticky固定化された状態の下端（実測約80px）は
      `#app-nav`の下端（57px）より低いことを確認した
    - 修正: `getLoupeMinTop()`を拡張し、`.sheet-toolbar`が表示されている場合は
      `getComputedStyle(toolbar).top`（CSSの固定位置。ハードコードせず動的取得）＋
      `getBoundingClientRect().height`（sticky固定時の下端相当。スクロール位置に
      よらず一定）を候補へ追加し、`#app-nav`の候補と合わせて最大値（＝最も下にある
      もの）を採用するようにした。スクロール位置を監視するような仕組みは追加せず、
      「将来スクロールされてsticky固定化された場合」を常に安全側として想定する
      単純な方式を採用（過剰な衝突判定を避けるため）。修正後の上端下限は88px
      （sticky-bottom80px+8px）
    - `max-height`の追加修正: 上端下限が8px→88pxへ上がったことで、CSS側の固定
      `max-height: calc(100vh - 16px)`のままでは下端がviewportを超えうると判明。
      `applyLoupeGeometry()`で`window.innerHeight - state.loupe.y -
      LOUPE_BOTTOM_MARGIN(8px)`を`el.style.maxHeight`として都度設定するよう変更
      （新規定数`LOUPE_BOTTOM_MARGIN=8`・`LOUPE_MIN_AVAILABLE_HEIGHT=160`を追加。
      極端に低いviewportでも最低160pxは確保し、ヘッダー・リサイズハンドル等の
      主要操作部にアクセス不能にならないようにした）。CSSの`max-height`定義自体は
      JS無効時のフォールバックとしてそのまま残置
    - 実機確認: 通常幅960px・狭幅680pxいずれでもスクロール後の重なり0、高さ500pxで
      `maxHeight:404px`（500-88-8）・下端がviewport内、高さ150pxの極端なケースでも
      `maxHeight:160px`（フォールバック下限）でヘッダー等にアクセス可能なことを確認。
      `document.elementFromPoint()`でタイトルバー中心点を検査し、フローターの
      z-index（40）が`.sheet-toolbar`（15）より高く、スクロールされていない初期状態
      （scrollY:0、`.sheet-toolbar`が通常フロー位置にある場合）でフローターの表示
      範囲と重なっても、フローター自体（タイトルバー含む）は常に手前に表示され
      隠れないことを確認した。この初期状態での重なりは「`.sheet-toolbar`の一部が
      フローターの背後に一時的に隠れる」という逆方向の現象であり、フローターを
      閉じれば解消する一時的な状態（v0.22.4以前から変わらない既存の重なり方）と
      判断し、今回はスクロール監視等の追加対応はしていない
    - **appSettings.barLoupeの検証時上書きについて**: 今回・前回の検証で意図的な
      ドラッグ・位置注入・リサイズを繰り返したため、`appSettings.barLoupe`が
      本来のユーザー設定ではなく検証操作の結果で上書きされていた
      （直前値`{x:0,y:88,width:680}`）。今回のタスク開始時点のスナップショット
      `{x:0,y:65,width:680}`へ復元した。ただし、この値自体も前回セッションの
      検証操作に由来する可能性が高く、それ以前の「本来のユーザー設定」を示す
      記録は会話ログ上に存在しないため、正確な原状回復はできていない
      （実害はない値だが、事実として記録する）
  - **v0.22.4後修正4: Safari実機でのフローターヘッダー横/縦スクロールバー同時発生の
    修正**（実装・独立レビュー相当の数値検証・ユーザーSafari実機確認すべて完了）:
    - 背景: ユーザーSafari実機から、ストローク編集後（「基本に戻す」ボタンが
      ヘッダーへ追加された状態）に全体8分/16分を切り替えると、フローターのヘッダー
      内へ横・縦スクロールバーが同時に出現し、上部が切れて見える不具合の報告が
      あった。Chromeでは再現しにくく、原因調査のため`sheet-cruise.js`へ一時診断
      コード（`window.__cruiseLoupeDebug`。`start()`/`stop()`/`clear()`/`get()`/`copy()`
      によるイベントタイムライン記録に加え、`measureOverflow()`/`copyOverflow()`で
      フローター本体・`.slot-overlay-head`・主要内部要素の寸法とcomputed overflowを
      詳細採取できるAPI）を一時的に追加した。`prepareLyricResolutionChange`・
      `finishLyricResolutionChange`・`applyLoupeGeometry`・`renderSlotOverlayContent`
      への観測用ログ呼び出し、全体解像度ボタンのpointerdown/mousedown/focus/click
      観測、`document`のfocusin/focusout・`window`/フローター自身のscrollイベント、
      MutationObserverによるDOM再構築の観測を含み、いずれもfocus/preventScroll/
      scroll位置/geometry適用/保存データには一切干渉しない読み取り専用の観測
      コードだった
    - ユーザーにSafari正常状態・不具合状態それぞれの`copyOverflow()`ログを取得して
      もらい比較した結果、原因は2段階と判明した:
      1. `.slot-overlay-head`のCSSに`overflow-x: auto`は指定されていたが
         `overflow-y`は未指定で、CSS仕様上「片方が`auto`でもう片方が`visible`の
         ままだと`visible`側も強制的に`auto`へ変換される」規則により、ヘッダーが
         意図せず縦スクロールも可能な要素になっていた
      2. ストローク編集で`bar.strumOverride`が立つと「基本に戻す」ボタン
         （`.slot-overlay-reset-btn`。幅約82px）がヘッダー操作列へ追加され、
         `.slot-overlay-head`のscrollWidthがclientWidth（680px幅時638px）を
         約31〜34px超過。Safari実機の通常型（実領域を消費する）横スクロールバーが
         ヘッダー高37pxのうち約15〜16pxを占有した結果、内部の操作列（高さ約30px）
         を収めるための実効clientHeightが22pxまで減り、1.で強制された
         `overflow-y:auto`と相まって操作列の上下がクリップされていた
    - 修正は2段階。まず`.slot-overlay-head`へ`overflow-y: hidden;`を追加し、CSS
      仕様上の強制`auto`化を断ち切って縦スクロールを恒久的に禁止（既存の
      `overflow-x: auto`はそのまま維持）。しかしこの修正だけでは横超過そのものが
      残るため、Chrome実測でも「基本に戻す」出現後に実際の横スクロールバー
      （`offsetHeight-clientHeight`が16px）が発生することを確認し、根本原因である
      横幅超過自体を解消する追加修正を行った。`.slot-overlay-head-actions`を
      `flex: 0 0 auto`から`flex: 1 1 auto; min-width: 0;`へ変更してヘッダー内の
      残り幅までは縮小できるようにしたうえで、主要操作ボタン群（`.slot-overlay-nav`・
      `.slot-overlay-res-toggle`・`.slot-overlay-reset-btn`・`.slot-overlay-bulk-toggle`・
      `.slot-overlay-close`）には個別に`flex-shrink: 0`を指定して縮小対象から除外し、
      縮小先を補助文言`.slot-overlay-hint`（「Alt+←/→で移動」）1つだけに集中させた
      （`overflow:hidden; text-overflow:ellipsis; flex-shrink:1; min-width:0;`）
    - Chrome実測: 680px幅・ストローク編集後・全体8→16→8切替後のいずれでも
      `head.scrollWidth === clientWidth`（638=638、超過0px）、
      `offsetHeight-clientHeight`が16px→1px（borderのみ）、
      `clientHeight === scrollHeight === 36px`（縦超過なし）を確認。960px幅では
      補助文言は全文表示のまま変化なし（flex-shrinkは実際に幅不足時のみ作動）。
      680px未満の狭幅（既存の`isNarrowViewport()`によるフローター幅クランプ）では
      横スクロールが発生しうるが、これは今回のスコープ外の既存挙動であり、
      縦クリップが発生しないことは確認済みで悪化させていない
    - ユーザーSafari実機確認: Cmd+R再読み込み後・680px付近表示・ストローク編集後の
      「基本に戻す」表示・全体8分/16分切替のいずれの条件でも、横スクロールバーが
      出ない・ヘッダー上部が切れない・主要ボタンがすべて操作できる・補助文言の
      省略表示は許容、という結果で1〜8すべてOKの実機承認を得た
    - 一時診断コード完全削除: 原因特定・修正効果の確認に使った一時診断コード
      （`LOUPE_DEBUG`ブロック全体、`window.__cruiseLoupeDebug`、
      `measureOverflow()`/`copyOverflow()`、`prepareLyricResolutionChange`・
      `finishLyricResolutionChange`・`applyLoupeGeometry`・`renderSlotOverlayContent`・
      `buildResolutionToggle`・`init()`への観測用呼び出し、document/window/フローター
      自身への観測用listener、MutationObserver）は、ユーザー実機承認後に
      `sheet-cruise.js`から完全に削除済み。`grep -n "LOUPE_DEBUG\|cruiseLoupeDebug\|
      loupeDebug\|measureOverflow\|copyOverflow" sheet-cruise.js`が0件であることを
      確認済み。本来のfocus/render/geometry/解像度切替ロジック・既存の本番イベント
      リスナーは削除前後で一切変更していない（削除後のファイル行数2785行が、
      診断コード追加前の行数と完全一致することで裏付け済み）。本番差分には
      診断APIを残さない
  - 変更ファイルは`theme.css`・`sheet-cruise.js`（`getLoupeMinTop()`新設・拡張・
    `clampLoupeY()`/`applyLoupeGeometry()`の修正、新規定数2つの追加。診断コードは
    最終的に完全削除済み）・`index.html`のバージョン参照・`song-model.js`の
    バージョン行。`theme.css`は上記に加え、後修正4のヘッダーSafari対策
    （`.slot-overlay-head`の`overflow-y:hidden`、`.slot-overlay-head-actions`の
    flex縮小許可、主要ボタン群の`flex-shrink:0`、`.slot-overlay-hint`のellipsis
    縮小）を含む。DOM構造・入力ロジック・保存データ構造・`sheet-renderer.js`・
    `print.css`・`schemaVersion`は一切変更していない

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
  先頭歌詞セルへ移動する。**G4で実装済み**（`commitLyricCellAndMoveToNextBar`。
  正規順序でセクション境界も越える。曲全体の最終小節では移動せず現在のセルに留まる）

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

1. v0.22.4実機確認（ユーザーによる目視確認。通常幅約960px・狭幅約680pxでの表示、
   外枠オレンジ廃止・暖色面積減少・ポップ感低減・大人っぽさ/クールさ、hover/focus/
   選択・固定状態の判別、鍵アイコンの明確さ、コントラスト、既存操作・G4・v0.22.2・
   ドラッグ/リサイズ/バルク操作の回帰なし、印刷への影響なし。加えて後修正1
   （入力面の見やすさ・コントラスト改善）と後修正2（フローター上端が固定ヘッダー
   `#app-nav`の裏へ入らないこと。初回表示・ドラッグ・保存位置の復元・リロード・
   ウィンドウ高さ変更後のいずれでも）の実機確認。**後修正4（Safariヘッダー横/縦
   スクロールバー同時発生の修正）はユーザーSafari実機確認・一時診断コード削除まで
   完了済み**。残るv0.22.4全体（デザイントーン調整本体・後修正1〜3）の実機確認が
   未完了であれば、そちらを先に完了させる）
2. v0.22.4 commit
3. v0.22.4 push
4. 次タスク候補: 長文歌詞セルの表示方針検討（4文字以上を1セルへ入れると隣接セル・
   隣接小節と重なりうる。候補案: あふれセルだけフォント縮小／ellipsis／クリップ／
   モーラ分割の入力案内強化。今回はどれも未実装）
5. 次タスク候補: ストローク段（`.sheet-bar-strum`）の同種座標差の確認・要否判断
   （Fable 5が潜在的な問題を指摘。今回のv0.22.3では歌詞段のみ修正し、ストロークは
   一切変更していない）
6. G3: ストロークの行別/拍別8分/16分切替（G2bの`prepareLyricResolutionChange`等の
   仕組みを再利用。ストロークは`bar.strumOverride`の単一slots配列構造のため、
   歌詞と同じ形でそのまま流用できるかは要検討）
7. F2b: 貼り付けの自動展開、既存全文の自動分割（明示操作のみ）、小節をまたぐ自動移動、
   「セルへ割り当て」ボタン等の新しいまとめて配置方式、行間の上下矢印移動
8. F3: ドレミのtick位置セル編集（`setBarMelodySlot` 相当。`barNeedsSixteenthResolution` に
   `melody` を統合。ドレミのセル化時はG1の拍グループ機構をそのまま適用する）
9. F4: まとめて入力の自動分解配置の総仕上げ、整合仕上げ
10. 拍単位コード編集を実装する場合も、G1の拍グループ機構（`populateBeatGroups`）を
    そのまま適用する
11. 上記UI再編（D1〜D3a・F1・F2a〜F4・G1〜G3）が落ち着いた後に本格記譜
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

- v0.22.3実機検証で発見（未修正・次タスク候補）: ルーペ幅が狭小フォールバック
  （680px未満のビューポートで強制される約280px幅）の状態で16分割の歌詞セルを
  表示すると、`.dock-lyrics-cell`の意図的な`min-width: max(18px, calc(24px *
  var(--bar-loupe-scale, 1)))`設計（最小タッチターゲット確保のため）により、
  1拍4セル×18px=72pxが要求され、拍グループ（`.dock-lyrics-beat-cells`。
  `min-width:0`は設定済みだが子セル自体のmin-widthが優先される）の幅を超えて
  overflowする。通常のルーペ幅（980px前後）では問題なく、拍別解像度ボタンとの
  重なりも最終セルのみ約9.4%に収まることを確認済み。`buildLyricsGridRow()`・
  `.dock-lyrics-cell`は複数回のUI調整作業で変更禁止指定されてきたため未修正のまま。
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
