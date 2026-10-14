# Structure Operation Adapter v1

Studio 0.34.0 / Port 1.22.18 / Studio schema1 / Authority physical2。
基点 `a6a12cb833fbd55c486067f1452c5f3fcd20d567`。履歴記録経路の接続であり、製品Undo UIの完成ではない。
[Domain History Core](DOMAIN_HISTORY_CORE.md)、[Editing Session](EDITING_SESSION.md)、
[Active Document Alignment](ACTIVE_DOCUMENT_ALIGNMENT.md)、[Shell Contract](SHELL_CONTRACT.md)を維持する。

## Owner / operation boundary

`js/modules/sheet-cruise/operation-adapter.js`は既存model helperとactive Structure sessionを結ぶmemory-only adapter。
第二stack、第二draft、repository writer、独立したactive documentを作らない。
session.domain=structure、target.projectId=draft.projectId、workspace active、Modal/IME状態を確認し、
`session.runOperation(label, stagingDraft => ...)`へ1回だけ委譲する。deleted/destroyed/closing/inputPendingはCoreも拒否する。
operation ID、session ID、history epoch、before/after、content generationの所有と最終検証はCore。
Adapterは保存revisionを生成せず、history entryのidentityを再利用しない。

| 接続操作 | 確定境界 / 内容 |
|---|---|
| セクション追加 | 既存追加button、既存既定名・4小節 |
| セクション削除 | 既存confirm承認、sectionと所属bar削除・再番号付けを1entry。最後のsectionは拒否 |
| セクション名 | name inputのchange。trim/空名補完も1entry |
| 小節増減 | section bar countのchange。既存1–64 clamp・追加/末尾削除・全体再番号付けを1entry |
| ストローク明示セル操作 | click / 既存cell key。override・pattern生成/変更・cleanupを1entry |
| 基本ストロークへ戻す | 既存button、override解除とmanaged pattern cleanupを1entry |
| コード/ドレミ一括 | 既存popoverの明示適用。現在小節から既存曲末尾まで、複数barを1entry |
| 譜面表示設定 | 既存checkbox/selectのchange。5表示flagと8/16 timing gridを1entry |

独立したbar CRUDとストローク一括入力は現行UIに存在しないため追加しない。
歌詞一括入力は従来どおり停止。解釈不能なコード/ドレミの警告と保存可能性は既存model契約に従う。

## Atomic publication / no-op / failure

model helperは引数のstaging draftだけを変更する。複数bar・再番号付け・pattern生成/cleanupの途中内容を
正式draft / working / playback / Pre-DTM / selection consumerへ公開しない。
Core validatorと最終content/identity guard通過後、1回のoperation通知と1entryで公開する。
model拒否はcallback内でthrowし、partial stagingをcancelする。例外/取消は旧draft/history/Redoを維持。
no-opはCoreの意味的比較で判定し、entry・Redo破棄・snapshotVersion更新なし。
単一巨大操作のhistory-overflowはCoreの既存契約どおりvalid draftを公開し記録不能をstatusに表示する。
「適用済み」を「履歴記録済み」と読み替えない。通常のcount/byte budgetは100件/8MiBのまま。

## Unconnected / native input

曲情報、基本ストロークの文字列、Paper/Loupeのコード・ドレミ、歌詞セル、連続文字入力/IMEは未接続。
実変更は既存Proxyを通り、既存history/openGroupがある場合はout-of-band barrierで無効化する。
その実draftを保持し、古いentryを後から適用しない。
section nameはchange確定だけを接続する。IME途中に離散操作を実行してbufferを失わせない。
選択、Loupe位置/幅、歌詞局所解像度、Theme、workspace状態はdomain履歴payloadへ含めない。
Undo/Redo製品button、Cmd+Z/Cmd+Shift+Z bindingは追加しない。native input Undoは従来のbrowser owner。
BrowserのCore undo/redo呼出しは隔離回帰の内部検証であり、製品操作として公開したものではない。

## Selection / focus / generation

barNumberはstable IDではない。section ID順とbarのsection ID/番号順を構造identityとして比較する。
構造が変わる操作では選択/Loupeと番号に依存する局所状態を解除し、同じ番号の別barへfocusを復元しない。
正式selection projectionも構造不一致時は旧番号を公開しない。実際に選択barが消えた場合は既存deleted表示を維持。
inactive projectのviewは構造identityも保持し、外部adoption後に戻る時の古い番号復帰を拒否する。
非構造operationのProxy置換では歌詞のUI-only局所解像度を対応barへ引き継ぐ。

RAFによるfocus/value復帰はsession object / sessionId / projectId / snapshotVersion、Active Document selection ticket、
selected bar、現在のworkspace/Modal/IME、focus epochを確認する。
同一contentでDOMだけ再生成され、別controlへのfocus移動が無い場合は復帰を許可する。
新しいfocus ownerや新しい内容には旧valueを代入しない。popover位置更新はfocus移動と分離してguardする。
既存layout RAFは現在stateだけを読み、古いdraft/valueを閉包から戻さない。
FileReader成功/失敗は開始session/content/ticketを固定し、内容変更後や別targetでは適用しない。
A/B/Aで同じ内容の元sessionへ戻った場合の既存「読み込み中止」通知だけは維持し、importはしない。
保存ACK等でversionが進んだ場合も旧content frameを無効化する。Undoでも古いversionへ戻さない。

## Save / external / document

Adapterはsaved / baseSnapshot / baseRevision / repository revision / project ID / schemaを変更しない。
dirtyは現在draftとbaseの意味的差分。保存成功後は履歴保持、Undoで保存内容と異なればdirty、Redoで一致すればclean。
保存失敗、pending/conflictで履歴とdraft/baseを保持し、履歴操作で競合を解除しない。
clean external adoption / 明示採用 / cancel / replace / destroyはCore規則どおりreset。
外部削除は退避可能なdraft/historyを保持し、追加operation・Undo/Redo・保存を停止する。
A/B/Aはsessionごとに独立、workspace往復で保持、reloadはsavedから新session・空履歴。
Pre-DTMは既存active documentのimmutable working snapshotで現在曲のJSON/MIDIを生成する。
曲切替や保存状態の切替を履歴記録の副作用にしない。

## Verification / scope

検証結果はROADMAP / PROJECT_STATEの本工程記録を正本とする。
Node追加29件: section/bar再番号付け、strum/cleanup、bulk/display、no-op、compound publication、
例外/取消/out-of-band/stale、generation/selection signal、A/B、save成功/失敗、external/conflict/delete、Pre-DTM、no I/O。
Browser追加44子試験＋親1: 実際の離散controls、1entry、saved/base不変、native/IME/Modal/focus、
A/B/workspace/Pre-DTM、保存成功/失敗・外部採用/削除、FileReader/RAF、inactive構造更新、局所解像度、reload、
4 Themes×390/768/1024/1440/1920、Print、console/404/network/no-write。
正規12 Browser suiteとStudio全Node（clean guard含む）も必須。

一括popoverの適用buttonがLoupe外でpointer hitできない既存レイアウト課題を、基点commitと最終候補で同じrect/hitとして確認。
今回は既存native keyboard Enterによる実適用を検証する。pointer配置修正は別UI工程。強制clickで成功扱いにしない。
実OS IME、Safari、実プリンター、DAW読み込みは自動試験の保証外。

Adapterのrepository write0。既存Studio明示保存のみ通常契約に従う。
Port dataset / Authority creation / ProDevice / Account / Sync-outbox / Worker-cloud mutation0。
Port/Shared/Worker製品コード不変更。Studio他module変更はversion/cache参照だけ。
Production legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / PortDataHost.canWrite=falseを維持。
既存8765/8766/PID25543、利用者profile、既存untracked不触。動的認証probe/deploy/D1/cutoverなし。

## Next stage

連続文字入力/IME/native Undoのownerとgroup境界を確定し、未接続経路を段階接続する。
実OS composition・変更前後のcaret・buffer・focus、保存/外部更新/曲切替とのgroup確定/取消、
bar安定identityが無い構造Undoの選択方針を検証してから製品Undo UI/shortcutへ進む。
全編集がUndo可能と表示しない。draft crash復旧・曲別arrangement・Port writerは別工程。
