# Editing Session Domain History Core v1

Studio 0.33.0 / Port 1.22.18 / Studio schema1 / Authority physical2。
基点 `5b990d3e28ed0b9099bbe4f68cd462964d6dba49`。本工程はCoreだけであり、製品UIのUndo対応完了ではない。

## Owner / representation

既存Editing SessionのsessionId / domain / frozen target.projectIdがowner。
private historyはepoch / entries / cursor / bytes / status / reason / evictedを持つ。active targetや第二saved正本を作らない。
entryはentryId / sessionId / epoch / label / immutable before / immutable after / bytes。
同じsessionのUndo側はentries[0..cursor)、Redo側はentries[cursor..end)。戻す操作自体を新entryにしない。
entry/operation IDはそのsessionで単調採番し、branch破棄・clear後も再利用しない。
getHistory()のlist/entry/snapshot/limitsはfreezeし、callerへmutable historyや正式raw draftを渡さない。

payloadはJSON内容全体からprojectId / schemaVersion / createdAt / appVersion / updatedAtを除いたもの。
未知fieldは残す。restore時は現在draftのprotected fieldを保持する。operationがこれらを変更したら拒否する。
baseSnapshot / baseRevision / repositoryのsavedはUndo/Redoやoperationで変更しない。
DOM、selection、Loupe、Theme、appSettings、Port値、saved revision、native Undoは履歴に入れない。

## Synchronous operation API

| API | 契約 |
|---|---|
| beginOperation(label) | `{ok,operation}`。private staging draftをtokenに付ける。nested、IME pending、closing、deleted、destroyed、不正targetは拒否 |
| commitOperation(operation) | tokenのobject identity/session/epoch/contentVersion/現在期待内容/protected fieldを確認し、validatorを通す。成功は`{ok:true,recorded}` |
| cancelOperation(operation) | stagingだけをdiscardし、正式draft/history/cursor/Redo/tokenを変えない |
| runOperation(label, fn) | `fn(stagingDraft)`の同期複合操作。例外とfailureはstagingを取消。Promise/thenableを返すcallbackは拒否 |
| undo() / redo() | expected before/afterとidentityを最終確認し、現在draft内容だけを変更。commit中/openGroup/IME/closing/deleted/destroyedは拒否 |
| canUndo() / canRedo() | stack位置とlifecycle eligibility。実行時にも期待内容・validatorを再確認する |
| clearHistory() | 内容を変えずepochを進めて履歴を破棄。openGroup中/destroyedは拒否 |
| getHistory() | epoch/entries/cursor/openGroup ID/bytes/limits/status/reason/evictedCountのreadonly表示 |

例:

```js
const result = session.runOperation('セクションを追加', draft => {
    CruiseStudio.model.addSection(draft, 'Bメロ', 4);
});
```

callerは必ず引数のstagingDraftへ書く。通常のsession.draftへ書いた場合は履歴外変更として扱う。
manual begin/commit/cancelも同期API。callerがtokenを保持する場合、内容世代変更後はstaleとして拒否され、勝手に再適用しない。
低level commitの拒否時はcallerが修正またはcancelを解決する。runOperationは自動cancelする。
未対応async callbackの遅いstaging変更は正式draftへ採用せず、遅いrejectもcontainする。新timer/RAFは作らない。

## Atomicity / publication

stagingは正式draftではない。操作中もsession.draft / dirty / workingSnapshot / playbackSnapshot / consumer captureは
操作前の正式内容を読む。canCommitはfalseになり、未公開内容を誤って保存しない。
複合model setterの途中Proxy通知を正式subscriberへ転送しない。
最終内容をvalidatorへ渡し、次のowned trackerとdirty差分を準備してから履歴とdraftを一度に更新する。
成功確定はoperation、Undoはundo、Redoはredoの通知1回。prepare失敗は旧draft/履歴/Redoを保持する。
no-opは意味的内容比較でentryを作らず、Redoも破棄せず、snapshotVersionも進めない。
cancelOperation/例外でも既存draftを失わない。old stagingと置換前Proxyはdetachし、遅い変更が現在draftへ届かない。

通常のuntracked編集は従来のProxy通知・dirtyを維持する。既存editor全体を新Coreへ強制移行しない。

## Out-of-band / expected content

履歴またはopenGroupがある時、Proxyが検知したmetadata以外の実変更をout-of-band barrierにする。
entries/cursor/openGroupをinvalidateし、現在の実draftを保持。等価object代入とappVersion/updatedAtだけの変更は履歴破棄しない。
操作確定・Undo/Redo前にも内容一致を再確認し、通知を迂回したdriftで古い内容を上書きしない。
不一致はstale-operation / stale-historyとして拒否し、dirty差分を再構築、内容tokenを進め、history-invalidatedを通知する。
保存ACK等でmanual operationのtokenだけがstaleになった時は、保存済み内容や保持履歴を捨てず、操作を拒否してcancelを求める。

正式operationの意味的変更を確定した時だけRedo branchを破棄する。no-op/cancel/表示操作で破棄しない。

## Dirty / save / generation

dirtyの正本は現在draftと現在baseの意味的差分。cursor/件数/保存地点indexではない。
通常commit成功は履歴保持し、base/revision/metadataだけを既存保存結果に従って更新する。
保存後Undoは保存内容と違えばdirty。保存内容へRedoすればclean。新規未保存は初期内容にUndoしてもdirty。
保存失敗/result-unknown/stale ACKは履歴とdraft/baseを保持し、既存の結果確認・retry規則を維持する。
追加反例: clean再保存のfailure currentがmetadata-only新revisionを返す時、既存経路が自動adoptしてbase/history/errorを消していた。
修正前の正式Node反例FAILを確認。失敗結果のcurrentは常にholdBaseでpending化し、明示採用までbase/history/commitErrorを保持する。
repositoryのCAS/排他/write transaction、成功ACKの意味、実writeの取消扱いは変更しない。
commit中Undo/Redoは拒否。ただし既存直接編集と同期正式operationによる追加編集は許可する。
直接追加編集はhistory barrier、正式追加編集は1entryで保持。保存ACKは開始時snapshotへbaseを進め、追加draftを保持する。

operation/Undo/Redo内容変化はchangeSerialを進める。snapshotVersionは過去の値を復元しない。
既発行working/playback/output snapshotはfreezeされたまま。戻った内容が同じでも旧consumer frameを現行と扱わない。
clearHistoryだけは内容tokenを変えない。adopt/cancel/replaceは既存generationと内容serialを進める。

## External / lifecycle

- dirty external pending: base/draft/historyを保持。Undoでcleanになってもpending/conflict/commit不可を維持。
- clean external adoption: 新base正式採用とともにhistory reset。
- operation中external: 操作前draftがcleanでもpendingとし、staging開始元を無断置換しない。
- 明示external adopt / session cancel / 同project replaceDraft: history reset。pending cancelは最新repositoryを再確認する。
- 外部project削除: draft/history保持、Undo/Redo/operation/commit停止。JSON退避は既存経路を維持。
- A/B/A / workspace移動: sessionごとに保持。新規sessionは空履歴。
- destroy: 対応履歴を破棄。openGroupは明示discardなしではdestroy拒否。dirty/commit/inputの既存保護を維持。
- reload: persisted projectから新session・空履歴。history keyやproject fieldを保存しない。

## Capacity

既定はsessionごとに100 entries / 8*1024*1024 bytes。registry注入historyLimitsは正のsafe整数だけを受け付ける。
bytesは各before/after JSONのUTF-8 byte数を保守的に合算する（隣接snapshotを共有しても二重計上）。
labelは120 UTF-16 code unitsに制限。entryの短いidentity/label/JS object overhead、staging、callerが保持するsnapshotはpayload計数の外。
8MiBはJS heap総使用量の保証ではない。inactive sessionのdraftを容量理由で破棄しない。

規模選定: 現行sampleの第1小節を複製した合成projectのraw JSON UTF-8は、
16 bars 12,251 / 64 bars 45,515 / 256 bars 178,728 / 1024 bars 711,745 bytes（0.32.0測定）。
通常曲で100件程度を保持でき、大きい曲はbytes budgetから先に退去する。実運用に無制限履歴を持ち込まない。

entry数/bytes超過は古いcomplete entryから退去しcursorを合わせる。saved/base/現在draftは変えない。
残存先頭entryのbeforeが到達可能な最古内容。そこからさらに戻れるとは表示しない。
単一operationのbefore+afterが予算を超えた場合、valid最終draftは公開するが全旧branchをreset。
結果`{ok:true,recorded:false,code:'history-overflow'}`、history.status=overflow/reason=operation-too-largeで記録不能を明示。
canUndo/canRedo=false。no-op/cancel/例外は巨大stagingでも旧履歴を破棄しない。
次の記録可能な意味的operationは新branchを作れる。将来UIはoverflowを表示し、無制限に自動再試行しない。

## Validation / evidence

新Node74件、全Node654 PASS。既存正規Chrome12 suite270 PASSをrequired gateとする。
初期/1操作/連続UndoRedo/branch/no-op/cancel/compound/immutable/identity/A-B/new/save前後/failure/unknown/flight、
external clean/dirty/conflict/cancel/replace/deletion/reload/out-of-band/stale/generation/unknown fields/metadata、
count/UTF8/huge/eviction/no per-key full serialization/no writes/Active Document/Pre-DTM/JSON MIDIを確認する。

正式repo独立8767 / disposable Chrome / synthetic443Hz micだけを利用。既存8765/8766/PID25543不触。
Browserは既存UIが維持される回帰であり、新Undo UIを検証したものではない。
source/display0.33.0、4 Themes/390–1920/600px/Print/Audio/focus/IME/Modalを確認する。
Core repository write0、readerのPort/binary/Authority create/ProDevice/Account/Sync-outbox/Worker-cloud mutation0。
console error/app404/unhandled0。Studio既存明示保存は通常契約のまま。

## Unconnected / next phase

Structure handlersはrunOperation未使用。Paper/Loupeのoperation/undo/redo再描画adapter、Undo buttons、Cmd+Z/Shift+Z、
native Undo、連続入力/IME group、FileReader/RAF content token・focus ownerは未接続。
Core完成は製品Undo完了ではない。古い直接編集を黙ってhistory entryへ含めない。
次はStructure Operation Adapterを離散操作から接続し、未接続操作のbarrierを維持する。
文字/IME/native UIを別段階で接続し、全操作を対応済みと誤表示しない。
現在のbarNumberは再番号付けされるため、構造Undoの選択/focus復元は番号だけをidentityにせず安全な解除を設計する。

Port/Shared/Worker製品コード不変更。Studio Host等はimport ?v=だけ更新。schema1/Authority physical2維持。
Production legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=false。
Daybreak待機/L3c境界を維持。認証probe・本番deploy・D1 migration・cutover・shared write解禁なし。
