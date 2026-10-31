# Port 機材リスト・My Apps の Studio 統合候補

2026-10-31。隔離 branch `codex/studio-ui-gear-myapps-20261031`、起点 `1cad09b5eccc90c1f1ec265a0bfef40d681a0052`。保全済み Studio 0.51.0 候補の tracked patch と未追跡ファイルをハッシュ一致で複製し、Studio 0.52.0 候補としてこの UI 差分を追加した。元の UI、0.50.0、0.51.0 の worktree は編集しない。

## 実装境界

Home/左ナビの正規「機材リスト」「My Apps」はそれぞれ `portGear`、`portMyApps` を開く。同一 origin の **Port Standard 文書全体**を iframe に読み込み、前者は `#wishlist`、後者は Port Home の My Apps セクションを表示する。Port 本体の HTML/JS/CSS、保存処理、Pro gate、Sync/Worker は変更しない。Studio が追加するのは PC 用画面枠・高さ、ホーム/戻る、Studio の別ワークスペースへの遷移、外部 URL の別タブ起動、frame の破棄と再開だけである。

従来の Studio `gear` / `myApps` は「データ概要」として残し、`canWrite=false` の明示読込を維持する。作成・編集の正規入口から外した。Port frame は Port 自身の repository を使って Port 保存領域へ書き込むため、Studio の read-only Host に書込み権限を付与しない。同一 origin が必須であり、異なる origin の Port 文書や Pages 配備ではこの方法は動かない。

Gear の編集中に Studio の戻る/ホーム/左ナビを押した場合、Port の既存「保存して戻る／保存せず戻る／編集を続ける」ダイアログを使う。画像クロップ中は Studio 遷移を保留する。My Apps は Port のフォーム取消仕様に従う。非表示タブ・pagehide・Global Stop・画面離脱では frame を破棄し、復帰後は明示的に再開する。Port Home のチューナー等へのリンクは Studio の対応ワークスペースへ移し、外部アプリ URL は HTTP(S) と資格情報なしを確認して別タブで開く。未対応の Port route は Studio Home へ戻す。

## Port 正本の機能と保存

| 機能 | Port 実装・保存 | Standard / Pro | Studio 受入 |
| --- | --- | --- | --- |
| 機材一覧・詳細 | `practice-menu-app.js`、`gear-list-store.js`、`gear-list-ux.js`。owned / sold / wishlist、カテゴリ、カード操作、列数、並べ替え、CSV/PNG、1件画像書出し | Standard で基本 CRUD。写真書込みは Pro | 同じ Port DOM・handler を表示。合成 Chrome で追加、編集破棄、削除、列数、カテゴリ追加、上下並べ替え、再表示を確認。全 export の Studio 内個別操作は未受入 |
| 機材データ | `cruisePort.gearList` v5、`cruisePort.gearCategories` v1。列数 `cruisePort.gearGridColumns` は端末内 | Standard/Pro で同じ schema | v5 と列数の Port 書込みを確認。Studio 独自キーなし |
| 機材写真 | IndexedDB `cruisePortGear` v1 / `photos` の source/final Blob、item `photoId` / `photoSourceId` / `photoCrop`、`cruisePort.syncAssetMetadata` v4 | Standard で新規・再編集不可。Pro で可能 | 合成既存 Blob の表示・再読込・Port 削除後の参照と本体消去を確認。実 Pro での撮影/クロップ/再編集は未受入 |
| My Apps 一覧・管理 | Port Home カード、`#my-apps/manage`、作成/編集、上下並べ替え、端末別 URL、起動モード、表示サイズ | Standard 5件、Pro 100件。表示サイズは Port 設定 | 同じ Port DOM・handler。合成 Chrome で追加、編集、削除、プリセット、別タブ起動、上下並べ替え、表示サイズ保存・再読込を確認 |
| My Apps データ | `my-apps-store.js`、`cruisePort.myApps` v7。`cruisePort.settings` の `displaySize` | Standard/Pro で同じ schema | v7 保存・再読込を確認。Studio 独自キーなし |
| My Apps アイコン | 22種の既存プリセット、IndexedDB `cruisePortMyApps` v1 / `icons` の source/final Blob、item `iconId` / `iconSourceId` / `iconCrop` / `iconPresetKey` | プリセットは Standard。カスタム画像書込み/再編集は Pro | プリセット保存・再読込、合成既存 Blob の表示・削除後の参照と本体消去を確認。実 Pro のトリミング/再編集は未受入 |

Port には機材のカテゴリ・状態フィルタがあるが、Port の機材一覧にテキスト検索欄はない。Studio の閲覧専用概要には検索がある。正規機能の受入条件として Port にない検索を勝手に追加しない。

Port Sync の managed keys は `cruisePort.gearList`、`gearCategories`、`myApps`、`settings`、`syncAssetMetadata` を含む。`gearGridColumns` は対象外。画像は metadata と Blob の双方を持ち、`port-asset-sync.js` が同期契約を扱う。PC とスマートフォンの二端末同期、Account 切替、実 Pro/失効時は未検証である。Studio Project の Sync とは別の完成条件とする。

## 受入と未受入

| 判定軸 | 合成 Standard Chrome | Pro | 二端末 Sync |
| --- | --- | --- | --- |
| UI・操作 | Port 文書と同じ DOM/handler。機材/My Apps の主要 CRUD、外部 URL 起動、ホーム/戻るを確認 | 実資格なし | 対象外 |
| 保存・再読込 | Port 正本 v5/v7、プリセット、列数、合成画像参照と Blob 表示を確認 | 実画像編集は未検証 | 未検証 |
| 削除 | Port UI の確認後、metadata と IndexedDB の source/final を削除。Port の rollback/unit test も通過 | 実資格下は未検証 | tombstone/unreference の実往復は未検証 |
| Standard 制限 | 5件目後の Pro 案内、写真・カスタムアイコンの Pro 案内を確認 | 100件/画像書込みは未検証 | 対象外 |
| PC 表示 | Studio 外枠4テーマ、390/1440px、Port frame を確認 | iframe 内のテーマは Port 設定に従い Studio 外枠との配色一致は未受入 | 対象外 |

Port が iframe 内で同一 origin の保存領域を使うことは、Port の通常画面と同じ localStorage/IndexedDB を使うという意味である。誤って別の保存正本を作らない利点がある一方、実利用者データに対する操作は Port の通常操作と同じ影響を持つ。試験は使い捨て Chrome context と合成データだけで実施した。`cruisePort.settings` と `gearGridColumns` の端末内/Sync の差は UI で「同期済み」と表現しない。

試験結果: Studio Node 1925/1925。Port の Gear/My Apps/asset 関連 Node 123/123。Port 全 Node 1145/1149で、失敗4件は `theme.test.mjs` に限られ、元の0.51.0 worktreeでも同じ4件を再現した。新規 Port surface Browser 4/4、既存 Home/NEWS と focus 37/37、read-only library と新規 surface の併走 24/24、PC Shell layout 18/18。チューナー、メトロノーム、練習メニューの既存 browser suite もそれぞれ通過した。新規 browser は機材/My Apps の CRUD、カテゴリ/並べ替え、Port 設定、保存再読込、画像 Blob と参照の削除、Standard 制限、Pro 案内、外部起動、Global Stop/画面/タブ/pagehide 離脱、4テーマ/390・1440px、譜面ワークスペース復帰を確認する。

## 次の実装指示

1. NEWS は Port `#news` の実画面を同一 owner route surface で開く。Studio の既存 NEWS 投影は概要として残す。配信 API を UI line で変更しない。記事外部 URL は明示的な別タブ、Port の Home/戻る route は Studio navigation と整合させる。合成 feed、空状態、失敗、遅延応答、離脱後の古い応答を browser test で確認する。
2. 音感・指板・リズム・コードクルーズは各アプリの正規 Standard/Pro URL、保存キーと起動先を owner ごとに棚卸しし、まず Studio から外部の正規アプリを安全に開く。各アプリの UI を Studio へコピーしない。Studio 内の埋め込みは認証、Service Worker、画面離脱、独立データ同期の契約が確認できてから判断する。Pitch/Fretboard の変更は各アプリの専用ラインへ渡す。
3. Sync line に Port managed keys、画像 source/final と参照/tombstone、Account/device generation、Pro gate を同一 origin iframe で扱う正式契約、端末内 `gearGridColumns`/表示設定の同期範囲、CAS/Outbox との writer 共存試験を依頼する。UI line は `canWrite=false` と schema を変えない。

## Git と試験の取扱い

`origin/main` は `5c07c7b3d05bc99153113f214babd3a161514bf1`。OPEN Draft PR #56 は head `a4d85ffa7b6fc23b2845fd21ed7e48af33f6162e`、Studio dirty set と37ファイル重複。OPEN Draft PR #95 は head `9c4a2601e45543190a56c186847060868f699e57`、今回の変更と重複なし。どちらも取り込まない。0.51.0 を含む未コミット成果の所有範囲が混在するため、この候補の commit/push/Draft PR は行わず、ハッシュ付き snapshot で保全する。

実マイク、Safari、スマートフォン、実 Account、実 Pro、二端末 Sync、Production 配備は未確認。既存 Port Node `theme.test.mjs` の4件失敗は元の0.51.0 worktreeでも再現し、今回の Port 変更ではない。結果を今回の成功に含めない。
