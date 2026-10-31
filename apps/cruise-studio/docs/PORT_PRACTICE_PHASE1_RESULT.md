# Port 練習メニュー・音楽カレンダーの Studio 統合候補

2026-10-31。隔離 branch `codex/studio-ui-practice-20261031`。起点 `1cad09b5eccc90c1f1ec265a0bfef40d681a0052` に、保全済み Studio 0.50.0 候補を欠落なく複製し、今回の UI 差分を追加した。Studio の表示番号は 0.51.0 候補。元の UI worktree とチューナー・メトロノーム worktree は編集しない。

## 実装範囲と責務

Home/左ナビの「練習メニュー」は `portPractice` ワークスペースに入る。同一 origin の Cruise Port **Standard 文書全体**を iframe に読み込み、Port 起動後 `#practice-menu` に遷移する。`#practice-menu/...` の作成・編集・詳細・非表示・カレンダー route を Port の UI/handler/store のまま使う。Studio の追加部分は画面枠、PC 高さ、戻る/ホーム、音声 lease、タブ/画面離脱時の破棄、再開ボタンのみ。Port の `history.pushState` によるホーム遷移も Studio Home に戻す。Port の HTML、JavaScript、CSS、保存 schema は変更しない。

従来の `screen-practice` は「保存値の概要」として残し、Port 実画面上部から開く。閲覧専用投影 (`canWrite=false`) であることを明示し、作成・編集の主入口から外した。これまでの閲覧専用試験と投影契約は保持する。Port の実画面は Port 文書自身が書くため、この Host に書込み権限を与えない。

Port の編集フォームから Studio のナビ、戻る、ホームへ移る時は Port の既存「変更を保存しますか？」を先に開く。保存、破棄、編集継続の各選択を確認してから Studio が遷移する。Global Stop、タブ非表示、ページ離脱は音声解放を優先し、未保存フォームの継続は保証しない。

Port Standard を同一 origin で開く条件が満たされない場合は frame を失敗表示にし、Port の正規 URL を別タブで開く導線を使う。Pro は別タブ導線のみで、Studio 内の Pro gate は受入前。Studio の edition 表示や URL だけで Pro 権限を付与しない。

## Port 機能の棚卸し

| 領域 | Port の実装・UI | Standard / Pro | 今回の受入 |
| --- | --- | --- | --- |
| メニュー | `practice-menu-app.js` の一覧・詳細・作成・編集・削除・非表示・ドラッグ/上下並べ替え・使用アプリ・メモ | Standard 新規5件、Pro 制限解除 | 実 UI・作成・編集・削除・上下並べ替え・5件目後の Pro 案内を合成データで確認 |
| プリセット | セット作成/編集/削除、複数メニュー指定、選択 | Port の既存 edition 判定 | UI をそのまま公開。作成・編集・保存の個別ブラウザ受入は未実施 |
| タイマーと進捗 | 開始/終了、チェック、通算回数、サイクル完了カード | Port の既存仕様 | 開始・終了・完了カードからカレンダーを確認。タブ離脱で frame を破棄 |
| 記録・履歴 | 自動記録、手動記録、時間集計、日/週/月/メニュー別詳細 | Port の既存仕様 | 手動記録の保存、履歴キー更新を確認。集計値の全組合せは未実施 |
| カレンダー | 月/週/日表示、予定・メモ、練習記録 | Standard のメモ利用可 | メモ追加・保存・再表示、3表示切替を確認。メモ編集/削除は未実施 |
| 添付 | メニュー詳細/フォームの画像・ファイル、IndexedDB `cruisePortPractice` v1 `attachments`、sync asset metadata | Standard 書込み不可、Pro 書込み可 | Port UI を保持。実ファイル、実 Pro、binary Sync の受入は未実施 |
| 設定・Account | Port 本体の設定画面、共有 Account/Pro gate | 認証は Port owner | Studio 独自契約は追加しない。実 Account/Pro は未受入 |

保存正本は Port の `practice-menu-store.js` (`cruisePort.practiceMenus` v3)、`practice-menu-sets-store.js` (`practiceMenuSets` v1)、`practice-menu-progress-store.js` (`practiceProgress` v3)、`practice-menu-history-store.js` (`practiceHistory` v5)、`practice-menu-calendar-store.js` (`practiceCalendar` v2)、`practice-menu-timer-store.js` (`practiceTimer` v2)、`practice-menu-attachment-store.js`、`practice-dataset-writes.js`。`cruisePort.schemaVersion` は3、`cruisePort.syncAssetMetadata` は4。`practiceMenuSetSelection` と `practiceTimer` は Port Sync managed keys にない端末内状態。メニュー/セット/進捗/履歴/カレンダー/asset metadata は Port Sync catalog の対象。PCとスマートフォンの二端末 Sync、binary 復旧は今回未検証。

## 受入判定

| 判定軸 | Standard | Pro | Sync |
| --- | --- | --- | --- |
| UI・操作 | Port単独の実文書と同じ操作要素。作成、編集、削除、並べ替え、タイマー、記録、カレンダーを Chrome 合成環境で確認 | 正規 Pro URL の別タブ導線のみ。Studio 内は未受入 | 対象外 |
| 設定・保存 | Port の既存 key/schema に保存・再読込。Studio 専用形式なし | 実資格で未検証 | 二端末・実 Account 未検証 |
| 制限 | Standard 5件と6件目の Pro 案内を確認 | 実資格での解除、添付は未検証 | 対象外 |
| 音声・離脱 | Global Stop、画面移動、非表示、pagehide で frame/lease を解放。復帰は明示再開 | 未検証 | 対象外 |

隔離 Chrome ブラウザ: 新規試験9/9、Home/NEWS 17/17、チューナー9/9、Portメトロノーム8/8、PC Shellレイアウト18/18。Studio Node 1925/1925、Port Node 1297/1297。Port単独の旧 `runtime-regression-browser.cjs` は `1.23.1` 固定待ちが現行 `1.24.20` と合わず停止。`standard-readiness-browser.cjs` は合成Pro資格が現行 gate を通過できず停止。どちらもPASSと扱わない。実マイク、Safari、スマートフォン、実Pro、実Account、二端末Syncは未検証。

## iframe 継続条件と次工程

この方式は Standard UI/保存の再利用には有効だが、Port 文書全体を起動する。Port と Studio が別々の履歴・テーマ・フォーカス・Service Worker 文脈を持ち、Studio が Port 内 AudioContext を直接所有しない。Studio の4テーマを切り替えても Port 文書のテーマは Port 保存設定に従うため、内外の配色一致は未受入。Port 文書が他の音声 route を開けるため、表示中は Studio の `audio-output/session` lease を占有する。譜面 Dock が再生中なら自動停止せず、明示 Global Stop 後に再試行する。Port 内部で直接 route が変わること、添付の file picker / download、Pro gate、Account と Sync の動作を実機受入するまで恒久方式と決めない。

次は機材リスト `#wishlist`。Standard の実 UI と `gearList`/`gearCategories` 保存を同じ route surface 方式で検証する。写真・CSV/PNG・Pro 制限は別々に gate を置く。My Apps は Port Home と `#my-apps/manage` の複数 route、外部 URL 起動、アイコン IndexedDB があるため後段とする。どちらも Studio の閲覧専用投影を主入口から外し、保存は Port 文書に委ねる。UI line から `canWrite`、Account/Pro、Cloud Sync、CAS/Outbox 契約を変更しない。

Sync line へ: (1) Pro gate が Studio 同一 origin iframe で正式資格を安全に継承できるか、(2) Port practice managed key と添付 binary/metadata のPC-携帯二端末往復、(3) 端末内の timer/set selection を同期対象にするかの製品判断、(4) Account/device generation が frame と親で一致する時の read/write gate、を契約として提示してほしい。UI line は結果が確定するまで「同期済み」「Pro 同等」と表示しない。

## Git 保全と統合依存

origin/main は `5c07c7b3d05bc99153113f214babd3a161514bf1`。Draft PR #56 は `a4d85ffa7b6fc23b2845fd21ed7e48af33f6162e`、base `codex/studio-cloud-release`。今回の隔離 worktree の変更ファイル集合とは37ファイル重なるため、機械的な merge/cherry-pick は避ける。Draft PR #95 は `9c4a2601e45543190a56c186847060868f699e57`、main base、Port browser fixture 1ファイルで今回の変更と重複0。両 PR は OPEN。Studio 0.50.0 の所有者が未確定の未コミット成果を含むため、この候補の commit/push/PR は行わない。3つの UI worktree はそれぞれ保全し、統合担当が後続で差分単位に分離する。
