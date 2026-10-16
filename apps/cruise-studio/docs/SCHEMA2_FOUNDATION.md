# Schema 2 Foundation M1

正式入力は [Astra契約全文](MELODY_DURATION_REST_CONTRACT.md)。StudioProject schema 2は単一正本。

保存領域: songInfo/sections/bars、instrument、solfege、materials、performance、notation、provenance、任意extensions。
barNumberは派生。note/restはid/kind/onsetTick/durationTicks/provenance。noteだけ実音pitch（step C–B/alter/letter octave）を持つ。MIDIは導出。
chordは実音symbol、未解釈なら原文とbasis。lyricsは独立した時間event。rhythm materialはstudio-strum-v1 snapshot、performanceに基本/小節割当、notationに設定/改行。新しい演奏解釈を加えない。

Migrationは同じrawから同じID・内容。日時・乱数を使わない。原文をlegacySourceに保持し、表示/演奏へ逆流させない。v2再読込はvalidate/cloneのみ。非4/4は明示v1互換。不正/未知構造は拒否。extensionsのみ無解釈往復。future schema拒否。

全時間は安全な整数・正duration・小節内・note/rest重複なし。gapは補集合であり保存しない。schemaの構造的妥当性とrenderer対応値を分離する。

既存Sessionの単一Undoへ統合。command envelopeはproject/session/document/workspace generation/snapshot/base/bar/eventを照合。input/conflict/save/staleは変更前に拒否。requireUndoで容量超過も公開前拒否。legacySourceは履歴から除外するがProject全体予算から除外しない。

最新判定は次節のM1自動受入。過去の停止履歴は下部に保持する。


## 2026-10-16 M1 Final Acceptance — topic候補

**M1 foundationの自動受入はPASS。Studio 0.39.0候補／Project schema 2。M2/M3のInspector UI・実OS IME・実機最終統合は未完了であり、製品統合完了とはしない。mainへの反映・本番公開は本工程の範囲外。**

### 今回の再測定と隔離修正

- Node全suite **1051 PASS / FAIL 0 / skip 0**。正規Browser15＋Structure conversion＋Melody Staff＋schema2の18ファイル **464 PASS / FAIL 0 / skip 0**。過去件数の再利用なし。
- Browser診断は折畳み中のtextContentと実表示innerTextを分離。展開/再折畳み、重複3件の1行集約、1・2小節目、通常説明への内部code非露出、invalid Save拒否、raw保持、cancel回復までPASS。
- reloadで消えるページglobalを計測正本にしない。document初期化前にStorage instrumentationを登録し、runner側の追記ledgerへ送る。barrier応答後に検査し、0へのリセットや欠落counterの空配列置換でPASSにしない。補助ページcounterは正本ではない。
- ledgerは42records、primary document6・反例document2・診断document1を保持。主contextの31writeはfixture6件、明示SaveのProject5＋index5、対象選択15。独立反例の実write2件は別documentで発生し、No-write assertionが両方を拒否。診断contextのwriteは0。
- 診断mockは独立context。実サービスを先に復帰し、正式なrenderer.invalidate()でRAFを無効化、DOM/globalを除去、nested finallyでcontextを閉じる。製品へdispose()やtest globalを追加していない。主document/draft/base/history/ledger不変も検査。
- 8/32/64/128小節の明示Save→Load→CMM→五線、Undo/Redo、A/B、旧result拒否を全件再実行。RangeError・異常増幅なし。Console/404/禁止通信0。正式443Hz WAV、独立loopback、使い捨てChrome。8765/8766を操作しない。

### 正本・保存・consumer契約

schema 2のStudioProjectを唯一の正本とし、bar/event stable ID、実音pitch、独立solfege tonic/capo、note/rest/gap、timing provenance、material snapshotを保存する。gapは補集合で保存しない。旧barNumberは派生。
同じv1 rawのmigrationは決定的・冪等。原文の空白を含めlegacySourceに完全保持し、不変metadataとして扱う。履歴からの除外とProject全体8MiB予算への算入を両立し、原文を捨てて成功させない。
元メモリ入力の正式validationをlossy JSON複製より前に置く。Repositoryは原本→独立複製→保存前検証。Sessionのstaged操作はUndo容量を含め公開前拒否。不正値・ID・future/unknown構造、競合・失敗・result-unknownでbase/raw/dirty/historyを成功扱いしない。
DTO/CMM/notationへ保存rawを反復埋め込まない。結果全体JSON cloneを使わず、immutableな音楽branchだけを必要に応じて共有する。exact rawはサービスprivate WeakMapで照合し、isCurrentとIMEのcanRetainを区別。Pre-DTM/Print/Chord/Structureは明示adapterを使い、schema 2を旧step解釈で黙読しない。

### 最新サイズとraw保全

単位UTF-8 bytes。性能測定と同じfixtureを新たに読み、保存前後のraw SHA-256、ID/pitch/onset/durationを照合。全サイズでCMM保存前後のbytes同値、増加はほぼ線形。hashと生値は証拠sizes.jsonに記録。

| 小節 | legacy raw | Project/保存raw | DTO | CMM（保存前後同値） | notation |
|---|---:|---:|---:|---:|---:|
| 8 | 5099 | 21176 | 18554 | 172027 | 11153 |
| 32 | 17004 | 75703 | 71008 | 690028 | 44247 |
| 64 | 32876 | 148311 | 140864 | 1380269 | 88311 |
| 128 | 64651 | 295128 | 282168 | 2694624 | 177745 |

### 最新性能（全sampleを保存）

155.0.8059.82 / Node v24.14.0 / darwin arm64、1440×1000。0.38.1/dbd9a46のarchiveと同じraw fixture。4/4・480 PPQ、4音・4歌詞・C/strum。warmup3回を除き各20回、nearest-rank。セルは **p50 / p95 / max ms**。他回帰と同時実行しない。

| 版 | 小節 | 状態 | 同期編集 | CMM変換 | 五線更新 |
|---|---:|---|---:|---:|---:|
| 0.38.1 | 8 | 保存前 | 0.5/0.6/0.6 | 0.4/0.5/0.5 | 15.8/17.1/17.8 |
| 0.38.1 | 8 | 保存・再読込後 | 0.5/0.6/0.7 | 0.4/0.5/0.6 | 16.2/16.7/16.8 |
| 0.38.1 | 32 | 保存前 | 1.4/1.6/1.7 | 1.5/1.6/1.7 | 48.8/49.8/49.9 |
| 0.38.1 | 32 | 保存・再読込後 | 1.4/1.8/2.0 | 1.5/1.7/1.7 | 48.6/49.6/50.2 |
| 0.38.1 | 64 | 保存前 | 2.7/3.1/3.4 | 3.2/3.6/3.6 | 125.1/126.6/127.2 |
| 0.38.1 | 64 | 保存・再読込後 | 2.8/3.3/3.3 | 3.3/3.5/3.6 | 125.3/126.7/128.5 |
| 0.38.1 | 128 | 保存前 | 4.5/5.3/6.7 | 6.2/6.9/7.0 | 270.9/272.5/272.8 |
| 0.38.1 | 128 | 保存・再読込後 | 4.5/5.2/5.3 | 6.0/6.7/7.0 | 271.5/274.6/275.4 |
| 0.39.0 | 8 | 保存前 | 1.7/1.8/1.8 | 0.7/0.8/0.9 | 15.0/15.6/15.7 |
| 0.39.0 | 8 | 保存・再読込後 | 1.6/1.8/1.9 | 0.7/0.8/0.8 | 14.6/15.4/15.5 |
| 0.39.0 | 32 | 保存前 | 5.1/5.4/5.6 | 2.2/2.6/2.7 | 44.3/45.0/45.2 |
| 0.39.0 | 32 | 保存・再読込後 | 5.1/5.4/5.5 | 2.3/2.7/2.9 | 44.5/46.1/46.4 |
| 0.39.0 | 64 | 保存前 | 9.6/10.4/12.0 | 4.6/5.2/6.3 | 102.8/105.2/105.9 |
| 0.39.0 | 64 | 保存・再読込後 | 9.6/10.3/11.1 | 4.5/5.0/5.3 | 102.8/105.5/105.7 |
| 0.39.0 | 128 | 保存前 | 19.8/21.7/22.9 | 10.8/13.2/13.9 | 267.4/269.9/282.3 |
| 0.39.0 | 128 | 保存・再読込後 | 20.7/22.1/22.5 | 10.8/13.0/13.6 | 267.0/268.8/280.2 |

| 版 | 小節 | migration | Save | Load |
|---|---:|---:|---:|---:|
| 0.38.1 | 8 | 0.0/0.1/0.4 | 0.6/1.0/1.0 | 0.1/0.1/0.1 |
| 0.38.1 | 32 | 0.1/0.2/0.4 | 1.3/2.0/2.1 | 0.2/0.3/0.3 |
| 0.38.1 | 64 | 0.1/0.2/0.2 | 2.2/2.7/3.0 | 0.4/0.4/0.4 |
| 0.38.1 | 128 | 0.2/0.4/0.4 | 10.3/11.1/11.2 | 0.6/0.7/0.7 |
| 0.39.0 | 8 | 0.3/0.4/0.5 | 2.9/3.2/3.4 | 0.5/0.6/0.6 |
| 0.39.0 | 32 | 0.8/0.9/1.0 | 8.7/9.4/9.4 | 1.7/2.3/2.3 |
| 0.39.0 | 64 | 1.4/1.6/1.6 | 20.0/21.8/21.9 | 3.3/3.8/3.9 |
| 0.39.0 | 128 | 2.7/2.9/2.9 | 40.7/42.0/42.6 | 6.4/6.9/7.0 |

正式な64小節目標（同期編集p95≤16ms・五線更新≤500ms）は保存前後ともPASS。64小節CMM p95比は保存前1.44倍・保存後1.43倍、Staffはbaseline以下。8/32小節のCMM比較は約1.6倍（最大2.7ms）で「概ね1.5倍」の比較目安をわずかに上回る点を記録し、改善対象として残す。目安を全件達成と偽装しない。
128小節は追加耐久であり16msを新たな必須閾値にしない。同期編集p95は保存前21.7/保存後22.1ms、CMM13.2/13.0ms、Staff269.9/268.8msで完了。CMM相対比は約1.9倍だが、絶対時間・線形サイズ・入力保持・例外ゼロから操作不能/異常増幅/重大な退行は検出していない。128のコピー/validation短縮は後続改善候補であり、安全検証やUndoを省略していない。

### 35項目の受入分類

PASSはM1 coreと今回の自動試験範囲。右列のUI・実機・統合を実装/検証済みとしない。特に実OS日本語IME、Safari、実プリンター、五線印刷、TAB、Inspector、明示移調は未実装/未検証。

| # | 項目 | M1自動検証 | M2/M3または後続（未実装/未検証） |
|---|---|---|---|
| 1 | 音価変更 | PASS：pitch/ID/onset不変、duration変更 | Inspector UI |
| 2 | 休符挿入 | PASS：gap内の新rest、周囲不変 | gap選択UI |
| 3 | 休符変更 | PASS：非ripple延長・Undo | 休符UI |
| 4 | note/rest | PASS：ID/時刻保持、明示pitchで復帰 | 編集UI |
| 5 | overlap | PASS：全拒否、draft/history/raw不変 | UI拒否案内 |
| 6 | 小節越境 | PASS：切り詰めず拒否 | 編集UI |
| 7 | 短縮 | PASS：gap導出・次音不動 | gap表示UI |
| 8 | 延長 | PASS：接触成功・重複拒否 | 編集UI |
| 9 | gap保持 | PASS：240/180例のblur/JSON/Save/Load保持 | 実機確認 |
| 10 | Undo/Redo | PASS：8commandの原子的復元・単一履歴 | 新UI統合 |
| 11 | Save/Load | PASS：8/32/64/128保存後と再読込後の五線/CMM | 実環境耐久 |
| 12 | v1 migration | PASS：exact MIDI/onset/duration保持 | 実曲追加確認 |
| 13 | idempotency | PASS：同raw同ID・原文重複なし | なし |
| 14 | stable ID | PASS：削除/並替/Undo/再読込 | 複製/移動UI |
| 15 | 音高保持 | PASS：B/Capo2/Cb/B#/上下octave | 実機譜読 |
| 16 | key/capo | PASS：独立metadata・実音保持 | 明示移調/実音保持の意図選択UI |
| 17 | A/B分離 | PASS：draft/履歴/歌詞一時状態を分離 | 新パネル統合 |
| 18 | stale | PASS：旧世代/forged/Save前結果を拒否 | 新パネルcallback |
| 19 | IME | PASS：合成composition/native/domain Undo・入力保持 | 実OS日本語IME/Safari・新UI |
| 20 | no-write | PASS：移行/表示/診断で非保存、reload前後の記録保持 | 新UI確認操作 |
| 21 | invalid | PASS：元のJSON不能値/型/ID/tick拒否、診断からcancel回復 | 新UI拒否案内 |
| 22 | unsupported | PASS：160tick保持、非4/4のv1互換、future拒否 | 対応拡張なし |
| 23 | print | PASS：メロディ→従来コード譜fallback・非保存 | 五線印刷/実プリンター |
| 24 | 他機能非干渉 | PASS：Pre-DTM全出力の固定時計下厳密一致 | main統合回帰 |
| 25 | 性能 | PASS：64小節16ms/500ms目標PASS、128追加耐久完了 | 128の同期編集短縮・比較目安の継続改善 |
| 26 | ドレミ往復 | PASS：手動180tick/rest/ID保護、危険な音数変更拒否 | 明示再配置UI |
| 27 | 部分確認 | PASS：durationのみ確認・他属性未確認 | 未確認警告UI |
| 28 | 小節確認 | PASS：gap→rest含め1Undo | 確認UI |
| 29 | 履歴容量 | PASS：公開前拒否・Redo/text group不変 | 容量案内UI |
| 30 | 保存競合 | PASS：exact raw更新/削除を混合せず拒否 | 実タブ/実機組合せ |
| 31 | 保存失敗 | PASS：quota/index復旧失敗/result-unknown保持 | 実環境耐久 |
| 32 | 原文復元 | PASS：空白含むrawとhash保持・不変、未知構造は拒否 | 原文取出しUI |
| 33 | fragment | PASS：source event/barへの対応・gap/rest分離 | fragmentクリック編集 |
| 34 | 無変更 | PASS：既確認の同値は履歴なし | 新パネル開閉 |
| 35 | 旧consumer | PASS：canonical直接読み拒否・明示adapter・v1互換 | 新consumer追加時も継続 |

### Git・依存関係・次工程

専用branch codex/studio-schema2-foundation-v1、base dbd9a46fe61ebf9583c289ff38a15e81c3abeaef。remote mainは10296dbb245fbe9eec9f789635e961c29c5f6917へ独立進展。78pathを監査し、Studio重複/Shared製品変更は0、Shared試験の差分はPort import cache key。NEWS表示/Port1.23.1の変更を無視せず、現topicの実source1.23.0との整合と区別する。

公開直前のfresh remote監査ではmainがさらに`7cf2f02a65e05198cceead49d0d31df14ccfd8ae`へ進展。親は10296dbb、差分9pathはNEWS WorkerのみでStudio/Shared/Portとの重複なし。topic modeの許容noticeとして扱い、旧base・既存branchを変更せず継続する。mainへ取り込んだ候補とは主張しない。

正式topic modeは旧baseからのdevelopment/commit/topic pushをremote-main-advanced notice付きで許可する。mainを自動merge/rebaseしない。次のmain統合には最新main基準の隔離候補とPort version mirror/cache整合、全回帰、別承認が必要。
公開範囲は限定commitと通常topic pushのみ。main push/PR merge/deploy、shared write、Pro/Account/Authority/Sync操作、Daybreak probeを含まない。原本9hash・旧root・既存Studioを保護する。
証拠：`/Users/murakamimasakuni/.codex/visualizations/2026/10/10/01a1244d-3cb2-7043-bd29-981e371b1ae2/schema2-publication-20261016`。Node/Browser log、全sample performance-final.json、schema2-storage-audit.json、sizes.json、start/final manifest、Git gateと最終receiptを参照。以下は過去の停止履歴であり、最新受入判定と混同しない。

## 2026-10-16 Data Amplification & Performance Recovery：停止記録

**M1未受入。RangeErrorとデータ増幅は修復。Node 1051 PASS（FAIL/skip 0）、Browser 460 PASS／2 FAIL／skip 0。ただし128小節の同期編集・変換性能が未達で、終了時にはremote mainの進行も検出した。差分を保持し、stage・commit・topic pushは行わない。**

### 開始・停止の保全

- worktree `/Users/murakamimasakuni/Desktop/2.AI_Work/Cruise_apps_worktrees/studio-schema2`、branch `codex/studio-schema2-foundation-v1`、HEADは開始・停止とも `dbd9a46fe61ebf9583c289ff38a15e81c3abeaef`。common directoryは `/Users/murakamimasakuni/Desktop/2.AI_Work/Cruise_apps/.git`。
- 開始fresh remote mainは期待HEADと一致、専用topicなし。停止前のfresh mainは **`10296dbb245fbe9eec9f789635e961c29c5f6917`**、topicなし。ユーザー指定のremote divergence停止条件を優先する。汎用topic development gateの `remote-main-advanced` noticeを継続許可として扱わない。
- 前回 `/private/tmp/cruise-schema2-recovery-20261015/` は開始時に存在せず、前回停止receiptの再読込は不可能。57ファイルのパスと保護原本9hashは照合したが、前回57ファイル全体とのbyte一致は未証明。今回開始時の全57ファイル・SHA-256・diffを永続作業フォルダへ退避した。
- Git registrationは明示された元のclean baseから再構成し、その事実をplanに記載。実際の再開時57差分は別manifestで保存し、cleanだったと偽らない。
- main root HEAD `32f4058cbb9e93ca743b89cdefda5a0da50ff771` とstatus、既存Studio worktree HEAD/status、原本9hashは不変。worktree inventoryには外部作業の `codex/ikebe-permission-tracking` が追加されていた。当工程では作成・操作していない。
- 既存8765/8766、他owner、NEWS、shared、Worker、Pro/Account/Authority/Syncは非変更。禁止旧repositoryへアクセスしていない。Studioは0.39.0候補／schema 2候補を維持。

### 直接原因と4種類のデータ境界

旧converterは各eventのsourceLocationとprovenanceから同じsourceを参照し、そのsourceに保存raw全文 `baseRevision` を持たせていた。`convertV2` の結果全体JSON複製が共有参照を反復展開し、イベント数×保存raw長の増幅を作った。64小節保存後はrawが3,586回出現する構造で、JSON文字列は約633,609,249文字となる計算。128小節では6,914回・約2,426,131,118文字。巨大文字列を再確保せず、raw=nullの同形グラフとescape後のraw長から厳密計算した（旧例外の再現自体は前回記録）。

| 層 | 現在の所有・複製契約 |
|---|---|
| 保存用Project | schema 2全体。復元用legacySource原文を保持し、8MiB全体予算にも含める |
| Undo snapshot | 音楽内容とprovenance。固定metadataとlegacySourceを履歴から除外。自分が作成したdeep frozen原文backupだけを共有し、履歴容量の事前拒否を維持 |
| 変換DTO／CMM | 元Projectを正式validatorへ通した後、音楽dataのみ選択。DTOは保存用Projectではない。深くfreeze済みのbarsだけ共有し、mutable入力は別コピー。結果全体のJSON複製を撤去 |
| notation model | event/bar ID、音価、音高、rest、必要な由来を参照。保存raw／Project全体を埋め込まない |

exact raw revisionは変換サービスのprivate WeakMap（発行result→raw）に一度保持し、切詰め・hash置換しない。公開sourceは軽量identityだけ。project/session/document generation/snapshotVersion/workspace generationと実repository rawを照合し、偽造・コピー・別サービス結果を拒否する。A→B→A、Undo/Redo、別編集、Save後revision更新で旧resultは採用不可。

IME中の直前確定表示の一時保持は `canRetain(result)`、最新結果の採用は `isCurrent(result)` に分けた。前者はpending入力と旧snapshotVersionを許すが、同一session/project/generation/workspaceとexact rawの一致は必須。最新採用の条件は緩めない。既存IME回帰でこのconsumerの修正漏れを検出し、修正後のIME対象36件はPASS、全suiteを再実行した。

### サイズ・原文保持・大規模反例

単位UTF-8 bytes。Projectは移行後／working snapshot／Repository保存rawで同サイズ。legacy rawは元v1 JSONと同サイズ。CMM・notationは保存前後で同サイズ。

| 小節 | 元v1／legacy raw | schema 2 Project | 変換DTO | CMM | notation |
|---|---:|---:|---:|---:|---:|
| 8 | 5,107 | 21,192 | 18,562 | 172,027 | 11,153 |
| 32 | 17,011 | 75,717 | 71,015 | 690,028 | 44,247 |
| 64 | 32,883 | 148,325 | 140,871 | 1,380,269 | 88,311 |
| 128 | 64,657 | 295,140 | 282,174 | 2,694,624 | 177,745 |

CMMのnote単体は約1,487〜1,499bytesでraw全文を持たない。小節増加にほぼ線形。8/32/64/128すべてで保存前後のlegacy raw SHA-256が一致し、Save/Load後・Undo/Redo後・A/B後も正確なID/pitch/onsetを確認した。512KiBの空白を含む原文も完全保持。復元元parsed dataも含めて8MiBを超える入力は原文を捨てず拒否する。

### 同期編集profileと残るボトルネック

64小節・20回のBrowser instrumented profile。平均ms（inclusive時間は重複するので合算不可）。旧Session/schema/sheetと新実装を、どちらも修正後converterで比較し、raw増幅を測定から分離した。

| 処理 | 旧平均ms／回数 | 新平均ms／回数 |
|---|---:|---:|
| command重複全Project validation | 6.660／1 | 撤去（Session正式validationは維持） |
| Session正式validation | 4.095／3 | 2.510／2 |
| strict JSON検査 | 7.300／10 | 1.095／4 |
| clone（inclusive） | 11.865／25 | 5.730／8 |
| content snapshot（inclusive） | 6.210／4 | 3.530／3 |
| staged draft（inclusive） | 3.980／3 | 1.655／2 |
| prepareContent（inclusive） | 6.885／2 | 0.840／1 |
| 履歴byte計算 | 0.580／2 | 0.575／2 |
| UI通知（inclusive） | 7.610／1 | 2.570／1 |

開始時に作って捨てるstaged draft、Proxy越しの重複validation、原文backupの反復コピーを除いた。schema 2のviewは所有されたworking snapshotから読む。schema 1は既存draft readerを維持。元入力のvalidatorをlossy cloneより前に適用し、非JSON数・accessor・symbol・hole等の拒否を保つ。公開時にstaged draftを再コピーするため、操作後に保持されたhandleから正本を書き換えられない。

残りはProject全体の正式検証、content snapshot、staged/publicationの独立cloneとfreeze、schema 2から旧read projectionを経るCMM生成。64小節Node instrumented変換では20回合計でworking snapshot約85.8ms、schema validation約85.2ms、prepare自己時間約30.0ms。Browserの非計装性能値とは比較しない。安全性を省くcacheやrevision短縮は導入していない。次回は128小節でimmutable snapshot共有の所有権・descriptor迂回の検出を設計し、validator／history原子性を保ったまま全体コピー回数を減らす必要がある。これは未実装の改善候補。

### 性能：同一fixture・20回

Chrome 155.0.8059.40 / Node v24.14.0 / darwin arm64、1440×1000。baselineはdbd9a46の0.38.1をgit archiveで隔離読込。4/4、各小節4四分音符・4歌詞・C・基本strum、同一raw。3回warmup後20回、他の回帰と同時実行しない。各セル **p50 / p95 / max ms**。commandは先頭noteの240/480tick変更と同期subscriber通知、staffは全小節pitch変更後の実描画、conversionはready後の新規convert。Save後は23回のSaveと再読込後。各sampleも証拠JSONに保存。

| 版 | 小節 | 状態 | 同期command | CMM変換 | Staff更新 |
|---|---:|---|---:|---:|---:|
| 0.38.1 | 8 | 保存前 | 0.6/0.7/0.7 | 0.5/0.5/0.6 | 16.1/16.6/16.6 |
| 0.38.1 | 8 | 保存・再読込後 | 0.6/0.7/0.8 | 0.4/0.5/0.6 | 16.2/17.3/17.5 |
| 0.38.1 | 32 | 保存前 | 1.6/2.0/2.1 | 1.6/1.8/1.8 | 48.7/49.4/50.9 |
| 0.38.1 | 32 | 保存・再読込後 | 1.5/1.7/1.8 | 1.6/1.8/1.8 | 49.8/50.7/51.2 |
| 0.38.1 | 64 | 保存前 | 2.8/3.1/3.2 | 3.1/3.7/3.7 | 112.2/126.3/126.6 |
| 0.38.1 | 64 | 保存・再読込後 | 2.8/3.2/3.3 | 3.2/3.7/3.8 | 112.5/125.9/127.2 |
| 0.38.1 | 128 | 保存前 | 4.7/5.4/5.4 | 5.8/7.3/7.8 | 272.1/274.6/276.2 |
| 0.38.1 | 128 | 保存・再読込後 | 5.2/5.4/5.5 | 6.0/7.2/7.5 | 272.3/274.6/276.1 |
| 0.39.0 | 8 | 保存前 | 1.7/1.8/1.9 | 0.7/0.8/0.8 | 14.8/16.3/17.2 |
| 0.39.0 | 8 | 保存・再読込後 | 1.7/1.9/2.1 | 0.6/0.7/0.7 | 15.1/16.6/16.7 |
| 0.39.0 | 32 | 保存前 | 5.1/5.4/5.6 | 2.2/2.6/2.8 | 44.2/45.8/45.9 |
| 0.39.0 | 32 | 保存・再読込後 | 5.1/5.3/6.5 | 2.3/2.5/2.6 | 43.1/44.8/45.3 |
| 0.39.0 | 64 | 保存前 | 9.9/10.7/11.5 | 4.7/6.0/9.0 | 103.0/105.4/105.8 |
| 0.39.0 | 64 | 保存・再読込後 | 10.1/11.4/11.7 | 4.5/5.9/6.8 | 102.4/104.4/106.2 |
| 0.39.0 | 128 | 保存前 | 20.6/23.2/24.0 | 9.0/13.9/14.6 | 266.6/269.8/271.1 |
| 0.39.0 | 128 | 保存・再読込後 | 21.0/22.9/24.4 | 9.6/12.8/13.0 | 267.4/270.3/285.4 |

| 版 | 小節 | migration | 明示Save | Load |
|---|---:|---:|---:|---:|
| 0.38.1 | 8 | 0.0/0.1/0.4 | 0.6/1.0/1.0 | 0.1/0.1/0.1 |
| 0.38.1 | 32 | 0.1/0.2/0.4 | 1.4/2.0/2.1 | 0.2/0.3/0.3 |
| 0.38.1 | 64 | 0.1/0.2/0.3 | 2.2/2.9/3.0 | 0.3/0.4/0.4 |
| 0.38.1 | 128 | 0.2/0.3/0.4 | 10.8/11.8/11.9 | 0.6/0.7/0.7 |
| 0.39.0 | 8 | 0.3/0.4/0.5 | 2.8/3.3/3.4 | 0.5/0.6/0.6 |
| 0.39.0 | 32 | 0.7/0.8/1.0 | 8.8/9.3/9.4 | 1.7/2.4/2.4 |
| 0.39.0 | 64 | 1.3/1.5/1.5 | 21.5/22.7/22.7 | 3.5/4.0/4.1 |
| 0.39.0 | 128 | 2.6/2.9/3.0 | 41.8/42.3/42.7 | 6.5/7.0/7.1 |

baseline migrationはv1 normalization、候補はv1→2実移行であり処理内容は異なる。Save/Loadは同じ明示Repository/Session経路。64小節のcommand p95は保存前10.7／保存後11.4ms、Staffは105.4／104.4msで絶対目標を満たす。128小節commandは23.2／22.9msで16ms未達。CMM p95比は64小節1.62／1.59倍、128小節1.90／1.78倍。Staffは全小節数で概ねbaseline以下だが、変換・同期処理の未達を平均や描画との合算で隠さず、性能ゲートFAILとする。128小節も処理は終了し、無限待機・RangeErrorはない。

### 新規実行した回帰・35項目

Node全suite **1051 PASS／FAIL 0／skip 0**。Browser正規15＋Structure conversion＋Melody Staff＋schema 2の全18ファイル **460 PASS／FAIL 2／skip 0**。一時loopback・使い捨てChrome、正式443Hz WAV（44.1kHz mono16bit／8秒）を使用。console/unhandled/application404/禁止通信0。fonts CSSは隔離harnessで空応答、service workerは無効。Browser request guardの拒否ログなし。各no-write assertionと性能測定の明示Save前raw一致もPASS。

schema migration/idempotency/exact MIDI/onset/duration、direct schema 2 load、JSON import/export、conflict/quota/result-unknown、invalid原本拒否、8MiB/history予算、単一Undo原子性は今回の全Node/Browserで再検証。新規大規模4件、原文容量、source保持と採用の区別はPASS。非JSON破損draft試験では診断box表示・旧staff除去までPASSしたが、折りたたまれたdetails本文をinnerTextで検査し、/non-json-number/が見つからずFAIL（子1＋親1）。続くraw不変・Save拒否・cancel復元は当該Browserケースでは未到達。コード上はdetails内に診断を設定しているため、まずdetailsを開いてから検査するfixture修正が候補だが、remote停止条件検出後につき未修正。Nodeのinvalid/save原子性結果をこの未実行Browser assertionの代用にはしない。

以下は同じ正式35項目を今回の実測へ更新した分類。UI・実機残件をcore PASSに含めない。

| # | 契約項目 | 今回の確認／判定 | M2＋M3へ残す範囲 |
|---|---|---|---|
| 1 | 音価変更 | M1 core PASS：pitch/ID/onset不変、durationのみ変更 | 編集パネル |
| 2 | 休符挿入 | M1 core PASS：gap内のrest、新ID、周囲不変 | gap選択UI |
| 3 | 休符変更 | M1 core PASS：rest延長と非ripple／Undo | 休符編集UI |
| 4 | note/rest | M1 core PASS：ID・時刻保持、note復帰は明示pitch必須 | UI |
| 5 | overlap | M1 core PASS：全拒否、draft/history/raw不変 | UI拒否表示 |
| 6 | 小節越境 | M1 core PASS：切詰めず拒否 | UI |
| 7 | 短縮 | M1 core PASS：gap導出、次音不動 | gap表示 |
| 8 | 延長 | M1 core PASS：接触許可／overlap拒否 | UI |
| 9 | gap保持 | M1 core PASS：240/180例、blur/JSON/通常Save往復 | 実機統合 |
| 10 | Undo/Redo | M1 core PASS：8 command、内容/ID/由来の原子的復元 | 編集パネル経由の履歴 |
| 11 | Save/Load | M1 core/Browser PASS：8/32/64/128小節のSave後・再読込後も描画完了 | M1性能とremote条件の解決は別ゲート |
| 12 | v1 migration | M1 core PASS：MIDI/onset/duration一致 | 多数の実曲確認 |
| 13 | idempotency | M1 core PASS：同raw同ID、v2再読込で原文重複なし | なし（M1範囲） |
| 14 | 安定ID | M1 core PASS：削除・並替え・Undo・再読込。Browser先頭削除 | 複製/移動UI |
| 15 | 音高保持 | M1 core PASS：B/Capo2、Cb/B#、上下octaveの一致 | 実機譜読確認 |
| 16 | key/capo | M1の実音独立・metadata変更はPASS。明示移調UIは未実装 | 実音保持/移調意図選択と+2移調 |
| 17 | A/B分離 | M1 core/Browser PASS：内容・Undo・歌詞ローカル状態を分離 | 新編集パネルを含む統合 |
| 18 | stale | M1 core/Browser PASS：旧generation/forged envelope拒否 | パネルcallback統合 |
| 19 | IME | 自動試験PASS：composition拒否/保持、native/domain Undo、focus/caret | 実OS日本語IME操作は未検証。新編集UIとの実機試験 |
| 20 | no-write | M1 core/Browser PASS：読込・移行・描画・選択で非保存 | 新UIの確認候補操作 |
| 21 | invalid | M1 core／既存Browser PASS。新規非JSON診断fixture FAIL、後続のSave拒否・cancel未到達 | 新UI拒否表示 |
| 22 | unsupported | M1 core PASS：160tick保持と確認拒否、非4/4はv1互換、非480/future拒否 | 対応拡張は今回なし |
| 23 | print境界 | 既存Browser PASS：メロディ→コード譜fallback、データ不変 | 新編集UI非印刷・実印刷cancelの実機確認 |
| 24 | 他機能非干渉 | M1 core/Browser PASS：Pre-DTMの音高/時刻/伴奏一致、owner非書込 | 本番統合回帰 |
| 25 | 性能 | FAIL：増幅・保存後例外は解消。128小節command p95 23.2ms、変換p95 baseline比最大1.90倍 | M1停止条件。M2へ持ち越してPASSにしない |
| 26 | ドレミ往復 | M1 core/Browser PASS：手動180tick、rest、IDを保持。音数変更は拒否 | 音数変更を伴う明示再配置UI |
| 27 | 部分確認 | M1 core PASS：durationのみ確認し他属性は未確認のまま | 部分未確認の表示UIは未実装 |
| 28 | 小節確認 | M1 core PASS：gap→restを含め1Undo | 確認UIは未実装 |
| 29 | 履歴容量 | M1 core PASS：公開前拒否、既存Redo/開いたtext group保護 | UI容量表示 |
| 30 | 保存競合 | M1 core/Browser PASS：raw外部更新／削除で混合せず拒否 | 実タブ/実機組合せ |
| 31 | 保存失敗 | M1 core PASS：quota/index復旧失敗、dirty/base/history保護 | M3の実環境耐久確認 |
| 32 | 原文復元 | M1 core PASS：許可されたv1の空白を含むrawを完全保持。未知構造は変換拒否・元raw不変 | 原文取出しUIは未実装 |
| 33 | 記譜fragment | M1 core PASS：fragment→source event/bar IDの対応 | fragmentクリックから編集するUIは未実装 |
| 34 | 無変更操作 | M1 core PASS：既確認の同値commandは履歴なし。未確認→確認は意味変更 | パネル開閉の試験はUI実装後 |
| 35 | 旧consumer | M1 core PASS：canonical bar直接読み拒否、明示readProjectionとv1互換 | 引き続き新consumer追加時に強制 |

検証根拠：`tests/schema2.test.mjs`、`tests/schema2-compat.test.mjs`、`tests/schema2.browser.cjs`と、上記18 Browserファイル／Node全suiteのログ。特にpartial/未実装のUI・実機項目をPASSへ読み替えない。


### Gitゲート・停止receipt・引き継ぎ

開始development gate PASS。停止時development gateはowner/index/branch条件PASS＋remote-main-advanced notice。ただしユーザー個別契約のremote main一致条件はFAIL。Browser FAILも停止条件。commit gate／postcommit／push gateは前提未達のため未実行。staged空、追加commit SHAなし、topic pushなし、main統合・deployなし。差分は巻き戻していない。

開始57ファイルをすべて保持し、最終差分はStudio内60ファイル（追加の変更対象はCOMMON_MUSIC_MODEL文書、性能runner、大規模回帰testの3件）。trackedの `git diff --check` はPASS。untrackedも別検査したところ、開始時から同一hashの正式契約本文 `MELODY_DURATION_REST_CONTRACT.md` 586–587行のMarkdown改行用末尾空白2件を検出した。停止後につき本文は変えず、全対象のwhitespace gateは未達として記録する。

M2＋M3（音価・休符編集UI、fragment選択、明示移調意図、実OS日本語IME、実印刷確認等）へ未着手。次工程は新remote mainを含めたユーザーのbaseline決定、失敗したBrowser診断fixtureと後続assertionの確認、M1性能回復。推奨モデル：Sol、推論：高。残る対象はSession clone/validationの明確な保存安全性境界で、通常実装より厳密な回帰が必要。

証拠保存先：`/Users/murakamimasakuni/.codex/visualizations/2026/10/14/01a13a33-b638-7f83-93d9-945d43b59e03/schema2-performance-recovery-20261016`。`start.json`／`start-files`、`sizes.json`、`browser-profile.json`、`conversion-profile-final.json`、`performance-final.json`（全sample）、`node-final.log`、`browser-full.log`、`observations-stop.json`、`protection-final.json`、`final-manifest.json`、`stop-receipt.json`を参照。前回の消失したtmp証拠と区別する。

## 2026-10-15 Browser Compatibility Recovery：停止記録

**判定：M1未受入。元のBrowser 19 FAILは解消したが、性能試験でP1を再現したため停止。commit・topic pushなし。**

- 作業場所：`/Users/murakamimasakuni/Desktop/2.AI_Work/Cruise_apps_worktrees/studio-schema2`
- branch：`codex/studio-schema2-foundation-v1`
- 開始／終了HEAD：`dbd9a46fe61ebf9583c289ff38a15e81c3abeaef`
- Git common directory：`/Users/murakamimasakuni/Desktop/2.AI_Work/Cruise_apps/.git`
- fresh remote main：開始／終了とも上記HEAD。remote topicは存在しない。
- main root HEAD：`32f4058cbb9e93ca743b89cdefda5a0da50ff771`。作業前後でHEAD・status不変。
- 開始差分55ファイル（tracked 47／untracked 8）を保持。回復修正でStudio内のChord Inspector/read-modelの2ファイルを追加し、終了57ファイル。staged空。
- Studioは**0.39.0候補／schema 2候補**のまま。同じ未公開minor工程の回復であり追加のpatch bumpはしない。
- 他モデルのレビュー結果を根拠にせず、実装・正式契約・実測に基づく。

### 新たな停止理由：P1

**64小節を明示保存すると、五線変換が `RangeError: Invalid string length` で停止する。**

`js/core/common-music-model.js` の `convertV2` は、v1 converterが返す結果全体を `JSON.parse(JSON.stringify(r))` で複製する。v1結果の各イベントのsourceLocation／provenanceは、同じsource（baseRevisionに保存raw全文を含む）を共有している。JSON化で共有参照が各イベントに展開されるため、曲の長さと保存rawサイズに応じて複製が増える。schema 2の明示保存後はrawが大きくなり、今回の64小節fixtureでは文字列長上限に達した。RangeErrorの直接発生箇所は同ファイル45行。

再現条件：1440×1000、4/4・480 PPQ、64小節、各小節Cコード・4個の四分音符・4個の歌詞、基本ストロークあり。同じv1 rawを読み込んでschema 2へメモリ移行→メロディ表示→音価／音高編集→明示保存。保存自体とrepository再読込は成功したが、その後のstaff readyが30秒以内に成立せず、独立再現で上記例外を確認した。保存データ破壊を確認したものではない。

改善案（**未実装**）：

1. 結果全体のJSON複製を廃止し、変更するmodel／measure／event／sourceLocationだけを構造的にコピーする。immutableなsourceは共有したまま維持する。
2. raw一致・generation・snapshotVersionによるstale保護を維持する。rawの切捨て、validator緩和、例外の握りつぶしで回避しない。
3. 同じ64小節の保存後再描画を正式Browser回帰へ追加し、保存前／保存後の両方で20回測定する。
4. 同期command p95の超過は別途profileし、重複する全体検証／snapshot生成を調査する。これは調査候補であり、今回まだ単独原因を確定していない。

**性能も受入目安を超過**：64小節command p95 30.3ms（目安16ms）、全小節更新507.9ms（500ms）、baseline比3.97倍（概ね1.5倍）。したがってBrowser機能回帰だけで受入／公開へ進めない。

### 回復した製品側の境界

- 歌詞の拍分割：schema 2はSessionをWeakMapのkeyとし、その内側でstable bar IDに紐づける。派生bar viewを再生成しても設定を保つ。v1は既存経路を維持。Undo/Redo・A/B分離を確認。Projectには保存しない。
- 小節削除：再番号後のbarNumberではなく、削除前の選択bar IDが残っているかで判定する。
- 旧bar-only reader：canonical barを旧step形式として読ませず、明示readProjectionを要求する。正当なv1入力は引き続き許可。
- invalid draft：schema validationのtyped `invalid-project`だけを表示境界で受ける。古い紙面／五線／Chord詳細を除去し、利用者向け理由と詳細診断を分ける。想定外例外は隠さない。
- 不正IMEドレミ：文字列を入力DOMに保持し、正本／履歴／rawを変更しない。拒否診断がcomposition終了通知で「保存済み」に戻らないよう、Session＋入力DOMに限定した非永続診断を保持する。訂正後に解除する。
- schema 2のkey/capo/拍子入力はM1では表示専用。未実装の移調意図UIを有効化しない。schema 1互換曲のkey編集・ドレミ・Undo/Redoは別試験で維持を確認。

Chord本体、Rhythm本体等のownerコードは変更していない。Studio内のadapter／Inspectorとfixtureを変更した。

### 元の14件と親5件の分類

修正ownerはすべてStudio（`apps/cruise-studio`）。共通再現方法は、当該suiteを隔離loopback・使い捨てChromeで実行すること。Chord suiteは同一曲を共有しているため、先行FAILによる後続への影響も含めて評価した。元の19件をすべてfixture不備とは扱わない。

**1. `dirty external update cannot replace Inspector draft or advance base`**（`chord-presentation.browser.cjs`）

- fixture：saved schema 2 / dirty Cm7
- 入力：外部G7を旧{tick:0,symbol}で上書き
- 期待／旧実測：保存成功、Inspectorはdirty Cm7維持 ／ unknown-field:tickでfixture保存拒否
- 直接原因：schema 2へschema 1 chordを注入
- 共通原因／分類：旧shapeの直書き ／ fixture
- 具体的修正：外部snapshotはmodel.setBarChordで更新
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/chord-presentation.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：既存保存・外部更新試験で再検証

**2. `explicit cancel/adopt and clean external change update Inspector`**（`chord-presentation.browser.cjs`）

- fixture：直前の外部更新fixtureを共有
- 入力：cancel/adopt
- 期待／旧実測：G7→clean外部Dm7 ／ Cm7のまま
- 直接原因：先行fixtureの外部G7作成が失敗し後続操作に到達しない
- 共通原因／分類：先行FAILの状態連鎖 ／ cascade（fixture起点）
- 具体的修正：前項の外部fixture修正
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/chord-presentation.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：独立assertは維持

**3. `Structure Escape clears selection and old chord detail`**（`chord-presentation.browser.cjs`）

- fixture：前項共有曲
- 入力：Structure Escape
- 期待／旧実測：選択解除、再選択Dm7 ／ Cm7
- 直接原因：clean外部Dm7が作られていない
- 共通原因／分類：先行FAILの状態連鎖 ／ cascade（fixture起点）
- 具体的修正：前項の外部fixture修正
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/chord-presentation.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：既存Escape・選択試験を維持

**4. `multiple chord events are explicit; no arbitrary first chord`**（`chord-presentation.browser.cjs`）

- fixture：canonical barに2 chord
- 入力：旧tick形式C/Gを直接draftへ代入
- 期待／旧実測：multiple、任意の先頭表示なし ／ ready
- 直接原因：不正canonical shape。Session操作の正式経路でもない
- 共通原因／分類：旧shapeの直書き ／ fixture
- 具体的修正：stable ID/onsetTick/durationTicksを持つ2イベントを1 runOperationで設定
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/chord-presentation.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：既存multiple試験を維持

**5. `IME buffer and just-composed keys preserve draft ownership and focus`**（`chord-presentation.browser.cjs`）

- fixture：共有曲、先行外部更新が失敗
- 入力：IME composition中にキー操作
- 期待／旧実測：Dm7/IME ownership維持 ／ Cm7
- 直接原因：期待Dm7の前提不成立。assert中断でcomposition後処理に進まない
- 共通原因／分類：先行FAILの状態連鎖 ／ cascade（fixture起点）
- 具体的修正：外部fixtureを修正しIME操作assertは維持
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/chord-presentation.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：IMEの正負・重複input試験を別suiteで追加

**6. `pane close/reopen, Escape and Modal ownership keep Structure editing intact`**（`chord-presentation.browser.cjs`）

- fixture：前IME試験途中の共有状態
- 入力：pane close/reopen、Escape、Modal
- 期待／旧実測：pane非表示false ／ true
- 直接原因：先行IMEテストが途中終了しpending input/focus所有が残留
- 共通原因／分類：先行FAILの状態連鎖 ／ cascade（fixture起点）
- 具体的修正：fixtureの前提を復旧
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/chord-presentation.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：既存pane/modal/focus試験を維持

**7. `four themes and narrow/normal/large pane remain readable without focus traps`**（`chord-presentation.browser.cjs`）

- fixture：前IME失敗からの共有状態
- 入力：Em7編集、4テーマ/3幅
- 期待／旧実測：Em7 ／ Cm7
- 直接原因：IME pendingを残した先行中断で編集前提不成立
- 共通原因／分類：先行FAILの状態連鎖 ／ cascade（fixture起点）
- 具体的修正：fixtureの前提を復旧
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/chord-presentation.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：既存4テーマ/幅の検査を維持

**8. `deleted bar cannot leave old chord details visible`**（`chord-presentation.browser.cjs`）

- fixture：選択した第1小節
- 入力：旧barNumberで削除
- 期待／旧実測：deleted、古い詳細を消す ／ ready
- 直接原因：canonical barはbarNumberを持たず旧fixtureは対象を消さない。IDで正しく削除した再試験でも製品が再番号後の番号で消失を判定
- 共通原因／分類：旧shape直書き＋stable identity不足 ／ fixture＋製品bug
- 具体的修正：fixtureでbar ID/関連参照を1操作削除。製品は削除前のIDの存否で選択消失判定
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/chord-presentation.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：元のdeleted試験で修正後再現を確認

**9. `50 mount/dispose cycles release selection and lifecycle listeners`**（`chord-presentation.browser.cjs`）

- fixture：先行不正chordを含む共有draft
- 入力：Inspector mount/dispose50回
- 期待／旧実測：例外ゼロ、listener漏れなし ／ unknown-field:tick例外
- 直接原因：先行fixtureの不正draftがreadProjectionに到達。製品にもtyped invalid表示境界が不足
- 共通原因／分類：旧shape直書き＋invalid描画保護不足 ／ fixture起点＋製品防御不足
- 具体的修正：fixture正式化、invalid-projectのみを捕捉しInspector invalidで詳細消去
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/chord-presentation.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：invalid draft/cancel回復のBrowser試験を追加

**10. `redraw doremi uses current domain snapshot after Undo/Redo`**（`domain-undo-ui.browser.cjs`）

- fixture：schema 2のドレミ
- 入力：入力→domain Undo/Redo、期待文字列生成
- 期待／旧実測：UI ドレ とcanonical対応の期待値一致 ／ UI ドレ / 旧readerから期待ドド
- 直接原因：旧bar-only formatterをcanonical barへ直接渡しstep欠落を0扱い
- 共通原因／分類：旧consumer境界の曖昧さ ／ fixture＋製品API防御不足
- 具体的修正：期待値は明示readProjection経由。旧bar-only APIはcanonical barを明示拒否
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/domain-undo-ui.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：canonical拒否/v1受入/派生viewの読み取りNode追加

**11. `No console errors or failed HTTP requests`**（`editing-session.browser.cjs`）

- fixture：保存済み曲のBPMを不正値にしたdraft
- 入力：BPM -1→保存拒否
- 期待／旧実測：console/HTTP errors=[] ／ console invalid-bpm
- 直接原因：schema 2 readProjection validatorの例外がSession表示購読から漏れる
- 共通原因／分類：invalid描画保護不足 ／ 製品bug
- 具体的修正：typed診断のみ捕捉、code/staffのstale譜面を消し理由＋詳細診断を表示
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/editing-session.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：raw/base保持、save拒否、cancel回復をBrowserで追加

**12. `local lyric beat resolution survives nonstructural draft publication`**（`structure-operation.browser.cjs`）

- fixture：歌詞ローカル拍分割を設定した小節
- 入力：非構造metadata編集→再描画
- 期待／旧実測：is-local維持 ／ is-autoへ戻る
- 直接原因：毎回再生成する派生bar objectをWeakMap keyにしていた
- 共通原因／分類：stable identity不足 ／ 製品bug
- 具体的修正：schema 2はSession WeakMap→stable bar ID→拍設定。v1既存経路を維持
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/structure-operation.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：Undo/Redo、A/B分離、Project非保存のBrowser試験追加

**13. `IME single entry and duplicate post-input suppressed: [data-overlay-field=doremi]`**（`structure-text.browser.cjs`）

- fixture：schema 2ドレミ入力欄
- 入力：IMEで日本語を入力、重複post-input
- 期待／旧実測：成功入力1履歴 ／ 0履歴
- 直接原因：schema 2は解析不能ドレミの損失を避けるため拒否。旧成功fixtureが非音楽文字を使用
- 共通原因／分類：schema 1/2意味差を未分離 ／ fixture（拒否は正当）＋追加試験で製品の診断上書きを発見
- 具体的修正：成功fixtureはドレミ。日本語保持・正本無変更・診断持続・訂正解除を別試験
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/structure-text.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：成功/拒否を分けて追加。診断は入力DOM/Session限定で非永続

**14. `section name and select confirmation do not create double text/discrete entries`**（`structure-text.browser.cjs`）

- fixture：schema 2曲のsection/select
- 入力：無効な#sc-play-keyをselectOption
- 期待／旧実測：変更1履歴 ／ disabled timeout
- 直接原因：M1はkey/capoの明示意図UIを未実装としschema 2で表示専用。旧fixtureが操作可能と仮定
- 共通原因／分類：M1範囲と旧fixtureの不一致 ／ fixture（契約通りの制限）
- 具体的修正：有効なoriginalKeyでselect履歴を検証、schema 2 playKey disabledを明示assert
- 再現：隔離loopbackで node --test apps/cruise-studio/tests/structure-text.browser.cjs。元のFAILは前回ログの当該test。chordは前項共有状態を含めsuite順に再現。
- 回帰追加要否：schema 1互換曲のplayKey編集・ドレミUndo/Redoを追加

親FAILの対応：`chord-presentation` → 子1,2,3,4,5,6,7,8,9、`domain-undo-ui` → 子10、`editing-session` → 子11、`structure-operation` → 子12、`structure-text` → 子13,14。計14 leaf＋5 parent＝19。親を独立した19件の製品bugとは数えない。


### 実行結果と証拠

証拠ディレクトリ：`/private/tmp/cruise-schema2-recovery-20261015/`。tmpの証拠は恒久保存物ではない。

| 検査 | 今回の結果 | 証拠 |
|---|---|---|
| Node全suite | **1044 PASS / FAIL 0 / skip 0** | `node-full.log` |
| 正式Browser 15＋Structure conversion＋Melody staff＋schema 2 | **457 PASS / FAIL 0 / skip 0** | `browser/browser.log`、`browser/browser-environment.json` |
| 上記BrowserのConsole/404/禁止通信 | 0 | suite内assert、runnerのnetwork audit |
| 上記Browserのno-write | PASS | Project/index、IDB、Shared等の各suite観測。明示Save用fixtureの期待書込は区別 |
| 性能 | **FAIL** | `performance.json`、`performance64.json`、`performance-summary.json`、各log |
| 性能時の例外 | **RangeErrorあり** | `performance64.log`。上記機能suiteのConsole 0と混同しない |
| Git development | PASS（開始・終了） | `plan.json`、fresh remote観測、`git-safety-final.json` |
| diff --check | PASS | 終了時実行 |
| commit / postcommit / topic push gate | **未実行** | required性能gate失敗のため。PASSとしない |

Browserは既存8765/8766を使用せず、port 0で割当てた独立loopbackを使用。正式443Hz fake WAV、使い捨てChrome context/profile、外部通信遮断。使用したサーバーは終了。既存8766のPython PID25543には操作していない。

schema 1/2の境界は、初期化、正式readProjection、互換編集adapter、Chord、ドレミUndo/Redo、Melody Staff、Pre-DTM、Print、Home/JSONのNode／Browser経路を検証した。v1→v2はno-write、明示Save時のみ同じproject keyに更新。元のMIDI・onset・duration・伴奏の一致試験はPASS。Printは従来のコード譜fallbackであり、五線印刷を実装済みとはしない。

### 性能測定

macOS arm64、Node v24.14.0、Chrome 155.0.8059.40、viewport 1440×1000。baselineは0.38.1／dbd9a46の既存checkoutを読み取り専用で使用。両版で**同一のv1 raw fixture**を使い、同一プロセスのChromeで順番に測定。他のNode／Browser suiteとは同時実行していない。warmup 3回を除き20回、nearest-rank p95、単位ms。baselineのmigrationはv1正規化、candidateはv1→v2移行であり、処理内容が同じとは主張しない。commandは同じ音価変更をbaselineのSession操作／candidateの正式melody command経由で実行。

| 小節 | 版 | migration | command | 1音変更後の五線 | 全小節変更後の五線 | 変換 | Save | Load |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 8 | 0.38.1 | 0.1 | 0.8 | 14.9 | 15.3 | 0.6 | 1.1 | 0.1 |
| 8 | 0.39.0候補 | 0.5 | 4.9 | 27.6 | 29 | 8.1 | 5.2 | 0.7 |
| 32 | 0.38.1 | 0.1 | 1.8 | 46.9 | 46.9 | 1.6 | 1.3 | 0.3 |
| 32 | 0.39.0候補 | 1.3 | 14.9 | 134.4 | 150.4 | 108.3 | 16.1 | 2.3 |
| 64 | 0.38.1 | 0.2 | 3.6 | 110.7 | 127.8 | 3 | 2.5 | 0.4 |
| 64 | 0.39.0候補 | 2.2 | 30.3 | 484.7 | 507.9 | 363.8 | 未完了 | 未完了 |

64小節candidateのmigration／command／描画は20回測定済み。**Save/Loadは最初のwarmup成功後の描画で停止したため20回未完了**。単発値（Save 25.6ms／Load 4.9ms）をp95とは扱わない。8／32小節は全項目20回完了。機能suiteの小規模fixtureだけでは、この保存後の増幅を検出できていなかった。

再現スクリプトは同証拠ディレクトリの `run-performance.py`／`performance.cjs`、64小節の診断版は `run-performance64.py`／`performance64.cjs`。Python runnerはbaselineとcandidateをそれぞれ独立loopbackで公開し、終了時にserverを閉じる。fixture raw・全サンプル・Chrome版はJSONに記録。診断版は例外の再現用で、PASSするテストではない。

### 正式35項目の受入分類

「M1 core PASS」は今回のcore／自動試験の範囲だけを指す。M2の編集UI、M3の実機／最終統合まで合格した意味ではない。**工程全体は#11の保存後描画P1と#25で未受入**。

| # | 契約項目 | 今回の確認／判定 | M2＋M3へ残す範囲 |
| 1 | 音価変更 | M1 core PASS：pitch/ID/onset不変、durationのみ変更 | 編集パネル |
| 2 | 休符挿入 | M1 core PASS：gap内のrest、新ID、周囲不変 | gap選択UI |
| 3 | 休符変更 | M1 core PASS：rest延長と非ripple／Undo | 休符編集UI |
| 4 | note/rest | M1 core PASS：ID・時刻保持、note復帰は明示pitch必須 | UI |
| 5 | overlap | M1 core PASS：全拒否、draft/history/raw不変 | UI拒否表示 |
| 6 | 小節越境 | M1 core PASS：切詰めず拒否 | UI |
| 7 | 短縮 | M1 core PASS：gap導出、次音不動 | gap表示 |
| 8 | 延長 | M1 core PASS：接触許可／overlap拒否 | UI |
| 9 | gap保持 | M1 core PASS：240/180例、blur/JSON/通常Save往復 | 実機統合 |
| 10 | Undo/Redo | M1 core PASS：8 command、内容/ID/由来の原子的復元 | 編集パネル経由の履歴 |
| 11 | Save/Load | 基礎往復PASS。ただし64小節のSave後staff描画FAIL（P1） | P1修正後の統合再試験がM1再開条件 |
| 12 | v1 migration | M1 core PASS：MIDI/onset/duration一致 | 多数の実曲確認 |
| 13 | idempotency | M1 core PASS：同raw同ID、v2再読込で原文重複なし | なし（M1範囲） |
| 14 | 安定ID | M1 core PASS：削除・並替え・Undo・再読込。Browser先頭削除 | 複製/移動UI |
| 15 | 音高保持 | M1 core PASS：B/Capo2、Cb/B#、上下octaveの一致 | 実機譜読確認 |
| 16 | key/capo | M1の実音独立・metadata変更はPASS。明示移調UIは未実装 | 実音保持/移調意図選択と+2移調 |
| 17 | A/B分離 | M1 core/Browser PASS：内容・Undo・歌詞ローカル状態を分離 | 新編集パネルを含む統合 |
| 18 | stale | M1 core/Browser PASS：旧generation/forged envelope拒否 | パネルcallback統合 |
| 19 | IME | 自動試験PASS：composition拒否/保持、native/domain Undo、focus/caret | 実OS日本語IME操作は未検証。新編集UIとの実機試験 |
| 20 | no-write | M1 core/Browser PASS：読込・移行・描画・選択で非保存 | 新UIの確認候補操作 |
| 21 | invalid | M1 core/Browser PASS：JSON原本・型・ID・時刻拒否、BPM表示保護 | 新UI拒否表示 |
| 22 | unsupported | M1 core PASS：160tick保持と確認拒否、非4/4はv1互換、非480/future拒否 | 対応拡張は今回なし |
| 23 | print境界 | 既存Browser PASS：メロディ→コード譜fallback、データ不変 | 新編集UI非印刷・実印刷cancelの実機確認 |
| 24 | 他機能非干渉 | M1 core/Browser PASS：Pre-DTMの音高/時刻/伴奏一致、owner非書込 | 本番統合回帰 |
| 25 | 性能 | FAIL：64小節30.3/507.9ms、変換増幅、保存後例外 | M1再開時に解決。M2へ持ち越してPASSにしない |
| 26 | ドレミ往復 | M1 core/Browser PASS：手動180tick、rest、IDを保持。音数変更は拒否 | 音数変更を伴う明示再配置UI |
| 27 | 部分確認 | M1 core PASS：durationのみ確認し他属性は未確認のまま | 部分未確認の表示UIは未実装 |
| 28 | 小節確認 | M1 core PASS：gap→restを含め1Undo | 確認UIは未実装 |
| 29 | 履歴容量 | M1 core PASS：公開前拒否、既存Redo/開いたtext group保護 | UI容量表示 |
| 30 | 保存競合 | M1 core/Browser PASS：raw外部更新／削除で混合せず拒否 | 実タブ/実機組合せ |
| 31 | 保存失敗 | M1 core PASS：quota/index復旧失敗、dirty/base/history保護 | M3の実環境耐久確認 |
| 32 | 原文復元 | M1 core PASS：許可されたv1の空白を含むrawを完全保持。未知構造は変換拒否・元raw不変 | 原文取出しUIは未実装 |
| 33 | 記譜fragment | M1 core PASS：fragment→source event/bar IDの対応 | fragmentクリックから編集するUIは未実装 |
| 34 | 無変更操作 | M1 core PASS：既確認の同値commandは履歴なし。未確認→確認は意味変更 | パネル開閉の試験はUI実装後 |
| 35 | 旧consumer | M1 core PASS：canonical bar直接読み拒否、明示readProjectionとv1互換 | 引き続き新consumer追加時に強制 |

検証根拠：`tests/schema2.test.mjs`、`tests/schema2-compat.test.mjs`、`tests/schema2.browser.cjs`と、上記18 Browserファイル／Node全suiteのログ。特にpartial/未実装のUI・実機項目をPASSへ読み替えない。

### Git／保護／引き継ぎ

- 開始manifest・終了manifest・原本9 SHA-256を証拠へ記録。開始55ファイルの削除／破棄なし。
- 原本9hash、main rootのHEAD/status、worktree一覧は開始時と一致。既存Studio worktreeを編集していない。
- NEWS・Chord・Pitch・Fretboard・Rhythm・Port・Shared・Workerの変更なし。Pro/Account/Authority/Sync、Daybreak probe、shared write解禁なし。禁止された旧repositoryへアクセスしていない。
- Git developmentとdiff --checkはPASS。性能FAILのためstage／commit／postcommit／pushの操作は行わない。新commit SHAなし、remote topicなし。main push、PR merge、deployなし。
- `.git`や既存branch/worktreeの作り直し、reset/restore/checkout/clean/stash/rebase/merge/revert/amend/forceは行っていない。
- 次工程は**M1の変換コピー増幅・64小節保存後再描画・同期command性能の修復**。その後に同一fixture性能、Node全件、Browser全18ファイル、no-write/Console/404、Git gateを再実行する。
- M1受入後にM2＋M3へ進む。音価/休符/確認の編集パネル、key/capoの意図選択、fragment選択、実OS IME、印刷と実機・保存統合は今回完成扱いにしない。
- 次工程の推奨モデル：**Astra**。推論レベル：**高**。理由：保存raw、参照共有、immutable変換、stale保護、同期編集コストを同時に検証する必要があり、誤った最適化の手戻りを避けるため。プロンプト本文へモデル指定を埋め込むものではない。
