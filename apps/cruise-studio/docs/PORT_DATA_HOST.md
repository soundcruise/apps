# Studio Read-only Port Data Host v1

## Studio Practice Read-only PC Workspace v1（2026-10-14・現行）

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
契約・正式schema・未接続境界は[Practice PC契約](PRACTICE_PC_PRESENTATION.md)を参照。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
L3c未解決/Daybreak待機を維持し、新規security probe・本番deployなし。通常PC UI gateをAuthority安全性承認やM3解禁と扱わない。
次はPractice実機確認とPC機能優先度整理。編集/添付本体/正式共有write/Account/Syncは別工程。
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
[観測済み失効の正式契約](../../cruise-port/docs/PRO_TERMINAL_DENIAL_CONTRACT.md)を参照。限定対象はterminal伝播・不正clockのsticky拒否・fresh native oracle。

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
[正式Pro Adapter契約](../../cruise-port/docs/AUTHORITY_PRO_DEVICE_ADAPTER.md)を参照。正式SoundCruiseProOperationSource、Device Session receipt、既存操作resolverを使う。
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
[証拠寿命契約](../../cruise-port/docs/AUTHORITY_EVIDENCE_LIFETIME.md)をControl契約と合わせて参照する。
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
[正式Control契約](../../cruise-port/docs/AUTHORITY_CONTROL.md)をPointer/Action Policy/Repository契約と合わせて参照する。

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
[Pointer正式契約](../../cruise-port/docs/AUTHORITY_POINTER_SCHEMA_V2.md)にprovenance/current integrity/collision/retry/historyの詳細を定義する。

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

Port1.22.12 / Studio0.26.6 / schema1。[Action Policy](../../cruise-port/docs/AUTHORITY_ACTION_POLICY.md)が新Authorityの正式操作契約。
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

## L2b Repository接続（2026-10-13・現行）

Port **1.22.10** / Studio **0.26.4 / schema1**。内部adapter/cache readerのpatch。通常UI・保存先は変更しない。
Production Authority **legacy** / Worker **ACCEPT_COMPAT** / enforcement **OFF** / Studio shared write **OFF** / PortDataHost.canWrite=**false**。
正式Pro・Account・製品controlはL3未接続。fixture controlのPASSを製品controlのPASSへ読み替えない。
B1-6再開不可（L3→L4→L5のgateが残る）、shared write解禁不可。本番Worker/D1 deployなし。

Port-owned隔離Repository backendはL2bで実証する。Studio Hostはproduction legacy readerのまま。
独自Authority DB/書込みexecutor/製品接続を作らない。M1/M2/Structure/Editing Session/Pre-DTMも移行しない。
reader cacheの更新と編集draft/baseを分ける。正式Pro/Account/source連携はL3、binary/migration/pointerはL4、実機はL5。
fixture-only hydrate/CAS/intent/oplogと実証結果は[Repository契約](../../cruise-port/docs/PORT_DATASET_REPOSITORY.md)。
read-only起動のensure/provision/bootstrap/mutation0、Host10＋Studio97 browser（Print/4Themes込み）を確認。

以下は各工程当時の履歴。旧「L2b未接続」の記述は当時の状態を示す。

## L1 cross-tab契約（2026-10-12・現行）

Port1.22.8 / Studio0.26.2。[Cross-tab Authority Contract](../../cruise-port/docs/CROSS_TAB_AUTHORITY_CONTRACT.md)を参照。
Web Locks + localStorageはcross-tab線形化を保証せず、実Repositoryでlost updateとdelete intent消失を実測した。
StudioはPort-owned Authorityのconsumerのままで、HostはIndexedDB Authority（L2以降）完成までread-only・canWrite=false。
Studio独自のdataset/IDBは作らない。Facadeのoperation guardはL3でcommit transaction内評価へ移る。

## Operation guard接続準備（2026-10-12）

Port1.22.8 / Studio0.26.2。[共通認可契約](../../cruise-port/docs/OPERATION_COMMIT_GUARD.md)を参照。
dormant Facadeの固定operation contextと同期guardをPort Repositoryへ渡す。正式Pro Device Session proof、
wall/monotonic期限とsync資格/epoch/失効sourceを使用し、表示cached statusを認可と扱わない。
製品Hostはread-only、executorなし、canWrite=false/shared write OFF。badge表示でensure/renewしない。
確定前の拒否は失敗、確定後は旧operationIdのlocal-saved/sync-unconfirmed/publish=falseを保持する。
Account ownershipとPro device資格は別条件。Standard操作はPro失効だけで止めない。
B1-6未完了、cross-tab可視化/未通知server revokeの限界は共通契約に明記。以下は工程履歴。

## B1-5 Worker fenceとread-only Host（2026-10-12・現行）

Port1.22.5 / Studio0.26.1 / Studio schema1。[Workerの正式契約](../../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を参照。
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

Port1.22.4 / Studio0.26.1 / Studio schema1。[Migration契約](../../cruise-port/docs/PORT_AUTHORITY_MIGRATION.md)。
Portのjournal/stage/reconcile/seal/recoveryを隔離検証。Hostはproduction legacy read-only、canWrite=false、cached副作用0を維持する。
Studio本体変更はPort import cache参照だけ。M1/M2/Structure/Editing Session/Pre-DTMを移行engineへ接続しない。
B1未解消、shared write OFF。B1-5の実効server fence後に製品gateを再判定する。以下は前工程の履歴。

## B1-2 / B1-3 Authority Preparation（2026-10-12）

Port1.22.3 / Studio0.26.1 / project schema1。[Local Authority契約](../../cruise-port/docs/PORT_LOCAL_AUTHORITY.md)を参照。
Port-owned prepared dataset/Sync DB/binaryは隔離fixtureで実証したが、production readerはlegacy read modelを維持。
HostのcanWrite=false、old-build-unknown、cached side-effect 0は不変。preparedだけでStudio writeを解禁しない。
metadataにprotocol/authority stateを追加しない。M2/Structure/audio/renderer/preset UIへ今回の変更を接続しない。
B1未解消、enforcement OFF、production migration/cutoverなし。以下は前工程の履歴。

## B1-1 Authority Contract（2026-10-11）

Port 1.22.2 / Studio 0.26.1 / Studio schemaVersion 1。
[Sync Writer Authority](../../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を新authority wire契約とする。
WorkerはACCEPT_COMPAT固定、legacy request許可。authority writerProtocol=2 / syncProtocol=1を受理できるが、
既存local Repository / writer protocolは1のまま。新wire送信は明示注入だけで、production clientはlegacy envelopeを維持。
D1はadditive metadataのみ。minimum fence OFF、local authority migration未実施、B1未解消。
Studio shared write OFF / PortDataHost.canWrite=false / old-build-unknownを維持する。
Worker deploy・production D1適用は未実施。次はB1-2のprotocol adoption / authority取得 / blocked UX。
以下の既存version・検証件数は前工程の履歴。

2026-10-11 / Studio 0.26.1 / project schemaVersion 1 / Port 1.22.1。

## Write Gate Prerequisites v1（現行）

[Port Write Readiness](../../cruise-port/docs/PORT_WRITE_READINESS.md)を正式gate契約とする。
B2 reader-first→owner bindingとB3新buildの別context Sync排他は修正済み。
B1は未解消。unknown old writerを排除できないため、production shared write OFF、canWrite=falseを固定する。
writerProtocol / repositoryProtocolは1。metadata capabilityはauthorizationではない。

getCapabilities / getWriteReadinessはcacheのみ。checkWriteReadinessは明示local inspectionでowner取得やensureをしない。
enableLocalWrites / activateSyncは明示userIntentを要求するが、production old-build-unknownで拒否する。
URL / storage / debug flagで解禁しない。cached readinessからformal Pro resolverを呼ばない。

dormant PortMetronomeFacadeのload/listはHost read model。M2 storeへそのまま差し替えられるadapterではない。
production write拒否、隔離fixtureだけprivate opaque baseToken / Repository CAS / operation guardを実証。
outbox APIやpartial Sync snapshotを作らず、UI / M2 / audioへwrite接続しない。

最終回帰はStudio Node314 PASS（Git clean検査1件はcommit後確認）、Port/shared1417、Worker592、Other apps85 PASS。
Studio Chrome97とHost10ケースPASS。cached DB/network/ensure/owner/provision/bootstrap/push/pullはすべて0。
Project/ArrangementはappVersion0.26.1だけ変更、MIDI813 bytesのSHAは下記と一致。紙面DOM/print条件も維持。
初期v1のPDF raster hashは履歴であり、今回の新PDF pixel比較結果として扱わない。

## 所有と境界

UI hostはCruise Studio、ownerAppはcruise-port、dataOwner / syncOwnerはport。
`js/port-data/host.mjs`がread modelとgeneration、`connection.mjs`がPort repository / runtime consumer / local DB / Pro receiptへ接続する。
`panel.mjs`が既存Tool paneへ表示する。Host / connectionはAudio・Structure・M2 Controllerを所有しない。
0.27.0のpanelは明示BPMだけをM1.setBpm経由でM2 memoryへ渡す。Port writer facadeへの接続は持たない。

Hostは`canRead=true`、`canWrite=false`、`getCachedStatus()`、`readLocalStatus()`、`subscribe()`、`dispose()`と上記readiness / explicit intent APIを公開する。
commit / save / ensure / provision / bootstrap / push / pull / conflict resolution / preset CRUDは公開しない。
M2のMemoryStore → Settings Controller → Audio runtimeは従来どおり独立。正式Port preset applyは未実装。
PC PresentationのStandard BPM一時反映とは別の契約である。

## 起動とstatus

初期Host・Tool表示・cached status・subscriptionはDBを開かず、保存データも資格も読まず、runtimeを作らない。
最初は未確認。「ローカル保存値を確認」の明示操作で初めて定義moduleをloadし、Port hostのread-only consumerへ登録する。
既存globalの定義を上書きしない。`new MultiAppSyncRuntime`は呼ばない。
Port ownerが同contextに存在すれば、そのcached status / identityを参照する。別tabのruntime instanceは別物。

local inspectionはAccount DB・account-scoped Port Sync DBをreadonly transactionで読む。
DBが存在しなければupgradeをabortしてschemaを作らない。DBロック等の利用不能はunavailableへ。
Port ownerのstatusイベントを発火しないため、同contextのasset handler等を読取りから起動しない。
資格・outbox・conflictのraw値は接続境界の内部だけで使用し、featureへはstatusと件数から導出した表示状態だけを渡す。

Account: unknown / no-account-known / account-known / membership-known / unavailable。
Sync: unknown / synced / pending / conflict / error。資格があるだけではsyncedにしない。
active ownerが持つfreshなusableの証拠がないlocal cacheはunknown。未確認は未接続やStandardと同義ではない。
Account設定・Sync開始・競合解決はPortへの小さなリンクのみ。Studioに操作画面を移植しない。

## Formal Proの読取り

shared `pro-device-session.js`へ既存検証を使う`createReadOnlyClient()`を追加した。
正式scp1の形式・generationと、保存済み非extractable device key / AES-GCM receipt / session metadata /
7日offline境界 / clock rollbackを既存allowanceと同じ規則で検査する。
readonly modeは鍵やsessionを作らず、receiptのhigh-waterや期限切れflagsを永続化せず、refresh / network関数も公開しない。
同じreader内のhigh-water / expired観測はmemoryに保持し、時刻を戻しただけで有効表示へ復帰させない。
有効期限に達した表示は所有するtimeoutで再評価し、disposeでtimeoutを解除する。
これは表示証拠であり、backend authorizationや書込資格を発行するAPIではない。

状態: unknown / standard / cached-valid / expired / stale / unavailable。
未検証のtokenだけではProを表示しない。network検証しないのでonline-validとは表示しない。
現行Portは失効時にauthを除去し、永続cacheに「失効」と「未取得」の原因を常に残す契約ではない。
したがってStudioが未観測のrevokeを断定しない。authなしはローカルStandard、判定不能はunknown/unavailable。
保存済みreceiptの期限切れ・clock rollbackは区別する。ProとAccount資格は別の契約であり、Account membershipでProを推測しない。

## Dataset / Metronome / presets

PortDatasetRepositoryのshared read lockからfull raw snapshotを取得し、Host接続境界内だけに保持する。
Port側のforward guardが拒否する場合、同じ読取りで取得済みのrawから表示可能な既知fieldだけを投影する。
pending WAL / protocol mismatch等の安全に読めない状態はunavailable。migration saveや独自migrationはしない。
M2に既存のPort source parity付きschemaを使い、non-persisted legacy viewを作る。

公開read modelはSHA-256化したopaque repository revision、repository generation、runtime generation、account identity、
settings schema state、saved BPM、known effective settings、preset stable ID / name / order / known settingsだけ。
raw revisionに全datasetが含まれるPort契約をそのままUIへ漏らさない。未知fieldはrawに保持し、再serializeして保存しない。
Standard effective設定でもraw Pro値やpresetを削除しない。formal cached Proが検証できた場合のみPro effective投影を行う。
未対応preset envelopeではID/name/BPMの閲覧に留め、current形式への降格はしない。

## 通知 / generation / dispose

Account generation / storage event / Port local-data / remote-apply / runtime statusを購読する。
変更時はgenerationを進め、古いconsumerをdetach、stateをunknownへ戻し、既に明示読取りを開始したHostだけ再読取りする。
request sequence・Account generation・保存済みAccount資格の前後一致で遅い結果を拒否する。
旧snapshot / Pro / Sync結果を新Accountの結果として再利用しない。

Port datasetの物理保存先はorigin共通で、Account別のdatasetではない。
Account切替後にも同じlocal rawが存在することはあり得る。それを新Accountのcloudデータと認定しない。
新generationで現在のorigin-local値を読み直すだけであり、Account切替によるdataset移行・消去はPort側の責務。

外部更新はToolのread modelだけへ反映し、Studio全体reload、Structure session変更、M2 draft/BPM変更、audio Stopを行わない。
Host disposeはconsumer・repository / Account / status subscription・storage / lifecycle listener・expiry timerを解除。
read-only consumerはPort runtime ownerをstopしない。pagehideで解放し、BFCache復帰では未確認のHostを作り直す。

## Origin / deployment

2026-10-11に`gh api repos/soundcruise/apps/pages`をread-only確認。
`status=built`、`cname=soundcruise.jp`、`html_url=https://soundcruise.jp/`、`source={branch:main,path:/}`、`build_type=legacy`。
root CNAMEもsoundcruise.jp。現在の配信設定ではStudio / Portを同じoriginの
`/apps/cruise-studio/` / `/apps/cruise-port/`で配信する構成（A）。Studioの公開製品化完了を意味しない。
公開URLのweb取得はこの実行環境では利用不可だったため、公開画面の動作確認とは分ける。

localStorage / IndexedDBはscheme + host + portに閉じる。
127.0.0.1:8765、127.0.0.1:8766、soundcruise.jpの保存領域はそれぞれ別。
localhost配信から本番Portデータは読めない。検証ではrepository rootを8766に配信し、隔離した同一origin fixtureを使用。
Studioディレクトリだけのstatic serverではsibling Port/shared moduleの読取りが404になり得る。
別originへStudioを移す場合はAPI/connector設計が必要であり、localStorage共有の代替として暗黙network fallbackは行わない。

## UIと残る条件

Tool paneの小さなread-only詳細にsaved BPM / effective設定 / 形式 / Sync / Pro / Account / presetsを配置。
Dockは現在のM2 memory BPM / Start / Stopを維持。semantic tokenのみ。native button・link・見出し・リスト、aria-liveのstatus表示。
4 Theme / keyboard / print非表示を検証。Port CSSはimportしない。

旧build tabは新Web Lockへ参加しない。M3 shared write前のBlockerとして残す。
次はM3 shared write解禁条件の設計・独立監査。old-build policy、dirty/base/playback保護、正式資格失効、mobile/Safariを検証してから判断する。
Prerequisitesではdormant PortMetronomeFacadeを準備したが、production shared writeは未解禁。

## 初期Read-only Host v1（0.26.0）の検証履歴

- Studio Node: baseline276。追加Host25件。commit前の機能300件PASS、既存の「Studio外tracked差分なし」Git状態検査1件は今回の共有変更を検出するため別扱い。commit後に全301件を確認する。
- 既存Studio Chrome: 97 tests（親container4を含み93独立ケース）PASS。
- Host Chrome: 10ケースPASS。起動/strict cache DB open0、Account/Sync/Pro readで永続書込0、data API network0、runtime未生成。
- native DB / storage前後比較、forward / Standard / cached Pro / offline / conflict / Account A→B、Port writer別tab通知、50 mount/unmount、Structure dirty/M2再生非干渉。
- Port/shared1371 PASS（既存1370 + readonly Pro1）、Worker/Account592 PASS、他4 apps85 PASS。
- Proは本番資格を使わず、隔離されたdevice keyと暗号化receipt fixtureで検証。本番API操作なし。
- 既存IME browser fixtureは前の合成compositionの遅延DOM再描画を待ってからCDPを開始するよう修正。旧HTMLでも同じ2件の失敗を再現して切り分け、native compositionend/文字保持/Modalを維持。Keyboard/Modal製品コードは不変。
- 固定fixture: Project JSON8077 bytes / Arrangement JSON26991 bytesはappVersionだけ0.26.0。
- MIDI813 bytes SHA-256 `5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`一致。
- A4 PDF1200px raster SHA-256 `8cc02f7356af60a0bbccf9349148c57d0c0784f13b2588b2b3cdb107f75a406e`一致。
- console / app404 / unhandled rejection0。検証用8766serverは検証後停止。既存8765は操作しない。

再現: `node --test apps/cruise-studio/tests/*.test.mjs`、既存4本の`*.browser.cjs`を`STUDIO_URL=http://127.0.0.1:8766/apps/cruise-studio/`で直列実行。
Host browserは`node apps/cruise-studio/tests/port-data-host.browser.cjs`（bundled PlaywrightとChromeが必要）。
共有変更はPro read-only modeと回帰testだけ。全consumer HTMLのcache queryをrootルールに従って更新した。
Portのdomain code/version、他4 appsのdomain code/version、Worker、Studio project schema、Feature Metadataのruntime非保持を維持する。

## 初期Read-only Host v1のCommit対象（26 files・履歴）

- `apps/chord-cruise/pro_k7m4q9v2x8/index.html`
- `apps/chord-cruise/pro_k7m4q9v2x8/sync-cohort.html`
- `apps/cruise-port/pro_9a3943176561/index.html`
- `apps/cruise-studio/ROADMAP.md`
- `apps/cruise-studio/ai-handoff/PROJECT_STATE.md`
- `apps/cruise-studio/docs/FEATURE_METADATA.md`
- `apps/cruise-studio/docs/METRONOME_INTEGRATION.md`
- `apps/cruise-studio/docs/PORT_DATA_HOST.md`
- `apps/cruise-studio/index.html`
- `apps/cruise-studio/js/core/component-metadata.mjs`
- `apps/cruise-studio/js/core/feature-registry.mjs`
- `apps/cruise-studio/js/core/song-model.js`
- `apps/cruise-studio/js/port-data/connection.mjs`
- `apps/cruise-studio/js/port-data/host.mjs`
- `apps/cruise-studio/js/port-data/panel.mjs`
- `apps/cruise-studio/shell.css`
- `apps/cruise-studio/tests/color-theme.test.mjs`
- `apps/cruise-studio/tests/feature-metadata.test.mjs`
- `apps/cruise-studio/tests/keyboard-modal.browser.cjs`
- `apps/cruise-studio/tests/port-data-host.browser.cjs`
- `apps/cruise-studio/tests/port-data-host.test.mjs`
- `apps/fretboard_cruise/pro_a9f4k7q2m8z/index.html`
- `apps/pitch-cruise/pro_x9v7q2m8/index.html`
- `apps/rhythm-cruise/pro_r4m8k7n2q9x/index.html`
- `apps/shared/pro-device-session.js`
- `apps/shared/pro-device-session.test.mjs`
