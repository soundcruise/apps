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

- 最新push済みcommit:
  - full hash: `d06398224ccb254d2102214c424a66cc96599950`
  - short hash: `d0639822`
  - commit message: `譜面クルーズの編集レイヤーに小節別ストローク入力を追加`
  - 内容: `v0.14.0 / R2` までリモート反映済み
- クルーズスタジオの最新push済みcommit:
  - full hash: `d06398224ccb254d2102214c424a66cc96599950`
  - short hash: `d0639822`
  - commit message: `譜面クルーズの編集レイヤーに小節別ストローク入力を追加`
  - 内容: `v0.14.0 / R2` までリモート反映済み
- `main` と `origin/main` は同期済み。
- クルーズスタジオ側の未commit差分は、R3実装分のみを想定する。
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

## 5. 現在作業中のフェーズ

### R3: コード＋ストローク段の文字ベースリズム譜表示改善

- 予定バージョン: `v0.15.0`
- 実装・検証済み。
- commit / push はまだ未実施。
- 主な内容:
  - VexFlow / 五線譜 / 正規休符 / タイ曲線 / MusicXMLはまだ導入しない。
  - 既存の文字ベース表示（↓ / ↑ / ・ / 〜 / x）を読みやすく整形する。
  - ストローク段に8分/16分の識別classと記号種別classを付ける。
  - コード段直下の余白、休符/伸ばし/ミュートの濃淡、画面/印刷サイズを調整する。
  - showStrum OFF時はストローク段を生成せず、不自然な余白を残さない。
  - タイミンググリッドON/OFFと共存する。
  - overlay編集、小節移動、まとめて入力、保存/復元、JSON、プレDTM、MIDI既存経路を壊さない。
  - `schemaVersion` は1のまま。

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

1. R3 commit
2. R3 push
3. 次フェーズ検討（本格記譜 / VexFlow / 五線譜 / MusicXML）
4. メロディ五線譜
5. MusicXML / PDF品質向上

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
