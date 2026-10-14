# Common Music Model + Structure Read-only Conversion Core v1

Studio 0.37.0。memory-onlyの新しい変換APIとしてminor更新。StudioProject schema1・Port1.22.18・Chord1.20.1・Rhythm1.19.1不変。
Structure Editing Sessionが編集の正本。共通modelVersion1は保存schemaVersionとは別の派生モデルであり、第二draft/dataset/historyを持たない。
五線譜/TAB描画、フォーム選択、Rhythm公式preset接続、永続保存、Pro/Account/Sync/Authority/Transportは未接続。

## API / source

`commonMusic.createConverter({studioTheory,chordTheory,validate}).convert(frame)`は同期pure。正式working frameを入力する。
製品入口は`CruiseStudio.musicConversion.convert()` / `isCurrent(result)`。戻り値はdeep frozen `{ok,model,diagnostics}`。
fatal時はok=false。一部情報をmodelに残せる場合も、それを現行譜面として採用してはいけない。
ok=trueは対応範囲のprojection成功だけを表し、完全な演奏譜の完成ではない。`completePerformance=false`を常に明示する。

sourceはprojectId/sessionId/snapshotVersion/baseRevision、Active Document selection generation、workspaceId/workspaceGenerationを保持。
小節に永続stable IDがないため、sourceLocationはこのsnapshot identity＋barIndex/eventType/eventIndex（strokeはpatternIndexも）で参照する。
異なるsnapshot間のindexを同一eventと扱わない。タイムスタンプ/randomを採番・変換へ使わない。

Active Documentの同じregistry-owned Structure sessionから読み、`capture()`の外部採用処理を呼ばない。
repository追加`readRevision`はgetItemでopaque raw revisionの存在/一致だけを読む。JSON解析・migration・通知・保存は行わない。
IME/just-composed/Modal、commit中、external pending/conflict、削除、future schema、未観測revision変更は拒否。
未観測clean外部更新も自動adoptしない。Structureの既存解決操作後に再試行する。convert/isCurrentでbase/history/pendingを変えない。

Shell既存workspace hostの成功activateだけが単調generationを進める。新しいworkspace ownerは作らない。
A→B→A、Undo/Redo、workspace往復、外部更新後に旧resultを採用しない。同じ内容へ戻っても旧tokenは復活しない。
serviceが実際に発行した成功resultだけをWeakSetで認識し、複製/別service resultはisCurrent=false。
sessionId等はruntime内のidentityでありreloadを越える永続IDではない。reloadで新serviceになれば旧memory resultは発行記録を持たず拒否される。

## Model / music

| Field | Contract |
|---|---|
| modelVersion / source | 派生版1 / 固定source identity |
| ppq / meter | 480 / 4/4、1920 ticks per measure |
| keyContext | originalKey/playKey/capoとlegacy-major-solfege解釈 |
| measures | index、元barNumber/sectionId、absolute startTick、lengthTicks |
| voices.melody | 元音符eventsと導出silentIntervals |
| harmony | 原文symbol、parserのroot/quality/bass、onset/duration、supported |
| voices.guitar | Structureのstroke、未確定form/stringFret/struckStrings/fingering/voicing |
| provenance / diagnostics | 属性の出所とfatal/warning/unresolved |

MIDIはStudio既存`melodyEventToMidiNote`を使う。先にstep/alter/octaveの整数を確認し、既存関数の丸めを不正値補正として使わない。
Chordのreleased pure `spellScaleNotes` / parseSpelledNoteName / formatAccidentalを綴りに使い、音階表を複製しない。
formPitchはplayKey基準・capo前、pitchはoriginalKey基準の綴りと既存capo加算後の実音MIDI。
capoによるoctave carry、B♯/C♭のletter octaveもMIDI整合で求める。ギターの1 octave上の移調記譜は描画工程の契約であり今回加えない。
実音MIDI範囲0–127を検査する。capo前formPitchがその範囲外でも実音が有効なら保持し、formPitch.midi=null / semitoneNumberに理論上の位置を残す。
C♯とD♭を同一文字列へ置換しない。originalKeyとplayKey+capoが不整合なら保存を修正せず変換を拒否する。
minor chordを根拠に階名scaleをminorへ変更しない。minor key/modeの新契約も追加しない。

onset/durationは保存値を整数検証。0/負数/小数/小節越えを拒否。メロディ重複はfatal、元配列順と繰返し音は保持する。
gapは導出silenceとして別配列に置き、元melodyへ休符を書かない。非4/4・非480 PPQはunsupportedで拒否。
Harmonyは既存parserのsyntax分解とChord quality metadataの対応確認。未知suffixも原文/root/quality/bassを残しwarning。
コードの欠損durationはnull＋unresolved。Pre-DTMの前コード継続/小節先頭採用を変換Coreへ流用せず、Structure各eventを読む。

strokeはbar override、なければbasic pattern。pattern長1920とslot順/整数を検証。down/up/mute/restを保持し、mute/restの方向を推測しない。
gridはtick/四分位置と8分/16分へのalignmentだけを導出し、元入力resolutionは不明としてnull。alignmentを元の入力gridと誤認しない。
duration欠損は既存保存規約「次slotまで、最終slotは小節末」を導出する。これはユーザーが原曲の音価を確定したことを意味しない。
空slotから空振り方向を作らない。tieToNextは記録されているbooleanだけ保持し、実演奏への適用はunresolved。
form/stringFret/struckStrings/fingering/voicingはnull。フォーム・使用弦・運指を自動確定しない。

## Provenance / diagnostics / budget

sourceOwner/sourceLocation/derivationKind/confirmationStateを各音楽属性へ付ける。
現行schema1には明示入力/自動割当/既定入力/推奨生成/ユーザー確認履歴の識別子がない。
入力された保存値はlegacy-data、計算値はexisting-convention。確認状態はlegacy-unknownでありconfirmedへ格上げしない。
将来の明示入力や推奨生成はその操作の正規provenance契約とともに追加する。UI推定を保存済み事実として捏造しない。

fatal: invalid-source/project/pitch/onset/duration、overlap、out-of-range、unsupported meter/PPQ/schema、key矛盾、stroke不整合、予算超過。
warning: 未対応コード。unresolved: voicing/string-fret、欠損コード音価、将来continuation。
診断は最大256件。上限後にもfatalを保持し、ok=falseを省略しない。

既存UIは1 sectionにつき64小節だが、project全体/repository payloadにハード上限はない。
変換独自上限は2048 bars、展開後32768 events、100000 JSON nodes、2Mi文字/keys、depth32。
共有patternを全小節へ展開する総数も先に数える。budget超過はsnapshot clone/出力展開前に拒否する。
純converterのraw revisionは4Mi文字まで。保存値は切詰めず、壊れた値の自動補修も行わない。

## Future bindings / no-write / verification

Chord接続点はguitar voiceのform/voicing/使用弦snapshot。将来ownerのgetCommonForm→getFormだけを利用し、第二推奨algorithmを作らない。
Rhythm接続点はguitar eventsのonset/duration/action/direction/provenance。ownerのimport-safe readerを用意してから接続する。
表記/演奏schemaの永続追加は別migration契約。今回project schema1とUndo payloadを変えない。
converter/serviceはDOM描画、repository save、Port/Chord/Rhythm storage、Authority/ProDevice/Account/Sync-outbox/Worker/cloud mutationを呼ばない。
既存明示SaveとPre-DTMのJSON/MIDI（bass/drums）を維持する。新規security probe/shared write/deployなし。

Nodeでは音高/綴り、timing、source、budget、readonly lifecycle、実MIDI bytes不変を検証する。
Browserでは現在draft/Undo/Redo/A-B/workspace/IME/Modal/focus/print/Themes/no-write/console/404と正規15 suiteを検証する。
旧Host単独補助試験のhidden Start既知FAILは別記録のまま。実OS IME/Safari/プリンター/DAWはこのCore工程の実測対象外。
