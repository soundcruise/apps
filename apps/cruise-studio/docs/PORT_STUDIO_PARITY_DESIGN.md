# Cruise Port / Cruise Studio UI・機能共通化設計

設計日: 2026-10-31。対象: `codex/studio-ui-news-apps-20261031`（基準 `1cad09b5e`、0.52.0 候補を隔離複製）。結果は [チューナー](./PORT_TUNER_PHASE1_RESULT.md)、[メトロノーム](./PORT_METRONOME_PHASE1_RESULT.md)、[練習メニュー](./PORT_PRACTICE_PHASE1_RESULT.md)、[機材・My Apps](./PORT_GEAR_MYAPPS_PHASE1_RESULT.md)、[NEWS・4アプリ](./PORT_NEWS_SERIES_PHASE1_RESULT.md) に記録する。保存データ、認証、Worker、Cloud Sync の契約は変更しない。

## 1. 決定と責務

**Port の実行中画面と保存処理を正本にする。** Studio に同等のフォーム、プリセット管理、保存ロジックを移植しない。Studio は PC 用 Home、画面配置、ナビゲーション、音声リソースの外側の調停を担当する。Port の機能を開いた時は Port の実画面・実操作を提供する。Studio 独自のクイックチューナーとメトロノーム Dock は、譜面作業中の補助機能として残せるが、Port ツールの代替・設定保存 UI と呼ばない。

Port ツールの現行方式は同一オリジンの **Port-owned route surface**。Studio の専用 PC ワークスペースに単一の Port 文書を iframe として開き、Port 自身の hash route で画面を選ぶ。Studio は Port の store、資格情報、画面 DOM を変更せず、許可済み URL の選択・表示・破棄と音声調停を担当する。Standard チューナー、メトロノーム、練習メニュー・カレンダーを隔離候補で実装済み。Port 文書は保存できるため、現行 `canWrite=false` の読み取り専用 Host とは明確に別の owner として扱う。Pro は正規 URL を別タブで開く導線まで実装し、Pro gate の iframe 受入後に Studio 内の Pro 画面を検討する。iframe で Pro gate、添付/ダウンロード、履歴、Service Worker、権限が成立しない機能は同じ Port 文書を別タブで開く。

Port 以外の音感・指板・リズム・コードクルーズは現行の別タブ起動を維持する。これらは独立 PWA、独立 Standard/Pro entry、独立データ owner。既存 ADR-012 の iframe 不採用を維持し、アプリ本体の UI・保存を Studio に再実装しない。アプリ間の曲・練習コンテキスト共有が必要になった時だけ owner 側の明示契約を別ラインで設計する。

| 方式 | UI 一致 | 保存/Pro の owner | 主な負担 | 判断 |
| --- | --- | --- | --- | --- |
| Port UI を部品抽出して共有 | 高い | Port 側 API の設計が必要 | `practice-menu-app.js` の大規模分割、Port 回帰と PR 競合 | 長期候補。現在の最初の実装にはしない |
| Studio アダプターで UI を再構築 | 不完全になりやすい | 二重実装 | 機能/保存差分の維持 | フル機能には採用しない。既存 read-only 投影は状態表示に限定 |
| Port 文書の route 埋め込み | Port そのもの | Port 文書 | frame/音声/Pro/ナビ検証が必要 | Standard チューナー・メトロノームに先行適用。機能ごとに受入 gate を判定 |
| Port 文書を別タブ起動 | 完全 | Port 文書 | Studio 内の連続ナビはない | 安全な先行導線と埋め込み不成立時の正式 fallback |

## 2. 機能別の owner と採用方式

Port の HTML は `index.html` と `pro_9a3943176561/index.html`。両者は `practice-menu-app.js` を起動し、そこで画面遷移、練習、機材、My Apps、NEWS、チューナー、メトロノームを結ぶ。iframe であっても *文書全体* を起動する。HTML の一部をコピーして `initTuner` 等だけを呼ぶ方法では、現在の Port の保存/ナビ/Pro 契約を満たさない。

| 機能 | Port 実装・依存 | キー/schema と制限 | Studio の到達方法 |
| --- | --- | --- | --- |
| チューナー | `#tuner`、`tuner-app.js`、`tuner-audio.js`、`tuner-preview-audio.js`、`tuner-engine.js`、`tuner-tuning.js`、`tuner-store.js` | `cruisePort.tuner` v3。カポは Pro。`cruisePort.tunerMeterVisible` は端末内表示設定 | Standard の Port route を Studio 内で表示。旧 Studio full-screen は撤去。譜面横の memory-only quick tool は補助と明示 |
| メトロノーム | `#metronome`、`metronome-app.js`、`metronome-store.js`、`metronome-presets-store.js`、`port-metronome-authorization.mjs` | `cruisePort.metronome` v3、`cruisePort.metronomePresets` v1。BPM は Standard、詳細設定と preset 書き込みは Pro | Standard の Port route を Studio 内で表示。Studio Dock は譜面補助BPMと明示 |
| 練習メニュー・音楽カレンダー | `#practice-menu` 以下、`practice-menu-app.js`、menu/sets/progress/history/calendar/timer/attachment stores と `practice-dataset-writes.js` | menu v3、sets v1、progress v3、history v5、calendar v2、`cruisePort.schemaVersion` v3。Standard の新規 menu は5件、ファイル追加は Pro | Studio 0.51.0候補で Port route と下位 hash を表示。Studio read-only 投影は概要だけ |
| 機材リスト | `#wishlist` 系 route、`practice-menu-app.js`、gear list/category/photo/export modules | `cruisePort.gearList` v5、`gearCategories` v1、写真 IndexedDB と `syncAssetMetadata` v4。写真編集は Pro | Studio 0.52.0候補で Port 実画面を主入口に接続。旧 read-only 投影は概要。カテゴリ/並べ替え/export と実 Pro 画像は個別受入待ち |
| マイアプリ | Port Home と `#my-apps/manage` 以下、`practice-menu-app.js`、my-apps store/icon/launch modules | `cruisePort.myApps` v7、icon IndexedDB、`syncAssetMetadata` v4。Standard 5件、独自 icon 編集は Pro | Studio 0.52.0候補で Port Home の実カードと管理画面を主入口に接続。外部 HTTP(S) URL は別タブ。旧 read-only 投影は概要。実 Pro 画像は受入待ち |
| NEWS | `#news` と記事 route、`news-provider.js`、`news-data.js`、`news-ui.js`、`news-articles.js` | Port dataset 外。ニュースは公開GETと時間条件による表示 | Studio 0.53.0候補でPort実画面を主入口に接続。旧Studio投影は「NEWS概要」の補助画面 |
| 4つのクルーズ | `cruise-app-links.js` の Standard/Pro URLと公式アイコン、各アプリ本体 | 各アプリが自身の保存、Pro、Syncを所有 | Studio 0.53.0候補で通常版/Pro版を別タブ起動。選択editionはURLだけを認可根拠にしない |

## 3. 保存・Pro・同期契約

Studio の `port-data/host.mjs` は `canWrite:false`、closed capabilities、明示 read と無効な activation が現行境界。`connection.mjs` は Port repository の既存 snapshot と Account/Pro の観測のみを行う。この境界を今回の UI 作業で `true` にしない。`metronome-facade.mjs` は dormant 書き込み候補で、executor 未接続。これを UI から直接呼んで先行保存を始めない。

Port route surface での操作は **Port 文書が Port repository に保存する**。Studio は `localStorage.setItem`、Port store の `save*`、Sync outbox、Account/Pro 資格の書き換えを行わない。Port 文書は同一オリジンなら既存の Port キーと IndexedDB を使うが、同一オリジンであること、同じ Account・device generation を見ていること、Port の writer protocol/lock が有効なことを gate で確認する。Studio が read-only projection を表示する場合は保存後に再読込し、revision 不一致時は操作を拒否して古い表示から書かない。

Port の `port-dataset-repository.js` の catalog と `port-sync-adapter.js` の managed keys を同期契約の正本とする。同期対象は settings、tuner、metronome/presets、practice menus/sets/progress/history/calendar、gear/categories、myApps、asset metadata と対応する binary asset。`cruisePort.practiceMenuSetSelection`、`practiceTimer`、`tunerMeterVisible`、`gearGridColumns` は現行 managed keys にない端末内状態。NEWS と StudioProject、4アプリの各保存領域も Port dataset には含まれない。PC とスマートフォンは localStorage を直接共有しない。同期対象外を UI だけで「同期済み」と表示しない。binary asset の本体・復旧可否は Cloud Sync ラインの契約で確認する。

Standard/Pro の機能差は `cruise-port-capabilities.js` と `tool-capabilities.js` を正本にし、Port Pro 文書は既存 `pro-app-boot.js` と共有 gate の解除後だけ起動する。Studio の `pro` 観測や URL は認可証拠ではない。Pro 資格は server-issued generation/失効/device-bound session を維持し、有料 backend は Account/device 資格も別に検証する。Standard 表示に戻っても保存済み Pro 設定を消さず、Port の effective value 投影を使う。Pro URL の案内は既存 Port の方式に従い、資格を Studio 側で中継しない。

Cloud Sync 開発ラインは writer admission、Account/device、Pro 資格、outbox、conflict/unknown、binary asset、Worker/DDL/Production を所有する。UI ラインは既存 API の画面表示と read-only 状態反映までを担当し、`canWrite` 切替、同期成功の判断、conflict 解消、Production 有効化を引き受けない。Port と Studio の二重 writer、旧 build/新 build の共存、CAS 失敗、同一ブラウザ内の Account 切替は Cloud Sync owner に受け入れ試験を依頼する。

## 4. PC shell と音声の契約

PC 用変更は Studio shell の幅、高さ、余白、戻る/ホーム、アイコン・hover/focus/touch 補助に限定する。iframe 内 Port UI のボタン、説明、配色、フォームを CSS や DOM 操作で改変しない。最低幅、iframe 内スクロール、focus 移動、ブラウザ戻る、hash 深いリンク、ダウンロード/共有、Pro overlay を 1440/768/390px で検証する。

Studio Audio Coordinator は Studio quick tuner/Dock の所有者。Port frame 内の音声自体は Port 文書が所有する。Studio は frame が生きている期間だけ、チューナーでは `microphone/session`、メトロノームと練習メニューでは `audio-output/session` の lease を持ち、Studio 側の音声との同時開始を防ぐ。Dock 再生中の Port 起動は止めずに拒否し、Global Stop 後の明示再試行を要求する。Studio 画面離脱・Global Stop・タブ非表示・pagehide では frame を破棄し、Port の pagehide 停止を使う。Port 内の `setActive(false)` や `destroy()` は親から呼ばない。非表示後は自動再開しない。拒否・再試行・音声終了は合成マイクのブラウザ試験で確認済みであり、実機試験は未了。

## 5. フェーズと受入基準

1. **準備・競合整理（済）**: 元の dirty tree を patch/tar/manifest に保全して隔離 worktree に複製した。#56 と基準 #55、さらに #52 の依存を確認。#56 累積headとの差分と0.53.0 UI dirty setには39ファイルの経路重複がある。cherry-pick/merge しない。統合担当がハンク単位で再照合する。
2. **チューナー初期実装（済）**: Home/ナビのチューナー入口で Standard の実 Port 文書を開く。Port 起動後に `#tuner` を選択する（Port boot は初期 hash を正規化する）。譜面補助 quick tool は memory-only と表示。Studio read-only Host、Port/Worker/Sync/認証は無変更。使い捨て browser profile で保存・再読込、マイク、画面離脱、譜面保全、4テーマを確認。
3. **残る埋め込み gate**: Pro gate、同時タブ lock、Account/device、focus/history、添付/写真、download、SW scope、実機の権限表示を確認する。各機能で失敗した場合は別タブの Port 正規画面を用いる。Studio 内に複製 UI を作らない。
4. **Port route surface と4アプリ導線（済）**: Standard メトロノーム、練習/カレンダー、機材、My Apps、NEWSをPort実画面の主入口へ接続済み。NEWS独自投影は概要へ移し、Port単体と一覧・カテゴリ・リンクを照合した。4アプリは公式カタログのStandard/Pro入口とアイコンを別タブで使用する。Portの画面/保存/認証/Syncコードのdiffは0。実Pro/Accountの受入は別gate。
5. **同期受入**: Cloud Sync owner が Port dataset の二端末・競合・Pro・binary の試験を完了した後、Studio から開く Port route でも同じ結果になることを確認する。同期対象外の端末内設定、NEWS、StudioProject、4アプリの独立データを明示する。Pro と Standard を切り替えても保存済み Pro データが残ること、失効時の再認証と backend 拒否を確認する。

全フェーズ共通の停止条件: 実データの意図しない変更、Port/Studio UI 機能欠落、保存 schema 変更、Pro 制限逸脱、同期済みの誤表示、画面離脱後の音声/マイク継続、既存未コミット変更の消失。機能パリティは「画面が見える」だけでなく、追加・編集・削除・並び替え・preset・添付/写真・export・再読込・二端末反映で判定する。

## 6. 別ラインへの引き渡し

- **Port owner**: iframe での route lifecycle、Port boot の migration/write、副作用、画面離脱時 audio stop、PC viewport の可否を確認。将来のコンポーネント抽出は Port UI と store API の同時所有変更として別 PR にする。
- **Cloud Sync owner**: `canWrite=false` 解除の必要性の有無、Port frame と Studio の writer 共存、managed keys と端末内 keys、asset binary、Account/device/Pro、CAS/conflict/unknown、Production gate の合否を決める。UI ラインはそれを先取りしない。
- **各アプリ owner**: 4アプリの Standard/Pro 正規 URL、外部起動、データ/設定同期の範囲、Studio コンテキスト受け渡しを個別に決める。各アプリの保存を Port dataset に移さない。
- **PR 統合担当**: #56 の Studio UI/version/cache/port-data 重複と後続連鎖の基準を整理し、現在の dirty tree を保護した独立作業計画を作る。
