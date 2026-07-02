# プレDTMクルーズ（pre-dtm-cruise）

Phase 5 で実装予定のモジュール。譜面クルーズと同じ StudioProject から伴奏MIDIを生成する。

- アコギストローク（chords × strumPatterns）
- ベースのルート音8分（chords のルートから）
- ドラム8ビート（BPM・拍子から）
- Web Audio 試聴 / SMF(.mid) 書き出し

設計は `../../../APP_CONCEPT.md`（3章）と `../../../ROADMAP.md`（Phase 4/5）を参照。
「MIDIは曲データの変換」という中心思想のとおり、生成は StudioProject → 発音イベント列の純関数として実装すること。
