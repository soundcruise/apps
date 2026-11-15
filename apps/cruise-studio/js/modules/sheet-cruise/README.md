# 譜面クルーズ

ローカル開発候補は `0.127.1-dev.1`、正式製品版は `0.88.1`。
継続コードMIDIと長い曲の表示設定の修正・検証は [修正記録](../../../docs/midi-layout-fixes-20261115/README.md) を参照。
音質・UIの全体レビューと残件は [2026-11-15レビュー](../../../docs/STUDIO_AUDIO_UI_REVIEW_20261115.md) を参照。

- 入力: 曲情報、セクション、小節編集、拍内の複数コード、ストローク、歌詞、ドレミ／ピアノ入力。
- 正本: schema2 StudioProjectとEditing Session。旧Projectは原文を保持し、明示保存前に書き換えない。
- 表示: A4コード譜、五線プレビュー、登録フォーム、表示設定。表示設定はブラウザ内のAppSettingで、曲JSONには含めない。
- 再生: 選択小節から全曲、編集カードの1／2小節、コード進行、単独フォーム、メロディ。登録フォームの使用弦を共通に参照する。
- 音声: `score-playback.mjs` が再生イベントを生成、`chord-audition.mjs` がフォームと弦順を解決、`sheet-cruise.js` の既存Coordinator管理下のWeb Audioが発音する。
- ローカル入口: `python3 apps/cruise-studio/scripts/serve-local-ui.py` → `http://127.0.0.1:18874/`。合成データ専用で、本番認証・Account/Syncの確認入口ではない。

実機Safari、OS印刷、聴感評価、実アカウント本棚接続の確認状況は最新レビューを参照する。公開HTML、正式バージョン、配信allowlistの変更や公開は別作業。
