## Studio 0.40.3 — F3 metadata / cache整合候補（2026-10-16）

- Port正式source 1.23.1へのStudio import query追従。Chordのpure module 2件はowner HTMLと同じ1.21.0へ追従。
- Studio自身のversion・現行cache query・厳密試験を0.40.3へ更新。schema 2と保存・演奏・認可のロジックは維持。
- 固定main/topicを親順序通り保持する隔離2-parent候補。既存topic、旧候補、main root、未追跡原本は変更しない。
- [F3正式記録](../docs/F3_METADATA_ALIGNMENT.md)（PROJECT_STATEからは `../docs/F3_METADATA_ALIGNMENT.md`）。required試験の結果は候補SHAに紐づくrepo外の検証receiptで確定する。main反映・Pages公開は別承認。

## Studio 0.40.2 — 旧保存API・広幅UI安全修正（2026-10-16）

旧saveProjectはschema 1専用、schema 2はRepository/Editing Session専用にした。拒否時write0・入力/raw/index不変。広幅LoupeはInspector実測領域を避け、Inspectorのsticky位置はtoolbar実寸へ追従する。schema2、既存F1/F2・保存容量・Undo/IME境界を維持。
Node1176／正式Browser23ファイル558 PASS、FAIL/skip/cancelled0。48条件の同時表示・hit testと性能gateを再実測。実OS IME/Safari/実印刷は未検証、F3 Port1.23.1は別統合工程。main統合/Pages公開なし。commit/push実結果はrepo外final receipt参照。

[正式仕様・試験・性能](../docs/MELODY_DURATION_REST_EDITING.md)。以下は過去の記録。

## Studio 0.40.1 — Render Readiness Recovery & Final Acceptance（2026-10-16）

保存metadata適用後の最終validationと、狭幅Inspector/選択音符の可視性を修正。768px timeoutはfixtureの同一ID/raw再投入に対するexternal-revision保護であり、条件別contextと完全identity ready照合で解消。製品rendererの保護は変更しない。
今回Node 1156／Browser21ファイル 548 PASS、FAIL/skip/cancelled0。48画面条件、CDP IME/focus/caret、保存容量の実Save/再読込、8/32/64/128性能を再確認。0.40.1/schema2、F1/F2/単一Undo/no-write維持。
実OS IME/Safari/実プリンターと後続機能は未完。F3 Port1.23.1は別の最新main統合候補で対応。限定commit/topic pushの実結果はrepo外final-receipt、main/Pages公開なし。
[正式受入・35項目・性能・証拠](../docs/MELODY_DURATION_REST_EDITING.md)。以下は履歴。

## Studio 0.40.0 — Melody Duration & Rest Editing M2/M3 自動受入（2026-10-16）

Structure内で音符・rest・gapを選び、InspectorからM1の8正式commandを実行する。正本StudioProject/schema2、既存Editing Session/単一Undo、明示Saveを維持する。非リップル音価/開始位置、明示pitch変換、部分/小節確認、gap確認、stale/A-B/IME保護を追加。
透明hit矩形・private source stampと退役描画jobのRAF所有を分離。矢印はgapも含む記譜順で移動し、gapに音符専用欄を要求しない。No-writeはreloadを越える全ledgerと操作区間で検証し、A/B・Loupe幅補正・明示theme・明示Saveの9writeだけを値/件数照合する。
Node1139／正規Browser19ファイル491 PASS、FAIL/skip/cancelled0。8/32/64/128性能と35項目を今回再測定。実OS IME/Safari/実印刷、高度時間表現・五線印刷・TABは未完。F3 Port1.23.1は最新main統合前に別対応。限定topic commit/pushの実結果はfinal-receipt参照、main統合/Pages公開なし。以下は過去の記録。

[正式M2/M3契約・35項目・性能](../docs/MELODY_DURATION_REST_EDITING.md)。

## Studio 0.39.1 — M1 Safety Recovery 自動受入（2026-10-16）

F1の未確認legacy timing/ID/provenance/rest/gap保持、F2のprototype/getter/toJSON検証、CMM private DTO境界を修正。Git登録の欠落baseを同一HEADの実測で補完し、checkerは変更しない。Browser ledgerは明示選択2writeと後続no-writeを区間化して全履歴保持。構文不正を音数判定より先に診断し、IME文字/focus/caretを保持する。
Node1108／正式Browser18ファイル466 PASS、FAIL/skip0。F1/F2の51件と構文追加6件を再検証。64小節command p95 12.7/13.1ms、Staff103.9/100.8ms（保存前/後）で正式目標PASS。128小節command25.4/25.2msは追加耐久。CMM比較目安の超過は継続改善であり全件達成としない。
schema2維持、M1自動受入のみ。M2/M3のUI・実OS IME/Safari/実印刷は未完。Port1.23.1 F3は最新main統合の別工程。main統合/本番公開なし。限定commit/topic pushの実結果は証拠final-receipt.jsonを参照。以下は過去の記録。

[正式35項目・試験・性能・証拠](../docs/SCHEMA2_FOUNDATION.md)。

## Studio 0.39.0 — Schema 2 M1自動受入（topic候補、2026-10-16）

schema 2正本、決定的migration、stable ID、原文保持、serialization前validation、Undo容量保護、明示consumer adapterを実装。Node1051／Browser18ファイル464 PASS、FAIL/skip0。診断の展開/集約とreload前後のrunner書込み監査、大規模8/32/64/128 Save/Load・五線・A/B・staleを検証。
64小節の同期編集p95は保存前10.4/保存後10.3ms、五線更新105.2/105.5msで正式目標PASS。128小節は追加耐久として完了。小規模CMMの約1.6倍/128の約1.9倍は比較目安上の改善残件として明記。M2/M3のInspector・実OS IME・Safari・実印刷等を完成扱いにしない。
mainはNEWS/Port更新の10296dbb、続くNEWS Workerのみ9pathの7cf2f02aへ独立進展。現topicを無断取り込みせず、次のmain統合時にPort1.23.1 mirror/cache整合と新規回帰が必要。今回main公開・Pro/Account/Authority/Sync操作なし、shared write OFF。
[正式受入35項目・試験・性能](../docs/SCHEMA2_FOUNDATION.md)。以下は過去の記録。

## Studio 0.38.1 — Melody Staff UX Polish Finalization

既存topic上のpatch。Astra/OpusのP1を、共通tick/実測文字幅、1/2小節system、
共通五線高さ、記号配置、入力中の明示pending、診断と曲/カポ表示で解消。
不正stepはSessionで拒否し、公開ドレミ入力で受理されたMIDI範囲外データは変換段階で診断する。
Node945 / 正式Browser442 PASS、FAIL/skip0（2026-10-15の新規実測）。
8/32/64小節13.2/44.8/113.8ms、最大frame7.9ms、合成input同期処理0.9ms。
schema1・shared write OFF・五線は画面previewのみ。実OS IMEと常設ルーペ/狭幅刷新は未完。
[正式契約・P1/P2判断・試験詳細](../docs/MELODY_STAFF_PREVIEW.md)。次は実機確認と音価編集の正式契約。
main統合・Pages公開は別工程。以下の0.38.0の数値は過去の記録。

## Studio 0.38.0 — Melody Staff Preview v1

専用topicで実装。schema1維持・main公開なし。
コード譜/メロディ譜の一時切替、4/4・480 PPQ・実音五線、調号/臨時記号/音価/休符/付点/タイ。
小節単位の「音の長さ：自動を含む（由来未確認）」を保持。確認済み保存なし。
Core成功＋正式source/isCurrentだけを採用。fatalを無視した部分描画なし。
歌詞は元tickのまま、Chord/Rhythm/TABは未接続。入力DOMと描画境界を分離。
既存印刷はコード譜を維持。五線は画面previewだけ。
[実装契約](../docs/MELODY_STAFF_PREVIEW.md)。
2026-10-15再開時の実測: Node **942 PASS**、正規Browser15＋conversion＋melody staff **437 PASS**。
FAIL/skip 0、Console/404/禁止通信 0、No-write維持。保存schema1、他アプリversion不変更。
8/32/64小節: 18.3/131.2/260.4ms、最大frame1.6ms。単一変更小節だけ再描画。
257小節は14msでpreview-budget、2049文字は13msでpreview-text-budget。focusを保持し、保存0。
前回FAILはVexFlow 4.2.3に存在しない.vf-accidental classへの依存。実glyph欠落ではなかった。
今回の再開では製品コードを変更せず、test専用SVG観測と12ケース・実paint削除反例を追加。
sharp/flat/natural/調号/同小節継続/小節リセット/octave/連桁/タイ/付点/休符を実Browser・画像で確認。
未対応: 任意の跨拍連桁指定、跨小節tie、3連等30tick未満/非整合音価、五線の正式印刷、TAB/schema2。
次工程: 実機IME/Safariと読みやすさの確認、常設ルーペ/共通layout/音価編集の契約。main反映は別承認。

# Cruise Studio Project State

## Integrated Score正式設計文書化（2026-10-15）

Astra Architecture Contract v1全文、Opus最終UX全文、承認済みモック `2b754b0f78b8ba856f9f315e9c76d27420088168` のREADME/HANDOFFを照合し正式docsへ保存。
[Architecture](../docs/INTEGRATED_SCORE_ARCHITECTURE.md) / [UX](../docs/INTEGRATED_SCORE_UX.md) / [工程と受入](../docs/INTEGRATED_SCORE_IMPLEMENTATION_ROADMAP.md)。
単一Project/Session/Undo、Hybrid、stable ID、schema2、実音/key/capo、owner API、手動保持、出力別readinessを確定設計として区別。
Studio0.37.1 / schema1の製品実装は維持。schema2や譜面変換UIは今回未実装。U1〜U8と実OS IME等の未確認を保持。
metadata修正commit `02a21d74a35e93d94a06b5827e1713fe5ae3efe0` と文書commitを分離し、固定topic・旧候補・原本・他ownerを変更しない。
統合候補とmain反映可否はGit safetyの別gateであり、本書は統合方式・公開・shared writeを承認しない。


## Component version metadata整合（0.37.1・2026-10-15）

main `32f4058c` の各owner正式versionへStudio側mirrorを追従。
Port1.23.0 / Chord1.21.0 / Pitch2.30.0 / Fretboard2.25.0 / Rhythm1.20.0。
Port ESM参照cache key、Studio patch・asset/module参照・厳密version試験を整合。
全component個別照合とPort参照cache key検証を追加。Project schema1・製品機能は維持。
PR #1の独立モック、既存topic、旧不合格候補、NEWS・他apps・Shared・Workerは変更しない。
修正は独立保守branch内。統合候補・正式設計文書・公開可否は別gateで判定する。
今回の再実行: metadata29 / Node916 / 正規Browser15 suite＋Structure conversion413 PASS、FAIL0・skip0。
合成443Hz・48000Hz/mono/16-bit PCM・3秒を指定。Console/404/禁止通信0、No-write維持。


## Common Music Model + Structure Read-only Conversion Core v1（2026-10-14・現行）

Studio **0.37.0**（memory-only変換APIのminor）/ Port **1.22.18** / Chord **1.20.1** / Rhythm **1.19.1**。
開始HEAD / origin/main / remote main=`126820db055c3db590c6552bcccc0ace1a90c97f`、tracked/staged空、ahead/behind0/0。
既存`.claude/`・Sync node_modules保持。NEWS差分なし。並行開発Git契約を適用し、全体cleanの旧条件へ戻さない。
Studio schema **1** / Authority physical **2**維持。

4/4・480 PPQ・1920 ticks/measureだけを受理するpure Common Music Model v1を追加。
melody/harmony/guitar strokeを分離、綴りはChord pure owner、実音はStudio既存移動ド/カポ規約を再利用。
C♯/D♭、臨時記号、B♯/C♭のletter octave、カポのoctave carry、実音MIDI0境界を保持。
小数/不正音高/音価/小節越え/overlap/非4/4を補正せずfatal。未知コードは原文とwarning、欠損コード音価はunresolved。
voicing/string-fret/使用弦/運指はnull。Rhythm preset/Chord form/五線譜/TAB/保存/Transportは未接続。

正式active Structure sessionのimmutable workingから変換。readRevision追加はgetItemだけで外部raw revisionを比較し、
保存/JSON解析/採用/通知は行わない。IME/Modal/commit/pending/conflict/deletion/future/unobserved revisionを拒否し、
base/history/readinessを変えない。既存Pre-DTM capture/JSON/MIDIは不変更。
source identity・snapshot location・legacy provenance・fatal/warning/unresolvedを保持。
Shellの既存activate世代だけを公開し、A-B-A/Undo/Redo/workspace往復/外部更新/別service/reloadの旧resultを拒否。
第二draft/clock/datasetなし。deep immutable・deterministic。2048 bars/展開32768 events/100000 nodes/2Mi chars/depth32の予算を先に確認。
診断256上限でもfatalを保持する。元projectの自動書換・保存schema変更なし。

検証: baseline Node **806 PASS** → 新規Core **64 PASS**、全Node **870 PASS**。
正規Browser15 suite **406 PASS**、新規変換API **7 PASS**（親含む）、計 **413 PASS**。
実MIDI bytes/Pre-DTM意味的JSON、dirty/current/Undo/Redo/A-B/workspace/IME/Modal/focus/4 Themes/Print、
convert repository write0・外部dataset/Authority/ProDevice/Account/Sync/outbox/Worker mutation0、console/404/unexpected通信0。
Studio全体version/cache/mirror整合。旧Host単独補助試験はhidden Start既知FAILの別記録を維持し、今回は未実行。
使い捨てChrome/別8767/合成micのみ。既存8765/8766/profile/既存untracked不触。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**、Daybreak待機維持。
本番deploy/D1/cutover/新規security probeなし。次はChord推奨フォームadapter、Rhythm import-safe reader、描画の段階設計。
詳細: [Common Music正式契約](../docs/COMMON_MUSIC_MODEL.md)。以下は各工程時点の履歴。

## Structure Domain Undo/Redo UI & Keyboard v1（2026-10-14・履歴）

Studio **0.36.0**（製品Undo/Redo UI/shortcut追加のminor）/ Port **1.22.18** / Chord **1.20.1**。
指定基点7318efcaの後のNEWS-only 2 commitを祖先・変更範囲で確認し保持。
実測HEAD / origin/main / remote main=`41567bb52ffd92d9056ed173adecda4b779c2099`、tracked/staged空・ahead/behind0/0。
Studio schema **1** / Authority physical **2**維持。

Structure toolbarへ「元に戻す」「やり直す」を追加し、既存Coreのundo/redoへ正式command routerで接続。
Cmd/Ctrl+Z・Shift+Zはactive Structure非入力領域だけ。input/textarea/select/contenteditable/readonly等はnative owner。
strum buttonの局所keydownだけ明示委譲。native/domain同時発火なし、別workspace/Modal/IME/just-composed/flight/deleted/recoveryを拒否。
pointerdownは先行blurを抑え、live groupと未確定section名を正式確定してから実行。disabledと実行APIに同じeligibilityを使う。
ARIA/title/shortcut案内、既存semantic tokens、390px action strip、Print除外。

新編集/履歴/group/Save/external/project/workspace/Modal/IME通知でUI同期。古いsession通知は無視。
非構造で現在field/caret/scrollを復帰、構造ではstable bar IDが無いため選択/Loupe解除。
正式反例で、重複Loupe RAFによるfocus喪失とDOM removal中の旧section change再適用を修正。
section controlのcontent frameを最終照合し、同じ反例で名前/cursor/focus復帰を確認。
Core意味/stack/payload/capacityは不変更。saved/base/revision不変、dirty/競合保持、Pre-DTM current JSON/MIDI・不変出力を維持。

検証: baseline Node **721 PASS** → 新規command/UI **57 PASS**、全Node **778 PASS**。
Browser結果: 既存14 suite **353 PASS**＋新規UI **53 PASS**（親含む）、全15 suite **406 PASS**。
実native Cmd+Z/Shift+Z、button/shortcut A–H、4 Themes×390–1920/Print/Audio/read-only Hostを確認。
Undo/Redo repository write0、Port/Authority/ProDevice/Account/Sync/outbox/Worker/cloud mutation0。
console/app404/unhandled/禁止通信0。source/display0.36.0一致。正式repo独立8767/disposable Chrome/synthetic micのみ。

製品domain Undo/Redoを公開。native履歴の統合やreload/crash復旧は未対応。実OS IME/Safari/他OS/プリンター/DAWは未検証。
既存popover pointer配置・Transport等は別工程。次は実機受入と残るStructure PC操作課題の選定。
Port/Shared/Worker/NEWS製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**。
Daybreak待機/L3c境界維持。既存8765/8766/PID25543/profile/untracked不触。probe/deploy/D1/cutoverなし。
詳細は[Undo/Redo正式契約](../docs/DOMAIN_UNDO_REDO_UI.md)。以下は各工程時点の履歴。

## Structure Text Input History & IME v1（2026-10-14・履歴）

Studio **0.35.0**（文字入力・IME履歴接続機能のminor）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`119fec5777c9855e39d311323caf747d4df24372`、tracked/staged空、ahead/behind0/0。
Studio schema **1** / Authority physical **2**維持。

曲名/artist/capo/BPM/key/拍子、grid/Loupeコード・ドレミ、歌詞tick、基本strumをEditing Session Coreへ接続。
同一field/論理targetの連続入力をCore内で1entryへ合体し、最新draftは入力ごとにatomic公開。
blur/Enter/focus/field/project/workspace/Save/ACK/IME/native履歴/別操作でgroup終了。第二stackなし。
section名は既存change離散確定を維持。no-op/branch/capacity/out-of-band/保存・競合のCore契約を維持する。

IME途中はDOM bufferのみ、確定時1entry。旧Loupeの途中draft直接更新を明示的に置換し、Inspectorは既存draft＋editingを表示。
composition後の同値input二重記録なし、just-composed/229/保存・出力block維持。
native Cmd+Z/Shift+Zはbrowser ownerへ渡し、実inputを新しいdomain編集として同期。domain Undoは同時に呼ばない。
通常入力でLoupe/grid/form DOMを保持し、caret/focus/scroll・native履歴を不要に失わない。
FileReader/RAF/遅延blur/IME owner ticketをguard、A/B/Pre-DTM workingとimmutable出力を維持。

検証: baseline Node **683 PASS** → 追加text **38 PASS**、全 **721 PASS**。
Browser結果: 正規13 suite **315 PASS**＋新規text **38 PASS**（親含む）、全14 suite **353 PASS**。
実native Undo/Redo/clipboard paste、保存後dirty/clean、IME模擬/取消、4 Themes/390–1920/Printを確認。
入力履歴repository write0、Port/Authority/ProDevice/Account/Sync/outbox/Worker/cloud mutation0。
console/app404/unhandled/禁止通信0。既存明示Saveは維持。source/display0.35.0一致。

製品Undo button/global shortcut未公開。明示対象/構造/表示/range/adopt等のDOM再構築後はnative履歴継続を保証せず、
終了したdomain entryを保持。実OS IME/Safari/他OS/プリンター/DAWは未検証。
次はDomain Undo/Redo UI/Keyboard readiness。既存popover pointer配置・crash復旧等は別工程。
Port/Shared/Worker製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**。
8765/8766/profile/既存untracked不触。動的probe/deploy/D1/cutoverなし。Daybreak待機/L3c境界維持。
詳細は[Text正式契約](../docs/STRUCTURE_TEXT_HISTORY.md)。以下は各工程時点の履歴。

## Structure Operation Adapter v1（2026-10-14・履歴）

Studio **0.34.0**（離散操作の履歴接続機能によるminor）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`a6a12cb833fbd55c486067f1452c5f3fcd20d567`、tracked/staged空・ahead/behind0/0。
Studio schema **1** / Authority physical schema **2**維持。

既存Editing SessionのrunOperationへStructure離散操作を接続。section追加/削除/確定名変更、section小節数増減、
strumセル/基本へ戻す、コード/ドレミ一括、譜面表示設定をstaging draftへ適用し、複合setterを1entryで公開する。
no-opはentryもcontent tokenも進めない。例外/取消は旧draft/historyを保持。独立stack/writerは作らない。
存在しないbar独立CRUD/strum一括は追加しない。文字入力/IME/native Undo、製品Undo UI/shortcutは未接続。
実際の直接draft変更はCoreのout-of-band barrierで古い履歴を無効化し、現在内容を保持する。

構造変更時はbarNumber選択/Loupeを解除。inactive projectの構造外部採用も旧番号を復元しない。
非構造公開では歌詞局所解像度を維持。FileReaderとfocus RAFにsession/content/ticket/selection/focus owner guardを追加。
DOM置換だけなら必要なfocus復帰を許可し、新inputへ旧valueを戻さない。
saved/base/revision不変、通常保存成功/失敗・pending/conflictの履歴保持、clean adoption/resetを維持。
A/B/workspace別のsessionとPre-DTM現在working JSON/MIDIを維持する。

検証: baseline Node **654 PASS**、追加Adapter **29 PASS**、全Node **683 PASS**。
Browser結果: 正規12 suite **270 PASS**＋新規Adapter **45 PASS**（親を含む）、計 **315 PASS**。
Adapter repository write0。既存Studio明示保存は維持。Port/Authority/ProDevice/Account/Sync/outbox/Worker/cloud mutation0。
console/app404/unhandled/禁止network0。4 Themes×390–1920/Print/IME/Modal/focus/Audio/read-only Hostを確認。
隔離8767 / disposable Chrome / synthetic micのみ、source/display0.34.0一致。

一括popover適用buttonのpointer到達不良は基点でも再現。今回はnative keyboard Enterで実適用を検証し、
既存pointer配置修正は別UI工程に残す。実OS IME/Safari/プリンター/DAWは実機範囲。
次は連続入力/IME/native Undo境界の段階接続。製品Undo UIはowner/group/focus条件の検証後。
Port/Shared/Worker製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**。
Daybreak待機/L3c境界維持。既存8765/8766/PID25543/profile/untracked不触。probe/deploy/D1/cutoverなし。
詳細は[Structure Operation契約](../docs/STRUCTURE_OPERATION_HISTORY.md)参照。以下は各工程時点の履歴。

## Editing Session Domain History Core v1（2026-10-14・履歴）

Studio **0.33.0**（domain履歴Core APIの新機能によるminor。Undo UIは未公開）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`5b990d3e28ed0b9099bbe4f68cd462964d6dba49`、tracked/staged空、ahead/behind0/0。
Studio schema **1** / Authority physical schema **2**維持。

Editing Sessionごとのepoch / immutable before-after entries / cursor / openGroupを追加。
同期begin/commit/cancelOperationとrunOperation、undo/redo、canUndo/canRedo、getHistory、clearHistoryを公開する。
操作はprivate staging draftへ書き、既存draft/working/playback/dirtyは確定まで維持する。
検証と次trackerの準備を済ませてから内容を1回だけ公開。no-op / cancel / 例外はentryもRedo破棄も起こさない。
projectId / schemaVersion / createdAt / appVersion / updatedAtは履歴payloadから分離して保護し、未知fieldを保持する。
内容変更時はsnapshotVersionを進め、Undoで古いtokenへ戻さない。

履歴未接続の既存Structure編集は継続。実際の直接変更は古い履歴/openGroupをinvalidateし、現在draftを保持。
Undo/Redoとoperation確定前には期待内容・identityを照合し、通知を迂回したdriftもfail-closedで拒否する。
通常保存成功は履歴保持、dirtyは現在baseとの差分で再計算。保存中Undo/Redo拒否、追加編集・発行元へのACKは維持。
clean再保存failureのmetadata-only新revisionでbase/history/errorを消す反例を正式Nodeで修正前FAIL確認。
failure currentはpendingへ置き、明示採用までbase/history/errorを保持する。Repository書込方式と成功ACKの意味は不変更。
dirty external pendingではbase/draft/history/conflictを保持。Undoでcleanでもconflictを解除しない。
clean adoption / 明示採用 / cancel / 同project replaceDraft / destroyは履歴reset。外部削除はdraft/history保持・Undo/Redo停止。
A/B/Aはsessionごとに独立し、reloadで履歴は復元しない。

予算はsessionごとに**100 entries / 8MiB UTF-8 before-after payload**。labelは120 UTF-16 code unitsまで。
規模調査の合成同一小節project: 16/64/256/1024 bars = 12,251 / 45,515 / 178,728 / 711,745 bytes。
件数/bytes超過は古いcomplete entryから退去。単一巨大操作はvalid draftを公開し、古い全branchを捨ててoverflowを明示。
draft/base/savedを削除せず、記録不能な操作をcanUndo=trueと表示しない。これはJS heap総量・crash復旧保証ではない。

検証: baseline Node **580 PASS** → 新規history **74 PASS**、全 **654 PASS**（clean guard含む）。
正式Chrome12 suite **270 PASS**。最終ソースの回帰記録とno-write各項目0をrequired gateとする。
隔離8767 / disposable Chrome / synthetic micのみ。source/display0.33.0一致、console/app404/unhandled0。
Coreによるrepository write0。Port/Authority/ProDevice/Account/Sync/outbox/Worker/cloud mutation0。
既存Studio明示保存、Active Document、Pre-DTM working/JSON/MIDI、Audio、focus/Modal/IME、4 Themes/Printを維持。

**未接続**: Structure各編集経路、再描画adapter、native Undo統合、Undo/Redoボタン、Cmd+Z/Cmd+Shift+Z。
次はStructure Operation Adapter。離散操作から段階接続し、未接続操作のhistory barrierを維持。
FileReader / RAFのcontent token・focus owner検査、IME操作単位とnative履歴、再描画通知は接続工程の必須条件。
UIは全対応済みと誤表示せず、Core完成をStructure Undo製品完成と扱わない。

Port/Shared/Worker製品コード不変更。Host等はStudio import cache query更新のみ。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**、Daybreak待機/L3c境界維持。
既存8765/8766・PID25543・利用者profile・untracked不触。認証probe・本番deploy・D1・cutoverなし。
詳細は[Domain History Core契約](../docs/DOMAIN_HISTORY_CORE.md)参照。以下は各工程時点の履歴。


## PC Shell / Dock / Narrow Layout Polish v1（2026-10-14・履歴）

Studio **0.32.0**（Navigation・Dock詳細のUI変更によるminor）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`a4f053cf90e28bbef947e8fe8f66f79d82113053`、tracked/staged空、ahead/behind0/0。
Studio schema **1** / Authority physical schema **2**維持。
stage直前に並行NEWS文書commit `0e3dad0d29db276be045b7caa0fb92541eeab993`を検知。
指定基点のdirect child、NEWS-SOURCE-DECISION-REGISTER.mdのみ、HEAD/origin/remote一致・分岐なし・Studio不変更を確認し、許可された並行commit規則に従ってこの親から継続する。

修正前の正式Chrome反例5件で、390px Structure / Pre-DTMのMain横超過（247→265px）、
Loupe左端−16px、Dock高さ192px（600pxの32%）、Global Stopの画面外/操作不能を確認した。
600px以下ではNavigationを上段の局所横scrollへ切替え、Mainの全幅を確保。
toolbarの固定min-widthとPre-DTMのgrid最小幅を解除。狭幅の操作列のみ局所横scrollし、native Tabで各操作へ到達する。
Global Stopと再生中StopはNavigation scrollから分離。同じ既存Audio Coordinator.stopAll()を使う。

Loupeは実Main幅内へ左右8pxでcontainし、280px最小幅も可用幅を超えない。
狭幅でもmove/resizeでき、実Loupe幅でheaderを折返す。低高さでは上端除外を操作reserveまでに制限し、
残りの実高さで内部scrollする。window resizeもgeometry-onlyへ変更し、入力DOM・focus・IMEを保つ。
Dockは既存engine一つのままBPM / toggle / 拍 / 状態を優先。個別Start/StopとStandard説明はnative詳細へ整理。
memory保存状態は閉じた詳細summaryでも可視。未実装Transportは縮小し「準備中」と明示。
Dock開閉・workspace移動でMetronomeを停止/再開せず、Global Stop後も自動再開しない。

検証: baseline Node **560 PASS** → 新規20件を含む全 **580 PASS**（clean guard含む）。
Chrome: 既存正規11 suite **252 PASS**、新layout **18 PASS**、計 **270 PASS**（親12含む）。
正式repo独立8766 / 使い捨てChrome / 合成micのみ。6幅390/480/768/1024/1440/1920 × 高さ600/900 × 4 Themes。
Loupe drag/resize/keyboard/scroll/selection/pane/復帰、Dock詳細操作・8回開閉・BPM151保持、
低高さnav scroll中Global Stop・Tuner cleanup・focus/Modal/IME・Pre-DTM JSON/MIDI・A4 PDFを確認。
スクリーンショット14枚とA4 PDFを作成し、4 Themes、Structure/Loupe、狭幅Pre-DTM/Dock、Printを目視確認。
禁止write/DB creation/予期しないproject変更/console error/app404/unhandled **0**、画面/source0.32.0一致。
既存試験の変更はversion、詳細を開く経路、resize後のpane settle。音声・bounds・no-writeのassertionは保持する。

Port/Shared/Worker製品コード不変更。Studio Host等はimport cache ?v=更新のみ。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=false**。
Daybreak待機/L3c境界維持。既存8765・利用者profile・untracked不触、動的認証probe・deploy・D1・cutoverなし。
Safari / 実OS IME / 実device音声 / 普段の画面倍率の実機確認は未実施。
次はこのPC layoutの実機操作確認を優先し、その結果から次の通常PC機能を選定する。
詳細は[PC layout契約](../docs/PC_SHELL_LAYOUT.md)参照。以下は各工程時点の履歴。


## Workspace Focus Restoration v1（2026-10-14・履歴）

Studio **0.31.2**（focus復帰のbug fix）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`c0f32687f0998c3a19870327d42a59c73e60f1ff`、tracked/staged空、ahead/behind0/0。
Studio schema **1** / Authority physical schema **2**維持。

Practice / Gear / My Appsのactivate再描画でDOM参照が失効する反例を正式browserへ追加し、修正前3 FAILを確認。
既存focus routingへworkspace/list/item ID/roleによるopt-in復元を追加し、現在のDOMへ戻す。
Practice menu/set/history、Gear/My Apps item、検索・caret・filter・read/moreを区別。historyはnative Tab到達可能なreadonly行。
focusだけでselection/query/filter/order/detail/Port値を変更しない。削除・非表示・futureはread→rootの安全fallback。
現在workspace / Modal / IME / 新input ownerを確認し、旧read結果がfocusを奪わない。Modal終了も再生成triggerをIDで解決。
新timer/listener/observer/shortcutなし。既存Structure/LoupeとActive Documentの復帰経路を維持する。

検証: baseline Studio Node529 PASS → 追加31を含む**560 PASS**（clean guard含む）。
Chrome: 新規focus **19 PASS**＋既存正規10 suite **233 PASS**、計**252 PASS**（親11含む）。
正式repoの独立8766 / 使い捨てChrome、4 Themes×390/768/1024/1440/1920、選択分離、外部rename/delete/stale/error/future、
Modal/IME、高速往復・遅延read、Structure/Loupe/Print/reload/50 disposeを確認。画面/source0.31.2一致。
禁止write・binary/Authority作成・予期しないproject dirty・console/app404/unhandled rejection **0**。
Port/Shared/Worker製品コード不変更。Studio Host等はimport cache ?v=の更新のみ。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**、Daybreak待機/L3c境界維持。
既存8765 / 利用者profile / untracked不触。新規動的認証probe・deploy・D1・cutoverなし。

次はPC Shell / Dock / Narrow Layout Polish。390px toolbar/Loupe overflow、Dock密度、domain Undo、実機確認は残る。
詳細は[Focus復帰契約](../docs/WORKSPACE_FOCUS_RESTORATION.md)を参照。以下は各工程時点の履歴。

## Structure / Pre-DTM Active Document Alignment v1（2026-10-14・履歴）

Studio **0.31.1**（対象曲ずれのbug fix）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`171f31fa7dcc851d055554666c3ae48f3bd910c7`、tracked/staged空、ahead/behind0/0。
Studio schema **1** / Authority physical schema **2**維持。

既存registryのactive Structure sessionを唯一のdocument正本にし、Pre-DTM selectorも正式ownerへ委譲。
A→Pre-DTM→新規dirty B→Pre-DTMで古いAを出力する反例を正式browser試験に追加し、修正前FAILを確認。
修正後はBのJSON/MIDIとdraft/base/dirty保持。同じ曲のworkspace復帰はreloadせず、A/B/Aも個別sessionを保持。
出力は開始時のimmutable working snapshot・設定へ固定。旧完了statusとFileReaderは対象世代が変われば適用しない。
保存待ち・IME未確定・dirty external conflict・削除・future/invalid・読取不能・対象なしではPre-DTM出力をblock。
新規/未保存/保存済み/削除draft/対象なしを表示。表示/出力によるproject自動保存なし。
伴奏設定はADR-014どおり全曲共通appSettings。曲別設定mapや新schemaは作らず、明示設定変更だけを保存する。

検証: baseline Studio Node497 PASS → 新規32を含む**529 PASS**（clean guard含む）。
Chrome: 既存正規9 suite**219 PASS**＋新Active Document**14 PASS**、計**233 PASS**（親10含む）。
A〜E、保存/reload/外部更新/削除/future/空、旧FileReader、出力中切替、draft/focus、4テーマ×390/768/1024/1440/1920、Printを確認。
No-write各項目0、console/app404/unhandled rejection0、画面/source0.31.1一致。
正式repo rootの隔離8766 / 使い捨てChrome / 合成micのみ。既存8765・利用者profile不触。

Port/Shared/Worker製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**。
Daybreak待機/L3c境界維持、新規動的認証probe・deploy・D1・cutoverなし。
次はWorkspace Focus Restoration。一覧focus復帰、390px toolbar/Loupe overflow、Dock密度、domain Undoは未修正。
詳細は[Active Document契約](../docs/ACTIVE_DOCUMENT_ALIGNMENT.md)を参照。以下は各工程時点の履歴。

## Studio Gear & My Apps Read-only PC Workspace v1（2026-10-14・履歴）

Studio **0.31.0** / Port **1.22.18** / Chord **1.20.1**。Studio schema **1** / Authority physical schema **2**維持。
開始HEAD / origin/main / remoteは`f859b9c968e2e19b5c454201bab01b6be0d5cadb`、tracked/staged空・ahead/behind0/0。
既存PortDataHostの同一snapshotからGear/My Appsのimmutable projectionを追加し、2つの正式Shell workspaceへ接続。
Gear schema5 / categories1の所有状態・保存order・category・manufacturer/name・memo・photo参照を表示。
Gear schema1–4はmigration-writeを起こさずreadonly unavailable。category欠損はPortのlabel→ID fallback、補修保存なし。
My Apps schema1–7の保存配列順・旧登録形式・platform URL・preset/custom icon参照・Practice menu/history参照を表示。
リンクは文字列のみ、launch/外部通信なし。写真/iconはmetadataのみ、binaryの存在を確定しない。
PortがdataOwner。独立保存dataset/writerなし、canWrite=false。未知field/soft ref/過去履歴を補正・書戻ししない。
検索/filterは一時状態。外部更新時も選択ID/query/filterを保持し、確定削除のみ解除。stale/error/future/empty等を区別。
4 Themes・広幅2列/狭幅1列・native keyboard/IME/Modal/focus・既存譜面専用Printに対応。

検証: baseline Node457 → **497 PASS**（追加40、clean guard含む）。既存Chrome8 suite197 PASS、新規22 PASS。
Port関連4ファイル56 PASS。2001件ずつの全model保持、50回mount/disposeのlistener残存0。
禁止write/binary DB open/Authority create/object URL/外部通信0、console/app404/unhandled rejection0。
独立8766/使い捨てChrome、画面/source0.31.0一致、既存8765不触。契約・未接続範囲は[Gear/My Apps PC契約](../docs/GEAR_MY_APPS_PC_PRESENTATION.md)を参照。
Port/Shared/Worker製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**維持。
Daybreak待機/L3c未解決境界を維持し、動的認証probe・本番deployなし。次は実機閲覧確認と通常PC機能の優先度整理。
以下のversion・件数・未実装記述は各工程時点の履歴。


## Studio Tuner Standard PC v1（2026-10-14・履歴）

Studio **0.30.0** / Port **1.22.18** / Chord **1.20.1**。Studio schema **1** / Authority physical schema **2**維持。
開始HEAD / origin/main / remoteは`6e6bb399cea7c054f408da3397a5befd1983bfdc`、tracked/staged空・ahead/behind0/0。
Port pure `tuner-engine.js`を直接importし、アルゴリズム複製なしでStandard chromatic検出をPC workspaceへ接続。
A4=440Hz、70–1400Hz、Port UI既定入力閾値−80dBFS。実音名/octave/Hz/cents/confidenceとmeterを表示、null時は即clear。
capo・指定調弦・reference preview・設定保存・device選択は未接続。既定入力device、device ID永続化なし。
既存Coordinatorのmicrophone leaseとcontext ownerを利用し、mic/outputを対称排他にする。
Metronome→Tunerは同じleaseへの明示確認後だけ停止し、token変更/Global Stop後の古い意図を拒否。自動再開なし。
Stopは解析と全track/nodeを同期停止し、context close成功後にleaseを解放。失敗は保持して明示retryする。
古いpermission/resume/stream/rejectを新sessionへ採用しない。workspace離脱/hidden/pagehide/interruption/track-endedで停止する。
Global Stopは既存stopAll。native keyboard、IME/Modal/focus、4 Themes、390–1920幅、既存譜面専用Printへ対応。

検証: baseline Node420 → **457 PASS**（追加37、clean guard含む）。既存Chrome7 suite174 PASS、Tuner23 PASS。
Port既存Engine1ファイルPASS。50回native Start/Stopのtrack/context/timer残存0、listener増加0。
禁止write/DB open/create/network mutation0、console/app404/unhandled rejection0。隔離8766/使い捨てChrome/fake micのみ、既存8765不触。
実マイク音質・精度/物理device/OS/Safariは未検証。正式契約と未接続事項は[Tuner統合契約](../docs/TUNER_INTEGRATION.md)を参照。
Port/Shared/Worker製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**維持。
Daybreak待機/L3c境界を維持し、認証/認可の動的probe・本番deployなし。次は実機Tuner確認と通常PC機能の優先度整理。
以下のversion・件数・未実装記述は各工程時点の履歴。


## Studio Practice Read-only PC Workspace v1（2026-10-14・履歴）

Studio **0.29.0** / Port **1.22.18** / Chord **1.20.1**。Studio schema **1** / Authority physical schema **2**維持。
開始HEAD / origin/main / remoteは`c2fcfef56f48fd575b88e523b70d168113bb8e09`、tracked/staged空・ahead/behind0/0。
既存PortDataHostから同一snapshotのPractice読み取り専用投影を追加し、ShellにPractice workspaceと正式Navigationを接続。
メニュー/詳細、セット/順序付き参照、全進捗、最近の履歴、Calendarの練習記録/予定、添付metadataを表示する。
Portが所有者。Studio保存済みdataset/Editing Session/write APIを作らず、canWrite=falseを維持する。
削除済み参照と履歴の過去名を保持し、future/invalidを削除扱いにしない。外部更新はstable ID選択を保持し、確定削除だけで解除。
loading/error/stale/absent/empty/非対応形式を区別。添付本体DBは開かず、local-only添付の有無は未確認と明示する。
4 Themes、広い画面の一覧+詳細、狭い画面の1列、native keyboard、既存IME/Modal/Escape/focus ownershipに従う。
既存譜面専用Printの対象にPracticeを含めない。50件ずつUI表示し、history8101/Calendar1501の全modelを保持。

検証: Studio Node420 PASS（381 baseline+39追加、clean guard含む）、既存Chrome6 suite154 PASS、Practice20 PASS、Host10ケースPASS。
Port関連6ファイル68 PASS。readerのPort/IDB/Practice/Authority/Account/Pro Device/Sync-outbox/Worker/Cloud/binary write・取得0。
console/app404/unhandled rejection0、画面/source0.29.0一致。隔離8766/使い捨てChromeのみ、既存8765不触。
契約・正式schema・未接続境界は[Practice PC契約](../docs/PRACTICE_PC_PRESENTATION.md)を参照。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
L3c未解決/Daybreak待機を維持し、新規security probe・本番deployなし。通常PC UI gateをAuthority安全性承認やM3解禁と扱わない。
次はPractice実機確認とPC機能優先度整理。編集/添付本体/正式共有write/Account/Syncは別工程。
以下のversion・件数は各工程時点の履歴。


## Studio Chord Standard PC Presentation v1（2026-10-14・履歴）

Studio **0.28.0** / Chord **1.20.1** / Port **1.22.18** / Studio schemaVersion **1**。
開始HEAD / origin/main / remote=`590c3cd0a926bd7201f42144f41b13692d460bc3`、tracked/staged空・ahead/behind0/0。
前回Studio commit `174dad81`の後に正式NEWS commitが1件あり、3 refs一致とStudio/Port不変更を確認した。

Structureの現在の単一小節選択とEditing Session draftを、読み取り専用Inspectorへ接続。
major / minor / 7 / maj7(M7) / m7 / sus4 / add9 / slashの入力コード名・構成音・音名・root基準度数・bassを表示する。
Chord Cruiseのpure theory/modelを実sourceから再利用し、Studio既存記号parserからの狭いsyntax bridgeだけを追加。
未対応/曖昧/advanced表記を自動変換せず、未選択/空/入力中/複数/削除/別workspaceでは古い解析詳細を解除する。
IME中は既存Structure draftを変更せず、partial記号を解析しない。dirty external updateはdraft/baseを維持する。

Inspectorから選択・project・draft・Chord保存値を変更しない。入力/shortcut/Save/apply/指板操作を持たない。
現行Chord policyと今回の指示の指板表示境界差を棚卸しし、今回の指示どおり指板/CAGED/運指/ライブラリを未接続とした。
高度分析・Pro保存・認証/認可・共有保存・Account/Sync/Authorityは接続しない。metadataはauthorizationではない。
既存Shellのpane/keyboard/Modal/focus/Loupeへ従い、4 Themes・Print・workspace/resize/reload・購読解除を確認する。

検証: Studio Node381 PASS（追加41）、正規Chrome6 suite154 PASS（親6含む）、Host10ケースPASS、Chord pure/policy13ファイルPASS。
No write各項目0 / console error・app404・unhandled rejection0。独立8766でsource/display v0.28.0一致、既存8765不触。
契約・11機能のStandard/Pro分類・API・検証結果は[Chord PC Presentation契約](../docs/CHORD_PC_PRESENTATION.md)を参照。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
L3c未解決問題とDaybreak待機に触れず、新規セキュリティprobeなし。Authority安全性承認やM3解禁ではない。
次は通常PC機能の優先度整理（Practice read-only等）。正式共有write/B1-6再開は保留する。
以下のversion・件数は各工程時点の履歴。

## Studio Metronome PC Presentation v1（2026-10-14・履歴）

開始HEAD / origin/main / remote mainは`9a1e77e146947bfaabe8abec2ef450b793952257`。
Studio **0.27.0**（PC UI追加によるminor）/ Port **1.22.18**（不変更）/ Studio schemaVersion **1**。

Dockに大きな現在BPM、Start/Stopトグル、4拍の現在拍表示、Standard実効設定と一時設定の説明を追加。
従来の個別Start/Stopも維持する。トグルのSpace/Enterはそのボタンだけが所有し、IME/just-composed、repeat、Modal、hidden/inertを拒否。
BPM Enterは確定後も入力focusを保持。Cmd/Ctrl+Sは既存Structure Saveの対象を維持する。

拍表示は既存M1 engineの`onVisualEvent`（AudioContext時刻で排出するvisual queue）からだけ更新する。
独立timer・第2拍時計・新engineは追加しない。run identity / generation / leaseで旧通知を拒否し、Stop時にbeatを同期消去。
BPM変更は既存reschedule、Start失敗/遅延取消/再Start/Coordinator cleanupは既存ownerの停止・close・lease解放を使う。
workspace移動、Dock折畳み、Theme、visibility通知は自動停止/開始しない。折畳み中はNavigationのStopへ到達できる。
view disposeで購読とcontrol listenerを解除し、runtime disposeで既存page/visibility/device listenerと資源を解放する。

Tool paneは既存PortDataHostの凍結read modelだけを表示する。保存設定、順序付きpreset一覧、stable IDによる選択、名前/BPM/形式/Standard情報の詳細を追加。
保存BPMまたは選択presetの対応形式のBPMだけを、**明示操作**でM2のStudio memoryへ反映できる。
これはPortへの正式preset applyではなく、advanced値を反映せず、Port datasetを複製/保存しない。
Host自身・connection・資格判定を変更せず、canWrite=false、全write capability=falseを維持する。
外部更新は閲覧modelだけを更新し、dirty Structure、M2 memory、再生状態を無断変更しない。

未確認/正常読込/保存データなし/読込中/stale/読込失敗/invalid/futureを区別する。
future値は既知BPMの閲覧のみで一時反映不可。失敗時は原保存値を変更せず、明示再試行を案内する。
stale中は古い値を操作可能な現行値として扱わない。Hostのgeneration無効化に従い旧modelを解除する。
pagehideでHost購読/consumerを解放し、BFCache復帰では未確認Hostを再生成する。memoryはreloadで120へ戻り、自動再生しない。

検証: 変更前Studio Node **315 PASS**、追加25件を含む全 **340 PASS**。
既存正規Chrome4 suite **97 PASS**（親container4含む）、read-only Host **10ケースPASS**、PC Presentation **26 PASS**（親container1含む）。
計128独立browserケース。1440/1024/1920/680px、4 Themes、keyboard/focus/IME、現在拍、BPM変更、Start/Stop反復、遅延resume取消、
workspace/Dock/resize/reload/visibility、read delay/stale/失敗/retry/future、Structure dirty共存、A4 Printを確認。
新PC suiteのfixture投入後のapp操作: Port localStorage / Port IDB / Authority DB create / Pro Device Session / Account / Sync outbox /
Worker mutation / cloud publish **0**。console error / app404 / unhandled rejection **0**。
独立loopback8766は正式repoを配信し、表示v0.27.0とsource一致。使い捨てChromeを使用、旧8765（調査時v0.22.4）は不触。
変更した旧テスト期待値はStudio version、追加toggle数、Dock高さ上限のみ。主要controlの画面内到達性・音声・IME・無書込み検査を維持。

**未接続**: 正式preset apply/CRUD、advanced renderer、Pro write、Account/Sync操作、共有保存、Transport同期、mic。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
L3cの独立安全監査とDaybreakを待機し、今回新規認証競合/攻撃probeを実施しない。本工程の完了はAuthority安全性承認ではない。
次は通常PC機能の優先度整理（Chord Standard Inspector / Practice read-only等）。M3 write解禁・B1-6再開は保留する。
本番deploy / cutover / D1操作は行わない。以下のversion・件数・完了表記は各工程時点の履歴。

## L3c Observed Revocation Safety Fix（2026-10-13・履歴）

開始HEAD/origin/main/remote main=`a6b5bcd988995585f2ed80e40175f3924e1b0d6f`、tracked/staged空、ahead/behind0/0。
Port **1.22.18** / Studio **0.26.12** / Studio schema1 / Authority physical schema2・9 stores。
[観測済み失効の正式契約](../../cruise-port/docs/PRO_TERMINAL_DENIAL_CONTRACT.md)を参照。限定対象はterminal伝播・不正clockのsticky拒否・fresh native oracle。

正式challenge/renew/sessionの401＋ok=false＋invalid_credential/reauth_requiredだけを対象資格terminalとする。
device/proof mismatch、未知401/403・不正bodyは新規認可を拒否し、503/429/network/timeoutは既存bounded grantだけを維持。
検証request identity、credential/receipt指紋、Pro generation/sessionVersion、開始operation revisionを固定。
既存shared sourceへ同期ラッチ→pending revoke→同一資格auth除去/revision更新→対象receipt forgetを反映し、完了をawaitする。
同資格の途中revision更新はterminalを解除しない。別資格Bのauth/epoch/receiptを旧Aの応答で変更しない。
更新失敗はpropagationFailed、旧handle・offline・別Adapter/renderer・reopenを拒否。別DBの原子性は主張しない。
未確定retryは現資格で元identityへ再認可。確定replayは履歴のみ、publish=false。
非有限wall/mono・provider例外・origin異常は旧proofへstickyに保持し、正常な5分wall補正は維持する。
後続request開始を観測した後に先行snapshotを再取得し、completion欠落はinconclusive。round/assertionを減らさない。

修正前反例Node3/native3を保持。新規Node39＋oracle4、native Observed Revocation13＋7を正式追加。
required回帰の実測・故障回復条件・fixture修正理由は上記契約の検証記録へ集約する。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**。
通常bootへ新Authority/Adapterを接続しない。本番deploy/D1/cutoverなし。
L3d以降未着手。次は限定独立安全監査、B1-6再開/shared write解禁不可。
以下は各工程時点の履歴。

## L3c Trusted Pro Device Session Integration（2026-10-13・履歴）

Port **1.22.17** / Studio **0.26.11** / Studio schema1 / Authority physical schema2・9 stores。
開始HEAD/origin/main/remote main=`cb1ce792675d0d67ed095ccbacfe2ad1c77db54b`、tracked/staged空、ahead/behind0/0。
[正式Pro Adapter契約](../../cruise-port/docs/AUTHORITY_PRO_DEVICE_ADAPTER.md)を参照。正式SoundCruiseProOperationSource、Device Session receipt、既存操作resolverを使う。
任意source/client/boolean/guardを受け付けず、正式read-only receipt検証を通したprivate contextだけをStoreへ接続。
scope/Authority generation/operationId/action/payload/targetとPro generation/sessionVersion/operation revision/credential指紋を固定。
raw credential/key/receiptはAuthority・通知・reportへ保存しない。Control capability/evidenceとPro proofは別brand・別契約。

最終transaction内で同期assertCommitと両clockの30秒marginを確認。Proの5分補正許容を維持する。
観測済みsource失効・期限不足・clock origin変更は旧proofへstickyに保持。新しい非同期検証を要する。
未確定retryは元identityへ再認可、資格変更retag禁止。replayは過去factだけで現在のPro/cloud許可ではない。
Standard BPM/delete/applyはPro/Account不要、raw advanced値を保持。local ProにもAccount/AppDeviceを追加要求しない。

隔離fixtureのみ接続。既存legacy保存/製品Pro判定の挙動、Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
通常Port/Studio bootによる新Authority DB/Adapter writeなし。本番deploy/D1 migration/cutoverなし。
L3d以降未着手、B1-6再開/shared write解禁不可。最終回帰はAdapter契約の検証記録と完了報告を参照。
以下は各工程時点の履歴。


## L3b-2 Evidence Lifetime Safety Fix（2026-10-13・履歴）

Port **1.22.16** / Studio **0.26.10** / Studio schema1 / Authority physical schema2・9 stores。
開始HEAD/origin/main/remote main=`3007e79dba2d98fa97a841433bf43d633f6b9d03`、tracked/staged空、ahead/behind0/0。
[証拠寿命契約](../../cruise-port/docs/AUTHORITY_EVIDENCE_LIFETIME.md)をControl契約と合わせて参照する。
修正前はresume/renewの期限切れ→wall rollback→同じprepared handle成功をNode2件・native2件で再現した。

証拠私有contextはwall expiry・monotonic deadline・clock origin・観測高水位・expired/invalidatedを保持する。
いずれか残予算30000ms未満または時計逆行/不正/origin変更で不可逆失効。30秒ちょうどは既存契約どおり許可。
同じevidenceIdの再attestでcontext/deadlineを再初期化せず、異payload再発行を拒否する。

reservationsのevidence-lifetime rowはprovider＋evidenceId/generation、digest/issuer/runtime/clock所有を固定。
別renderer/reload/reopenは既存証拠を再所有できず、新しいprovider証拠identityと新operationを要する。
monotonic値を異runtime間で比較しない。BroadcastChannelは正本ではない。
最終admissionと失効row更新・Control/fact更新は同じ8-store RW transaction。
拒否時は失効rowだけをcompleteして返す。abortでも私有ラッチと既存durable所有が残り、時計rollbackで復活しない。
旧未確定予約に寿命証拠が無ければ現在clockから補完しない。確定replay/lookupは過去factだけで制限を解除しない。

cross-tab JSONはstdout flush callbackを待って終了し、>64KiBのpipe出力をparseして検証する。
round/assertion/transaction gateは減らさない。通常scope/bootへprovider/Control/Authority DBを接続しない。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**。
L3c以降は未着手、B1-6再開/shared write解禁不可。本番deploy/D1/cutoverなし。
最新回帰結果は証拠寿命契約の検証記録と完了報告を参照。以下は各工程時点の履歴。


## L3b-2 IndexedDB Authority Control（2026-10-13・履歴）

Port **1.22.15** / Studio **0.26.9** / Studio schema1 / Authority physical schema2・9 stores。
開始HEAD/origin/main/remote main=`378866071929f761e4c9ad66ce21addfe0fbb7fd`、tracked/staged空、ahead/behind0/0。
[正式Control契約](../../cruise-port/docs/AUTHORITY_CONTROL.md)をPointer/Action Policy/Repository契約と合わせて参照する。

6API: suspendWrites/revokeFence/invalidateIdentity/markRecoveryRequired/resumeWrites/renewFence。
停止側は厳密なidentity/generation bindingと冪等factを持ち、不要なexpectedEpochで拒否しない。
resume/renewは専用purpose・active Pointer・control/pointer CAS・current integrity・fresh branded evidenceが必須。
identity/recoveryラッチは通常resume/renew/publishで解除しない。healthy recoveryはread/export可能、dataset commit不可。

Control identity予約はdataset/publicationと同じgeneration＋operationId領域。拒否後の予約も保持し、異内容retag不可。
Control変更と成功factは8-storeの同一RW transactionで原子的。headを不要に変更せず、complete後だけ成功を返す。
replay/lookupは過去事実（historical=true/publish=false/operationAuthorized=false）で、現在の失効状態を解除しない。
capability/証拠はscope/generation/purpose/runtime leaseへ束縛し、dispose/versionchange/reopen後に旧objectを継承しない。

証拠は隔離test provider限定、製品provider未接続ならfail-closed。Account IDだけでなく両generation/membershipも照合する。
Worker D1 transaction fenceは最終cloud admission。既存Pro/Account/Sync guardを変更しない。
競合はrequest gateで両transactionの待機と実開始順を証明し、Date.now同値をPASS根拠にしない。

Production **legacy / Worker ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**。
Port/Studio通常bootへControl issuer/Authority DB/mutation/Pointer公開を接続しない。本番deploy/D1/cutoverなし。
L3c/L3d/L4/L5/B1-6製品入口は未着手。shared write解禁不可。
最終回帰: Control追加Node71 / Authority369 / Port/shared2175 / Worker760 / Other186 / workerd8 / Studio dirty314、全PASS。
正式Control48競合（16順序×3）、Pointer Safety15＋7、Pointer A–F＋7、CAS54＋7、参照63＋障害4＋7、native policy9＋7、L2a14、全PASS。
Playwright1.62.1 Port6suite・Studio5suite（97＋Host10）、CDP製品隔離13、全PASS。application error/404/unexpected mutation0。
commit後Studio315（clean guard込み）を除外なしで実行する。PID・oracle・fixture変更理由は正式Control契約の最終検証記録を参照。
以下は各工程時点の履歴。L3b-2の最新API/Control状態は本節と正式Control契約に従う。


## L3b-1 Safety Fix Completion（2026-10-13・履歴）

Port **1.22.14** / Studio **0.26.8** / Studio schema **1** / Authority DB physical schema **2**・9 stores。
開始HEAD/origin/main/remote main=`58b21a4263b3d689afde712e59f86d5c8068b174`。前回の91ファイル差分を保持。
[Pointer正式契約](../../cruise-port/docs/AUTHORITY_POINTER_SCHEMA_V2.md)にprovenance/current integrity/collision/retry/historyの詳細を定義する。

Pointer識別情報全体をreservations内の独立publication factと照合し、公開manifest/recordsとjournal/oplogの整合も検証。
`pointer` storeの`namespace`行はpartition/protocol/schema/最後のpointerEpochを保持し、公開後のpointer欠損を未公開と誤認しない。
現在のactive head/control/full manifest/全records/参照/current head oplogを同じnative transactionで検証する。
破損activeからのduplicate publish・別generation publish・通常saveを拒否し、hydrateはrecovery-required/read-only。

同migrationIdのretryは元operationId・元precondition・元evidenceとfingerprintが一致する場合だけalready-active。
operation identityはgeneration＋operationIdでdataset/publicationを横断し、oplogとreservationsの混用・異payloadを拒否する。
`lookupPublication`の過去確定事実は`historical=true/publish=false/currentAuthorityVerified=false`で、現在のwrite/publish認可ではない。
v1→v2は既存7 storeを再作成せず、予約移行とnamespace epoch0追加を同じversionchange transactionで実行する。
旧v2のnamespace/publication factを自動補完しない。旧未公開candidateはread-only表示、証拠のないactiveはfail-closed。

Production Authority **legacy** / Worker **ACCEPT_COMPAT** / enforcement **OFF** /
Studio shared write **OFF** / PortDataHost.canWrite=**false**を維持。
通常bootへ新Authority/providerを接続せず、本番deploy/D1 migration/cutover/active pointer公開は行わない。
L3b-2/L3c/L3d/L4/B1-6製品入口は未着手。shared write解禁不可。
検証: Pointer Safety15（native待機証明9）＋7、Pointer A–F＋7、CAS54＋7、参照63＋障害4＋7、native policy9＋7、L2a14、全PASS。
Node: Worker760 / Port/shared2104 / Other186 / workerd8 / Studio dirty314、全PASS。commit後Studio315を除外なしで実行する。
正規Playwright1.62.1: Port6suite（18/26/10/18/standard-readiness/10）、Studio5suite（21/23/29/24/Host10）、全PASS。
CDP製品隔離13もPASS。application error/404/unexpected network mutation0、期待した認証401/offline errorだけ別記録。
standard-readinessのVer1.18.0期待を正式定数由来の可視・完全一致assertionへ修正し、現行Device Session応答/初期fixture保存/reset navigation同期を合わせた。
package/lockfileと利用者8765 serverは不変更。詳細・PID・fixture修正理由はPointer契約のCompletion検証記録を参照。
以下の各工程の本文・検証数は履歴であり、この現行契約に従う。

## L3a Action Authorization Policy（2026-10-13）

Port1.22.12 / Studio0.26.6 / schema1。[Action Policy](../../cruise-port/docs/AUTHORITY_ACTION_POLICY.md)が新Authorityの正式操作契約。
requiresAuthorization自己申告の迂回を再現し、Store RW transaction内のaction/targets/raw mutation/guard検証で拒否する。
Standard BPM・preset delete/Standard applyはPro/Account不要。advanced save/create/advanced applyはtrusted同期guardと両30秒marginが必要。
identity予約はbackend.prepare返却前・直接Store.commit前に既存journalへ固定し、未確定retryのaction/payload/policy/target差替えを拒否。
確定replayは過去の事実だけ、publish=false/Sync wakeなし。system ACKは固定intent generationと内部capabilityのみ。
未知/未対応featureの新Authority mutationはblocked。物理安全回帰のgeneric writerは明示privileged test scopeに限定する。
正式Device Session/providerはL3c、Control/Account協調はL3b未接続。通常product routeからtest providerを生成/使用しない。
Production legacy / Worker ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=falseを維持。
Node policy57＋既存169、Port/shared2032 / Worker760 / Other186 / workerd8。Studioはcommit後clean guard込み315で確認。
Native policy9 / L2a14 / L2b54round＋7 / 参照63round＋failure4、Port72 / Studio97＋Host10、全PASS。console/404/unexpected network mutation0。
L3a当時の次工程: L3a独立確認、その後L3b。L3b以降/B1-6/shared write/deploy/cutoverは実施しない。以下は各工程時点の履歴。

## L2b-fix（2026-10-13・現行）

Port1.22.11 / Studio0.26.5 / schema1。承認済みbaseline6a057e6055d252a459a4fcb60c07a53ee6557ccb、NEWS commit保持。
[参照整合性契約](../../cruise-port/docs/PORT_REFERENTIAL_INTEGRITY.md)で、旧L2b監査Cの添付intent欠落/write skewを修正する。
最新candidateのStore transaction内validation、generation付き個別/owner-set intent、旧ACK/recreateを隔離検証。
許容されるmissing My App/Practice set/履歴/cacheを削除・再作成しない。添付owner deleteは同一writerで関連metadataも明示削除する。
Node35追加、Port/shared1975、Worker760/Other186/workerd8。Studio314はcommit後clean guard込み315で確認。
Native新63round＋failure4、既存54round＋7/L2a14、Port browser72/Studio97+Host10を確認して限定commit/通常pushする。
Production legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false。
L3/L4/L5/B1-6未着手/保留。次は独立fix再レビュー、その後L3着手判断。次frame Loupe focusは既存別課題で製品UI不変更。
以下は各工程当時の履歴。

## L2b Repository接続（2026-10-13・現行）

Port **1.22.10** / Studio **0.26.4 / schema1**。内部adapter/cache readerのpatch。通常UI・保存先は変更しない。
Production Authority **legacy** / Worker **ACCEPT_COMPAT** / enforcement **OFF** / Studio shared write **OFF** / PortDataHost.canWrite=**false**。
正式Pro・Account・製品controlはL3未接続。fixture controlのPASSを製品controlのPASSへ読み替えない。
B1-6再開不可（L3→L4→L5のgateが残る）、shared write解禁不可。本番Worker/D1 deployなし。

開始Gitは6e667f0e72907da4979b26ef64f1b86de7f082ffでlocal/remote一致、tracked clean/staged空。
L2bのbackendは明示scope/open/Repository注入だけ。legacy/WALの内部順序を維持、IDBの正本はL2a Storeのtransaction.complete。
cacheは表示用、Adapter baseはそのcommitのimmutable snapshot。CAS/intent/oplog/retry/guardと実測は
[Repository契約](../../cruise-port/docs/PORT_DATASET_REPOSITORY.md)。
回帰: Worker760 / Port/shared1940（追加46）/ Other186 / Studio315（commit後）/ workerd8。
Port browser18+26+10+18、Studio97+Host10、L2a native14、正式L2b driver54round＋crash等7項目を確認してcommit/pushする。
次はL3。B1-6保留/shared write OFF/canWrite=false。既存.claude/・worker node_modulesは変更/stageしない。

以下は各工程当時の履歴。旧「L2b未接続」の記述は当時の状態を示す。

## L2a IndexedDB Authority Store v1（2026-10-12・現行）

開始HEAD/origin/main/remote=`2c11f02c7e597955d7efd79eadce0f6d5a4b1ff2`、tracked/staged空、ahead/behind0/0。
Port1.22.9（dormant内部patch）/ Studio0.26.3 / domain schema不変更。
[Store契約](../../cruise-port/docs/INDEXEDDB_AUTHORITY_STORE.md)と[Cross-tab契約](../../cruise-port/docs/CROSS_TAB_AUTHORITY_CONTRACT.md)を参照。
7 store、IDB physical version1、immutable raw/version、complete manifest、head/control/oplogのatomic transactionを実装。
Node88件、native Chrome14項目。同partition2-renderer CASと別BrowserContextのpartition分離を確認する。
通常Port/Studio起動で新DB作成なし。既存Repository/Feature Store/Hostは未接続、Studio独自DBなし。
Proはfixture同期guard interfaceと30秒marginを渡す境界まで。正式資格・Account協調はL3、migration/GCはL4。
L1 acceptance driverはbackend-unavailableを維持し、L2b正式接続までStore integrationを製品acceptanceと扱わない。
B1-6再開不可（L5前）/ B1未解消 / Studio shared write OFF / canWrite=false。
Production Authority legacy / Worker ACCEPT_COMPAT / enforcement OFF。本番deploy/D1/cutoverなし。
最終全回帰/限定commit/通常pushの実測は今回完了報告を参照。以下は各工程の履歴。

## L1 Cross-tab Authority Contract（2026-10-12・現行）

Port1.22.8 / Studio0.26.2 / domain schema不変更。製品コード不変更（テスト・文書のみ）。
[Cross-tab Authority Contract](../../cruise-port/docs/CROSS_TAB_AUTHORITY_CONTRACT.md)が新Authority保存の正式契約。
実Chrome別renderer 2タブで実Port Repositoryのlost update 2件・delete intent消失2件を実測（legacyは現状維持でリスク明記）。
harness `apps/cruise-port/tests/cross-tab/`: driverは通常CI外のcharacterization/acceptance、oracle test 5件は通常CI。
B1-6再開・shared write解禁は不可。次工程はL2a（IndexedDB Authority store、dormant）。

## Pro Final Commit Race修正（2026-10-12）

Port1.22.8 / Studio0.26.2 / domain schema不変更。
[Operation Commit Guard契約](../../cruise-port/docs/OPERATION_COMMIT_GUARD.md)を現在の認可境界とする。
元Pro再現2 PASS/6 FAIL→8 PASS。追加148 matrix、native2-tab6条件、実Port Pro UIの成功/失効拒否4条件を確認。
既存Authority guard/CAS/WALに同期operation guardを合成し、正式Device Session・wall/mono期限・credential/gen/epoch/revokeを固定。
Facadeと本番Port Pro Metronome保存へ接続。Standard BPM/list/apply/delete、Account独立Pro、確定後の旧commit事実を維持。
保証外は未通知server revoke、shared Pro source/localStorageのcross-tab可視化と完全同lock線形化、非協調old build。
全回帰件数とcommit/pushの実測結果は今回完了報告とPort B1 Integrationの最新節に記録する。
B1-6未完了 / B1未解消 / Studio shared write OFF / canWrite=false。
Production Authority legacy、Worker ACCEPT_COMPAT、enforcement OFF。本番deploy/D1/cutoverなし。
次はB1-6残gateの独立監査・製品Account/control/fresh fence接続を検討する。shared write解禁工程には進まない。
以下の既存節は各工程時点の履歴。

## B1-5 Worker Transaction Fence + Cutover Barrier（2026-10-12・現行）

Port1.22.5 / Studio0.26.1 / Studio schema1。[Workerの正式契約](../../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を参照。
D1同一batchのabort guard、Account+Portのprepared→paused→enforced、固定migrationId/operationIdとepoch一回更新、
paused snapshot checkpoint、asset prepare epochと公開時再照合、cleanup retention/claim、rollback downgrade拒否を実装。
AppDevice/Proの資格・失効・verifierをtransaction内でも確認し、CAS/tombstone/change log/aggregateの原子性を維持する。
HTTP入口だけの判定ではない。metadataのenforced表示だけを実効fenceの証明と扱わない。

B1-4の接続は隔離fixtureだけ。実ledger/evidenceと完全cloud snapshotのhash/sequenceを照合し、
同epoch/generation/checkpointのbranded ticketでready-to-publishまで検証する。本番engine/active pointerは接続しない。
checkpointはcutover時点で固定。cloudが進んだ場合は明示reconciliationを要し、旧outboxやasset operationをretagしない。
Port asset clientはauthority拒否を同runtimeに保持し、自動再試行・release/discard再送を停止する（1.22.5 patch）。

本番Worker ACCEPT_COMPAT / authority legacy / enforcement OFF、Studio shared write OFF / PortDataHost.canWrite=false。
Worker deploy・本番D1適用・Port migration/cutover・本番epoch/minimum変更なし。B1は未解消、shared write解禁不可。
次はB1-6 Port/Studio Authority Integration。operator認可・cleanup crash claim回収・local legacy writer停止・
reconciliation UX・実partition/rollback/deployのacceptance gateを別途満たす。rollback先はfence対応版限定。
以下のB1-1〜4記述と検証件数は各工程時点の履歴。

## B1-4 Migration & Cutover Engine v1（2026-10-12・履歴）

開始HEAD=origin/main=remote mainは87f85503e238214ae159f2ca04b30b95246af599。tracked clean/staged空/ahead・behind0/0を実測。
Port1.22.4 / Studio0.26.1 / domain schema不変更 / journal schema1。[Migration契約](../../cruise-port/docs/PORT_AUTHORITY_MIGRATION.md)。
固定出自/raw救出、journal、再開stage、binary実読戻し、pure reconciliation、旧outbox証拠保持、新delete generation、seal/隔離pointer/recovery/rescueを追加。
新Node82件、native Chrome18項目。既存Port/Studio/Worker回帰と最終件数はMigration契約に記載。Studio Git clean guardはcommit後・push前の全315件に含める。
production default legacy、Worker ACCEPT_COMPAT/enforcement OFF、Studio shared write OFF/canWrite=false、B1未解消。
本番migration/cutover/deploy/D1適用なし。次はB1-5実効server transaction fence/cutover barrier。その後B1-6の製品統合を判断する。
個別stage・限定commit・通常pushは全検証/remote一致後に実施し、hashと最終Git状態は完了報告で実測する。以下は前工程の履歴。

## B1-2 + B1-3 Authority Preparation（2026-10-12・履歴）

開始HEAD/origin/main/remoteはb4f22ba9bbe4c7ea13e866075992bd37cf985a79、tracked clean/staged空/ahead・behind0/0。
Port1.22.3（内部patch）/ Studio0.26.1 / schema1。[Local Authority契約](../../cruise-port/docs/PORT_LOCAL_AUTHORITY.md)を現在の正式契約とする。
new clientはshared protocol正本を参照し、明示authenticated authority readからserver epochを取得できる。
protocol-capable != active。legacy outboxをupgrade/copyせず、retryのoperationId/protocol/epochを固定。blocked authorityを保持。
Port-owned新namespace、prepared marker、Repository provider、generation別Sync DB/binary、固定Account ownershipとread-only candidateを実装。
legacyとの双方向write分離と3種の旧binary delete保護をnative Chromeで検証。通常起動でnew namespace/new authority DB生成0。
全回帰結果は上記契約のValidation節。Studio Git clean guardはcommit後の全315件に含めて確認する。
Worker変更は認証済みread routeとrollout read分類のみ、ACCEPT_COMPAT不変。D1 schema追加/本番適用/Worker deployなし。
production default legacy、migration/cutover/active pointer公開なし、B1未解消、Studio shared write OFF/canWrite=false。
次はB1-4 cloud/旧outbox/binary reconciliation・ownership review・controlled publicationの設計・独立監査。
実Safari/PWA partition、OS IME/聴感/実プリンターは未検証。renderer parity/preset CRUD UIは別Phase。
個別stage・1 commit・通常pushはユーザー明示指示に従い全条件正常時のみ実施。hash/remote最終一致は実測で報告する。
以下は前工程の履歴。

## B1-1 Authority Contract（2026-10-11）

Port 1.22.2 / Studio 0.26.1 / Studio schemaVersion 1。
[Sync Writer Authority](../../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を新authority wire契約とする。
WorkerはACCEPT_COMPAT固定、legacy request許可。authority writerProtocol=2 / syncProtocol=1を受理できるが、
既存local Repository / writer protocolは1のまま。新wire送信は明示注入だけで、production clientはlegacy envelopeを維持。
D1はadditive metadataのみ。minimum fence OFF、local authority migration未実施、B1未解消。
Studio shared write OFF / PortDataHost.canWrite=false / old-build-unknownを維持する。
Worker deploy・production D1適用は未実施。次はB1-2のprotocol adoption / authority取得 / blocked UX。
以下の既存version・検証件数は前工程の履歴。

## 0. AIエージェントへの最初の指示

- 作業開始時は、この `ai-handoff/PROJECT_STATE.md` を最初に読む。
- 次に `ai-handoff/AI_WORKFLOW.md` を読む。
- PC統合の責務は `docs/SHELL_CONTRACT.md`、正式実装順は `ROADMAP.md` を読む。
- このファイルの現在地を優先し、下部の旧実装履歴の「次」「未commit」を現在の作業指示と混同しない。
- `git status -sb` を必ず確認する。
- 今回の作業範囲を明示してから作業する。
- 不明点があれば、実装前にユーザーへ質問する。
- commit / push はユーザーの明示指示がある時だけ行う。
- `git add .` は禁止。stageする場合は対象ファイルを個別に明示する。

## 1. 現在の最新状態（2026-10-11）

### Port/shared Write Gate Prerequisites v1（Port 1.22.1 / Studio 0.26.1）

- 開始HEAD = origin/main = remote main: `34c9048ccff6c2e963b979e659f1f95ea7f49fe6`、main / ahead・behind0/0 / staged空。
  前回のtracked77 + 新規5差分を保持して継続。`.claude/` / Worker node_modulesは不触。
- 現在の正式契約・検証は[PORT_WRITE_READINESS](../../cruise-port/docs/PORT_WRITE_READINESS.md)。
  B2 reader-first後owner bindingとB3新build間Sync Execution Lockを修正・再検証。
  B1は未解消、production shared write OFF / canWrite=false / old-build-unknownで封じ込め。
- ownerはendpoint / canSync / Account・Sync resolver / lifecycleを初回bind。不一致はowner_config_mismatch。
  reader取得で設定を固定せず、最後のowner releaseでruntime / poll終了。
- mutable Port SyncはAccount ID + appIdのnative Web Locks必須。identityなしはsync_identity_required。
  queueDiff / outbox / push / ACK / shadow / conflict等の同Account/app操作を直列化し、別Accountは独立。
  activation → Sync execution → dataset順。Repository lock中のnetwork awaitなし。
- Worker30 FAILはA fixture不足（identity29 + Sync未開始conflict1）。Port/shared14 FAILはA fixture6 / B version-cache8。
  C production regression / Dなし。Worker productionは不変更、test/theme-compat-harness.jsのみidentityと共有lockを注入。
  認証・AppDevice・membership・Pro・CAS・operationId・tombstone・limitsを弱めない。
- operation別readiness / formal Pro resolver / generation・private base・precommit・postcommit guardを準備。
  dormant PortMetronomeFacadeはUI未接続、load/listはHost read model。production write拒否、fixture CASのみ。
  M2 loadはnon-persistent。external dirty/saving/IMEはincoming pendingを保持し、3-way reapplyの依存衝突を拒否。
  Port通知 / 再生snapshot / audioへの接続はpending。
- subset Worker40 / Port68 PASS。全NodeはStudio314（Git clean1件はcommit後に含め全315を確認）、
  Port/shared1417 / Worker592 / Other apps85 PASS。missing identity / identified mutable / identityなしread-onlyの3 regressionを追加。
- Chrome: Studio97 / read-only Host10 / native Sync4 / Port desktop-mobile18 routes +20 +10 cases PASS。
  cached DB/network/ensure/owner/provision/bootstrap/push/pull 0。実2tab同baseのlogical operation重複なし、別Account独立。
  reader→ownerは実Host + Runtime fixture、Sync lockは実Runtime + native Locks/IDBを使用。
- 固定baseline: Project8077 / Arrangement26991 bytesはappVersion0.26.1だけ変更。MIDI813 bytesのSHA一致。
  紙面DOM / Pre-DTM / 4 Theme / print中保存・audio / focus / IME / lifecycleを維持。console / app404 / unhandled failure0。
  新PDF pixel hash一致は主張しない。実Safari / OS IME / 聴感 / 実プリンターはpending。
- Port1.22.1 / Studio0.26.1を維持。project schema1、domain schema不変更。shared runtime全HTML cache v30。
  他アプリ本体/version不触、3 Pro HTMLだけcache query追従。Feature Metadataにruntime/storeを追加しない。
- 本記録はcommit前検証。明示指示に従い個別stage・1 commit・全Node最終回帰・通常push。
  commit hash / 最終315件 / remote一致は最終実測で報告する。
- 次は強制可能なB1 authority boundary設計・独立監査。その後M3 Phase Dでmeter/rhythm/4 sounds/volume/accents、
  preset CRUD UI、正式Pro/Account、mobile/Safariを実装・検証。Prerequisites完了をB1解消やshared write解禁と扱わない。

以下は各前工程の履歴。「次」やversionは当時の値として保持し、現在地は上記を優先する。

### Studio Read-only Port Data Host v1（0.26.0）

Tool paneにPort保存BPM / effective設定 / presets / Account / Sync / cached Proの読取り専用表示を追加。
詳細と検証は[PORT_DATA_HOST](../docs/PORT_DATA_HOST.md)。初期cached表示はDB/networkなし、明示local readのみ。
Port read-only consumer、generation / late result / dispose、同一origin別tab通知を実証。M2 memory / Structure / Audioは独立。
正式Proは既存device session検証のread-only modeを使用し、鍵・session・refresh・永続writeなし。
Studio0.26.0 / schema1、Port1.22.0。M3 shared writeは未解禁。次はold-build policy等を含むM3 write条件の設計・独立監査。


### Port Runtime & Integration Safety v1（Port 1.22.0）

Port singleton host / Account generation / dispose / status-only / byte+count chunk / 新build実2tabを整備。
[Runtime Host契約](../../cruise-port/docs/PORT_SYNC_RUNTIME_HOST.md)を参照。
次はStudio read-only Host。cached status / read-only dataset / 独立した正式Pro statusを段階接続する。
Studio 0.25.1の本体・M2 memory facade・Feature Metadataは不変。M3 shared writeは引き続き禁止。
旧build policy、Port/Studio同時起動のdraft保護、正式資格・mobile/Safariは接続工程の条件として残す。

### Port Dataset Readiness Core v1（Port 1.21.3）

Port側のrepository / writer coordination / forward guard / full snapshot / delete generation / rollback基盤を追加。
検証と旧build限界は[Port Dataset Repository](../../cruise-port/docs/PORT_DATASET_REPOSITORY.md)を参照。
Studioは0.25.1・コード不変。M3 shared writeは無効。
Runtime & Integration Safetyの進捗は上記を参照。
Core完了をStudio Host接続やM3製品統合完了とは扱わない。

### Metronome M2（0.25.1・実装／回帰完了）

- 開始HEAD = origin/main = remote main: `04f5034cc4a669dddcee8dbb213d5ef396dc6c59`。
  main / tracked clean / staged空 / ahead・behind0/0。既存untracked `.claude/` / Worker node_modules不触。
- Port store / presets / policy / UI save / storage-conflictを読み取り調査。Port settings schema3、presetは独立schema1。
  settings defaults / strict validation / v1・v2・廃止音色migration / effective・merge policyをpure投影、source全文一致tests。
- 新規settings-schema / settings-store / settings-controllerをStudio内へ追加。load / save(next,{baseRevision}) /
  getRevisionのsettings-only facade、opaque revision、同一realm memory CASを実証。appが明示注入・load。
  reload永続化・Studio専用Metronome key・Port storage / Account / Sync / Pro credential / presetsなし。
- original raw envelope・validated draft・Standard effective設定を分離。BPM以外のPro rawと未知JSON fieldを保持。
  fixture downgrade / upgrade復元、prototype-like unknown keyもown fieldとして保持。metadataにruntime / storeを加えない。
  unsupported future schemaはoriginal data保持 + read-only、fallbackを保存しない。invalidもread-only / error / safe runtime。
- save failure / staleではdraft・baseRevision不変。A/B同revision→A保存→B staleを2runtimeで確認。
  成功ackのrevision・data一致確認、保存中後続draftを保持して直列auto save、duplicate save抑制、retry loopなし。
  dispose generationで遅いload / save結果のcontroller更新をblock。store受理済みwrite自体は完了し得る境界を明記。
- number change / EnterでPort同様即保存。BPM / Start / Stop surface維持、小さなmemory保存status追加。
  同じBPMのEnterでもfailure retry可。Enterは共通IME / just-composed gateを参照するread-only queryを追加。
  Cmd/Ctrl+SはStructure Saveだけ。非確定input文字列をsave通知で置換しない。
- M1 audio core / Coordinatorは無変更。BPM変更だけreschedule、保存状態通知・失敗ではaudioを止めない。
  workspace / Dock / Theme / Structure session / project BPM / Pre-DTM working snapshotへ非干渉。
  audio disposeはsettings購読だけ解除。hostのsettings disposeとは独立。advanced renderer/UIは未実装。
- Node既存218 + M2追加58 = 276 PASS。
  Chrome既存70 + M2追加23 = 93独立ケースPASS（runner97には親container4を含む）。計369独立検証。
  最終Chromeは直列実行。M1の120/240 BPM・range・restart・scheduler・50 Start/Stop・no context/timer/listener leakを維持。
  Save / IME / modal / focus / Loupe / 8・16分 / working snapshot・project選択 / 4テーマ / responsiveも回帰確認。
- 0.25.0固定baseline: Project JSON8,077 bytes / Arrangement JSON26,991 bytesはappVersionのみ0.25.1。
  MIDI813 bytes SHA-256 `5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`一致。
  save中・audio稼働中A4 PDF1200pxラスタ `8cc02f7356af60a0bbccf9349148c57d0c0784f13b2588b2b3cdb107f75a406e`一致。
  console / app404 / unhandled rejection0。既存localhost:8765、隔離Chromeのみ。新規serverなし。
  Safari / OS IME / 聴感 / 実OS interruption / 実プリンターはpending。
- APP_VERSION patch0.25.1（内部保存基盤 + 小さなstate表示）。project schemaVersion1、settings schema3を維持。
  HTML表示・cache / metadata mirror / version tests整合。Port / 他apps / shared / Worker不触。
- [Metronome統合](../docs/METRONOME_INTEGRATION.md)にAPI、前方互換、保存race、M1 / M2 / M3境界とM3 blockerを記録。
  AUDIO_COORDINATOR / FEATURE_METADATA / ROADMAPも更新。以下のM1記録は0.25.0時点の履歴。
- 本記録はcommit前の検証結果。ユーザー明示指示により、全条件正常時のみ個別stage・1 commit・通常push。
  hash / remote一致は最終実測で報告。次はM3前提確認。
  共有write有効化前に実2tab・Port同時起動、full dataset ownership、全writer協調、delete intent、正式資格失効、
  mobile lifecycle / Safari、partial snapshot禁止、Sync applyのdirty/base/playback保護を必ず検証する。
  M2のBlockerなし。M3製品統合完了とは扱わない。

### Audio Coordinator v1 + Metronome M1（0.25.0・実装／回帰完了）

- 開始HEAD = origin/main = remote main: `a8a9b4dc1d688b1aa1ec6bc9a1cca852afa19369`。
  main / tracked clean / staged空 / ahead・behind0/0。既存untracked2件不触。
- Audio Coordinatorはregistry / lease / owner / read-only borrower timebase / interruption・devicechange通知 /
  cleanup / global stop。音楽clock・BPM・scheduler・settings・Sync・Pro・projectを所有しない。
- Port metronome-app / timing / store / presets / policy / storage-conflictとaudioSession経路を読み取り監査。
  timingのtransitive importがSync global登録を持つため方式C。Studio内のpure source projectionと一致testsで
  BPM120 / 30〜240、25ms timer / 100ms horizon / 55ms lead、Standard電子click / running BPM変更を維持。
- Dock Auxiliary ToolはBPM / Start / Stopのみ、--studio-*だけ。Navigationにrunning / Stopを置き、collapsedでも到達可能。
  ownerはport.metronome session、contextは専用。Metadataは既存catalogの選択descriptor projection、全field一致test。
- duplicate / pending Startを抑制。Stopはtimer・frame・future nodeを同期取消、context close後にlease解放。
  close失敗は未解放resourceを保持、新Startをblockし明示cleanup retry。遅いresumeが新runを壊さない。
  Global Stopもpending startを無効化する。workspace / Dock / pane / Theme / visibility hiddenでは継続。
  実context interruption / pagehide / unloadで停止、復帰は明示Startのみ。
- Metronome BPMはStructure session / dirty / project BPMに入らない。BPM inputのSaveは既存studio.saveへ局所委譲し、
  active Structure / no modal / canCommit / IME gateを維持。transport targetはnull、audioOwnerは明示runtime。
- M1はmemory-onlyでreload時120。Port / StudioのMetronome保存、Pro / Account / Sync / presets / micは非使用。
  settingsSource予約引数とsetBpm / snapshot / subscribeがM2 adapter境界。M2 facadeは未実装。
- Node: 既存161 + Coordinator21 + Metronome36 = 218 PASS。
  Chrome: 既存42 + Metronome28 = 70独立ケース（runner73には親container3を含む）。計288独立検証。
  実AudioContext予定時刻で120 BPMの0.5秒間隔 / 240 BPMの0.25秒、beat数・順序・重複なし・restart・Stop後追加なし。
  50実Start/Stopでlive context0 / scheduler timer0 / owned context0 / listener増加0、dispose後自listener0。
  4テーマ / 1440・1024・800・680幅、keyboard・focus / Save / IME / modal / working sourceを確認。
- 0.24.0固定baseline: Project JSON8,077 bytes / Arrangement JSON26,991 bytesはappVersionのみ0.25.0。
  MIDI813 bytes SHA-256 `5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`一致。
  audio稼働中A4 PDF1200pxラスタ `8cc02f7356af60a0bbccf9349148c57d0c0784f13b2588b2b3cdb107f75a406e`一致。
  console / app404 / unhandled rejection0。Port / 他apps / shared / Worker不触。
- APP_VERSION minor0.25.0、schemaVersion1 / project schema不変。HTML cache・metadata mirror・tests整合。
  [Audio契約](../docs/AUDIO_COORDINATOR.md)と[Shell §33](../docs/SHELL_CONTRACT.md#33-audio-coordinator-v1--metronome-m1実装境界0250--2026-10-11)が今回の正式境界。
- 既存localhost:8765で隔離Chromeのみ使用。navigator.audioSessionはChrome未対応、M1では操作しない。
  Safari / OS IME / 実OS interruption / 聴感 / 実プリンターはpending。M1を製品統合完了とは扱わない。
- 本記録はcommit前の検証結果。明示許可に従いGit条件正常時だけ個別stage・commit・通常push。
  commit hash / remote一致は最終実測で報告。次は隔離memory facadeを使うMetronome M2。
  M3 dataset / presets / 正式資格 / Account / Sync、mic full lease、Transport / project BPM link / Undoは未実装。

### Structure Editing Session v1（0.24.0・完了／push済み、前工程の履歴）

- 開始実測HEAD = origin/main = remote main: `c5a85b77711ef976aa0b153253f2d247f613a952`。
  main / tracked clean / staged空 / ahead・behind0/0。既存untracked `.claude/` / worker node_modulesは不触。
- `editing-session.js` / `project-repository.js`を追加。Structureのproject / dirtyはsession getter。
  registryはdomain + stable targetで共有し、workspace・project往復でdraftを保持する。
  詳細は[EDITING_SESSION](../docs/EDITING_SESSION.md)と[Shell Contract §32](../docs/SHELL_CONTRACT.md#32-structure-editing-session-v1実装境界0240--2026-10-11)。
- saved / base / draft / working / playbackを分離。raw保存JSONがrevisionであり、schema・version・timestampとは別。
  project JSONやlocalStorage keyを追加しない。Web Locksでprojectと最新indexを協調排他する。
  本番Structure / Home sample・import・deleteをrepositoryへ接続。旧build / legacy直接writerの完全排他や
  強制終了時のlocalStorage transaction原子性は保証しない。Web Locks / storage不可は保存を無効にする。
- commitは固定snapshot / baseRevision / sessionId・commitId・generation。成功後も追加入力を保持する。
  別workspace / projectへ移っても元sessionへ結果を戻し、currentProjectIdをbackground saveで変更しない。
  validation / 保存失敗 / stale result / 不明ではdraft・baseを維持。cancel / destroyはin-flight結果を待つ。
- clean外部更新を採用、dirty / commit中 / IME未確定はpending。baseRevisionを進めず、draftを上書きしない。
  外部削除はcommitをblockしdraft / JSON exportを保持。最小「保存済みを採用」UIは明示破棄確認付き。
  same-Studio通知と同origin別tab storage eventを実装・確認。古いevent.newValueは利用しない。
- Save button / Cmd・Ctrl+Sを同じ`studio.save` commandへ接続。明示target・active Structure / no modal / canCommit。
  通常text shortcut除外を保ち、局所Saveだけ委譲する。focus移動でsessionを消さず、Theme・modal closeでdirty変更なし。
- Pre-DTMは同じactive Structure projectならread-only working、別projectはsaved fallback。
  activate / 明示再読込 / JSON・MIDI exportでsourceを更新。dirty由来を小さく表示。
  project選択一本化、Transport実再生、domain Undo / Redo、Sync / Account / Proは未実装。
- Node: 新規Session/repository61 + Shell19 + Metadata22 + Theme32 + Keyboard/Modal27 = 161 PASS。
  `node --test apps/cruise-studio/tests/*.test.mjs`。
  Chrome: `PLAYWRIGHT_MODULE=<既存Playwright絶対path> node --test apps/cruise-studio/tests/*.browser.cjs`。
  Session22 + 既存Keyboard/Modal20 = 42独立ケースPASS（Node表示44は親container2を含む）。計203独立検証。
- 重要4 scenario、Save / IME / modal、保存失敗retry、project切替、別tab clean / dirty / delete、未保存新規、
  saved fallback、storageアクセス拒否、fixed playback境界、print / Theme / paneを検証。console / 404なし。
  50往復でload各1回、draft / selection / focus保持、document keydown Capture1 / Bubble1、外部通知1回を確認。
- 0.23.1固定baseline: Project JSON8,077 bytes / Arrangement JSON26,991 bytesはappVersionだけ0.24.0。
  MIDI813 bytes SHA-256 `5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`一致。
  A4 PDF1200pxラスタ SHA-256 `8cc02f7356af60a0bbccf9349148c57d0c0784f13b2588b2b3cdb107f75a406e`一致。
  dirty出力はtitle / BPM / 第1小節Dm7の編集差のみ、MIDI tempo123 / D bassを確認した。
- APP_VERSIONはSave / draft保持 / Pre-DTMのユーザー-visible変更のためminor0.24.0。schemaVersion 1維持。
  asset cache / Studio metadata mirror / testsを整合。Port / 他apps / shared / Workerは不触。
- 隔離Chromeのみ使用。既存localhost:8765、新規serverなし。Safari / OS IME / 実プリンターは未再検証。
  本記録はcommit前の検証結果。ユーザー許可に従い、全検証・Git条件正常時だけ個別stage・commit・通常push。
  commit hash / remote一致は最終Git実測で報告する。次の正式工程はMetronome M1。

### Focus / Keyboard / Modal基盤 v1（0.23.1・完了／push済み、前工程の履歴）

- 開始実測HEAD = origin/main = remote main: `ee9d0eaa222136a6a904a25a4b0441ba3671f650`。
  tracked clean、staged空、ahead / behind 0 / 0。既存untracked `.claude/` とworker node_modulesは不触。
- Studio内にcommand-router / keyboard-router / focus-routing / modal-managerを追加。
  詳細なAPIと責務は[Shell Contract §31](../docs/SHELL_CONTRACT.md#31-focus--keyboard--modal-v1実装境界0231--2026-10-11)。
  focused controlとactive document / selection / musical input / Editing Session / Transport / audio ownerは独立slot。
  未接続slotはnull。Save / Undo / Redo / Playは未登録で、browser標準をpreventDefaultしない。
- Captureはactive modalの背面抑制・focus trap・Escape。通常shortcutは既存局所handler後のBubble。
  text controlを先に除外し、IME 4 guardsを維持。Structure Escapeは中央登録adapterへ移行。
  modal → popover → 右overlay → Structureセル解除 / Loupe終了。同一eventは一ownerだけが消費する。
- native dialogのsingle active基盤。name / initial focus / Tab loop / Shift+Tab / background inert /
  aria-hidden復元 / Escape / trigger復帰 / cleanupを確認。入れ子は拒否、通常window.confirmは変更しない。
  本番modal画面は追加せず、隔離fixtureで検証。Loupe・popover・右paneは非modalのまま。
- focus復帰は存在・visible・enabled・active workspace所属を検証し、無効triggerは安全なNavigationへfallback。
  workspace保持、pane close / breakpoint close / Dock collapseを保護。展開DockへTab到達可能。
- Node: Shell 19 / Metadata 22 / Theme 32を維持、新規Keyboard / Command / Focus 27、合計100 PASS。
  `node --test apps/cruise-studio/tests/*.test.mjs`。
  実Chrome: `PLAYWRIGHT_MODULE=<既存Playwright絶対path> node --test apps/cruise-studio/tests/keyboard-modal.browser.cjs`。
  20実画面ケースPASS（Node出力21には親container testを含む）。新規独立検証は27 + 20 = 47件。
- StructureのArrow / Tab / Shift+Tab / Enter / Escape / Alt、lyrics / chord / doremi / strum / Loupe / popover /
  8分・16分を確認。合成compositionstart → key229 → compositionupdate → compositionend → 直後Enterと、
  Chrome CDP Input.imeSetComposition / insertTextで日本語確定を確認。modal IME中Escape / Enterで誤closeなし。
- 50回Structure ↔ Pre-DTMでdraft / selection / focus保持、load各1回、document keydown Capture1 / Bubble1から増加なし。
  inactive入力へTabで入らず、inactive Structure Escapeも無反応。1 EscapeでpaneとLoupeが同時に閉じない。
- 1440×900 / 1024×768 / 800×700 / 680×700でmodal / pane / focus、breakpoint復帰を確認。
  Dark / Light / Charcoal / Grayのfocus ring / modal / overlay、Nav / theme / workspace / pane / Dockへkeyboard到達。
  console error / HTTP404 / ResizeObserver loopなし。modal / Shell chromeは非印刷。
- 0.23.0 baseline同一fixture比較: Project JSON 8,077 bytes / Arrangement JSON 26,991 bytesはappVersionのみ0.23.1。
  その他の全field一致。MIDI 813 bytes SHA-256:
  `5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`（完全一致）。
  A4 PDFの1200pxラスタSHA-256:
  `8cc02f7356af60a0bbccf9349148c57d0c0784f13b2588b2b3cdb107f75a406e`（完全一致）。
- APP_VERSION 0.23.1は既存操作基盤の小変更としてpatch。schemaVersion 1維持。HTML cache / metadata mirror / testsを整合。
  Theme / Feature Metadataの責務変更なし、それらの契約docsは前工程の記録として維持。
  Port / 他apps / shared / Worker / Account / Sync / Pro / 音楽data処理は不触。
- 隔離Chromeだけで検証。既存 `http://127.0.0.1:8765/index.html` 使用、新サーバーなし、検証Chrome終了。
  Safari・OS日本語IME実機・実プリンターは未再検証。CDP IME検証をOS実機合格とは扱わない。
- 本記録は限定commit前の検証結果。ユーザーの明示許可に基づき、Git条件が正常なら個別stage・commit・通常push。
  commit hash / remote一致は最終Git実測で報告する。次はStructure Editing Session（working snapshot含む）。
  Metronome / Transport / domain Undo / actual Save command等の後続工程は未着手。

### Studio Shell v1（0.23.0・完了／push済み、前工程の履歴）

- 開始時HEAD = origin/main = remote main: `7b4d5b75b181a4bad8b19751e4303c43cae80842`。
  tracked clean / staged空 / ahead 0・behind 0。既存untracked 2件は不触。
- `js/shell.js`と`shell.css`を追加。Navigation / Main / Right pane / Dockの4領域。
  Home / Structure / Pre-DTM / 既存Appsをhostする。新しいglobal Headerは追加しない。
- Structure / Pre-DTMは初回だけload。切替はdeactivate / activateで、Structureのdraft / selection /
  Loupe / scroll / focusを保持。Pre-DTMのloadを分離し、activate / deactivateのI/Oはなし。
  hostがhidden + inertと復帰を担当する。新規project / 明示読込 / tab終了の既存破棄guardは維持。
- Mainをscroll root abstractionへ注入。window縦scrollを止め、Mainをprimary scrollにする。
  右pane / Navigationだけ必要に応じ独立scroll。Shell ancestorにfixed Loupeの座標系を変えるtransform等なし。
- safe-area providerはMain / Structure toolbar / 表示中Dockの実寸を返す。collapsed Dockは0。
  任意left / right / containを追加し、LoupeをMain横幅と下端の操作可能領域へclamp。
  保存{x,y,width}はviewport座標のまま。Main幅680px未満ではnarrow modeとヘッダー操作列折返し。
  hidden / 0幅 / printのResizeObserverで保存値を壊さない。
- Navigationは176px、800px以下128px。右paneは1280px以上で256px常設可能、以下では非modal overlay。
  breakpointを跨いだ時は閉じ、pane内focusを対応ボタンへ戻す。Inspector / Toolのstateは別。
  DockはTransport / Auxiliaryを分離したempty host。右pane / Dockは初期閉、layout stateはmemory-only。
- 4テーマはTheme Contractのsemantic tokenだけを利用。既存workspace chromeへの最小aliasを追加。
  紙面 / music / Loupe色は不変。Theme選択はNavigation内のnative radio group、矢印キー / Tab、
  即時反映、保存失敗表示を確認。既存appSettings.colorThemeのみ保存し、新keyは追加しない。
- Pre-DTMは保存済みprojectの初回 / 明示再読込 / 明示選択を維持。working snapshotは未接続。
  別projectを選んでも保持中のStructure draftを暗黙交換しない。リンクはStructureへ戻る導線とし、
  未保存変更が自動反映されないことを画面へ明記。active document一本化はEditing Session工程。
- Node: Shell 19 + Theme 32 + Metadata 22 = 74 PASS。
  隔離Chrome: Dark 1600×900 / 1440×900 / 1280×800 / 1024×768 / 900×700 / 800×700 / 680×700、
  Charcoal / Gray / Lightは1440×900 / 1024×768 / 800×700。加えて1440×600 / 1024×500 / 680×450。
  Loupe / toolbar / Dock境界、紙面縮尺、横overflow、非active Tab除外、pane focus復帰、Theme失敗を確認。
- Structure: project / section・bar編集 / 保存・再読込、chord / strum / lyrics / doremi、8/16、mixed、auto / fixed、
  鍵4状態、合成compositionによるIME guard、Loupe drag / resize / clamp / max-heightを確認。
  未保存draft往復でload回数1・保存project再読込なし、selection / geometry / scroll / focus一致。
  hidden中のresizeでLoupe保存値不変。紙面全要素の文字 / 背景 / 罫線 / selection色は4テーマで一致。
- Pre-DTMのproject選択とGuitar / Bass / Drumsの出力を比較。Project JSON 8,077 bytes、
  Arrangement JSON 26,991 bytesはappVersion 0.22.4→0.23.0だけの差。正規化後の内容は完全一致。
  MIDI 813 bytesのSHA-256: `5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`（前後一致）。
  A4 210×297mm、Shell chrome / Loupe非印刷。PDFラスタSHA-256:
  `8cc02f7356af60a0bbccf9349148c57d0c0784f13b2588b2b3cdb107f75a406e`（前後一致）。
  最終console error / app 404 / ResizeObserver loop / unhandled rejectionは0。
- APP_VERSION 0.23.0（ユーザー-visible Shellのminor更新）。source / metadata mirror / HTML asset参照 /
  tests / docsを整合。schemaVersion 1。保存済みprojectの自動書換なし、明示exportは既存version更新規則に従う。
  Port / 他apps / shared / Worker / Account / Pro / Syncは不触。
- 検証は既存 `http://127.0.0.1:8765/index.html`を使用。新規サーバーなし、隔離Chromeは終了。
  外部fontは検証側で隔離。PDF比較は同一fixture / clock、1200pxラスタ。Safari・実プリンター・実OS IMEは未再確認。
- Shell hostのBlockerなし。次はFocus / Keyboard / Modal → Editing Session → Metronome M1 / M2 / M3。
  本記録は限定commit前。ユーザー指示に従い全検証・Git条件が正常なら限定commit / 通常push。
  hashとremote一致はGitを実測する。後続機能への着手許可は含まない。

### Theme Contract v1 + Studio Theme Projection（完了・push済み、前工程の履歴）

- 詳細は[THEME_CONTRACT](../docs/THEME_CONTRACT.md)。Portの色・settings / bootstrap / applyを
  読み取り再監査し、Studioだけに4テーマ（dark / charcoal / gray / light）のprojectionを追加。
- `js/core/theme-projection.json`に39 semantic token × 4テーマのfile / selector / property / literalを記録。
  `theme-projection.css`は`--studio-*`だけを定義。state / gradient / focus例外 / overlay / shadowも出典を検証。
- `js/core/color-theme.js`に最小runtime APIとpure resolver。`index.html`のstylesheet前同期bootstrapと
  runtimeは同じインスタンスを使う。rootはhtml[data-theme]、不正 / 未保存 / storage failureはdark。
- 既存`cruiseStudio.appSettings.colorTheme`へ明示set時だけ保存。Loupe / Pre-DTM / 未知fieldを保持し、
  破損recordは上書きしない。Port設定は読まない・書かない。Account / Sync連動・OS追従は未導入。
- 既存UIは新semantic token未消費。TOP / Structure / Pre-DTMの配色を維持。紙面selection / focusだけ
  既存値のpaper tokenへalias化。print.css、paper / music / Loupeの既存色と保存形式は維持。
  theme-color metaはPort定義へ一致させた。native color-schemeは旧画面へ適用せず将来Shell hostで使用。
- Theme 32 + Metadata 22 = 54 test PASS。Port source一致・drift拒否、storage失敗・破損保護、
  bootstrap/runtime一致、import時副作用、Metadata分離、paper / print境界を確認。
- 既存8765サーバーの実HTTPで4テーマ / invalid / no-value / corrupt JSON / storage-blockedを確認。
  CSS応答前とfirst paintのtheme一致、39 CSS値、初期非保存、console error / asset 404なし。
  TOP / Structure / Loupe / Pre-DTM / printの変更前後画像・body DOM・Project JSON / storage一致、self-check OK。
  印刷確認はprint media画像とcomputed A4寸法。実プリンター / Safariは本工程では未再確認。
- APP_VERSION 0.22.4、schemaVersion 1、曲JSON / Syncは不変。Theme asset cache keyだけを更新。
  Feature MetadataへのTheme追加なし。Theme単体配信はMetadataのPort ESM隣接配信条件と独立。
- 開始時HEAD = origin/main = remote mainは`3879b26ac63891908954618a056a0bdd7a2e361d`。
  tracked clean / staged空 / ahead 0・behind 0。既存`.claude/` / worker node_modules不触。
  `7b4d5b75b181a4bad8b19751e4303c43cae80842`としてcommit / push済み。
- 次工程はStudio Shell v1。本工程ではShell / theme selector UIを実装していない。
  Port / 他apps / shared / Worker / Account / Pro / Syncは不触。

### Version / Feature Metadata v1（完了・push済み、前工程の履歴）

- Shell Contract v2.1 §21に基づき、Studio側だけにcomponent catalog（6件）、feature catalog（17件）、
  pure text version reader / verifierを追加。詳細は[FEATURE_METADATA](../docs/FEATURE_METADATA.md)。
- Portは副作用のない元ESM定数import。他5件はsource path / symbol / extraction / expectedValue付きmirror。
  sourceが正で、不一致はテスト失敗。classic script全体をversion取得目的で実行しない。
- 読み取りAPI、未知IDのnull、deep freeze。supported候補とStudioで実装済みpresentationを分離。
  policy keyはPort / Chord現行sourceへのaction単位参照で、資格状態・permission結果・Sync状態を持たない。
- マイクはTuner / Rhythmの対象actionだけの静的要件。audioRoleは配列。dataOwner / syncOwnerは実adapterの
  appIdに照合。Studioは正式Sync未参加でsyncOwnerを登録しない。Theme / backend versionは今回追加しない。
- 初回Node必須12項目すべて合格。source一致、policy定義とconsumer、owner、immutability、未知ID、
  DOM / storage / permission / audio / network / timerへのimport副作用なしを確認。
- 独立レビューはB（軽微修正後commit）。指摘のMinor 2件を修正: Version宣言終端`;`を必須化し継続式を拒否、
  metadataに依存しないfeature→owner / 必須action→policy / 必須action→microphone期待値を追加。
  22テストすべて合格。現行6 source一致、必須項目の欠落検出、メモリ上のpolicy削除 / microphone削除 /
  別の実在ownerへの変更を検証関数が拒否することを確認。汎用parser化・カタログ設計変更は行わない。
- Minor修正後はrepo rootを公開する一時HTTPサーバーの正規隣接URLで軽回帰を再実施。
  Port元ESMを含むmoduleを実HTTP経由でimportし、TOP / Structure / Pre-DTMのself-check OK、
  console error / asset 404なし、import前後の画面画像・DOM・保存データ・global一致を確認。
  外部fontと自動favicon要求は検証側で隔離。検証用Chromeと一時サーバーは終了済み、既存8765サーバーは不触。
- 隔離ChromeでTOP / Structure / Pre-DTMを確認。self-check OK、console error / 404なし。
  registry import前後の画面画像・DOM・localStorage・Project JSON・global一致。ユーザーのSafari実機再確認は本工程では未実施。
- APP_VERSION 0.22.4、schemaVersion 1を維持。index.html / app.js / Structure / Pre-DTM / CSSを変更せず、
  既存version表示・起動import graph・project JSON / storage / Syncは不変。新しいStudio内部module参照は?v=0.22.4。
- 元Port ESM importにはapps/を隣接配信するHTTP topologyが必要。Studio単独rootでは新registryを直接importできない。
  現行UIはregistry未接続なので既存単独サーバーに影響なし。Shell接続前に配信条件を満たす。
- 開始時HEAD = ローカルorigin/main = `0f7c407f991f4894db851a4236c7986ebad6b567`、tracked clean、staged空。
  第1段階commit `92c524341ace65792237ce1e5f4576bc0d74197f`はmain履歴に含まれる。fetchなし。
  `.claude/` / `workers/sound-cruise-sync/node_modules/`不触。Port / 他apps / shared / Worker / Account / Pro / Sync不触。
- Metadata v1は`3879b26ac63891908954618a056a0bdd7a2e361d`としてcommit / push済み。
  後続Theme監査とTheme基盤の現在地は上記を参照する。以下の「今回」はMetadata工程の履歴。

### Studio-only無変化refactor 第1段階の完了記録（前工程の履歴）

- 記録時点はcommit前。本記録と実装済みJS 3ファイルを限定commitする工程。refactorのpushは未実施。
- Shell Contract v2.1は文書commit `f2c5ffb19848f2d687140824fff2f6363e3631c7` としてpush済み。
- 第1段階の実装・Chrome変更前後回帰・ユーザー実機確認が完了し、ユーザー-visible差なしとして承認済み。
- 実装: scroll root abstraction（default window）、Loupe safe-area provider、Structure専用toolbar、
  ResizeObserver（hidden / 0幅で保存値保護）、load / activate / deactivate分離、enter互換、Escape gate、
  Pre-DTM project source provider準備。activateは保存projectを再読込せず、draft / selection / focus / scrollを保持可能。
- 既存画面遷移の読込結果は維持。Pre-DTMのdefaultは保存済みprojectで、Structure working snapshot実接続は未実装。
  Shell / Editing Session / 共有Metronomeも未実装。
- Chrome隔離環境の代表幅1440 / 1280 / 1024 / 800 / 680pxでTOP / Structure / A4 / Loupe、drag / resize /
  復元 / clamp / dynamic max-height、IME guard、8→16→8 / mixed / auto・fixed / 鍵4状態、JSON / MIDI /
  printを比較済み。重大consoleエラー・404なし。
- Project JSON 7,946 bytes、伴奏JSON 25,599 bytes、MIDI 813 bytesは変更前後SHA-256一致。
  Pre-DTMイベント数Guitar 19 / Bass 32 / Drums 48も一致。印刷ラスタ完全一致、Loupe非表示を維持。
- ユーザー実機確認済み: Structure表示、Loupe、Safari既存保護、IMEを含む基本入力、8分 / 16分、
  drag / resize / clamp / UI表示。問題なしとの判断を受領（Codex自身によるSafari実機検証ではない）。
- APP_VERSION 0.22.4、schemaVersion 1、asset ?v=は維持。project JSON形式・localStorage / appSettingsの
  キーと保存意味・Loupe保存形式 `{x,y,width}` は変更なし。Port / 他apps / shared / Account / Sync / Worker / Proは不触。
- 次の正式ステップはVersion / Feature metadata。その次はCruise Port Theme / Design Token調査、続いてStudio Shell。
  テーマの将来方針は[ROADMAP](../ROADMAP.md#次工程とテーマ方針)を参照。今回はテーマCSS / UIを変更しない。
- 本工程開始時実測: HEAD = ローカルorigin/main = `f2c5ffb19848f2d687140824fff2f6363e3631c7`、
  branch `main...origin/main`、tracked差分はStudioのJS 3ファイルだけ、staged空。
  既存untrackedは `.claude/` と `workers/sound-cruise-sync/node_modules/`。不触。fetchなし。
  次工程開始時にはGit状態を再測定する。

### PC統合設計の経緯（v2.1文書化時の履歴）

- PC実画面UI監査完了。
- Shell v1設計完了。
- Astra / Claude Codeの独立レビューで、両者ともC（重要修正後に再レビュー）。
- Shell Contract v2を作成。
- Astra限定再レビューはB（Undo / Redo外部更新境界とcommit中cancel / destroyの追記）。
- Claude Code最終レビューはB（ユーザー提供の最終レビュー整理に基づく）。
- 本工程で両レビューの指定指摘を[Shell Contract v2.1](../docs/SHELL_CONTRACT.md)へ反映し正式文書化。
- 次はStudio-only無変化refactor。本工程はdocsだけで、Shell / Editing Session / 共有Metronomeは未実装。
- v2.1文書化を、両レビューアによる再承認や実装試験合格として扱わない。

### 実測Git baseline（v2.1文書化開始時の履歴）

- 正式repo: `/Users/murakamimasakuni/Desktop/2.AI_Work/Cruise_apps/`
- HEAD / ローカルorigin/main: `c3dcb4364521f625d8759d6f32e27717f265badf`
- branch: `main...origin/main`
- tracked差分・staged files: なし。
- 既存untracked: `.claude/`、`workers/sound-cruise-sync/node_modules/`。本工程では触れない。
- fetchなし。origin/mainはローカル参照であり、remoteを新たに確認した結果ではない。
- Studio直近履歴: `be25a341`（権利・AI利用方針）、`c9904591`（フローター視認性・表示安定性）、
  `3f387b18`（v0.22.3）、`e64cf1ee`（v0.22.2）、`b2772103`（G4）。
- v0.22.4関連変更は`c9904591`として既に履歴に含まれる。旧「未commit」記述を現在の差分と解釈しない。
- APP_VERSIONは0.22.4、project schemaVersionは1を維持。本工程ではコード・asset ?v=を変更しない。
- この記録は本工程開始時のsnapshot。次工程開始時にはstatus / HEAD / origin/main / log / staged差分を再測定する。

### 保護方針

Cruise Studioは未リリースで大規模変更可能。一方、リリース済みPort / Chord / Pitch / Fretboard / Rhythm /
Cruise Sync / Accountの既存動作・保存データ・認可は破壊禁止。共有化に必要な既存側変更は別工程で対象と
回帰条件を明示する。並行セッションの未commit差分・untrackedは勝手に変更・stageしない。

旧repo / migration bundleは読み取りも禁止。本工程はStudio配下のEditing Session / repository / adapter /
Save / Pre-DTM source / version整合 / tests / docsに限定する。domain Undo / Transport / Metronome / Chord等は追加しない。
Port / 他apps / shared / Workerは変更しない。限定commit / 通常pushは全検証・Git条件に従う。
後続作業へ許可を流用しない。

## 2. クルーズスタジオの目的

- Cruise Port / Cruise appsの機能・データ契約・Sync・Pro・Versionを正確に共有するPC制作ソフト。
- PC専用Shellとpresentationを用意し、mobile UI / CSSを丸ごと埋め込まない。
- Structure譜、五線譜、TAB、MusicXML、MIDI、DTMへ段階展開する。
- StudioProject、Editing Sessionのdraft、read-only working snapshot、再生用snapshotを分離する。
- Port-owned dataはportの所有・datasetを維持し、Studio独自datasetへ複製しない。
- 詳細責務はShell Contract、依存順はROADMAPへ一本化する。

## 3. モジュール全体像

以下は現行モジュールの概要。Shell / Inspector・Tool pane host / Dock hostはv1実装済み。
Structure Editing Session v1は実装済み。各paneの実機能、Transport / shared serviceは未実装。詳細はShell Contract §32。

### 譜面クルーズ

- 曲情報
- セクション
- 小節
- コード
- 歌詞
- ドレミ / メロディ
- タイミンググリッド
- ストローク / リズム譜
- A4紙面
- 将来の五線譜変換

### プレDTMクルーズ

- 同じactive Structure projectはread-only working snapshot、別選択projectは保存済みprojectを読む。
  project選択をShell active documentへ一本化するUIは未実装。
- 伴奏イベントを生成する。
- Bass / Drums MIDIを書き出す。
- Acoustic Guitarは現状MIDI対象外。

### 既存アプリランチャー

- 音感クルーズ
- 指板クルーズ
- リズムクルーズ
- コードクルーズ

## 4. 完了済みフェーズ

以下は既存実装の履歴。新PC統合の完了を意味しない。

- `v0.1.0`: クルーズスタジオ母艦と設計基盤
- `v0.2.0`: 譜面クルーズ骨格・曲情報フォーム
- `v0.3.0`: セクション管理・小節グリッド・コード入力
- `v0.4.0`: 譜面クルーズMVP、歌詞/ドレミ/印刷/JSON
- `v0.5.0`: プレDTMクルーズ骨格、既存アプリランチャー
- `v0.6.0`: プレDTM伴奏設定、MIDI書き出し
- `v0.6.1`: beforeunload、currentProjectId、inspectSmf、コードクルーズ導線
- `v0.7.0`: A4固定紙面レンダリング
- Phase S0: スロット編集プロトタイプ
- `v0.8.0 / S1a`: タイミンググリッド、段区切り線、ON/OFF、PDF反映
- `v0.9.0 / R1`: 基本ストローク入力・ストローク段表示
  - 基本ストローク入力欄
  - `↓` / `↑` / `・` / `〜` / `x` の記号パース
  - `strum_custom_basic` への保存
  - `basicStrumPatternId` への反映
  - A4譜面のコード段下にストローク段表示
  - `showStrum` トグル
  - 保存/復元
  - JSON往復
  - プレDTM読み込み
  - MIDI書き出し
  - `schemaVersion` は1のまま
- `v0.10.0 / S1b`: 本番側に小節クリック選択 + 空の編集レイヤー土台
  - `.sheet-bar` へ `data-bar-number` 付与
  - A4紙面上で小節クリック選択
  - 選択ハイライト
  - `.slot-overlay` の位置追従
  - `chord / strum / lyrics / doremi` 行定義DOM
  - overlayは印刷除外
  - 選択状態は保存しない一時UI状態
- `v0.11.0 / S1c`: 歌詞・ドレミ入力を本番overlayへ移植
  - 選択中小節overlayに `lyrics` 入力欄を追加
  - 選択中小節overlayに `doremi` 入力欄を追加
  - 既存 `bar.lyrics` / `bar.melody` 構造へそのまま反映
  - A4紙面を即時更新
  - 既存カード型入力UIとも同期
  - IME入力中のキー操作を小節選択と分離
  - overlayは印刷/PDFに出さない
  - `schemaVersion` は1のまま
- `v0.12.0 / S1e`: コード入力を本番overlayへ統合
  - 選択中小節overlayに `chord` 入力欄を追加
  - 既存 `bar.chords` / `setBarChord()` 構造へそのまま反映
  - 1小節1コードの既存仕様を維持
  - 既存カード型コード入力UIとも同期
  - コード検証は既存UIと同じ警告ベース
  - A4紙面のコード段を即時更新
  - 歌詞・ドレミoverlay入力は維持
  - overlayは印刷/PDFに出さない
  - `schemaVersion` は1のまま
- `v0.13.0 / S1d`: まとめて入力・Alt移動
  - `Alt + ArrowLeft` / `Alt + ArrowRight` で選択小節を前後移動
  - overlay内の「前へ」「次へ」ボタン
  - 移動先小節へoverlay位置を追従
  - コード / 歌詞 / ドレミのまとめて入力
  - 既存 `bar.chords` / `bar.lyrics` / `bar.melody` 構造へ順に反映
  - A4紙面と既存カード型入力UIを即時同期
  - 選択状態やまとめて入力UI状態は保存しない
  - `schemaVersion` は1のまま
- `v0.14.0 / R2`: ストローク行を編集レイヤーに追加、小節別 `strumOverride` UI
  - overlayに `strum` 入力欄を追加
  - 空欄なら基本ストローク継承、入力ありなら小節別上書き
  - `bar.strumOverride` と `project.strumPatterns` の既存構造を再利用
  - 小節専用パターンIDを作成/更新し、未参照パターンは最小限掃除
  - A4紙面のストローク段へ即時反映
  - 小節別上書きの16分相当をグリッド自動判定へ反映
  - 既存のコード / 歌詞 / ドレミoverlay入力、小節移動、まとめて入力を維持
  - 保存/復元、JSON、プレDTM、MIDI既存経路を維持
  - `schemaVersion` は1のまま
- `v0.15.0 / R3`: コード＋ストローク段の文字ベースリズム譜表示改善（push済み: `a167f007`）
  - VexFlow / 五線譜 / 正規休符 / タイ曲線 / MusicXMLは未導入のまま
  - 既存の文字ベース表示（↓ / ↑ / ・ / 〜 / x）を読みやすく整形
  - ストローク段に8分/16分の識別classと記号種別classを付与
  - コード段直下の余白、休符/伸ばし/ミュートの濃淡、画面/印刷サイズを調整
  - showStrum OFF時はストローク段を生成せず、不自然な余白を残さない
  - タイミンググリッドON/OFFと共存
  - overlay編集、小節移動、まとめて入力、保存/復元、JSON、プレDTM、MIDI既存経路を維持
  - `schemaVersion` は1のまま
- `v0.16.0 / UI再編 D1`: 譜面全幅化・曲情報等のドロワー化（push済み: `19ea503e`）
  - 背景: 実機確認で、曲情報が常設で左カラムを占有し、A4紙面が縮小表示されて
    編集しづらいことが判明した。Fable5による設計レビューの結果、将来的には案A
    「下部ドック型スロットエディタ」を推奨方針とし、まず土台としてD1（譜面全幅化・
    ドロワー化）を先行実装する方針とした（`docs/DECISIONS.md` ADR-025）
  - `.sheet-layout` を左右2ペイン（編集パネル+A4紙面）から1カラム構成に変更
  - 曲情報・セクション・表示設定・小節グリッド（旧一覧編集）を上部の折りたたみドロワー
    （`<details id="sc-editor-drawer">`）へ移動。既定は閉じた状態
  - 小節グリッド（旧一覧編集カード）はドロワー内でさらにネストした
    `<details id="sc-bar-grid-drawer">` に収め、常設表示から外す（機能・データは維持）
  - A4紙面プレビューはドロワー下にフル幅表示。`.sheet-preview-viewport` の
    `max-width: 794px` は紙面の自然サイズと一致するため、画面幅が十分あれば
    常に等倍（scale=1）表示になり、以前の2ペイン時（scale<1で縮小）より大きく見える
  - 紙面上の小節クリック選択・ミニoverlay編集（コード/ストローク/歌詞/ドレミ入力、
    Alt+←/→、前へ/次へ、まとめて入力）は暫定維持、ロジック変更なし
  - print.css の非表示リストに `.sheet-editor-drawer` を追加
  - データ構造・保存/復元/JSON/プレDTM/MIDI経路は無変更。`schemaVersion` は1のまま
  - VexFlow / 五線譜 / MusicXML / 下部ドック型スロットエディタ本体はD1では未着手
- `v0.17.0 / UI再編 D2 MVP`: 極小overlayを画面下部の編集ドックへ移設（push済み: `ac8acc96`）
  - 背景: D1実機確認で、譜面が主役に見えるレイアウトにはなったが、小節クリック時に出る
  `.slot-overlay`（S1b〜R2）が小節上に出る小さな箱のままで、入力欄が狭く操作しづらいままだった。
  Fable5の設計レビューで推奨された案A「下部ドック型スロットエディタ」に沿って、
  まずD2としてドックの器（画面下部固定・大きな入力欄）だけを先に作り、
  拍/裏拍/16分セル入力（本格スロット入力）はD3へ送る（`docs/DECISIONS.md` ADR-025）。
- 主な内容:
  - `#sc-slot-overlay` のDOM位置を `#sc-preview` 内（紙面と一緒にスケールされる場所）から
    `#screen-sheet-cruise` 直下（`.sheet-layout` の外）へ移動し、`position: fixed; bottom: 0;`
    の画面下部ドックとして常に等倍サイズで表示する（紙面のスケール・スクロールに影響されない）
  - 内部の行構造（chord/strum/lyrics/doremi）・入力ロジック・まとめて入力・小節移動
    （`applyOverlayFieldChange` / `buildOverlayInput` / `buildBulkInputPanel` / `moveSelectedBar` 等）は
    S1b〜R2からそのまま流用。保存先・検証ロジックは無変更
  - ドックヘッダーに「〇小節目を編集中」表示、分かる場合はセクション名バッジ、
    「← 前へ」「次へ →」、補助テキスト「Alt+←/→でも移動できます」、「✕ 閉じる」を追加
  - 「閉じる」は選択解除（`deselectBar()`）として実装。紙面上の小節を再クリックすると
    同じ小節が再選択され、ドックも再表示される
  - 入力欄を明らかに拡大（旧: font-size 10.5px・padding 2px 6px → 新: font-size 17px・padding 12px 14px）
  - ドック本文は「入力4行（左）＋まとめて入力（右）」の2カラム（900px未満は1カラムに畳む）
  - ドック表示中は `body.dock-open` クラスを付け、`#screen-sheet-cruise` に
    `padding-bottom: 56vh` を与えて紙面下部がドックに隠れすぎないようにする
  - 座標追従用だった `positionSlotOverlay()` は、選択中の小節が紙面から消えた場合の
    安全側クローズ処理のみへ簡素化（固定表示のため逐次のleft/top計算は不要）
  - 選択ハイライト（`.sheet-bar.is-selected`）は既存のまま維持
  - print.css は無変更で動作（`.slot-overlay` は既存の `display:none!important` ルールで
    印刷除外のまま。D1の `.sheet-editor-drawer` 除外ルールも維持）
  - データ構造・保存/復元/JSON/プレDTM/MIDI経路は無変更。`schemaVersion` は1のまま
  - 拍/裏拍/16分セル入力・`_proto/slot-editor.*` の移植・VexFlow/五線譜/MusicXMLはD2 MVPでは未着手
- `v0.18.0 / UI再編 D3a`: 選択小節タイムグリッド・ドック（ストロークセル編集）
  （push済み: `a3a1618f`）
  - 背景: D2実機確認で、ドックが画面下半分近くを占有するただの大きなフォームになり、
    拍・裏拍・16分の時間軸が見えず、まとめて入力が常時表示で邪魔になり、
    「選択小節を拡大した感覚」がないという課題が判明した。Fable5の設計レビューで
    「選択小節のX線写真」方針（紙面上の選択小節と同じ段順・同じ時間軸を保ったまま、
    横方向へ拡大し各位置を編集できるタイムグリッド・ドックにする）が確定した
    （`docs/DECISIONS.md` ADR-026）。
  - ドック全体を高さ約200〜220px（`max-height: 240px`）へコンパクト化。
    `body.dock-open` の `padding-bottom` も `56vh` → `260px` に変更
  - ヘッダーを1行に集約: 小節番号・セクション名・前へ/次へ・8分/16分セグメント切替・
    （ストロークoverride中のみ）「基本に戻す」・「まとめて入力」ボタン・
    「Alt+←/→で移動」ヒント・閉じる（✕）
  - 拍ルーラー（`.slot-overlay-ruler`）を新設。紙面のタイミンググリッドと同じ
    強弱階層（小節端 ＞ 拍頭 ＞ 8分位置 ＞ 16分位置）の境界線を、ストローク行とも共有
  - コード/ストローク/歌詞/ドレミを同じ時間軸グリッド上に配置。コードは1小節1コードの
    大きな1セル（`setBarChord()` を継続使用）、歌詞・ドレミは時間軸に揃えた1つの入力欄
    （`setBarLyricsText()` / `setBarDoremiText()` を継続使用。tick位置セル分解はD3bで扱う）
  - **ストローク行を本格的にセル編集化**（D3aの主実装）:
    - `song-model.js` に `setBarStrumSlots(project, barNumber, slots)` を新設し、
      パターンID管理（allocate・衝突回避・未参照掃除）を共通化。
      `setBarStrumText()` は「文字列パース → slots生成 → `setBarStrumSlots()`」の
      薄いラッパーへリファクタリング（既存の保存構造・パターンID管理ロジックは無変更）
    - `sheet-renderer.js` の `strumNeedsSixteenth()` を公開APIへ追加（ロジック自体は無変更。
      紙面のストローク段描画とドックのセル表示解像度判定が同じ基準を共有するため）
    - セルクリックで循環: rest → down → up → mute → rest
    - キーボード: `d`/`u`/`x`/Space で直接入力、Delete/Backspaceでrest、
      ArrowLeft/ArrowRightで隣セルへ、Alt+←/→で前後の小節へ移動、
      Enterで確定後に右セルへ移動
    - 連続する「伸ばし継続セル」は直前の実音セルの `durationTicks` を延長して保存する
      （既存のテキスト入力パーサーと同じ「直前を伸ばす」思想を、セル編集でも踏襲）
    - 基本ストローク継承中（`bar.strumOverride` 未設定）はゴースト表示（`.is-inherited`）。
      継承中のセルを1つでも編集すると、継承内容をコピーしたうえで
      その1セルだけ変えた内容を `setBarStrumSlots()` へ渡す＝「最初の編集でoverride化」
    - 「基本に戻す」ボタン（override中のみ表示）は `setBarStrumSlots(project, barNumber, [])`
      を呼ぶだけで `bar.strumOverride` を `null` に戻す（既存の空文字列と同じ挙動を利用）
  - 8分/16分の表示解像度は「データから必要な解像度」と
    「ユーザーが一時的に選んだ解像度」の大きい方を使う。手動選択は `state.dockManualRes`
    （barNumberをキーとするUI一時状態。`_proto/slot-editor.js` の `barResOverride` と同じ
    「小節ごとに憶えておく」思想。保存しない・schema変更なし）で、小節を移動しても
    その小節の手動選択は保持される。データ側が16分を要求する小節は8分表示に戻せない
  - 「まとめて入力」を常設右カラムから、ヘッダーのボタンで開くポップオーバー
    （`.slot-overlay-bulk-popover`。ドック上側にフロート表示し、通常のドック高さ・幅を
    消費しない）へ変更。外クリック・Escapeで閉じる。中身（コード/歌詞/ドレミのまとめて
    入力ロジック）はD2までのものをそのまま再利用。ストロークのまとめて入力は追加していない
  - 選択小節の自動スクロール（`scrollSelectedBarIntoDockView` /
    `maybeAutoScrollToSelection`）を追加。小節クリック・前へ/次へ・Alt+←/→の直後、
    選択小節がドックの裏に隠れる場合だけスクロールする（入力中の再描画毎には行わない）
  - 座標追従用だった `positionSlotOverlay()` は従来どおり「選択小節が紙面から消えたら
    閉じる」安全処理のみ
  - 旧・小節グリッドカード（`#sc-bar-grid`）は今回も現状維持（削除しない・ロジック変更なし）
  - print.cssは `.slot-overlay-bulk` → `.slot-overlay-bulk-popover` のクラス名変更のみ反映
    （`.slot-overlay` 自体の除外により実質は元から印刷除外されていた）
  - データ構造・保存/復元/JSON/プレDTM/MIDI経路は無変更。`schemaVersion` は1のまま
  - 歌詞/ドレミのtick位置セル編集、拍単位コード入力、`_proto` のスロット入力そのものの
    移植、VexFlow/五線譜/MusicXMLはD3aでは未着手

- `v0.19.0 / F1 フローティング小節ルーペ化`（push済み: `0906b8f4`）
  - 背景: D3a実機確認で、機能的には良いものの「黒い編集パネル・画面下固定・紙面と色/罫線/
  フォントが異なる」ため「選択した小節そのものを拡大した表示」に見えないという課題が
  判明した。今回はD3aのタイムグリッド編集機能（拍ルーラー・8分/16分・ストロークセル編集・
  setBarStrumSlots()等）はそのまま維持し、表示方式・デザイン・位置・サイズだけを変更する
  （`docs/DECISIONS.md` ADR-027）。
- 主な内容:
  - **紙面デザイン化**: `.slot-overlay`（ルーペ本体）を黒基調ドックから、A4紙面と同じ
    アイボリー背景（`--paper-bg: #fdfbf5`）・墨色文字（`--paper-ink`）・
    紙面フォントスタック（`--paper-font`）へ変更。外枠は選択小節と同じアンバー2px実線、
    角丸9px。コード/歌詞/ドレミの文字色、ストローク段の濃淡、拍グリッドの線の強弱
    （小節端＞拍頭＞8分＞16分）はすべて紙面の実値と一致させた
  - **ペーパートークン**: `theme.css` の `:root` に `--paper-bg` / `--paper-ink` /
    `--paper-muted` / `--paper-chord` / `--paper-lyrics` / `--paper-doremi*` /
    `--paper-strum*` / `--paper-line-*` / `--paper-border*` / `--paper-font` を追加。
    既存の `.sheet-page` 系ルールもこれらの変数を参照するようリファクタリングしたが、
    値は完全に同一のため画面・印刷の見た目は変化しない（実機確認済み）
  - **フローティング化**: `position: fixed` は維持しつつ `bottom: 0` / `translateX(-50%)` を
    廃止し、`left` / `top` の px指定による自由配置へ変更。初期位置は水平中央・
    垂直はビューポート52%（`viewportHeight * 0.52`）。既存の `body.dock-open`
    `padding-bottom` は撤去（フローティング化により紙面下部の予備余白確保が不要になったため）
  - **タイトルバードラッグ**: `.slot-overlay-head`（既存のヘッダー）自体をドラッグ領域にし、
    Pointer Events（pointerdown/setPointerCapture/pointermove/pointerup）で実装。
    button/input/select/textarea/a・ポップオーバー・リサイズハンドルの上ではドラッグを
    開始しない（`event.target.closest()` で判定）。ドラッグ中は `body.loupe-dragging`
    （user-select:none・cursor:grabbing）を付与し、終了時に位置をappSettingsへ保存する
  - **右下ハンドルでの比例リサイズ**: `.slot-overlay-resize-handle` を新設し、
    同じくPointer Eventsで幅だけを変更する。`--bar-loupe-scale`（=現在幅/960）を
    ルート要素へ`style.setProperty`し、フォントサイズ・行高さ・セルサイズ等を
    `calc(基準px * var(--bar-loupe-scale, 1))` で比例させた。ストロークセルの
    クリック領域・フォントサイズには `max()` で最小フロアを設定し、16分表示でも
    操作不能にならないようにした。高さは内容に応じた自動のまま（単独では変更不可）
  - **クランプ処理**: 初期化（`initLoupeGeometry`）・ドラッグ・リサイズ・ウィンドウ
    リサイズ（`reclampLoupeOnResize`）のすべてで、幅は
    `min(1240, viewportWidth-32)`〜`680`、水平位置は左右最低120pxが画面内に残る範囲、
    垂直位置は`8px`以上かつタイトルバーが画面内に残る範囲へクランプする
  - **appSettings保存**: `cruiseStudio.appSettings` の `barLoupe` キー（`{x, y, width}`）へ
    ドラッグ終了時・リサイズ終了時にのみ保存する（既存の
    `storage.getAppSetting`/`setAppSetting` を再利用）。projectデータ・`schemaVersion` は
    無変更。壊れた値・異常値を読み込んだ場合は初期値へフォールバックする
  - **小節移動時の状態維持**: 前へ/次へ・Alt+←/→・紙面上の別小節クリックでも、
    `state.loupe` はJS状態としてルート要素の再描画（`innerHTML=''`）をまたいで保持され、
    `renderSlotOverlayContent()` の末尾で毎回 `applyLoupeGeometry()` を呼ぶことで
    位置・幅・scaleが飛ばないことを実機確認済み
  - **まとめて入力ポップオーバー**: D3aの方針（常設表示しない・ヘッダーのボタンから開く・
    外クリック/Escapeで閉じる）を維持。ルーペの子要素なのでドラッグ・リサイズに自動で
    追従する。画面外へはみ出す場合は `positionBulkPopover()` がルーペ上側→下側、
    右寄せ→左寄せへ自動反転する（`is-flip-down` / `is-flip-left`）
  - **狭い画面（680px未満）フォールバック**: 幅を `viewportWidth-28px` に強制し、
    リサイズハンドルを非表示にする（`.slot-overlay--narrow`）。PCファーストのため
    大規模なモバイル最適化は行わない
  - **Escapeの優先順位整理**: ポップオーバーが開いていれば閉じる→ルーペ内の入力欄/
    ストロークセルにフォーカスがあればblur（セル編集解除）→それ以外は選択解除して
    ルーペを閉じる、の順に整理（`onDocumentKeydownForLoupe`）。フォーカストラップは
    付けない非モーダルなツールパレットとして扱う（`role="dialog"` `aria-modal="false"`）
  - キーボードによる移動代替として `Alt+Shift+矢印`（16pxずつ）をタイトルバーに実装
  - D3aのタイムグリッド編集機能（拍ルーラー・8分/16分・ストロークセル編集・
    基本ストローク継承/override/基本に戻す・コード/歌詞/ドレミ入力・前へ/次へ・
    Alt+←/→・showStrum・グリッドON/OFF・保存/JSON/プレDTM/MIDI・印刷除外）は
    すべて回帰なしで実機確認済み
  - `song-model.js` の `setBarStrumSlots()` はD3aのまま変更していない
  - `sheet-renderer.js` は変更していない（strumNeedsSixteenthの公開はD3a時点のまま）
  - データ構造・保存/復元/JSON/プレDTM/MIDI経路は無変更。`schemaVersion` は1のまま
  - 歌詞/ドレミのtick位置セル編集・`setBarLyricSlot`/`setBarMelodySlot`・
    旧小節グリッドカードの撤去・bulk自動分解配置・拍単位コード入力はF1では未着手（F2以降）
- `v0.20.0 / F2a 歌詞のtick位置セル編集`（docs/DECISIONS.md ADR-028。push済み: `4e27b8c0`）
  - `setBarLyricSlot()` / `getBarLyricSlots()` / `barNeedsSixteenthResolution()` を
    `song-model.js` に新設。ルーペの歌詞行をストロークと同じ共有時間軸のセル
    （8/16マス、`<input>`）へ置き換え、IME 3層ガード付きで1セル=1イベントの
    単発入力に対応。既存tick:0全文は自動分割せず先頭セルへそのまま表示。
    16分位置の歌詞があれば8分ボタンをdisabled化。紙面の歌詞段はtick配置表示
    （tick:0単一イベントは従来どおり全文表示の後方互換）。旧・小節グリッドカードの
    歌詞inputはreadonly化、まとめて入力の歌詞は一時停止。詳細はADR-028を参照
- `v0.21.0 / G1 小節ルーペの拍グループ構造化＋縦線追加`（docs/DECISIONS.md ADR-029。
  push済み: `08139d18`）
  - `populateBeatGroups()` を新設し、拍ルーラー・ストロークセル・歌詞セル・コード/ドレミ
    背面線のすべてがこの1関数を経由するリファクタ。拍・8分・16分の境界線が全行で
    ピクセル単位で一致する。コード・ドレミは1小節1入力を維持、セルのDOM順序・
    `data-cell-index`・IME・フォーカス復元は既存のフラットindexと完全に同じ。
    解像度ロジックは変更しない機能等価リファクタ。実機確認後の表示修正2点
    （歌詞行の縦線が見えない不具合の修正、拍ルーラー表示「1/2/3/4」→「1拍/2拍/3拍/4拍」）
    を含む。詳細はADR-029を参照
- `v0.21.1 / G2a 歌詞セルのtick識別化＋無変更commit防止`（push済み: `2f5922f2`）
  - `song-model.js`に純粋読み取り関数`getBarLyricSlotRanges()`を新設。歌詞セルの位置管理を
    `data-cell-index`（連番）から`data-slot-tick`/`data-slot-ticks`（tick）中心へ移し、
    `getOrderedLyricCells()`/`findLyricCellByTick()`/`getAdjacentLyricCellTick()`/
    `focusLyricCellByTick()`を新設。表示済みの初期値（`input._initialValue`）と現在値が
    一致する場合は`setBarLyricSlot`・`markDirty`・`renderPreview`を一切呼ばない
    「無変更commit防止」を導入（G2bの集約セル非破壊編集の前提整備）。IME3層ガード・
    Alt+←/→の安全策は無変更。`syncBarGridInput()`のF2a由来の既存不具合（旧グリッド
    歌詞inputのaria-label完全一致セレクタがF2aの接尾辞追記で外れていた）も修正。
    詳細は`docs/DECISIONS.md`の関連記述を参照
- `v0.22.0 / G2b 歌詞行の拍別8分・16分切替`（docs/DECISIONS.md ADR-030。push済み: `c9ab248f`）
  - `state.lyricBeatRes`（`bar`オブジェクトをキーにしたWeakMap。project/localStorage/
    appSettingsへ保存しない一時UI状態）で拍ごとのローカル解像度を保持し、実効解像度は
    「ローカル指定 ＞ 全体設定」の2段階だけで決まる（歌詞データのtickによる自動16分
    昇格はしない）。全体8分ボタンのdisabledロックをストローク由来のみへ限定
    （`isStrumDataForcedSixteenth`）。拍グループ右下に自8/自16/手8/手16の3状態
    切替ボタンを新設し、切替前後で編集中セルの内容を保全する共通安全処理
    （`prepareLyricResolutionChange`/`finishLyricResolutionChange`）をローカル・
    全体ボタン両方へ適用。8分セルに複数の16分イベントが入る場合は
    `getBarLyricSlotRanges()`（G2a）でtick順に連結表示し、無変更commit防止（G2a）を
    そのまま使うことで、実際に編集確定した場合だけ範囲を統合することを実機確認済み。
    実機確認後の修正2点（手動固定ラベルを「手8/手16」へ変更、拍別ボタンのbox-model
    ・実クリック領域を明確に縮小）を含む。詳細はADR-030を参照
- `v0.22.1 / G4 歌詞行の最終セルEnterによる次小節移動`（push済み: `b2772103`）
  - 最終セル判定は`getOrderedLyricCells()`のDOM順（tick昇順）配列の末尾要素との一致で
    行い、セル数・tickをハードコードしないためmixed resolutionでも正しく動作する。
    次小節への移動は既存の`getMoveTarget(1)`/`moveSelectedBar(1,{focusRowId:'lyrics'})`
    （Alt+←/→・前へ/次へと同じ経路）をそのまま再利用し、`state.project.bars`の正規順序
    （セクション境界を含む）で移動する。移動前commitはAlt+←/→と同じ
    `commitLyricCell(...,{skipRender:true})`パターン。曲全体の最終小節では新しい
    小節・セクションを作らず現在セルに留まり、ステータス表示で案内する。新しい
    token/世代番号は追加せず、既存の`isConnected`チェック（blur）・`expectedBarNumber`
    比較（フォーカス復元）だけで古いコールバックの誤書き込みを防止。独立レビュー
    （Fable 5）でも健全と判定され、実機で全拍8分/16分・mixed resolution・セクション
    境界越え・曲全体の最終小節・無変更ガード・二重commit防止・IME・古いcallback
    安全性を確認済み
- `v0.22.2 歌詞解像度切替時のデータ破壊防止`（G2b由来の不具合修正。push済み: `e64cf1ee`）
  - 背景: G2bの拍別/全体解像度切替（`prepareLyricResolutionChange`/
    `finishLyricResolutionChange`）に起因するデータ破壊の可能性がFable 5の調査で
    発見された。歌詞セルへフォーカスがある状態でそのセルのrangeが変わる解像度切替
    （集約・分解）を行うと、`restoreLyricCellFocus()`が切替前セルのsnapshot valueを、
    range不一致の切替後セルへ代入してしまい、その後のblur/Enter/Tab等でG2aの
    無変更commit防止が誤って通過し、`setBarLyricSlot()`経由でprojectのlyrics
    イベントが恒久的に失われる可能性があった
  - 修正: `captureLyricCellFocus(slotTick, input)`の戻り値へ`slotTicks`（range幅）を
    追加し、`restoreLyricCellFocus()`のvalue/selection復元を「切替前後でslotTickと
    slotTicksが完全に一致する、全く同一rangeのセルへ戻す場合」だけに限定。フォーカス先
    の決定（`findLyricCellByTick()`のフォールバック）自体は変更せず、range不一致の
    場合はフォーカスのみ行い、再描画済みDOMのproject由来の値をそのまま残す
  - Fable 5独立レビュー総合判定A。ユーザー実機確認（16分→8分集約・8分→16分分解・
    拍別/全体ボタン双方・未確定編集後の切替・IME/G4/通常ナビゲーションの回帰なし）
    すべて合格

## 5. 旧実装フェーズの詳細履歴

この章の「今回」「次」「未commit」は当時の記録として保持する。現在のGit状態・次工程は1章・6章を優先。
現在作業はShell Contract v2.1の文書化であり、以下の機能開発を再実施しない。

### v0.22.3: 紙面歌詞位置の修正＋拍別固定表示の文言変更

- 予定バージョン: `v0.22.3`
- 実装・検証済み。反映済み履歴: `3f387b18`（当時の検証記録を以下に保持）。
- 背景: ユーザー実機画像とFable 5の数値調査により、紙面上の歌詞が小節後半ほど
  左へずれる構造バグが確認されていた（8分配置で1セル進むごとに約-1.875px、
  4拍裏でカラム中心が約-6.56pxずれる等）。根本原因は、罫線グリッド
  （`.sheet-bar-grid`）が`position:absolute; inset:0;`で`.sheet-bar`のボーダーボックス
  全幅を等分するのに対し、歌詞グリッド（`.sheet-bar-lyrics--timed`）は通常のflex
  子要素として`.sheet-bar`の横padding（8px×2）を除いたコンテンツ幅から、さらに
  `column-gap:1px`を引いた幅を等分しており、母数が異なるため後半へ線形に位置誤差が
  累積していたこと
- 主な内容:
  - **CSSカスタムプロパティの導入**: `.sheet-bar`の横padding値（8px。既存値のまま
    変更なし）を`--sheet-bar-pad-x`として切り出し、`padding: 4px var(--sheet-bar-pad-x) 8px;`
    へ書き換え（縦paddingは個別値のまま維持し、横paddingだけを変数化。既存CSS構造を
    大きく変えずに罫線側と歌詞側で同じ値を共有できるため、この方式を採用した）
  - **`.sheet-bar-lyrics--timed`**: `margin-left`/`margin-right`へ
    `calc(-1 * var(--sheet-bar-pad-x))`を設定してpaddingを打ち消し、`column-gap`を
    1px→0へ。これにより罫線グリッドと歌詞グリッドが同じボーダーボックス全幅を
    同じ母数（gapなし）で等分するようになる
  - **`.sheet-bar-lyrics--timed > span`**: `text-align: center`を追加し、各セルの
    文字を中央揃えに。加えて`min-width: 0`を追加した（追加発見。下記の
    「長文歌詞と罫線整列のトレードオフ」参照）
  - 変更は`theme.css`のみ。`sheet-renderer.js`（DOM構造・`grid-template-columns`
    設定）・保存データ・`schemaVersion`は無変更。`print.css`は`.sheet-bar`へ
    `break-inside`/`page-break-inside`のみを設定しpaddingを上書きしていないため、
    `--sheet-bar-pad-x`の値がそのまま印刷にも継承されることをコード上確認済み
    （`print.css`自体は変更していない）
  - ストローク段（`.sheet-bar-strum`）にも同種の座標差が潜在する可能性をFableが
    指摘しているが、今回は歌詞段のみを対象とし、ストロークの座標・中央揃え・
    罫線・データ処理は一切変更していない（次タスク候補として記録）
  - **長文歌詞と罫線整列のトレードオフ（訂正記録）**: 当初「長文歌詞の重なりは
    `overflow:visible`という既存仕様に由来する」と説明していたが、Fable 5の
    再計測により不正確と判明したため訂正する。正確には、`white-space:nowrap`＋
    `overflow:visible`のgrid item（`.sheet-bar-lyrics--timed > span`）はデフォルトの
    自動最小サイズが「テキスト全文の幅」になるため、修正前は長文歌詞が1セルでも
    あるとCSS Gridの`repeat(N,1fr)`トラック計算自体が広がり、そのセル以降すべてが
    罫線グリッドとズレていた（そのため隣接文字とは重なりにくかった）。`min-width:0`
    でトラックを正しく等分すると、長文はトラックを押し広げなくなり、
    `overflow:visible`のとおり隣へあふれるようになる。つまり長文歌詞の重なりは、
    正しい罫線整列を実現したことで顕在化するトレードオフである。1〜2文字では
    十分な余裕があり通常の1モーラ運用では問題になりにくいことを実測済み
    （4文字ずつの組み合わせで約13px、8〜9文字の組み合わせで約69pxの重なりを確認）。
    4文字以上を1セルへ入れる長文表示の扱い（あふれセルだけフォント縮小／ellipsis／
    クリップ／モーラ分割案内強化）は、今回は実装せず将来の独立タスク
    「長文歌詞セルの表示方針検討」として記録する（下記6章参照）
  - **拍別固定表示の最終仕様**: `buildLyricBeatResButton()`の表示テキストは
    「自8/自16/固8/固16」という中間案を経て、ユーザー最終決定により
    `btn.textContent = String(effectiveRes)`（有効解像度の数字だけ。「8」「16」）へ
    変更した。固定状態（`is-local`）だけ、`.dock-lyrics-beat-res-btn.is-local::before`の
    CSS `mask-image`（南京錠のSVGデータURI、`background-color: currentColor`）で
    細いモノクロ線画アイコンを表示して区別する（Unicode絵文字🔒は不使用。
    OS/ブラウザ間の見た目差・カラー絵文字化を避けるため）。ボタン本体は
    `display:inline-flex; align-items:center; justify-content:center; gap:1px;`で
    アイコンと数字を中央配置。状態間（自動8/自動16/固定8/固定16）でボタン幅が
    変動しないよう、`min-width`ではなく`width:16px`の固定値へ変更した（実装当初は
    `min-width`のままだったため状態により14px〜21pxまで幅が動く問題があり、
    4状態とも同一幅になるよう修正済み）。アイコンサイズは`4.5px`角、`padding:0`。
    `position`/`right`/`bottom`/`z-index`/`border`は無変更。title/aria-labelは
    「全体設定へ自動追従中（現在はX分）。クリックすると、この拍だけY分に固定します」
    「この拍だけX分に固定中。全体設定を変えても追従しません。クリックすると、
    この拍だけY分に固定します/自動追従へ戻します」という文章に変更し、鍵アイコン
    自体は読み上げさせずボタンのaria-labelで意味を伝える。状態サイクル
    （8→固定16→固定8→8、16→固定8→固定16→16）・内部値（WeakMapへ保持する
    8/16の数値）・変数名・className（`is-local`/`is-auto`）・pointerdown処理・
    v0.22.2のsameRange修正は無変更
  - **ユーザー実機確認結果（完了・区切り）**: 紙面歌詞位置修正（罫線マス中央表示）・
    自動状態が8/16の数字のみ・固定状態が鍵アイコン＋8/16・自動/固定切替時に
    ボタンや歌詞セルが動かないこと・鍵アイコンの意味/モノクロ線画という方向性、
    いずれも実機確認OK。v0.22.2データ完全性修正・G4最終セルEnter移動の回帰もなし。
    **鍵アイコンの現在サイズ（4.5px）だけは実機で「小さすぎる」と判断された**。
    今回はサイズだけを追加調整せず、v0.22.3はここで一度区切る。鍵アイコンの
    意味・モノクロ線画という方向性は採用したまま、サイズ・線の見え方・数字との
    間隔・ボタン幅（現在の4.5px/16px等の数値）は最終仕様として固定せず、次の
    「フローター入力UIのデザイントーン調整」フェーズで、フローター全体の配色・
    枠線・背景・影・余白と合わせてまとめて評価・調整する。自動状態は数字のみ・
    固定状態だけ鍵を表示するという仕様自体、および内部ロジック（WeakMap・状態
    サイクル・IME処理等）は次フェーズでも変更しない前提とする
- `v0.22.4 フローター入力UIのデザイントーン調整`（実装・検証履歴。反映済みcommit: `c9904591`）
  - 背景: Codex GPT-5.6 Solが実コード・実DOM・computed style・ブラウザ上の一時CSS
    プレビューを使って設計した改善案を実装した。A案「ニュートラル・ミニマル」を
    基本に、B案のスレート系focus表現を統合。目標は洗練・大人っぽい・クール・
    シンプル・静かで落ち着いた印象、ポップ感の低減。操作性・情報構造・入力機能・
    自動/固定の内部状態は維持
  - **新規CSSトークン**: `.slot-overlay`直下へ`--slot-surface`(#f4f5f4)・
    `--slot-input-surface`(#ffffff。後述の見やすさ改善修正で#fbfcfbから変更)・
    `--slot-text`(#25292b)・`--slot-muted`(#62686b)・
    `--slot-subtle`(#687074)・`--slot-border`(#848c91)・
    `--slot-divider`(rgba(80,88,92,.22))・`--slot-focus`(rgba(74,101,126,.78))・
    `--slot-active`(#d5b06f)・`--slot-fixed`(#d9bf8b)・
    `--slot-fixed-border`(#9a754d)・`--slot-shadow`(0 14px 34px rgba(0,0,0,.36))を
    新設。`:root`・紙面共通トークン（`--primary-color`・`--paper-*`）は無変更
  - **フローター外枠**: 背景#fdfbf5→`--slot-surface`、外枠`2px solid #ff9f1c`（高彩度
    オレンジ）→`1px solid var(--slot-border)`（ニュートラルグレー）、角丸9px→8px、
    影`0 18px 48px rgba(0,0,0,.46)`→`--slot-shadow`（弱め）
  - **内部背景・入力面・区切り**: row-body・ストローク/歌詞グリッド・バルクpopover・
    各種input/selectの背景を`--slot-input-surface`へ、枠線を`--slot-border`/
    `--slot-divider`へ統一。暖色（`rgba(255,248,235,...)`等）の面積を除去
  - **hover / focus / 選択・固定**: 通常hoverはオレンジをやめてニュートラル
    （`--slot-divider`・`var(--slot-focus)`枠線）に統一。focus/focus-visibleは
    スレート系`--slot-focus`へ統一（入力欄・ストローク/歌詞セル・拍別ボタン・
    バルクボタン等）。8分/16分トグルの選択中（`is-active`）だけ低彩度ブロンズ
    `--slot-active`。拍別固定状態（`is-local`）は`--slot-fixed`/
    `--slot-fixed-border`。歌詞セルの`is-multi`下線・`is-composing`背景もオレンジ/
    黄色からニュートラル/スレートへ
  - **文字色・コントラスト**: `--paper-muted`/`--paper-faint`を参照していた補助文字・
    拍ラベル・セクション見出し・ヒント文言等を`--slot-muted`/`--slot-subtle`へ
    差し替え、拍別解像度ボタンの自動状態にかかっていた`opacity:0.65`（視認性低下の
    原因）を廃止。コード・歌詞・ドレミの色分け（`--paper-chord`/`--paper-lyrics`/
    `--paper-doremi`等。紙面と共通の意味付け）は無変更
  - **小節端境界**: `.dock-strum-cell.is-barend`等のオレンジ罫線を、境界の強弱階層
    （小節端＞拍頭＞8分＞16分）は維持したまま最も濃いニュートラルグレーへ
  - **鍵アイコンのサイズ調整**: v0.22.3で「小さすぎる」と判断されたサイズを、
    アイコン4.5px→6.5px・ボタン幅16px→19px・gap1px→1.5px・SVG stroke-width
    2.4→2.8へ拡大。高さ11px・4状態（自動8/自動16/固定8/固定16）間でのボタン外形
    寸法一致は維持。CSS mask方式・`currentColor`・`-webkit-mask`併記・Unicode
    絵文字不使用・自動状態は数字のみ表示・状態サイクル・title/aria-label・
    内部ロジックは無変更
  - **v0.22.4後修正1: フローター内部の見やすさ改善**（実装・検証済み）: ユーザー
    実機評価「内部が以前より見づらくなった」を受け、Fable計測（外側#f4f5f4と
    入力面#fbfcfbのコントラスト比が約1.06:1でほぼ無地、セクションチップ3.33:1、
    バルク注記3.73:1、IME変換中背景1.18:1、has-content歌詞セルのhover変化なし。
    いずれもWCAG輝度式で再計算し実測値と一致を確認済み）を踏まえ、色相は変えず
    明度・不透明度だけを調整した:
    - `--slot-input-surface`を#fbfcfb→#ffffffへ
    - `.slot-overlay-row-body`/`.dock-strum-grid`へ`box-shadow: inset 0 1px 2px
      rgba(37,41,43,.06)`を追加し「一段くぼんでいる」認識を付与
    - `.slot-overlay-row-label`（コード/ストローク/歌詞/ドレミ見出し）:
      `--slot-subtle`→`--slot-muted`
    - `.slot-overlay-section`（セクションチップ）・`.slot-overlay-bulk-lyrics-notice`
      （バルク注記）: 文字色を`--slot-text`へ（コントラスト3.33/3.73→9.67:1へ改善）
    - `.dock-lyrics-cell.is-composing`（IME変換中背景）: alpha 0.12→0.30
    - `.dock-lyrics-cell:hover`: `--slot-divider`と同値で`has-content`セルでは
      変化が見えなかったため`rgba(80,88,92,.34)`へ変更
    - フローター外枠・影・角丸・ブロンズ（active/fixed）・スレートfocus・
      鍵アイコン6.5px・拍別ボタン19px×11pxは無変更
  - **v0.22.4後修正2: フローター上端が固定ヘッダー裏へ入る問題の修正**
    （実装・検証済み）:
    - 根本原因: `clampLoupeY()`の上端下限`LOUPE_TOP_MARGIN`（固定8px）が画面左上
      固定の`#app-nav`（「← 戻る」/「🏠 TOP」。top:18px・高さ約39px・下端約57px）を
      考慮していなかった。加えて`initLoupeGeometry()`はアプリ起動直後・まだTOP画面で
      `#app-nav`が`hidden`化されている時点で1度だけ実行されるため、その時点の
      `getLoupeMinTop()`相当の計算はapp-navの高さを0として行われ、実際に譜面クルーズ
      画面でルーペが開かれる頃には既に無効なY座標が確定していた
    - 修正: `sheet-cruise.js`へ`getLoupeMinTop()`を新設。`#app-nav`の
      `getBoundingClientRect().bottom + 8`（非表示/未検出時は既存の
      `LOUPE_TOP_MARGIN`にフォールバック）を返し、`clampLoupeY()`がこれを上端
      下限として使うよう変更。加えて、実際にDOMへ座標を書き込む
      `applyLoupeGeometry()`の入口で`state.loupe.y = clampLoupeY(state.loupe.y)`を
      都度実行するようにし、ルーペが表示される瞬間（`renderSlotOverlayContent()`
      経由）に毎回、現在の`#app-nav`・viewportに合わせて再クランプされるようにした
      （ドラッグ・リサイズの呼び出し元は既にクランプ済みの値を渡すため冪等）
    - 実機確認: 意図的に不正な保存値（`{x:0,y:8,width:680}`）をappSettingsへ注入し、
      復元時に自動的にy=65（app-nav下端57px+8px）へ補正されること、大きく上方向へ
      ドラッグしてもy=65より上へ行けないこと、ウィンドウ高さ500pxへ縮小・900pxへ
      復元してもタイトルバーとapp-navの重なりが0のままであることを確認済み
    - `appSettings.barLoupe`の`{x,y,width}`形式・localStorage key・`schemaVersion`は
      無変更。ユーザーがドラッグした位置そのものはリセットせず、範囲外のときだけ
      補正する既存の`clampLoupeY`の設計をそのまま踏襲
  - **v0.22.4後修正3: 上部固定UI全体の再調査＋動的max-height**（実装・検証済み）:
    - commit前の再確認で、`#app-nav`だけでは不十分と判明。`.sheet-toolbar`
      （プロジェクト選択・新規・保存・印刷・JSON関連。`position:sticky; top:14px;`。
      DOM上は`<div class="sheet-toolbar">`、IDなし）は画面幅のほぼ全体
      （実測left:72.5〜right:1192.5、960px幅時）を占め、スクロールすると
      `top:14px`で画面上部に固定される。sticky固定化された状態の下端（実測約80px）は
      `#app-nav`の下端（57px）より低いことを確認した
    - 修正: `getLoupeMinTop()`を拡張し、`.sheet-toolbar`が表示されている場合は
      `getComputedStyle(toolbar).top`（CSSの固定位置。ハードコードせず動的取得）＋
      `getBoundingClientRect().height`（sticky固定時の下端相当。スクロール位置に
      よらず一定）を候補へ追加し、`#app-nav`の候補と合わせて最大値（＝最も下にある
      もの）を採用するようにした。スクロール位置を監視するような仕組みは追加せず、
      「将来スクロールされてsticky固定化された場合」を常に安全側として想定する
      単純な方式を採用（過剰な衝突判定を避けるため）。修正後の上端下限は88px
      （sticky-bottom80px+8px）
    - `max-height`の追加修正: 上端下限が8px→88pxへ上がったことで、CSS側の固定
      `max-height: calc(100vh - 16px)`のままでは下端がviewportを超えうると判明。
      `applyLoupeGeometry()`で`window.innerHeight - state.loupe.y -
      LOUPE_BOTTOM_MARGIN(8px)`を`el.style.maxHeight`として都度設定するよう変更
      （新規定数`LOUPE_BOTTOM_MARGIN=8`・`LOUPE_MIN_AVAILABLE_HEIGHT=160`を追加。
      極端に低いviewportでも最低160pxは確保し、ヘッダー・リサイズハンドル等の
      主要操作部にアクセス不能にならないようにした）。CSSの`max-height`定義自体は
      JS無効時のフォールバックとしてそのまま残置
    - 実機確認: 通常幅960px・狭幅680pxいずれでもスクロール後の重なり0、高さ500pxで
      `maxHeight:404px`（500-88-8）・下端がviewport内、高さ150pxの極端なケースでも
      `maxHeight:160px`（フォールバック下限）でヘッダー等にアクセス可能なことを確認。
      `document.elementFromPoint()`でタイトルバー中心点を検査し、フローターの
      z-index（40）が`.sheet-toolbar`（15）より高く、スクロールされていない初期状態
      （scrollY:0、`.sheet-toolbar`が通常フロー位置にある場合）でフローターの表示
      範囲と重なっても、フローター自体（タイトルバー含む）は常に手前に表示され
      隠れないことを確認した。この初期状態での重なりは「`.sheet-toolbar`の一部が
      フローターの背後に一時的に隠れる」という逆方向の現象であり、フローターを
      閉じれば解消する一時的な状態（v0.22.4以前から変わらない既存の重なり方）と
      判断し、今回はスクロール監視等の追加対応はしていない
    - **appSettings.barLoupeの検証時上書きについて**: 今回・前回の検証で意図的な
      ドラッグ・位置注入・リサイズを繰り返したため、`appSettings.barLoupe`が
      本来のユーザー設定ではなく検証操作の結果で上書きされていた
      （直前値`{x:0,y:88,width:680}`）。今回のタスク開始時点のスナップショット
      `{x:0,y:65,width:680}`へ復元した。ただし、この値自体も前回セッションの
      検証操作に由来する可能性が高く、それ以前の「本来のユーザー設定」を示す
      記録は会話ログ上に存在しないため、正確な原状回復はできていない
      （実害はない値だが、事実として記録する）
  - **v0.22.4後修正4: Safari実機でのフローターヘッダー横/縦スクロールバー同時発生の
    修正**（実装・独立レビュー相当の数値検証・ユーザーSafari実機確認すべて完了）:
    - 背景: ユーザーSafari実機から、ストローク編集後（「基本に戻す」ボタンが
      ヘッダーへ追加された状態）に全体8分/16分を切り替えると、フローターのヘッダー
      内へ横・縦スクロールバーが同時に出現し、上部が切れて見える不具合の報告が
      あった。Chromeでは再現しにくく、原因調査のため`sheet-cruise.js`へ一時診断
      コード（`window.__cruiseLoupeDebug`。`start()`/`stop()`/`clear()`/`get()`/`copy()`
      によるイベントタイムライン記録に加え、`measureOverflow()`/`copyOverflow()`で
      フローター本体・`.slot-overlay-head`・主要内部要素の寸法とcomputed overflowを
      詳細採取できるAPI）を一時的に追加した。`prepareLyricResolutionChange`・
      `finishLyricResolutionChange`・`applyLoupeGeometry`・`renderSlotOverlayContent`
      への観測用ログ呼び出し、全体解像度ボタンのpointerdown/mousedown/focus/click
      観測、`document`のfocusin/focusout・`window`/フローター自身のscrollイベント、
      MutationObserverによるDOM再構築の観測を含み、いずれもfocus/preventScroll/
      scroll位置/geometry適用/保存データには一切干渉しない読み取り専用の観測
      コードだった
    - ユーザーにSafari正常状態・不具合状態それぞれの`copyOverflow()`ログを取得して
      もらい比較した結果、原因は2段階と判明した:
      1. `.slot-overlay-head`のCSSに`overflow-x: auto`は指定されていたが
         `overflow-y`は未指定で、CSS仕様上「片方が`auto`でもう片方が`visible`の
         ままだと`visible`側も強制的に`auto`へ変換される」規則により、ヘッダーが
         意図せず縦スクロールも可能な要素になっていた
      2. ストローク編集で`bar.strumOverride`が立つと「基本に戻す」ボタン
         （`.slot-overlay-reset-btn`。幅約82px）がヘッダー操作列へ追加され、
         `.slot-overlay-head`のscrollWidthがclientWidth（680px幅時638px）を
         約31〜34px超過。Safari実機の通常型（実領域を消費する）横スクロールバーが
         ヘッダー高37pxのうち約15〜16pxを占有した結果、内部の操作列（高さ約30px）
         を収めるための実効clientHeightが22pxまで減り、1.で強制された
         `overflow-y:auto`と相まって操作列の上下がクリップされていた
    - 修正は2段階。まず`.slot-overlay-head`へ`overflow-y: hidden;`を追加し、CSS
      仕様上の強制`auto`化を断ち切って縦スクロールを恒久的に禁止（既存の
      `overflow-x: auto`はそのまま維持）。しかしこの修正だけでは横超過そのものが
      残るため、Chrome実測でも「基本に戻す」出現後に実際の横スクロールバー
      （`offsetHeight-clientHeight`が16px）が発生することを確認し、根本原因である
      横幅超過自体を解消する追加修正を行った。`.slot-overlay-head-actions`を
      `flex: 0 0 auto`から`flex: 1 1 auto; min-width: 0;`へ変更してヘッダー内の
      残り幅までは縮小できるようにしたうえで、主要操作ボタン群（`.slot-overlay-nav`・
      `.slot-overlay-res-toggle`・`.slot-overlay-reset-btn`・`.slot-overlay-bulk-toggle`・
      `.slot-overlay-close`）には個別に`flex-shrink: 0`を指定して縮小対象から除外し、
      縮小先を補助文言`.slot-overlay-hint`（「Alt+←/→で移動」）1つだけに集中させた
      （`overflow:hidden; text-overflow:ellipsis; flex-shrink:1; min-width:0;`）
    - Chrome実測: 680px幅・ストローク編集後・全体8→16→8切替後のいずれでも
      `head.scrollWidth === clientWidth`（638=638、超過0px）、
      `offsetHeight-clientHeight`が16px→1px（borderのみ）、
      `clientHeight === scrollHeight === 36px`（縦超過なし）を確認。960px幅では
      補助文言は全文表示のまま変化なし（flex-shrinkは実際に幅不足時のみ作動）。
      680px未満の狭幅（既存の`isNarrowViewport()`によるフローター幅クランプ）では
      横スクロールが発生しうるが、これは今回のスコープ外の既存挙動であり、
      縦クリップが発生しないことは確認済みで悪化させていない
    - ユーザーSafari実機確認: Cmd+R再読み込み後・680px付近表示・ストローク編集後の
      「基本に戻す」表示・全体8分/16分切替のいずれの条件でも、横スクロールバーが
      出ない・ヘッダー上部が切れない・主要ボタンがすべて操作できる・補助文言の
      省略表示は許容、という結果で1〜8すべてOKの実機承認を得た
    - 一時診断コード完全削除: 原因特定・修正効果の確認に使った一時診断コード
      （`LOUPE_DEBUG`ブロック全体、`window.__cruiseLoupeDebug`、
      `measureOverflow()`/`copyOverflow()`、`prepareLyricResolutionChange`・
      `finishLyricResolutionChange`・`applyLoupeGeometry`・`renderSlotOverlayContent`・
      `buildResolutionToggle`・`init()`への観測用呼び出し、document/window/フローター
      自身への観測用listener、MutationObserver）は、ユーザー実機承認後に
      `sheet-cruise.js`から完全に削除済み。`grep -n "LOUPE_DEBUG\|cruiseLoupeDebug\|
      loupeDebug\|measureOverflow\|copyOverflow" sheet-cruise.js`が0件であることを
      確認済み。本来のfocus/render/geometry/解像度切替ロジック・既存の本番イベント
      リスナーは削除前後で一切変更していない（削除後のファイル行数2785行が、
      診断コード追加前の行数と完全一致することで裏付け済み）。本番差分には
      診断APIを残さない
  - 変更ファイルは`theme.css`・`sheet-cruise.js`（`getLoupeMinTop()`新設・拡張・
    `clampLoupeY()`/`applyLoupeGeometry()`の修正、新規定数2つの追加。診断コードは
    最終的に完全削除済み）・`index.html`のバージョン参照・`song-model.js`の
    バージョン行。`theme.css`は上記に加え、後修正4のヘッダーSafari対策
    （`.slot-overlay-head`の`overflow-y:hidden`、`.slot-overlay-head-actions`の
    flex縮小許可、主要ボタン群の`flex-shrink:0`、`.slot-overlay-hint`のellipsis
    縮小）を含む。DOM構造・入力ロジック・保存データ構造・`sheet-renderer.js`・
    `print.css`・`schemaVersion`は一切変更していない

### ユーザー確定要望（未実装・G1範囲外）

以下はユーザーから確定した要望だが、G1のスコープを超えるため今回は実装していない。
設計が固まっていない変換ルールもあるため、未確定部分は断定せず記録する。

- **A. コードのセル入力化**: 将来、コードも見えている各時間セルへ入力できるようにする
  （拍単位コード編集フェーズで実装予定）。現在は`setBarChord()`・1小節1コードのまま維持
- **B. ドレミのセル入力化**: F3でドレミも時間セル単位で入力できるようにする。
  現在は1小節1入力・既存保存経路のまま維持
- **C. 16分→8分の切替許可**: 将来の拍別8分/16分切替では、16分位置に入力があっても
  8分へ切り替え可能にし、切替時は16分位置の内容を対応する8分セルへ移す。
  対象は歌詞・ストローク・ドレミ・コード。
  **歌詞はG2bで実装済み**: 拍別ローカル解像度ボタンで8分に切り替えると、その拍の
  16分位置イベントはtick順に連結して対応する8分セルへ集約表示される
  （`getBarLyricSlotRanges`。マージルールは「tick順の文字列連結」で確定）。
  歌詞由来の全体8分ロックも解除済み（ストローク由来のロックのみ維持）。
  **ストローク・ドレミ・コードは未実装のまま**（G3・F3・拍単位コード編集フェーズで
  個別に設計する。マージ/優先ルールが歌詞と同じ「tick順連結」になるとは限らない）
- **D. ストロークの「〜」候補追加**: 将来のストロークセル編集で、クリック循環の
  切替候補に「〜」を追加する。今回、クリック循環（`STRUM_CELL_CYCLE`）・保存値は
  無変更
- **E. 紙面を常に横4小節固定表示**: 将来、楽譜本体（紙面）は入力状況にかかわらず
  常に横4小節並びへ固定する。独立した紙面レイアウトフェーズとして扱い、
  `sheet-renderer.js` / `print.css` / 紙面レイアウト / 画面の2小節化判定 / 印刷PDFには
  今回一切触れていない
- **F. 最終歌詞セルEnterでの次小節移動**: 小節の最終歌詞セル（4拍目の最後、
  小節全体の最終セル。各拍の最後ではない）でEnterを押した場合、次小節の
  先頭歌詞セルへ移動する。**G4で実装済み**（`commitLyricCellAndMoveToNextBar`。
  正規順序でセクション境界も越える。曲全体の最終小節では移動せず現在のセルに留まる）

### R1の記号ルール

- `↓` = ダウンストローク
- `↑` = アップストローク
- `・` = 休符 / 弾かない
- `〜` = 直前の音を伸ばす / タイ候補
- `x` = ミュートストローク
- `X` / `×` もmuteとして受け付ける方針
- スペース / タブは区切りとして無視
- 8記号以内は8分、9記号以上は16分
- `〜` は `durationTicks` 延長
- 正しい休符記号 / タイ曲線はまだ描画しない

### R1の設計上の重要点

- `strumPatterns` / `basicStrumPatternId` / `bar.strumOverride` は既にスキーマに存在する。
- R1では `schemaVersion` を上げない。
- 基本ストロークは文字列ではなく `slots` が正。
- 空欄の場合、既定8ビートを勝手に紙面へ印字しない。
- プレDTMは既存の `basicStrumPatternId` 経路で自然に恩恵を受ける。

## 6. 次にやること

**次の正式工程はMetronome M1。Structure Editing Session v1（0.24.0）は実装・回帰完了。**
refactor / Metadata / Theme / Shell / Focus基盤はmain反映済み。本工程の限定commit / push後、
次工程開始時にGit baselineを再測定する。M1はmemory-only。domain Undo / Transport / Sync等は未着手。
正式な全工程順は[ROADMAP](../ROADMAP.md)、詳細条件は[Shell Contract v2.1](../docs/SHELL_CONTRACT.md)を参照する。
Themeの詳細は[THEME_CONTRACT](../docs/THEME_CONTRACT.md)。Port ESMの隣接配信契約は維持し、
MetadataのShell接続前に実HTTP構成で検証する。新ShellはStudio semantic tokenを利用する。

### Shell v2.1文書化時点の次工程計画（以下は履歴・現在の作業指示ではない）

**次工程はStudio-only無変化refactor。F3等へ直行しない。** 正式な全工程順は
[ROADMAP](../ROADMAP.md)、詳細条件は[Shell Contract v2.1](../docs/SHELL_CONTRACT.md)を参照する。

次工程開始時にGit baselineと既存の見た目・操作・保存形式を固定し、対象をStudio内に限定する。
予定はscroll root abstraction、Loupe safe-area provider、Structure専用toolbar参照、ResizeObserver、
activate / load分離、Esc gate、Pre-DTM working snapshot入力境界の準備。

refactor単独では既存hostの見た目・データ・保存形式・挙動を変えない。workspace切替のdraft保持や
Pre-DTM working snapshot利用を有効にする工程は後のEditing Session接続と区別する。
変更後はSafari、IME、Loupeドラッグ / リサイズ / 狭幅 / 高さ不足、歌詞解像度切替、G4、
保存 / JSON / print / MIDI / 現行Pre-DTM入力の回帰を確認する。

その後はMetadata / Version reader → Shell → Focus / Keyboard / Modal manager → Structure Editing Session →
Metronome M1 → M2 → M3 → Chord → Practice → Tuner → Structure機能開発再開 → 五線譜 / TAB / MusicXML → DTM。

Structure再開時の残候補は、長文歌詞セル、ストローク座標差、G3、F2b、F3、F4、拍単位コード編集、
横4小節固定表示。既存の個別要望・検証履歴・9章の既知課題を保持し、着手時に依存順を確認する。
v0.22.4の旧実機確認記録に未確認項目が残っている場合はbaseline / 回帰確認で扱い、今回完了したと捏造しない。

上のShell v2.1文書化計画は当時の履歴。現在の実装・限定commit / 通常push範囲は1章を参照し、
次工程のコード変更は別の作業指示で開始する。

## 7. 重要な設計方針

- PC統合の正式sourceは `docs/SHELL_CONTRACT.md`。旧ADR / 旧ランチャー方針と異なる箇所は同契約を優先する。
- 編集・再生・UI・認可・Syncのownerを分離し、Port datasetを複製しない。
- mobile hostの既存lifecycleを維持し、mobile CSSをStudioへ丸ごと読まない。
- A4紙面DOMは表示/印刷用としてきれいに保つ。
- 直接編集感は、紙面上に重ねる編集レイヤーで実現する。
- 印刷用DOMそのものを `input` / `contenteditable` にしない。
- 編集レイヤーは印刷に出さない。
- グリッドONならPDFにも出る。
- グリッドOFFならPDFに出ない。
- `schemaVersion` は安易に上げない。
- 表示専用フィールドは補完で読む。
- 音や出力に影響するスキーマ変更は `schemaVersion` 検討が必要。
- `strumPatterns` 既存構造を活かす。
- 小節別ストローク上書きは `bar.strumOverride` で行う。
- 休符/タイの本格記譜はVexFlow等のフェーズで行う。
- プレDTMへの影響は慎重に分離する。
- 既存アプリは絶対に壊さない。

## 8. 触ってはいけないもの

- 現在のMinor修正対象はversion-reader.mjs、feature-metadata.test.mjs、本ファイル。必要な限定対応説明だけFEATURE_METADATA.mdへ追記可能。
- `apps/cruise-port`（今回の共有設計文書化はPortコード変更を許可しない）
- Cruise Sync / Account / Worker / secrets / localStorage / IndexedDB / 保存データ
- 他セッションの未commit差分・untracked
- 旧repo / migration bundle（読み取りも禁止）
- `apps/fretboard_cruise`
- `apps/pitch-cruise`
- `apps/rhythm-cruise`
- `apps/chord-cruise`
- `apps/shared`
- `service-worker`
- `manifest`
- PRO認証まわり
- `apps/rhythm-cruise/rhythm-cruise-icon-proposal.png`
- `apps/rhythm-cruise/rhythm-cruise-icon-proposal.svg`

## 9. 既知課題

- v0.22.3実機検証で発見（未修正・次タスク候補）: ルーペ幅が狭小フォールバック
  （680px未満のビューポートで強制される約280px幅）の状態で16分割の歌詞セルを
  表示すると、`.dock-lyrics-cell`の意図的な`min-width: max(18px, calc(24px *
  var(--bar-loupe-scale, 1)))`設計（最小タッチターゲット確保のため）により、
  1拍4セル×18px=72pxが要求され、拍グループ（`.dock-lyrics-beat-cells`。
  `min-width:0`は設定済みだが子セル自体のmin-widthが優先される）の幅を超えて
  overflowする。通常のルーペ幅（980px前後）では問題なく、拍別解像度ボタンとの
  重なりも最終セルのみ約9.4%に収まることを確認済み。`buildLyricsGridRow()`・
  `.dock-lyrics-cell`は複数回のUI調整作業で変更禁止指定されてきたため未修正のまま。
- [F2aで解決済み] 旧・小節グリッドカード（`#sc-bar-grid`）の歌詞inputが
  `setBarLyricsText()` 経由でtick位置情報を `tick:0` の単一イベントへ潰してしまう問題は、
  F2aで歌詞inputを `readOnly` 化し書き込み経路を断つことで解決した。ドレミ側は
  まだ同じ経路（`setBarDoremiText()`）で書き込み可能なままのため、F3でドレミを
  セル編集化する際は同様の対応（readonly化）が必要になる見込み。
- *** F3で扱う課題: 旧・小節グリッドカードのドレミinputは、まだ `setBarDoremiText()`
  経由で **小節単位の文字列** として書き込む。F3でドレミをtick位置セル編集化したら、
  この旧UIから編集すると `bar.melody` のtick位置情報を破壊しうるため、F2aの歌詞input
  と同様にreadonly化する対応を検討すること。
- R1の実PDF確認は最終目視が必要。
- 8分ストローク時にグリッドが16分になることがある可能性。
- 正しい休符マーク・タイ曲線は未実装。
- 休符記号の本格描画は未実装。
- タイ曲線の本格描画は未実装。
- VexFlowによる記譜表示は未実装。
- 本格的なコード+リズム譜の記譜表示は未実装。
- S0プロトタイプは本番に未統合。
- メロディ五線譜は未実装。
- コード+リズム譜の五線譜化は未実装。
- MusicXMLは未実装。

## 10. 次のAIへの指示

- このファイルを読んだ後、`ai-handoff/AI_WORKFLOW.md` を読む。
- `docs/SHELL_CONTRACT.md` と `ROADMAP.md` を読み、現在の着手順を確認する。
- AI_WORKFLOW / 旧ADRの旧ランチャー・version等の前提は、今回のユーザー指示と新契約に照らして扱う。
- `git status -sb` を確認する。
- HEAD / origin/main / log / staged差分を実測する。記録済みhashを現在値として流用しない。
- 現在の未commit差分を確認する。
- 未commit差分がある場合は、それを勝手に変更せず、まず報告する。
- ユーザーに確認せずcommit / pushしない。
- 触ってよい範囲を明示してから作業する。
- 現在地はFocus / Keyboard / Modal v1（0.23.1）の実装・回帰完了。次はStructure Editing Session。
  Shell Contract §31とTheme契約を読み、F3 / Port共有書込 / 正式Pro / Sync接続へ飛ばさない。


## Schema 2 Foundation M1 candidate

Studio 0.39.0 / schema 2。新しい保存能力を追加するminor更新（schema番号とは独立）。実装・検証中。M1完了・commit・push・main統合・公開は未実施。[正式契約]( SCHEMA2_FOUNDATION.md )。


## Schema 2 M1 recovery 停止（2026-10-15）

0.39.0候補の元Browser 19 FAILは解消。今回Node 1044／Browser 457 PASS（FAIL/skip 0）。ただし性能試験で64小節の明示Save後にcommon-music-model convertV2のJSON複製が `RangeError: Invalid string length`、同期command p95 30.3ms／全小節staff更新507.9msを確認したためM1未受入。既存差分を保持し、stage/commit/pushなし。HEADはdbd9a46、専用topicはremote未作成。

再開前に [SCHEMA2_FOUNDATION停止記録](../docs/SCHEMA2_FOUNDATION.md) のP1、14 FAIL分類、性能値、正式35項目分類を読む。正式Browser PASSと性能ケースの例外を混同しない。保存後64小節の再描画と変換の参照共有を修復するまでM2＋M3へ進めない。


## Schema 2 M1 Data Amplification Recovery 停止（2026-10-16）

0.39.0/schema 2候補。保存後RangeErrorとraw反復展開は解消。Node1051 PASS（FAIL/skip0）、Browser460 PASS／2 FAIL／skip0。64小節command p95 11.4ms、Staff104.4ms（保存・再読込後）。128小節command p95 23.2msとCMM変換baseline比約1.9倍が残り、M1未受入。fresh remote mainもdbd9a46から10296dbbへ進行したため、個別停止条件に従い差分保持・staged空・commit/pushなし。既存main root/Studio worktree/原本9hashは不変。M2/M3未着手。[最新停止記録と35項目](../docs/SCHEMA2_FOUNDATION.md)を参照。
