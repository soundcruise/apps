# Cruise Studio Project State

## 0. AIエージェントへの最初の指示

- 作業開始時は、この `PROJECT_STATE.md` を最初に読む。
- 次に `AI_WORKFLOW.md` を読む。
- `git status -sb` を必ず確認する。
- 今回の作業範囲を明示してから作業する。
- 不明点があれば、実装前にユーザーへ質問する。
- commit / push はユーザーの明示指示がある時だけ行う。
- `git add .` は禁止。stageする場合は対象ファイルを個別に明示する。

## 1. 現在の最新状態

- 最新push済みcommit:
  - full hash: `847eccce8692aebe8f73980bbce4b04103dcf6b7`
  - short hash: `847eccc`
  - commit message: `補正テスト動画リンクの時間表記を追加`
  - 内容: リポジトリ全体の最新push。クルーズスタジオ側の最新push済み機能は `v0.10.0 / S1b`
- クルーズスタジオの最新push済みcommit:
  - full hash: `fdb83837d2f144c5b37fb2839cbe853a39bf0ede`
  - short hash: `fdb8383`
  - commit message: `譜面クルーズに小節選択と編集レイヤー土台を追加`
  - 内容: `v0.10.0 / S1b` までリモート反映済み
- `main` と `origin/main` は同期済み。
- `apps/rhythm-cruise/rhythm-cruise-icon-proposal.png` と
  `apps/rhythm-cruise/rhythm-cruise-icon-proposal.svg` は未追跡のまま触らない。
- 状態管理ドキュメント commit 後は、未追跡として残る想定は rhythm-cruise のアイコン案2件のみ。

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

## 5. 現在作業中のフェーズ

### S1c: 歌詞・ドレミ入力を本番overlayへ移植

- 予定バージョン: `v0.11.0`
- 実装・検証済み。
- commit / push はまだ未実施。
- 主な内容:
  - 選択中小節overlayに `lyrics` 入力欄を追加。
  - 選択中小節overlayに `doremi` 入力欄を追加。
  - 既存 `bar.lyrics` / `bar.melody` 構造へそのまま反映。
  - A4紙面を即時更新。
  - 既存カード型入力UIとも同期する。
  - IME入力中のキー操作が小節選択と競合しないように分離。
  - overlayは引き続き印刷/PDFに出さない。
  - 選択状態や編集中UI状態は保存データに入れない。
- `S1e`: コード入力のoverlay統合は後続フェーズ。
- `R2`: 小節別ストローク上書きUIは後続フェーズ。

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

1. S1c commit
2. S1c push
3. S1d: まとめて入力・Alt移動
4. S1e: コード入力をoverlayへ統合
5. R2: ストローク行を編集レイヤーに追加、小節別 `strumOverride` UI
6. R3: VexFlow等によるコード+リズム譜の記譜表示
7. メロディ五線譜
8. MusicXML / PDF品質向上

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
- 小節別ストローク上書きは `bar.strumOverride` で行う予定。
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
- 小節ごとのストローク上書きUIは未実装。
- overlayのコード入力は未実装。
- overlayのストローク入力 / 小節別 `strumOverride` は未実装。
- S0プロトタイプは本番に未統合。
- メロディ五線譜は未実装。
- コード+リズム譜の五線譜化は未実装。

## 10. 次のAIへの指示

- このファイルを読んだ後、`AI_WORKFLOW.md` を読む。
- `git status -sb` を確認する。
- 現在の未commit差分を確認する。
- 未commit差分がある場合は、それを勝手に変更せず、まず報告する。
- ユーザーに確認せずcommit / pushしない。
- 触ってよい範囲を明示してから作業する。
