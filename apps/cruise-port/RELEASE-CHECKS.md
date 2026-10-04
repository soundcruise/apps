# Cruise Portの公開・Pro案内運用条件

- Standard版（`/apps/cruise-port/`）は完成版として維持する。現時点ではWebサイトやYouTube等から積極的な一般公開導線は設けない。
- Cruise Port Proは、YouTubeメンバーシップ「フォルテ」会員向け特典の一つとして提供する。Pro単体販売は行わない。
- Proの利用手順は、フォルテに登録し、会員向け限定投稿を確認したうえで、投稿内の案内からCruise Port Proを利用する流れとする。
- Pro版の入手方法ページでは認証付きPro入口へのリンクを提供する。パスワード・認証情報は公開せず、フォルテ会員向け限定投稿内で案内する。URLの非公開性を認証の代わりにしない。
- 既に利用資格と案内情報を持つ利用者には、「Pro版を開く」導線を提供する。
- `#pro-access`の登録CTAと限定投稿CTAには、既存の正式運用URLを使用する。料金はYouTube側の登録画面で確認するものとし、Cruise Port内には掲載しない。

## 1.18.0 — Standard / Pro境界

Standard Readinessと追加修正をまとめて1.18.0として公開する。

| 機能 | Standard | 認証済みPro |
|---|---|---|
| 基本チューナー／メトロノーム／NEWS／カレンダー／設定 | 利用可 | 利用可 |
| 練習メニュー新規作成 | 5件まで | 保存数制限なし |
| My Apps新規作成 | 5件まで | 100件まで（既存技術上限） |
| カポ／メトロノーム詳細設定・プリセット保存 | ロック | 利用可 |
| 機材写真／独自My Appsアイコン／練習添付の追加 | ロック | 利用可 |
| Cloud Syncページ・概要・ヘルプ・Account/同期先状態閲覧 | 利用可 | 利用可 |
| Account作成・復旧コード管理・名称変更・解除・Account削除 | 利用可 | 利用可 |
| Cloud Sync主要操作・端末追加・データ同期・競合解決 | ロック | 利用可 |
| 同期サポートAI | 非表示・処理不可 | 利用可（既存Worker認証に従う） |

### 実装棚卸し（追加修正前→今回のStandard）

| 分類 / 実装に存在する操作 | Standard修正前 | Pro | データへの作用 | 今回のStandard |
|---|---|---|---|---|
| A: summary/devices、同期状態、同期先詳細、help | 可 | 可 | 読み取りのみ | 維持 |
| B: completeAccountSetup | 可 | 可 | Account資格・membership準備のmetadata。修正前は続けてPort ensure/prepareAll | Account作成のみ。Port ensure/prepareAllを実行しない |
| B: prepare/commitRecovery、復旧コード更新 | 可 | 可 | Account資格復旧/rotation。Portローカル同期metadataをクリアする既存処理あり | Account管理を維持。データ再同期はしない |
| B: renameEnvironment/renameAppEnvironment、revoke/detach、Account削除 | 可 | 可 | Account・同期先metadata/資格の変更（Account削除の既存影響・確認は維持） | 維持 |
| C: Port ensure/provision/sync、initializeDataset、自動同期 | 可 | 可 | dataset初期化・双方向records転送 | 処理不可。runtimeを生成しない |
| C: prepareAll/launch/launchSameContainer、app/Port端末追加 | 可 | 可 | membership設定・join/handoff発行・アプリ接続 | 処理不可 |
| D: connectExistingAccount（同期コード経由のPort追加） | 可 | 可 | 端末接続とPort同期開始 | 処理不可。Account復旧コード管理とは別経路 |
| D: resolveConflict/retryLegacyFailures、asset upload/download/reconcile | 可 | 可 | records・写真/添付のクラウド反映/取得 | 処理不可。既存ローカル写真/添付の閲覧は維持 |
| D: アプリ同期データの削除・削除取消後の接続 | 可 | 可 | アプリdatasetのlifecycle | 処理不可 |
| E: AI send | 非表示 | 可 | 質問を既存Workerへ送信 | 非表示に加えて既定APIも処理不可 |
| F: Homeからアプリへ移動 | 可 | 可 | Proでは接続時handoffを使用 | 通常のURL移動。同期handoff発行なし |

### NEWSローカル確認

公開NEWS APIは本番Originのみ許可する。従来の静的HTTPサーバーではlocal Originが403になり、成功時だけ表示していたHome入口まで消えていた。1.17.0にも同じ依存があり、前回のedition変更でNEWSをPro化したものではない。

`python3 scripts/port-local-preview.py 8765` でローカル確認する。127.0.0.1だけにbindし、Hostもloopback名だけ許可する固定公開NEWS GET経路で、認証・Cookieを転送せず、本番Account/NEWS書き込みやpublisherページ取得を行わない。静的配信は公開apps配下に限定し、dotfile・node_modules・範囲外pathを拒否する。productionのAPI URL/CORS/公開判断は変更しない。

Home入口を常時用意し、外部NEWS取得失敗時には通知と自社記事だけ表示する。外部fixtureや古いcacheを復活させない。APIのdisabled応答は従来どおり公開停止を尊重する。

### 検証方法と境界

- `node --test apps/cruise-port/*.test.mjs`
- `node --test apps/shared/sync-account/*.test.*`
- Playwright: `tests/standard-readiness-browser.cjs` と `tests/standard-readiness-revision-browser.cjs`（375/393/768/1280px）。認証/Accountの外部要求を隔離モックで処理し、本番同期データを変更しない。
- Standardの既定API、UI click、hash/query、保存済みAccount/Pro資格、reloadで主要同期が始まらない。Proは共有gateが解除された後だけ起動し、auth reset後もlive capabilityで拒否する。
- このPort側の製品制限は既存Workerの認証・認可を置き換えない。ユーザーが任意JavaScriptでクライアント自体を書き換える行為へのserver entitlement追加は今回のscopeに含めない。
- Account作成等のAccount metadata書き込みは意図的に残す。Account削除は既存の削除確認と影響範囲を維持し、Standardから無確認で実行しない。
- 実Accountでの安全なPro同期受け入れ確認は可能な場合のみ行う。未実施はNOT EXERCISEDとして記録し、今回の承認済み公開を止めない。隔離ブラウザは本番Accountに接続しない。
