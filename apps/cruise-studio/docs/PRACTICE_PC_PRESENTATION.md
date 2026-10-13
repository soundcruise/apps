# Studio Practice Read-only PC Workspace v1

2026-10-14 / Studio **0.29.0** / Port **1.22.18**（不変更）/ Chord **1.20.1**（不変更）。
開始HEAD / origin/main / remote main: `c2fcfef56f48fd575b88e523b70d168113bb8e09`。
Studio schemaVersion **1**、Authority physical schema **2**を維持。

## 所有と読み取り境界

Portがdataset所有者、Studioはread-only consumer。既存singleton `PortDataHost` / `PortDataConnection`を共有し、
Hostの`canWrite=false`と閉じたwrite capabilityを維持する。Practice独自repository、保存済みコピー、Editing Session、write APIはない。
Connectionは既存Port Repositoryの同一full snapshotから、下記catalog keyの値だけをHost内部へ渡す。
Hostは純粋な`projectPractice`で凍結した既知表示fieldへ投影し、raw値・asset資格・URLをUIに公開しない。
Account/Pro/Syncの接続・判定・readiness・保存処理は変更していない。

起動、navigation、load/activate、表示、購読はI/Oを開始しない。画面上の「ローカル保存値を確認」または既存Toolの明示readでHostを読み取る。
module実行がDOMContentLoadedより先でも後でも、同じHostをworkspaceへ接続する。
Hostの既存generation/request/Account検証とrepository通知による再readを利用する。Sync起動、ensure、bootstrap、migration保存は行わない。

## 正式schemaと表示範囲

正本はPortの`port-dataset-repository.js` catalogと各Practice store実装・テスト。
`practice-projection.mjs`のvalidatorは閲覧に使うfieldの判定であり、正式writer validatorの代替ではない。
未知のfieldを公開せず、読込元のobject/stringを一切変更しない。旧形式はmemory上の表示だけとし、保存・修復しない。

| catalog key（cruisePort.） | 対応形式 | 閲覧内容 |
|---|---|---|
| schemaVersion / practiceMenus | 1–3 | 保存順、名前、時間、memo、hidden設定、作成/更新時刻、アプリの表示名。schema marker不一致はinvalid |
| practiceMenuSets | 1 | 名前とitemIdsの順序。非表示・欠損参照もslotを保持 |
| practiceProgress | 1–3 | cycleId、checked/counted、全totalCounts、completionPending種別。新cycleを生成しない |
| practiceHistory | 1–5 | 全eventsの過去のpracticeName、保存localDate、予定/実測/セッション/実働時間。サイクル完了・セッションも表示 |
| practiceCalendar | 1–2 | 保存localDate、text、icon、time/endTime。練習historyと予定を同じ日付一覧へ投影 |
| myApps | 1–7 | メニュー参照のid/nameだけ。URL・launch・資格は未接続 |
| syncAssetMetadata | 2–4 | attachmentsのファイル名、kind、byteSize、mimeType、menu参照。公開metadataのoriginalFilename優先はPortに一致 |

履歴の名前を現在メニュー名で上書きしない。削除済みmenu、missing My App、set/progress/attachmentのsoft referenceはfallbackを表示し、
参照先schemaが未対応なら「確認できません」と区別する。欠損を理由にhistory/progress/slotを削除しない。
不正なcollectionはinvalidを明示し、無効行だけを黙ってfilterして正常扱いにしない。添付metadataの不備は個別行に隔離する。

## Attachment / Binary

`cruisePortPractice` IDBのattachment recordにはBlobが同居する。既存`getAttachments`はDB作成とbinary取得を伴い得るため、呼び出さない。
このDBを開かず、既存datasetの`syncAssetMetadata.attachments`だけを表示する。
local-only添付がmetadata datasetにない場合は「ローカル添付の有無は未確認」「binary未接続」と表示する。
添付がないとは断定しない。内容取得、preload、download、upload、delete、assetネットワークAPIは未接続。

## UI / Data states / External update

Shellの正式workspace `practice` / `screen-practice` とNavigationを追加。
Feature Registry `port.practice.implementedPresentations=['main']`。owner/capabilityは既存Port policyを維持し、metadataをauthorizationにしない。
広い画面はmenu一覧+詳細 / set一覧+詳細を2列、狭い画面は1列。既存Theme Contractのsemantic tokenを使用する。
全collectionはimmutable modelに保持し、UIだけ50件ずつ追加表示する。Portのlocal append上限をmerged読込上限として使わない。
Calendarは保存localDateを使用し、timestampのtimezoneから日付を書き換えない。

未確認、loading、正常、absent、empty、read error、stale、future/unsupported/invalid、soft reference欠損、閲覧専用を区別。
Host invalidation/再read中とread失敗時は、最後に取得した凍結projectionへの一時参照をstaleと明示して表示できる。
これはPort origin-localのdataset参照で、旧Account資格やSync/Pro状態をPracticeで表示しない。永続化・再保存・独立dataset化はしない。
新しい正常snapshotに対象stable IDが残れば選択を維持し、確認済みの削除/empty/absentだけで解除する。
future/invalid中は選択IDを保留し、誤って削除と判定しない。removed controlのfocusは確認ボタンへ退避。

workspace往復はload/readを繰り返さない。pane/Dockは既存Shell、通常Tab/Enterはnative button、Escape/IME/Modal/Saveは既存router所有。
Practiceはkeydown、timer、observer、独自global lifecycle listenerを追加しない。
DOM clickは1購読、Hostは1購読。host交換/disposeは古い購読を解除し、late readをepoch/host identityで拒否。
panelのpagehideでHost購読と一時値を解除し、persisted pageshowで新Hostへ接続する。reloadは自動read・選択復元なし。
Printは既存A4譜面専用policyを維持し、Practice画面を印刷対象から除外する。

## 検証

- 変更前Studio Node **381 PASS**。変更後 **420 PASS**（追加39、clean guard含む）。commit後も全件実行する。
- 既存Studio正規Chrome6 suite **154 PASS**（親6件含む）。Practice Chrome **20 PASS**（独立19+親1）。Host既存browser **10ケースPASS**。
- Port関連readonly schema/soft reference回帰6ファイル **68 PASS**。Port/Shared/Worker製品コードは不変更。
- 正式repo rootを独立`127.0.0.1:8766`で配信し、使い捨てChrome profileを使用。画面/source **0.29.0**一致。既存8765は不触。
- menu/set詳細、progress/history/Calendar、添付metadata、empty/error/stale/future/unsupported、正式Repository外部更新/削除、選択/focus維持。
- history **8101**、Calendar notes **1501**でも全modelを保持し、表示50→100件を確認。4 Themes、390/680/1024/1440/1920幅、workspace往復、pane/Dock、native keys、IME/Modal、print/reload。
- 50 mount/attach/disposeでDOM/Host listener残存0。Nodeでも実mountを確認。
- measured Studio readerのPort LS mutation / IDB mutation / Practice save/delete / Authority DB create/write / Account / Pro Device / Sync-outbox / Worker network mutation / cloud publish / binary取得 **すべて0**。fixture writerを別pageに分離。
- app console error / 404 / unhandled rejection **0**。Studio自身の既存Theme等の保存はPort writeと区別。

通常UIのgate成立を記録するもので、Authorityの安全性承認・認証問題の解決・M3 write解禁を意味しない。

## 未接続と次工程

menu/set/Calendar編集、progress更新、timer結果保存、history削除、正式共有保存、asset本体閲覧、Account/Sync操作は未接続。
将来の編集はPortの正式writer、Editing Session、Authority/最終admission契約に従って別工程で接続する。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
L3cの未解決境界・Daybreak待機を維持し、新規の動的セキュリティprobe・Worker変更・本番deployは行わない。
次はPC閲覧機能の実機確認と優先度整理。正式共有writeの再開判断はDaybreak結果と別のgateを要する。
