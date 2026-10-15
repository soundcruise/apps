# Integrated Score Melody Staff Preview v1

Studio 0.38.1 / StudioProject schema **1**。専用topicでの実装。main統合・Pages公開は別承認。
Architecture/UX文書の将来schema2と現在実装を混同しない。

## Source / readiness

Structure Editing Sessionが唯一の編集正本。`musicConversion.convert()`の成功結果だけを
pure `melodyNotation.project()`へ渡す。Coreのfatal判定・全体成功条件を緩めない。
ギター情報のfatalがある場合も部分結果を使わず、原因と対応を表示する。内部コードは詳細へ置く。
歌詞はCommon Music Model v1へliteral `lyrics`（onsetTick/text/sourceLocation/provenance）を追加。
不正な歌詞tickはfatal。音符との対応・ハイフン・メリスマを導出しない。
保存schemaや音楽的解釈は変更しない。第二draft/Undo/保存領域なし。

Sourceはsession/project/snapshot/baseRevision/selection generation/workspace generation。
予約frameごと、および表示採用直前に正式`isCurrent(result)`を確認する。
外部競合/Modal/別workspaceでは旧表示を隠し、理由を表示する。
入力中だけ、同一document/session/base/selection/workspaceかつ外部変更がない場合に直前の確定表示を保持し、
「入力中・確定後に更新」と明記する。これはisCurrent成功や現行譜への再採用ではない。
A→B→A、Undoで同じ内容へ戻った場合も、旧tokenを採用しない。
UI切替はmemory-only（既定コード譜）。保存・Undo履歴へ入れずreloadで戻る。

## 音楽と描画

- 4/4、480 PPQ、1920 tick/小節、legacy major-solfegeを継承。
- 五線は実音pitch・ト音記号、ギターのoctave移調なし。コード文字列は既存Playキー基準のまま。
  カポ時にもこの2基準を明記。コード入力変換やU3の新しい既定は実装しない。
- 調号はCb〜C#（♭7〜♯7）。範囲外の異名同音キーは勝手に置換せず未対応。
- 音高・綴り・octaveはCoreのpitchを使用。VexFlowは描画だけ。
- 30 tick単位までの正確な二進音価。付点、off-beat、分解が必要な音価はタイで接続。
  3連など表現できない時間は未対応。丸め・切り詰め・音高の推測補完なし。
- silentIntervalsを休符として描く。保存された明示休符・原曲確定休符とは見せない。
- 紙面に「音の長さ：自動を含む（由来未確認）」を継続表示。小節ごとの重複注記を省く。確認保存なし。
- 同じ小節・VexFlowの時間anchorからコードと歌詞を配置。横に長い小節は小節内scroll。
- Chord推奨／Rhythm preset／TAB／伴奏五線／本棚／音価編集／MusicXML／新MIDIは未接続。

VexFlow 4.2.3を既存Rhythm vendorからbyte同一でStudio内へ複製。
MIT・埋込Bravura/Petaluma/Leland OFL・Gonville/Custom通知を`vendor/`に保持。
外部フォントloaderは呼ばず、CDNなし。VexFlow描画object/SVGを保存しない。

## DOM / IME / lifecycle / performance

既存Structure workspace・scale box・bar selectionに接続。五線の小節は既存ルーペ入口。
入力欄をstaff rendererの所有DOMに入れない。小節signatureとsystem配置・高さ・表示段の依存関係を照合して再描画。
composition中には変換を採用しない。focus/caret/スクロールを描画から操作しない。
既存ルーペ全体のDOM/位置刷新は行わない。

上限256小節、128 segment/小節、歌詞＋コード2048文字/小節。超過は明示拒否。
計測とVexFlow描画を1frame最大16小節・共有8msのsoft budgetで分割。1小節は同期のため実測最大時間も記録。
`getStaffMetrics()`は読取専用の計測結果。Core snapshot/変換も既存budgetで制限する。
8/32/64小節、単一小節変更、旧frame破棄を正式Browser試験で実測する。

## Print / safety

五線は画面previewのみ。Printとbeforeprintでは同じworking projectの従来コード譜を生成して出力。
五線を完成譜として印刷しない。afterprintで一時DOMを除去。既存JSON/Pre-DTM/MIDIは不変更。
明示Save以外のrepository writeなし。PortDataHost.canWrite=false。
Pro/Account/Authority/Sync、shared write、Daybreak動的probe、本番deployに接続しない。

## Verification / remaining

Node: pitch/key/accidental/octave/onset/duration/gaps/dots/ties/fatal/source/stale/A-B/Undo/immutability/no-write。
Browser: スタイル・小節対応・SVG・IME/native/domain Undo・project/workspace・4 Themes・narrow・Print・性能。
正式15 suite＋Structure conversion＋新規melody staff suite。合成443Hz・隔離port・使い捨てChrome。
2026-10-15実測（commit前）: Node942 / Browser437 PASS、FAIL0/skip0。
8/32/64小節18.3/131.2/260.4ms、最大frame1.6ms。性能測定はSVG observer導入前に実行。
257小節は14ms、2049文字は13msで明示拒否。focus保持、repository書込み0。
実OS/プリンター以外のNo-write・Console/404/禁止通信は0。
実OS IME、Safari、実プリンターは自動試験だけで保証しない。
次工程: 実機の読みやすさとIME確認、共通layout/ルーペ常設DOM、音価編集の正式契約。

## SVG Verification completion

前回の `.vf-accidental` はVexFlow4.2.3が生成するDOM classではない。
実BrowserではF♯とnaturalにそれぞれ実glyph path（accidentalSharp/accidentalNatural）があり、
非ゼロの描画領域・所属音符の左側位置を確認した。製品音楽解釈/描画コードの変更は不要だった。

テスト専用observerは原描画関数へそのまま委譲し、独自data属性のgroupへ識別情報を付ける。
内部classや生成IDの定数に依存せず、実Voiceの音符順序・音価、実glyph code・geometry・所属音符、
連桁のmember、タイの両端・同音高を期待値と照合。メタデータだけではPASSしない。
臨時記号/連桁/タイのpaintを実DOMから消すと、labelが残っていても検証が失敗する反例を維持する。
このobserverはtest moduleだけから読み、製品module graph・保存・音楽モデルへは接続しない。

12ケース: C/F♯、C/B♭、G/F natural→F♯、F/B natural→B♭、同小節継続、
小節線のreset、octave別の臨時記号、8分連桁、拍境界、同音タイ、付点、音符＋休符。
画像でもglyph/連桁/タイ/付点を確認。時間の期待値は明示的な正式schema1 fixtureを使用。

v1は四分拍内で自動連桁を作り、拍境界の両側にある8分音符は旗で表す。
任意の跨拍連桁指定は保存モデルに無く未対応。音価・onsetを変更して連桁を捏造しない。
跨小節tieや連符を新たに保存せず、範囲外の音価は既存の明示拒否を維持する。
上記SVG verificationは0.38.0の初回commitの記録。以下が今回のpatch候補。

## 0.38.1 Integrated UX Polish — review decisions

Astra/Opusの重複指摘を統合した。P1対象は隣接コード/歌詞の重複、8分末尾/密集音符の見切れ、
IME中の消失、内部コード露出、毎小節の記号、同じ行の高さ、曲/カポ情報。
P2対象は横scroll保持、表示設定、密集小節の案内、160tickの説明、注記/段間隔、
更新ボタン、印刷注意、style選択欄、ルーペ位置の限定的回避。

### 共通横配置とsystem

`melodyNotation.layout(notes, rows, leading, available)`はmemory-only pure projection。
Canvasで実際のArial 16px/600・14pxの文字幅、VexFlow preformatで音符/休符/臨時記号/旗等の幅を得る。
すべてのtickを集約し、隣接音符と各文字列から次の文字列/小節末へ最小距離制約を張り、
最長経路で必要幅を決める。余白はtick比例で配る。同じanchorへVexFlow TickContextと文字を置く。
同時tickの複数文字は元順の「 / 」併記にまとめる。元の音楽的時間は変えない。
必要幅が収まるときのみ最大2小節をsystemに置く。section境界/既存改行を尊重。
音部記号/調号はsystem先頭、拍子は曲先頭。現行は曲内固定key/4/4で、転調/変拍子は追加しない。
高低音の余白と表示段の高さはsystem内で共有。OFFの段は生成しない。
showLyrics=falseが全体OFF、section.lyricsHidden=trueもそのsectionの歌詞を隠す。
コード譜にはsection flag未参照の既存経路があるが、その挙動は今回変更しない。
単一小節が収まらないときは縮めずscrollと案内を表示し、差替え時のscrollLeftを維持。
無変更のcell/systemを無条件にdetachしない。入力欄は従来どおり所有DOM外。

### 保留表示・診断・UI

入力中の保持は表示上の保留だけでdata-ready=false。project/session/base/selection/workspaceの変化、
外部状態、fatal、invalid、未対応結果では隠す。全chunkと採用直前のisCurrent確認を維持。
診断を重複排除し、原因/特定可能な小節番号/対応を表示する。内部コードは折り畳み詳細だけ。
160tickは三連等の音価未対応であり、4/4や480PPQの非対応とは説明しない。
Core fatal全体拒否を維持。非致命的voicingをfatalへ格上げしない。
曲名/section/key/capo/BPM/拍子は現在projectと成功projectionだけを参照。
コード=Playキーの押さえ方、五線=実音という現行境界を明示し、U3を独断で決めない。
ルーペが選択五線に重なるときは、既存safe-area内で収まる場合だけ既存surfaceを上/下へ移す。
低高さで収まらない場合は既存の移動可能editorを維持。常設DOM化は別工程。
全休符は演奏可能領域中央へ置く。元eventのonset=0、1920tickという時間は変えない。

### 見送り・検証境界

1920px全面活用、390pxの閲覧方式刷新、常設Loupe DOM、screen/print共通pagination、
音価編集/確認保存、schema2は別工程。印刷は同じworking projectの従来コード譜。
実OS IME・Safari・実プリンターは未検証。合成compositionを実OS確認とは扱わない。
今回の正式回帰は下記参照。schema1、shared write OFF、他owner不触。


## Finalization verification — 2026-10-15

### 入力拒否と変換診断を分ける

前回のstep=7 fixtureはEditing Sessionの事前検証で拒否されるため、画面診断を待つ試験が誤っていた。
製品validationは変更しない。正式Browser/Node試験でrunOperationのvalidation拒否を確認し、
draft/base/baseRevision/saved revision/dirty/snapshotVersion/Undo履歴が変わらないことを照合する。

画面の重複診断には、公開model API setBarDoremiTextの「ド↑↑↑↑↑↑ レ↑↑↑↑↑↑」を使用。
既存parserとschema1検証で受理されることを明示assertしてから変換する。
Common Music Modelは実音MIDI範囲外として2件のinvalid-melody-pitchを正式に返す。
任意の壊れたresultを注入せず、通常のsession publicationから変換・診断へ進む。
画面には原因と1小節目を表示し、詳細には同じcodeを1行に集約して件数を残す。
非致命的診断も詳細には残すが、原因分類はfatalを優先し、voicingや欠損コード音価で誤分類しない。

詳細はnative details/summaryを使い、展開状態はdetails.openとブラウザーの標準アクセシビリティへ委ねる。
重複したaria-expandedは追加しない。textContentで格納、閉状態のinnerText、展開後のinnerText・実寸、
再折り畳みを別々に検証する。内部codeは通常の紙面本文に露出しない。
160tickは1小節目の三連等の音価未対応と説明し、4/4・PPQの非対応と混同しない。

### P1 / P2最終結果

| 論点 | 今回の確認 |
|---|---|
| 長いコード/英語歌詞の重なり | 実測文字幅、隣接矩形と共通tick照合、画面目視で重なりなし |
| 通常8分の右端切れ | 8音すべてが初期表示内。glyph実寸で左右端を検証 |
| 16分密集・長い小節 | 必要幅を保持。横scrollの案内と後半/最終歌詞の到達を実測・撮影 |
| system | 1/2小節、境界接続、共通五線Y、高低音、system先頭のclef/key、曲先頭のみmeter |
| 曲/カポ | title/section/key/capo/BPM/4/4と、押さえ方/実音の違いを表示 |
| 入力中 | 確定済み表示を明示pendingで保持。未確定データを採用せず、fatalでは旧五線を隠す |
| stale | 大きな更新待ちのA/B/Workspace往復でも旧callbackを採用しない |
| 診断 | 入力拒否と変換診断を分離。格納/展開/折り畳み/重複/小節番号を検証 |

この範囲のP1は解消。P2はコード/歌詞OFF、section.lyricsHidden、横scroll保持、
全休符の水平中央、印刷案内、状態表示、style selector、4 Themesと390/768/1440/1920pxを確認。
ルーペは選択五線から移動できるsafe-areaがある場合にだけ回避し、入力DOMを保持する。
低高さや複数段すべての非重複は保証しない。既存の移動可能ルーペ・狭幅の縮小紙面を維持し、
常設編集領域・390px閲覧刷新・1920px全面活用は後続のP2として残す。五線印刷は未対応。

### 新規実測

- Studio Node全suite: **945 PASS / FAIL0 / skip0**。
- 正規Browser15 suite + Structure conversion + Melody staff: **442 PASS / FAIL0 / skip0**。
- 追加の長いコード/英語歌詞/密集小節左右端QA: PASS。実矩形・時間anchorと撮影画像を併用。
- pitch/key/accidental/tie/beam/dot/restの実SVG paint検証とpaint欠落反例を維持。
- 専用loopback portと使い捨てChrome、正式443Hz WAVを使用。8765/8766不触。
- schema1、PortDataHost.canWrite=false、Project書込み0、Console/404/禁止通信0。
- 実OSのmacOS日本語IME、Safari、実プリンターは未検証。合成composition/CDPの回帰と区別する。

| 小節数 | total elapsed | 最大frame処理 |
|---|---:|---:|
| 8 | 13.2ms | 3.8ms |
| 32 | 44.8ms | 6.4ms |
| 64 | 113.8ms | 7.9ms |

64小節内訳: conversion2.4 / projection0.3 / VexFlow準備4.0 / 文字幅0.2 / layout0.8 /
描画5.8 / DOM7.2 / RAF待機82.3ms。残りはidentity確認・署名比較・DOM/style等の付随処理。
合成inputイベントの同期処理は0.9ms。OS入力からのend-to-end latencyとは呼ばない。
前回約528msの主因だった4小節固定分割の待機を削減。最大16小節/共有8msでyieldし、
全処理同期化は行わない。1小節は分割不能なためbudgetはsoft。無変更SVGの同一性とscroll/focusを検証。

次工程は実機での日本語IME/読みやすさ確認、P2の閲覧・ルーペ方式整理と音価編集の正式契約。
schema2、Chord/Rhythm/TAB、共通印刷paginationは未実装。main統合・Pages公開は本工程の対象外。
