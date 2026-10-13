# Chord Standard PC Presentation v1

Studio 0.28.0 / Chord Cruise 1.20.1 / Port 1.22.18 / Studio schemaVersion 1。
開始HEAD / origin/main / remoteは`590c3cd0a926bd7201f42144f41b13692d460bc3`で一致。
最後のStudio commit `174dad81`後にNEWS commitが1件入り、Studio/Port/Chordは変更されていなかった。

## Standard / Pro棚卸し

製品policy正本はChord Cruiseの`js/core/feature-access.js`。metadataのcomplexityと認可は別である。
現行Standard policyと実際のUI呼出経路を読み、下記の区別で実装範囲を限定した。

| 機能 | 現行契約 / 根拠 | v1 |
|---|---|---|
| コード名解析 | Chord側に自由文字列parserはない。既存Studio `parseBasicChordSymbol`で記号を分離し、Chord `QUALITIES`とmodelへ接続 | 対応記号のみ |
| 構成音 | Standardの任意コード作成と通常コード表示。`customChordCreate=true`、`buildCustomChord` / theory | 対応記号のみ |
| 音名表記 | `spellChordNotes`をExplore/Libraryで利用。Standardの構成音表示 | 再利用 |
| 度数表記 | `degreeLabelsForQuality` / modelの`degreeLabelsList`。通常表示はStandard | 再利用 |
| コード検索 | キー/スケール/コード選択はExploreのStandard UI。自由文字列検索APIは確認できない | 未接続 |
| ダイアトニック | `getDiatonicChords`とExploreの選択経路。advanced詳細分析/CAGEDは別gate | 未接続 |
| CAGED | basic/intermediateの対応formはStandard、advanced対応formは`advancedCaged`でPro限定 | 全て未接続 |
| 指板表示 | 現行`customChordFretboardView=true`でStandard許可。提示された「Pro限定」と差がある | 今回の明示除外指示に従い未接続 |
| 運指表示 | form・quality・保存文脈に依存。fretboard自体に包括的edition判定はなく、callerが境界を持つ | 包括的Standard契約を推測せず未接続 |
| コード保存 | 任意コードsaveは`customChordSave`でPro限定。通常コード保存はStandardでfolder3/chord10 per folderの制限 | 全て未接続 |
| 保存済みform閲覧 | LibraryはStandardにもある。advanced分析/CAGED/書出し・保存数制限は各gateで分離 | storage/UIをimportせず未接続 |

advanced詳細分析はExplore `renderQualityAnalysis` / Library `qualityAnalysisHtml`で`advancedQuality`を確認する。
`unlimitedLibrary` / `advancedExport`もPro限定。Studioでeditionや正式Pro資格を新しく判定しない。
今回のInspectorは指板/CAGED/運指/高度分析/保存/ライブラリUIを作らない。

## Pure read modelとimport境界

HTMLはreleased Chord `music-theory.js` / `chord-model.js`だけをowner version `?v=1.20.1`で読み込む。
このclassic moduleの初期化は`window.ChordCruise`へpure APIを登録するだけで、DOM操作・storage・DB・network・listener・認証・audio起動を含まない。
Nodeでdocument/storage/DB/networkを拒否した環境でも初期化できることを確認する。
Chord app/UI/storage/feature-access/Pro Gate/Account/Sync/Authorityはruntime importしない。Chord製品コードは不変更。

`js/modules/chord/read-model.js`はStudio側の読み取り専用syntax adapter。
既存Studio parserのroot/quality/bassに厳密なv1 whitelistを適用し、音程・音名・度数はChord正本から取得する。
対応: `C` / `Cm` / `C7` / `CM7` / `Cmaj7` / `Cm7` / `Csus4` / `Cadd9`と、同qualityの他root・slash bass。
maj7/M7は既存Chordのdisplay aliasに対応。add9は既存model `buildCustomChord`へMajor coreと9 tension specを渡し、三和音+9を取得する。
interval表、構成音計算、綴り規則をStudioへ複製しない。

不明suffix、advanced表記、内部空白、曖昧な表記はunsupported。元の文字列を表示し、major等へ丸めない。
root/bassの綴りはowner `parseSpelledNoteName`、upper chordは`spellChordNotes` / `degreeLabelsForQuality`。
slashのbassはupper構成音と別欄に表示し、構成音外bassも黙って落とさない。
構成音は**入力コード本体**。capo実音・key context・ダイアトニック上の機能分析は未接続。
公開結果はdeep freeze。Chord独自dataset、保存値複製、資格状態やwriter APIを持たない。

## Structure選択とdraftの所有

既存`selectedBarNumber`とsession-owned draftをStructureの`getSelectionSnapshot()` / `subscribeSelection()`から読み取る。
新しいselection owner、Inspectorからの選択変更、project/draft writeは追加しない。
投影はactive/sessionId/barNumbers/chord記号/inputPending/dirty/external pending/deletedだけ。projectへ新fieldを保存しない。
通常編集・save ACK・cancel（既存Undo相当）・外部adopt/保留・activate/deactivateで通知し、同じ投影は重複通知しない。
observer例外を隔離し、unsubscribeを提供する。

状態はinactive / unselected / empty / ready / editing / multiple / deleted / unsupported。
既存選択は単一小節。複数barや複数chord eventは明示multipleとして、任意の先頭コードを選ばない。
削除・未選択・別workspaceでは古い詳細を解除する。dirty外部更新では既存draft/baseを変更しない。
StructureのChord inputはIME中もdraftへinputを反映する既存挙動を維持する。InspectorはinputPending中の部分表記を解析せず、確定後に更新する。

## Inspector / Keyboard / lifecycle

Inspectorは文字とdlだけで、入力・save/apply・指板control・shortcut・focus移動を持たない。
既存Shell pane開閉・Escape・overlay/persistent layout・Modal・focus復帰へ従う。
4 Themesのsemantic tokenを使用し、長い記号はpane内で折り返す。紙面CSS/print CSSは変更しない。
pagehideでselection購読とpagehide listenerを解除し、BFCache復帰で再接続。disposeで全購読/pageshow listenerを解除する。
独立timer/polling/MutationObserverやaudio資源を追加しない。reload時は選択を復元しない。
Feature Registryは`chord.main.implementedPresentations=['inspector']`だけを更新し、capability metadataを認可にしない。

## 検証と安全境界

開始Studio Node340 PASS。追加41件を含む全381 PASS。
既存正規Studio browser5 suite123 PASS（親5込み）、PortDataHost read-only10ケースPASS。
Chord既存pure theory/policy回帰13ファイルPASS。新Chord browser31 PASS（親1込み）。
Studio正規6 suite計154 PASS（親6込み）+ Host10ケース、計158独立browserケース。
Nodeは対応8種・enharmonic spelling・slash・unsupported・複数/空/削除・draft/保存/外部更新・workspace・read-only・純粋import・policy・theme/非対話UIを確認する。
Chromeは正式repoの8766 / 使い捨てprofile。既存8765は不触、表示v0.28.0/source一致を確認。
実UIの選択変更/解除、draft/save/cancel/external、IME/Modal/focus、pane/resize（1440/1024/1920/680px）、4 Themes、reload、A4 Print、50 mount/disposeを確認した。
Loupe inputの連続入力fixtureは、既存の次frame再描画/焦点復元が完了してから次の操作を行う。assertionと入力ケースは削減しない。

Inspector操作に伴うChord/Port localStorage、Chord/Pro/Account/Sync IDB mutation、Authority DB create/write、Worker mutation、cloud publishは0。
Inspector表示だけでStudio projectはdirtyにならない。fixture準備と明示Structure edit/save/external fixtureはこの禁止操作と分離する。
console error / app404 / unhandled rejectionは0。実Safari・OS IME・聴感・実プリンターは未確認。
Production legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false、Authority physical schema2を維持。
L3c未解決問題・Daybreak待機に触れず、新規認証/認可攻撃probeや失効競合試験は実施しない。
本UI完了はAuthority安全性承認・共有write/M3解禁ではない。本番deploy/cutover/D1操作なし。
