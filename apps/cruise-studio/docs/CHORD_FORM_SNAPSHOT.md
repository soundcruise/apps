# Chord Form Snapshot & Persistent Adoption Foundation v1

Studio 0.42.0 topic candidate / schemaVersion 2 / Chord Adapter v2 / Chord owner 1.21.0。製品画面へ未接続。UI・手動運指・TAB・Rhythm・高度CAGED/本棚資格を実装済みとしない。main統合/本番公開は別承認。

StudioProjectが唯一の保存正本。候補はmemory-only、採用は既存Editing SessionのrunOperation、永続化は明示Repository Saveのみ。第二Undo/保存先なし。ChordのgetCommonForm/getForm推薦順位は変更しない。

## Schema 2 extension

`materials.forms[] = {id, encoding:'studio-chord-form-v1', snapshot, provenance}`。
全Project ID（section/bar/event/rhythm/slot/bindingを含む）と重複しない正式schema.newId()で内部IDを作る。外部IDを内部IDに転用しない。

snapshotの必須field:

- capo: 整数0–11、tuningMidi: string1→6 `[64,59,55,50,45,40]`、maxAbsoluteFret: capo以上36以下の物理上限。
- strings: 1弦→6弦の順の正確な6要素。`{string,kind:'note',relativeFret,finger,fingeringWarning}` または `{string,kind:'muted'}`。note fretはcapo相対の非負整数、capo+fretは物理上限内。fingerはnull/1–4/T、warningはboolean。mutedにfret/fingerなし。unknownは拒否。
- barres: `{finger,relativeFret,fromString,toString}` 配列。owner claimだけを保持する。fingerは1–4（ownerの数値文字列表現も可）、正fret、from<to、両端noteの指/fret一致、中間noteをbarreより低くしない・同指の異なるfretを禁止。別指で高い中間弦、区間内muted、ミニバレーを維持。不正claimは修復せず拒否。新規採用はadapter v2のP2-2検証を必須とする。
- playability: null/standard/advanced/limited/unknown、ownerWarning: nullまたは文字列。構造として保持しても、警告やlimited等を演奏readyにしない。

provenanceは必須fieldを限定: origin=`owner-recommendation`、ownerApp=`chord-cruise`、ownerVersion=semver、adapterVersion=`2`、sourceSymbol、shape=C/A/G/E/D、recommendationSource=common/recommended、generation={minRelativeFret,maxRelativeFret}、externalMaterialId=`null`。今回、外部本棚IDを捏造/採用しない。未知encoding/adapter版/構造fieldは拒否。

absoluteFret、soundingMidi、pitchClass、formRoot/formBass、完全性診断、content keyを保存fieldにしない。`MIDI=tuningMidi[string−1]+snapshot.capo+relativeFret`。Projectの現在capoでsnapshotを再解釈しない。

`performance.formBindings[] = {id,chordEventId,materialId,playedStrings,mode:'fixed',confirmation:{status,basisKey}}`。
statusはconfirmed/unconfirmed。basisKeyは比較専用の文字列、unconfirmedのみnull可。confirmedだけでreadyにしない。chordEventIdは実在するchord event、materialIdはformsだけ、1eventにつき最大1件。playedStringsは重複なし・非空の1–6、snapshotのnoteだけ。使用弦をsnapshotに二重保存しない。永続mode:autoなし。

instrument.tuningは従来nullまたは標準6弦配列を許可。maxAbsoluteFretは任意、存在時はcapo以上36以下の整数。旧Projectは欠如/nullのまま読む。採用時はService入力の明示確認を必須にし、楽器設定も同じUndo操作で行う。migrationで楽器・フォームを自動確定しない。

## Service and candidate lifetime

`createFormAdoptionService({owner,schema,adapter,repository,getContext,chordTheory,parseChordSymbol,ownerVersion})` をhostが注入する。製品bootには追加接続しない。

- `prepare({barId,chordEventId,instrument:{confirmed:true,tuningMidi,maxAbsoluteFret},playedStrings,generation?})` は同期pure owner APIへ問い合わせ、v2のvoicingUsableと確定弦/barreを確認した発行handleを返す。失敗はtyped結果。getter/toJSON/cycle/非有限数を元入力で拒否する。
- `prepareRemoval({barId,chordEventId})` は固定指定解除handle。unresolvedなコードでも解除できる。
- `apply(handle)` はService自身のWeakMapに登録したhandleだけ受け入れる。任意UI boolean、clone/改ざん、他Serviceのhandleは拒否。成功したhandleは再利用不可。注入した正式ownerVersion/adapter定数との一致も検証する。
- prepare/apply直前/同期runOperation内部でProject/Session/document generation/workspace generation/snapshotVersion/baseRevision/対象bar-event/入力pending/保存中/外部更新/競合/exact raw revisionを検査する。A→B→A・Undo/Redo・Save・コード/楽器変更後は旧handleを拒否。
- 非同期ownerが必要になればprepare側で完了させる別契約とし、runOperationをasyncにしない。

採用は楽器明示設定→完全に一致する内容/owner版/来歴のmaterial再利用または新ID追加→対象Binding差替え→確認basis→参照/構造/容量検証→Session公開で1Undo。解除も1Undo。既存materialを直接編集せず、新materialへ参照変更。未使用materialは自動削除しない。同じmaterial IDの内容改変はSession/Repositoryで拒否する。

contentKeyはcanonical field順の導出比較値で永続fieldを持たない。basisKeyはProject/event ID・現在symbol/unresolved・現在instrument・material内容/来歴・選択弦の正確な条件を比較する不透明文字列。内容復元/演奏の正本には使わず、snapshotと音楽条件を別検証する。hash衝突を許容する比較へ置換しない。basis文字列も保存/Undo容量予算に算入する。

## Structural validity versus readiness

schema2.validateは元入力descriptor→全構造・一意ID・参照・6弦・fret/barre・provenance→容量を検証する。保存は8MiB（JSON文字数×2）の既存予算を維持。

`evaluateBinding(project,binding,deps)` は構造validation後、現在chordを正式parser/Chord QUALITIESで解釈し、snapshot由来の実音から全フォームの構成音/許可音、使用弦の構成音/最低実音/適用警告、instrument一致、confirmation/basis一致を評価する。owner推薦を再取得せず保存フォームを書き換えない。

P2-1維持: C/E、C/G、D/F# capo2は全フォームbassが不一致でも、明示使用弦の実音集合が成立すればvoicing ready。全フォームの欠落音/意図しない音は救済しない。未使用noteだけのwarningは保持し、演奏対象warning/global warning/limited/unknownを拒否。

C固定フォーム採用後にDmへ変更しても、material/Bindingを保持して保存できる。readinessだけをfalse/確認要求にする。構造不正や参照破損と、音楽的不適合を混同しない。readyはvoicing-onlyであり、完成TAB/リズム/音価/印刷完成を意味しない。

## Identity and legacy consumers

legacy editのchord対応はedit view内のprivate WeakMapで追跡する。配列index、コード文字列、tickから旧IDを推定しない。同じobjectの文字編集/移動/reorderはID維持、新objectの追加/コピーは新ID。同一objectの二重使用や、削除と未対応replacementが混在する曖昧な編集は拒否。

正式setBarChordの単一イベント文字編集は明示的に対応を引き継ぐ。複数chordをbar-only入力で置換する場合、Bindingがある曖昧操作は拒否。Bindingなしの既存bar全体置換は明示replacementとして新IDを作り、従来操作性を維持する。

barは非永続のprivate identityで追跡し、section/bar移動は追従。削除eventのBindingだけを同じ操作で削除し、materialは残す。`schema.duplicateBar(project,barId)` は明示copy intentとしてbar/全event/関連Bindingへ新ID、material参照共有、複製Bindingはunconfirmed。旧barを推測で更新しない。

歌詞/ドレミ/表示/BPM/section編集は非空forms/Bindingをcanonical Projectに保持する。Pre-DTM/PrintはreadProjectionで読むだけ。projectionを再migrationして保存しない。投影の保存/export拒否は維持。

## Undo and save


履歴容量の算出では、Session自身が独立copyしてdeep freezeしたschema2 contentだけに、生成時JSONの正確なUTF-8 byte数をprivate WeakMapで結び付ける。live Project、callerのfrozen object、mutable draftはキャッシュしない。元入力descriptor/domain validation後のcopy生成を維持し、容量計算のための重複serializationだけを除く。文字列本文は保持せず、Undo/Redoの内容・100件/8MiBの予算・失敗時の原子性は維持する。Project保存容量（JSON文字数×2）とは別計算であり、保存前metadata後の検査やraw revision照合を流用・省略しない。

単一Sessionの既存requireUndoは維持。フォーム採用/差替え/解除だけ `preserveAppliedUndo:true` を指定し、適用済みprefix＋新entryが100件/8MiB（履歴UTF-8 content）を超える場合、履歴間引き前に拒否する。失敗時にdraft/base/history/Redo/text groupを失わない。成功した新分岐の通常Redo破棄は許可。他の操作のeviction契約は変更しない。

既存Repositoryは元入力descriptor検査→schema/参照検証→独立copy→updatedAt/appVersion→最終validation/容量→exact raw照合→同じWeb Lock/Project+index transactionで保存。旧storage.saveProjectのv1限定は維持。quota/conflict/result-unknownを成功扱いしない。legacySource.raw/ID/confirmation/provenanceをSave/Load/JSON往復で保持する。

旧空forms/tuning=null、v1→v2、非4/4のv1互換、実音/tick/原文保持は既存回帰を継続。新フォーム入りschema2を旧0.41.0 validatorが拒否することも検証する。旧版のためにsnapshotを削らない。

## Acceptance and boundaries

Nodeはsnapshot/Binding/ID/Undo100件・累積8MiB/Save/JSON/stale/descriptor/旧版拒否/P2-1/P2-2を検証。Browserは従来25ファイル＋専用Service harness。使い捨てcontext、独立loopback、全reloadを通す追記ledgerを保持し、明示SaveのProject/index書込みとpreview/read/rejectの禁止書込みを区間分離する。ledgerを消してPASSにしない。

8/32/64/128小節、共有1フォームと多数の異なるsnapshotを測定。正式の容量予算・既存性能目標を参照し、新しい任意閾値は作らない。各時点の測定値・全回帰・Git gatesはrepo外receiptで確定する。実OS日本語IME/Safari/実プリンターは未検証。

Pro/Account/Authority/Sync/Port/Worker/Daybreakを変更しない。pure API成功は資格証明ではない。高度CAGED/本棚権限は未確定、保存済みsnapshotを資格失効だけで削除しない。Shared write OFF、PortDataHost.canWrite=false、既存8765/8766不触。

## Snapshot P2 validation / material identity

フォームmaterial、snapshot、note/muted、barre、provenance、generation、Binding、confirmationの全必須fieldはown enumerable data propertyを要求する。継承値・欠落・accessorで代用しない。フォームrecordはplain JSON object（cross-realmを含む）またはnull-prototype dataとし、class instanceを拒否する。元入力のdescriptor/toJSON検査をcopy前に維持する。generic keys()や他Project recordのoptional契約は変更しない。任意Proxy trapの無害化を保証するものではない。

Repositoryは正式validation済みmaterialを再帰的に構造比較する。objectキーの挿入順は無視するが、array順・全own field・primitive・owner/version/生成条件・弦/fret/運指/barreは内容として比較する。同一IDの実質変更は拒否し、新IDによる差替えを要求する。raw revisionとlegacySource.rawは従来の正確な文字列照合のまま。比較目的のProject全体copyは追加しない。

JSON export→objectキー順変更→タイトル編集→import→明示Save/Loadは許可する。拒否時のraw/index/draft/Undo/Redo保持・書込み0、validate/migrateの元入力拒否、通常JSON/cross-realm/null-prototype互換をNodeと実Chromeで検証する。version 0.42.0/schema2/adapter2を維持する。
