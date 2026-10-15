# Version / Feature Metadata v1

[Shell Contract v2.1 §21](SHELL_CONTRACT.md#21-metadata-v1--version-reader-first)のStudio側reader。
6 component、17 featureだけを静的に登録する。0.25.1ではport.metronomeのM1 surface + M2隔離保存契約のDockへ選択descriptorを接続する。
他featureの起動処理・version表示は未接続。

## 読み取りAPI

`js/core/feature-registry.mjs?v=0.38.1`から次をimportできる。

- `getComponentMetadata(componentId)` / `getAppVersion(componentId)`
- `getFeatureMetadata(featureId)` / `listFeatures()`
- `listComponents()`（source照合・一覧用）

未知IDは`null`。一覧・descriptor・配列・内部参照はdeep freeze済み。mutation APIやglobal登録はない。
`.mjs`を使い、classic scriptと区別する。Node検証のためのpackage.json追加やmobileのmodule化は不要。

## Version source

| componentId | 現行appVersion | repository-relative source / symbol | 読み方 |
|---|---|---|---|
| cruise-port | 1.23.0 | apps/cruise-port/app-version.js / CRUISE_PORT_APP_VERSION | 元ESM定数import |
| chord-cruise | 1.21.0 | apps/chord-cruise/js/app.js / CHORD_CRUISE_APP_VERSION | source-mirror |
| pitch-cruise | 2.30.0 | apps/pitch-cruise/script.js / PITCH_TRAINER_APP_VERSION | source-mirror |
| fretboard-cruise | 2.25.0 | apps/fretboard_cruise/script.js / FRETBOARD_CRUISE_APP_VERSION | source-mirror |
| rhythm-cruise | 1.20.0 | apps/rhythm-cruise/script.js / RHYTHM_CRUISE_VERSION | source-mirror |
| cruise-studio | 0.38.1 | apps/cruise-studio/js/core/song-model.js / APP_VERSION | source-mirror |

Studio 0.38.1のmetadata保守で現行sourceに追従。製品機能・Project schema1は変更しない。

元sourceが正。mirrorのpath・symbol・extraction・expectedValueを保存し、毎回source一致を検証する。
`version-reader.mjs`は渡されたテキストのliteral宣言だけを抽出する純関数。
classic scriptの実行、eval、filesystem、network、DOM、storageには接続しない。
宣言が欠落・重複・非literal、抽出規則未対応、mirror不一致なら例外とし、古い値へのfallbackをしない。
コメント・引用文字列・template内の偽宣言は採用しない。汎用JavaScript parserではなく、現行宣言形式向けの限定reader。
対応する宣言は同一行の単純なVersion文字列literalと終端`;`に限定し、継続式・式initializer・`;`省略・未対応の字句形式は検証失敗として扱う。

appVersionとstorage schema、Sync schema、API version、asset/module cache key、release commit/buildは別物。
schemaRefは種類・source・symbolだけを指す。Studio schemaは1、Metronome保存schemaは3で、appVersionではない。
API / backend versionやbuildの推測値は登録しない。独立componentは必要な工程で追加できる。

### Importとcache

Studio内部importは現在のmodule cache運用に合わせ`?v=0.38.1`。
Port元ESMへのStudio側importは現行sourceのcache key `?v=1.23.0`を使う。
商品versionをcache keyから抽出することはない。他ownerのHTML・mobileの`?v=`は変更しない。
Portの正式release後はsource照合に加えて、このStudio側参照のcache keyを確認する。
classic ownerの正式version更新後は、Studio所有のmirrorだけを追従更新し、全6componentを個別に照合する。
変更を他ownerへ広げず、元sourceのversionを下げたり照合をskipしたりして通さない。

元ESMは隣接する`apps/cruise-port/`への相対importで読むため、検証・将来Shell接続時は
`apps/`またはrepo rootを公開するHTTP topologyが必要。StudioディレクトリだけをHTTP rootにすると
この新moduleの直接importは404になる。既存index.htmlはregistry全体を直接読まない。M1は選択descriptorのclassic projectionを同梱し、
catalog完全一致testを行うため、Studio単独サーバーを継続利用できる。
registry全体を直接導入する前にShell host側でこの配信条件を満たす。Port UI・policy moduleを実行してversionを取得しない。

## Feature descriptor

必須はfeatureId、ownerApp、appVersionRef（componentId）、supportedPresentations、actionCapabilityRequirements。
version literalをfeatureごとに複製しない。

`supportedPresentations`はPC配置候補。rendererの実装完了・機能統合完了・アクセス許可を表さない。
`implementedPresentations`は現行Studio内の静的実装記録で、Structure / Pre-DTMのmainと
port.metronomeのdock（BPM / Start / Stop surface + M2 memory保存状態）。他は空配列。既存mobile UIやシリーズリンクは実装済みStudio rendererに数えない。

| feature | 配置候補 |
|---|---|
| port.home | main |
| port.myApps / port.practice / port.calendar | main / separate-workspace |
| port.tuner | dock / drawer / separate-workspace |
| port.metronome | dock / drawer |
| port.gear | main（一覧）/ inspector（選択Gear） |
| port.news | main / separate-workspace |
| port.settings / port.accountSync | separate-workspace（Settings） |
| chord.main | inspector（選択小節）/ tool-pane / separate-workspace |
| chord.library | tool-pane / separate-workspace |
| pitch.training / fretboard.main / rhythm.training | separate-workspace |
| studio.structure / studio.preDtm | main |

Tuner / Metronome / Chord / Gear / NEWS / Accountは契約の配置を反映。
その他は独立した操作画面を置く保守的な候補で、詳細PC renderer設計は後工程。
配置情報はmodal性・focus・Editing Session・lifecycleを決定しない。

### Action policy / permission / audio

actionCapabilityRequirementsはaction→`[{sourcePath, key}]`の静的参照。
Portは実際の`cruise-port-capabilities.js`キー、Chordは`feature-access.js`の既存キーだけを使用する。
`basic` / `pro`の新しいcapability名、資格true/false、edition・上限数・tokenを複製しない。
数値のcreation limitも既存policyへの参照のまま扱う。テストはpolicy定義と実consumerをテキスト照合する。

例: Metronome advancedSettings→metronomeAdvanced、savePreset→metronomePresetWrite。
changeBpmは空配列。空配列・空mappingは「記録した商品policy参照なし」であって、実行許可ではない。
列挙は現行sourceで確認できたactionに限定する。その他の保存・削除・backend操作が自由になる意味ではない。
runtimeはaction実行・commit直前に必要な資格、backend認可、quota、検証等を別途確認する。

requiredPermissionはaction→browser permission配列。TunerのstartCapture、RhythmのmicrophoneInput /
microphoneCalibrationだけにmicrophoneを記録する。Rhythmのtap練習にマイクを必須化しない。
Pitch等の音声出力・autoplay / user gesture要件はbrowser permissionと混同せず、ここには登録しない。
audioRoleは静的役割の配列。Metronome=click、Tuner=capture、Pitch / Fretboard=training・preview、
Rhythm=training・click・capture・calibration。未実装のPre-DTM試聴を実装済みplaybackとして登録しない。

### Ownerとruntime境界

ownerAppはcomponentId。dataOwner / syncOwnerは既存adapterのappId（port / chord / pitch / fretboard / rhythm）。
これはowner関係だけで、Sync参加・ensure・status subscribe・資格取得は実行しない。
Port NEWSはPortの既存Sync datasetへ含めず、データowner / syncOwnerを推測登録しない。
StudioのdataOwnerはcruise-studio。正式Sync未参加なのでsyncOwnerを省略する。

renderer、handlers、実access、permission結果、資格、Sync status、lifecycle、Editing Session、
audio state、serviceVersion、runtime readinessを置かない。Themeは別工程のmetadataへ接続可能で、今回fieldは追加しない。

## 検証

repo rootで`node --test apps/cruise-studio/tests/feature-metadata.test.mjs`。
source更新によるVersion / policy key / consumerの不一致は失敗になる。元アプリを修正して通すことはしない。
テストはimport副作用、immutability、未知ID、owner、presentation、permission / schema境界も確認する。
protected apps / shared / Workerのtracked差分なしをGitで検査するため、これらに並行変更がある場合は
その項目が失敗する。変更を消さず、所有者・作業範囲を確認する。


## Metronome M1 / M2接続（0.25.1）

`js/modules/metronome/metadata.js`は既存port.metronome descriptorだけのdeep-frozen projection。
sourceはfeature-registry.mjsで、Node testで全field一致を検証する。ownerApp=cruise-port、
dataOwner / syncOwner=portは維持し、M1 / M2でそのstorage / Syncへアクセスしない。
Dockのimplemented記録はStandard相当BPM / Start / Stopのみ。M2は注入memory settingsのみ。M3製品統合やdrawer完了を意味しない。
M2 schema / store / controllerはregistryへ入れない。静的owner / schemaRef / action policy参照は既存Port正本のまま。
注入access stateはeffective設定fixtureだけで、認証・認可ではない。保存契約は[Metronome統合](METRONOME_INTEGRATION.md)を参照。
Session、lease、context、running、permission・Pro実資格はruntimeへ置く。万能registryへ拡張しない。
詳細は[AUDIO_COORDINATOR](AUDIO_COORDINATOR.md)を参照。
