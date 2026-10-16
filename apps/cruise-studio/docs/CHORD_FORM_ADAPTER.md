# Chord Pure Adapter Foundation v1

Studio topic candidate 0.41.0 / Project schemaVersion 2。memory-only reader APIの追加によるminor更新。製品画面・保存形式・Editing Session・Undo・既存Inspectorには接続しない。production 0.40.3の公開状態を変更しない。

## Owner contract audit

正本はChord Cruise 1.21.0の `js/core/music-theory.js` と `js/core/caged-forms.js`。classic scriptの `window.ChordCruise.theory` / `.caged` が正式export。ESM exportではない。両ファイルの初期化は所有namespaceとCAGED定義の初期化だけで、DOM、保存、network、認可を起動しない。cagedはtheoryへ依存する。Studio adapterはこれらを自動importせず、hostが依存を注入する。現在の製品HTMLへcaged/adapterのscript/importは追加しない。

- `getCommonForm(qualityKey, rootPc, maxFret, minFret)` → null または `{shape, source, label, metrics}`。演奏フォームそのものではない。ownerのoverride・推奨順位をそのまま採用する。
- `getForm(shape, qualityKey, rootPc, maxFret, minFret)` → unavailable または notes/mutedStrings/範囲省略情報/運指/表示範囲を持つavailable response。stringは1=高E、6=低E。
- `notes`は `{string,fret,interval,finger,fingeringWarning}`。使用弦の最終決定ではない。`mutedStrings`は全フォームから計算され、範囲外で省略された弦をミュート扱いしない。
- availableは範囲内に表示候補がある意味を含み、全構成音・全弦・最低音の保証ではない。`hasOutOfRangeNotes`、`omittedNoteCount`、`outOfRangeNotes`を別確認する。
- 運指nullはあり得る。`detectBarres(notes)`は指・フレット・弦範囲を返す。欠落運指だけではTAB用string/fretを拒否しない。明示warning/limited等は演奏確認待ちとする。
- 6/m6はmaj/mの基底フォームを返す。`chord-model.sixthOverlayNotes()`は追加音の候補集合で、採用済みvoicingではない。
- slash bassはこの2関数の引数にない。`bassOverlayNotes()`も位置候補であり、選択責任をStudioが代行しない。
- 生成上限の既定値はownerでは13、下限0。adapterは物理上限とcapoを検証して明示値を渡す。表示viewportとは独立。
- owner tuningは標準6弦pitch class（6→1: E A D G B E）固定。alternate tuningへ流用しない。

本工程はowner側改修なしで成立する。完全な6/m6や任意slash voicingの自動選択が必要になれば、ownerが推奨・overlay採用・運指・弦決定を公開する別契約が必要。第二の推薦アルゴリズム/CAGED表は追加しない。

## Input and output

`js/modules/chord/form-adapter.mjs` exports `createChordFormAdapter({chordTheory,caged,parseChordSymbol,ownerVersion})` と `CHORD_FORM_ADAPTER_VERSION`。
`parseChordSymbol`には既存Studio `theory.parseBasicChordSymbol`を注入する。ownerVersionには正式component metadataのChord versionを渡す。資格判定APIではない。

`adapter.resolve({symbol,capo,tuningMidi,maxAbsoluteFret,generation?,playedStrings?})`

- symbolは**実音コード記号**。v1 quality: maj / m / 7 / maj7（M7/maj7）/ m7 / 6 / m6 / sus4。root/bass spellingはowner parser、構成音はowner QUALITIESを使う。未知quality、曖昧文字列を推測しない。このsubsetは機能対応範囲であってStandard/Pro認可ではない。
- capoは0–11整数、tuningMidiはstring1→6 `[64,59,55,50,45,40]` を明示する。別tuning/不明octaveは未対応。
- maxAbsoluteFretは楽器の物理上限（capo–36整数）。generationは `{minRelativeFret,maxRelativeFret}`。省略時0–min(13,物理上限−capo)。capo+相対上限が物理上限を超える指定は拒否。
- form root/bass pitch class = sounding root/bass − capo mod12。ownerへはform rootを渡す。
- sounding MIDI = tuningMidi[string−1] + capo + relativeFret。absoluteFret = capo + relativeFret。開放relative0もcapo位置で発音する。
- playedStringsはユーザー/上位演奏modelが確定した1–6の重複なし配列。省略/nullは未確定。owner notesから暗黙確定しない。空配列は発音しない休符等であり、このvoicing問い合わせの対応範囲外。
- viewportなど他の表示情報は生成条件に流用しない。Project丸ごとを渡すAPIではない。

結果はdeep freezeした新規dataのみ。caller/ownerの配列・objectは変更しない。

| Field | Meaning |
|---|---|
| request | 実音・formのroot/bass、quality、capo、tuning、物理上限、生成範囲、明示使用弦 |
| provenance | ownerApp/version、adapterVersion、公式methods、owner recommendation、座標系、生成条件、adoption=unconfirmed |
| display.possible | 検証済み座標のdiagram候補を表示できる。演奏確定ではない |
| form | string/fret/実音、muted/unknown弦、運指/barre、owner警告、省略数 |
| completeness.complete | 取得した**全ownerフォーム**に全構成音、許可音のみ、確定弦状態、省略なし、指定最低音が成立 |
| performance.voicingUsable | completeに加え、明示playedStringsが有効、構成音/最低音を維持し、明示playability警告なし |
| performance.scope | voicing-only。リズム・発音位置・音価・stroke・tie等を確定せず、完成TAB生成可能という宣言ではない |

slash指定がなければ最低音=rootを要求する。slashではbassを追加許可音とし、実際の最低MIDIを検証する。全ownerフォームがbass不一致のときは、使用弦subsetだけで別フォームへ作り変えてcompleteにしない。これは後続の手動フォーム/owner採用契約の対象。

## Completeness and unresolved results

available:trueを信用してreadyにしない。弦重複/範囲外/矛盾pitch/誤quality等の不正responseはdisplay=false。valid座標の部分フォーム・省略情報未確定・6/m6不足・slash不成立はdisplay=trueのままcomplete/performance=falseで理由を返す。全弦がnotesまたはowner mutedに属さなければunknownを残す。

主なreason: `owner-partial-form`, `owner-completeness-unconfirmed`, `string-states-unconfirmed`, `missing-required-tones`, `sixth-overlay-unresolved`, `unintended-tones`, `slash-bass-unresolved`, `root-bass-unresolved`, `played-strings-unconfirmed`, `played-string-not-in-form`, `played-tones-incomplete`, `played-bass-mismatch`, `playability-unconfirmed`。
不正入力/owner例外は未解決結果を返し、旧結果や代替qualityで補完しない。依存API欠落はfactoryのTypeError。accessor/toJSON/class/cycle/non-finite/budget超過のdataは実行せず拒否する。

## Ownership and future adoption

memory結果はsnapshot候補であってProjectの第二正本ではない。外部material IDを捏造しない。採用、暗黙Save、再取得による置換、手動編集、Undo履歴、TAB生成、音楽timeline、UI、認可は含まない。
将来採用時にはStudioProject単一正本・Editing Session操作を通し、音高、弦/fret、capo、tuning、owner/version/生成条件を自己完結snapshotとして保存する。その保存schema契約は本工程で拡張しない。

Standard/Proのowner product policy・runtime access・backend authorizationは別層。pure関数が呼べること、owner complexity/caged metadata、adapterの成功は利用資格を表さない。製品UIで高度フォームを公開する前に別の資格/採用契約が必要。

## Acceptance

- Node: 実released ownerを隔離VMへ登録してMajor/Minor/7th/6th/m6/slash/capo/境界/部分/異常response/例外/使用弦/来歴/不変性を検証する。Project schema2・実Editing Session/history/base/draft/rawが不変。owner初期化・呼出し中はDOM/storage/DB/networkを禁止。
- Browser: 正式15 suiteと現行schema2/notation追加cohort全件、既存Structure conversion、version/cache、adapter専用実Chrome試験。使い捨てprofile・別loopback、443Hz正式mic。製品bootにはcaged未接続、test専用load後は全storage/IDB/network書込み、raw/draft/履歴/ownerデータが不変。Console/404/禁止通信0を要求。
- Git: 正式topic-development scope/capture/commit/postcommit/push gate。Studio個別path限定。main/Pages非更新。原本9hash、旧main/worktreeと他ownerを保護。
- 実OS日本語IME・Safari・実プリンターはこの工程で検証済みとしない。

次工程はowner側の完全voicing対応境界を照合し、Studio内snapshot採用の独立契約・テストを定めること。UI・永続化・TAB実装は別工程。
