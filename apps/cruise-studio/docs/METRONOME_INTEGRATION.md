# Metronome統合契約 — M2（0.25.1）

2026-10-11。Shell Contract v2.1のM1 / M2 / M3分離に従う。
M2は保存契約の内部実証完了。正式Port data・製品統合はM3。

## Port正本の読み取り監査

| 正本 | 調査結果 / M2対応 |
|---|---|
| `apps/cruise-port/metronome-store.js` | schema3、defaults / validation / normalization / v1・v2・廃止音色migrationを純粋投影 |
| `metronome-app.js` | numberのchange・Enterで即保存。slider inputはruntime、changeで保存。M2はnumberのみ |
| `tool-capabilities.js` | StandardはBPMのみeffective、advanced rawは保持。関数body一致検証、資格resolverはimportしない |
| `cruise-port-capabilities.js` | metadataのadvancedSettings等のpolicy参照正本。M2資格判定は実装しない |
| `metronome-presets-store.js` | 独立schema1 / `cruisePort.metronomePresets`、settings fieldではない。M2 UI・CRUDなし |
| `storage-conflict.js` | 前回読取rawとの競合比較、remote通知更新。Port全writerの原子的協調保証とは別。M3課題 |

Port settings正本は`cruisePort.metronome`。M2はそのkeyを参照・書込しない。
Port storeのtransitive importはSync global登録を持つため実行しない。projectionはstorage key / load / save / Sync importを含めない。

schema3 defaultsは `{version:3,bpm:120,meter:'4/4',rhythm:'quarter',sound:'electronic',volume:70,accents:[true,false,false,false]}`。
BPM30〜240 / volume0〜100の整数。meter / rhythm / soundの列挙、compound rhythm、拍数とboolean accentsを厳密検証する。
UI BPM入力はPortの有限数・整数丸め・clamp、空 / 不正は直前値。保存前はstrict validation。
v1はstandard / wood / click / drum、6/8はeighthと2accentへ変換、その他quarter。
v2 drum→rim、v3 electronic-drum / wood→rim。未知migrationは追加しない。

Port normalizeはknown fieldsだけを返す。M2 decodeはknown fieldsを同じ関数で検証し、未知JSON fieldをraw envelopeへ保持する。
Portとの差はこの保持guardと未来schema read-only guard。未知fieldを音声graphへ渡さない。
未知key（`__proto__`等も含む）はown JSON fieldとして保持し、prototypeへ代入しない。

## 分離した責務と注入API

- `settings-schema.js`: pure schema / decode / migrate / normalize / effective policy。Portとのsource一致tests。
- `settings-store.js`: settings-only memory facade。revisionとCAS。full Port dataset / Sync snapshot APIではない。
- `settings-controller.js`: saved raw envelope / migrated validated draft / effective settings / save state。
- `metronome.js`: 専用AudioContext・lease・M1 scheduler・Dock。settingsSourceを明示注入した時だけcontrollerへ接続。
- `app.js`: memory store / controllerを生成・注入・load。Coordinatorとaudio coreにはstorage責務を加えない。

facade:

```js
load() -> Promise<{ok, data, revision}>
getRevision() -> opaque string
save(next, {baseRevision}) -> Promise<{ok, data, revision}>
// 失敗: {ok:false, reason, currentRevision?, currentData?}
```

dataはJSON envelope。revisionはschema / appVersion / Date.nowではなくstore instance + 成功write sequenceのopaque token。
同一realmのmemory storeでは、候補をawait前にcopyし、await後のCASからmutationまでawaitなし。
競合時はstaleとcurrent dataを返す。失敗でdata / revisionを変えない。
`failNext('quota-like' | 'unavailable' | 'write-failed')`とbeforeLoad / beforeSaveは注入fixtureの障害・遅延境界。
subscribeはstoreに不要。controller subscribeでUI / audioが状態を監視する。
これはmemory内の原子性で、別tab / Port / Syncの原子性証明ではない。

## 保存と読込の契約

loadはread→schema detect→migration→validation / normalize→effective生成。
成功migrationはPort同様にCAS保存する。失敗なら元envelope / revisionを保持し、migrated draftをdirtyで残し明示retry可能。
invalid / future schemaはoriginal envelopeを保持しread-only。safe defaultはeffective fallback専用で保存しない。
未来schemaではforwardIncompatible=true。未知の新形式を古いschemaで上書きしない。

状態はunloaded→loading→ready、saveでsaving→ready / error / stale / forward-incompatible。
controller / runtime snapshot.settingsはloaded、rawEnvelope、rawSettings（draft）、effectiveSettings、dirty、baseRevision、saveStatus、error、readOnly、forwardIncompatible、conflictを公開。
初期load中は入力 / Startをblock。再loadはdirtyを勝手に置換しない。明示`load({discard:true})`のみ破棄を許す。

BPM change / Enterで即auto save。保存失敗時のEnter再確定は同じBPMでもretryする。独自Save buttonは作らない。
Cmd/Ctrl+Sは既存Structure Save targetだけへ委譲。Enterは共通IME / just-composed gateを確認する。
UIはメモリ保存中 / 保存失敗 / 競合 / 保存不可と、ready時「メモリ内・再読込で初期化」を表示する。

保存失敗 / staleはdraft・baseRevisionを維持。成功ackは異なるrevisionと候補data一致（未知field欠落も拒否）を確認してからsaved baseを進める。
A保存中にBへ再編集した場合、A成功でsaved baseだけ更新しBをdirtyで保持、Bを直列auto saveする。
重複saveは同じpending promise。failure / staleを自動retry loopにしない。
A/B runtimeが同じrevisionを読んだ後、A成功→B staleを実証済み。BがAを上書きせずdraftを残す。

disposeはgenerationを無効化し、遅いload / save結果がdisposed controllerや新sessionを変更しない。
まだ呼出前のsaveは開始しない。storeが既に受理した保存は完了し得る。取消保証や外部writer調停はM3 facade責務。
audio runtime disposeはsettings controllerを所有せず、購読だけ解除する。controllerをdestroyするhostは別にdisposeする。

## raw / effectiveと音声・UI

default access stateはStandard相当。BPMだけrawから反映し、詳細はdefaults。
BPMだけの保存でrawのmeter / rhythm / sound / volume / accents / unknown fieldsを維持する。
注入`{metronomeAdvanced:true}`はpolicy fixtureだけ。downgrade / upgradeでrawを消さず復元できることを確認する。
正式Pro credential・失効・Account / AppDevice・backend authorizationとは別。metadata capabilityも認可ではない。
M2 audioはM1のStandard電子click / 4/4 / quarter / volume70 / default accentsのまま。advanced renderer/UIはM3。

BPM変更だけaudio reschedule。saving / ready / error / stale通知はaudio clockを変更せず、保存失敗でも再生継続。
保存完了通知は未確定number入力文字列を置換しない。workspace / Dock / Themeは保存stateを変えない。
Structure Editing Session / project BPM / project save / Pre-DTM working snapshotと独立。
Coordinator、Port timing/audio projection、metadata descriptor・ownerを変更しない。Transport / mic / Undoなし。
reload永続化なし、毎回120へ戻る。M2専用Studio key・Port storage・Sync / Account / Pro credentialを使わない。

## 検証

Node既存218 + M2追加58 = 276 PASS。
Chrome既存70 + M2追加23 = 93独立ケースPASS（runner97は親container4込み）。計369独立検証。
source投影一致、default / existing / revision / CAS / A-B stale / failures / retry / validation / migration / unknown / forward、
raw / effective / hidden値保持 / injected policy、保存中編集 / duplicate / malformed ack / dispose / loading / read failureをNode検証。
Chromeは実audio + 保存失敗、pending writeとworkspace / Dock / 4テーマ、Save / IME、Structure非干渉、print、reloadと外部storage非使用。
M1の120 / 240 BPM予定時刻、range、scheduler、restart、50 Start/Stopでcontext / timer / listener leakなしを再確認。

0.25.0固定baselineとの比較: Project JSON8,077 bytes / Arrangement JSON26,991 bytesはappVersionだけ0.25.1。
MIDI813 bytes SHA-256 `5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`一致。
保存中・音声稼働中A4 PDF1200pxラスタ `8cc02f7356af60a0bbccf9349148c57d0c0784f13b2588b2b3cdb107f75a406e`一致。
Structure / Loupe / 8・16分 / IME / Pre-DTM選択 / working snapshot / JSON / MIDI / focus / modal回帰を確認。
console / app404 / unhandled rejection0。既存localhost:8765を使用、隔離Chromeのみ。Safari / 聴感 / OS IME / 実印刷は未確認。
0.25.1は内部保存基盤と小さなstate表示のpatch。project schemaVersion1 / metronome settings3維持。

## M3接続前の必須条件（未実装）

1. forward schema guardを実Port facade・全writer・Sync applyでも維持。
2. 実2tab / Port・Studio同時起動でCAS / stale / pending draft / dirty base維持を検証。
3. full Port dataset ownershipとowner appId=portを維持。Metronome単体settingsのpartial snapshotをSyncへ送らない。
4. 全writer協調。協調不能ならStudio共有writeを有効化しない。status subscribeでensure / provisionしない。
5. presets schema1 / CRUD / delete intent / 未表示collection非削除を正式契約で接続。
6. 正式Pro資格・expiration / Account・AppDevice・backend認可を分離して検証。
7. mobile lifecycle / Safari / interruption / route owner / cleanup回帰。
8. Sync apply後に全Studio reloadせず、dirty draft / baseRevision / playback snapshotを保護。

M2のBlockerはなし。上記はM3の共有write・製品統合を有効化する前のBlocker。
