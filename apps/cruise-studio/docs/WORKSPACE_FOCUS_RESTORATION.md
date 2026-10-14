# Workspace Focus Restoration v1

Studio **0.31.2** / Port **1.22.18** / Chord **1.20.1**。Studio schema **1** / Authority physical schema **2**維持。
開始HEAD / origin/main / remote main: `c0f32687f0998c3a19870327d42a59c73e60f1ff`。

## 原因とfocus identity

Shellはworkspace内の最後のfocused DOM要素を記憶していた。
Practice / Gear / My Appsはactivateで一覧を再描画し、旧DOM参照が無効になるためworkspace rootへfallbackしていた。
正式browser回帰で3 workspaceの反例を修正前FAIL / 修正後PASSで確認する。

既存`focus-routing.js`へ小さなopt-in adapterを追加。
`{workspaceId,listId,itemId,role}`を記憶し、現在のDOMから一致する可視・enabledな要素を再取得する。
表示名、配列index、DOM順、選択IDをidentityに使わない。
同じitem IDでもmenus / sets / history等のlistとroleで区別する。同一identityが複数あれば曖昧として復元しない。

| 対象 | identity / 操作 |
|---|---|
| Practice menu / set | 正式item.idとlist名。既存buttonへfocusのみ |
| Practice history | 正式history record.id。readonly liをnative Tab到達可能にし、focus-visibleを表示 |
| Gear / My Apps item | 正式item.id。選択・詳細変更は既存の明示click / Enter / Spaceだけ |
| Search / status / category | controls + 固定control ID + search / filter role |
| read / more | 固定control IDとlist名 |

Shellの記憶にはidentityと直近elementを保持する。elementはlegacy workspaceとModal trigger照合の補助参照で、
再描画する3 workspaceの復元正本ではない。Structure / Loupe / Pre-DTM / Tunerは既存DOM参照の復帰経路を維持する。

## Selection / dataとの分離

focus復元はfocus({preventScroll:true})だけ。select、click、保存、検索/filter変更、並替え、detail変更を呼ばない。
選択とfocusは別々に保持する。別itemへfocusしただけで選択を移さない。
confirmed external deletionによる既存viewのselection解除はdata更新契約であり、focus復元による変更ではない。
workspaceのscroll位置、入力値・caret、filter、保存順を維持する。focusを永続化するkeyは作らない。

## External update / fallback

workspace復帰時に現在のDOMで再評価する。項目が存在し表示されていれば同じ正式IDへ戻る。
削除、検索からの除外、future/invalidでのrow消去、非表示、disabled、曖昧な重複は復元しない。
まずそのworkspaceの既存read control、利用不能ならworkspace rootへfallbackする。
stale/loading/errorでも最後のprojectionが表示しているrowは復元できるが、fresh値と認定しない。
非対応形式から戻っただけで、既に別controlへ移った利用者のfocusを旧itemへ自動移動しない。
data model、Host、repository、資格状態を補正・保存しない。

## Async / Modal / IME

復元処理自体は同期。新timer、RAF、observer、global keyboard handlerを追加しない。
再描画の直前に現在focusをcaptureし、同じ同期renderが除去したfocusだけを直後に復元する。
遅いread結果は既存epoch/hostガードを通り、その時点のfocusを使う。read開始時のfocusを後から適用しない。
現在のworkspace・hidden/inert・Modal ownershipを確認し、新しいinput/pane/dialog ownerがあればfocusを奪わない。
IME / just-composed中はrender後のfocus適用を抑制し、後から勝手に適用するretryを予約しない。

Modal中は背景更新でfocusを動かさない。Modal終了時は既存focus routingから、記憶したtrigger identityを再解決できる。
trigger削除時は既存の安全fallbackを使う。Modalのtrap、Escape、IME、browser shortcut契約を変更しない。
Shellのfocusin記憶は実際のdocument.activeElementに一致するeventだけを採用する。

## Lifecycle / 検証

reloadでfocus identityを初期化し、自動Port readなし。view disposeでhelperを無効化する。
既存DOM/Host購読の所有と解除を維持し、focus helperはlistener/timerを所有しない。

Node: baseline **529 PASS**、追加focus **31**、全 **560 PASS**（clean guard含む）。
新規Chrome focus **19 PASS**（独立18+親1）。既存正規10 suiteと合わせた実測はROADMAP / PROJECT_STATE参照。
menus/sets/history、項目/検索/caret/filter、同名/並替え/削除/検索外、stale/loading/error/future、Modal復帰、IME、
高速往復・旧read完了、4 Themes × 390/768/1024/1440/1920、Structure/Loupe、Active Document、Print、reload、50 disposeを確認する。
測定readerの禁止write・binary/Authority作成・予期しないproject dirty・console/app404/unhandledは0をrequired gateとする。
fixture writerは使い捨て環境の別pageで、正式Port Repositoryへ通常のdata更新だけを投入する。認証probeなし。

## 残件と安全境界

既知390px toolbar/Loupe overflow、Dock密度、domain Undo、Transport/実再生、Port正式write、binary本体は今回修正しない。
Safari / 実OS IME / 利用者の普段の画面倍率での最終操作感は実機確認を要する。
次はPC Shell / Dock / Narrow Layout Polish。

Port/Shared/Worker製品コード不変更。Host等のStudio import ?v=だけ0.31.2へ更新。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=false**。
Daybreak待機/L3c境界を維持。本番deploy・D1 migration・cutover・新規動的認証probeなし。
