# Studio Gear & My Apps Read-only PC Workspace v1

2026-10-14 / Studio **0.31.0** / Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`f859b9c968e2e19b5c454201bab01b6be0d5cadb`。
Studio schemaVersion **1**、Authority physical schema **2**維持。

## 所有と読取り

PortがdataOwner、Studioはread-only consumer。既存singleton PortDataHost/Connectionを共有し、`canWrite=false`を維持。
Gear/My Appsの独立repository、永続copy、writer、Editing Session、Sync runtimeは作らない。
既存full dataset snapshotからcatalog keyだけを`libraryValues`としてHost内部へ渡し、`projectLibrary`で既知表示fieldへ凍結投影する。
raw値、asset資格/キー、未知field内容は公開modelへ渡さない。元のobject/stringは一切変更せず、旧値・unknownを保存/修復/削除しない。
Account/Pro/Sync/Authorityの接続・判定・保存・readinessは不変更。partial snapshotでの削除判定やcollection欠落の書戻しはない。

起動、workspace load/activate、購読、検索/filterはI/Oを開始しない。
各workspaceの「ローカル保存値を確認」、または既存Tool/Practiceの明示readで同じHostを読む。
Hostの既存generation/request/Accountガード・repository通知による再readを利用し、badge/metadata表示だけでensure/provisionしない。
library panelは既存Shell初期化後に一度mountし、ESM/DOMContentLoadedの実行順序にかかわらず既存Hostへ接続する。

## 正式schema / Gear

正本は`gear-list-store.js`、`gear-category-store.js`、`gear-list-ux.js`、`port-dataset-repository.js`と既存tests。
catalogは`cruisePort.gearList` schema5、`gearCategories` schema1、`syncAssetMetadata` schema2–4。

- 正式identityはitem.id。メーカーは`manufacturer`、名前/モデル等の登録文字列は`name`。独立したbrand/model fieldを捏造しない。
- statusは`owned`（自分の機材）/`sold`（手放した機材）/`wishlist`（ほしい機材）。all表示はPort exportのowned→sold→wishlist順、各status内は保存order昇順。
- categoryは保存定義のnameを優先。欠損時はPort `getGearCategoryName`のlegacy label→ID fallbackと未確認表示を使う。カテゴリ定義を初期化/復元しない。
- priceText、priority、memo、createdAt/updatedAt/ownedAt/soldAt、photoId/photoSourceId/photoCropのmetadataを表示。
- unknown status/order/fieldは未対応として表示し、既知statusや新orderへ補正しない。配列/所有順を保存し直さない。
- category名の上限はPortと同じ40 Unicode code points。

**Gear schema1–4はv1ではreadonly unavailable**。既存loadGearListはこの範囲をschema5へmigration保存し、
loadGearCategoriesはdefault作成・名称/order補修・missingカテゴリ復元を保存するため、どちらも呼び出さない。
旧schemaの安全な表示adapterや正式migrationは別工程。今回のcurrent schema5閲覧を旧データ統合完了とは扱わない。

## 正式schema / My Apps

正本は`my-apps-store.js`、`my-apps-launch.js`、`my-apps-known-apps.js`、`my-apps-icon-presets.js`と既存tests。
catalog `cruisePort.myApps` schema7（表示は1–7と既存mixed v6/v7 recordを扱う）。id/nameと保存配列順を保持。
独立した「app preset/custom」fieldはない。以下を混同しない。

| 保存情報 | v1表示 |
|---|---|
| launchMode / appKey / customLaunch | HTTPS登録、既知/カスタムの旧起動設定metadata。未知key/値は未対応のまま表示 |
| urls | ios/android/macos/windows/webの保存値。現行routingは端末別urls→web→legacy url fallback |
| url | 旧共通URLとして保持。stored valueを変更せず、非対応URLも起動しない文字列として表示 |
| iconPresetKey | 正式preset catalogのlabelと保存key。未知keyは未対応 |
| iconId / iconSourceId / iconCrop | custom icon参照metadata。presetと併存する場合も片方を削除/補正しない |
| Practice appId | `myapp:<stable id>`のmenu参照とhistory参照。過去のpracticeName/localDateを維持 |

旧launchMode/appKey/customLaunchは現行URL routingに使用しない。Studioはlauncherをimport/起動せず、URLをanchorにしない。
補正、scheme付加、外部window/navigation、アプリ自動起動、外部サイト検証、外部icon URL取得を行わない。
known-app/icon presetの**label getterだけ**を既存definition moduleから参照する。graphic factoryやsrcは使わない。
source loaderのmissing key/unknown appKey/preset repairも実行しない。projection validatorは表示境界で、正式writer validatorの代替ではない。

## Binary / Soft reference

Gear写真DB `cruisePortGear`、My Apps icon DB `cruisePortMyApps`のrecordはBlobを含む。open/record取得をしない。
photo/icon store/workflow/processor/cleanup APIをimportしない。object URL、img/canvas、download/upload/resave/orphan cleanupなし。
保存参照、crop、`syncAssetMetadata.gear/myApps`のpublished finalのbyteSize/mimeType等だけを表示する。
published参照やIDがあっても画像本体の存在/閲覧可能性を確定しない。local-only binaryは未確認と表示する。
存在しないcategory、unknown app/preset、削除済みmenu/appのhistoryを不正に削除・修復しない。
My Apps削除の観測でもPractice保存値・過去名を変更しない。参照schemaがfuture/invalidなら未確認と区別する。

## Workspace / Search / Lifecycle

正式workspace `gear`/`myApps`、実Navigation、Feature Registryはそれぞれimplemented `main`/`separate-workspace`。
ownerApp/dataOwner/syncOwnerと既存write policy requirementは維持し、metadataをauthorizationにしない。
広幅は一覧+詳細の2列、狭幅は1列。semantic Theme token、native labels/buttons/search/selectとfocus-visibleを使用。
Gearは所有状態/category/メーカー・名前・memo等の検索、My Appsは名前検索のみ。検索/filterはephemeralでPortに書かない。
filter解除で元の保存表示順へ戻る。選択対象がfilter外でも詳細を保持して明示する。

未確認/loading/正常/absent/empty/error/stale/future/unsupported/参照欠損/readonlyを区別。
invalid/futureの件数を0と断定しない。未知field内容は未表示だが原本を保持する。
Host invalidation/再read/error中は最後の凍結projectionへの一時参照をstale表示できる。永続copyやAccount資格状態の再利用ではない。
新しい正常snapshotにstable IDがあれば選択を維持し、確定削除/empty/absentだけで解除する。future/invalid中はIDを保留。
検索/status/categoryを更新時も保持し、削除category filterは一時的な未確認optionとして保持する。
removed itemのfocusはreadボタンへ退避する。

DOMのclick/input/changeと各viewのHost購読だけを登録する。timer/observer/global keyboard/lifecycle listenerは追加しない。
input後の同値change（blur）では再描画しないため、クリック/Tab先のbuttonを破壊しない。
workspace往復・pane/Dock・resizeはread/loadを再実行しない。Host交換は古い購読を解除し、late readをepoch/host identityで拒否。
既存panelのpagehide/pageshowで両viewをdetach/reconnect。reloadは選択・検索・filterを初期化し、自動readしない。
Tab/Enter/Escape/IME/Modal/Saveは既存ownershipを維持。検索SpaceはMetronome/Tuner操作に使わない。
Printは既存A4譜面専用policyを維持し、Gear/My Appsを除外。

## 検証

- baseline Studio Node **457 PASS**、変更後 **497 PASS**（追加40、全既存/clean guard）。commit後も全Nodeを実行する。
- 新規Gear/My Apps Chrome **22 PASS**（独立21+親1）。既存正規8 browser suite **197 PASS**。合計219 runner tests。
- Port関連4ファイル **56 PASS**（Gear list/category、My Apps store/launch）。製品コード不変更。
- 正式repo rootの独立`127.0.0.1:8766`、使い捨てChrome。画面/source **0.31.0**一致、既存8765不触。
- formal Repository writerは別fixture pageに分離。rename/delete/external refreshでstable selection/query/focusを維持・削除時だけ解除。
- empty/absent/read failure/stale/future/unsupported field、URL補正なし、missing ref、2001件ずつの全model保持/50→100件表示。
- 50回mount/host交換/disposeでDOM/Host listener残存0。4 Themes、390/680/1024/1440/1920幅、IME/native keys/Modal/pane/Print/reload。
- measured Studio readerのPort LS/IDB/Gear/My Apps/Authority/Account/Pro Device/Sync-outbox/Worker/Cloud write **0**、binary DB open **0**、Authority DB create/write **0**、object URL生成 **0**。
- 外部record URL/image通信/自動open/popup **0**。app console error/404/unhandled rejection **0**。Studio自身の既存Theme保存は区別。
- 既存Practice NodeのHTML区間検査をそのsectionへ限定し、別workspaceの検索inputを誤検出しないよう修正。
- 既存Keyboard試験はnative IME後の保護期間/遅延DOM再構築を待ち、コード値・focusのassertionを維持した。

両機能を同工程で実装できた。binary本体、Gear旧migration、正式write/共有保存、My Apps起動/リンク変更/並替えは未接続。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
Daybreak待機/L3c未解決境界を維持し、認証/認可の動的security probe・本番deployは行わない。
今回の通常PC閲覧gateをAuthority安全性承認やM3解禁と扱わない。
