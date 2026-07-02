# クルーズスタジオ — ロードマップ

各フェーズは「完了条件」を満たしてから次へ進む。
フェーズ途中で設計を変えたくなったら docs/DECISIONS.md に記録してから変える。

## Phase 1: 母艦＋背骨（本フェーズ）

- ディレクトリ `apps/cruise-studio/` 新設
- 設計ドキュメント4本（APP_CONCEPT / DATA_MODEL / ROADMAP / docs/DECISIONS）
- 母艦TOP（index.html + theme.css。Clean Pro系・PCファースト）
- `js/core/song-model.js`（生成・検証・マイグレーション）
- `js/core/storage.js`（localStorage + JSON入出力）
- `js/core/music-theory.js`（キー変換の土台）

**完了条件**: ブラウザで母艦TOPが表示され、コンソールエラーなし。
サンプルプロジェクトの生成→保存→一覧→書き出し→読み込みが動く。
既存アプリ・shared に変更ゼロ。service-worker / manifest / PRO認証なし。

## Phase 2: 譜面クルーズMVP

- `js/modules/sheet-cruise/` に編集画面を実装
- 曲情報フォーム（title / artist / ORGキー / Playキー / カポ / BPM / 拍子 / 基本ストローク）
- セクション追加・削除・並べ替え、小節数の指定
- 小節グリッド編集: コード入力（テキスト→パース検証）、歌詞の音節割当、ドレミ入力（16分グリッド量子化）
- 譜面プレビュー（簡易版でよい。A4固定はPhase 3）
- 母艦TOPの「譜面クルーズ」カードから遷移

**完了条件**: 架空のサンプル曲を最初から最後まで入力でき、
入力内容が StudioProject として保存・復元できる。

## Phase 3: 保存/PDF/テンプレート

- A4固定サイズ（794×1123px ≒ A4@96dpi）の紙面レンダリング
- `print.css`（@media print。画面プレビュー＝印刷結果）
- 表示トグル（コード / 歌詞 / ドレミ / ストローク）の反映
- JSONエクスポート/インポートのUI仕上げ、テンプレート（空の教材フォーマット）
- 手元の参考レイアウト（マリーゴールドPDF）と**構造の再現度**を目視比較する
  （※既存曲のデータは repo に入れない。検証はローカルの一時入力で行う）

**完了条件**: ブラウザ印刷で1枚のA4教材コード譜が出力でき、
ヘッダー・コードグリッド・コード＋歌詞＋ドレミ段が参考PDFと同等の構造で並ぶ。

## Phase 4: プレDTMクルーズ用内部データ整備

- strumPatterns の音価・アクセントをMIDI発音情報として確定
- `music-theory.js` の階名→MIDIノート変換と単体検証
- arrangement 設定の拡張（パターン選択・オクターブ・ベロシティ方針）
- 必要なら schemaVersion を上げ、migrateProject を実装

**完了条件**: StudioProject から「発音イベント列（ノート・開始tick・長さ・ベロシティ）」を
純関数で導出できる（音は鳴らなくてよい）。

## Phase 5: プレDTMクルーズMVP

- `js/modules/pre-dtm-cruise/` 実装
- アコギストローク / ベースルート8分 / ドラム8ビートの生成
- Web Audio での試聴（簡易音源でよい）
- SMF(.mid) 書き出し（format 1、パート別トラック）

**完了条件**: 譜面クルーズで作った曲の .mid を DAW（Logic等）で開き、
コード進行どおりの伴奏が鳴る。

## Phase 6: 五線譜/TAB/MusicXML

- VexFlow を `vendor/` に取り込み（rhythm-cruise の前例に倣う）
- メロディの五線譜表示、コードダイアグラム、TAB表示
- MusicXML書き出し（Guitar Pro 橋渡し用）

**完了条件**: メロディが五線譜で表示され、MusicXML が MuseScore / Guitar Pro で開ける。

## Phase 7: 既存アプリ連携

- 母艦TOPから音感 / 指板 / リズムクルーズへのリンク起動
- URLパラメータでの練習コンテキスト受け渡し検討（例: BPM）
- **既存アプリ側には一切変更を加えない**。既存側の改修が必要な連携は別途合意してから

**完了条件**: スタジオ内から3アプリを開ける。既存アプリのdiffがゼロ。

## Phase 8: PRO版/認証/feature flag

- `pro_<ランダム文字列>/index.html` を追加し `../../shared/pro-gate.css` / `pro-gate.js` に接続
- `window.__SOUNDCRUISE_PRO_GATE__`（passwordHash / gateVersion）をインライン定義
- PRO機能の featureFlags 設計（`cruiseStudio.appSettings` 側。曲データには入れない）
- PRO_FEATURES.md / MODULES.md の作成はこのフェーズで

**完了条件**: 既存3アプリと同じパスワード・同じ解錠状態（soundCruiseProAuth）で
スタジオPRO版に入れる。shared のdiffがゼロ。
