# Structure Text Input History & IME v1

Studio 0.35.0 / Port 1.22.18 / Studio schema1 / Authority physical2。
基点 `119fec5777c9855e39d311323caf747d4df24372`。
[Core契約](DOMAIN_HISTORY_CORE.md)、[離散操作](STRUCTURE_OPERATION_HISTORY.md)、
[Editing Session](EDITING_SESSION.md)、[Active Document](ACTIVE_DOCUMENT_ALIGNMENT.md)、
[Keyboard / Modal](SHELL_CONTRACT.md#10-focus--keyboard-2-phase-router)、Song Model schema1を維持する。
製品Undo/Redo buttonとglobal shortcutは次工程。native inputのUndoをdomain Undoへ置換しない。

## Input inventory / ownership

| 対象 | 旧経路 | 現行確定・描画 |
|---|---|---|
| 曲名 / artist | inputで全フォームを直接draftへ読込 | 対象fieldだけをinputごとにCore公開。blur/Enter等でgroup終了。フォームinput DOMを保持 |
| capo / BPM | number input、parse/clampして全フォーム読込 | numberの既存値・範囲を維持、対象だけを同じgroupへ。text controlと一律扱いしない |
| original/play key / 拍子 | select changeで全フォーム読込 | 既存select change確定、input/change二重通知はno-op。即group終了 |
| bar gridコード / ドレミ | inputでmodel setter、paper再描画 | 対象bar/種別だけをCoreへ。grid input DOMを保持 |
| Loupeコード / ドレミ | input、compositionendでmodel setter、Loupe再構築 | 非IME inputはlive公開、IMEは確定のみ。paperを更新しLoupe input DOMを保持 |
| 歌詞tickセル | input/compositionend/既存key/blur。初期raw value差分でmodel更新 | tick/rangeをidentityに使用。既存cell移動/IME guardを維持、入力DOMを保持 |
| 基本ストローク | inputでpattern setter、paper再描画 | 既存記号parser/警告/cleanupをCoreの複合stagingへ。入力中のraw valueは正規化しない |
| セクション名 | changeで離散operation | 引き続きchange確定だけ。第二text entryを作らない |
| セクション数/strum/bulk/表示 | 既存離散operation | text groupを終了し、従来の1操作1entryを維持 |

DOMとnative Undoのownerはbrowser。domain before/after / entries / cursor / epoch / byte budgetのownerはEditing Session。
`text-adapter.js`はmodel setterを呼ぶだけでstack、saved正本、writer、timerを持たない。
フォーム全体を他fieldのbufferから再構築しない。Print/JSONは既に反映されたdraftを使いgroupを終了する。

## Core text group API

| API | 契約 |
|---|---|
| runTextOperation(key, label, edit) | 既存runOperationのprivate staging/validator/identity/expected-content checkで同期公開。Coreだけが直近entryを合体 |
| finishTextGroup() | 次の編集との合体を終了。draft/token/base/entryを変更しない |
| runCompositionTextOperation(key, label, edit) | inputPending中の明示IME確定専用。同期stagingに限り許可し、確定後group終了。Undo/Redo/Saveはpending解除まで拒否 |
| getHistory().textGroup | readonly key/entryIdまたはnull。manual staging openGroupとは別の合体identityであり第二stackではない |

keyはoperation kind / field / section ID / bar number / tick / rangeのJSON表現（1024文字上限）。
session object / sessionId / frozen project targetは既存Core ownerが保証。同じfieldでもblur/refocus後は別group。
barNumberはstable IDではなく、構造変更はgroup終了と既存選択/Loupe解除を伴う。旧controlはdetachされ適用不可。

通常typing/paste/delete/replaceは入力ごとにatomicな最新draftとsnapshotVersionを公開する。
同じ連続groupの直近entryだけを、新しいimmutable afterで置換。beforeとentryIdを保持する。
過去に渡したentry/snapshot objectを変更しない。subscriberは合体済みhistoryと全体内容を一度に見る。
通知中の再入操作へtext/composition許可flagを持ち越さず、別種operationを誤合体しない。

境界: blur、既存Enter確定、focus/field/logical target変更、project変更、workspace移動、Save開始、保存ACK、
IME開始/確定、native historyUndo/historyRedo、別種の正式operation、Core Undo/Redo、reset lifecycle。
時間だけで結合しない。finish後の同値input/遅いblurはno-opで重複entryを作らない。
実内容の同値updateはtokenを進めずRedoを残す。初回の意味的編集だけがRedo branchを破棄する。
groupのnet内容がbeforeに戻ればそのentryを除くが、実際に値が変化した各updateのtokenを巻き戻さない。
その間に既に行われた正式編集のRedo branch破棄は取り消さない。

100 entries / 8MiB before-after UTF-8 budget、overflow表示、protected identity/metadata、unknown field保持、
例外/validation/async拒否時のstaging取消はCoreの既存規則どおり。
通知を迂回したcurrent group driftもmerge前に拒否し、現在draftを保持する。

## IME / just-composed

compositionstartで先行text groupを終了し、元sessionとActive Document ticketを固定。inputPending=true。
compositionupdate/isComposing inputはDOM bufferだけを更新する。draft/history/workingにはまだ採用しない。
これは従来のLoupeコード/ドレミの「変換途中を直接draftへ書く」経路を置換する明示契約。
Inspectorは既存draftのコード名とediting状態を表示し、未確定bufferを正式コードや音として解析しない。
歌詞の従来の未確定buffer保護に他text入力を合わせる。全fieldをDOMから読む旧経路は撤去する。

compositionendで同じowner/ticketの場合だけ最終raw valueを一回stagingへ渡し、1entryとして確定。
Coreの狭いcomposition確定許可でもdeleted/closing/destroyed/不正target/validationを拒否する。
同期公開中もinputPendingはtrueであり、subscriberによるdomain Undo/Redoは拒否。
その後に既存root compositionendが元sessionのpendingを解除する。
composition直後の同値inputはcontrol-local justComposed/valueで抑制する。
justComposedはsetTimeout(0)まで。timer後も同値はCore no-opでentry/tokenを増やさない。
この期間のIME Enter/229、歌詞just-composed navigation guard、Shell IME guardを維持する。
別ownerへ遅れたcompositionendを適用しない。保存ACKのmetadata世代更新だけで正当な現在bufferを拒否しない。
取消で元の値に戻ったcompositionはno-opで、既存Redoを保持する。

## Native Undo / control lifetime

Cmd+Z / Cmd+Shift+Zはinput/textarea/contenteditable内のnative ownerへ渡す。
text adapterはkeydownでUndo commandを呼ばずpreventDefaultもしない。
beforeinput.inputType=historyUndo/historyRedoで先行groupを終了し、実input eventの値を新しい正式編集として同期。
そのnative編集後もgroupを終了する。Core cursorをUndo方向へ動かさず、古いgroup.afterを後で再適用しない。

通常typing/blur/refocus、IME確定、paper再描画、geometry observer、Save ACKでは入力DOMを保持する。
Loupeのvalue/caretをscriptで毎回交換しない。paper再描画の古いrefresh予約も入力中は抑制する。
実Chromeでnative Undo/Redoが値を変えること、履歴cursorは新規編集末尾であること、保存後dirty/cleanを検証する。

native履歴はDOMに属し、reload、別projectへのフォーム再設定、明示adopt/cancel/Core Undo/Redo、
構造変更、Loupeの対象/range/表示内容の再構築では継続保証しない。
離散strum/display・局所解像度など既存Loupe再構築経路もnative bufferの寿命境界になりうる。
その前にdomain groupを終了し、正式domain entry/draftを保持する。これを製品domain Undo UI完成とは表示しない。
入力中にnative履歴を失う問題と、明示したdocument/control context変更の境界を区別する。
number/selectのnative操作能力はbrowserに従い、text同等のnative Undoを独自に捏造しない。

## Save / external / document / callbacks

Adapterはrepositoryを書かず、saved/baseSnapshot/baseRevision/repository revision/identity/schemaを変更しない。
dirtyは現在draftとbaseの意味的差分。Save開始でgroup終了、通常成功/失敗でentryと追加draftを保持。
保存ACKでgroup終了し、ACK前後の入力を同じ保存境界へ合体しない。
dirty external pending/conflictはbase/draft/entriesを保持。Undoでcleanでも競合を解除しない。
clean adoption/明示採用/cancel/replace/destroyでreset。削除はdraft/history保持、文字/IME確定も拒否する。
A/B/Aのregistryはsession別に保持。workspace復帰でdraftを再読込しない。
Pre-DTMは現在working snapshotを読み、未確定IME/保存待ち/競合/削除は既存block。
出力開始後のsnapshot/JSON/MIDIは不変。別projectや古いsavedへfallbackしない。

FileReader、focus/value RAFは既存session/content/ticket/selection/focus owner guardを維持する。
遅延歌詞blurにも現在frameとisConnectedを追加し、古い値を新draftへ戻さない。
通常typingはcontrolを保持するため、caret/選択/Loupe位置/scrollを復元のために毎回破壊しない。
構造変更では既存の安全な選択解除を維持する。

## Verification / next

実測結果の正本はROADMAP / PROJECT_STATE。
Node追加38件: typing/group、paste/delete/replace、field/target/blur/Save、IME/同値input/取消、
native同期/二重発火なし、branch/no-op/A-B/new/save/failure/pending/conflict/adopt/delete、
stale content callbacks、DOM保持経路、generation/out-of-band/Pre-DTM/no-write、離散回帰、budget/再入を確認。
Chrome追加38件（親含む）: 実Cmd+Z/Shift+Z、実clipboard Meta+V、Loupe/grid/tick/native値変化、
typing/replace/delete/IME模擬/取消/数値/select/section境界、Save前後、A/B、workspace/Pre-DTM、
Modal/Escape、callback/focus/caret、4 Themes×390/1920/Print/no-write/console/404。
正規14 Browser suite、Studio全Node（clean guard含む）をrequired gateとする。
実OS日本語IMEの候補選択・Safari/他OSのnative歴史・実プリンター・DAWは未検証。
一括popoverのpointer配置問題は前工程の残件であり、本工程で修正しない。

次は製品Domain Undo/Redo UI/Keyboard readiness。native/text/IMEの所有、pending/deleted/save/modal eligibilityと
明示control再構築後のnative履歴寿命、構造Undoの選択方針を確認して段階公開する。
crash draft復旧、Port shared writer、Transportは別工程。

Port/Shared/Worker製品コード不変更。Studio他moduleはversion/cache参照のみ。
Production legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=false。
入力履歴repository write0、Port dataset / Authority creation / ProDevice / Account / Sync-outbox / Worker-cloud mutation0。
既存明示Studio Saveのみ維持。8765/8766/profile/untracked不触。動的認証probe/deploy/D1/cutoverなし。
