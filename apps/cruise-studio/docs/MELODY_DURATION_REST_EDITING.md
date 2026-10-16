# Melody Duration & Rest Editing M2/M3 — Studio 0.40.2候補

実装基準は M1 `62c7e5f789ff175bd70724c93f9ecb8aa739cccc`、Project schemaVersion=2。正式設計は [Astra契約](MELODY_DURATION_REST_CONTRACT.md)、M1の保存・serialization・受入は [Schema 2](SCHEMA2_FOUNDATION.md)。本工程は既存topic内の機能追加であり、main統合・本番公開は別工程。

## Studio 0.40.2 — Legacy Save Boundary & Wide UI Remediation（2026-10-16）

開始HEAD/remote topicは3344c2b75f35d16f7ff6b43d86f3845cafefc930、remote mainは7cf2f02a65e05198cceead49d0d31df14ccfd8ae。既存topicを継続し、schemaVersion=2を維持するpatch。main統合・本番公開は別工程。

R6: 旧storage.saveProjectはschema 1互換専用とし、canonical schema 2はRepository／Editing Sessionへ案内して拒否する。JSON descriptor/prototype検査を先行し、getter/toJSONを実行せず、schema 2/future/unknownをschema 1へ変換しない。拒否時は入力/raw/index不変・write0・成功結果なし。製品consumerは既にRepository経由であり、残っていたkeyboard-modal/metronome Browser fixtureの2呼出しを正式Repositoryへ移した。上限前/一致/超過、timestamp/appVersion増加、schema 1互換、不正値・hook、Repository/Session roundtripを追加した。0.40.1の最終candidate容量検証・F1/F2・原文/MIDI/tick/ID・quota/result-unknown・Undo容量・stale拒否は継続する。

R7: 広幅では実測Inspector左端から余白を引いた範囲をLoupe safe areaの右端とする。利用可能な紙面幅に応じて位置/幅をclampし、常に小さな固定幅にしない。一時幅補正は保存設定を書き換えず、Inspector閉鎖時に元の要求幅へ戻す。明示resizeは新しい要求幅とする。入力DOMを再生成しない。

R8: 8条件の実測ではcomputed top約121pxにもかかわらず、親grid下端の制約で実top約56pxへ押し上げられ、toolbarと約57px重なった。測定対象の取り違えではない。toolbar実測height＋computed sticky top＋8pxを維持し、可用高さから最大Main scroll時の親末尾位置・margin-bottom・8pxを除く。親末尾位置はpane.bottomから残りscroll距離を引くことで求め、独自scroll listenerや入力DOM再生成を増やさない。main/toolbar ResizeObserverと既存layout通知へ接続する。6pxはUX文書の固定数値規定ではなく、safe-area回避契約に対する8px実装余白の受入下限として維持した。390/768は既存下部パネルを維持する。

修正後の1440/1920px×4テーマは全8条件PASS。initial/edit/scroll/focus/theme/resize/restore各phaseで最小余白8px、見出しと可視ボタンのhit test、入力DOM保持、閉鎖時のLoupe幅復元を確認した。代表値はtoolbar下端112.80px、Inspector上端120.80px・高さ778px。幅変更後も下端146.80pxに対し上端154.80pxを保つ。既知失敗の再現診断をrequired回帰のPASS件数へ含めない。元のclean baseline/baseと停止時37ファイルのhash一致を確認して再開し、dirty状態を新baselineへ置換していない。

Node全suite 1176 PASS、正式Browser23ファイル 558 PASS、FAIL/skip/cancelled0。旧APIのBrowser反例、390/768/1440/1920×8/64/128×4テーマの48条件を今回再実行。通常click、note/rest/gap、Loupe/Inspector同時表示geometry、実ボタンhit test、toolbar回避、音価/onset・Undo/Redo、focus/caret/CDP compositionを確認。A/B・workspace往復・保存/競合は正式既存suiteで継続。force clickなし。保存拒否と編集No-write、Console/404/禁止通信0。正式443Hz WAV・独立loopback・使い捨てChromeを使用し、既存8765/8766と利用者profileに触れない。

### 性能（各20sample、warmup3）

| 小節 | 同期編集p95 保存前/後 ms | 五線更新p95 保存前/後 ms |
|---:|---:|---:|
| 8 | 2.2/2.3 | 15.2/15.8 |
| 32 | 7/6.2 | 45.6/46.4 |
| 64 | 13.7/13.2 | 102.7/100.7 |
| 128 | 25.9/24.1 | 275.4/275.2 |

64小節の16ms/500ms gate PASS。128小節は追加耐久であり64と同じ同期時間目標を課さない。0.38.1との同一fixture比較を保持する。CMM相対性能の改善は今回の必須実装範囲外。全sampleと環境はperformance.json参照。

実OS日本語IME/Safari/実プリンターは未検証。CDP compositionをOS実IME確認と呼ばない。Port1.23.1 metadata/cache F3は次の最新main統合工程で再測定し、今回はPort/Shared/認可/Syncへ変更を広げない。shared write OFF。commit/postcommit/topic pushの実SHAと成否はrepo外final-receipt.jsonを正とし、実施前の成功を記載しない。

証拠: `/Users/murakamimasakuni/.codex/visualizations/2026/10/10/01a1244d-3cb2-7043-bd29-981e371b1ae2/studio-0402-r8-recovery-20261016`（start/plan/task-intent、Node/Browser logs、shared/narrow PNG・geometry/ledger、performance全sample/gate、Git gates、保全hash/final receipt）。以下の0.40.1以前は履歴として保持する。

## Studio 0.40.1 — Render Readiness Recovery & Final Acceptance（2026-10-16）

開始HEAD/remote topicは1382f684818d6dd7f89886274ef76062c7ec1ec4、remote mainは7cf2f02a65e05198cceead49d0d31df14ccfd8ae。前回停止時の31 tracked＋新規試験3ファイルは全hash一致で保護し、既存worktree/topicを継続した。Project schemaVersion=2。

保存容量P1は、元入力のdescriptor/validator検査→clone→updatedAt/appVersion適用→正式validatorによる最終candidate検証→exact raw revision再確認→書込み、の順に修正。上限8MiBはJSON文字数×2で測る。metadataの増加で超過する場合はProject/indexへのwrite0、draft/base/revision/dirty/履歴不変。上限直前/ちょうど、timestamp/appVersion増加、migration後保存、Session、実Saveボタンと再読込をNode17件＋Browser7条件で確認した。F1/F2・quota/result-unknown・Undo容量を緩めない。

768px timeoutは製品rendererの未復帰ではなく、試験が幅を変えて同じproject IDへ新rawを再投入したことによるexternal-revision拒否だった。独立contextの768px×4テーマ、390/769/1024/1279/1280/1440は正常。診断ではfixture/Session/source/project/document・workspace世代/epoch/RAF/resize/theme/focus/CMM/isCurrent/projection/SVG/readyを時系列記録し、再利用反例では古い描画を採用しないことを確認。製品ready条件や30秒timeoutは緩めず、QAを条件別context・固有IDにし、project/session/snapshot/document/workspace identityをreadyで完全照合する。renderer製品コードは変更していない。

狭幅Inspectorはmainの下端へ高さ最大360px/表示領域40%で固定し、scroll余白を予約する。選択音符をtoolbarとInspectorの間へ移動し、Loupeのsafe areaからInspectorを除く。1440/1920は既存側面配置。同一対象のinput DOMを保持し、閉鎖/resize/disposeのgeometry処理も音楽データを変更しない。

今回のNode全suite 1156 PASS、正式15＋Structure conversion/staff/schema2/M2-M3＋追加2のBrowser21ファイル 548 PASS。FAIL/skip/cancelled0。390/768/1440/1920×8/64/128×4テーマの48条件で通常click、note/rest/gap、音価/onset、部分/小節確認、Undo/Redo、toolbar回避、focus、CDP composition/caret、scroll、PNG/geometryを確認。force clickなし。保存拒否・編集はNo-write、明示SaveはProject/index各1件。既存M2/Schema2のreloadを越えるledgerを維持し、新規QAもledgerをresetせずfixture境界以降を検査する。Console/404/禁止通信0。正式443Hz WAV、独立loopbackと使い捨てChromeだけを使用。

### 今回の性能

Chrome 155.0.8059.82 / Node v24.14.0 / darwin arm64、1440×1000、warmup3＋各20sample、同じfixtureの0.38.1 baseline。回帰と測定は同時実行しない。64小節16ms/500ms gate PASS、128は追加耐久。同期編集はcommand処理時間であり操作全体の時間ではない。

| 小節 | 同期編集 p95 保存前/後 ms | 五線 p95 保存前/後 ms |
|---:|---:|---:|
| 8 | 1.9/2.0 | 16.2/15.6 |
| 32 | 6.4/5.9 | 45.3/45.3 |
| 64 | 12.8/12.8 | 105.1/104.6 |
| 128 | 23.6/24.0 | 270.8/275.1 |

上限付近のSession保存はwarmup3＋20sampleで成功 p95 61.8ms、超過拒否 p95 15.3ms。成功後はreader一致、拒否時はdirty/base維持。補助計測の初回は、元の曲名に戻して既にdirty=falseのケースへdirty=trueを要求して失敗した。初回記録をcapacity-first-*に保全し、直前/直後のdraft/base/revision/dirty/history/raw/index全体の一致へ訂正して再測定した。拒否前のdirty=true/falseの双方がそのまま維持される。通常64小節の同期編集16msを8MiB保存へ転用しない。CMMのbaseline概ね1.5倍という比較目安は別評価であり、絶対時間gate PASSだけで全面達成とはしない。原文のDTO/履歴混入・RangeError・異常増幅の既存反例も再実行した。

### 受入範囲と残件

正式35項目は既存の対応表を継続し、11/21/31へ最終candidate容量反例、1–10/19/25/27/28/33/34へ新狭幅QAを追加。16はmetadata/移行の実音保持までの部分対応であり、明示key/capo移調UIは未実装。19の実OS日本語IME/Safari、23の実プリンター、29の実容量超過UI案内、32の専用原文復元UIは未検証/後続として区別する。35項目全体を製品完成PASSとは呼ばない。

F3はmainのPort1.23.1に対する別統合工程。topicのPort正式source/import cache1.23.0を維持し、他ownerへ変更を広げない。main統合/Pages本番公開なし。Git safetyの元clean baseline/baseと個別manifestを維持する。development/commit/postcommit、commit後Node、fresh topic push gateの実結果・commit SHA・通常push結果はrepo外final-receipt.jsonを正とし、実行前の成功を記載しない。

証拠: `/Users/murakamimasakuni/.codex/visualizations/2026/10/14/01a13a33-b638-7f83-93d9-945d43b59e03/studio-0401-render-readiness-20261016`（resume-start/start-files/start.patch、ready-diagnosis、Node/Browser logs、narrow-geometry/PNG、budget-ui、ledger、performance全sample/gate、capacity-performance、Git gates/final receipt）。以下に現行仕様・35項目対応表と、旧版の計測記録を分けて示す。

## 所有と選択

正本はStudioProject、編集中は既存Editing Session、履歴も同Session一つ。五線はCMMからの派生表示。InspectorはUI選択・入力bufferだけを所有し、保存領域や第二Undoを作らない。

Structureのメロディ譜で音符・明示休符・暗黙gapをクリックする。同一eventのタイ断片は同じbar/event IDへ対応する。矢印キーで隣の記譜対象へ、EnterでInspectorへ、Escapeで閉じて五線へ戻る。DOMの座標やdata属性から保存tick/権限を生成しない。

rendererは公開を許可されたconversion結果のsource stampと元eventをprivate WeakMapに保持する。SVGをキャッシュ再利用しても、正式に採用した新しい結果に対してstampを更新する。未確定入力中の古い表示を新しいdraftとして扱わない。選択のproject/session/document/workspace generationとsnapshotを照合し、command自身も発行済envelope・base/raw revisionを再照合する。A/B、workspace変更、外部更新、消えた対象は破棄または再選択が必要。独自の遅延commandは登録しない。

## Inspectorと非リップル編集

広幅では紙面の隣、狭幅ではmain下端に高さ制限したパネルを配置する。scroll余白を予約し、選択音符をtoolbarとパネルの間に保つ。選択小節・拍位置・実音/休符・開始tick・音価・属性別確認を表示する。同じ対象の操作中はInspector入力DOMを保持する。note/rest種別の変更時だけ当該Inspectorを再構築し、既存ルーペDOMを触らない。

| UI | M1正式command |
|---|---|
| 音価 | melody.setDuration |
| 指定長の休符挿入 | melody.insertRest |
| 音符/休符 | melody.setKind |
| 削除してgapへ | melody.delete |
| 開始位置 | melody.move |
| onset/durationの部分確認 | melody.confirmEventTiming |
| 空き全体を休符として確認 | melody.confirmGap |
| 空きを休符にして小節確認 | melody.confirmBarTiming |

4/4・480 PPQ。音価は全/2分/4分/8分/16分、単付点2分/4分/8分/16分。小節越境、重複、不正値、未対応値は拒否し、近傍へ「変更は適用していません」と表示する。短縮はgapを残し、延長や移動で後続音を動かさない。切詰め・丸めをしない。

note→restはpitchを除く。rest→noteは音名・alter・octaveを明示指定する。隠れた旧pitchを復帰しない。gapの選択/描画は保存restを生成せず、明示commandだけが生成する。部分確認は他属性/gapを確認せず、gapなし・全eventのonset/duration確認時だけ小節を確認済みにする。

## Undo・保存・ドレミ・IME

1commandは1Undo。失敗時draft/dirty/history/base/raw不変、容量不足は公開前に拒否。native入力Undoとdomain Undoを区別する。保存は既存上部の明示Save。Save後Undoでdirty、保存地点へのRedoでcleanとなり、履歴を別に保存しない。

schema 1のmemory-only migration、raw原文、stable ID、F1同音数pitch編集時のonset/duration/provenance/rest/gap保持、F2正規化前のgetter/toJSON/prototype検査を変更しない。保存競合、quota、result-unknownの既存拒否を維持する。外部updateや競合をInspectorから解除しない。

IME中/確定直後、modal、保存中、inputPending、外部更新待ち/競合時はcommandを拒否する。ルーペのcomposition buffer、caret/focusを保持する。CDP合成compositionとOS日本語IMEは別の受入対象。OS実IME/Safari/実プリンターを自動試験だけで完了としない。

## 表記・印刷・非対象

既存VexFlowの音高/調号/臨時記号/付点/タイ/連桁を使用し、断片から元イベントへ接続する。未確認は文字で表示する。未対応音価は近似せず診断する。五線は印刷されません。コード譜を印刷します。印刷mediaではInspectorと五線を非表示にし、従来コード譜fallbackを維持する。

三連符、跨小節タイ、高度な再配置/移調、TAB/伴奏、五線の正式印刷、外部素材採用UIは後続。Port 1.23.1のF3 metadata/cache整合は最新main統合前の別工程であり、このtopicのPort source/import queryを更新しない。Pro/Account/Authority/Sync、shared write OFF、他ownerの製品保存を変更しない。

## Pointer / renderer回復

SVG glyphの塗られていない中央にはpointerが届かないため、描画fragmentごとに透明なhit矩形を置く。左右を隣接glyph中心間へ制限し、重複しない。五線・連桁・tieは装飾としてpointerを受けず、通常clickと実符頭clickで同じeventへ到達する。force clickで代用しない。

focus復元が同期的に新しい描画を要求し得る。退役epochのcallbackは現在jobのframeをclear/invalidateしない。schedule・draw直後・最終採用で所有と正式sourceのcurrentを検査する。120/240/480/720、再入中の新720編集、Undo/Redo、tie fragmentで収束を確認した。

## キーボードの正式対象順

矢印は画面の記譜fragment順に、音符・明示rest・暗黙gapを含めて移動する。小節境界も越える。複数fragmentが同じeventに属すれば同じ正本対象であり、音価を再構成しない。gapには音符用onset/pitch欄を表示せず、gapに必要な操作だけを表示する。

既存fixtureの最初の音符（240/180）からArrowRightでは420〜960のgapへ移るのが正常。native Undo試験はそのgapから明示的に音符へ選び直して行う。note→note/rest/gap、gap/rest→note、左右、小節境界、Enter/Escape、stable ID・document identity・focus・保存不変を実Browserで確認した。

## No-writeの測定境界

Storage/IDBの全履歴をrunner側ledgerへ追記し、reloadでもclear/resetしない。各entryへdocumentId・sequence・キー・値・旧値・時刻・stackを保持する。各操作フェーズのstart/end/passを記録し、許可writeでも値/件数まで検査する。子フェーズを持つ親は全writeが検証済み子へ所属することも要求する。

| 操作 | 正式に許可するwrite |
|---|---|
| 読取・描画、Inspector選択/開閉、未保存の音価/休符編集、Undo/Redo | 0 |
| 明示A→B→A | currentProjectIdへ値B/Aの2件だけ |
| themeのmemory-only apply | 0 |
| 明示theme保存 | appSettingsへ1件。colorThemeだけ変更しbarLoupe等を保持 |
| viewport縮小の既存Loupe幅補正 | PC_SHELL_LAYOUT契約のbarLoupe設定保存だけ。1 resize最大1件、stack=reclampLoupeOnResize、有限x/y/width・他field保持を検証 |
| 明示Save | 当該Projectとindexへ各1件。正確なbarsとindexの対象重複なしを検証 |
| 同じ曲のreload | 0。既存ledgerを保持し、storageのrawから正確なbarsを再読込 |

前回のappSettings 1件はtheme apply自体ではなく、最初の390pxへのviewport縮小が既存ルーペ幅を再clampした結果。storage.setAppSetting→saveLoupeSettings→reclampLoupeOnResizeを実測した。Project/index/IDBのwriteと混同せず、監査対象から除外しない。今回fixture後9件はA/B2、Loupe1、明示theme4、明示Save2。その他の全フェーズはwrite0。

## 0.40.0時点の自動受入件数（履歴）

Node全suite **1139 PASS**。影響Browser3ファイル **75 PASS**。正規15＋Structure conversion＋staff＋schema2＋M2の19ファイル **491 PASS**。すべてFAIL/skip/cancelled0。Console/404/禁止通信0。正式443Hz WAV（44100Hz mono PCM16、8秒）・独立loopback・使い捨てChrome。既存8765/8766は不触。

### 35項目と現行0.40.1の検証対応

このPASSは表に明記した自動受入範囲に限る。OS日本語IME・Safari・実プリンター・実曲での耐久/可読性等は未検証であり、同じPASSへ含めない。

| # | 項目 | 今回の判定と範囲 | 根拠 |
|---|---|---|---|
| 1 | 音価変更 | PASS（自動受入範囲）: Inspectorの120/240/480/720、pitch/onset/ID保持 | M2 Browser / controller Node |
| 2 | rest挿入 | PASS（自動受入範囲）: gap内へ明示rest、周囲不変 | M2 Browser |
| 3 | rest変更 | PASS（自動受入範囲）: 長さ変更・非リップル | M2 Browser / schema2 Node |
| 4 | note/rest | PASS（自動受入範囲）: pitch削除、明示pitch指定でnoteへ | M2 Browser / controller Node |
| 5 | overlap | PASS（自動受入範囲）: 変更不採用、draft/dirty/history/base/raw保持 | M2 Browser / schema2 Node |
| 6 | 小節越境 | PASS（自動受入範囲）: 切詰めず拒否、境界への正確な延長成功 | M2 Browser / Node |
| 7 | 短縮 | PASS（自動受入範囲）: 次音不動、gap生成、1Undo | M2 Browser |
| 8 | 延長 | PASS（自動受入範囲）: 接触成功・重複拒否・bar-end一致 | M2 Browser / Node |
| 9 | gap保持 | PASS（自動受入範囲）: 選択/描画でrest保存なし、明示確定だけが挿入 | M2 Browser / Node |
| 10 | Undo/Redo | PASS（自動受入範囲）: 同Session履歴、1操作1Undo、拒否時不変 | M2 Browser / controller Node |
| 11 | Save/Load | PASS（自動受入範囲）: 明示Saveの2write、再読込で正確なID/時刻/種類保持。最終metadata容量境界も検証 | M2 Browser / schema2 Browser / project-save-budget Node/Browser |
| 12 | schema1 migration | PASS（自動受入範囲）: memory-only移行、MIDI/onset/duration保持 | schema2 Browser / Node |
| 13 | idempotency | PASS（自動受入範囲）: 同raw同ID・v2再読込で再移行なし | schema2 Node |
| 14 | stable ID | PASS（自動受入範囲）: 編集・fragment・Undo/Redo・Save/Load | M2 Browser / schema2 Node |
| 15 | pitch保持 | PASS（自動受入範囲）: 音価編集で音高不変、異名同音/上下octave | M2 Browser / schema2 Node |
| 16 | key/capo | 部分対応: 移行/時間編集で実音保持。契約例の実音保持/明示移調UIは未実装 | schema2 Node / staff Browser |
| 17 | A/B分離 | PASS（自動受入範囲）: 履歴/draft/選択、旧handle拒否 | M2 Browser / controller Node |
| 18 | stale | PASS（自動受入範囲）: 旧callback、workspace、reentrant描画、最新sourceのみ採用 | M2 Browser / Node |
| 19 | IME | PASS（自動受入範囲）: CDP/合成composition、focus/caret・native/domain Undo | M2/staff/schema2 Browser。実OS IMEは未検証 |
| 20 | No-write | PASS（自動受入範囲）: 全ledger保持、各フェーズのキー/値/件数/stack検証 | M2 Browser / schema2 Browser |
| 21 | invalid input | PASS（自動受入範囲）: 481tick拒否、getter/toJSON等は呼出/write0。最終candidate容量超過もwrite0 | M2 Browser / schema2-review Node |
| 22 | unsupported | PASS（自動受入範囲）: 160tick等を近似せず診断・保存値保持、future拒否 | staff/schema2 Browser / Node |
| 23 | print fallback | PASS（自動受入範囲）: 五線/Inspector非印刷、従来コード譜、明示案内 | M2/staff Browser。実プリンター未検証 |
| 24 | 他consumer | PASS（自動受入範囲）: 固定時計のPre-DTM JSON/MIDI等の出力一致 | schema2 Node / 正規Browser |
| 25 | 8/32/64/128性能 | PASS（自動受入範囲）: 20sample、64 p95 16ms/500ms、128追加耐久 | 今回performance.json / performance-gate.json |
| 26 | ドレミ往復 | PASS（自動受入範囲）: legacy未確認180tick、ID/provenance/rest/gap保持 | schema2-review Node / schema2 Browser |
| 27 | 部分確認 | PASS（自動受入範囲）: onsetのみは他属性/gapを確認しない | M2 Browser / controller Node |
| 28 | 小節一括確認 | PASS（自動受入範囲）: gap→rest含め1Undo、全属性確認時だけ小節確認済み | M2 Browser / Node |
| 29 | Undo容量 | PASS（自動受入範囲）: 公開前拒否、draft/dirty/history/raw不変 | controller/schema2 Node。UI文言の実容量試験は未実施 |
| 30 | 保存競合 | PASS（自動受入範囲）: exact raw変更を上書きせずdraft保持 | schema2 Node / 正規Browser |
| 31 | 保存失敗 | PASS（自動受入範囲）: quota/index復旧失敗/result-unknownを保持。metadata増加で容量拒否時もdraft/base/dirty/history/raw不変 | project-save-budget Node/Browser、schema2-review Node / 正規Browser |
| 32 | 原文保持 | PASS（自動受入範囲）: 空白込みraw/hash不変、保存・再読込後も保持 | schema2 Browser / Node |
| 33 | notation fragment | PASS（自動受入範囲）: 複数fragmentが同じbar/eventへ、gapとrestは区別 | M2/staff Browser / Node |
| 34 | 無変更操作 | PASS（自動受入範囲）: 確認同値の履歴追加なし、開閉/選択writeなし | controller Node / M2 Browser |
| 35 | 旧consumer拒否 | PASS（自動受入範囲）: canonical直接読取/公開projection保存拒否、明示adapter | schema2-compat/review Node |

### 0.40.0時点の性能（履歴）

単位ms、warmup3後に20回、nearest-rank p95。同じrawを0.38.1 archiveと0.40.0で比較。8/32/64/128小節、明示Save/再読込の前後、migration/command/CMM/staff/save/loadの全sampleを保持する。Node/Browser回帰と並行実行しない。同期編集はM1共通commandの同期処理時間であり、Inspectorを開いた全UI操作のE2E時間ではない。

| 小節 | 保存前 同期編集p95 | 保存後 同期編集p95 | 保存前 五線p95 | 保存後 五線p95 |
|---:|---:|---:|---:|---:|
| 8 | 2.0 | 2.0 | 15.7 | 15.5 |
| 32 | 6.1 | 6.3 | 45.3 | 45.4 |
| 64 | 12.5 | 12.2 | 102.9 | 102.5 |
| 128 | 24.5 | 24.9 | 273.8 | 277.4 |


64小節は同期編集p95≤16ms、五線更新p95≤500msの正式目標PASS。128は追加耐久であり16ms目標の対象外。RangeError/保存後の異常増幅なし。比較元0.38.1に対するCMM等のコストは残り、全metricが旧版同等と主張しない。

### Git / 次工程

Studio所有の個別manifestだけを限定stage。開始clean baselineと現再開差分manifestを分けて保持し、checkerを弱めない。commit/postcommit/topic pushの実行結果と正確なSHAはrepo外final-receipt.jsonで確定する。本文だけで公開済みと見せない。

F3（Port1.23.1 metadata/cache）は最新main統合前の別工程。main第1親/topic第2親の2-parent integration契約・全回帰・別の公開承認が必要。このtopicの公開はmain統合やPages本番公開の承認ではない。

証拠ディレクトリ: `/Users/murakamimasakuni/.codex/visualizations/2026/10/10/01a1244d-3cb2-7043-bd29-981e371b1ae2/schema2-m2-final-acceptance-20261016`。resume-state/resume-files/resume.patch、keyboard-settings-diagnosis、Node/Browser logs、m2-storage-ledger、schema2-storage-audit、geometry/PNG、performance全sample/gate、Git gates/final receiptを参照。
