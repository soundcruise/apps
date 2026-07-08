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

**進捗**:
- Phase 2A（実装済み）: 画面遷移・共通ナビ・曲情報フォーム・キー関係チェック・保存/復元
- Phase 2B（実装済み）: セクション管理・小節グリッド（1小節1コード・警告のみ検証・4/4前提。ADR-008）・簡易コード譜プレビュー
- Phase 2C（実装済み）: 歌詞入力（tick:0単一イベント）・ドレミ入力（melodyイベントへ正規化。ADR-009）・プレビューの3段表示（コード/歌詞/ドレミ）・ツールバー
- 残: 音節/16分tick単位の歌詞・ドレミ詳細編集、基本ストロークパターンの選択UI

**完了条件**: 架空のサンプル曲を最初から最後まで入力でき、
入力内容が StudioProject として保存・復元できる。→ **MVPとして達成（v0.4.0）**

## Phase 3: 保存/PDF/テンプレート

- A4固定サイズ（794×1123px ≒ A4@96dpi）の紙面レンダリング
- `print.css`（画面プレビュー＝印刷結果）
- 表示トグル（コード / 歌詞 / ドレミ / ストローク）の反映
- JSONエクスポート/インポートのUI仕上げ、テンプレート（空の教材フォーマット）
- 手元の参考レイアウト（マリーゴールドPDF）と**構造の再現度**を目視比較する
  （※既存曲のデータは repo に入れない。検証はローカルの一時入力で行う）

**進捗**:
- v0.4.0: `print.css` 分離によるブラウザ印刷（譜面プレビューのみA4印刷。ADR-010）、
  譜面クルーズ画面からのJSON書き出し/読み込みUI
- v0.7.0: **A4固定紙面レンダラー**（`sheet-renderer.js`。画面794×1123px＋スケールフィット、
  印刷210mm。ページ/譜面行単位のDOMと改ページ制御。ADR-016）、
  表示トグル（コード/歌詞/ドレミ。sheetSettingsに保存）
- v0.8.0（S1a）: **紙面タイミンググリッド**（小節セル背面に拍・8分・16分の縦線。
  ON/OFFトグル＋8分/16分切替。16分イベントを含む小節は自動で16分表示。
  ONならPDFにも出る。`sheetSettings.showTimingGrid` / `timingGridResolution`。ADR-017）
- v0.9.0（R1）: **基本ストロークの記号入力と紙面ストローク段**（↓↑・〜x を
  `strum_custom_basic` パターンの slots へ正規化。コード段の直下に文字表示、
  グリッドと拍位置整合、`showStrum` トグル配線、PDF反映。プレDTMへは既存経路で自然反映。ADR-018）
- 残: 譜面上の直接スロット編集（S1b以降: 小節クリック選択・編集レイヤー・スロット入力）、
  小節ごとのストローク上書きUI（R2）、休符記号・タイ曲線の記譜表示（R3: VexFlow）、
  複数ページの明示分割、テンプレート、
  マリーゴールドPDFとの構造再現度の目視比較（ローカル一時入力で）

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

**進捗**（v0.6.0時点）:
- 実装済み（実用の入口）: 伴奏設定UI（パートON/OFF、アコギ=パターン3種＋曲の基本ストローク
  ＋アクセント3段階、ベース=ルート8分/4分/ルート＋5度、ドラム=8ビート/4つ打ち/シンプル。
  設定は `cruiseStudio.appSettings` に保存: ADR-014）、
  設定反映の再生成、**SMF Type 1 の .mid 書き出し（ベース/ドラム。自前実装＋自己検証: ADR-015）**、
  伴奏JSONの強化（settings・parts・全イベント・警告を含むDAW前の設計図）
- 残: Web Audio試聴、ギターのボイシング展開→アコギのMIDI化（Track 3追加）、
  パターンの拡充、プロジェクト固有アレンジ保存（schemaVersion 2）

**次フェーズのSMF拡張手順**（記録）: アコギのボイシング展開関数
（chordParsed → MIDIノート配列）を engine に追加 → guitar イベントに `midiNotes[]` を持たせる
→ `midi-export.js` の対象トラックに guitar を足す（構造は既にトラック追加だけで済む形）。

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

**進捗**:
- v0.5.0: シリーズランチャー画面（アプリ名・用途説明・注意書き・別タブリンク起動。
  iframe不採用、既存アプリ本体は無変更。ADR-012）
- v0.6.1: ランチャーにコードクルーズ（`../chord-cruise/`）を追加。既存アプリ本体は無変更のまま
- 残: URLパラメータでのコンテキスト受け渡し（既存側対応が必要になった時点で別途合意）

**完了条件**: スタジオ内から3アプリを開ける。既存アプリのdiffがゼロ。→ **達成（v0.5.0）**

## Phase 8: PRO版/認証/feature flag

- `pro_<ランダム文字列>/index.html` を追加し `../../shared/pro-gate.css` / `pro-gate.js` に接続
- `window.__SOUNDCRUISE_PRO_GATE__`（passwordHash / gateVersion）をインライン定義
- PRO機能の featureFlags 設計（`cruiseStudio.appSettings` 側。曲データには入れない）
- PRO_FEATURES.md / MODULES.md の作成はこのフェーズで

**完了条件**: 既存3アプリと同じパスワード・同じ解錠状態（soundCruiseProAuth）で
スタジオPRO版に入れる。shared のdiffがゼロ。
