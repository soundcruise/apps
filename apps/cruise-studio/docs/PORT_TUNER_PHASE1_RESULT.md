# Port 共通化 Phase 1: チューナー実装・次工程

作業日: 2026-10-31。対象は隔離 worktree `codex/studio-ui-tuner-20261031`。元の `codex/studio-ui-device`（`1cad09b5eccc90c1f1ec265a0bfef40d681a0052`）にあった未コミット 50 件、未追跡 9 件を patch/tar/manifest に保全してから複製した。元 worktree は未編集。`origin/main` は `5c07c7b3d05bc99153113f214babd3a161514bf1` で、この基準から Port と shared の差分はない。Studio 0.49.1 候補の #56 は `a4d85ffa7b6fc23b2845fd21ed7e48af33f6162e`、直接の基準 #55 は `185038926ae9112ed914a18e9d31f0142a4b6d79`。#56 単独の 48 変更ファイル中 37 ファイルが現在の UI 作業と重なる。特に `index.html`、tuner `panel.mjs`、component/version/cache、Port-data Host/connection、browser tests の統合が必要。#56 とその後続 PR を未検証のまま取り込まない。

## 採用した境界

Studio は `port-surface.js` で同一オリジンの Port Standard 文書を 1 frame 起動し、起動完了後に Port 自身の `#tuner` を選ぶ。Port の boot は初期 hash を正規化するため、frame URL に直接 `#tuner` を付けない。チューナーの DOM、検出器、設定保存、Pro 制限は Port が所有する。Studio は frame の生存期間、外側の幅・導線、音声排他だけを所有する。Studio の `portDataHost.canWrite=false` は維持し、Port frame が実行する正規保存と混同しない。譜面横の quick tuner は memory-only の補助機能として残し、正規チューナーへ進む導線を示す。

Port 側コードの diff は 0。Standard frame の入力レベル、弦別音、音名、周波数、メーター、入力閾値、11 種のチューニングとカポの Pro lock をそのまま提供する。Studio が `cruisePort.tuner` を直接書かず、Port の `tuner-store.js` が既存 v3 形式で保存する。`cruisePort.tunerMeterVisible` は端末内表示設定であり、Port managed Sync の対象に追加しない。

開いた時に Port がマイク取得を開始する。拒否時は Port のエラーと再試行ボタンを使う。Studio は quick tuner を閉じ、Dock など他の音声 lease が残れば起動を保留する。Global Stop 後に明示再試行できる。閉じる・Studio 画面遷移・タブ非表示・pagehide・Global Stop では frame を除去し、Port の pagehide で MediaStream を停止する。可視復帰時の自動再開は行わない。

## 機能ごとの次工程

| 順 | 機能と Port owner | Studio の現在地 | 次の実装単位 | 契約の保留 |
| --- | --- | --- | --- | --- |
| 1 | チューナー: `tuner-app.js`、`tuner-audio.js`、`tuner-preview-audio.js`、`tuner-engine.js`、`tuner-tuning.js`、`tuner-store.js` | Standard Port frame 実装済み | 実機の権限・Pro gate・戻る/履歴・同時タブを受入 | Pro 資格は Port gate owner。Sync は `cruisePort.tuner` v3 の既存経路 |
| 2 | メトロノーム: `metronome-app.js`、store/presets、authorization | Studio Dock は BPM 補助のみ | Port `#metronome` 文書を独立ワークスペースへ接続し、再生停止と preset UI を照合 | `cruisePort.metronome` v3、`metronomePresets` v1、Pro 詳細/プリセット |
| 3 | 練習メニュー・カレンダー: `practice-menu-app.js` と menu/sets/progress/history/calendar/timer/attachment stores | read-only 投影 | Port の練習 route を接続、追加・編集・削除・履歴・カレンダーを実操作で比較 | menus v3、sets v1、progress v3、history v5、calendar v2、schemaVersion v3、添付 binary/Pro |
| 4 | 機材リスト: `practice-menu-app.js`、gear/category/photo/export | read-only 投影 | Port route で編集・写真・並替え・売却・export を比較 | gearList v5、gearCategories v1、syncAssetMetadata v4、写真 IDB、Pro |
| 5 | My Apps: `practice-menu-app.js`、my-apps store/icon/launch | read-only 投影 | Port manage route で登録・編集・削除・起動を比較 | myApps v7、icon IDB、syncAssetMetadata v4、Standard 件数/Pro |
| 6 | NEWS: `news-provider.js`、`news-data.js`、`news-ui.js`、`news-articles.js` | Studio 独自の閲覧投影 | Port `#news` を正規入口にし、記事・戻る・配信状態を比較 | Port dataset 外、同期対象外 |
| 7 | 音感・指板・リズム・コードクルーズ: 各独立 app | 別タブ launcher | Standard/Pro 正規 URL、ホーム復帰、各 app の動作確認 | 各 app が保存/Pro/Sync を所有。Studio へデータ移植しない |

各機能は **UI 一致 / 操作一致 / 機能一致 / 設定保存 / Pro 判定 / 二端末同期** を別々に判定する。チューナーは Standard の最初の 4 項目を合成マイク browser で確認した。Pro は Standard 側の lock 表示と別タブ正規 URL までで、Studio frame 内の Pro 認証は未受入。二端末同期は未受入。ほかの機能は read-only 投影や launcher が存在しても完全一致と数えない。

## 同期・認証ラインへの要求

1. Port 共通データの writer を Port frame と Studio read-only Host が同一 origin・同一 profile で共存させた場合の契約を明示する。`canWrite=false` の解除は UI line で行わない。Port が書く既存 key/schema と Port dataset CAS/outbox をそのまま用い、Studio Project schema2 の同期とは別の完了条件にする。
2. `cruisePort.tuner` を含む managed keys と `tunerMeterVisible`、`gearGridColumns`、`practiceTimer`、`practiceMenuSetSelection` 等の端末内 keys の境界を固定し、二端末・同時タブ・オフライン・CAS stale・outbox retry・Account 切替の試験を提供する。添付/写真/icon binary は別途 IDB/R2 と metadata の整合を検証する。
3. Port Pro gate の server-issued 資格、generation/失効、device-bound session を Pro frame でも使用できるか検証する。URL/画面上の版表示を認可根拠にしない。Studio へ Pro 資格や4桁照合を実装しない。
4. Port owner は frame 起動時の migration/write、hash/History、permission prompt、pagehide 音声停止、Service Worker scope、download/添付を確認する。問題がある route は正規 Port 別タブへ導く。
5. PR 統合担当は #56 の UI 重複、0.49.1 候補と現在の Studio 0.50.0 候補の版番号、#58 以降の依存鎖を解決してから限定コミットを作る。現在の未コミット成果の所有者が未確定のため、UI 隔離ブランチは commit/push/PR していない。Port 比較テストの修正だけを別 worktree と Draft PR #95 に隔離した。

## 検証と実機受入

Studio Node 全件 1,925/1,925、Port tuner/metronome Node 159/159、Studio Browser の tuner 9/9、Dock/quick tool 12/12、PC shell と Gear/My Apps 40/40、version/cache と Studio Dock 35/35。使い捨て profile・合成マイクで Port v3 保存と再読込、権限拒否/再試行、Port 内 Home と再入場、同一オリジン2タブの独立したマイク寿命、四つのテーマ、390–1920px、Global Stop/離脱/非表示/pagehide の track 終了、譜面 draft 維持、`canWrite=false` を確認した。Port 単独の比較 browser script は fixture server の絶対 `/apps/...` path と `.mjs` MIME が原因で起動しなかった。テストの比較条件を維持して修正し、別ブランチの Draft PR #95 で `result: PASS` を確認した。

実機では macOS/Windows Chrome と Safari、許可未設定・拒否済み・デバイス切断、外部オーディオ入出力、Port と Studio の同時タブ、ブラウザ戻る、Port 内ホーム、Pro gate/失効、画面ズーム、スクリーンリーダーの frame 遷移を確認する。Port 保存が既存利用者データを保持することは使い捨てでない実データでは試さない。受入の各項目が通るまで Pro と Sync の完成表示は行わない。
