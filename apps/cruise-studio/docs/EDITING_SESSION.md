# Structure Editing Session v1

## Active Document Alignment（0.31.1・現行）

[Active Document契約](ACTIVE_DOCUMENT_ALIGNMENT.md)が、以下のPre-DTM独立選択・saved fallbackの旧実装境界を更新する。
registryのactive Structure sessionを唯一の対象正本とし、両selectorを同じownerへ接続。
未保存draftはworking snapshotとして出力し、dirty/base/savedを維持する。
external pending・削除・未確定入力・保存待ち・future/invalidではPre-DTM出力を止め、draftを保持する。
既存commit/CAS/履歴/Printの保存契約は変更しない。以下のバージョン・検証・未接続記述は各工程時点の履歴。

APP_VERSION 0.24.0 / schemaVersion 1。責務の正本は[Shell Contract v2.1](SHELL_CONTRACT.md)、
本書はStructureへの実装境界と検証・制約を記録する。

## 所有とsnapshot

`js/core/editing-session.js`はDOM・音声・Sync・認可を持たない。注入されたrepositoryと既存
`model.validateProject`を利用する。Structureのstate.project / state.dirtyはsessionへのgetterとし、
第二の編集中projectやdirty flagを持たない。

| 状態 | 所有・更新条件 |
|---|---|
| saved snapshot | repositoryで最後に確認できた保存状態。外部更新があればbaseと異なることがある |
| baseSnapshot / baseRevision | sessionが正式採用した保存状態。dirty時の外部更新では進めない |
| draft | sessionが所有する可変JSON。代入されたobjectも複製し、外部aliasの無追跡変更を防ぐ |
| working snapshot | draftから発行するdeep clone / freeze。Pre-DTMはさらに複製・固定する |
| playback snapshot | 呼出時のdraftをdeep clone / freeze。後続編集・外部採用で既発行snapshotを変更しない。実再生は未実装 |

sessionにはsessionId / domain / target / baseRevision / baseSnapshot / draft / dirty / validation /
externalUpdatePending / conflictを公開する。内部状態はcommitId / generation / commitInFlight /
commitError / snapshotVersion / destroyed / inputPending。sessionIdとprojectIdは別のidentity。
`target={type:'project',projectId}`を内部でも複製・固定し、callerの参照変更で対象を移動させない。

## Registryとlifecycle

`getOrCreateSession(domain,target,initialDraft?)` / `getSession` / `getActiveSession` /
`activateSession` / `deactivateSession` / `destroySession` / `listSessions` / `subscribe` / `dispose`。
`domain + target.type + target.projectId`が同じなら同じsessionを返す。Inspector等も同じsessionを参照可能。

- 初回だけrepository.read。activate / deactivateは再読込しない。
- workspace移動はactive document/session参照を保持し、destroyしない。
- project A→B→Aは別sessionでdraftを保持。selection / Loupe / UI解像度 / scrollもprojectごとに保持する。
- destroyは明示APIのみ。未保存draftは`discard:true`の明示意図がない限り拒否する。未確定入力は拒否する。
  displayed paneを閉じるdestroy UIは今回追加しない。将来pane ownerがdetachしてから呼ぶ。
- registryはrepositoryへのsubscriptionを一つだけ持つ。subscribeは解除関数、disposeは通知を解放する。
  disposeをdirty破棄成功として扱わない。
- 新規draftは保存前なのでdirty。cancelは初期draftへ戻すが、保存済みにはならない。
  storage読込不可でも新規draftをmemoryに保持する。保存時には改めてrepositoryで検証する。

## Dirty・validation・未確定入力

observable Proxyは変更pathを記録し、そのpathとbaseの意味的差分を比較する。入力ごとのproject全体
JSON.stringifyは行わない。値を元へ戻すとclean、同値object代入はclean。appVersion / updatedAtはdirtyから
除外する。commit後には現在draftと新baseの差分を再構築する。snapshotコピーはcommit・consumer境界で行う。

modelが追加後のpatternを更新する場合、projectに入った所有参照を再取得する。既存modelのschema・音楽処理は
維持し、初回基本ストロークと小節overrideで、コピー前の一時参照だけを更新しないようにした。

commitは既存validatorを使う。failureやvalidator例外はvalidation / commitErrorへ返し、draft / baseを保持する。
別schema truthやdomain Undo stackは作らない。

IME bufferは意味的draft差分とは別に`inputPending`で保護する。Structureのcomposition ownerが開始・終了を
sessionへ通知し、未確定中はSave / cancel / replace / project切替を抑制する。cleanでも外部更新はpendingへ
置き、IME入力欄を再生成しない。確定後も外部baseを暗黙採用せず、入力済みdraftを保持する。

## Commit・cancelと非同期結果

`commit()`は開始時のdraftをコピー・freezeし、baseRevisionと
`{sessionId,commitId,generation}`を固定してrepository.saveへ渡す。二重commitは抑制する。

- 成功結果は3つのtokenに加え、保存対象projectId・revisionを確認する。
- saved / baseはcommit開始時の保存結果。最新draftは保持する。
  `A保存開始→B追加入力→A成功`ではsaved=A / draft=B / dirty=true。
- workspace・projectが変わっても結果は発行元sessionへ返す。新しいdocumentをcleanにしない。
  background saveはcurrentProjectIdを変更しない。
- failure / 結果不明 / stale resultはbaseを進めず、draftとerrorを保持する。retryは再読込・revision比較を通る。
  読込失敗をtarget削除と誤認しない。
- `cancel()`は通常baseSnapshotへ戻す。pendingがある時は最新repositoryを再確認して正式採用する。
  外部削除ではdraftを保持してcancelを拒否する。
- commit中cancel / destroyは結果を待つ。成功後cancelは成功した保存状態へ戻す。
  failure / 不明なら破棄せず失敗を返す。既に保存されたwriteを「保存されなかった」と扱わない。

## External update・conflict

registry / sessionの`applyExternalSnapshot({target,revision,snapshot,source,deleted?})`が受付境界。
repositoryは検証済みの現在状態を通知する。通知順だけをrevisionの新旧とみなさず、storage eventの古い
newValueも使わない。Port / sync-remoteは将来source名を渡せるが、今回接続しない。

| 状態 | 結果 |
|---|---|
| clean + external | base / revision / draftを採用、clean。可能なselection / focus / caret / scrollを保持 |
| dirty / commit中 / IME未確定 + external | base / revision / draftを保持。externalUpdatePending / conflictを公開 |
| target deletion | draft保持・commit不可。JSON exportは可能。cleanな対象でも復活保存を自動許可しない |
| own commit通知 | commit結果と取り違えず、外部conflictを生成しない |

`conflict={incomingRevision,incomingSnapshot,source,deleted}`を検査可能。
`keepDraft()`は保持状態を返すだけで、base更新や上書き許可を与えない。
`adoptExternal()`は確認後の最新保存状態を採用する。UIはpending時だけ「保存済みを採用」を表示し、
draft破棄の確認を行う。削除対象では無効化する。自動merge・force overwrite・大型merge UIは追加しない。

将来のdomain history境界:
clean external adopt / 明示conflict解決でnew base採用 / pending cancelによるnew base採用はreset。
dirty external pendingと自sessionの通常commitは保持。現在Cmd/Ctrl+Z / Redoは未所有でnative controlに委ねる。

## Repository・revision・別tab

既存保存機構には正式revisionがない。`js/core/project-repository.js`は既存project keyに保存された
**raw JSON文字列そのもの**をopaque revisionとする。schemaVersion / APP_VERSION / Date.nowとは別。
同じtimestampでもpayload差分を検出する。project JSONへrevision fieldや新keyを追加しない。

`read(target)` / `save({target,snapshot,baseRevision,token})` / `remove(target,baseRevision)` /
`canWrite` / `subscribe` / `attach` / `dispose`。既存migration / validationを再利用する。

- Web Lock `cruiseStudio.projects.write`で比較からproject・collection index書込まで排他する。
  indexはlock内で最新状態を読み、対象entryだけ更新する。古い一覧で別projectを消さない。
- Structure保存、Home sample作成・import・deleteの本番writerをこのrepositoryへ接続した。
  storage.jsのread / export / import validation / appSettings APIは維持する。
- Web Locksなし・storageアクセス不可は保存を有効にしない。unsafeなlocalStorage同期fallbackは作らない。
  draftとJSON exportを保持する。HTTP localhostまたは適切なsecure contextが必要。
- 書込失敗では自transactionのproject / indexを復旧する。復旧失敗はresult-unknownであり、成功扱いしない。
  localStorageはACID transactionではないため、プロセス強制終了時のproject / index原子性は保証しない。
- 同Studio通知と、同origin別tabのstorage eventをsessionへ接続する。attachは冪等、disposeはlistener解除。
  event.newValueではなくrepositoryの現在値を再読込する。別tab実Chromeでclean / dirty / deleteを確認した。

**保証範囲は、このrepositoryとlockに協調するwriter間。** 互換のため残したlegacy storage.saveProject /
deleteProjectや旧build・DevTools直接書込はlockに協調しない。変更は通知／保存前比較で検出可能だが、
非協調writerが比較直後に割り込む競合の完全排他は保証しない。Port / Sync共有書込の保証へ流用しない。
M3の全writer協調・正式data owner・資格・delete intent検証は別工程。

ブラウザAPIの参照: [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)、
[storage event](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event)。

## Save・Focus・Pre-DTM・print

Save buttonとCmd/Ctrl+Sは同じ`studio.save` commandを使う。
明示editingSession targetを実行時に固定し、Structure active / no modal / session.canCommitを確認する。
focusがNavigationへ移ってもtargetを消さない。workspace非activeではSaveを所有しない。
text controlの通常shortcut除外は維持し、Structure adapterがSaveだけを`keyboard.localCommand`へ委譲する。
IME・modal・hidden / inert・処理済みeventはgateする。Studioが消費したSaveだけpreventDefaultする。

app.jsのsource providerはactive Structure sessionのworkingだけを返す。
Pre-DTMの別project選択も正式ownerで同じsessionへ切り替える。独立したsaved fallbackは使わない。
Pre-DTM activate / 明示入力再読込 / JSON・MIDI exportで選択sourceを更新する。
activateはloadを呼ばず、伴奏設定や選択を初期化しない。dirty working使用時は小さく未保存由来を表示する。
新規未保存projectも同じ入口で読める。実再生・自動playback更新はない。

Structure print / Project JSONはvisible draftを維持する。Theme / pane / modal closeはdirtyやcancelへ影響しない。
ページ終了は全sessionのdirty / commit中 / 未確定入力をbeforeunloadで保護する。

## 検証と残工程

- Node: Editing Session / repository 61、既存Shell19 / Metadata22 / Theme32 / Keyboard・Modal27、計161 PASS。
- 隔離Chrome: Editing Session22 + 既存Keyboard・Modal20 = 42ケースPASS。親containerを含むNode表示は44。
  全独立検証ケースは203件（161 + 42）。
- 重要4 scenario、button / Cmd・Ctrl+S、in-flight追加編集・cancel、project A/B/A、同Studio・別tab更新・delete、
  保存失敗retry、validation、IME未確定、storage拒否、saved fallback、未保存新規、print / Theme / pane / modalを確認。
- 50回workspace往復でdraft / selection / focus / load各1回を保持。
  keydown Capture1 / Bubble1、session外部通知1回、subscription cleanupを確認。console / 404なし。
- 0.23.1固定baseline: Project JSON8,077 bytes / Arrangement JSON26,991 bytesはappVersionのみ0.24.0。
  MIDI813 bytesのSHA-256は`5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`で一致。
  A4 PDF1200pxラスタは`8cc02f7356af60a0bbccf9349148c57d0c0784f13b2588b2b3cdb107f75a406e`で完全一致。
  dirty出力はtitle / BPM / 第1小節Dm7の意図した差だけを確認し、MIDIのtempo123・D bassを確認した。
- Chrome CDP日本語composition・既存IME guardsを維持。Safari / OS IME / 実プリンターは今回再検証していない。

次はMetronome M1。memory-only timing/audio / Dock / lifecycle / Coordinator leaseの範囲を別指示で開始する。
Undo / Redo domain history、project選択一本化、merge UI、Transport、Sync / Account / Pro、M2 / M3は未実装。
