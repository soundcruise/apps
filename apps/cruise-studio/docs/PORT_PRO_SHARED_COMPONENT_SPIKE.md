# Port Pro共通コンポーネント: 安全な抽出の検証

基準は PR #113 head `df7f5c9b58350c463a7b6d86c85cc8ecfab25394`。製品の認証・保存・UIコードやPortコードは変更していない。Studio内の5つの正規入口は現状Standard Port iframeであり、Pro同等性は未受入。PR #107のwriter admission P2もHOLDのまま。

## 実コードの境界

| 機能 | Port正本・保存 | 抽出上の境界と未接続 |
| --- | --- | --- |
| チューナー | Pro HTMLの `#tuner-view`、`tuner-app.js` の `initTuner`、audio/preview/engine/tuning、`cruisePort.tuner` v3、端末内meter表示 | Controllerはroot・audio・storageを受け取れる。既定の `getCapabilities()` は現在のPort editionと実gateに依存。`setActive(false)` はcancel/stopを開始し、`destroy()` は非同期後始末を返す。StudioのPro証明・writer fence・Global Stopへ結ぶ契約は未完成 |
| メトロノーム | Pro HTML `#metronome-view`、`initMetronome`、audio engine、`cruisePort.metronome` v3、presets v1 | UIのcapabilitiesに加え `createPortMetronomeAuthorization` が別にPro操作ソース・現在のrepository revisionを検証する。画面のPro表示だけでは設定・preset書込みは通らない。UI/権限/保存の一貫したowner adapterとdisposeの契約が必要 |
| 練習・カレンダー | `practice-menu-app.js` とmenu/sets/progress/history/calendar/timer/attachment stores、menus v3・history v5・calendar v2等 | 全画面・hash route・DOM・timer・未保存編集・attachment IDBの初期化に密結合。Port側からcontrollerと画面生成を抽出し、既存保存と履歴・calendar更新を保持する必要がある |
| 機材リスト | 同じPortアプリの `#wishlist`・gear list/category/photo modules、gear v5・category v1・photo IDB | 現在のフォーム状態・crop・画像source/finalと参照、削除・未保存ガードをPort ownerで保持。Studio独自の画像保存やStudio側だけのwriterを作らない |
| My Apps | 同じPortアプリのHome/管理route、my-apps store・icon/launch modules、myApps v7・icon IDB | preset、URL判定、crop・再編集と画像参照、並び順をPort ownerで保持。外部リンクとfocus/戻るをadapterで接続 |

`getCapabilities('pro')` はPortのテスト等で使う純粋なpolicy投影であり、実認証ではない。これをStudio製品コードへ渡す方式は採用できない。`isProAccessReady` はPort文書側の共有gateを前提にする。Studio入室一度の認証を各controllerへ安全に伝えるためには、共有認証ownerが期限・失効・generationを検証できる権限sourceを正式に定義する必要がある。Pro資格とAccount/device writer admissionは別の権限であり、PR #107のP2解決まで共有書込みを開放しない。

## 実装・合成確認

`tests/port-shared-tuner-fixture.browser.cjs` はloopback・使い捨てChrome profileの**試験専用**画面を作成し、Port Pro HTMLから `#tuner-view` を読み出して元DOMと照合し、Portの `initTuner` をそのまま呼ぶ。Port既存の純粋なPro policy投影をfixture内部だけに渡し、実認証とは扱わない。合成マイク、カポ変更、既存キーv3の保存と再読込、非active化・再開・destroy後のtrack停止を確認する。製品へPro権限を注入しない。

同fixtureのメトロノーム試験はPort Pro DOMと `initMetronome` を使用し、純粋policyで詳細UIが見えてもPro operation sourceがない場合は設定保存が拒否され、既存keyが変わらないこと、再生開始後に非active化で再生表示が停止することを確認する。この拒否は将来の認証接続を代替するものではない。

## 実装順と引渡し

1. Port/認証ownerと、Studio入室時の既存共有Pro gate、失効/再認証・世代の**liveな**検証source、タイムアウトと非同期取消を定める。ツール毎に別gateや無条件Proを置かない。
2. Port/Sync ownerがAccount/device generation・dataset revision・操作単位の権限を発行し、commit直前に失効・切替・writer競合を検証する。tunerの通常設定やmeter表示も含め、既存キー/schema・Proデータを保持する。Studio Project SyncとPort共通Syncの受入は別々。
3. Port ownerが同一のtuner DOM/CSSとcontroller lifecycleを正式moduleとして公開。Port単独Standard/Proの表示・保存・音声とStudio adapterを同じ実装で試験。Studio側は認証済みsourceと既存audio coordinatorを接続し、失効/非表示/移動/Global Stopで停止、非同期処理を取消す。
4. 次にメトロノームの既存Pro operation source・preset writerとaudio disposalを接続。続いて練習timer/未保存フォーム/添付、機材写真、My Apps iconとURLを順にowner側から抽出する。削除・画像source/final・参照・tombstoneの整合性と旧Portとの共存を確認する。
5. 既存Standard iframeを外すのは、実DOM・操作、全Pro設定、保存/再読込、5テーマ、audio、未保存、Standard/ProのPort単独回帰、合成Account/世代競合の受入後。実Pro/Account、Safari、スマートフォン、二端末Syncは更に別の受入。

Port standaloneのGate、認証・画像・保存契約を推測で変更せず、Studio entry gateもこのfixtureにより実装済みと扱わない。共有APIと最終入室ゲートは別ライン所有者のレビューが必要。

## 検証の限界と既知の失敗

Studio Nodeは1929 PASS / 2専用Cloud E2E skip。既存Studio画面と新規fixtureの合成Chrome回帰は76 PASS。Port関連Nodeは39 PASS、Port全体Nodeは1145 PASS / 4 FAIL（既知のNEWS badge・Dark baseline期待値）。Portの既存 `standard-readiness-browser.cjs` を合成認証・loopbackで再実行すると、初回Pro認証後の操作を通過した後、既報どおりreset後の再認証（line 128）でgateが閉じたままtimeoutした。試験全体はFAILであり、実環境の障害と断定できない。Port独立Proの完全回帰・Studio共通化完了とは扱わない。実際のAccount/Pro、二端末Sync、実機Safariとスマートフォンは未検証。
