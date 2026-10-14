# Cruise Studio Shell Contract v2.1

## Domain Undo/Redo製品UI補足（0.36.0・現行）

[Undo/Redo正式契約](DOMAIN_UNDO_REDO_UI.md)が製品button/shortcut未公開の旧境界を更新する。
Structure toolbarとactive workspaceのCmd/Ctrl+Z・Shift+Zを既存Coreへ接続。入力欄はnative owner。
IME/just-composed/Modal/flight/deleted/recovery/別target拒否、live group確定、saved/base/競合保持。
非構造focus/caret復帰、構造選択解除、旧section change/content guard、Pre-DTM current workingを維持。
以下の未公開・未接続・version・検証件数は各工程時点の履歴。今回の結果はROADMAP / PROJECT_STATE参照。

現行Active Document実装境界は[Active Document Alignment v1](ACTIVE_DOCUMENT_ALIGNMENT.md)を参照。
0.31.1でStructure / Pre-DTMの対象正本とselectorを一本化し、§32の独立選択・saved fallback未解決境界を更新する。

- 状態: 正式採用（設計契約。実装完了・動作合格・公開を意味しない）
- 採用日: 2026-10-10
- 対象: 未リリースのCruise Studio PC統合アーキテクチャ
- 根拠: PC実画面UI監査、Shell v1、Astra / Claude Codeレビュー、Shell v2、両者の最終Bレビューとユーザー指定の追記
- 今回: 本文書とROADMAP / PROJECT_STATEの文書更新だけ。コード・データ・認証・同期は変更しない

## 1. 目的・文書の役割・保護範囲

Cruise Studioは、Cruise Port / Cruise appsの機能・データ契約・Sync・Pro・Versionを正確に共有し、PC専用UI、Structure譜、五線譜、TAB、MusicXML、MIDI、DTMへ展開する制作ソフトとする。

Studioは未リリースで大幅再設計できる。リリース済みCruise Port / Chord / Pitch / Fretboard / Rhythm / Cruise Sync / Accountの既存動作・保存データ・認可を破壊しない。共有化のため既存側を変更する必要が生じた場合は、対象範囲と回帰条件を明示した別工程で扱う。

| 文書 | 役割 |
|---|---|
| [SHELL_CONTRACT.md](SHELL_CONTRACT.md) | 詳細責務・状態・操作・段階移行の正式source |
| [ROADMAP.md](../ROADMAP.md) | 今後の依存順・完了条件 |
| [PROJECT_STATE.md](../ai-handoff/PROJECT_STATE.md) | 現在地・実測baseline・次工程・引継ぎ |
| [DECISIONS.md](DECISIONS.md) | 過去の個別設計判断・履歴 |

Shell統合に関して旧ロードマップや旧ADRの前提と異なる箇所は本契約を優先する。過去の実装経緯は削除しない。特に「ランチャーだけの連携」「既存pro-gateへそのまま乗る」「F3へ直行」は現在の統合方針として採用しない。DECISIONS等の追加整備は、許可された別工程で行う。

正式repoは `/Users/murakamimasakuni/Desktop/2.AI_Work/Cruise_apps/`。`Cruise_apps_old_20260717/` と `Cruise_apps_migration_bundle_20260717/` は読み取りも含め使用禁止。

## 2. Shell構造・responsive・共通原則

基本配置は左Navigation rail、中央Main workspace、右開閉式Inspector / Tool pane、下Dock / Transport。補助presentationとしてDrawer、Dialog、Separate workspaceを使う。presentationの配置とmodal性は別の属性とする。

| viewportの目安 | 配置 |
|---|---|
| 1440 / 1280px | Mainの必要幅を満たす場合にInspector常設可能 |
| 1024px以下 | Main優先、右paneはoverlay中心 |
| 800px付近 | Main最優先、Inspector初期閉 |
| 高さ不足 | Header / Dockをcompact化。主要操作への到達性を確保 |

固定breakpointだけでなく、実際のMain可用幅・高さ・zoom後のCSS寸法を優先する。幅不足の際はpaneの常設を解除する。表示中のpane内focusを非表示要素へ取り残さない。

維持する原則:

- mobile UI全体を埋め込まない。機能単位のPC presentationを用意する。
- UI hostとdata owner appIdを分離する。Port-owned dataをStudio独自datasetへ複製しない。
- modalだけfocus trapを持ち、非modal pane / Loupe / overlayはtrapしない。
- UI表示状態とaudio稼働状態を分離する。
- 自由MetronomeとTransport clockを分離する。
- pane状態はprojectへ保存しない。Studio appSettingsのUI設定と実効表示状態を分ける。
- audio runningは永続化しない。復帰時に自動再生しない。
- Pro資格をmetadataへコピーしない。
- mobile hostの既存lifecycleを維持する。
- 初回Metronomeではproject BPMを自動同期しない。

## 3. 状態と責務の所有者

| 状態・責務 | owner |
|---|---|
| 保存済みsnapshot / revision / 書込規則 | data owner repository / service |
| baseSnapshot / draft / dirty / validation / Undo・Redo | Editing Session |
| active document / selection / pane / focus / scroll | Shell / workspace |
| read-only working snapshot | Editing Sessionが発行し、Pre-DTM等が読む |
| 再生用snapshot / 音楽的位置 | audio feature / Transport |
| resource lease / context・mic所有関係 / interruption | Audio Coordinator |
| outbox / remote revision / Sync conflict / full dataset | 既存Sync層 |
| Product policy / 検証済みaccess / backend認可 | 各認可層（19節） |

保存済みsnapshot、編集中draft、再生用snapshotは共有mutable objectにしない。再生開始時に保存済みまたはworking状態の複製を固定し、外部更新で無断交換しない。各ownerは論理的責務であり、すべてを独立package / classにすることを要求しない。

## 4. Editing Session

最低限、`sessionId`、`domain`、`target`（stable reference）、`baseRevision`、`baseSnapshot`、`draft`、`dirty`、`validation`、`externalUpdatePending`、`conflict`、`commit`、`cancel`を持つ。

targetはowner・対象種類・安定IDを参照する。DOM、表示行番号、並べ替えで変わるbarNumberを安定IDの代わりに使わない。初期StructureではprojectIdをsession targetとし、小節の対応付けはdomain adapterが管理する。

| 契機 | 規則 |
|---|---|
| 開始 | snapshotとrevisionを一組で取得し、draftを分離する |
| draft変更 | session内だけを変更し、dirtyとvalidationを更新する |
| validation | domain規則で検証。非同期結果は現在のdraft generationと一致する時だけ採用 |
| 同じ対象を複数paneで編集 | 初期は同一sessionを共有。paneを閉じても自動cancelしない |
| commit開始 | draftとbaseRevisionを固定。一sessionの同時commitは禁止 |
| commit成功 | 保存されたsnapshot / revisionをbaseにする。commit中の追加編集はdirtyとして残す |
| commit失敗 | draft・履歴・dirtyを保持し、validation / conflict / access / storage等の理由を示す |
| cancel | 自分のdraft変更を破棄し現在の保存済み状態を採用する。repositoryには書かない |
| target削除 | commit禁止、draft保持、依存する再生を停止。無断で同名対象を再作成しない |
| Pro失効 | draftは削除しない。保護action / commitを止め、stored Pro値を初期化しない |
| 非active化 | session・draft・履歴を保持する |
| project切替 / destroy | 破棄を伴う場合だけ保存 / 破棄 / 中止を解決する。commit中は6節に従う |

他sessionの保存やpending外部更新で、dirty sessionのbaseRevisionを勝手に進めない。repositoryはcommit時に渡されたbaseRevisionと最新状態を比較する。collection全体を書き換える経路では、関連containerのrevisionも保護し、古い全体snapshotで他対象を消さない。

revisionは永続schema追加を前提とせず、既存payloadのfingerprint等から構成できる。ただし比較と書込の排他は別途必要で、通知やfingerprintだけを別tab競合の完全防止策にしない。保存結果不明・部分失敗は成功扱いせず、再読取・復旧へ進む。

## 5. External UpdateとUndo / Redo

| 更新元 | dirtyでないsession | dirty session | 再生中 |
|---|---|---|---|
| same Studio別pane | 同一sessionなら状態共有。別sessionのcommitは外部更新として採用 | 同一sessionならdraft共有。独立sessionならpending / conflict | 再生snapshot維持 |
| 同Studio別workspace | 更新を採用。非activeの表示更新は復帰時でもよい | draftを保持しpending化 | 元の再生対象・snapshot維持 |
| 別browser tab | 最新snapshot / revisionを再取得して採用 | baseを維持しpending化 | snapshot維持 |
| Port | 同じdata ownerへの更新として採用 | Studio draftを保持し競合を通知 | 実行中settingsへ無断適用しない |
| Cruise Sync remote | Sync apply結果をrepository経由で採用 | draftを直接置換せずpending化 | snapshot維持 |

dirtyで外部更新をpendingにしている間は、baseRevision / baseSnapshot / domain Undo / Redo履歴を維持する。外部更新または競合解決により新しいbaseSnapshot / baseRevisionを正式採用した時、初期実装ではdomain Undo / Redo履歴をリセットする。自sessionの通常commit成功ではUndo / Redo履歴を維持する。

cancelによって新しい外部baseを採用する場合も上記履歴境界に従い、破棄したdraftを古い履歴から復活させない。native controlのUndoは局所editorが管理し、domain履歴と混在させない。

初期はdirty draftの自動mergeを行わない。最新状態の確認、自分の変更の再適用、draft破棄と最新状態の採用を明示操作にする。外部状態を採用するまでbaseを更新しない。

外部更新は先にrepositoryへ反映し、sessionと再生への適用を分ける。画面全体reloadを標準解決策にしない。focus / caret / scrollを不必要にリセットしない。target削除・失効では必要な停止を優先する。更新元は診断情報であり認可根拠ではない。

## 6. commit中のcancel / destroyと非同期結果

commitごとに`commitId`を発行し、発行元`sessionId`、session generation、固定draft、baseRevisionを対応付ける。

- commit中のcancel / destroyは、commit結果確定まで完了させない。
- workspace切替自体は許可し、発行元Editing Sessionを保持する。
- 結果は発行元のsessionId + commitIdへ返す。現在表示中の別document / sessionをcleanにしない。
- 非同期結果は、受取先sessionの現在のgeneration / sessionId / commitIdと一致する時だけ適用する。workspace非active化だけでこのsession generationを変更しない。
- 表示先workspaceの結果適用は別に判定し、古い画面callbackで新documentを更新しない。
- commit中の追加編集は保持する。成功時も現在draftが保存対象と異なればdirtyを維持する。
- cancel要求後に保存が成功していた場合、「保存されなかった」と表示しない。成功した書込をcancelで取り消した扱いにしない。
- 成功が確定した後で保留cancelを実行するなら、残った未保存変更を破棄し、成功後の保存済み状態を採用する。必要な破棄確認を省略しない。
- 失敗・結果不明ではdraftを保持し、再確認・破棄・中止を解決する。失敗を理由に自動destroyしない。

画面表示用のgeneration不一致でUI更新を捨てる場合でも、実際に成功したrepository書込は消えない。session保持・commitId管理・再読取により結果を正しく回収する。

## 7. Command Target

focused control、active editing session、active document、selected object、active musical input session、active transport、active audio ownerを独立して保持する。

commandは`target`、`canExecute`、`execute`を持ち、処理結果に`consumed`を持つ。実行時に対象を固定し、権限・revision等を必要な境界で再確認する。

| command | target |
|---|---|
| Save | 明示されたEditing Session。project保存はactive document session、Gear保存はGear session |
| Undo / Redo | 入力欄内はnative履歴、それ以外は明示sessionのdomain履歴 |
| Play | 明示的にbindされたactive Transport、またはfeature自身のaudio session |
| Stop | 対応するTransport / audio session |
| Global Stop | Studio Coordinatorに登録された全audio session |
| Escape | 最上位の処理可能な局所UI。勝手に全停止・draft破棄へ結び付けない |

Structure表示中にGear Inspectorを編集していても、Gear保存・project保存・Playは独立可能とする。focus移動だけでTransport対象を変更しない。曖昧なSaveで複数dirty sessionを一括保存しない。

## 8. Workspace lifecycle

| lifecycle | 意味 |
|---|---|
| load | 対象読込・session作成。初回または明示対象変更時 |
| activate | 表示、command scope、focus / scroll / Loupeの復帰 |
| deactivate | 非active化。draft / session / 履歴を保持 |
| suspend | 理由を伴う描画・入力・資源の一時停止 |
| resume | pending更新を確認して復帰。audioは自動再開しない |
| destroy | sessionの保存 / 破棄 / 中止・commit結果を解決後、購読・observer・listener・資源を解放 |

activate()はload()を呼ばない。現行Structureのenter()は保存projectを再読込するためworkspace復帰には使わない。workspace切替でdraftを破棄しない。初期は非activeのdirty sessionをメモリから無断退去させない。

保持は開いているStudio内の契約であり、ブラウザ終了・crash後のdraft復旧を保証しない。復旧機能は別の保存契約として設計する。

## 9. Pre-DTMとStructure working snapshot

現行Pre-DTMが保存済みprojectを読む経路は、Structureの未保存draftやcurrentProjectIdと乖離しうる。初期Shellでは次を正式方針とする。

- 同一active projectのStructure Editing Sessionにdraftが存在する場合、Pre-DTMはそのsessionのread-only working snapshotを入力にする。保存済みprojectへ戻さない。
- working snapshotはdraftを複製したimmutable入力であり、Pre-DTMは元draftを編集しない。
- 生成処理ごとにsnapshotとgenerationを固定する。draftが更新された場合の再生成も、古い非同期結果を新入力へ混ぜない。
- project選択はShellのactive documentに一本化する。Pre-DTM独自の選択操作でStructure draftとcurrentProjectIdを乖離させない。
- MIDI / JSON等がworking snapshotから生成された場合、必要に応じ「未保存変更を含む」とUI上識別できる設計余地を残す。
- Pre-DTM入力の更新と再生snapshotの交換は別の操作とする。再生成だけで実行中再生へ無断反映しない。

次の無変化refactorでは入力注入の境界を準備する。実際のworking snapshot利用とproject選択一本化はEditing Session接続工程で有効にし、準備だけで問題解消済みと報告しない。

## 10. Focus / Keyboard 2-phase router

### Capture phase

最上位modal / blocking overlayが背面操作を止める。modalは初期focus、背景操作抑制、Tab / Shift+Tab trap、終了後のfocus復帰を持つ。Escape等を処理した場合consumedとし下へ渡さない。

背景を止めるcapture処理は必要なeventだけを扱い、modal内部の入力・IME・native操作を一律に破壊しない。非modal overlayという配置だけを理由にtrapを設けない。

### Bubble phase

focused editor / native control → musical input → workspace → Shell globalの順に解決する。処理済みcommandは下位へ二重実行しない。

Shell bubble handlerは以下を入口規則とする。

1. event.defaultPreventedまたはconsumedなら無反応。
2. input / textarea / select / contenteditable / role=textbox内なら、IME判定より先にglobal / workspace / musical shortcutから除外する。event経路とfocused controlを考慮する。
3. 編集領域除外後、非編集領域のIME状態を確認する。
4. targetとcanExecuteを確認し、execute結果がconsumedの場合だけ適切にpreventDefault / 伝播抑制する。

StructureのisComposing / keyCode 229 / internal composing state / justComposed guardを維持する。入力欄内のSave等を追加するなら、対象を知る局所handlerで個別定義する。

既存Structure document Esc listenerはShell導入前refactorで、非active workspace、defaultPrevented、modal側処理済みの場合に無反応とする。将来workspace command層へ統合可能な境界を作る。既存の局所popover → セル編集解除 → Loupe終了の優先順を維持する。

## 11. Inspector / Tool pane / Dialog

Inspectorは「現在選択されている対象に従属する詳細・編集」に限定する。

| 内容 | presentation |
|---|---|
| 選択小節のChord候補 | Inspector |
| Chord全体検索 | Tool pane / workspace |
| Gear一覧 | Main |
| 選択Gear編集 | Inspector |
| NEWS | Main / workspace |
| Account | Settings workspace |

右側領域を共用してもinspectorStateとtoolPaneStateは別stateとし、切替でdraftを破棄しない。選択変更時は旧sessionを保持するか保存 / 破棄 / 中止を解決する。Drawer / overlay / Separate workspaceは配置選択であり、modal性・session寿命を暗黙に決定しない。

## 12. Dock

Transport areaとAuxiliary tool areaを論理分離する。初期Auxiliary toolは最大1つで、自由Metronomeはこちらに置く。Transport未実装時はTransport領域を縮小できる。

Dock折畳みをaudio停止と同一視しない。折畳み中も再生状態と停止操作へ到達可能にする。tool交換で動作sessionを終了する場合は停止・cleanupを解決する。Dock表示から保存・Sync・timingを直接所有しない。

## 13. Scroll

- Mainが主scrollを所有する。同方向のnested scrollを避ける。
- pointer / focus領域がscroll ownershipを持つ。
- Inspector独立scrollと、timeline / ruler / track header等の同期scrollを許容する。
- Shell globalがwheelを横取りしない。
- zoom後も保存 / 閉じる / Stopへ到達可能にする。
- workspaceごとにscroll位置を保持する。
- print時にscreen用scroll / height / grid / fixed / stickyを解除する。

通常2、例外3程度は目安であり絶対上限ではない。DTMの複数領域をこの個数で禁止しない。

## 14. Audio Coordinator

所有するのはaudio session registry、resource lease、競合判定、AudioContext owner情報、microphone owner、interruption、device change notification、cleanup、global stopだけ。

音楽的位置、tempo map、Rhythm判定、Pitch出題、Metronome音色、score event生成、settings保存、Sync、Pro判定は所有しない。権限判断は認可層が行い、Coordinatorはその停止要求を資源操作へ変換する。

sessionId / owner / resource / generation / 状態 / stop・dispose境界を登録する。排他lease取得を直列化し、競合する同時startを両方許可しない。Global Stopは未完了startを無効化し、scheduler・発音・micを止め、ownerへcleanupを要求する。一sessionの失敗で他sessionの停止を中断しない。

初期管理範囲は同じStudio context内。他tab、Port、OS上の音声まで制御できると仮定しない。UI非表示・workspace非activeと停止policyは別に扱う。

## 15. AudioContext

- Studio全体で1contextを初期必須条件にしない。
- contextごとにownerは一つ。borrowerはclose / suspend / recreate禁止。
- borrowerは自分のnode・発音だけを止め、context全体の操作はownerへ要求する。
- 初期Metronomeは個別context + Coordinator lease。
- Tuner / Rhythm / calibration等は専用context可。
- recreate時はgenerationを更新し、旧node / 旧start結果を再利用しない。
- 将来、同じTransportに同期するgraphを共通timebase / 同一contextへ寄せられる境界を残す。
- 個数よりownership / timebaseを先に統一する。Offline exportは別処理。

異なるcontextのnodeを直接接続する設計にしない。shared contextへ移行する際は発音先とcontext取得を分離し、mobile hostの既存close / recovery経路がborrower権限を越えないことを確認する。

## 16. Microphone lease

状態はidle → requesting → active → releasing → idle。終了理由cancelled / failed / interruptedは要求ごとのsessionに保持する。初期Tuner / Rhythm microphone / calibrationは排他。

requesting開始時にrequest token / generationとleaseを固定する。activeではstream / track / nodeを発行元sessionが所有する。releasingで解析・callbackを停止し、所有資源だけを解放する。

古いgetUserMedia要求が後から成功した場合、token / generationを確認し、返った古いstreamのtrackだけを即stopする。その要求が所有するcontextも解放するが、新owner / 新session / 新streamに触らない。古いreject / finally / cleanupも新sessionの状態を変更しない。

cancelは未解決要求を論理的に無効化する。destroyを未解決Promiseで無期限に待たせず、遅延応答には旧要求専用cleanupを残す。lease解放もowner token一致時だけ行う。

## 17. mic vs audio UX

競合するStudio管理音声が動作中なら「停止してマイクを開始 / 中止」を確認する。競合がなければ確認不要。承認後、lease取得直前に再確認し、競合対象が変わった場合は無断停止しない。

mic開始失敗後も、mic終了後も、停止したMetronome等を自動再開しない。初期Tuner / calibrationで競合音声継続を標準にしない。将来録音 + clickの共存は、その用途の明示policyで設計する。他tab / 外部アプリまで無音化できると表示しない。

## 18. Transport三層

| 層 | 責務 |
|---|---|
| Clock / Transport | count-in / loop / seek / tempo change / position / record / tempo map |
| Event Scheduler | 音楽eventから実行時刻への変換、先読み、取消、世代管理 |
| Renderer / Sound | 指定時刻の発音、音色、gain、node |

自由Metronomeは独自clockを持つ。Transport追従clickはTransport clock / eventへ接続し、自由Metronomeの独立進行を停止する。同じclickの二重scheduler・二重event発行を禁止する。Rendererが独立して音楽的位置を進めない。

loop / seek / tempo変更では旧世代の未来eventを取り消す。自由Metronomeの遅延復帰処理をDAW位置・録音時刻の基準へそのまま流用しない。BPMにはbeat unitを伴わせ、Portの複合拍子とproject / MIDIの四分音符基準を数値だけで同一視しない。

## 19. Pro / Account

Product policy、Runtime access state、Account / AppDevice credential、Backend authorizationを四層に分離する。

metadata capabilityはProduct policy参照だけでauthorizationには使わない。実資格・token・検証結果をmetadataへ保存しない。action実行直前とcommit直前にaccessを再確認する。既存pro-gateをfeature単位検証器としてそのまま利用できるとは仮定しない。

Standardへ戻っても保存済みPro設定を削除 / 初期化せず、effective settingsだけを制限する。保護action停止時もdraftは保持する。有料backendはProとAccount / deviceを別々に検証し、edition表示・URL・client flagを認可根拠にしない。

## 20. Sync host / data owner

StudioがPort-owned dataを扱う場合、ownerApp / data owner / dataset appIdはportを維持する。Studio側の別datasetへ複製しない。

- 同一context・同じAccount / datasetではruntimeをget-or-createで共有し、featureごとに重複生成しない。
- status読取 / subscribeとensure / provisionを分離する。badge表示だけでensureしない。
- status経路からmigration write、資格作成、接続、poll起動を暗黙に実行しない。
- partial snapshot禁止。未表示collectionを削除扱いせず、full Port dataset contractを維持する。
- validation / backup / outbox / conflict / delete intentを維持する。
- Sync apply後はrepositoryへ更新通知し、Studio全体reloadを行わない。
- Account切替では旧runtime・購読を解除し、旧namespaceを新sessionへ混ぜない。

同一originでも全writerが協調できない場合、Studioからの共有書込を有効化しない。local save、migration、preset削除、Sync applyを含め、比較と書込が共通排他規則へ参加する必要がある。Web Locks等への非参加writerを安全と仮定しない。異なるorigin間ではlocalStorage / lockを共有できないため既存Sync契約で扱う。

## 21. Metadata v1 / Version reader-first

最小catalog必須項目はfeatureId、ownerApp、appVersion source/reference、supportedPresentations、actionCapabilityRequirements。

必要なfeatureだけrequiredPermission、audioRole、schemaRef、dataOwner、syncOwnerを追加する。renderer、handler、actual access、actual permission、Sync status、lifecycle、sessionはruntimeへ置く。独立互換単位が成立するまでserviceVersionを導入しない。

リリース済みmobileのversion管理を変えない。副作用なくimport可能なESM定数は元sourceを参照する。classic scriptはStudio側mirror + 元source一致testとし、version取得のためscript全体を実行しない。将来metadata exportが用意された場合だけ直接参照へ移行する。

商品version、保存schema version、Sync schema、cache key / asset参照、API versionを混同しない。mirror不一致は検証失敗とする。今回の文書更新ではStudio APP_VERSION 0.22.4、schemaVersion 1、asset ?v=を変更しない。

## 22. Metronome M1: Standard相当・memory-only

M1はshared境界実証であり製品統合完了ではない。UIはBPM / Start / Stopを基本とする。PortでPro対象の詳細拍子、rhythm、accent詳細、sound詳細、volume詳細、presetsを自由に露出しない。内部値はPort Standardのeffective default相当のfixtureを使う。

real Port storage、Pro認証、Account、Sync、presetsには接続しない。timing / audio core、Studio Dock、workspace切替、hidden、dispose、Coordinator leaseを実証する。実storageへ暗黙にfallbackしない。

| 契機 | 規則 |
|---|---|
| Main workspace切替 | Metronome継続 |
| Dock折畳み | 継続。停止へ到達可能 |
| tool終了 / destroy | stop、lease解放、dispose |
| visibility hiddenのみ | 通知だけで継続。実context interruptionは停止・close |
| pagehide / unload | stop、未完了start無効化、所有contextのclose・lease解放 |
| visible復帰 | 停止状態維持 |
| dispose | timer / frame / source / listener / 所有contextを解放 |

## 23. Metronome M2: 隔離保存契約

隔離repositoryは注入したmemory Storage facadeと定義する。globalThis.localStorageへ触れず、Studio専用localStorage keyも作らない。既存schema形状をmemory内で利用する。

確認対象は既存settings schema / validation / migration rules、Standard / Pro effective settings、stored settings保持、save failure、stale write、conflict、revision。Proケースは隔離したpolicy projectionの検証であり、正式資格取得や保護UI解錠を意味しない。

readSnapshot / subscribe / commit(expectedRevision, changes)のservice境界を先に用意する。rendererから直接storageを書かない。migration writeも注入Storageの内部だけで行い、読込関数のdefault Storage引数等から実データへfallbackしない。

Standard保存は最新stored settingsへ許可変更だけを適用し、保存済みPro詳細値を保持する。旧draft全体による上書きを防ぐ。session固有revision検証と、保存通知 / delete intent等の将来接続条件を分けて扱う。

## 24. Metronome M3: 正式Port-owned data接続

初めて正式Port-owned dataへ接続する段階。presets、正式Pro資格、Port-owned dataset、Account、Cruise Sync、delete intent、別tab、Port / Studio同時起動、mobile regressionを含む。

実データ接続を伴うM3開始前の必須条件:

1. schema前方互換ガード: 未対応の将来schemaをdefaults等で上書きせず、破壊的書込を止める。
2. Port / Studioの2tab同時編集検証: 隔離した検証環境でstale write / conflict / applyを確認する。
3. full dataset保護: 未表示collectionを保存・同期・削除判定から落とさない。
4. 全writer協調: local save / migration / preset delete / Sync applyの排他を成立させる。
5. delete intent保持: 明示削除と未表示・不明・読込失敗を区別する。
6. 正式資格失効反映: access更新で保護action / 書込 / 同期を停止する。
7. mobile lifecycle回帰: route離脱、hidden、mic / context解放等を維持する。
8. 保存失敗でpartial snapshotを公開しない: 結果不明・部分失敗を検出し、既存復旧契約へ進む。

M3準備・検証は隔離環境で進められるが、条件未達で正式データ書込を有効にしない。M1完了やM2のmemory成功を、M3合格の代わりにしない。

## 25. Structure保護・Mobile CSS

### Structure

- load / activateを分離し、workspace復帰でenter()を再実行しない。
- scroll root abstractionを用意し、window scrollからMain scrollへの接続を局所化する。
- Loupeはviewport座標を維持し、appSettingsの{x,y,width}の意味を変えない。
- Shell safe-area providerとStructure専用toolbar参照を使う。広域selectorで別featureのtoolbarを拾わない。
- Header / Dock / 表示中Structure toolbarをsafe areaへ含め、activate時にLoupeを再clampする。
- ResizeObserverでMain幅・高さ変化を検出する。非表示時のゼロ寸法を通常layoutとして採用しない。
- scrollbar-gutter等による安定化、寸法比較、再入防止を用い、observer自体の更新でloopを起こさない。
- printでShell layout / scroll / height / grid / fixed / stickyを解除する。
- v0.22.4のSafariヘッダーoverflow・主要ボタン保護・補助文言縮小・上端 / 利用可能高さ補正を維持する。
- IME guard、保存 / JSON / MIDI経路、紙面の表示 / 印刷を維持する。

fixed LoupeのShell ancestorへtransform / filter / backdrop-filter / contain:paint等を置き、viewport座標系を変えない。必要な装飾はLoupeのcontaining blockを変えない位置へ置く。

### Mobile CSS

mobile appのstylesheetをStudioへ丸ごと読み込まない。共有componentが必要ならStudio feature rootでscopeし、Port global selectorを持ち込まず、Port body classを操作しない。viewport単位依存はPC containerへ適応する。DialogはShell Dialog契約へ接続する。

## 26. Structure / Notation / TAB / MusicXML / MIDI / DTM拡張

MainはScore、notation、TAB、timeline、track editor、piano rollを保持できるworkspace containerとする。Shellは現在のStructure modelやbarNumberへ直接依存しない。Transport対象はfocusだけで変更しない。

Notation / TABではvoice、rest、spelling、tie、tuplet、string / fret、tuning、articulation等のdomain modelと安定IDを別途設計する。現行Structure schemaを全用途の完成済み共通modelと仮定しない。MusicXML / MIDIもdomainから生成し、Shellのpane stateを保存modelへ混ぜない。

DTMのbackground録音・再生は用途別policyと実機検証を必要とする。M1のhidden停止を将来DTMの絶対制約にせず、未検証のbackground継続も初期保証しない。

## 27. Acceptance criteria

### 実装前

各状態owner、Save / Undo / Play target、dirtyへの外部更新、commit中断、Pro / Sync境界を本契約通り説明できること。M1 / M2は実storage・資格・Syncから隔離し、mobile / Studioのhost lifecycleを分離する。v2.1採用は実装・動作合格を意味しない。

### Studio-only無変化refactor / Shell / Editing Session

- refactor単独では見た目、操作、データ、保存形式を変えず、既存画面で回帰確認する。
- Structure編集 → workspace切替 → 復帰でdraft / dirty / 履歴を保持する。
- Main / Gear InspectorのSaveが各sessionへ向かう。Playはfocus移動で変わらない。
- dirty + 外部更新ではbase / 履歴を維持し、正式採用時はdomain履歴をリセットする。
- commit中の追加編集・画面切替・cancel / destroy・成功 / 失敗でdraftや完了通知を取り違えない。
- Pre-DTMへ同じactive projectのworking snapshotを渡し、旧保存状態との乖離を防ぐ。
- modal CaptureとStructure Esc gateが背面操作を防ぎ、入力 / IMEを守る。
- pane resize / zoom / 低い画面 / Main scroll / 印刷 / SafariでLoupeと主要操作へ到達できる。

### Audio / M1 / M2 / M3

- start / stop / hidden / dispose / lease競合でscheduler・source・contextを解放する。
- 古いmic success / reject / finallyが新sessionを壊さない。
- badge表示でensure / provision / migration writeを起こさない。
- M1でPro詳細を露出せず、M2で実localStorage fallbackを起こさない。
- M2で保存失敗 / stale write / 外部更新 / Standard保存のstored Pro保持を検証する。
- M3は24節の全条件と正式資格・同期・同時起動を検証する。
- 共有抽出で影響するmobileのentry / gate / schema / migration / audio / touch / narrow UI / Syncを回帰確認する。
- version mirror不一致を検証失敗にする。

## 28. 正式実装順と次工程

0. baseline固定（実測Git状態と既存表示・データ・操作を次工程開始時に固定）
1. Shell Contract v2.1文書化（本工程）
2. Studio-only無変化refactor
3. 回帰確認
4. Metadata / Version reader
5. Shell
6. Focus / Keyboard / Modal manager
7. Structure Editing Session接続（Pre-DTM working snapshot含む）
8. Metronome M1
9. M2
10. M3
11. Chord
12. Practice
13. Tuner
14. Structure機能開発再開（F3等はここで依存順を再確認）
15. 五線譜 / TAB / MusicXML
16. DTM

次工程のStudio-only無変化refactorは、scroll root abstraction、Loupe safe-area provider、Structure専用toolbar参照、ResizeObserver、activate / load分離、Esc gate、Pre-DTM working snapshot入力境界の準備を対象とする。

既存hostでは見た目・データ・保存形式・操作を維持し、将来Shell向けの境界だけ準備する。workspace draft保持、Pre-DTM入力一本化等の新しい動作を実際に有効化する工程とは区別する。本工程ではコード変更を行わない。次工程は別途その対象と検証条件を指定して開始する。

## 29. 残る段階移行の決定事項

実配信origin、全writerの排他方式・未対応環境の扱い、複数key失敗復旧、正式Pro access統合はM3接続前に確定する。draft復旧、workspace保持上限、Notation / TAB model、DTM timebase / background policyは各機能の導入前に設計する。

今回指定された最終Bレビューの追記は本v2.1へ反映した。ただし、両レビューアによるv2.1の再判定や実装試験を完了したと記録しない。段階ごとのacceptanceを通過して次へ進む。


## 30. Shell v1実装境界（0.23.0 / 2026-10-11）

- `js/shell.js`が同期workspace hostとUI-only layoutを所有。Home / Structure / Pre-DTM / 既存Appsを
  `#studio-main`にhostし、`app.js`は起動・既存Home導線を接続する。新しいglobal Headerは作らない。
- 初回だけload。再表示はactivate、離脱はdeactivate。workspace切替で破棄確認 / reload / enterを呼ばない。
  hidden + inert、focus / scrollの復帰をhostが管理する。Structureは既存draft・selection・Loupeを保持する。
  Pre-DTMのactivate / deactivateはI/Oなしで、表示と復帰をhostへ委譲。再読込ボタンは明示loadとして残す。
- Mainへscroll root abstractionを接続する。window scrollは固定し、Mainの縦scrollを唯一の主scrollとする。
  pane / Navigationは必要時だけ独立scroll。MainやLoupeのancestorにtransform / filter / paint containmentを置かない。
- safe-areaはMainのviewport座標境界・Structure toolbar実寸・表示中Dockを使う。collapsed Dockの高さは0。
  providerの任意`left / right / contain`でShell内の水平containと下端の操作領域確保を指定する。
  Loupe保存の{x,y,width}はviewport座標のまま。Mainが680px未満なら既存narrowモードに入り、
  ヘッダーの操作列を折り返す。hidden / 0寸法 / printのobserver結果で保存値を更新しない。
- Navigation幅176px、800px以下128px。1280px以上で右paneを開くと256pxを確保する。
  1279px以下では非modal overlay。境界を跨いだresize時は閉じ、pane内focusを対応ボタンへ戻す。
  初期右paneは全幅で閉。Dockも初期collapsed。Inspector / Toolの論理stateとTransport / Auxiliary slotを分離する。
- Shellの色はTheme Contractのsemantic tokenだけ。4択native radio groupで選択・即時適用・保存失敗を表示。
  theme以外のShell stateはmemory-only。paper / Loupe / printは独立した色domainを維持する。
- 右paneのEscapeはそのpane内focus時だけ処理し、入力 / IME / 処理済みeventは除外する。
  本格Keyboard Router / Modal Managerは未実装。Structureの局所Escape gateを維持する。
- 本段階では§9のworking snapshot / active document一本化を有効化しない（今回の明示scope）。
  Pre-DTMは保存済みprojectと独立した選択を維持し、初回 / 明示再読込 / 明示選択で読む。
  Structureの編集中targetは切替で交換しない。Pre-DTMのリンクはworkspaceへ戻る導線とし、
  選択中の別projectをStructureへ暗黙ロードしない。入力統合はEditing Session工程に残す。
- 印刷時はShell chromeを非表示にし、grid / height / overflowを解除する。A4出力内容を維持する。
- 実装済みはShell hostのみ。Editing Session / Undo / Transport / Metronome / Account / Pro / Syncは未接続。


## 31. Focus / Keyboard / Modal v1実装境界（0.23.1 / 2026-10-11）

- `command-router.js`はid / target(context) / canExecute(context) / execute(context,event)を登録する。
  targetを一度解決してcontextへ固定し、nullまたはcanExecute=falseなら実行しない。
  executeは同期的に`{consumed}`を返す。将来の非同期処理・結果回収はcommand owner側の責務とする。
  登録解除・全解除が可能。同一idの重複登録を拒否する。
- Shellの`getCommandContext()`はactiveWorkspaceId / focusedElement / activeModal / rightPaneStateと、
  activeDocument / selectedObject / musicalInputSession / editingSession / transport / audioOwnerを別々に返す。
  後者6 slotは未接続のnull。ownerが`setCommandTarget(name,value)`で明示接続し、focusから推定しない。
  Save / Undo / Redo / Playのcommandやshortcutは登録しない。既存保存ボタンの処理は変更しない。
- `keyboard-router.js`のCaptureはactive modalのみ。composition状態の観測はCaptureで行うが、通常の
  editor / workspace / global shortcutを先取りしない。Bubbleは局所DOM handler処理後、musical →
  active workspace → Shell。defaultPreventedと消費済みeventを尊重し、非active workspace登録は無反応。
- 通常Bubbleではevent経路とfocusedElementのinput / textarea / select / contenteditable / role=textboxを
  IME判定より先に除外する。その後isComposing / keyCode229 / internal composing / justComposedを確認する。
  compositionendの同一turnをjustComposedで守る。Structure歌詞の既存4 guardも維持する。
- Escapeはmodal → Structure transient popover → 非modal右overlay → active workspace → Shell。
  persistent右paneはpane内focus時のみ所有。Structure内の順序はpopover → セル編集解除 → Loupe終了を維持し、
  右overlayが開いていればセル解除の前に閉じる。一keydownで複数layerを処理しない。
  text controlからは局所ownerが明示委譲するEscapeだけを許可し、通常shortcut除外の例外とする。
  Structureのchord / doremi / lyrics / strum / Loupe navigation / bulk入力がこの入口を使う。
  独立したStructure document keydown listenerは撤去し、非active / modal / 処理済み / IME gateをadapterに残す。
- `focus-routing.js`は存在・可視・enabled・非hidden/inert・active workspace所属を検証する。
  workspace復帰は有効な記憶focus、無効ならworkspace root。pane close / breakpoint close / Dock collapseは
  focusが閉じる領域内にある時だけtriggerへ戻す。trigger無効ならactive Navigation、さらにworkspace root。
  Dockは展開中だけTab到達可能。非modal pane / Loupeにfocus trapは設けない。
- `modal-manager.js`はsingle active native `<dialog>`。open({title,content,initialFocus,onClose})は
  accessible nameと未接続content DOMを必須とし、role=dialog / aria-modal=true / 初期focus /
  Tab・Shift+Tab loop / Escape / 終了後復帰を提供する。入れ子openは拒否する。
  native top layerに加えShell backgroundのinert / aria-hiddenを保存・抑制・復元する。
  close(reason) / native close / disposeでdialogとlistenerを除去する。キーボード側もattach冪等・dispose可能。
  modal中はShell public navigationを抑制する。IME中と確定直後のEnter / Escapeはcloseや背面操作に使わない。
  Ctrl / Meta / Alt付きのbrowser chordとfunction keyは奪わない。印刷でfocusが外れた後も通常Escapeで閉じられる。
- 本番に新しいmodal画面・shortcut一覧を追加しない。既存window.confirmは同期返値の互換を維持。
  一括入力popoverとLoupeは非modalのまま。Modal Managerの実画面テストは隔離Chrome内のfixtureで行う。
- semantic tokenのみでmodal / focus表示を追加。modalとbackdropは非印刷。paper / music色・A4出力は維持。
  APP_VERSION 0.23.1、schemaVersion 1。Editing Session / domain Undo / working snapshot / audio等は未接続。

## 32. Structure Editing Session v1実装境界（0.24.0 / 2026-10-11）

詳細なAPI・保証範囲・検証は[EDITING_SESSION](EDITING_SESSION.md)に記録する。
本節が§30 / §31の「未接続Save / working snapshot / Editing Session」を更新する。

- domain + stable project targetでsessionを共有。saved / base / draft / working / playbackを分離し、
  Structureのproject / dirty stateはsessionへ接続する。workspace・project往復でdraftを破棄しない。
- commitは固定snapshot + baseRevision + sessionId / commitId / generation。追加編集・元sessionへの結果回収を保護。
  cancel / destroyはin-flight結果を待ち、失敗・不明ではdraftを保持する。
- revisionは既存raw project JSON。project・indexをWeb Locksで協調排他し、全本番Studio writerをrepositoryへ接続。
  非協調legacy writer・旧build・プロセス中断時のlocalStorage原子性を保証せず、Port / Syncへ流用しない。
  Web Locks / storageが使えない環境では保存を有効にしない。
- clean external adopt、dirty / in-flight / IME未確定のexternal pending、外部削除のcommit blockを実装。
  base / draftを無断で上書きしない。conflict採用UIは最小とし、削除draftはJSON exportで保持可能。
- Save button / Cmd・Ctrl+Sは同じ明示editingSession command。text controlからSaveだけ局所委譲する。
  active workspace・IME・modal gateを保ち、消費時だけbrowser defaultを抑制する。
- Pre-DTMは同じactive Structure projectだけworkingを読む。別選択projectはsaved fallback。
  activateはloadせず選択sourceを更新し、JSON / MIDI export直前も更新。dirty由来を小さく表示する。
  project選択UI一本化と実playbackは未実装。print / Project JSONはvisible draftを維持する。
- domain historyは未実装。clean外部採用／明示new baseは将来reset、dirty pending／own commitは保持する。
  Cmd/Ctrl+Z / Redo / Playは未所有。Theme / pane / modalはsession状態から独立する。
- APP_VERSION 0.24.0、schemaVersion 1。Node161、Chrome42独立ケースPASS。
  clean JSONはappVersionのみ差分、MIDI / A4印刷ラスタ一致。次はMetronome M1。


## 33. Audio Coordinator v1 / Metronome M1実装境界（0.25.0 / 2026-10-11）

[Audio契約](AUDIO_COORDINATOR.md)にsource監査・API・parity・検証を記録した。
Coordinatorはregistry / lease / owner / read-only borrower timebase / 通知 / cleanup / global stopのみ。
Metronome runtimeが専用context、Port timing/audio projection、memory BPMを所有する。
Port timingのtransitive importがSync globalを登録するため方式Cを採用し、Portは変更しない。
BPM120 / 30〜240、25ms / 100ms / 55ms、running BPM変更のPort rescheduleを維持する。

- Dock Auxiliary ToolにBPM / Start / Stopだけ。collapsed時のNavigation Stopを提供する。
- workspace / Dock / pane / Theme / visibility hiddenだけでは継続する。従来§22のhidden停止規則は
  今回の明示指示に合わせ、実context interruptionとpagehide / unload停止へ変更した。
- Stopはscheduler / frame / future sourcesを同期取消、context close後にlease解放。
  close失敗は資源を保持して新Startをblock、明示cleanup retry。pending startはgenerationで無効化する。
- Save targetはStructure Editing Sessionのまま。BPM inputから既存Saveだけ局所委譲する。
  transport targetはnull、audioOwnerだけを明示bindする。project BPM / dirty / draftを変更しない。
- metadataは既存port.metronomeの選択projectionでcatalog一致を検証。runtime audio情報はcatalogへ置かない。
- Node218、Chrome70独立ケース、計288検証。実currentTime schedule、50 Start/Stop、4テーマ・4幅、
  Save / IME / modal / working sourceを確認。JSONはappVersion差のみ、MIDI / audio稼働中A4ラスタ一致。
- M2 persistence / Pro、M3 Port dataset / presets / Account / Sync、mic、Transportは未実装。
  schemaVersion1、Port / 他apps / shared / Worker無変更。Safari / 実OS interruption / 聴感検証はpending。

## 34. PC Shell layout v1（0.32.0 / 2026-10-14）

[PC layout契約](PC_SHELL_LAYOUT.md)をUI presentationの現行補足とする。
600px以下の上段Navigation・固定Global Stop、toolbar局所横scroll、実Main bounds内Loupe、
compact DockとMetronome導線を追加する。§30の固定rail記録よりこのresponsive補足を優先する。
低高さではLoupe上端のtoolbar除外を操作reserveまでに制限し、内部scrollを許可する。
resizeはgeometry-onlyでinput/focus/IMEを保持する。print時はscreen mediaを適用せず既存A4紙面のみ。
workspace lifecycle / command target / data owner / audio owner / security境界は変更しない。
