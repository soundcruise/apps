# プレDTMクルーズ（pre-dtm-cruise）

譜面クルーズと同じ StudioProject から伴奏イベントを生成し、DAWへ持っていく前段を担うモジュール。

## 現状（v0.6.0 実用の入口）

- `arrangement-engine.js` — StudioProject + 伴奏設定 → 伴奏イベント列の**純関数**生成
  - 伴奏設定: パートON/OFF、アコギ（曲の基本ストローク/8ビート標準/8ビート軽め/4分刻み ×
    アクセント3段階）、ベース（ルート8分/ルート4分/ルート＋5度）、ドラム（8ビート/4つ打ち/シンプル）
  - 各イベントは part / role / barNumber / absoluteTick / tickInBar / durationTicks /
    velocity / chordSymbol を持ち、ベース・ドラムは MIDIノート番号まで持つ
  - コード未入力の小節は直前コードを継続（リードシート慣習）
- `midi-export.js` — **SMF Type 1 の最小エンコーダ（自前実装・外部ライブラリなし）**
  - Track 0=メタ（曲名/テンポ/拍子）、Track 1=ベース（ch1）、Track 2=ドラム（ch10）
  - アコギはボイシング展開が未実装のため書き出し対象外（ADR-015。画面に明記）
  - `inspectSmf()` でダウンロード前にバイト構造を自己検証
- `pre-dtm.js` — 画面UI: プロジェクト読み込み・伴奏設定・生成プレビュー・
  伴奏JSON書き出し（settings/parts/全イベント/警告を含む）・.mid 書き出し
- 伴奏設定は `cruiseStudio.appSettings` に保存（曲データを汚さない。ADR-014）
- 音はまだ鳴らさない（ADR-013）

## 将来（Phase 5拡張）

- アコギのボイシング展開 → guitar イベントに `midiNotes[]` → MIDIトラック追加
- Web Audio での簡易試聴
- プロジェクト固有アレンジの保存（arrangement フィールドへ移行・schemaVersion 2）

設計は `../../../APP_CONCEPT.md`（3章）と `../../../ROADMAP.md`（Phase 4/5）を参照。
「MIDIは曲データの変換」の思想どおり、生成は純関数のまま保つこと（プロジェクトを変更しない）。
