# Studio 0.53.0候補: Port NEWSと4アプリの正規導線

2026-10-31。作業worktree: `codex/studio-ui-news-apps-20261031`。起点 `1cad09b5eccc90c1f1ec265a0bfef40d681a0052` に0.52.0候補のtracked差分・未追跡ファイルをハッシュ一致で複製した。元のUI、0.50.0、0.51.0、0.52.0候補は編集していない。0.53.0の変更はStudioとStudioテスト・文書に限定した。

## NEWS

Portの `index.html` の `#news` と `#news/cruise-apps/theme-colors`、`news-ui.js`、`news-article-ui.js`、`news-provider.js`、`news-data.js` を正本とする。Home・左ナビのNEWSは同一originのPort文書を `#news` で開く。記事一覧、カテゴリ選択、外部記事の別タブ、同梱記事の詳細・一覧復帰、公開停止・通信失敗の表示はPortに委ねる。Studioのフレームはホーム・戻る・設定への導線とPC幅を提供し、離脱・タブ非表示・Global Stop・pagehideで破棄する。以前のStudio独自NEWSは通常導線から外し、「NEWS概要」からのみ参照できる補助画面として維持する。

Port NEWSに明示的な更新ボタンはない。`#news` への入場時に公開GETを実行し、公開記事の失効時には画面側で再描画する。Operator向け編集・公開管理には一切接続しない。公開フィードは `NEWS_PROVIDER='api'` と `NEWS_API_BASE` に従う。2026-10-31の読み取り専用GET `/v1/news?limit=1&offset=0` はHTTP 200、`contractVersion:1`、1件の公開レコードを返した。この結果は実配信の到達確認に限り、Studioの本番originにおけるCORS・全ページ表示・公開停止制御の受入を意味しない。Browser試験では使い捨てcontextと合成フィードを使った。

## 4アプリ

Portの `cruise-app-links.js` をURL・アイコンの唯一のカタログとして読み込み、Studio Homeの通常版リンクとSeries画面の通常版・Pro版リンクへ適用する。各アプリは新しいタブで元のアプリそのものを開き、Studio内へコピー・全面埋込しない。

| アプリID | 通常版 | Pro版 | Syncの正本 |
| --- | --- | --- | --- |
| pitch | `/apps/pitch-cruise/standard/` | `/apps/pitch-cruise/pro_x9v7q2m8/` | `sync/pitch-sync-adapter.js`: `pitch`, schema 1 |
| fretboard | `/apps/fretboard_cruise/standard/` | `/apps/fretboard_cruise/pro_a9f4k7q2m8z/` | `sync/fretboard-sync-adapter.js`: `fretboard`, schema 1 |
| rhythm | `/apps/rhythm-cruise/standard/` | `/apps/rhythm-cruise/pro_r4m8k7n2q9x/` | `sync/rhythm-sync-adapter.js`: `rhythm`, schema 1 |
| chord | `/apps/chord-cruise/standard/` | `/apps/chord-cruise/pro_k7m4q9v2x8/` | `js/sync/sync-core.js`: `chord`, schema 1 |

保存・同期対象はアプリごとに独立する。Pitch managed keys: `pitchTrainerProData`, `pitchTrainerSettings`, `pitchTrainerProAccidentalDisplay`, `pitchTrainerStagingProMelodySlots`, `pitchTrainerStagingProChordSlots`, `pitchTrainerTestModeEnabled`, `pitchTrainerTestModeResults`。`baseHz` と `sustainTime` は端末内。Fretboardは `fretboard_cruise_state` を管理する。Rhythm managed keys: `rhythmCruiseSettings`, `rhythmCruiseCreatePresets:v1`, `rhythmCruiseCustomPresets:v1`, `rhythmCruiseStagePrefs:v1`, `rhythmCruiseClickSettings:v1`, `rhythmProCustomStageSamplesSeeded`。Rhythmのマイク/tapプリセット、Vex zoom、結果履歴は除外。Chordは `chordCruise.schemaVersion`, `settings`, `folders`, `libraryOrder`, `chords.index`, `chord.<id>` をローカルに持ち、Syncは `settings`, `folder`, `chord`, `library_order` のrecord型を使用する。いずれもPort datasetやStudio Projectと同一の保存集合ではない。

4アプリのPro HTMLは共有 `apps/shared/pro-gate.js` を使用する。正規Pro URLを開くことだけで資格を付与しない。Studioからの起動時の既存資格流用、再認証、Account所属・device generation、二端末Syncの結果は未受入。各アプリの既存gate/保存/同期コードは変更していない。

## 検証と未受入

- Studio Node: 1925/1925 PASS。
- Port全体Node: 1145/1149 PASS。4件は `theme.test.mjs` の旧NEWS badge配置と旧Dark CSS hashの期待値。厳密な現行Port期待値に更新した別パッチでは26/26 PASS。変更はUIラインに含めず 別途の保全パッチ に保全した。skipや期待値削除はない。
- Studio Browser: NEWS/4アプリ、Gear/My Apps、Practice、Metronome、Tuner、Home/NEWSの合同49件中48件PASS。1件は `TUNER_FAKE_AUDIO` 未指定によるテスト起動前失敗で、再実行18/18 PASS。譜面・Chord・PCツールの合同27件中26件PASS。残りのRhythm owner fixtureは `RHYTHM_OWNER_DIR` と `QA_DIR` がなく起動前失敗し、製品判定には含めない。Rhythm fixtureを除いた譜面・Chord・PCツール・cacheの再実行は32/32 PASS。
- 合成NEWSでPort単独とStudioフレームのカード見出し、カテゴリ選択肢、リンク先を比較して一致。カテゴリ絞込、外部タブ、同梱記事詳細、戻る、公開停止で全件非表示、不正配信で外部記事を復活させず同梱記事のみ表示、タブ非表示、再開、4テーマ、1440/390pxを確認。4アプリ各Standard/Pro 8件を新規タブで正規URLまで確認。実Pro gateの通過は試験しない。
- 実Pro資格、実Account、Safari、スマートフォン、二端末Sync、Production上のStudio NEWS表示、アプリ内操作・保存再読込は未受入。保存や画像への回帰は0.52.0候補の合成Browser試験で確認し、今回のNEWS・launcherが保存コードを変更していないことを差分監査した。

## Git依存と統合手順

`origin/main=5c07c7b3d05bc99153113f214babd3a161514bf1`。PR #56はOPEN Draft、head `a4d85ffa7b6fc23b2845fd21ed7e48af33f6162e`、固定base PR #55の `185038926ae9112ed914a18e9d31f0142a4b6d79`。PR #55はさらにPR #52へ依存する。PR #95はOPEN Draft、head `9c4a2601e45543190a56c186847060868f699e57`、Port tuner Browser fixtureのみ。UI dirty setとPR #56の累積変更には39ファイルの経路重複がある。PR #95は今回の変更と重複しない。

統合担当は(1)元4候補と0.53.0 snapshotのhashを確認し、(2)PR #52→#55→#56のbase/head固定関係を再確認し、(3)Cloud 0.49.1の別worktreeにUI差分をファイル/ハンク単位で移植する。`index.html`, `js/app.js`, `js/shell.js`, `js/port-data/*`, Studio cache version/tests/docsは衝突しやすい。Cloud `canWrite=false`、Project CAS/Outbox、Account/Pro/Workerを優先し、UIからのCloud権限変更はしない。移植後にStudio Node、Port Node、合成Chrome、native Cloud境界、二端末試験を独立に再実行し、UI一致とCloud機能を別判定にする。無検証のmerge/rebaseや同時writer解禁は行わない。

## PC実機総合受入

新規ブラウザプロファイルでStudio Home→NEWS→カテゴリ→外部記事→同梱記事→一覧→ホームを操作する。4テーマと通常/狭いPC幅で見切れ・focus・戻るを確認する。Seriesの4アプリそれぞれ通常版・Pro版を開き、URL・アイコン・元タブへの復帰・Pro gateを確認する。既存5ツールは設定変更/再読込とGlobal Stop、譜面/Pre-DTMは作成/編集/保存/再開を確認する。実Account/Proと二端末SyncはCloudラインの契約受入後に別枠で行う。
