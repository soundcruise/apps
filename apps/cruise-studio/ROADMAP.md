## Owner Route / Schema接続候補 v1 — default OFF（未公開）

PR28直接子。既存Worker dispatcherへ予約namespaceを追加するが、Production indexはopaque capabilityを渡さず、flagのみでは404。使い捨てcapability＋既存HMAC/Pro/writer＋exact候補schema/DB gateで隔離接続を検証。DDLは通常migrations外、NULL/default0で既存データbackfillなし。ブラウザ製品module/version/cache不変（Studio0.47.20 / Port1.24.23 / schema2）。

契約は `workers/sound-cruise-sync/OWNER_ROUTE_SCHEMA_CANDIDATE.md`。本番physical-commit expiry・時計/TTL/rotation・旧writer containment・enrollment/cutover・反復履歴運用は未保証。Production capability/infra rollout/BPM canaryは別受入・別承認。本番保存・Cloud未接続、Shared Write OFF、canWrite=false。今回の合格を1.0.0や本番保存完成と扱わない。

# Studio 0.47.20 / Port 1.24.23 — bounded two-cycle renewal candidate

Parent PR27 dedb2719e0c5544417c783bc4978c522dd4e44cc. q3/proof3/cycle2 uses
exact q2 source, one immutable owner archive atomic with begin2, two-link history
and existing readonly Authority/consumer transactions. Third cycle is refused by
the enabled fixture owner/local source. Shared Write OFF/canWrite=false, schema2.
No production routes, migrations, writer/consumer/Cloud or deployment are enabled.
After two-cycle acceptance, stop adding isolated cycles; the next unit is disabled
production owner route/schema compatibility plus explicit clock/admission semantics.
[Current production gates and initial-release roadmap](docs/PRODUCTION_CONNECTION_GATES.md).
The following sections are historical records.

# Studio 0.47.19 / Port 1.24.22 — Renewal successor isolated candidate

PR #26 fixed head e01c061a7c5fa2b26c5997ef580e38d0b3ceef61 is the direct parent.
Explicit readonly credential adoption, authenticated history-only reconcile across
one direct renewal, and typed successor Authority/consumer publication use existing
owners. Pointer/consumer CAS is one IDB transaction; SQL stop/confirmation and
Account/backup DB remain separate. New per-operation V3 Admission enables isolated
BPM draft/save/reload while all normal writers remain disconnected.
Shared Write OFF / canWrite=false, schema 2. Multiple renewal cycles, production
backend/cutover/Cloud and physical commit expiry remain gates.
Contract: [Renewal successor lifecycle](../cruise-port/docs/RENEWAL_SUCCESSOR_LIFECYCLE_ISOLATED.md).
The sections below are historical implementation records.

# Studio 0.47.17 — Pointer/Consumer停止協調・明示部分復旧（未公開隔離候補）

Port1.24.20 / Project schema2。PR #22固定head ae1309d5が直接親。Authorityのtyped stop/Control epochとowner SQLの永続stopped fenceを協調させ、旧lease消費/新規発行を停止。完全roster・元pin・typed local receiptを分類し、最新backend結果のみを別UUIDの明示復旧で元世代へ適用する。pointer/consumer CAS・journal・receiptは同Authority tx、新世代はsuspended/fenceRevoked/readOnly維持。owner確定もreadonly止まりで通常writerを再開しない。独立DBの原子性、全device/Cloud writer排除、本番cutoverは未保証。Shared Write OFF/canWrite=false、schema2・公開版・他owner不変。契約: [Owner Pointer Consumer Cutover](../cruise-port/docs/OWNER_POINTER_CONSUMER_CUTOVER.md)。以下は履歴。

# Studio 0.47.16 — 操作単位Owner Lease/Fencing（未公開隔離候補）

Port1.24.19 / Project schema2。PR #21固定head 43b4eb11を直接親とする。操作ごとに既存Account/app/Pro/writerを確認し、owner SQL最終assertionへlease・fence・UUID・digest・CAS・receiptを結合する。新Authorityはsuspended/fenceRevokedのまま、同一backend確定BPM操作だけをopaque fixture purposeで限定適用。独立DB間の原子性・remote expiry through IDB・live pointerのserver把握は保証しない。部分成功はbackend/local receiptを分離して保持し自動再送しない。未知pending・floorは補修しない。Shared Write OFF/canWrite=false、通常writer/本番/Cloud/cutover/L3d未接続。契約: [Owner Operation Lease Admission](../cruise-port/docs/OWNER_OPERATION_LEASE_ADMISSION.md)。以下は履歴。

# Studio 0.47.15 — 明示再認可 / readonly Authority世代復旧（未公開隔離候補）

Port1.24.18 / Project schema2。PR #20固定head 79083244が直接親。現行Account資格のHMAC・expiry・世代・Pro/writerを隔離owner SQLで再確認し、専用purpose/receiptで新Authority世代へ移る。新世代は公開時からsuspended+fenceRevokedでreadonly、旧採用stopを保持。通常publishのinvalidated拒否は維持。Account/SQL/Authority/backup間は非原子的で、結果不明や未解決backupは停止・保持、historical照合のみ。Cloud fence/排他leaseは未提供。v1は既知empty binary/Sync fixture限定、データmigrationや通常writer再開ではない。Shared Write OFF/canWrite=false、本番/Cloud/consumer/L3d未接続。契約: [Authority Reauthorization Recovery](../cruise-port/docs/AUTHORITY_REAUTHORIZATION_RECOVERY.md)。以下は履歴。

# Studio 0.47.14 — 復旧Credential明示採用（未公開隔離候補）

Port1.24.17 / Project schema2。PR #19固定head a24244d3が直接親。既存Account coordinatorの同一Account/device switch、停止intent、Shared Account CAS/receipt、immutable backupを利用する。候補確認はAccountを変更せず、明示採用時だけ資格を差し替える。前後owner照合と独立DBの非原子性を区別し、部分成功は停止を維持。ACK喪失/reopenはhistorical照合のみ、自動再採用・再開・削除なし。通常writer/consumer/Cloud/L3d/本番未接続、Shared Write OFF / canWrite=false。契約: [Credential Adoption](../cruise-port/docs/CREDENTIAL_ADOPTION.md)。以下は履歴。

# Studio 0.47.13 — Owner clock / 永続expiry / renewal復旧（未公開隔離候補）

Port1.24.16 / Project schema2。PR #18固定head cc84091bが直接親。信頼済みSQL観測時刻を永続floorへ結合し、historyは認可fact UPDATE RETURNINGでexpired確定とreceipt選択を同一stepへ統合。通常データreadonlyと認可fact更新を分離。ACK喪失復旧は既存renew CASへprivate暗号化結果を保存し、旧資格＋専用256bit proofで同じ既発行tokenだけ再配送。clientはShared immutable ownerへ非抽出Key/暗号文を事前保全、正式full-source manifest/revision一致を要求し、Account採用は行わない。SQL abort内だけの未記録expiryはunknownであり、物理時刻/電源断保証とは区別する。本番/通常writer/consumer/Cloud/L3d未接続、Shared Write OFF/canWrite=false。契約: [Owner Clock / Renewal Recovery](../cruise-port/docs/OWNER_CLOCK_RENEWAL_RECOVERY.md)。以下は履歴。

# Studio 0.47.12 — Owner lifecycle / Save-Reconcile隔離候補（未公開）

Port1.24.15 / Project schema2。PR #17固定head 9256c9feが直接親。既存sca1 ownerからの明示lease発行、永続renew停止・secret rotation・失効CAS、owner世代bind、認証済みSaveとreadonly Reconcileを隔離実装。現在の新資格で旧receiptを同Account/member/device内で照会し、history権限はsaveと分離。未知floor/leaseは補修せず拒否。backend SQL最終assertionと独立IDBの非原子性を維持。history-only期限観測後の未記録server時計巻戻しは未保証で、本番には単調owner時刻または永続expiry設計が必要。通常router/認証/consumer/Cloud/L3dは未接続、Shared Write OFF/canWrite=false。契約: [Owner Credential / Save-Reconcile](../cruise-port/docs/OWNER_CREDENTIAL_SAVE_ROUTES.md)。以下は履歴。

# Studio 0.47.11 — Backend save transaction隔離候補（未公開）

Port 1.24.14 / Project schema2。PR #16固定head c543724bを直接の親とする。既存backend SQLのAccount最終再認可・Pro/writer fence・Port record/CAS/oplogを同一batchで確定する未公開fixtureを追加。ローカルAuthority commitは別結果であり、SQL receiptを保存資格にしない。部分成功・ack喪失・reopenは既存Shared immutable pending pinと二種類のreceiptから照合し、自動再送・削除なし。通常router/production migration/consumerは未接続、Shared Write OFF / canWrite=false。資格発行/更新route、production owner時計・cutover・最終認可は未完成。契約: [Backend/local transaction](../cruise-port/docs/BACKEND_SAVE_TRANSACTION.md)。以下は履歴。

# Studio 0.47.10 — Owner final admission隔離契約（未公開topic）

Port 1.24.13内部保守候補、Project schema2維持。基準公開main d66107c5 / Studio0.47.9 / Port1.24.12。既存Account sca1 HMACとAuthority保存transactionを再利用し、owner資格lifecycle/expiry、exact request digest、operation ID/CAS/receiptを結合する。owner lease columns・同期commit probeは隔離fixture限定。本番owner router、遠隔ownerとIndexedDBの原子性、資格発行/更新routeは未完成。通常writer/Cloud/Shared Write未接続、canWrite=false。契約: [Account Save Admission](../cruise-port/docs/ACCOUNT_SAVE_ADMISSION.md)。以下は履歴。

# Studio 0.47.9 — Metronome BPM隔離縦断保存（未公開topic）

Port1.24.12、Project schema2。PR #14固定headを親に、Port設定owner・saveBpm policy・Account source pin・Authority CAS/oplogとfixture最終認可を接続する。Studioは一時draftと明示save/reloadのみ。操作ID別immutable pending pinを保存前readbackし、crash/reopenはhistorical receipt照合だけで自動再実行しない。原本・正常B・旧writer gateを維持。通常boot未接続、Shared Write OFF / canWrite=false。本番backend再認可・資格expiry・consumer切替・migration/binary/Cloud・最終admissionは未完了。契約: [BPM隔離保存](../cruise-port/docs/METRONOME_BPM_ISOLATED_SAVE.md)。以下は履歴。

# Studio 0.47.8 — Binary / Backup隔離復旧（未公開topic）

Port1.24.11、Project schema2。PR #13固定headを親とし、既存Shared backup ownerの固定pinとPort binary ownerのimmutable追加・readbackを利用する。停止fact/Account sourceを照合し、部分保存・応答喪失・reopen・容量不足・破損をfail-closedで扱う。archiveVerifiedはhistorical検証のみ。通常writer、Cloud、認証切替、live restore、Shared Writeは未接続、canWrite=false。原本・未知/孤立データを保持する。同一origin raw writer完全拒否・物理電源断耐久性は未保証。契約: [Binary/Backup復旧](../cruise-port/docs/BINARY_BACKUP_RECOVERY.md)。以下は履歴。

# Studio 0.47.7 — Account / Port隔離cutover・復旧 v1（未公開topic）

PR #12固定head e35c965247f70430daa66dff60208a65b5299c7aを親とする内部保守候補。Port1.24.10、Project schema2、Shared Write OFF / canWrite=false。既存Accountのin-place物理1→2→3、Authority内のtyped migration intentとrecovery barrierの原子的確定、manifestによるPort原本保全、応答喪失/crash/reopenのhistorical照合を追加。完了はverified-inertであり、通常writer・Cloud・binary・Port pointer切替・認証切替は未接続。異なる正常B世代のreceipt/preparedを旧Aが変更しない。契約・未完了gate: [Account/Port cutover](../cruise-port/docs/ACCOUNT_PORT_CUTOVER.md)。以下は履歴。

# Studio 0.47.6 — Account consumer隔離移行 v1（未公開topic）

PR #11固定head 155438f56a3f7ed16aff3a7bcc4fb486923da27bを親とする内部保守候補。Port1.24.9、Project schema2、Shared Write OFF / canWrite=false。Sharedの最小権限観測readerをPort SyncCenter controllerとStudio Hostへ明示注入。通常起動は未接続で、writer/Cloud/認証の本番切替なし。ownerのas-of-readと資格expiry・最終admissionを区別し、非同期処理後のfull source/Authority照合・失効A/正常B・通知欠落/別タブ/reopenを検証。全consumer棚卸し・未移行writer・migration/binary/最終admission条件: [Consumer契約](../cruise-port/docs/ACCOUNT_CONSUMER_MIGRATION.md)。試験・独立レビュー・GitHub保全の実測証跡はrepo外で確定。以下は履歴。

# Studio 0.47.5 — Account owner generation/freshness（隔離topic）

PR #10固定headを親とする内部保守候補。Port1.24.8、Project schema2、Studio0.x.yを維持。Account ownerがprimaryの単一SELECTでAccount/device/Port membership世代とread gateを確認する未公開APIを追加。5秒の観測期限を資格そのものの期限と区別し、source/Authority pin・nonce・遅延renew・expiry/時計巻戻し・失効A/正常B保護を隔離試験する。通常consumer/production routerは未接続、Shared Write OFF / canWrite=false。契約: [Owner generation/freshness](../../workers/sound-cruise-sync/ACCOUNT_OWNER_CONTEXT_CONTRACT.md)。以下は履歴。

# Studio 0.47.4 — Account provider / consumer接続契約（隔離topic）

公開済みmain ce156230 / Studio0.47.3 / Port1.24.6を基準とする内部保守候補。正式AccountClientのsummary/devicesを注入transportで利用するPort owner観測providerと、Studioのpure readonly projectionを追加。永続source/revision・Authority Control/pointerを照合し、失効応答は既存transactionで停止intentを記録する。Port membership世代と資格freshness証明は現APIに存在せず未確認のまま。通常writer・Cloud・legacy consumerの本番移行は未接続、Shared Write OFF / canWrite=false / schema2を維持する。

Studioは正式リリース承認まで0.x.y。Port保守候補1.24.7。契約・移行一覧・残る保存gateは [Account providerとconsumer](../cruise-port/docs/ACCOUNT_PROVIDER_CONSUMERS.md)。以下は過去の工程記録。

# Studio 0.46.0 Account + PC UI 統合候補（未公開）

A `475fbc97` とB `78e1e87f`を統合。Port保守候補1.24.2 / StudioProject schema2。Account coordinatorは隔離のみ、通常writer未接続、Shared Write OFF、PortDataHost.canWrite=false。Home/NEWS/My Appsはreadonly。次の保存基盤工程と受入条件は [統合と保存基盤準備](docs/ACCOUNT_PC_INTEGRATION_READINESS.md)。main統合・Production公開は別承認。以下のtopic記録・過去の工程を保持する。

# Studio 0.43.1 patch候補 — P3-01 reason lookup / version・cache整合

## Account協調基盤 v1（隔離topic・未公開）

Studio開発候補0.46.0 / Port保守候補1.24.2 / Project schemaVersion 2。Port所有のAccount context、Authority停止complete後のShared Account同一transaction CAS、Studio Toolsの端末内観測readonly表示を追加。通知を停止保証にしない。通常writer・Sync・Shared Write・認証切替は未接続。独立PC Home/NEWS/My Apps topicとは別commitで管理する。正式provider、durable retirement-intentの中断窓、非協調旧writer、移行/復旧/binary/最終admissionを解消してから製品保存を判定する。契約は `../cruise-port/docs/PORT_ACCOUNT_COORDINATION.md`。本番mainはこのtopicでは変更しない。

## PC Home / NEWS / My Apps 起動（独立topic・未公開）

Studio開発候補0.46.0 / Project schemaVersion 2。Port owner NEWS providerとURL resolverを読み取り利用するPC UIを追加。Home主要導線、NEWS一覧・詳細・読込/停止/障害・世代取消、My Appsの明示起動を対象とする。Account協調基盤は別topicで並行し、正式writer・Account操作・Sync開始・CRUD・Shared Writeは接続しない。通常保存の解禁は別途Authority/移行/旧writer/最終admissionの受入後に判断する。実装契約と関連試験は `docs/PC_HOME_NEWS_LAUNCH.md`。本番mainはこのtopicでは変更しない。

Object.hasOwnによる未知reason防御と既存55 reason互換を保持。Studio自身のversion・mirror・現行HTML asset/internal ESM cache・厳密試験を0.43.1へ協調更新する。schema2、Adapter v2、Chord owner 1.21.0、単一Project/Session/Undo、明示Save、Shared write OFF、PortDataHost.canWrite=falseは維持。

正式Node/Browser・同一条件3回の性能測定・No-write・Git gatesの結果はrepo外のSHA/tree付きreceiptで確定する。topic通常pushと隔離2-parent統合候補までを対象とし、main反映・Pages公開は別承認。実OS日本語IME・Safari・実プリンターは未検証のまま。既存仕様: [CHORD_FORM_SELECTION](docs/CHORD_FORM_SELECTION.md)。以下は過去の工程記録。

# Studio 0.43.0 candidate — Structureフォーム採用UI

基本推奨フォームの確認・明示使用弦・楽器条件確認・イベント単位の採用/差替え/解除を既存Serviceへ接続。schema2/Adapter v2/単一Undo/明示Saveを維持。高度CAGED・本棚・手動運指・Rhythm・TABは対象外。受入結果は作業証拠で別途確定し、main統合/本番公開は別承認。正式仕様: [CHORD_FORM_SELECTION](docs/CHORD_FORM_SELECTION.md)。以下は過去の工程記録。

# Studio 0.42.0 candidate — Chord Form Snapshot & Persistent Adoption Foundation

P2-1 adapter v2を祖先に、schema2のforms/formBindings、明示楽器確認、発行候補のstale保護、単一Session採用/解除、累積Undo予算、Repository/JSON往復、legacy event ID保持を追加する。製品UI・TAB・手動運指・Rhythm連携は未接続。main統合/公開は別承認。受入結果とSHAはrepo外の最終証跡で確定する。

[保存・採用正式契約](docs/CHORD_FORM_SNAPSHOT.md)。以下は過去工程の記録。

## Studio 0.41.1 — Chord Form Adapter v2 / P2-1修正（topic候補、2026-10-17）

全ownerフォームの完全性と、明示使用弦による演奏voicingを独立判定。全フォームの最低音診断を保持し、演奏側は使用弦の構成音・最低実音・適用警告を再検証する。P2-2バレー検証、memory-only、schema 2、単一Project/Session/Undoを維持。保存/UI/owner推薦は変更しない。

[正式契約・独立MIDI期待値・受入境界](docs/CHORD_FORM_ADAPTER.md)。adapter versionは2、Studio patch候補は0.41.1。正式試験・限定commit・topic pushはrepo外receiptに実測記録し、main統合・本番公開は行わない。以下は履歴。

## Studio 0.41.0 — Chord Pure Adapter Foundation（topic候補、2026-10-16）

Chord正式getCommonForm/getFormを注入するmemory-only adapterを追加。表示・構成音完全性・演奏voicingの使用可否を分離し、6/m6、slash bass、部分フォーム、未確定使用弦を理由付きで返す。UI/保存/Undo/Project schema2/owner推薦は変更しない。

[入力・出力・owner監査・受入契約](docs/CHORD_FORM_ADAPTER.md)。required試験とcommit/topic pushの実測結果はrepo外の検証receiptに記録する。main統合・Pages公開・永続snapshot採用・TAB生成は別工程。以下は過去の記録。

## Studio 0.40.3 — F3 metadata / cache整合候補（2026-10-16）

- Port正式source 1.23.1へのStudio import query追従。Chordのpure module 2件はowner HTMLと同じ1.21.0へ追従。
- Studio自身のversion・現行cache query・厳密試験を0.40.3へ更新。schema 2と保存・演奏・認可のロジックは維持。
- 固定main/topicを親順序通り保持する隔離2-parent候補。既存topic、旧候補、main root、未追跡原本は変更しない。
- [F3正式記録](docs/F3_METADATA_ALIGNMENT.md)（PROJECT_STATEからは `../docs/F3_METADATA_ALIGNMENT.md`）。required試験の結果は候補SHAに紐づくrepo外の検証receiptで確定する。main反映・Pages公開は別承認。

## Studio 0.40.2 — 旧保存API・広幅UI安全修正（2026-10-16）

旧saveProjectはschema 1専用、schema 2はRepository/Editing Session専用にした。拒否時write0・入力/raw/index不変。広幅LoupeはInspector実測領域を避け、Inspectorのsticky位置はtoolbar実寸へ追従する。schema2、既存F1/F2・保存容量・Undo/IME境界を維持。
Node1176／正式Browser23ファイル558 PASS、FAIL/skip/cancelled0。48条件の同時表示・hit testと性能gateを再実測。実OS IME/Safari/実印刷は未検証、F3 Port1.23.1は別統合工程。main統合/Pages公開なし。commit/push実結果はrepo外final receipt参照。

[正式仕様・試験・性能](docs/MELODY_DURATION_REST_EDITING.md)。以下は過去の記録。

## Studio 0.40.1 — Render Readiness Recovery & Final Acceptance（2026-10-16）

保存metadata適用後の最終validationと、狭幅Inspector/選択音符の可視性を修正。768px timeoutはfixtureの同一ID/raw再投入に対するexternal-revision保護であり、条件別contextと完全identity ready照合で解消。製品rendererの保護は変更しない。
今回Node 1156／Browser21ファイル 548 PASS、FAIL/skip/cancelled0。48画面条件、CDP IME/focus/caret、保存容量の実Save/再読込、8/32/64/128性能を再確認。0.40.1/schema2、F1/F2/単一Undo/no-write維持。
実OS IME/Safari/実プリンターと後続機能は未完。F3 Port1.23.1は別の最新main統合候補で対応。限定commit/topic pushの実結果はrepo外final-receipt、main/Pages公開なし。
[正式受入・35項目・性能・証拠](docs/MELODY_DURATION_REST_EDITING.md)。以下は履歴。

## Studio 0.40.0 — Melody Duration & Rest Editing M2/M3 自動受入（2026-10-16）

Structure内で音符・rest・gapを選び、InspectorからM1の8正式commandを実行する。正本StudioProject/schema2、既存Editing Session/単一Undo、明示Saveを維持する。非リップル音価/開始位置、明示pitch変換、部分/小節確認、gap確認、stale/A-B/IME保護を追加。
透明hit矩形・private source stampと退役描画jobのRAF所有を分離。矢印はgapも含む記譜順で移動し、gapに音符専用欄を要求しない。No-writeはreloadを越える全ledgerと操作区間で検証し、A/B・Loupe幅補正・明示theme・明示Saveの9writeだけを値/件数照合する。
Node1139／正規Browser19ファイル491 PASS、FAIL/skip/cancelled0。8/32/64/128性能と35項目を今回再測定。実OS IME/Safari/実印刷、高度時間表現・五線印刷・TABは未完。F3 Port1.23.1は最新main統合前に別対応。限定topic commit/pushの実結果はfinal-receipt参照、main統合/Pages公開なし。以下は過去の記録。

[正式M2/M3契約・35項目・性能](docs/MELODY_DURATION_REST_EDITING.md)。

## Studio 0.39.1 — M1 Safety Recovery 自動受入（2026-10-16）

F1の未確認legacy timing/ID/provenance/rest/gap保持、F2のprototype/getter/toJSON検証、CMM private DTO境界を修正。Git登録の欠落baseを同一HEADの実測で補完し、checkerは変更しない。Browser ledgerは明示選択2writeと後続no-writeを区間化して全履歴保持。構文不正を音数判定より先に診断し、IME文字/focus/caretを保持する。
Node1108／正式Browser18ファイル466 PASS、FAIL/skip0。F1/F2の51件と構文追加6件を再検証。64小節command p95 12.7/13.1ms、Staff103.9/100.8ms（保存前/後）で正式目標PASS。128小節command25.4/25.2msは追加耐久。CMM比較目安の超過は継続改善であり全件達成としない。
schema2維持、M1自動受入のみ。M2/M3のUI・実OS IME/Safari/実印刷は未完。Port1.23.1 F3は最新main統合の別工程。main統合/本番公開なし。限定commit/topic pushの実結果は証拠final-receipt.jsonを参照。以下は過去の記録。

[正式35項目・試験・性能・証拠](docs/SCHEMA2_FOUNDATION.md)。

## Studio 0.39.0 — Schema 2 M1自動受入（topic候補、2026-10-16）

schema 2正本、決定的migration、stable ID、原文保持、serialization前validation、Undo容量保護、明示consumer adapterを実装。Node1051／Browser18ファイル464 PASS、FAIL/skip0。診断の展開/集約とreload前後のrunner書込み監査、大規模8/32/64/128 Save/Load・五線・A/B・staleを検証。
64小節の同期編集p95は保存前10.4/保存後10.3ms、五線更新105.2/105.5msで正式目標PASS。128小節は追加耐久として完了。小規模CMMの約1.6倍/128の約1.9倍は比較目安上の改善残件として明記。M2/M3のInspector・実OS IME・Safari・実印刷等を完成扱いにしない。
mainはNEWS/Port更新の10296dbb、続くNEWS Workerのみ9pathの7cf2f02aへ独立進展。現topicを無断取り込みせず、次のmain統合時にPort1.23.1 mirror/cache整合と新規回帰が必要。今回main公開・Pro/Account/Authority/Sync操作なし、shared write OFF。
[正式受入35項目・試験・性能](docs/SCHEMA2_FOUNDATION.md)。以下は過去の記録。

## Studio 0.38.1 — Melody Staff UX Polish Finalization

既存topic上のpatch。Astra/OpusのP1を、共通tick/実測文字幅、1/2小節system、
共通五線高さ、記号配置、入力中の明示pending、診断と曲/カポ表示で解消。
不正stepはSessionで拒否し、公開ドレミ入力で受理されたMIDI範囲外データは変換段階で診断する。
Node945 / 正式Browser442 PASS、FAIL/skip0（2026-10-15の新規実測）。
8/32/64小節13.2/44.8/113.8ms、最大frame7.9ms、合成input同期処理0.9ms。
schema1・shared write OFF・五線は画面previewのみ。実OS IMEと常設ルーペ/狭幅刷新は未完。
[正式契約・P1/P2判断・試験詳細](docs/MELODY_STAFF_PREVIEW.md)。次は実機確認と音価編集の正式契約。
main統合・Pages公開は別工程。以下の0.38.0の数値は過去の記録。

## Studio 0.38.0 — Melody Staff Preview v1

専用topicで実装。schema1維持・main公開なし。
コード譜/メロディ譜の一時切替、4/4・480 PPQ・実音五線、調号/臨時記号/音価/休符/付点/タイ。
小節単位の「音の長さ：自動を含む（由来未確認）」を保持。確認済み保存なし。
Core成功＋正式source/isCurrentだけを採用。fatalを無視した部分描画なし。
歌詞は元tickのまま、Chord/Rhythm/TABは未接続。入力DOMと描画境界を分離。
既存印刷はコード譜を維持。五線は画面previewだけ。
[実装契約](docs/MELODY_STAFF_PREVIEW.md)。
2026-10-15再開時の実測: Node **942 PASS**、正規Browser15＋conversion＋melody staff **437 PASS**。
FAIL/skip 0、Console/404/禁止通信 0、No-write維持。保存schema1、他アプリversion不変更。
8/32/64小節: 18.3/131.2/260.4ms、最大frame1.6ms。単一変更小節だけ再描画。
257小節は14msでpreview-budget、2049文字は13msでpreview-text-budget。focusを保持し、保存0。
前回FAILはVexFlow 4.2.3に存在しない.vf-accidental classへの依存。実glyph欠落ではなかった。
今回の再開では製品コードを変更せず、test専用SVG観測と12ケース・実paint削除反例を追加。
sharp/flat/natural/調号/同小節継続/小節リセット/octave/連桁/タイ/付点/休符を実Browser・画像で確認。
未対応: 任意の跨拍連桁指定、跨小節tie、3連等30tick未満/非整合音価、五線の正式印刷、TAB/schema2。
次工程: 実機IME/Safariと読みやすさの確認、常設ルーペ/共通layout/音価編集の契約。main反映は別承認。

# クルーズスタジオ — ロードマップ

## Integrated Score正式設計文書化（2026-10-15）

Astra Architecture Contract v1全文、Opus最終UX全文、承認済みモック `2b754b0f78b8ba856f9f315e9c76d27420088168` のREADME/HANDOFFを照合し正式docsへ保存。
[Architecture](docs/INTEGRATED_SCORE_ARCHITECTURE.md) / [UX](docs/INTEGRATED_SCORE_UX.md) / [工程と受入](docs/INTEGRATED_SCORE_IMPLEMENTATION_ROADMAP.md)。
単一Project/Session/Undo、Hybrid、stable ID、schema2、実音/key/capo、owner API、手動保持、出力別readinessを確定設計として区別。
Studio0.37.1 / schema1の製品実装は維持。schema2や譜面変換UIは今回未実装。U1〜U8と実OS IME等の未確認を保持。
metadata修正commit `02a21d74a35e93d94a06b5827e1713fe5ae3efe0` と文書commitを分離し、固定topic・旧候補・原本・他ownerを変更しない。
統合候補とmain反映可否はGit safetyの別gateであり、本書は統合方式・公開・shared writeを承認しない。


## Component version metadata整合（0.37.1・2026-10-15）

main `32f4058c` の各owner正式versionへStudio側mirrorを追従。
Port1.23.0 / Chord1.21.0 / Pitch2.30.0 / Fretboard2.25.0 / Rhythm1.20.0。
Port ESM参照cache key、Studio patch・asset/module参照・厳密version試験を整合。
全component個別照合とPort参照cache key検証を追加。Project schema1・製品機能は維持。
PR #1の独立モック、既存topic、旧不合格候補、NEWS・他apps・Shared・Workerは変更しない。
修正は独立保守branch内。統合候補・正式設計文書・公開可否は別gateで判定する。
今回の再実行: metadata29 / Node916 / 正規Browser15 suite＋Structure conversion413 PASS、FAIL0・skip0。
合成443Hz・48000Hz/mono/16-bit PCM・3秒を指定。Console/404/禁止通信0、No-write維持。


## Common Music Model + Structure Read-only Conversion Core v1（2026-10-14・現行）

Studio **0.37.0**（memory-only変換APIのminor）/ Port **1.22.18** / Chord **1.20.1** / Rhythm **1.19.1**。
開始HEAD / origin/main / remote main=`126820db055c3db590c6552bcccc0ace1a90c97f`、tracked/staged空、ahead/behind0/0。
既存`.claude/`・Sync node_modules保持。NEWS差分なし。並行開発Git契約を適用し、全体cleanの旧条件へ戻さない。
Studio schema **1** / Authority physical **2**維持。

4/4・480 PPQ・1920 ticks/measureだけを受理するpure Common Music Model v1を追加。
melody/harmony/guitar strokeを分離、綴りはChord pure owner、実音はStudio既存移動ド/カポ規約を再利用。
C♯/D♭、臨時記号、B♯/C♭のletter octave、カポのoctave carry、実音MIDI0境界を保持。
小数/不正音高/音価/小節越え/overlap/非4/4を補正せずfatal。未知コードは原文とwarning、欠損コード音価はunresolved。
voicing/string-fret/使用弦/運指はnull。Rhythm preset/Chord form/五線譜/TAB/保存/Transportは未接続。

正式active Structure sessionのimmutable workingから変換。readRevision追加はgetItemだけで外部raw revisionを比較し、
保存/JSON解析/採用/通知は行わない。IME/Modal/commit/pending/conflict/deletion/future/unobserved revisionを拒否し、
base/history/readinessを変えない。既存Pre-DTM capture/JSON/MIDIは不変更。
source identity・snapshot location・legacy provenance・fatal/warning/unresolvedを保持。
Shellの既存activate世代だけを公開し、A-B-A/Undo/Redo/workspace往復/外部更新/別service/reloadの旧resultを拒否。
第二draft/clock/datasetなし。deep immutable・deterministic。2048 bars/展開32768 events/100000 nodes/2Mi chars/depth32の予算を先に確認。
診断256上限でもfatalを保持する。元projectの自動書換・保存schema変更なし。

検証: baseline Node **806 PASS** → 新規Core **64 PASS**、全Node **870 PASS**。
正規Browser15 suite **406 PASS**、新規変換API **7 PASS**（親含む）、計 **413 PASS**。
実MIDI bytes/Pre-DTM意味的JSON、dirty/current/Undo/Redo/A-B/workspace/IME/Modal/focus/4 Themes/Print、
convert repository write0・外部dataset/Authority/ProDevice/Account/Sync/outbox/Worker mutation0、console/404/unexpected通信0。
Studio全体version/cache/mirror整合。旧Host単独補助試験はhidden Start既知FAILの別記録を維持し、今回は未実行。
使い捨てChrome/別8767/合成micのみ。既存8765/8766/profile/既存untracked不触。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**、Daybreak待機維持。
本番deploy/D1/cutover/新規security probeなし。次はChord推奨フォームadapter、Rhythm import-safe reader、描画の段階設計。
詳細: [Common Music正式契約](docs/COMMON_MUSIC_MODEL.md)。以下は各工程時点の履歴。

## Structure Domain Undo/Redo UI & Keyboard v1（2026-10-14・履歴）

Studio **0.36.0**（製品Undo/Redo UI/shortcut追加のminor）/ Port **1.22.18** / Chord **1.20.1**。
指定基点7318efcaの後のNEWS-only 2 commitを祖先・変更範囲で確認し保持。
実測HEAD / origin/main / remote main=`41567bb52ffd92d9056ed173adecda4b779c2099`、tracked/staged空・ahead/behind0/0。
Studio schema **1** / Authority physical **2**維持。

Structure toolbarへ「元に戻す」「やり直す」を追加し、既存Coreのundo/redoへ正式command routerで接続。
Cmd/Ctrl+Z・Shift+Zはactive Structure非入力領域だけ。input/textarea/select/contenteditable/readonly等はnative owner。
strum buttonの局所keydownだけ明示委譲。native/domain同時発火なし、別workspace/Modal/IME/just-composed/flight/deleted/recoveryを拒否。
pointerdownは先行blurを抑え、live groupと未確定section名を正式確定してから実行。disabledと実行APIに同じeligibilityを使う。
ARIA/title/shortcut案内、既存semantic tokens、390px action strip、Print除外。

新編集/履歴/group/Save/external/project/workspace/Modal/IME通知でUI同期。古いsession通知は無視。
非構造で現在field/caret/scrollを復帰、構造ではstable bar IDが無いため選択/Loupe解除。
正式反例で、重複Loupe RAFによるfocus喪失とDOM removal中の旧section change再適用を修正。
section controlのcontent frameを最終照合し、同じ反例で名前/cursor/focus復帰を確認。
Core意味/stack/payload/capacityは不変更。saved/base/revision不変、dirty/競合保持、Pre-DTM current JSON/MIDI・不変出力を維持。

検証: baseline Node **721 PASS** → 新規command/UI **57 PASS**、全Node **778 PASS**。
Browser結果: 既存14 suite **353 PASS**＋新規UI **53 PASS**（親含む）、全15 suite **406 PASS**。
実native Cmd+Z/Shift+Z、button/shortcut A–H、4 Themes×390–1920/Print/Audio/read-only Hostを確認。
Undo/Redo repository write0、Port/Authority/ProDevice/Account/Sync/outbox/Worker/cloud mutation0。
console/app404/unhandled/禁止通信0。source/display0.36.0一致。正式repo独立8767/disposable Chrome/synthetic micのみ。

製品domain Undo/Redoを公開。native履歴の統合やreload/crash復旧は未対応。実OS IME/Safari/他OS/プリンター/DAWは未検証。
既存popover pointer配置・Transport等は別工程。次は実機受入と残るStructure PC操作課題の選定。
Port/Shared/Worker/NEWS製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**。
Daybreak待機/L3c境界維持。既存8765/8766/PID25543/profile/untracked不触。probe/deploy/D1/cutoverなし。
詳細は[Undo/Redo正式契約](docs/DOMAIN_UNDO_REDO_UI.md)。以下は各工程時点の履歴。

## Structure Text Input History & IME v1（2026-10-14・履歴）

Studio **0.35.0**（文字入力・IME履歴接続機能のminor）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`119fec5777c9855e39d311323caf747d4df24372`、tracked/staged空、ahead/behind0/0。
Studio schema **1** / Authority physical **2**維持。

曲名/artist/capo/BPM/key/拍子、grid/Loupeコード・ドレミ、歌詞tick、基本strumをEditing Session Coreへ接続。
同一field/論理targetの連続入力をCore内で1entryへ合体し、最新draftは入力ごとにatomic公開。
blur/Enter/focus/field/project/workspace/Save/ACK/IME/native履歴/別操作でgroup終了。第二stackなし。
section名は既存change離散確定を維持。no-op/branch/capacity/out-of-band/保存・競合のCore契約を維持する。

IME途中はDOM bufferのみ、確定時1entry。旧Loupeの途中draft直接更新を明示的に置換し、Inspectorは既存draft＋editingを表示。
composition後の同値input二重記録なし、just-composed/229/保存・出力block維持。
native Cmd+Z/Shift+Zはbrowser ownerへ渡し、実inputを新しいdomain編集として同期。domain Undoは同時に呼ばない。
通常入力でLoupe/grid/form DOMを保持し、caret/focus/scroll・native履歴を不要に失わない。
FileReader/RAF/遅延blur/IME owner ticketをguard、A/B/Pre-DTM workingとimmutable出力を維持。

検証: baseline Node **683 PASS** → 追加text **38 PASS**、全 **721 PASS**。
Browser結果: 正規13 suite **315 PASS**＋新規text **38 PASS**（親含む）、全14 suite **353 PASS**。
実native Undo/Redo/clipboard paste、保存後dirty/clean、IME模擬/取消、4 Themes/390–1920/Printを確認。
入力履歴repository write0、Port/Authority/ProDevice/Account/Sync/outbox/Worker/cloud mutation0。
console/app404/unhandled/禁止通信0。既存明示Saveは維持。source/display0.35.0一致。

製品Undo button/global shortcut未公開。明示対象/構造/表示/range/adopt等のDOM再構築後はnative履歴継続を保証せず、
終了したdomain entryを保持。実OS IME/Safari/他OS/プリンター/DAWは未検証。
次はDomain Undo/Redo UI/Keyboard readiness。既存popover pointer配置・crash復旧等は別工程。
Port/Shared/Worker製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**。
8765/8766/profile/既存untracked不触。動的probe/deploy/D1/cutoverなし。Daybreak待機/L3c境界維持。
詳細は[Text正式契約](docs/STRUCTURE_TEXT_HISTORY.md)。以下は各工程時点の履歴。

## Structure Operation Adapter v1（2026-10-14・履歴）

Studio **0.34.0**（離散操作の履歴接続機能によるminor）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`a6a12cb833fbd55c486067f1452c5f3fcd20d567`、tracked/staged空・ahead/behind0/0。
Studio schema **1** / Authority physical schema **2**維持。

既存Editing SessionのrunOperationへStructure離散操作を接続。section追加/削除/確定名変更、section小節数増減、
strumセル/基本へ戻す、コード/ドレミ一括、譜面表示設定をstaging draftへ適用し、複合setterを1entryで公開する。
no-opはentryもcontent tokenも進めない。例外/取消は旧draft/historyを保持。独立stack/writerは作らない。
存在しないbar独立CRUD/strum一括は追加しない。文字入力/IME/native Undo、製品Undo UI/shortcutは未接続。
実際の直接draft変更はCoreのout-of-band barrierで古い履歴を無効化し、現在内容を保持する。

構造変更時はbarNumber選択/Loupeを解除。inactive projectの構造外部採用も旧番号を復元しない。
非構造公開では歌詞局所解像度を維持。FileReaderとfocus RAFにsession/content/ticket/selection/focus owner guardを追加。
DOM置換だけなら必要なfocus復帰を許可し、新inputへ旧valueを戻さない。
saved/base/revision不変、通常保存成功/失敗・pending/conflictの履歴保持、clean adoption/resetを維持。
A/B/workspace別のsessionとPre-DTM現在working JSON/MIDIを維持する。

検証: baseline Node **654 PASS**、追加Adapter **29 PASS**、全Node **683 PASS**。
Browser結果: 正規12 suite **270 PASS**＋新規Adapter **45 PASS**（親を含む）、計 **315 PASS**。
Adapter repository write0。既存Studio明示保存は維持。Port/Authority/ProDevice/Account/Sync/outbox/Worker/cloud mutation0。
console/app404/unhandled/禁止network0。4 Themes×390–1920/Print/IME/Modal/focus/Audio/read-only Hostを確認。
隔離8767 / disposable Chrome / synthetic micのみ、source/display0.34.0一致。

一括popover適用buttonのpointer到達不良は基点でも再現。今回はnative keyboard Enterで実適用を検証し、
既存pointer配置修正は別UI工程に残す。実OS IME/Safari/プリンター/DAWは実機範囲。
次は連続入力/IME/native Undo境界の段階接続。製品Undo UIはowner/group/focus条件の検証後。
Port/Shared/Worker製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**。
Daybreak待機/L3c境界維持。既存8765/8766/PID25543/profile/untracked不触。probe/deploy/D1/cutoverなし。
詳細は[Structure Operation契約](docs/STRUCTURE_OPERATION_HISTORY.md)参照。以下は各工程時点の履歴。

## Editing Session Domain History Core v1（2026-10-14・履歴）

Studio **0.33.0**（domain履歴Core APIの新機能によるminor。Undo UIは未公開）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`5b990d3e28ed0b9099bbe4f68cd462964d6dba49`、tracked/staged空、ahead/behind0/0。
Studio schema **1** / Authority physical schema **2**維持。

Editing Sessionごとのepoch / immutable before-after entries / cursor / openGroupを追加。
同期begin/commit/cancelOperationとrunOperation、undo/redo、canUndo/canRedo、getHistory、clearHistoryを公開する。
操作はprivate staging draftへ書き、既存draft/working/playback/dirtyは確定まで維持する。
検証と次trackerの準備を済ませてから内容を1回だけ公開。no-op / cancel / 例外はentryもRedo破棄も起こさない。
projectId / schemaVersion / createdAt / appVersion / updatedAtは履歴payloadから分離して保護し、未知fieldを保持する。
内容変更時はsnapshotVersionを進め、Undoで古いtokenへ戻さない。

履歴未接続の既存Structure編集は継続。実際の直接変更は古い履歴/openGroupをinvalidateし、現在draftを保持。
Undo/Redoとoperation確定前には期待内容・identityを照合し、通知を迂回したdriftもfail-closedで拒否する。
通常保存成功は履歴保持、dirtyは現在baseとの差分で再計算。保存中Undo/Redo拒否、追加編集・発行元へのACKは維持。
clean再保存failureのmetadata-only新revisionでbase/history/errorを消す反例を正式Nodeで修正前FAIL確認。
failure currentはpendingへ置き、明示採用までbase/history/errorを保持する。Repository書込方式と成功ACKの意味は不変更。
dirty external pendingではbase/draft/history/conflictを保持。Undoでcleanでもconflictを解除しない。
clean adoption / 明示採用 / cancel / 同project replaceDraft / destroyは履歴reset。外部削除はdraft/history保持・Undo/Redo停止。
A/B/Aはsessionごとに独立し、reloadで履歴は復元しない。

予算はsessionごとに**100 entries / 8MiB UTF-8 before-after payload**。labelは120 UTF-16 code unitsまで。
規模調査の合成同一小節project: 16/64/256/1024 bars = 12,251 / 45,515 / 178,728 / 711,745 bytes。
件数/bytes超過は古いcomplete entryから退去。単一巨大操作はvalid draftを公開し、古い全branchを捨ててoverflowを明示。
draft/base/savedを削除せず、記録不能な操作をcanUndo=trueと表示しない。これはJS heap総量・crash復旧保証ではない。

検証: baseline Node **580 PASS** → 新規history **74 PASS**、全 **654 PASS**（clean guard含む）。
正式Chrome12 suite **270 PASS**。最終ソースの回帰記録とno-write各項目0をrequired gateとする。
隔離8767 / disposable Chrome / synthetic micのみ。source/display0.33.0一致、console/app404/unhandled0。
Coreによるrepository write0。Port/Authority/ProDevice/Account/Sync/outbox/Worker/cloud mutation0。
既存Studio明示保存、Active Document、Pre-DTM working/JSON/MIDI、Audio、focus/Modal/IME、4 Themes/Printを維持。

**未接続**: Structure各編集経路、再描画adapter、native Undo統合、Undo/Redoボタン、Cmd+Z/Cmd+Shift+Z。
次はStructure Operation Adapter。離散操作から段階接続し、未接続操作のhistory barrierを維持。
FileReader / RAFのcontent token・focus owner検査、IME操作単位とnative履歴、再描画通知は接続工程の必須条件。
UIは全対応済みと誤表示せず、Core完成をStructure Undo製品完成と扱わない。

Port/Shared/Worker製品コード不変更。Host等はStudio import cache query更新のみ。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**、Daybreak待機/L3c境界維持。
既存8765/8766・PID25543・利用者profile・untracked不触。認証probe・本番deploy・D1・cutoverなし。
詳細は[Domain History Core契約](docs/DOMAIN_HISTORY_CORE.md)参照。以下は各工程時点の履歴。


## PC Shell / Dock / Narrow Layout Polish v1（2026-10-14・履歴）

Studio **0.32.0**（Navigation・Dock詳細のUI変更によるminor）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`a4f053cf90e28bbef947e8fe8f66f79d82113053`、tracked/staged空、ahead/behind0/0。
Studio schema **1** / Authority physical schema **2**維持。
stage直前に並行NEWS文書commit `0e3dad0d29db276be045b7caa0fb92541eeab993`を検知。
指定基点のdirect child、NEWS-SOURCE-DECISION-REGISTER.mdのみ、HEAD/origin/remote一致・分岐なし・Studio不変更を確認し、許可された並行commit規則に従ってこの親から継続する。

修正前の正式Chrome反例5件で、390px Structure / Pre-DTMのMain横超過（247→265px）、
Loupe左端−16px、Dock高さ192px（600pxの32%）、Global Stopの画面外/操作不能を確認した。
600px以下ではNavigationを上段の局所横scrollへ切替え、Mainの全幅を確保。
toolbarの固定min-widthとPre-DTMのgrid最小幅を解除。狭幅の操作列のみ局所横scrollし、native Tabで各操作へ到達する。
Global Stopと再生中StopはNavigation scrollから分離。同じ既存Audio Coordinator.stopAll()を使う。

Loupeは実Main幅内へ左右8pxでcontainし、280px最小幅も可用幅を超えない。
狭幅でもmove/resizeでき、実Loupe幅でheaderを折返す。低高さでは上端除外を操作reserveまでに制限し、
残りの実高さで内部scrollする。window resizeもgeometry-onlyへ変更し、入力DOM・focus・IMEを保つ。
Dockは既存engine一つのままBPM / toggle / 拍 / 状態を優先。個別Start/StopとStandard説明はnative詳細へ整理。
memory保存状態は閉じた詳細summaryでも可視。未実装Transportは縮小し「準備中」と明示。
Dock開閉・workspace移動でMetronomeを停止/再開せず、Global Stop後も自動再開しない。

検証: baseline Node **560 PASS** → 新規20件を含む全 **580 PASS**（clean guard含む）。
Chrome: 既存正規11 suite **252 PASS**、新layout **18 PASS**、計 **270 PASS**（親12含む）。
正式repo独立8766 / 使い捨てChrome / 合成micのみ。6幅390/480/768/1024/1440/1920 × 高さ600/900 × 4 Themes。
Loupe drag/resize/keyboard/scroll/selection/pane/復帰、Dock詳細操作・8回開閉・BPM151保持、
低高さnav scroll中Global Stop・Tuner cleanup・focus/Modal/IME・Pre-DTM JSON/MIDI・A4 PDFを確認。
スクリーンショット14枚とA4 PDFを作成し、4 Themes、Structure/Loupe、狭幅Pre-DTM/Dock、Printを目視確認。
禁止write/DB creation/予期しないproject変更/console error/app404/unhandled **0**、画面/source0.32.0一致。
既存試験の変更はversion、詳細を開く経路、resize後のpane settle。音声・bounds・no-writeのassertionは保持する。

Port/Shared/Worker製品コード不変更。Studio Host等はimport cache ?v=更新のみ。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=false**。
Daybreak待機/L3c境界維持。既存8765・利用者profile・untracked不触、動的認証probe・deploy・D1・cutoverなし。
Safari / 実OS IME / 実device音声 / 普段の画面倍率の実機確認は未実施。
次はこのPC layoutの実機操作確認を優先し、その結果から次の通常PC機能を選定する。
詳細は[PC layout契約](docs/PC_SHELL_LAYOUT.md)参照。以下は各工程時点の履歴。


## Workspace Focus Restoration v1（2026-10-14・履歴）

Studio **0.31.2**（focus復帰のbug fix）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`c0f32687f0998c3a19870327d42a59c73e60f1ff`、tracked/staged空、ahead/behind0/0。
Studio schema **1** / Authority physical schema **2**維持。

Practice / Gear / My Appsのactivate再描画でDOM参照が失効する反例を正式browserへ追加し、修正前3 FAILを確認。
既存focus routingへworkspace/list/item ID/roleによるopt-in復元を追加し、現在のDOMへ戻す。
Practice menu/set/history、Gear/My Apps item、検索・caret・filter・read/moreを区別。historyはnative Tab到達可能なreadonly行。
focusだけでselection/query/filter/order/detail/Port値を変更しない。削除・非表示・futureはread→rootの安全fallback。
現在workspace / Modal / IME / 新input ownerを確認し、旧read結果がfocusを奪わない。Modal終了も再生成triggerをIDで解決。
新timer/listener/observer/shortcutなし。既存Structure/LoupeとActive Documentの復帰経路を維持する。

検証: baseline Studio Node529 PASS → 追加31を含む**560 PASS**（clean guard含む）。
Chrome: 新規focus **19 PASS**＋既存正規10 suite **233 PASS**、計**252 PASS**（親11含む）。
正式repoの独立8766 / 使い捨てChrome、4 Themes×390/768/1024/1440/1920、選択分離、外部rename/delete/stale/error/future、
Modal/IME、高速往復・遅延read、Structure/Loupe/Print/reload/50 disposeを確認。画面/source0.31.2一致。
禁止write・binary/Authority作成・予期しないproject dirty・console/app404/unhandled rejection **0**。
Port/Shared/Worker製品コード不変更。Studio Host等はimport cache ?v=の更新のみ。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**、Daybreak待機/L3c境界維持。
既存8765 / 利用者profile / untracked不触。新規動的認証probe・deploy・D1・cutoverなし。

次はPC Shell / Dock / Narrow Layout Polish。390px toolbar/Loupe overflow、Dock密度、domain Undo、実機確認は残る。
詳細は[Focus復帰契約](docs/WORKSPACE_FOCUS_RESTORATION.md)を参照。以下は各工程時点の履歴。

## Structure / Pre-DTM Active Document Alignment v1（2026-10-14・履歴）

Studio **0.31.1**（対象曲ずれのbug fix）/ Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main=`171f31fa7dcc851d055554666c3ae48f3bd910c7`、tracked/staged空、ahead/behind0/0。
Studio schema **1** / Authority physical schema **2**維持。

既存registryのactive Structure sessionを唯一のdocument正本にし、Pre-DTM selectorも正式ownerへ委譲。
A→Pre-DTM→新規dirty B→Pre-DTMで古いAを出力する反例を正式browser試験に追加し、修正前FAILを確認。
修正後はBのJSON/MIDIとdraft/base/dirty保持。同じ曲のworkspace復帰はreloadせず、A/B/Aも個別sessionを保持。
出力は開始時のimmutable working snapshot・設定へ固定。旧完了statusとFileReaderは対象世代が変われば適用しない。
保存待ち・IME未確定・dirty external conflict・削除・future/invalid・読取不能・対象なしではPre-DTM出力をblock。
新規/未保存/保存済み/削除draft/対象なしを表示。表示/出力によるproject自動保存なし。
伴奏設定はADR-014どおり全曲共通appSettings。曲別設定mapや新schemaは作らず、明示設定変更だけを保存する。

検証: baseline Studio Node497 PASS → 新規32を含む**529 PASS**（clean guard含む）。
Chrome: 既存正規9 suite**219 PASS**＋新Active Document**14 PASS**、計**233 PASS**（親10含む）。
A〜E、保存/reload/外部更新/削除/future/空、旧FileReader、出力中切替、draft/focus、4テーマ×390/768/1024/1440/1920、Printを確認。
No-write各項目0、console/app404/unhandled rejection0、画面/source0.31.1一致。
正式repo rootの隔離8766 / 使い捨てChrome / 合成micのみ。既存8765・利用者profile不触。

Port/Shared/Worker製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**。
Daybreak待機/L3c境界維持、新規動的認証probe・deploy・D1・cutoverなし。
次はWorkspace Focus Restoration。一覧focus復帰、390px toolbar/Loupe overflow、Dock密度、domain Undoは未修正。
詳細は[Active Document契約](docs/ACTIVE_DOCUMENT_ALIGNMENT.md)を参照。以下は各工程時点の履歴。

## Studio Gear & My Apps Read-only PC Workspace v1（2026-10-14・履歴）

Studio **0.31.0** / Port **1.22.18** / Chord **1.20.1**。Studio schema **1** / Authority physical schema **2**維持。
開始HEAD / origin/main / remoteは`f859b9c968e2e19b5c454201bab01b6be0d5cadb`、tracked/staged空・ahead/behind0/0。
既存PortDataHostの同一snapshotからGear/My Appsのimmutable projectionを追加し、2つの正式Shell workspaceへ接続。
Gear schema5 / categories1の所有状態・保存order・category・manufacturer/name・memo・photo参照を表示。
Gear schema1–4はmigration-writeを起こさずreadonly unavailable。category欠損はPortのlabel→ID fallback、補修保存なし。
My Apps schema1–7の保存配列順・旧登録形式・platform URL・preset/custom icon参照・Practice menu/history参照を表示。
リンクは文字列のみ、launch/外部通信なし。写真/iconはmetadataのみ、binaryの存在を確定しない。
PortがdataOwner。独立保存dataset/writerなし、canWrite=false。未知field/soft ref/過去履歴を補正・書戻ししない。
検索/filterは一時状態。外部更新時も選択ID/query/filterを保持し、確定削除のみ解除。stale/error/future/empty等を区別。
4 Themes・広幅2列/狭幅1列・native keyboard/IME/Modal/focus・既存譜面専用Printに対応。

検証: baseline Node457 → **497 PASS**（追加40、clean guard含む）。既存Chrome8 suite197 PASS、新規22 PASS。
Port関連4ファイル56 PASS。2001件ずつの全model保持、50回mount/disposeのlistener残存0。
禁止write/binary DB open/Authority create/object URL/外部通信0、console/app404/unhandled rejection0。
独立8766/使い捨てChrome、画面/source0.31.0一致、既存8765不触。契約・未接続範囲は[Gear/My Apps PC契約](docs/GEAR_MY_APPS_PC_PRESENTATION.md)を参照。
Port/Shared/Worker製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**維持。
Daybreak待機/L3c未解決境界を維持し、動的認証probe・本番deployなし。次は実機閲覧確認と通常PC機能の優先度整理。
以下のversion・件数・未実装記述は各工程時点の履歴。


## Studio Tuner Standard PC v1（2026-10-14・履歴）

Studio **0.30.0** / Port **1.22.18** / Chord **1.20.1**。Studio schema **1** / Authority physical schema **2**維持。
開始HEAD / origin/main / remoteは`6e6bb399cea7c054f408da3397a5befd1983bfdc`、tracked/staged空・ahead/behind0/0。
Port pure `tuner-engine.js`を直接importし、アルゴリズム複製なしでStandard chromatic検出をPC workspaceへ接続。
A4=440Hz、70–1400Hz、Port UI既定入力閾値−80dBFS。実音名/octave/Hz/cents/confidenceとmeterを表示、null時は即clear。
capo・指定調弦・reference preview・設定保存・device選択は未接続。既定入力device、device ID永続化なし。
既存Coordinatorのmicrophone leaseとcontext ownerを利用し、mic/outputを対称排他にする。
Metronome→Tunerは同じleaseへの明示確認後だけ停止し、token変更/Global Stop後の古い意図を拒否。自動再開なし。
Stopは解析と全track/nodeを同期停止し、context close成功後にleaseを解放。失敗は保持して明示retryする。
古いpermission/resume/stream/rejectを新sessionへ採用しない。workspace離脱/hidden/pagehide/interruption/track-endedで停止する。
Global Stopは既存stopAll。native keyboard、IME/Modal/focus、4 Themes、390–1920幅、既存譜面専用Printへ対応。

検証: baseline Node420 → **457 PASS**（追加37、clean guard含む）。既存Chrome7 suite174 PASS、Tuner23 PASS。
Port既存Engine1ファイルPASS。50回native Start/Stopのtrack/context/timer残存0、listener増加0。
禁止write/DB open/create/network mutation0、console/app404/unhandled rejection0。隔離8766/使い捨てChrome/fake micのみ、既存8765不触。
実マイク音質・精度/物理device/OS/Safariは未検証。正式契約と未接続事項は[Tuner統合契約](docs/TUNER_INTEGRATION.md)を参照。
Port/Shared/Worker製品コード不変更。Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**維持。
Daybreak待機/L3c境界を維持し、認証/認可の動的probe・本番deployなし。次は実機Tuner確認と通常PC機能の優先度整理。
以下のversion・件数・未実装記述は各工程時点の履歴。


## Studio Practice Read-only PC Workspace v1（2026-10-14・履歴）

Studio **0.29.0** / Port **1.22.18** / Chord **1.20.1**。Studio schema **1** / Authority physical schema **2**維持。
開始HEAD / origin/main / remoteは`c2fcfef56f48fd575b88e523b70d168113bb8e09`、tracked/staged空・ahead/behind0/0。
既存PortDataHostから同一snapshotのPractice読み取り専用投影を追加し、ShellにPractice workspaceと正式Navigationを接続。
メニュー/詳細、セット/順序付き参照、全進捗、最近の履歴、Calendarの練習記録/予定、添付metadataを表示する。
Portが所有者。Studio保存済みdataset/Editing Session/write APIを作らず、canWrite=falseを維持する。
削除済み参照と履歴の過去名を保持し、future/invalidを削除扱いにしない。外部更新はstable ID選択を保持し、確定削除だけで解除。
loading/error/stale/absent/empty/非対応形式を区別。添付本体DBは開かず、local-only添付の有無は未確認と明示する。
4 Themes、広い画面の一覧+詳細、狭い画面の1列、native keyboard、既存IME/Modal/Escape/focus ownershipに従う。
既存譜面専用Printの対象にPracticeを含めない。50件ずつUI表示し、history8101/Calendar1501の全modelを保持。

検証: Studio Node420 PASS（381 baseline+39追加、clean guard含む）、既存Chrome6 suite154 PASS、Practice20 PASS、Host10ケースPASS。
Port関連6ファイル68 PASS。readerのPort/IDB/Practice/Authority/Account/Pro Device/Sync-outbox/Worker/Cloud/binary write・取得0。
console/app404/unhandled rejection0、画面/source0.29.0一致。隔離8766/使い捨てChromeのみ、既存8765不触。
契約・正式schema・未接続境界は[Practice PC契約](docs/PRACTICE_PC_PRESENTATION.md)を参照。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
L3c未解決/Daybreak待機を維持し、新規security probe・本番deployなし。通常PC UI gateをAuthority安全性承認やM3解禁と扱わない。
次はPractice実機確認とPC機能優先度整理。編集/添付本体/正式共有write/Account/Syncは別工程。
以下のversion・件数は各工程時点の履歴。


## Studio Chord Standard PC Presentation v1（2026-10-14・履歴）

Studio **0.28.0** / Chord **1.20.1** / Port **1.22.18** / Studio schemaVersion **1**。
開始HEAD / origin/main / remote=`590c3cd0a926bd7201f42144f41b13692d460bc3`、tracked/staged空・ahead/behind0/0。
前回Studio commit `174dad81`の後に正式NEWS commitが1件あり、3 refs一致とStudio/Port不変更を確認した。

Structureの現在の単一小節選択とEditing Session draftを、読み取り専用Inspectorへ接続。
major / minor / 7 / maj7(M7) / m7 / sus4 / add9 / slashの入力コード名・構成音・音名・root基準度数・bassを表示する。
Chord Cruiseのpure theory/modelを実sourceから再利用し、Studio既存記号parserからの狭いsyntax bridgeだけを追加。
未対応/曖昧/advanced表記を自動変換せず、未選択/空/入力中/複数/削除/別workspaceでは古い解析詳細を解除する。
IME中は既存Structure draftを変更せず、partial記号を解析しない。dirty external updateはdraft/baseを維持する。

Inspectorから選択・project・draft・Chord保存値を変更しない。入力/shortcut/Save/apply/指板操作を持たない。
現行Chord policyと今回の指示の指板表示境界差を棚卸しし、今回の指示どおり指板/CAGED/運指/ライブラリを未接続とした。
高度分析・Pro保存・認証/認可・共有保存・Account/Sync/Authorityは接続しない。metadataはauthorizationではない。
既存Shellのpane/keyboard/Modal/focus/Loupeへ従い、4 Themes・Print・workspace/resize/reload・購読解除を確認する。

検証: Studio Node381 PASS（追加41）、正規Chrome6 suite154 PASS（親6含む）、Host10ケースPASS、Chord pure/policy13ファイルPASS。
No write各項目0 / console error・app404・unhandled rejection0。独立8766でsource/display v0.28.0一致、既存8765不触。
契約・11機能のStandard/Pro分類・API・検証結果は[Chord PC Presentation契約](docs/CHORD_PC_PRESENTATION.md)を参照。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
L3c未解決問題とDaybreak待機に触れず、新規セキュリティprobeなし。Authority安全性承認やM3解禁ではない。
次は通常PC機能の優先度整理（Practice read-only等）。正式共有write/B1-6再開は保留する。
以下のversion・件数は各工程時点の履歴。

## Studio Metronome PC Presentation v1（2026-10-14・履歴）

開始HEAD / origin/main / remote mainは`9a1e77e146947bfaabe8abec2ef450b793952257`。
Studio **0.27.0**（PC UI追加によるminor）/ Port **1.22.18**（不変更）/ Studio schemaVersion **1**。

Dockに大きな現在BPM、Start/Stopトグル、4拍の現在拍表示、Standard実効設定と一時設定の説明を追加。
従来の個別Start/Stopも維持する。トグルのSpace/Enterはそのボタンだけが所有し、IME/just-composed、repeat、Modal、hidden/inertを拒否。
BPM Enterは確定後も入力focusを保持。Cmd/Ctrl+Sは既存Structure Saveの対象を維持する。

拍表示は既存M1 engineの`onVisualEvent`（AudioContext時刻で排出するvisual queue）からだけ更新する。
独立timer・第2拍時計・新engineは追加しない。run identity / generation / leaseで旧通知を拒否し、Stop時にbeatを同期消去。
BPM変更は既存reschedule、Start失敗/遅延取消/再Start/Coordinator cleanupは既存ownerの停止・close・lease解放を使う。
workspace移動、Dock折畳み、Theme、visibility通知は自動停止/開始しない。折畳み中はNavigationのStopへ到達できる。
view disposeで購読とcontrol listenerを解除し、runtime disposeで既存page/visibility/device listenerと資源を解放する。

Tool paneは既存PortDataHostの凍結read modelだけを表示する。保存設定、順序付きpreset一覧、stable IDによる選択、名前/BPM/形式/Standard情報の詳細を追加。
保存BPMまたは選択presetの対応形式のBPMだけを、**明示操作**でM2のStudio memoryへ反映できる。
これはPortへの正式preset applyではなく、advanced値を反映せず、Port datasetを複製/保存しない。
Host自身・connection・資格判定を変更せず、canWrite=false、全write capability=falseを維持する。
外部更新は閲覧modelだけを更新し、dirty Structure、M2 memory、再生状態を無断変更しない。

未確認/正常読込/保存データなし/読込中/stale/読込失敗/invalid/futureを区別する。
future値は既知BPMの閲覧のみで一時反映不可。失敗時は原保存値を変更せず、明示再試行を案内する。
stale中は古い値を操作可能な現行値として扱わない。Hostのgeneration無効化に従い旧modelを解除する。
pagehideでHost購読/consumerを解放し、BFCache復帰では未確認Hostを再生成する。memoryはreloadで120へ戻り、自動再生しない。

検証: 変更前Studio Node **315 PASS**、追加25件を含む全 **340 PASS**。
既存正規Chrome4 suite **97 PASS**（親container4含む）、read-only Host **10ケースPASS**、PC Presentation **26 PASS**（親container1含む）。
計128独立browserケース。1440/1024/1920/680px、4 Themes、keyboard/focus/IME、現在拍、BPM変更、Start/Stop反復、遅延resume取消、
workspace/Dock/resize/reload/visibility、read delay/stale/失敗/retry/future、Structure dirty共存、A4 Printを確認。
新PC suiteのfixture投入後のapp操作: Port localStorage / Port IDB / Authority DB create / Pro Device Session / Account / Sync outbox /
Worker mutation / cloud publish **0**。console error / app404 / unhandled rejection **0**。
独立loopback8766は正式repoを配信し、表示v0.27.0とsource一致。使い捨てChromeを使用、旧8765（調査時v0.22.4）は不触。
変更した旧テスト期待値はStudio version、追加toggle数、Dock高さ上限のみ。主要controlの画面内到達性・音声・IME・無書込み検査を維持。

**未接続**: 正式preset apply/CRUD、advanced renderer、Pro write、Account/Sync操作、共有保存、Transport同期、mic。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
L3cの独立安全監査とDaybreakを待機し、今回新規認証競合/攻撃probeを実施しない。本工程の完了はAuthority安全性承認ではない。
次は通常PC機能の優先度整理（Chord Standard Inspector / Practice read-only等）。M3 write解禁・B1-6再開は保留する。
本番deploy / cutover / D1操作は行わない。以下のversion・件数・完了表記は各工程時点の履歴。

## L3c Observed Revocation Safety Fix（2026-10-13・履歴）

開始HEAD/origin/main/remote main=`a6b5bcd988995585f2ed80e40175f3924e1b0d6f`、tracked/staged空、ahead/behind0/0。
Port **1.22.18** / Studio **0.26.12** / Studio schema1 / Authority physical schema2・9 stores。
[観測済み失効の正式契約](../cruise-port/docs/PRO_TERMINAL_DENIAL_CONTRACT.md)を参照。限定対象はterminal伝播・不正clockのsticky拒否・fresh native oracle。

正式challenge/renew/sessionの401＋ok=false＋invalid_credential/reauth_requiredだけを対象資格terminalとする。
device/proof mismatch、未知401/403・不正bodyは新規認可を拒否し、503/429/network/timeoutは既存bounded grantだけを維持。
検証request identity、credential/receipt指紋、Pro generation/sessionVersion、開始operation revisionを固定。
既存shared sourceへ同期ラッチ→pending revoke→同一資格auth除去/revision更新→対象receipt forgetを反映し、完了をawaitする。
同資格の途中revision更新はterminalを解除しない。別資格Bのauth/epoch/receiptを旧Aの応答で変更しない。
更新失敗はpropagationFailed、旧handle・offline・別Adapter/renderer・reopenを拒否。別DBの原子性は主張しない。
未確定retryは現資格で元identityへ再認可。確定replayは履歴のみ、publish=false。
非有限wall/mono・provider例外・origin異常は旧proofへstickyに保持し、正常な5分wall補正は維持する。
後続request開始を観測した後に先行snapshotを再取得し、completion欠落はinconclusive。round/assertionを減らさない。

修正前反例Node3/native3を保持。新規Node39＋oracle4、native Observed Revocation13＋7を正式追加。
required回帰の実測・故障回復条件・fixture修正理由は上記契約の検証記録へ集約する。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**。
通常bootへ新Authority/Adapterを接続しない。本番deploy/D1/cutoverなし。
L3d以降未着手。次は限定独立安全監査、B1-6再開/shared write解禁不可。
以下は各工程時点の履歴。

## L3c Trusted Pro Device Session Integration（2026-10-13・履歴）

Port **1.22.17** / Studio **0.26.11** / Studio schema1 / Authority physical schema2・9 stores。
開始HEAD/origin/main/remote main=`cb1ce792675d0d67ed095ccbacfe2ad1c77db54b`、tracked/staged空、ahead/behind0/0。
[正式Pro Adapter契約](../cruise-port/docs/AUTHORITY_PRO_DEVICE_ADAPTER.md)を参照。正式SoundCruiseProOperationSource、Device Session receipt、既存操作resolverを使う。
任意source/client/boolean/guardを受け付けず、正式read-only receipt検証を通したprivate contextだけをStoreへ接続。
scope/Authority generation/operationId/action/payload/targetとPro generation/sessionVersion/operation revision/credential指紋を固定。
raw credential/key/receiptはAuthority・通知・reportへ保存しない。Control capability/evidenceとPro proofは別brand・別契約。

最終transaction内で同期assertCommitと両clockの30秒marginを確認。Proの5分補正許容を維持する。
観測済みsource失効・期限不足・clock origin変更は旧proofへstickyに保持。新しい非同期検証を要する。
未確定retryは元identityへ再認可、資格変更retag禁止。replayは過去factだけで現在のPro/cloud許可ではない。
Standard BPM/delete/applyはPro/Account不要、raw advanced値を保持。local ProにもAccount/AppDeviceを追加要求しない。

隔離fixtureのみ接続。既存legacy保存/製品Pro判定の挙動、Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
通常Port/Studio bootによる新Authority DB/Adapter writeなし。本番deploy/D1 migration/cutoverなし。
L3d以降未着手、B1-6再開/shared write解禁不可。最終回帰はAdapter契約の検証記録と完了報告を参照。
以下は各工程時点の履歴。


## L3b-2 Evidence Lifetime Safety Fix（2026-10-13・履歴）

Port **1.22.16** / Studio **0.26.10** / Studio schema1 / Authority physical schema2・9 stores。
開始HEAD/origin/main/remote main=`3007e79dba2d98fa97a841433bf43d633f6b9d03`、tracked/staged空、ahead/behind0/0。
[証拠寿命契約](../cruise-port/docs/AUTHORITY_EVIDENCE_LIFETIME.md)をControl契約と合わせて参照する。
修正前はresume/renewの期限切れ→wall rollback→同じprepared handle成功をNode2件・native2件で再現した。

証拠私有contextはwall expiry・monotonic deadline・clock origin・観測高水位・expired/invalidatedを保持する。
いずれか残予算30000ms未満または時計逆行/不正/origin変更で不可逆失効。30秒ちょうどは既存契約どおり許可。
同じevidenceIdの再attestでcontext/deadlineを再初期化せず、異payload再発行を拒否する。

reservationsのevidence-lifetime rowはprovider＋evidenceId/generation、digest/issuer/runtime/clock所有を固定。
別renderer/reload/reopenは既存証拠を再所有できず、新しいprovider証拠identityと新operationを要する。
monotonic値を異runtime間で比較しない。BroadcastChannelは正本ではない。
最終admissionと失効row更新・Control/fact更新は同じ8-store RW transaction。
拒否時は失効rowだけをcompleteして返す。abortでも私有ラッチと既存durable所有が残り、時計rollbackで復活しない。
旧未確定予約に寿命証拠が無ければ現在clockから補完しない。確定replay/lookupは過去factだけで制限を解除しない。

cross-tab JSONはstdout flush callbackを待って終了し、>64KiBのpipe出力をparseして検証する。
round/assertion/transaction gateは減らさない。通常scope/bootへprovider/Control/Authority DBを接続しない。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**。
L3c以降は未着手、B1-6再開/shared write解禁不可。本番deploy/D1/cutoverなし。
最新回帰結果は証拠寿命契約の検証記録と完了報告を参照。以下は各工程時点の履歴。


## L3b-2 IndexedDB Authority Control（2026-10-13・履歴）

Port **1.22.15** / Studio **0.26.9** / Studio schema1 / Authority physical schema2・9 stores。
開始HEAD/origin/main/remote main=`378866071929f761e4c9ad66ce21addfe0fbb7fd`、tracked/staged空、ahead/behind0/0。
[正式Control契約](../cruise-port/docs/AUTHORITY_CONTROL.md)をPointer/Action Policy/Repository契約と合わせて参照する。

6API: suspendWrites/revokeFence/invalidateIdentity/markRecoveryRequired/resumeWrites/renewFence。
停止側は厳密なidentity/generation bindingと冪等factを持ち、不要なexpectedEpochで拒否しない。
resume/renewは専用purpose・active Pointer・control/pointer CAS・current integrity・fresh branded evidenceが必須。
identity/recoveryラッチは通常resume/renew/publishで解除しない。healthy recoveryはread/export可能、dataset commit不可。

Control identity予約はdataset/publicationと同じgeneration＋operationId領域。拒否後の予約も保持し、異内容retag不可。
Control変更と成功factは8-storeの同一RW transactionで原子的。headを不要に変更せず、complete後だけ成功を返す。
replay/lookupは過去事実（historical=true/publish=false/operationAuthorized=false）で、現在の失効状態を解除しない。
capability/証拠はscope/generation/purpose/runtime leaseへ束縛し、dispose/versionchange/reopen後に旧objectを継承しない。

証拠は隔離test provider限定、製品provider未接続ならfail-closed。Account IDだけでなく両generation/membershipも照合する。
Worker D1 transaction fenceは最終cloud admission。既存Pro/Account/Sync guardを変更しない。
競合はrequest gateで両transactionの待機と実開始順を証明し、Date.now同値をPASS根拠にしない。

Production **legacy / Worker ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**。
Port/Studio通常bootへControl issuer/Authority DB/mutation/Pointer公開を接続しない。本番deploy/D1/cutoverなし。
L3c/L3d/L4/L5/B1-6製品入口は未着手。shared write解禁不可。
最終回帰: Control追加Node71 / Authority369 / Port/shared2175 / Worker760 / Other186 / workerd8 / Studio dirty314、全PASS。
正式Control48競合（16順序×3）、Pointer Safety15＋7、Pointer A–F＋7、CAS54＋7、参照63＋障害4＋7、native policy9＋7、L2a14、全PASS。
Playwright1.62.1 Port6suite・Studio5suite（97＋Host10）、CDP製品隔離13、全PASS。application error/404/unexpected mutation0。
commit後Studio315（clean guard込み）を除外なしで実行する。PID・oracle・fixture変更理由は正式Control契約の最終検証記録を参照。
以下は各工程時点の履歴。L3b-2の最新API/Control状態は本節と正式Control契約に従う。


## L3b-1 Safety Fix Completion（2026-10-13・履歴）

Port **1.22.14** / Studio **0.26.8** / Studio schema **1** / Authority DB physical schema **2**・9 stores。
開始HEAD/origin/main/remote main=`58b21a4263b3d689afde712e59f86d5c8068b174`。前回の91ファイル差分を保持。
[Pointer正式契約](../cruise-port/docs/AUTHORITY_POINTER_SCHEMA_V2.md)にprovenance/current integrity/collision/retry/historyの詳細を定義する。

Pointer識別情報全体をreservations内の独立publication factと照合し、公開manifest/recordsとjournal/oplogの整合も検証。
`pointer` storeの`namespace`行はpartition/protocol/schema/最後のpointerEpochを保持し、公開後のpointer欠損を未公開と誤認しない。
現在のactive head/control/full manifest/全records/参照/current head oplogを同じnative transactionで検証する。
破損activeからのduplicate publish・別generation publish・通常saveを拒否し、hydrateはrecovery-required/read-only。

同migrationIdのretryは元operationId・元precondition・元evidenceとfingerprintが一致する場合だけalready-active。
operation identityはgeneration＋operationIdでdataset/publicationを横断し、oplogとreservationsの混用・異payloadを拒否する。
`lookupPublication`の過去確定事実は`historical=true/publish=false/currentAuthorityVerified=false`で、現在のwrite/publish認可ではない。
v1→v2は既存7 storeを再作成せず、予約移行とnamespace epoch0追加を同じversionchange transactionで実行する。
旧v2のnamespace/publication factを自動補完しない。旧未公開candidateはread-only表示、証拠のないactiveはfail-closed。

Production Authority **legacy** / Worker **ACCEPT_COMPAT** / enforcement **OFF** /
Studio shared write **OFF** / PortDataHost.canWrite=**false**を維持。
通常bootへ新Authority/providerを接続せず、本番deploy/D1 migration/cutover/active pointer公開は行わない。
L3b-2/L3c/L3d/L4/B1-6製品入口は未着手。shared write解禁不可。
検証: Pointer Safety15（native待機証明9）＋7、Pointer A–F＋7、CAS54＋7、参照63＋障害4＋7、native policy9＋7、L2a14、全PASS。
Node: Worker760 / Port/shared2104 / Other186 / workerd8 / Studio dirty314、全PASS。commit後Studio315を除外なしで実行する。
正規Playwright1.62.1: Port6suite（18/26/10/18/standard-readiness/10）、Studio5suite（21/23/29/24/Host10）、全PASS。
CDP製品隔離13もPASS。application error/404/unexpected network mutation0、期待した認証401/offline errorだけ別記録。
standard-readinessのVer1.18.0期待を正式定数由来の可視・完全一致assertionへ修正し、現行Device Session応答/初期fixture保存/reset navigation同期を合わせた。
package/lockfileと利用者8765 serverは不変更。詳細・PID・fixture修正理由はPointer契約のCompletion検証記録を参照。
以下の各工程の本文・検証数は履歴であり、この現行契約に従う。

## L3a Action Authorization Policy（2026-10-13）

Port1.22.12 / Studio0.26.6 / schema1。[Action Policy](../cruise-port/docs/AUTHORITY_ACTION_POLICY.md)が新Authorityの正式操作契約。
requiresAuthorization自己申告の迂回を再現し、Store RW transaction内のaction/targets/raw mutation/guard検証で拒否する。
Standard BPM・preset delete/Standard applyはPro/Account不要。advanced save/create/advanced applyはtrusted同期guardと両30秒marginが必要。
identity予約はbackend.prepare返却前・直接Store.commit前に既存journalへ固定し、未確定retryのaction/payload/policy/target差替えを拒否。
確定replayは過去の事実だけ、publish=false/Sync wakeなし。system ACKは固定intent generationと内部capabilityのみ。
未知/未対応featureの新Authority mutationはblocked。物理安全回帰のgeneric writerは明示privileged test scopeに限定する。
正式Device Session/providerはL3c、Control/Account協調はL3b未接続。通常product routeからtest providerを生成/使用しない。
Production legacy / Worker ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=falseを維持。
Node policy57＋既存169、Port/shared2032 / Worker760 / Other186 / workerd8。Studioはcommit後clean guard込み315で確認。
Native policy9 / L2a14 / L2b54round＋7 / 参照63round＋failure4、Port72 / Studio97＋Host10、全PASS。console/404/unexpected network mutation0。
L3a当時の次工程: L3a独立確認、その後L3b。L3b以降/B1-6/shared write/deploy/cutoverは実施しない。以下は各工程時点の履歴。

## L2b-fix（2026-10-13・現行）

Port1.22.11 / Studio0.26.5 / schema1。承認済みbaseline6a057e6055d252a459a4fcb60c07a53ee6557ccb、NEWS commit保持。
[参照整合性契約](../cruise-port/docs/PORT_REFERENTIAL_INTEGRITY.md)で、旧L2b監査Cの添付intent欠落/write skewを修正する。
最新candidateのStore transaction内validation、generation付き個別/owner-set intent、旧ACK/recreateを隔離検証。
許容されるmissing My App/Practice set/履歴/cacheを削除・再作成しない。添付owner deleteは同一writerで関連metadataも明示削除する。
Node35追加、Port/shared1975、Worker760/Other186/workerd8。Studio314はcommit後clean guard込み315で確認。
Native新63round＋failure4、既存54round＋7/L2a14、Port browser72/Studio97+Host10を確認して限定commit/通常pushする。
Production legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false。
L3/L4/L5/B1-6未着手/保留。次は独立fix再レビュー、その後L3着手判断。次frame Loupe focusは既存別課題で製品UI不変更。
以下は各工程当時の履歴。

## L2b Repository接続（2026-10-13・現行）

Port **1.22.10** / Studio **0.26.4 / schema1**。内部adapter/cache readerのpatch。通常UI・保存先は変更しない。
Production Authority **legacy** / Worker **ACCEPT_COMPAT** / enforcement **OFF** / Studio shared write **OFF** / PortDataHost.canWrite=**false**。
正式Pro・Account・製品controlはL3未接続。fixture controlのPASSを製品controlのPASSへ読み替えない。
B1-6再開不可（L3→L4→L5のgateが残る）、shared write解禁不可。本番Worker/D1 deployなし。

L2b: Port-owned Repositoryへの隔離IDB backend、feature hydration/cache、正式L1 driver接続を実装。
次は**L3 formal Authority control / Operation Guard margin / Account coordination**。
L4 migration/recovery/GC/binary/sentinel/pointer、L5 cross-process/Safari/iPhone/PWA/durability実機gate後にB1-6再開を判定する。
[Repositoryと実測](../cruise-port/docs/PORT_DATASET_REPOSITORY.md)を参照。fixture control PASSは製品解禁の根拠にしない。

以下は各工程当時の履歴。旧「L2b未接続」の記述は当時の状態を示す。

## L2a独立Store完了範囲（2026-10-12・現行）

Port1.22.9 / Studio0.26.3 / Studio schema1。[Store契約](../cruise-port/docs/INDEXEDDB_AUTHORITY_STORE.md)。
Port-owned IDB Storeのschema/open/lifecycle、fixture atomic commit/hydrate/CAS/oplog、control/journal/root保存を追加。
StudioはPort version/import cacheのreader更新だけ。独自Authority DB/書込みexecutor/製品接続を作らない。
次はL2b Repository IDB backend/Feature Store hydration＋L1 driver正式acceptance。
その後L3 formal control/Pro/Account、L4 migration/recovery/GC/binary、L5実機gate。B1-6再開はL5後。
Production Authority legacy / Worker ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=falseを維持。

## Cross-tab Authority L1完了後の次工程（2026-10-12・現行）

[Cross-tab Authority Contract](../cruise-port/docs/CROSS_TAB_AUTHORITY_CONTRACT.md)に従い、B1-6より前に新Authority正本をIndexedDBへ移す。
L2a Authority store → L2b Repository IDB backend（acceptance: save/save・delete intent）→ L3 control/Operation Guard/Account協調
→ L4 migration/recovery/GC/binary → L5 cross-process stressとSafari/iPhone/PWA実機。B1-6再開はL5後。
Studio shared write OFF / PortDataHost.canWrite=false / Production Authority legacyを維持する。

## B1-5完了後の次工程（2026-10-12）

Port1.22.5 / Studio0.26.1 / Studio schema1。[Workerの正式契約](../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を参照。
D1同一batchのabort guard、Account+Portのprepared→paused→enforced、固定migrationId/operationIdとepoch一回更新、
paused snapshot checkpoint、asset prepare epochと公開時再照合、cleanup retention/claim、rollback downgrade拒否を実装。
AppDevice/Proの資格・失効・verifierをtransaction内でも確認し、CAS/tombstone/change log/aggregateの原子性を維持する。
HTTP入口だけの判定ではない。metadataのenforced表示だけを実効fenceの証明と扱わない。

B1-4の接続は隔離fixtureだけ。実ledger/evidenceと完全cloud snapshotのhash/sequenceを照合し、
同epoch/generation/checkpointのbranded ticketでready-to-publishまで検証する。本番engine/active pointerは接続しない。
checkpointはcutover時点で固定。cloudが進んだ場合は明示reconciliationを要し、旧outboxやasset operationをretagしない。
Port asset clientはauthority拒否を同runtimeに保持し、自動再試行・release/discard再送を停止する（1.22.5 patch）。

本番Worker ACCEPT_COMPAT / authority legacy / enforcement OFF、Studio shared write OFF / PortDataHost.canWrite=false。
Worker deploy・本番D1適用・Port migration/cutover・本番epoch/minimum変更なし。B1は未解消、shared write解禁不可。
次はB1-6 Port/Studio Authority Integration。operator認可・cleanup crash claim回収・local legacy writer停止・
reconciliation UX・実partition/rollback/deployのacceptance gateを別途満たす。rollback先はfence対応版限定。
以下のB1-1〜4記述と検証件数は各工程時点の履歴。

## B1-4隔離Migration Engine（2026-10-12・履歴）

Port1.22.4 / Studio0.26.1。[Migration契約](../cruise-port/docs/PORT_AUTHORITY_MIGRATION.md)にjournal、provenance/raw救出、binary読戻し、
pure reconciliation、旧outbox/review/delete保護、再開、隔離publication/active/rescueを実装。
production default legacy、Worker ACCEPT_COMPAT/enforcement OFF、Studio shared write OFF/canWrite=false、B1未解消。
次はB1-5の実効server transaction fence/cutover barrier、その後B1-6の製品action gate。以下は前工程の履歴。

## B1-2 + B1-3 Authority Preparation（2026-10-12）

Port1.22.3 / Studio0.26.1。新client protocol対応とPort-owned local stagingの実装・隔離回帰を完了。
[Local Authority契約](../cruise-port/docs/PORT_LOCAL_AUTHORITY.md)：dataset/metadata/WAL/delete intent・Sync DB・binary分離、固定Account binding、read-only candidate。
production default legacy、minimum enforcement OFF、Studio shared write OFF。B1解消と扱わない。
次はB1-4のfull candidate/cloud/旧outbox/binary reconcile・ownership review・controlled pointer publicationを設計・独立監査。
その後B1-5 transaction fence、B1-6製品統合/action解禁。renderer parityは別Phaseで並行可能、今回は未実装。

## B1-1 Authority Contract（2026-10-11）

Port 1.22.2 / Studio 0.26.1 / Studio schemaVersion 1。
[Sync Writer Authority](../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を新authority wire契約とする。
WorkerはACCEPT_COMPAT固定、legacy request許可。authority writerProtocol=2 / syncProtocol=1を受理できるが、
既存local Repository / writer protocolは1のまま。新wire送信は明示注入だけで、production clientはlegacy envelopeを維持。
D1はadditive metadataのみ。minimum fence OFF、local authority migration未実施、B1未解消。
Studio shared write OFF / PortDataHost.canWrite=false / old-build-unknownを維持する。
Worker deploy・production D1適用は未実施。次はB1-2のprotocol adoption / authority取得 / blocked UX。
以下の既存version・検証件数は前工程の履歴。

各工程は「完了条件」を満たしてから次へ進む。PC統合の詳細責務は
[Shell Contract v2.1](docs/SHELL_CONTRACT.md)を正式sourceとする。
この文書は今後の順序、[PROJECT_STATE](ai-handoff/PROJECT_STATE.md)は現在地を管理する。
下部のPhase 1〜8は既存実装・計画の履歴であり、現在の着手順は次の正式実装順を優先する。
今後の個別設計変更は、許可された作業範囲で契約・ADRへ記録する。

## PC統合の新方針（2026-10-31更新）

Port UI・機能の完全共通化は [Port / Studio 共通化設計](docs/PORT_STUDIO_PARITY_DESIGN.md) と
[ADR-031](docs/DECISIONS.md#adr-031-port-の実画面と保存処理を-studio-の正本とする) を優先する。
Studio 側の類似UIを完全版として増やさず、Port の実画面と保存処理を使用する。
現行 `PortDataHost.canWrite=false` と Cloud Sync / Pro の責務境界は維持する。
Standard チューナーとメトロノームは Port 正規文書の埋め込みを初期実装し、合成環境で保存・音声停止を検証済み。
Pro と残りの Port 機能は機能別の受入 gate を通すまで正規 Port 別タブ導線を用いる。
現時点の合否と Sync line への要求は [チューナー結果](docs/PORT_TUNER_PHASE1_RESULT.md) と
[メトロノーム結果](docs/PORT_METRONOME_PHASE1_RESULT.md) に記録する。
以下の2026-10-10の記述は、その時点の方針として残す。

Cruise Studioは未リリースのPC向け制作ソフトとして、Cruise Port / Cruise appsの
機能・データ契約・Sync・Pro・Versionを正確に共有し、PC専用UIとStructure譜、
五線譜、TAB、MusicXML、MIDI、DTMへ展開する。

リリース済みPort / Chord / Pitch / Fretboard / Rhythm / Cruise Sync / Accountを壊さない。
mobile UIやstylesheetの丸ごと埋込は行わず、UI hostとdata ownerを分離する。
Port-owned dataは既存ownerを維持し、Studio独自datasetへ複製しない。
既存側の協調改修が必要な場合は、対象と回帰条件を明示した別工程で扱う。

PC ShellはNavigation rail / Main / Inspector・Tool pane / Dock・Transportを基本とし、
Drawer / Dialog / Separate workspaceを使い分ける。1024px以下はMain優先、800px付近は
Inspector初期閉。固定breakpointよりMain可用幅・高さ・zoom後のCSS寸法を優先する。

## 今後の正式実装順

| 順 | 工程 | 完了・移行条件 |
|---|---|---|
| 0 | baseline固定 | 次工程開始時にGit・既存表示・操作・保存データ契約を固定 |
| 1 | Shell Contract v2.1文書化 | 完了・push済み。最終Bレビューの追記と文書間リンクを反映 |
| 2 | Studio-only無変化refactor 第1段階 | 完了。scroll / safe area / toolbar / resize / lifecycle / Esc / Pre-DTM入力境界を準備 |
| 3 | 第1段階の回帰確認 | 完了。Chrome変更前後比較・ユーザー実機確認で表示・操作・保存形式・Safari / IME / print / MIDIを維持 |
| 4 | Version / Feature metadata | v1完了・push済み（3879b26a）。6 component / 17 feature、reader-first、22 test。既存UI未接続、mobile運用不変 |
| 5 | Cruise Port Theme / Design Token調査 | 完了。Port sourceを読み取り専用監査し、semantic token・component例外・紙面domainを整理 |
| 5a | Theme Contract v1 + Studio Theme Projection | 実装・検証完了。4テーマ / 39 tokenのsource対応、共通resolver / bootstrap / storage。Shell / selector UI未実装 |
| 6 | Studio Shell v1 | 0.23.0実装・回帰完了。Navigation / Main scroll / 右pane / Dock、4テーマ、workspace draft保持 |
| 7 | Focus / Keyboard / Modal manager | 0.23.1実装・回帰完了。2-phase routing、Escape owner、focus復帰、single native modal、入力・IME保護 |
| 8 | Structure Editing Session接続 | 0.24.0実装・回帰完了。saved / draft分離、commit / cancel、external conflict、Save、Pre-DTM working snapshot。domain Undoは未実装 |
| 9 | Audio Coordinator v1 + Metronome M1 | 0.25.0実装・回帰完了。Standard相当BPM / Start / Stop、memory-only、Dock、専用context・lease・global stop実証 |
| 10 | Metronome M2 | 0.25.1実装・回帰完了。注入memory facade、Port schema3 / migration、raw・effective分離、CAS / stale / failure / retry / forward guard実証 |
| 11 | Metronome M3 | Core / Runtime / read-only Host / Write Gate Prerequisites v1（Port 1.22.1・Studio 0.26.1）を整備・検証。B2/B3修正、B1はfail-closed封じ込め。production shared write OFF。次は強制可能なB1 authority boundary設計・独立監査、その後M3 Phase D renderer parity / presets UI / 正式資格 / mobile・Safari回帰 |
| 12 | Chord | shared feature境界とPC presentationを追加 |
| 13 | Practice | Port ownerと保存・同期契約を維持して追加 |
| 14 | Tuner | mic排他・遅延request・競合音声確認・cleanupを検証 |
| 15 | Structure機能開発再開 | F3 / F2b / G3 / F4等の残項目をShell・共有基盤整備後に再開 |
| 16 | 五線譜 / TAB / MusicXML | domain model・安定ID・記譜・出力の設計と検証 |
| 17 | DTM | Clock / Scheduler / Renderer、timeline / track / piano roll / recordを段階導入 |

M1は実storage・Pro認証・Account・Sync・presetsに接続せず、製品統合完了とは扱わない。
M2は隔離したmemory Storage facadeだけを使い、Studio専用localStorage keyを作らない。実装・検証完了、reload永続化は未実装。
契約・検証・M3 blockerは[Metronome統合](docs/METRONOME_INTEGRATION.md)を参照。
M3で初めて正式データへ接続する。接続前にschema前方互換、Port / Studio 2tab同時編集、
full dataset、全writer協調、delete intent、正式資格失効、mobile lifecycle、partial snapshot防止を
確認する。全writerが協調できない場合、Studioの共有書込を有効化しない。
詳細は[契約22〜24節](docs/SHELL_CONTRACT.md#22-metronome-m1-standard相当memory-only)を参照。

## Write Gate Prerequisites v1（2026-10-11）

[Port Write Readiness](../cruise-port/docs/PORT_WRITE_READINESS.md)が現在の契約と検証結果。
reader-first後owner bindingとAccount ID + appIdのnative Sync Execution Lockを修正・実証。
旧build不存在は証明していない。old-build-unknown / canWrite=falseをproduction固定し、B1解消と記録しない。
M2 non-persistent load / external incoming・reapply、dormant Facadeのprivate base CASとoperation guardを準備。
Port通知/audio接続・shared write・preset CRUD UIは未解禁、advanced rendererはM3 Phase D。
Worker productionは不変更。Worker test-only Account identity / Web Locks fixtureを正式契約に追従させた。
全Node/browser回帰PASS（Studio Git状態検査はcommit後確認）。Port1.22.1 / Studio0.26.1 / schema1。

## Studio-only無変化refactor 第1段階（完了・2026-10-11）

scroll root abstraction（defaultはwindow）、Loupe safe-area provider、Structure専用toolbar参照、
ResizeObserver（hidden / 0幅で保存値を変更しない）、load / activate / deactivate分離、
enter互換、Escape gate、Pre-DTM project source providerを実装済み。
activateは保存projectを再読込せず、draft / selection / focus / scrollを保持可能な境界とした。
既存hostの入口とPre-DTMの保存済みproject読込は維持し、working snapshot実接続は未実装。

Chrome隔離環境で1440 / 1280 / 1024 / 800 / 680pxの変更前後を比較し、表示・操作・
Loupe復元 / clamp / dynamic max-height、IME guard、8→16→8、mixed resolution、auto/fixed、
鍵4状態、JSON / MIDI / print、console / 404を確認済み。Project JSON 7,946 bytes、伴奏JSON
25,599 bytes、MIDI 813 bytesはSHA-256一致。イベント数Guitar 19 / Bass 32 / Drums 48も一致。
印刷ラスタは完全一致し、Loupe非表示を維持した。
ユーザー実機でもStructure / Loupe / Safari既存保護 / IMEを含む基本入力 / 8分・16分 /
drag / resize / clamp / UI表示に問題なしと確認され、ユーザー-visible差なしの内部refactorとして承認済み。
APP_VERSION 0.22.4、schemaVersion 1、asset ?v=、project JSON / localStorage / appSettings、
Loupe保存形式 `{x,y,width}` は不変。Port / 他apps / shared / Account / Sync / Worker / Proは不触。
Shell / Editing Session / working snapshotの製品統合完了とは扱わない。

## 次工程とテーマ方針

Version / Feature Metadata v1は完了・push済み（3879b26a）。22 testでsource / owner / policyを検証。
詳細は[FEATURE_METADATA](docs/FEATURE_METADATA.md)。registryのShell接続前にはStudio / Portの
隣接HTTP配信条件を満たす。現行UIはregistry未接続、mobile運用は不変。

Theme監査を経て、[Theme Contract v1](docs/THEME_CONTRACT.md)とStudio projectionを実装・検証済み。
Portを正本とし、dark / charcoal / gray / lightの39 semantic token × 4テーマをsource対応表と
CSSへprojectionする。Portは読み取りのみ。既存appSettings.colorThemeを使い、Port設定と分離。
stylesheet前bootstrapとruntimeは同じresolverを使用し、不正値 / storage失敗はdarkへfallback。
Theme 32 + Metadata 22 = 54 test PASS。実HTTPの8ケース、TOP / Structure / Loupe / Pre-DTM /
printの変更前後画像・DOM・Project JSON・storage一致を確認。既存document配色とpaper / music / printは維持。
ブラウザーchromeのtheme-colorだけはPort契約値へ揃える。APP_VERSION 0.22.4、schemaVersion 1。

## Studio Shell v1（0.23.0・2026-10-11）

Navigation rail / Main / Inspector・Tool pane host / Dockを実装。Homeと既存Apps導線もMainへhost。
初回loadとactivate / deactivateを分離し、workspace往復でStructure draft / selection / Loupe /
scroll / focusを保持。Mainを主scroll rootとし、safe-area・ResizeObserverを既存境界へ接続した。
1280px以上で右pane常設可能、狭幅はoverlay、800px以下はNavigationをcompact化。右pane / Dockは初期閉。
4テーマをsemantic tokenから適用。Navigationのnative radio groupで即時切替・保存失敗表示を行う。

Node: Shell 19 + Theme 32 + Metadata 22 = 74 PASS。Dark 7幅、他3テーマ各3幅の16画面、
追加の低画面3サイズで確認。Structure入力・8/16・mixed / auto・fixed・鍵4状態・合成IME guard・
Loupe drag / resize / clamp・workspace往復を確認。Safari / 実OS IMEの実機再確認は未実施。
Pre-DTMの保存済みproject選択、Guitar / Bass / Drums、JSON / MIDIの音楽内容は維持。
Project JSON 8,077 bytes / Arrangement JSON 26,991 bytesはappVersionだけ更新。MIDI 813 bytesと
A4 PDFラスタは完全一致。schemaVersion 1、既存保存形式・Port / 他apps / shared / Workerは不変。
詳細は[Shell Contract §30](docs/SHELL_CONTRACT.md#30-shell-v1実装境界0230--2026-10-11)。

Shell v1直後の工程はFocus / Keyboard / Modal（下記で完了）。次はEditing Session（Pre-DTM working snapshot接続を含む）、
Metronome M1 → M2 → M3。Pre-DTMは本段階では保存済みprojectを読む。上記後続機能へは未着手。
F3等Structure本体機能は共有基盤・Shell整備後に再開する。

## Structure Editing Session v1（0.24.0・2026-10-11）

[EDITING_SESSION](docs/EDITING_SESSION.md)にcore / registry / repository / Structure adapter / Save /
Pre-DTM入力の境界と制約を記録した。同一targetはsession共有、別project・workspace移動でdraftを保持。
baseRevisionを外部更新で進めず、commit中追加編集・失敗・別tab競合・外部削除を保護する。
既存raw JSONをrevisionとして利用し、Web Locksでprojectと最新indexの協調writerを排他する。
旧build・legacy直接writerまで完全排他とは扱わず、Web Locks非対応では保存を有効化しない。

Node161（既存100 + Session/repository61）、Chrome42（既存20 + Session22）PASS。
clean Project / Arrangement JSONは0.23.1からappVersionのみ更新。MIDI813 bytes / A4 PDFラスタは一致。
dirty Pre-DTM JSON / MIDIは同じactive Structure draftの意図した編集差を反映する。
schemaVersion 1、Port / 他apps / shared / Worker / Sync / Accountは不触。

**次の正式工程はMetronome M1。** memory-only timing/audio、Dock、start/stop、lifecycle / dispose、
Coordinator leaseを別指示で実装する。M2 / M3、domain Undo、Transport、Syncは今回未着手。

## 既存フェーズの履歴と残項目

以下の実装経緯・検証履歴・未実装要望は保持する。履歴中の「次」「今回」等は当時の作業文脈であり、
現在の優先順は上記の正式実装順とする。F3等へ直行せず、Shell / 共有基盤整備後に再開する。

## Phase 1: 母艦＋背骨（初期MVP履歴）

- ディレクトリ `apps/cruise-studio/` 新設
- 設計ドキュメント4本（APP_CONCEPT / DATA_MODEL / ROADMAP / docs/DECISIONS）
- 母艦TOP（index.html + theme.css。Clean Pro系・PCファースト）
- `js/core/song-model.js`（生成・検証・マイグレーション）
- `js/core/storage.js`（localStorage + JSON入出力）
- `js/core/music-theory.js`（キー変換の土台）

**完了条件**: ブラウザで母艦TOPが表示され、コンソールエラーなし。
サンプルプロジェクトの生成→保存→一覧→書き出し→読み込みが動く。
既存アプリ・shared に変更ゼロ。service-worker / manifest / PRO認証なし。

## Phase 2: 譜面クルーズMVP

- `js/modules/sheet-cruise/` に編集画面を実装
- 曲情報フォーム（title / artist / ORGキー / Playキー / カポ / BPM / 拍子 / 基本ストローク）
- セクション追加・削除・並べ替え、小節数の指定
- 小節グリッド編集: コード入力（テキスト→パース検証）、歌詞の音節割当、ドレミ入力（16分グリッド量子化）
- 譜面プレビュー（簡易版でよい。A4固定はPhase 3）
- 母艦TOPの「譜面クルーズ」カードから遷移

**進捗**:
- Phase 2A（実装済み）: 画面遷移・共通ナビ・曲情報フォーム・キー関係チェック・保存/復元
- Phase 2B（実装済み）: セクション管理・小節グリッド（1小節1コード・警告のみ検証・4/4前提。ADR-008）・簡易コード譜プレビュー
- Phase 2C（実装済み）: 歌詞入力（tick:0単一イベント）・ドレミ入力（melodyイベントへ正規化。ADR-009）・プレビューの3段表示（コード/歌詞/ドレミ）・ツールバー
- 残: 音節/16分tick単位の歌詞・ドレミ詳細編集、基本ストロークパターンの選択UI

**完了条件**: 架空のサンプル曲を最初から最後まで入力でき、
入力内容が StudioProject として保存・復元できる。→ **MVPとして達成（v0.4.0）**

## Phase 3: 保存/PDF/テンプレート

- A4固定サイズ（794×1123px ≒ A4@96dpi）の紙面レンダリング
- `print.css`（画面プレビュー＝印刷結果）
- 表示トグル（コード / 歌詞 / ドレミ / ストローク）の反映
- JSONエクスポート/インポートのUI仕上げ、テンプレート（空の教材フォーマット）
- 手元の参考レイアウト（マリーゴールドPDF）と**構造の再現度**を目視比較する
  （※既存曲のデータは repo に入れない。検証はローカルの一時入力で行う）

**進捗**:
- v0.4.0: `print.css` 分離によるブラウザ印刷（譜面プレビューのみA4印刷。ADR-010）、
  譜面クルーズ画面からのJSON書き出し/読み込みUI
- v0.7.0: **A4固定紙面レンダラー**（`sheet-renderer.js`。画面794×1123px＋スケールフィット、
  印刷210mm。ページ/譜面行単位のDOMと改ページ制御。ADR-016）、
  表示トグル（コード/歌詞/ドレミ。sheetSettingsに保存）
- v0.8.0（S1a）: **紙面タイミンググリッド**（小節セル背面に拍・8分・16分の縦線。
  ON/OFFトグル＋8分/16分切替。16分イベントを含む小節は自動で16分表示。
  ONならPDFにも出る。`sheetSettings.showTimingGrid` / `timingGridResolution`。ADR-017）
- v0.9.0（R1）: **基本ストロークの記号入力と紙面ストローク段**（↓↑・〜x を
  `strum_custom_basic` パターンの slots へ正規化。コード段の直下に文字表示、
  グリッドと拍位置整合、`showStrum` トグル配線、PDF反映。プレDTMへは既存経路で自然反映。ADR-018）
- v0.10.0（S1b）: **A4紙面上の小節クリック選択と空の編集overlay土台**
  （`.sheet-bar` のクリック選択、選択ハイライト、`.slot-overlay` の位置追従、
  `chord / strum / lyrics / doremi` 行定義DOM、印刷除外。入力機能は未実装。ADR-019）
- v0.11.0（S1c）: **A4紙面overlayへの歌詞・ドレミ入力移植**
  （lyrics / doremi の入力欄、既存 `lyrics` / `melody` 構造の再利用、
  IME中のキーイベント分離、選択中小節への即時反映、カード型入力UIとの共存。
  `schemaVersion` は1のまま）
- v0.12.0（S1e）: **A4紙面overlayへのコード入力移植**
  （chord入力欄、既存 `bar.chords` / `setBarChord()` 構造の再利用、
  警告ベースのコード検証、選択中小節への即時反映、カード型コード入力UIとの同期。
  `schemaVersion` は1のまま）
- v0.13.0（S1d）: **A4紙面overlayの小節移動とまとめて入力**
  （`Alt + ←/→` と前へ/次へボタンによる選択小節移動、overlay上のコード/歌詞/ドレミ
  まとめて入力パネル、現在小節から複数小節への反映、カード型入力UIとの同期。
  既存 `bar.chords` / `bar.lyrics` / `bar.melody` 構造を再利用し、`schemaVersion` は1のまま）
- v0.14.0（R2）: **A4紙面overlayへのストローク入力と小節別上書き**
  （strum入力欄、空欄=基本ストローク継承、`bar.strumOverride` と
  `project.strumPatterns` の既存構造を再利用した小節専用パターン保存、
  A4紙面のストローク段への即時反映、上書き小節ごとの16分グリッド自動判定、
  保存/復元/JSON/プレDTMの既存経路を維持。`schemaVersion` は1のまま）
- v0.15.0（R3）: **コード＋ストローク段の文字ベースリズム譜表示改善**
  （VexFlowや五線譜はまだ使わず、既存の↓↑・〜x表示を8分/16分グリッドに沿って
  読みやすく整形。コード段直下の余白、ストローク記号の強弱、印刷時のサイズと線色を調整。
  保存構造は変更せず、`schemaVersion` は1のまま）
- 残: 休符記号・タイ曲線の本格記譜表示（VexFlow等。**Shell / 共有基盤整備・Structure再開後に着手**）、
  複数ページの明示分割、テンプレート、
  マリーゴールドPDFとの構造再現度の目視比較（ローカル一時入力で）

**完了条件**: ブラウザ印刷で1枚のA4教材コード譜が出力でき、
ヘッダー・コードグリッド・コード＋歌詞＋ドレミ段が参考PDFと同等の構造で並ぶ。

## Phase 3.5: 譜面クルーズUI再編（D1〜D3a・F1〜F4・G1〜G3）

実機確認で、曲情報フォーム・小節グリッド一覧が常設で左カラムを占有し、
A4紙面プレビューが縮小表示されて編集しづらいことが判明した。
docs/DECISIONS.md ADR-025 の方針（譜面全幅化＋下部ドック型スロットエディタ。案A採用）に沿って、
段階的にUIを再編する。D3a実機確認では、機能（タイムグリッド編集）はできたものの
「黒い編集パネルが紙面と視覚的に馴染まない」課題が判明し、以降は表示方式のFシリーズ
（F1〜F4。ADR-027）で紙面デザインのフローティング小節ルーペへ揃えていく。
現在の着手順では本Phaseの残項目をShell / 共有基盤整備後に再開し、
VexFlow / 五線譜 / TAB / MusicXML（Phase 6）はその後に扱う。

- **D1（完了・v0.16.0。push済み: `19ea503e`）**: レイアウト再編のみ。`.sheet-layout` を1カラム化し、
  A4紙面プレビューをフル幅・主役表示にする。曲情報・セクション・表示設定・
  小節グリッド（旧一覧編集）は上部の折りたたみドロワーへ移動し、既定は閉じておく。
  既存の紙面クリック選択・ミニoverlay編集（コード/ストローク/歌詞/ドレミ、Alt+←/→、
  まとめて入力）は暫定維持。下部ドック本体・拍/裏拍/16分セル入力・VexFlowは含まない。
  データ構造・保存/JSON/プレDTM/MIDI経路は無変更、`schemaVersion` は1のまま
- **D2 MVP（完了・v0.17.0。push済み: `ac8acc96`）**: 小節上に出ていた極小overlayを
  画面下部固定の横長ドックへ移設。入力方式（コード/ストローク/歌詞/ドレミ、前へ/次へ、
  Alt+←/→、まとめて入力）は既存ロジックをそのまま流用し、入力欄を明らかに大きく・
  見やすく・触りやすくした。ドックヘッダーに「〇小節目を編集中」「セクション名」
  「閉じる」を追加。拍/裏拍/16分セル入力・`_proto`移植・VexFlowは含まない。
  データ構造・保存/JSON/プレDTM/MIDI経路は無変更、`schemaVersion` は1のまま
- **D3a（完了・v0.18.0。push済み: `a3a1618f`）**:
  「選択小節のX線写真」方針（Fable5レビュー確定）。D2の巨大な縦積みフォーム型ドックを、
  選択小節と同じ時間軸を保ったまま横に拡大するコンパクトなタイムグリッド・ドック
  （高さ約200〜220px）へ変更。拍ルーラー、コード（1小節1セル）/ストローク/歌詞/ドレミの
  共通時間軸配置、ヘッダー1行集約（8分/16分切替・まとめて入力ポップオーバー化・
  基本に戻す）、選択小節の自動スクロールを追加。**本格的にセル編集するのはストローク行のみ**
  （クリック循環・キーボード入力・基本ストローク継承のゴースト表示・override化）。
  `song-model.js` に `setBarStrumSlots()` を新設し `setBarStrumText()` をその上の
  薄いパーサへリファクタリング（保存構造・パターンID管理は無変更）。
  実機確認で「黒い編集パネル・画面下固定・紙面と色/罫線/フォントが異なる」ため
  「選択小節を拡大した表示」に見えないという課題が判明し、F1へつながった。
  データ構造・保存/JSON/プレDTM/MIDI経路は無変更、`schemaVersion` は1のまま
- **F1（完了・v0.19.0。push済み: `0906b8f4`）**: フローティング小節ルーペ化
  （ADR-027）。D3aのタイムグリッド編集機能は維持したまま、表示方式を黒い下部固定
  ドックから、A4紙面と同じアイボリー・墨色・アンバー枠の「紙面の上に浮かぶもう一枚の紙」
  へ変更。`position: fixed` の自由配置（x/y）、タイトルバードラッグ、右下ハンドルでの
  比例リサイズ（`--bar-loupe-scale`）、`cruiseStudio.appSettings` の `barLoupe` キーへの
  位置/幅保存、画面外への完全なはみ出し防止のクランプ処理を追加。
  紙面の色・罫線値を `--paper-*` トークンとして共有し、紙面自体の見た目・印刷は不変。
  歌詞・ドレミのセル編集、旧小節グリッドカード撤去は含まない
- **F2a（完了・v0.20.0。push済み: `4e27b8c0`）**: 歌詞のtick位置セル編集
  （ADR-028）。`setBarLyricSlot()` / `getBarLyricSlots()` / 共通の16分判定関数
  `barNeedsSixteenthResolution()` を `song-model.js` に新設。ルーペの歌詞行を
  ストロークと同じ共有時間軸のセル（8/16マス、`<input>`）へ置き換え、IME
  3層ガード（isComposing/keyCode229 → compositionstart/end中は再描画しない →
  justComposedでSafariのEnter誤爆を防止）付きで1セル=1イベントの単発入力に対応。
  16分位置の歌詞があれば8分ボタンをdisabled化。紙面の歌詞段はtick:0単一イベントなら
  従来どおり全文表示（後方互換）、それ以外は解像度に応じたグリッドへtick配置表示。
  旧・小節グリッドカードの歌詞inputはreadonly化（クリックでルーペを開く）し
  `setBarLyricsText()` への書き込み経路を断った。まとめて入力の歌詞は一時停止
  （セル編集への移行に伴う暫定処置）。貼り付けの自動展開・既存全文の自動分割・
  小節をまたぐ自動移動・「セルへ割り当て」ボタン等の新まとめて配置方式・行間の
  上下矢印移動は含まない（F2bへ）
- **F2b（未着手）**: 貼り付けの自動展開、既存全文の自動分割（明示操作のみ）、
  小節をまたぐ自動移動、「セルへ割り当て」ボタン等の新しいまとめて配置方式、
  行間の上下矢印移動
- **F3（未着手・Shell / 共有基盤整備後に再開）**: ドレミのtick位置セル編集（`setBarMelodySlot` 相当。
  `barNeedsSixteenthResolution()` に `melody` を統合。旧・小節グリッドカードの
  ドレミinputもF2aの歌詞と同様にreadonly化する。セル化する際はG1の
  `populateBeatGroups()` をそのまま適用し、拍グループ構造を歌詞・ストロークと揃える）
- **F4（未着手）**: まとめて入力の自動分解配置の総仕上げ、UI全体の整合仕上げ
  （F2aで歌詞側のtick:0潰れ問題は解決済み。`ai-handoff/PROJECT_STATE.md` 9章参照）
- **G1（完了・v0.21.0。push済み: `08139d18`）**: 小節ルーペの拍グループ構造化＋
  縦線追加（ADR-029）。G2/G3で「行別・拍別の8分/16分切替」を安全に実装するための、
  機能等価なDOM・CSS基盤整備。`populateBeatGroups(container, res, buildSlot)` を
  `sheet-cruise.js` に新設し、拍ルーラー・ストロークセル・歌詞セル・コード/ドレミ背面線の
  すべてがこの1関数を経由するようリファクタ。拍・8分・16分の境界線が全行で
  ピクセル単位で一致する。コード・ドレミは引き続き小節1入力のまま、背面へ装飾専用の
  縦線（`buildTimelineBackground()`）を敷くのみ。セルのDOM順序・`data-cell-index`・
  IME・フォーカス復元・クリック循環・キーボード操作は既存のフラットindexと完全に同じ
  順序を維持し無変更。解像度ロジック自体（全体8分/16分切替、データ由来の16分強制）も
  今回は変更しない（全拍が同じ既存解像度で描画される機能等価リファクタ）。
  8/16ミニボタン・行別/拍別のローカル解像度状態は含まない（G2以降へ）。
  実機確認後の表示修正2点（歌詞行の縦線が見えない不具合の修正、拍ルーラー表示を
  「1/2/3/4」→「1拍/2拍/3拍/4拍」へ変更）を含む。詳細はADR-029追記部分を参照
- **G2a（完了・v0.21.1。push済み: `2f5922f2`）**: 歌詞セルのtick識別化＋
  無変更commit防止。G2b（歌詞行の拍別8分/16分切替）に備え、`song-model.js`へ純粋な
  読み出しヘルパー`getBarLyricSlotRanges()`を新設し、歌詞セルの位置管理を
  `data-cell-index`（連番）から`data-slot-tick`/`data-slot-ticks`（tick）中心へ移した。
  あわせて、表示済みの初期値と現在値が一致する場合は`setBarLyricSlot`・`markDirty`・
  `renderPreview`を呼ばない「無変更commit防止」を導入（G2bで8分セルへ複数の16分
  イベントを集約表示した際、無編集blurで複数イベントが1つへ統合される事故を防ぐ
  前提整備）。IME 3層ガード・Alt+←/→の小節間誤書き込み防止（F2a由来）は挙動を
  変えていない。G2aは全セルが一律解像度のままの機能等価リファクタで、拍別8分/16分
  ボタンやmixed resolution表示は含まない
- **G2b（完了・v0.22.0。push済み: `c9ab248f`）**: 歌詞行の拍別8分/16分切替
  （ADR-030）。`state.lyricBeatRes`（`bar`オブジェクトをキーにしたWeakMap。
  project/localStorage/appSettingsへ保存しない一時UI状態）で拍ごとのローカル解像度を
  保持し、実効解像度は「ローカル指定 ＞ 全体設定」の2段階だけで決まる。歌詞データの
  tickを理由に自動的に16分へ昇格する処理は廃止し、「自動」拍は常に全体設定へ
  追従するだけにした。全体8分ボタンのdisabledロックをストローク由来のみへ限定
  （`isStrumDataForcedSixteenth`。歌詞由来のロックは解除）。拍グループ右下に
  「自8/自16/8/16」の切替ボタンを新設（自動状態から最初のクリックで必ず全体設定と
  逆の解像度へ固定される3状態サイクル）。切替の前後で編集中セルの内容を保全する
  共通安全処理（`prepareLyricResolutionChange`）をローカル・全体ボタン両方へ適用。
  8分セルに複数の16分イベントが入る場合は`getBarLyricSlotRanges()`（G2a）でtick順に
  連結表示し、G2aの無変更commit防止をそのまま使うことで、クリック・フォーカス・
  無変更blur・Enter/Tab移動だけでは統合されず、実際に編集確定した場合だけ8分範囲を
  1イベントへ統合することを実機確認済み（`setBarLyricSlot`スパイで検証）
- **G4（完了・v0.22.1。push済み: `b2772103`）**: 歌詞行「小節全体の最終セル」で
  Enterを押した場合に、現在の入力を確定したうえで次小節の先頭歌詞セルへ移動する。
  最終セル判定は`getOrderedLyricCells()`のDOM順（tick昇順）配列の末尾要素との一致で行い、
  セル数・tickをハードコードしないためmixed resolutionでも正しく動作する。次小節への
  移動はAlt+←/→・前へ/次へと同じ`getMoveTarget()`/`moveSelectedBar()`をそのまま再利用し、
  `state.project.bars`の正規順序（セクション境界を含む）で移動する。移動前commitは
  Alt+←/→と同じ`commitLyricCell(..., {skipRender:true})`パターン（G2aの無変更commit
  防止込み）。曲全体の最終小節では新しい小節・セクションを作らず現在セルに留まり、
  ステータス表示で案内する。既存の`isConnected`チェック（blur）・`expectedBarNumber`
  比較（フォーカス復元）だけで古いコールバックの誤書き込みを防げることを確認し、
  新しいtoken/世代番号は追加していない。最終セル以外のEnter・Tab・矢印・Alt+←/→・
  IME 3層ガードは無変更
- **v0.22.2（実装・独立レビュー・ユーザー実機確認すべて合格。commit/push未実施）:
  歌詞解像度切替時のデータ破壊防止（G2b由来の不具合修正）**: Fable 5独立レビュー
  総合判定A。実機確認では16分→8分集約（「ラ｜スト」→「ラスト」）・8分→16分分解
  （「ラスト」→「ラ｜スト」、汚染なし）・拍別/全体ボタン双方・未確定編集の保存・
  IME/G4/通常ナビゲーションの回帰なし、すべて合格。歌詞セルへフォーカスがある状態で拍別ローカル解像度ボタン・
  全体8分/16分ボタンを押し、そのセルのrangeが変わる切替（集約・分解）を行うと、
  `restoreLyricCellFocus()`が切替前セルのsnapshot valueを、range不一致の切替後セル
  （集約セルや分解後セル）へ代入してしまい、その後のblur/Enter/Tab等でG2aの無変更
  commit防止が誤って通過し、projectのlyricsイベントが破壊される不具合があった。
  `captureLyricCellFocus()`のsnapshotへ`slotTicks`（range幅）を追加し、
  `restoreLyricCellFocus()`のvalue/selection復元を「切替前後でslotTickとslotTicksが
  完全に一致する、全く同一rangeのセルへ戻す場合」だけに限定した。フォーカス先の決定
  （`findLyricCellByTick()`の同tick→含む範囲→直前→先頭フォールバック）自体は変更せず、
  range不一致の場合はフォーカスのみ行い、再描画済みDOMのproject由来の値をそのまま
  残すようにした。IME・無変更commit防止・mixed resolution・拍別/全体解像度切替の
  サイクル・G4の最終セルEnter移動は無変更
- **長文歌詞セルの表示方針検討（未着手・次タスク候補）**: v0.22.3で罫線整列を修正した
  トレードオフとして、4文字以上の長文歌詞を1セルへ入れると隣接セル・隣接小節の文字と
  重なりうることが判明した（詳細は上記v0.22.3参照）。候補案（あふれセルだけフォント
  縮小／ellipsis／クリップ／モーラ分割の入力案内強化）は記録のみで、今回はどれも
  実装していない。着手時に個別設計する
- **G3（未着手）**: ストロークの行別・拍別8分/16分切替。G2bの安全処理・フォーカス
  復元パターンを参考にするが、ストロークは`bar.strumOverride`の単一slots配列構造の
  ため、歌詞と全く同じ形でそのまま流用できるかは着手時に検討する
- 拍単位コード編集を将来実装する場合も、G1の `populateBeatGroups()` をそのまま適用し、
  他行と同じ拍グループ構造・境界線を再利用する（現時点では未着手・未計画）
- **ユーザー確定要望（未実装・未着手）**:
  - コードのセル入力化（拍単位コード編集フェーズで。現在は1小節1コード維持）
  - ドレミのセル入力化（F3で。現在は1小節1入力維持）
  - 16分→8分への切替許可（対象: 歌詞/ストローク/ドレミ/コード）。**歌詞はG2bで実装済み**
    （tick順連結でマージ）。ストローク・ドレミ・コードは未実装のまま
    （マージ/優先ルールは各行の実装着手前に個別設計。歌詞と同じ「tick順連結」に
    なるとは限らないため断定しない）
  - ストロークのクリック循環に「〜」を候補追加
  - 小節の最終歌詞セル（4拍目の最後、小節全体の最終セル。各拍の最後ではない）での
    Enterによる次小節先頭歌詞セルへの移動。**G4で実装済み**（上記参照）
- **v0.22.3（実装・検証済み。履歴: `3f387b18`）: 紙面歌詞位置の修正＋拍別固定表示の
  文言変更**:
  - **紙面歌詞位置の修正**: ユーザー実機画像とFable 5の数値調査により、紙面上の歌詞が
    小節後半ほど左へずれる構造バグを確認済みだった。根本原因は、罫線グリッド
    （`.sheet-bar-grid`。`position:absolute; inset:0;`で`.sheet-bar`のボーダーボックス
    全幅を等分）と歌詞グリッド（`.sheet-bar-lyrics--timed`。通常のflex子要素として
    `.sheet-bar`の横padding（8px×2）を除いたコンテンツ幅から、さらに`column-gap:1px`
    を引いた幅を等分）が異なる母数を等分していたこと。修正: `.sheet-bar`の横padding値を
    `--sheet-bar-pad-x`というCSSカスタムプロパティへ切り出し（現在値8pxのまま、
    見た目は無変更）、`.sheet-bar-lyrics--timed`へ`margin-left`/`margin-right`として
    同じ変数の符号反転値を設定してpaddingを打ち消し、`column-gap`を0にした。
    子span（各セル）は`text-align:center`でセル中央揃え。加えて、`.sheet-bar-lyrics--timed
    > span`へ`min-width:0`を追加した。これは実機検証で追加発見した問題への対応で、
    `white-space:nowrap`＋`overflow:visible`のgrid itemはデフォルトで自動最小サイズが
    「テキスト全文の幅」になるため、長い歌詞が1セルでもあると`repeat(N,1fr)`の
    トラック計算自体が広がり、そのセル以降すべてが罫線グリッドとズレることを実測で
    確認した（`min-width:0`追加により、8分・16分とも全セルでspan中心と罫線中心の
    差が0pxになることを確認済み）。`theme.css`のみを変更対象とし、
    `sheet-renderer.js`・保存データ・schemaVersionは変更していない。印刷は`print.css`が
    `.sheet-bar`のpaddingを上書きしていないため（`break-inside`のみ）、変数値がそのまま
    継承されることをコード上確認済み。ストローク段（`.sheet-bar-strum`。同様の座標差が
    潜在する可能性をFableが指摘）は今回一切変更していない（次タスク候補）
  - **長文歌詞と罫線整列のトレードオフ（訂正記録）**: 当初「長文歌詞の重なりは
    `overflow:visible`という既存仕様に由来する」と説明していたが、Fable 5の再計測により
    不正確と判明したため訂正する。修正前は、長文のmin-content幅によってCSS Gridの
    トラック自体が膨張していたため、隣接文字とは重なりにくい代わりに、罫線と歌詞の
    tick位置が小節全体で崩れていた。`min-width:0`でトラックを正しく等分すると、
    長文はトラックを押し広げなくなり、`overflow:visible`のとおり隣へあふれるように
    なる。つまり長文歌詞の重なりは、正しい罫線整列を実現したことで顕在化する
    トレードオフである。1〜2文字では十分な余裕があり、通常の1モーラ運用では
    問題になりにくいことを実測済み（実測: 4文字ずつの組み合わせで約13px、
    8〜9文字の組み合わせで約69pxの重なりを確認）。4文字以上を1セルへ入れる長文表示の
    扱い（省略・縮小・クリップ・モーラ分割案内強化等）は、今回は実装せず将来の
    独立タスクとする（「長文歌詞セルの表示方針検討」として下記に記録）
  - **拍別固定表示の最終仕様**: 表示テキストは「自8/自16/固8/固16」という中間案を経て、
    ユーザー最終決定により「8/16」（有効解像度の数字だけ）＋固定状態だけに表示する
    細いモノクロ線画の南京錠アイコンへ変更した。アイコンはUnicode絵文字（🔒）を
    使わず、`.dock-lyrics-beat-res-btn.is-local::before`のCSS `mask-image`
    （南京錠のSVGデータURI、`background-color: currentColor`）で描画し、OS/ブラウザ
    間の見た目差・カラー絵文字化を回避した。ボタン本体は`display:inline-flex`で
    アイコンと数字を中央配置（外形寸法・position/padding/borderは無変更）。
    内部状態（WeakMap値8/16）・状態サイクル（8→固定16→固定8→8、
    16→固定8→固定16→16）・project/localStorage/appSettingsへの非保存・
    mixed resolution・IME処理・className（`is-local`/`is-auto`）・pointerdown処理・
    v0.22.2のsameRange修正は無変更。title/aria-labelは「全体設定へ自動追従中
    （現在はX分）。クリックすると、この拍だけY分に固定します」「この拍だけX分に
    固定中。全体設定を変えても追従しません。クリックすると、この拍だけY分に
    固定します/自動追従へ戻します」という文章で状態と次の動作を明確に伝える
  - **ユーザー実機確認結果（完了・区切り）**: 紙面歌詞位置修正（罫線マス中央表示）・
    自動状態が8/16の数字のみ・固定状態が鍵アイコン＋8/16・自動/固定切替時にボタンや
    歌詞セルが動かないこと・鍵アイコンの意味/モノクロ線画という方向性、いずれも
    実機確認OK。v0.22.2データ完全性修正・G4最終セルEnter移動の回帰もなし。
    **鍵アイコンの現在サイズ（4.5px）だけは実機で「小さすぎる」と判断された**。
    ただし今回はサイズだけを追加調整せず、v0.22.3はここで一度区切る。鍵アイコンの
    意味・モノクロ線画という方向性は採用したまま、サイズ・線の見え方・数字との
    間隔・ボタン幅は次の「フローター入力UIのデザイントーン調整」フェーズで、
    フローター全体の配色・枠線・背景・影・余白と合わせてまとめて評価・調整する
    （現在の4.5px等の数値を最終仕様として固定しない）。自動状態は数字のみ・
    固定状態だけ鍵を表示するという仕様自体、および内部ロジック（WeakMap・状態
    サイクル・IME処理等）は次フェーズでも変更しない前提とする
- **v0.22.4（実装・検証履歴。反映済みcommit: `c9904591`）: フローター入力UIのデザイントーン
  調整**: 小節ルーペ（フローティング入力パレット）を、洗練された・大人っぽい・
  クール・シンプルなトーンへ調整した。Codex GPT-5.6 Solが実コード・実DOM・
  computed style・ブラウザ上の一時CSSプレビューを使って設計した改善案（A案
  「ニュートラル・ミニマル」を基本に、B案のスレート系focus表現を統合）を採用。
  `.slot-overlay`直下へフローター専用のCSSカスタムプロパティ（`--slot-surface`
  `--slot-input-surface` `--slot-text` `--slot-muted` `--slot-subtle` `--slot-border`
  `--slot-divider` `--slot-focus` `--slot-active` `--slot-fixed` `--slot-fixed-border`
  `--slot-shadow`）を新設し、`:root`・紙面共通の`--primary-color`/`--paper-*`は
  一切変更していない。フローター外枠の高彩度オレンジ（`2px solid #ff9f1c`）を
  廃止し、ニュートラルグレーの1px枠・角丸8pxへ縮小、シャドウも
  `0 18px 48px rgba(0,0,0,.46)`→`0 14px 34px rgba(0,0,0,.36)`へ弱めた。
  内部背景・入力欄・row-body・バルクpopover・各種ボタン（前へ/次へ・8分/16分
  トグル・リセット・まとめて入力・閉じる）の暖色地・オレンジhoverをニュートラル
  グレーへ置き換え、選択中（8分/16分トグルの`is-active`）だけ低彩度ブロンズ
  （`--slot-active` #d5b06f）、focus/focus-visibleはスレート系
  （`--slot-focus` rgba(74,101,126,.78)）に用途を限定した。拍別固定状態
  （`.dock-lyrics-beat-res-btn.is-local`）は`--slot-fixed`（#d9bf8b）＋
  `--slot-fixed-border`（#9a754d）へ。補助文字（`--paper-muted`/`--paper-faint`
  使用箇所）を`--slot-muted`（#62686b）/`--slot-subtle`（#687074）へ差し替えて
  コントラストを改善し、拍別解像度ボタンの自動状態にかかっていた`opacity:0.65`
  （視認性低下の原因）を廃止した。歌詞セル・ストロークセルのhover/focus/is-multi/
  is-composingもオレンジ・黄色からニュートラル/スレートへ調整。コード・歌詞・
  ドレミの色分け（`--paper-chord`/`--paper-lyrics`/`--paper-doremi`等）・紙面
  （`.sheet-page`/`.sheet-bar`系）・小節端境界の強弱階層は維持し、色の意味（強弱）
  だけをオレンジから濃淡グレーへ置き換えた
  - **鍵アイコンのサイズ調整**: v0.22.3で「小さすぎる」と判断されたサイズを、
    アイコン4.5px→6.5px・ボタン幅16px→19px・gap1px→1.5px・SVG stroke-width
    2.4→2.8へ拡大。高さ11px・自動8/自動16/固定8/固定16の4状態間でボタン外形
    寸法が一致することは維持。CSS mask方式・`currentColor`・`-webkit-mask`併記・
    Unicode絵文字不使用・自動状態は数字のみ表示・状態サイクル・title/aria-label・
    内部ロジック（WeakMap・状態サイクル・IME処理等）は無変更
  - **v0.22.4後修正1: フローター内部の見やすさ改善**: ユーザー実機評価「内部が
    以前より見づらくなった」を受け、Fable計測（背景比約1.06:1のほぼ無地状態、
    セクションチップ3.33:1、バルク注記3.73:1、IME変換中背景1.18:1、has-content
    歌詞セルのhover変化なし）を踏まえ、色相は変えず明度・不透明度だけを調整した。
    `--slot-input-surface`を#fbfcfb→#ffffff（純白）へ寄せ、`.slot-overlay-row-body`/
    `.dock-strum-grid`へ薄い内側影（`inset 0 1px 2px rgba(37,41,43,.06)`）を追加して
    外側面との「一段」感を作った。左側ラベル（コード/ストローク/歌詞/ドレミ見出し）
    を`--slot-subtle`→`--slot-muted`、セクションチップ・バルク注記の文字を
    `--slot-text`へ変更してコントラストを改善（各4.5:1以上）。IME変換中背景
    （`.dock-lyrics-cell.is-composing`）のalphaを0.12→0.30、内容ありセルのhover
    背景（`.dock-lyrics-cell:hover`）を`--slot-divider`と同値だったものから
    `rgba(80,88,92,.34)`へ変更し、hover時に変化が見えるようにした。フローター
    外枠・影・角丸・ブロンズ（active/fixed）・スレートfocus・鍵アイコン6.5px・
    拍別ボタン19px×11pxは維持
  - **v0.22.4後修正2: フローター上端が固定ヘッダー裏へ入る問題の修正**: 実機で、
    ルーペのタイトルバーが画面左上固定の`#app-nav`（「← 戻る」/「🏠 TOP」ボタン群。
    top:18px、高さ約39px、下端約57px）の裏へ入り込み上部が切れて見える不具合を
    確認。根本原因は、`clampLoupeY()`の上端下限`LOUPE_TOP_MARGIN`（固定8px）が
    `#app-nav`の存在を考慮しておらず、かつ`initLoupeGeometry()`（アプリ起動直後、
    まだTOP画面で`#app-nav`が`hidden`化されている時点で1度だけ実行）でこの
    値を使ってクランプするため、実際に譜面クルーズ画面でルーペが開かれる頃には
    既に無効な（app-navの高さを考慮しない）Y座標が確定してしまっていたこと。
    `sheet-cruise.js`に`getLoupeMinTop()`を新設し、`#app-nav`の実際の
    `getBoundingClientRect().bottom + 8`（非表示時や未検出時は既存の
    `LOUPE_TOP_MARGIN`にフォールバック）を上端下限として使うよう`clampLoupeY()`を
    変更。加えて、実際にDOMへ座標を反映する`applyLoupeGeometry()`の入口で
    Y座標を都度再クランプすることで、起動時に確定した値も、ルーペが実際に
    表示される瞬間（`renderSlotOverlayContent()`経由）に必ず現在の`#app-nav`・
    viewportに合わせて補正されるようにした（ドラッグ・リサイズの呼び出し元は
    既にクランプ済みの値を渡すため冪等で無害）。実機で、意図的に不正な保存値
    （y:8）を注入した状態からの復元、大きく上方向へのドラッグ、ウィンドウ高さ
    500pxへの縮小、いずれでもルーペ上端と`#app-nav`下端の重なりが0になることを
    確認済み。保存データ形式（`appSettings.barLoupe`の`{x,y,width}`）・
    localStorage key・`schemaVersion`は無変更
  - **v0.22.4後修正3: 上部固定UI全体の再調査＋動的max-height**: 後修正2のcommit前
    再確認で、`#app-nav`だけでなく`.sheet-toolbar`（プロジェクト選択・新規・保存・
    印刷・JSON関連。`position:sticky; top:14px;`、画面幅のほぼ全体を占める）も
    考慮が必要と判明した。`.sheet-toolbar`はスクロール前は通常のドキュメントフロー
    位置にあるが、スクロールするとtop:14pxで画面上部に固定され、実測でその下端
    （約80px）が`#app-nav`の下端（57px）より低いことを確認。`getLoupeMinTop()`を
    拡張し、`.sheet-toolbar`が実際に表示されている場合は「CSSの`top`値＋要素自身の
    高さ」（＝スクロールでsticky固定化された場合の下端。スクロール位置を監視する
    複雑な仕組みは増やさず、常にこの安全側の値を想定する）も候補に加え、
    `#app-nav`との大きい方を採用するようにした（修正後の上端下限は88px＝
    sticky-bottom80px+8px）。また、上端下限が上がった分、CSS側の固定
    `max-height: calc(100vh - 16px)`のままでは下端がviewportを超えうる問題も
    判明したため、`applyLoupeGeometry()`で`window.innerHeight - top - 8px`を
    inline styleの`max-height`として都度設定するようにした（最低160pxは確保。
    CSSのmax-heightはJS無効時のフォールバックとして残置）。実機で、通常幅・
    狭幅・高さ500px/150pxの極端なケースいずれでも、フローターのタイトルバー
    自体が隠れないこと（`document.elementFromPoint()`でz-index的に常に手前に
    あることを確認）、下端がviewport内に収まるか内部スクロール可能であることを
    確認済み。なお、スクロールされていない初期状態（scrollY:0）では
    `.sheet-toolbar`が通常のフロー位置（画面中央付近）にあるため、フローターの
    表示範囲と重なることがあるが、フローターのz-index（40）が`.sheet-toolbar`
    （15）より高いため、フローター自体は隠れず、`.sheet-toolbar`の一部が
    フローターの背後に一時的に隠れるだけである（ルーペを閉じれば解消する
    一時的な状態で、v0.22.4以前から変わらない既存の重なり方でもある）
  - **v0.22.4後修正4: Safari実機でのフローターヘッダー横/縦スクロールバー同時発生の
    修正**: ユーザーSafari実機から、ストローク編集後（「基本に戻す」ボタンが
    ヘッダーへ追加された状態）に全体8分/16分を切り替えると、フローターのヘッダー
    内へ横・縦スクロールバーが同時に出現し、上部が切れて見える不具合の報告があった。
    Chromeでは再現しにくく、原因調査のため一時診断コード（`window.__cruiseLoupeDebug`。
    `measureOverflow()`/`copyOverflow()`でフローター本体・ヘッダー・主要内部要素の
    寸法とcomputed overflowを詳細採取できるAPI）を`sheet-cruise.js`へ一時的に追加し、
    ユーザーにSafari正常状態・不具合状態それぞれのログを取得してもらい比較した。
    原因は2段階だった。(1) `.slot-overlay-head`のCSSに`overflow-x: auto`は指定
    されていたが`overflow-y`は未指定で、CSS仕様上「片方が`auto`でもう片方が
    `visible`のままだと`visible`側も強制的に`auto`へ変換される」規則により、
    ヘッダーが意図せず縦スクロールも可能な要素になっていた。(2) ストローク編集で
    `bar.strumOverride`が立つと「基本に戻す」ボタン（`.slot-overlay-reset-btn`。
    幅約82px）がヘッダー操作列へ追加され、`.slot-overlay-head`のscrollWidthが
    clientWidth（680px幅時638px）を約31〜34px超過。Safariの通常型（実領域を消費する）
    横スクロールバーがヘッダー高37pxのうち約15〜16pxを占有した結果、内部の操作列
    （高さ約30px）を収めるための実効clientHeightが22pxまで減り、(1)で強制された
    `overflow-y:auto`と相まって操作列の上下がクリップされていた。修正は2段階。
    まず`.slot-overlay-head`へ`overflow-y: hidden;`を追加し、CSS仕様上の強制`auto`化を
    断ち切って縦スクロールを恒久的に禁止（既存の`overflow-x: auto`はそのまま維持）。
    続けて、この`overflow-y:hidden`だけでは横超過時に操作列自体が縦クリップされたままに
    なることが判明したため、根本原因である横幅超過そのものを解消する追加修正を行った。
    `.slot-overlay-head-actions`を`flex: 0 0 auto`から`flex: 1 1 auto; min-width: 0;`へ
    変更してヘッダー内の残り幅までは縮小できるようにしたうえで、主要操作ボタン群
    （`.slot-overlay-nav`・`.slot-overlay-res-toggle`・`.slot-overlay-reset-btn`・
    `.slot-overlay-bulk-toggle`・`.slot-overlay-close`）には個別に`flex-shrink: 0`を
    指定して縮小対象から除外し、縮小先を補助文言`.slot-overlay-hint`
    （「Alt+←/→で移動」）1つだけに集中させた（`overflow:hidden; text-overflow:ellipsis;
    flex-shrink:1; min-width:0;`）。これにより、680px幅でresetBtn表示時でも
    `head.scrollWidth`が`clientWidth`を超えなくなり（実測638px=638px、超過0px）、
    横スクロールバー自体が発生しなくなった（`offsetHeight-clientHeight`が16px→1pxへ、
    borderのみに縮小）。960px等の余裕がある幅では補助文言は全文表示のまま
    （flex-shrinkは実際に幅が不足したときだけ働くため、通常時の見た目は無変更）。
    680px未満の狭幅（既存の`isNarrowViewport()`によるフローター幅クランプ）では
    従来どおり横スクロールが発生しうるが、これは今回のスコープ外の既存挙動であり
    悪化させていない。ユーザーSafari実機で、Cmd+R再読み込み後・680px付近表示・
    ストローク編集後の「基本に戻す」表示・全体8分/16分切替のいずれの条件でも
    横スクロールバーが出ない・ヘッダー上部が切れない・主要ボタンがすべて操作
    できる・補助文言の省略表示は許容、という結果で1〜8すべてOKの実機承認を得た。
    原因特定・修正効果の確認に使った一時診断コード（`LOUPE_DEBUG`ブロック・
    `window.__cruiseLoupeDebug`・`measureOverflow()`/`copyOverflow()`・各所への
    観測用イベントリスナー・MutationObserver）は、実機承認後に`sheet-cruise.js`から
    完全に削除済み（本番差分には診断APIを残さない）
  - `sheet-cruise.js`は上記のクランプ関連（`getLoupeMinTop()`新設・拡張・
    `clampLoupeY()`/`applyLoupeGeometry()`の修正、新規定数`LOUPE_BOTTOM_MARGIN`・
    `LOUPE_MIN_AVAILABLE_HEIGHT`の追加）のみ変更。DOM構造・入力ロジック・
    保存データ構造・`sheet-renderer.js`・`print.css`・`schemaVersion`は一切変更
    していない。`theme.css`は上記に加え、後修正4のヘッダーSafari対策
    （`.slot-overlay-head`の`overflow-y:hidden`、`.slot-overlay-head-actions`の
    flex縮小許可、主要ボタン群の`flex-shrink:0`、`.slot-overlay-hint`のellipsis
    縮小）のみ変更。変更ファイルは`theme.css`・`sheet-cruise.js`・`index.html`の
    バージョン参照・`song-model.js`のバージョン行

**完了条件**: 譜面が常に主役として大きく表示され、紙面デザインのフローティング小節ルーペから
小節の主要な入力（コード・ストローク・歌詞・ドレミ）が完結できる。旧overlay編集・
旧一覧編集UIへの依存を段階的に下げられる状態になる。

## Phase 3.6: 紙面の小節数固定表示（未着手・ユーザー確定要望）

Phase 3.5（小節ルーペ）とは独立した、紙面（`.sheet-page`）本体のレイアウトフェーズ。
ユーザーから、楽譜本体は入力状況にかかわらず常に横4小節並びへ固定したいという
確定要望があった。現状は歌詞・ドレミの有無で`show.barsPerLine`が2倍詰め
（`sheet-cruise.js`/`sheet-renderer.js`の`hasVocal`判定）になる仕様のため、
これをどう扱うかは未設計。

- 対象: `sheet-renderer.js`（`hasVocal`による2倍詰め判定・`render()`の行組み）、
  `print.css`（印刷時のレイアウト）
- 今回（G1時点）はこれらのファイル・紙面レイアウト・印刷/PDFに一切触れていない
- 着手時期・詳細設計は未定。着手時は専用のADRを起こす

## Phase 4: プレDTMクルーズ用内部データ整備

- strumPatterns の音価・アクセントをMIDI発音情報として確定
- `music-theory.js` の階名→MIDIノート変換と単体検証
- arrangement 設定の拡張（パターン選択・オクターブ・ベロシティ方針）
- 必要なら schemaVersion を上げ、migrateProject を実装

**完了条件**: StudioProject から「発音イベント列（ノート・開始tick・長さ・ベロシティ）」を
純関数で導出できる（音は鳴らなくてよい）。

## Phase 5: プレDTMクルーズMVP

- `js/modules/pre-dtm-cruise/` 実装
- アコギストローク / ベースルート8分 / ドラム8ビートの生成
- Web Audio での試聴（簡易音源でよい）
- SMF(.mid) 書き出し（format 1、パート別トラック）

**進捗**（v0.6.0時点）:
- 実装済み（実用の入口）: 伴奏設定UI（パートON/OFF、アコギ=パターン3種＋曲の基本ストローク
  ＋アクセント3段階、ベース=ルート8分/4分/ルート＋5度、ドラム=8ビート/4つ打ち/シンプル。
  設定は `cruiseStudio.appSettings` に保存: ADR-014）、
  設定反映の再生成、**SMF Type 1 の .mid 書き出し（ベース/ドラム。自前実装＋自己検証: ADR-015）**、
  伴奏JSONの強化（settings・parts・全イベント・警告を含むDAW前の設計図）
- 残: Web Audio試聴、ギターのボイシング展開→アコギのMIDI化（Track 3追加）、
  パターンの拡充、プロジェクト固有アレンジ保存（schemaVersion 2）

**次フェーズのSMF拡張手順**（記録）: アコギのボイシング展開関数
（chordParsed → MIDIノート配列）を engine に追加 → guitar イベントに `midiNotes[]` を持たせる
→ `midi-export.js` の対象トラックに guitar を足す（構造は既にトラック追加だけで済む形）。

**完了条件**: 譜面クルーズで作った曲の .mid を DAW（Logic等）で開き、
コード進行どおりの伴奏が鳴る。

## Phase 6: 五線譜/TAB/MusicXML

- **Shell / 共有基盤整備後にStructure機能開発を再開し、その後に着手する**
- VexFlow を `vendor/` に取り込み（rhythm-cruise の前例に倣う）
- メロディの五線譜表示、コードダイアグラム、TAB表示
- MusicXML書き出し（Guitar Pro 橋渡し用）

**完了条件**: メロディが五線譜で表示され、MusicXML が MuseScore / Guitar Pro で開ける。

## Phase 7: 既存アプリ連携

この節のランチャーは既存実装の履歴。現在の正式目標は上記PC統合であり、
リンク起動だけを統合完了とはしない。共有機能はMetronome M1 / M2 / M3から段階導入する。

- 母艦TOPから音感 / 指板 / リズムクルーズへのリンク起動
- URLパラメータでの練習コンテキスト受け渡し検討（例: BPM）
- **既存アプリ側には一切変更を加えない**。既存側の改修が必要な連携は別途合意してから

**進捗**:
- v0.5.0: シリーズランチャー画面（アプリ名・用途説明・注意書き・別タブリンク起動。
  iframe不採用、既存アプリ本体は無変更。ADR-012）
- v0.6.1: ランチャーにコードクルーズ（`../chord-cruise/`）を追加。既存アプリ本体は無変更のまま
- 残: URLパラメータでのコンテキスト受け渡し（既存側対応が必要になった時点で別途合意）

**完了条件**: スタジオ内から3アプリを開ける。既存アプリのdiffがゼロ。→ **達成（v0.5.0）**

## Phase 8: PRO版/認証/feature flag

現在の統合では[Shell ContractのPro / Account・Sync host](docs/SHELL_CONTRACT.md#19-pro--account)を優先する。
Product policy / Runtime access state / Account・AppDevice credential / Backend authorizationを分離し、
既存pro-gateをfeature単位の検証器としてそのまま使えるとは仮定しない。

- M1はStandard相当で認証なし、M2は隔離policy / 保存契約検証、M3で正式資格とSyncを接続する。
- server-issued資格、generation・失効、device-bound session、有料backendの二重資格検証を維持する。
- 番号・照合ハッシュをHTML / JSへ置かず、metadata / edition / URL / appSettingsを認可根拠にしない。
- Standardへ戻ってもstored Pro設定を削除 / 初期化しない。
- Studio Proは未実装。feature単位UIと既存認可の接続は実装前に検証する。

**完了条件**: 正式資格・失効・backend認可・Account / deviceの境界を守り、
M3 acceptanceと影響範囲の回帰確認を通過する。既存側変更が必要なら別工程で明示する。


## Focus / Keyboard / Modal基盤 v1（0.23.1・2026-10-11）

command target / focused controlを分離し、Captureはmodal、Bubbleは既存control → musical → workspace → Shell。
text controlをIMEより先に除外。局所Escapeだけ明示委譲し、modal / popover / 右overlay / Structureの単独ownerを決定。
Structure独立document Escape listenerをadapter登録へ移し、入力・歌詞4 guard・load / draft保持を維持。
Modalはsingle active native dialog基盤のみ。window.confirm / 非modal Loupe / bulk popoverは維持する。
Save / Undo / Playは未実装。未接続targetはnull。詳細は[契約§31](docs/SHELL_CONTRACT.md#31-focus--keyboard--modal-v1実装境界0231--2026-10-11)。

Nodeは既存73 + 新規27 = 100 PASS。隔離Chromeは20ケース（親test込み21）PASS。
50回workspace往復でload各1回、document keydown Capture / Bubble各1本から増加なし。
4幅、4テーマ、modal / pane / focus / IME合成sequenceとChrome CDP compositionを確認。
Project / Arrangement JSONはappVersionだけ更新。MIDI 813 bytesと印刷PDFラスタ完全一致。
Safari・OSの日本語IME実機・実プリンターは未再検証。次はStructure Editing Session接続。


## Audio Coordinator v1 + Metronome M1（0.25.0 / 2026-10-11）

Port読み取り監査により方式Cのsource一致付きtiming/audio projectionを採用。
registry / lease / ownerと音楽engineを分離し、Dock Auxiliary ToolへBPM / Start / Stopを接続した。
workspace / Dock / Theme / visibility hiddenで継続、context interruption / page破棄で停止・closeする。
Node218 + Chrome70独立ケース = 288検証。50実Start/Stop、4テーマ / 4幅、既存Save / Session /
working source回帰、JSON appVersion差のみ、MIDI / audio稼働中A4ラスタ一致。
詳細とpendingは[AUDIO_COORDINATOR](docs/AUDIO_COORDINATOR.md)。次の正式工程は隔離Metronome M2。
M1は保存・Pro・Account・Sync・presets・Transportの製品統合完了ではない。


## Schema 2 Foundation M1 candidate

Studio 0.39.0 / schema 2。新しい保存能力を追加するminor更新（schema番号とは独立）。実装・検証中。M1完了・commit・push・main統合・公開は未実施。[正式契約]( docs/SCHEMA2_FOUNDATION.md )。


## Schema 2 M1 Data Amplification Recovery 停止（2026-10-16）

0.39.0/schema 2候補。保存後RangeErrorとraw反復展開は解消。Node1051 PASS（FAIL/skip0）、Browser460 PASS／2 FAIL／skip0。64小節command p95 11.4ms、Staff104.4ms（保存・再読込後）。128小節command p95 23.2msとCMM変換baseline比約1.9倍が残り、M1未受入。fresh remote mainもdbd9a46から10296dbbへ進行したため、個別停止条件に従い差分保持・staged空・commit/pushなし。既存main root/Studio worktree/原本9hashは不変。M2/M3未着手。[最新停止記録と35項目](docs/SCHEMA2_FOUNDATION.md)を参照。

## New consumer Admission / BPM isolated vertical (0.47.18 candidate)

Readonly cutover generations can request a new, exact operation lease through the
existing owner SQL gate. Studio's injected draft controller exercises read/edit/
explicit save/reload; normal boot and canWrite=false remain unchanged. See Port
`docs/CONSUMER_READMISSION_BPM_ISOLATED.md`. Renewal adoption into another local
Authority, normal consumer/provider cutover and production Cloud remain later gates.

## Port 練習メニュー・カレンダー共通化（Studio 0.51.0候補、2026-10-31）

隔離 worktree `codex/studio-ui-practice-20261031` で、Port Standard 実文書を Studio の主入口に接続。旧閲覧専用画面は「保存値の概要」へ移し、Port owner の保存キー・schema・Pro gate を変更せず作成/編集/削除/並べ替え/タイマー/記録/カレンダーを受入した。実 Pro、Account、添付 binary、二端末 Sync は未受入。次は機材リスト、その後 My Apps。詳細は [Phase 3 結果](docs/PORT_PRACTICE_PHASE1_RESULT.md)。

## Port 機材リスト・My Apps 共通化（Studio 0.52.0候補、2026-10-31）

隔離 worktree `codex/studio-ui-gear-myapps-20261031` に 0.51.0 候補をハッシュ一致で複製し、機材と My Apps の正規入口を Port Standard 実文書へ接続。Studio 旧画面は read-only 概要に限定した。Port の保存・認証・Sync 契約を変更せず、合成 Chrome で CRUD、カテゴリ、並べ替え、表示サイズ、プリセット、写真/アイコンの既存 Blob 表示と削除、Standard 制限、外部 URL の別タブ起動を確認した。実 Pro、実 Account、二端末 Sync、画像書出しは未受入。次は NEWS 実画面、続いて4アプリの正規 launcher と独立データ契約を確認する。詳細は [Phase 4 結果](docs/PORT_GEAR_MYAPPS_PHASE1_RESULT.md)。

## Port NEWS・4アプリ正規導線（Studio 0.53.0候補、2026-10-31）

隔離 worktree `codex/studio-ui-news-apps-20261031` に0.52.0候補をハッシュ一致で複製し、Home/左ナビのNEWSをPort実画面へ接続した。4アプリの通常版/Pro版リンクとアイコンはPortのカタログを参照し、別タブで元アプリを起動する。合成ChromeでNEWS単独/埋込表示、カテゴリ、記事詳細、外部リンク、8つの起動先、4テーマ、狭いPC幅を確認した。実Pro/Account/二端末Syncと本番originのNEWS表示は未受入。PortテーマNodeの旧期待値修正はUI差分から分離した。[Phase 5 結果・統合手順](docs/PORT_NEWS_SERIES_PHASE1_RESULT.md)。
