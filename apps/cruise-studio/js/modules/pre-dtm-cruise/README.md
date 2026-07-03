# プレDTMクルーズ（pre-dtm-cruise）

譜面クルーズと同じ StudioProject から伴奏イベントを生成するモジュール。

## 現状（v0.5.0 MVP骨格）

- `arrangement-engine.js` — StudioProject → 伴奏イベント列の**純関数**生成
  - アコギ: コード × ストロークパターン（stroke/accent/velocity付き）
  - ベース: ルート音（オンコードはベース音）の8分弾き（noteName/midi/velocity付き）
  - ドラム: 基本8ビート（kick/snare/hihat、GMノート番号付き）
  - コード未入力の小節は直前コードを継続（リードシート慣習）
- `pre-dtm.js` — 画面UI: プロジェクト読み込み・パート一覧・小節ごとの生成プレビュー・伴奏JSON書き出し
- 音はまだ鳴らさない（生成イベント確認を優先。docs/DECISIONS.md ADR-013）

## 将来（Phase 5本実装）

- SMF(.mid) 書き出し（生成イベントは絶対tick・MIDIノート番号・ベロシティ持ちで、そのまま変換できる）
- Web Audio での簡易試聴
- ギターのボイシング展開、パターンバリエーション

設計は `../../../APP_CONCEPT.md`（3章）と `../../../ROADMAP.md`（Phase 4/5）を参照。
「MIDIは曲データの変換」の思想どおり、生成は純関数のまま保つこと（プロジェクトを変更しない）。
