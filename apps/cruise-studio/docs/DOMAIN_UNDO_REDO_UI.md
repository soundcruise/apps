# Structure Domain Undo/Redo UI & Keyboard v1

Studio 0.36.0 / Port 1.22.18 / Studio schema1 / Authority physical2。
指定基点 `7318efca01f8fdf54f502ba615a8e059f8dfd827` の後にNEWS-only 2 commitを確認。
実測HEAD/origin/main/remote mainは `41567bb52ffd92d9056ed173adecda4b779c2099`、tracked/staged空、ahead/behind0/0。
指定基点が祖先であり、差分はworkers/sound-cruise-news内だけ。並行作業を保持し、NEWSコードへ変更しない。

[Core](DOMAIN_HISTORY_CORE.md)、[Operation](STRUCTURE_OPERATION_HISTORY.md)、[Text/IME](STRUCTURE_TEXT_HISTORY.md)、
[Editing Session](EDITING_SESSION.md)、[Active Document](ACTIVE_DOCUMENT_ALIGNMENT.md)、[Shell](SHELL_CONTRACT.md)を継承する。
Coreのundo/redo/canUndo/canRedo/getHistory/text groupの意味、payload、容量、saved/base契約は変更しない。

## Product controls / owner

Structure toolbarの既存action stripへ「元に戻す」「やり直す」を追加。
既存btn-ghost/compactとStudio semantic tokenを使い、disabledをnative button属性で公開する。
ARIA label / aria-keyshortcuts / title（⌘Z、⌘⇧Z、Ctrl+Z、Ctrl+Shift+Z）を持つ。
成功/失敗はtoolbar内の非表示role=statusから読み上げる。保存・競合statusを上書きしない。
390pxでは既存横scroll stripから操作でき、Printは既存toolbar除外を継承する。

`history-commands.js`は既存Editing Sessionを対象にする薄いcontroller。
履歴stack、draft、saved、active document、repository writerを追加しない。
`studio.undo` / `studio.redo`を既存command routerへ登録し、workspace keyboard bindingへ接続する。
Shell編集sessionとactive document、現在Structure sessionの一致を確認する。focusからprojectを推測しない。

## Eligibility / execution

| 状態 | product command |
|---|---|
| 正しいactive Structure session + 対応entry | 実行可能 |
| live text group | 既に公開された値をfinishTextGroupでsealして実行 |
| manual staging openGroup | 拒否。勝手にcommit/cancelしない |
| IME / inputPending / just-composed / keyCode229 | 拒否、遅延実行しない |
| repository commit中 | 拒否、ACK後に再評価 |
| destroyed / closing / deleted / 不正project/schema | 拒否。Coreの最終guardも維持 |
| validation recovery/block / empty / overflow / invalidated history | 拒否。新たな正当な履歴ができた時だけ再評価 |
| Modal / 別workspace / 別editingSession・activeDocument | 拒否 |
| dirty external pending/conflict（非削除） | 編集履歴は操作可能。conflict/baseは保持 |
| 通常保存失敗 | 有効な履歴は維持し操作可能。保存結果不明等の既存pendingを解除しない |
| repository保存不可のmemory draft | 有効な履歴なら操作可能。保存権限とは分離 |

disabled表示と正式product APIは同じcontroller.canを使う。
routerでtargetを一度固定し、実行時に再確認、入力確定後にも現在owner/eligibilityを再確認してからCoreへ委譲。
UI disabledだけに依存しない。Coreはexpected content/session/epoch/validatorを最後に確認する。
実行成功したshortcutだけをconsumeする。操作不可のキーを予約して後からUndoすることはない。

## Pointer / focus / field settlement

history buttonのprimary pointerdownをpreventDefaultし、編集中controlからの先行blurを抑える。
クリックはnative ownerではなく明示domain command。live text groupはentryを追加せず終了してからUndo/Redoする。
未確定section名は既存changeで正式に確定してから操作する。初期履歴が空ならbuttonはdisabledのまま。

非構造の復帰は現在snapshotでform/display/section/grid/paper/Loupeを描画し、現在field/caret/scrollを可能な範囲で保持。
sectionは安定section ID、gridは非構造時だけbar number、Loupeは非構造時だけrow/tick/cellで復帰する。
構造が変わる場合は既存の選択/Loupe解除。番号が同じ別barへfocusを復帰しない。
古いbuttonがdisabledになった場合や旧controlが消えた場合は、利用可能な反対側history buttonまたはproject selectorへfallback。

正式browser反例で2点を修正した。
- redrawSession直後の予約RAFがLoupeを再生成して復帰focusを失う。正式描画後の重複refreshを抑えgeometry更新だけにする。
- native changeはDOM removal途中にも発火し、isConnected=trueのことがある。Undo後の旧section値が再記録されていた。
  section名/数controlはfocus/input時のsession/content frameを固定し、change時に最終照合する。
  同じ反例で旧名、cursor、focusの復帰を検証。外部pendingではcontentを保持するため正当な入力を拒否しない。

## Keyboard / native / IME / Modal

Cmd+Z / Cmd+Shift+ZとCtrl+Z / Ctrl+Shift+Zはactive Structureの非入力領域でdomain command。
既存keyboard bubbleのinput/textarea/select/contenteditable/role=textbox除外を維持する。
readonly/disabled inputも保守的にnative除外のまま。readonlyでChrome標準Undoが別native fieldへ作用する場合も、
domain Undo/Redo通知は発火せず、実inputはText契約の新規編集として同期する。
readonlyを理由にdomainへ暗黙fallbackしない。number/selectのnative能力はbrowserに従う。

native Cmd+Z/Shift+Zをdomain commandと同時に呼ばない。実Chromeの値変化・通知・cursorを検証する。
局所keydownを持つstrum buttonだけは、root所属/非text/active workspace/IME/Modalを確認してlocalCommandへ明示委譲。
keyboard routerのhandled eventで一回実行。text inputの局所Save/Escape、musical cell key、browser標準キーは維持する。

IME途中のbufferを確定/破棄してUndoしない。compositionend直後も既存just-composedの間は拒否。
setTimeout(0)は期限後のbutton eligibilityを現在ownerで更新するだけであり、Undo要求を保存しない。
元session/Active Document ticketが変われば旧timerを無視する。
Modalは既存capture/native top layer/IME guardを所有し、背面button/shortcutは拒否する。
Escape/Save/pane/workspace/Audioの既存所有を変更しない。

## History / lifecycle / save / consumers

新編集、group終了、Undo/Redo、branch、Save開始/成功/失敗、external pending/adopt、project切替/deletion/destroy、
workspace往復、focus/Modal、IMEの状態をbuttonへ反映する。
registry通知はstate.session一致時だけ反映し、古いA通知でBのbuttonを更新しない。

Undo/Redoはdraftだけを変える。saved/baseSnapshot/baseRevision/repository revisionは不変。
Save後Undoは意味的に違えばdirty、保存地点へのRedoはclean。保存失敗で履歴/draft/baseを捨てない。
外部競合はUndoでcleanでも保持。削除済みprojectを再作成しない。reloadではmemory historyは空になる。
FileReader/RAF/遅延blur/IME ownerのsession/content/ticket guardを維持し、過去tokenを復元しない。
Pre-DTMはUndo/Redo後の現在workingを使い、JSON/MIDIの曲と内容を一致させる。開始済み出力は不変。

native履歴はcontrolに属し、明示domain Undo/Redoのsnapshot再描画では継続保証しない。
以後のnative input変更は新しいdomain編集。これはnative履歴とdomain履歴を一つにする機能ではない。
通常typing/IME/native operationの既存DOM保持は変更しない。

## Verification / remaining

実測件数の正本はROADMAP / PROJECT_STATE。
Node追加57件: UI contract、disabled/focus/toolbar、Meta/Control domain/native routing、text exclusion、
IME/just-composed/Modal/別workspace/group、branch/save/failure/flight/conflict/delete、A-B/通知/旧target、
callback/redraw/selection、Pre-DTM/JSON/MIDI、Themes/390/Print/no-write/read-only Host、cleanup/recovery/再入target。
Chrome追加53件（親含む）: 実button/keyboard A–H、native input/textarea/contenteditable/readonly、
IME/just-composed、pointer/disabled/focus/caret、unconfirmed section反例、strum委譲、model全表示、
save/failure/flight/conflict/adopt/delete、A-B/旧通知、Modal/別workspace、旧FileReader/destroy、
4 Themes×390/768/1024/1440/1920/Print、version/console/404/no-write。
Studio全Node（clean guard含む）と正規15 Browser suiteをrequired gateとする。
実OS IME候補操作、Safari/他OS、実プリンター、DAWは未検証。
既存一括popover pointer配置、crash draft復旧、曲別arrangement、Transportは別工程。

Daybreak待機中のProduction legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=false。
Undo/Redo repository write0。Port dataset / Authority creation / ProDevice / Account / Sync-outbox / Worker-cloud mutation0。
既存Studio明示Saveのみ維持。Port/Shared/Worker/NEWS製品コード不変更、他Studio moduleはversion/cache参照だけ。
既存8765/8766/PID25543/profile/untracked不触。新規動的認証probe/deploy/D1/cutoverなし。
