# Integrated Score Melody Staff Preview v1

Studio 0.38.0 / StudioProject schema **1**。専用topicでの実装。main統合・Pages公開は別承認。
Architecture/UX文書の将来schema2と現在実装を混同しない。

## Source / readiness

Structure Editing Sessionが唯一の編集正本。`musicConversion.convert()`の成功結果だけを
pure `melodyNotation.project()`へ渡す。Coreのfatal判定・全体成功条件を緩めない。
ギター情報のfatalがある場合も部分結果を使わず、生成不可と診断コードを表示する。
歌詞はCommon Music Model v1へliteral `lyrics`（onsetTick/text/sourceLocation/provenance）を追加。
不正な歌詞tickはfatal。音符との対応・ハイフン・メリスマを導出しない。
保存schemaや音楽的解釈は変更しない。第二draft/Undo/保存領域なし。

Sourceはsession/project/snapshot/baseRevision/selection generation/workspace generation。
予約frameごと、および表示採用直前に正式`isCurrent(result)`を確認する。
pending/外部競合/Modal/IME/別workspaceでは旧表示を隠し、理由を表示する。
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
- すべての小節に括弧＋「音の長さ：自動を含む（由来未確認）」。確認済みへの保存操作なし。
- 同じ小節・VexFlowの時間anchorからコードと歌詞を配置。横に長い小節は小節内scroll。
- Chord推奨／Rhythm preset／TAB／伴奏五線／本棚／音価編集／MusicXML／新MIDIは未接続。

VexFlow 4.2.3を既存Rhythm vendorからbyte同一でStudio内へ複製。
MIT・埋込Bravura/Petaluma/Leland OFL・Gonville/Custom通知を`vendor/`に保持。
外部フォントloaderは呼ばず、CDNなし。VexFlow描画object/SVGを保存しない。

## DOM / IME / lifecycle / performance

既存Structure workspace・scale box・bar selectionに接続。五線の小節は既存ルーペ入口。
入力欄をstaff rendererの所有DOMに入れない。入力更新は小節signature比較で該当小節だけ再描画。
composition中には変換を採用しない。focus/caret/スクロールを描画から操作しない。
既存ルーペ全体のDOM/位置刷新は行わない。

上限256小節、128 segment/小節、歌詞＋コード2048文字/小節。超過は明示拒否。
VexFlow描画を1frame最大4小節・8msのsoft budgetで分割。1小節は同期のため実測最大時間も記録。
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
同じ未commit機能を仕上げて初回commitするため、機能全体のminor版0.38.0を維持する。
