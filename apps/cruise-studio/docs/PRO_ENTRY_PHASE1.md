# Studio 0.55.0: Pro 導線の第1工程

PR #110 の固定head `8c88867c089526f2267005ec9249f50c8c6c321d` から隔離。Studio Homeとシリーズ画面の4アプリはPortの `cruise-app-links.js` にあるPro正規URL・アイコンを利用し、新しいタブで各アプリ自身の共有Pro gateを開く。URLは認可根拠ではない。合成ブラウザで無資格時に4アプリとPort Proの既存ゲートがロックされることを確認。Studio起動時gateは未実装。

## Port Proとの照合

| 機能 | Port既存Proの追加機能 | 現在のStudio |
| --- | --- | --- |
| チューナー | カポ調整、既存の入力・弦・音名・メーター | Standard Port文書。Pro版は別タブ導線のみ |
| メトロノーム | 詳細設定とプリセット書込み | Standard Port文書。Pro版は別タブ導線のみ |
| 練習メニュー | Standard 5件制限を外し、添付ファイルを使用 | Standard Port文書。Pro版は別タブ導線のみ |
| 機材リスト | 写真追加・調整等のPro操作 | Standard Port文書。Pro版は別タブ導線のみ |
| My Apps | Standard 5件から最大100件、独自画像アイコン | Standard Port文書。Pro版は別タブ導線のみ |
| NEWS | Portの既存一覧・記事 | 既存Standard Port文書を維持 |

保存は既存Port owner: tuner v3、metronome v3・presets v1、practice menus v3、gear v5、My Apps v7と対応する画像/添付IDB。Pro gateやPort storeの変更はない。各アプリの保存領域とStudio Projectは独立。Port writer admissionのPR #107 P2は未解決であり、埋込みProの編集・同期受入を阻む。

## Port ProのStudio内利用をHOLDする理由

Port Proの `pro-app-boot.js` は実際の共有gateが解除されるまでPortのコントローラーとrouteを初期化しない。Studioの既存Standard surfaceはiframe load直後にhashを設定する一方、Portの初期化は初期hashを正規化する。単純なURL差替えは認証後のroute、tunerの自動マイク開始、5テーマと音声解放を保証しない。`port-frame-theme.js` も現在Standard Portのpathnameに限定されている。URLの版名や表示だけをPro資格と見なしてはならない。

Port/Sync ownerへの要求: gateロック・解除・失効とPort route初期化完了の明示的な通知・待機契約、Studioの要求routeを起動後に1回安全に選ぶ契約、再ロック時のマイク・音声・leaseの停止、Account/device/Pro generationの切替中の書込みfenceと画像参照の整合性を定義する。既存gate、`isProAccessReady`、Portのstore・Pro判定・Sync契約をownerが維持し、Pro gateを迂回しない。合成資格と実Proを区別してStudio iframe・Port単独・複数タブ・5テーマ・オフライン/失効を受け入れる。

通常Studio bootはPro gate未接続、既存5ツールはStandardであり、製品としてのPro専用化は未完了。実Pro資格、実Account、Safari、スマートフォン、二端末Syncは未受入。本番・Cloud・共有認証・schemaは変更しない。
