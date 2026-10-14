# Structure / Pre-DTM Active Document Alignment v1

Studio **0.31.1** / Port **1.22.18** / Chord **1.20.1**。Studio schema **1** / Authority physical schema **2**維持。
開始HEAD / origin/main / remote main: `171f31fa7dcc851d055554666c3ae48f3bd910c7`。

## 正本とidentity

正本は既存Editing Session registryのactive `structure` session。
`js/core/active-document.js`はその参照を使うStudio owner facadeで、独立したcurrent projectや第二draftを持たない。
Structureのopen/new/importがsessionを選択し、Pre-DTMのselectorも同じStructure adapterへ委譲する。
ShellのactiveDocument / editingSessionはこのsessionを参照する。focusやworkspace移動から曲を推測しない。

`projectId`はdocument identity、`sessionId`は編集中session identity。
`baseRevision`はrepositoryで採用したraw JSONのopaque revision、`snapshotVersion`はsession内の内容世代。
ownerのselection generationはA→B→Aでも旧callbackを拒否するためのruntime token。保存schemaへ追加しない。
曲名、BPM、appVersion、DOM表示をidentity / revisionに使わない。

## 選択・bootstrap・lifecycle

- StructureとPre-DTMのselectorは一つの対象を選択する。cached sessionの未保存draftも同じものを再利用する。
- Pre-DTM activate / reload / exportはactive documentを読み、以前表示した曲を再選択しない。
- Pre-DTMを最初に開く場合だけapp hostがcurrentProjectIdのhint、なければ保存一覧先頭を正式adapterで開く。
  hintが不明・futureなら別曲へfallbackしない。対象がなければ空表示、新規draftを自動作成しない。
- currentProjectIdはreload時のhintであり、開いているStudioの正本ではない。Pre-DTM自身はこの値を書かない。
- workspace往復はsession、dirty、selection、scroll、focusを保持する。同じ曲ならStructureをreloadしない。
- IME未確定・just-composed・Modal中の対象変更を拒否する。
- Homeの開発用sample/importの遅い完了はactive documentを変更しない。ownerがまだ未選択で同じticketの時だけbootstrap hintを設定できる。
  保存済みwriteそのものを取り消した扱いにはしない。
- StructureのFileReaderは開始ticketを固定し、対象変更後（A→B→Aを含む）の遅い読込を適用しない。

## 内容とfail-closed

保存済みsnapshot / baseSnapshot / draft / working snapshotは既存Editing Session契約のまま。
Pre-DTMはactive sessionが発行したimmutable working snapshotだけを読む。別曲saved fallbackは撤廃。
表示・workspace移動・出力でproject / indexへ保存せず、baseRevisionを進めず、dirtyを解除しない。

captureは現在repositoryを確認し、未観測の変更もsessionのexternal-update境界へ渡す。
clean更新は正式採用、dirty更新はbase/draftを維持してpending。dirty conflict / 削除 / 未確定入力 /
保存結果待ち / invalid・future schema / 読取不能 / 対象なしではJSON/MIDIを無効化する。
古い生成表を現行値として残さず、対象selectorとStructure確認導線を残す。
削除・競合でもStructure draftを破棄せず、StructureのProject JSON退避経路は維持する。
外部値の正式採用はStructureの既存確認操作に従う。自動merge・overwriteを追加しない。

## Pre-DTM設定の帰属

[ADR-014](DECISIONS.md)どおり、伴奏設定は`cruiseStudio.appSettings.preDtmSettings`に置く**全曲共通のアプリ設定**。
parts / patterns / accentは曲A専用状態ではない。A/B往復で保持し、対象ごとのsettings mapや新keyを作らない。
明示設定変更だけが従来どおりappSettingsへ保存する。load/activate/reloadで設定を再初期化しない。
曲に結び付くproject snapshot、生成結果、曲情報・警告・event tableは対象変更時に再生成する。
旧曲の出力statusは解除する。scroll/focus/paneはworkspaceの状態であり、document contentへ保存しない。
将来の曲ごとのarrangement保存は別schema契約。今回実装しない。

## JSON/MIDI・完了境界

出力開始時にidentity ticket / sessionId / snapshotVersion / baseRevision、working snapshot、アプリ設定を固定。
JSONとMIDIはその固定入力から生成した凍結arrangementを使う。既存出力形式、tick、MIDI対象（ベース/ドラム）を維持する。
ファイル名も固定した曲名から決める。後続編集や対象変更で開始済みファイルの内容を交換しない。

現行生成・Blob download発行は同期処理。新しい非同期export engineは追加していない。
生成中の再入による対象変更でも開始時の曲を出力できるが、旧完了statusは新曲へ反映しない。
将来非同期化するconsumerも同じframeを保持し、完了適用前にowner.isCurrentでidentity・内容世代・repository revision・競合を再確認する必要がある。
古いFileReaderは対象を変更できず、保存の遅延ACKは既存契約どおり発行元sessionへ返る。

## UI・検証・残件

現在曲名、新規・未保存、既存・未保存、保存済み、削除・draft保持、対象なしを既存selector/statusに表示。
4 Themes、Keyboard/Modal、Structure Loupe、Print、Metronome/Tuner/Port閲覧との境界を維持する。

修正前の正式browser回帰でAを誤出力する反例を確認し、修正後の同じassertionでBのJSON/MIDIとdraft保持を検証。
全Node、正規Chrome UI回帰、新規A〜E、外部更新/削除/future/空、No-write、4テーマ×390–1920幅をrequired gateとする。
実測件数はROADMAP / PROJECT_STATEの今回の記録を参照。

PC Integration Reviewで確認済みの一覧focus復帰、390pxのtoolbar/Loupe overflow、Dock密度は今回修正しない。
domain Undo、draft crash復旧、Transport/実再生、アコギMIDI、曲別arrangement保存も未接続。
実OS IME、Safari、実プリンター、DAW読込みは実機確認を要する。

Port/Shared/Worker製品コード、Pro/Account/Sync/Authorityの接続・認可・保存を変更しない。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=false**。
Daybreak待機/L3c境界を維持。新規動的認証probe、本番deploy、D1 migration、cutoverなし。
