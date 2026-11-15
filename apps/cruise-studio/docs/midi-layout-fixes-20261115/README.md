# 継続コードMIDI・長い曲の表示設定 — 0.127.1-dev.1

基準: `ad76a408` / 0.127.0-dev.1。修正候補のみ。正式版0.88.1、公開HTML、本番配信、Account/Sync、既存アプリのコードは変更していない。既存のloopback入口 `http://127.0.0.1:18874/` を使用した。ユーザーのブラウザ保存データは使用せず、外向き通信を遮断した隔離コンテキストと合成Projectで確認。

## 継続コードのMIDI欠落

原因: ギターMIDIのvoicing展開が「その小節内のコードイベント」だけを検索していた。前小節から続くコードはストロークイベントに存在しても、フォームを解決できずギターノートが欠落した。

音声とMIDIで同じ読み取り専用の和声タイムラインを使用する。コード欄が空の小節では直近イベントのフォームBindingを参照する。明示durationの終了、新しい未解決イベント、未確認フォームは境界として扱い、古い確認済みコードで穴埋めしない。小節途中のコード変更時には旧ノートをそこで切る。フォームの資格判定は維持し、1回の同期出力中だけ判定結果を再利用する。Project、Session、Undo、保存データ、schemaは変更しない。

新しい4件のNode試験では、4小節の継続、途中変更、明示終了、未解決/未確認、無入力の先頭を確認。実MIDIのトラック内Note On数も照合。Chrome・WebKitの既存開発用Pre-DTMワークスペースで、実際のMIDIボタンからダウンロードし、継続小節を含むギターノート数と照合した。Coming soonの公開ナビゲーションは変更していない。

共有タイムラインをMIDIモジュールの依存に追加したため、ローカルpackageスクリプトのソース一覧に `score-harmony.mjs` を1件追加（204→205）。依存ファイルの同梱テストも更新。公開packageの生成・配信や本番設定変更は行っていない。

## 表示設定の高速化

原因: スライダー入力のたびに、譜面本体と見本の全DOM・全フォームSVGを再生成し、全SVGに継承されるCSS変数も書き直していた。

文字サイズ・フォント・色・罫線・見出し表示は既存要素に反映する。小節配置、フォームサイズ、表示トラックが変わる時だけ構造を再生成。文字の変数は対象行に置き、無関係なSVGへのスタイル再計算を抑制した。同値のstyle/class書き込みを省き、サイズ追従は1フレームにまとめ、フォームSVG文字列は内容と指表示ごとに最大256件まで再利用する。新しいフォーム内容では古いキャッシュを使わない。

128小節のブラウザ試験で、文字サイズ・色・線幅の変更時に描画呼び出しが0回で、譜面/見本/SVGの同じ要素が保持され、実際の表示にも反映することを確認。小節配置変更時は再生成。キャンセル・保存・再度開く操作、Project/Undo不変もChrome・WebKitで確認。

### 同条件計測

Chrome、1440×1000、フォーム表示あり。コード文字サイズ17→21の5連続操作について、input発火から強制layout完了までを測定した中央値。旧データは前回レビューの記録を保持し、新記録は別ファイルに保存。

| 小節数 | 修正前 | 修正後 |
|---|---:|---:|
| 12 | 23.1 ms | 5 ms |
| 128 | 205.4 ms | 35 ms |
| 256 | 402.7 ms | 69.9 ms |

256小節では約5.8倍。単一PC・合成曲の観測で、モバイル性能やSafari実機を保証する値ではない。初回表示・フォーム拡縮・小節配置変更では全DOMを作るため、そこは未最適化。仮想表示は導入していない。

## 検証結果

- Chrome譜面回帰: 122件成功。
- WebKit譜面の設定・フォーム・再生回帰: 18件成功。
- 実Web Audio／ローカル入口: 5件成功。
- 新規MIDIボタン出力: Chrome・WebKit各1件成功。
- 新規128小節の描画保持・設定反映: Chrome・WebKit各1件成功。
- 全Node: 2,126成功、39失敗、5スキップ。失敗名は基準ad76a408の既存39件と完全一致し、新規失敗なし。全試験成功とはしていない。
- 公開version/cache/package依存の関連試験も成功。コードの変更はStudio内のみ。

Safari実機・OS印刷・実アカウント本棚は今回の確認対象外。

生計測: [layout-metrics.json](layout-metrics.json) / [検証集計](verification.json) / [128小節の設定画面](layout-128-bars.png)。

## 今回のコミット対象ファイル

使用モデル: Sol / 推論: 高。以下の21ファイルを対象とする。

- `apps/cruise-studio/ai-handoff/PROJECT_STATE.md`
- `apps/cruise-studio/js/modules/pre-dtm-cruise/guitar-voicing.mjs`
- `apps/cruise-studio/js/modules/sheet-cruise/README.md`
- `apps/cruise-studio/js/modules/sheet-cruise/paper-appearance.mjs`
- `apps/cruise-studio/js/modules/sheet-cruise/paper-forms.mjs`
- `apps/cruise-studio/js/modules/sheet-cruise/paper-layout.mjs`
- `apps/cruise-studio/js/modules/sheet-cruise/score-playback.mjs`
- `apps/cruise-studio/js/modules/sheet-cruise/sheet-cruise.js`
- `apps/cruise-studio/scripts/local-ui-entry.mjs`
- `apps/cruise-studio/scripts/measure-score-layout.cjs`
- `apps/cruise-studio/scripts/package-port-pc.mjs`
- `apps/cruise-studio/tests/paper-forms.test.mjs`
- `apps/cruise-studio/tests/pro-edition.test.mjs`
- `apps/cruise-studio/docs/midi-layout-fixes-20261115/README.md`
- `apps/cruise-studio/docs/midi-layout-fixes-20261115/layout-128-bars.png`
- `apps/cruise-studio/docs/midi-layout-fixes-20261115/layout-metrics.json`
- `apps/cruise-studio/docs/midi-layout-fixes-20261115/verification.json`
- `apps/cruise-studio/js/modules/sheet-cruise/score-harmony.mjs`
- `apps/cruise-studio/tests/guitar-midi-continuation.browser.cjs`
- `apps/cruise-studio/tests/guitar-midi-continuation.test.mjs`
- `apps/cruise-studio/tests/paper-layout-performance.browser.cjs`
