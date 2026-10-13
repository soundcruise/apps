# B1-6 Authority Integration v4 — Pro認可と最終commitの接続競合で停止

## L3c Observed Revocation Safety Fix（2026-10-13・現行）

開始HEAD/origin/main/remote main=`a6b5bcd988995585f2ed80e40175f3924e1b0d6f`、tracked/staged空、ahead/behind0/0。
Port **1.22.18** / Studio **0.26.12** / Studio schema1 / Authority physical schema2・9 stores。
[観測済み失効の正式契約](PRO_TERMINAL_DENIAL_CONTRACT.md)を参照。限定対象はterminal伝播・不正clockのsticky拒否・fresh native oracle。

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
[正式Pro Adapter契約](AUTHORITY_PRO_DEVICE_ADAPTER.md)を参照。正式SoundCruiseProOperationSource、Device Session receipt、既存操作resolverを使う。
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
[証拠寿命契約](AUTHORITY_EVIDENCE_LIFETIME.md)をControl契約と合わせて参照する。
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
[正式Control契約](AUTHORITY_CONTROL.md)をPointer/Action Policy/Repository契約と合わせて参照する。

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
[Pointer正式契約](AUTHORITY_POINTER_SCHEMA_V2.md)にprovenance/current integrity/collision/retry/historyの詳細を定義する。

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

Port1.22.12 / Studio0.26.6 / schema1。[Action Policy](AUTHORITY_ACTION_POLICY.md)が新Authorityの正式操作契約。
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

## L2b-fix Referential Integrity（2026-10-13・現行）

Port1.22.11 / Studio0.26.5 / schema1。[参照整合性契約](PORT_REFERENTIAL_INTEGRITY.md)を現在の正式契約とする。
承認済み開始baseline6a057e6055d252a459a4fcb60c07a53ee6557ccb（NEWS commit保持）。
旧L2b監査Cのattachment/owner-set intent欠落とmenu-delete/attachment-add write skewをNode/nativeで再現して修正。
添付intentは最新headから世代付きmerge。Storeの同一transaction内でmerge後candidateのhard owner/source参照を検証する。
添付↔menuの一律key依存に代えて両方向candidate検査を採用し、無関係menu/keyの並行保存を維持する。
許容されるmissing My App・Practice set/history/cumulative/cache参照は保持する。owner deleteは明示coordinated writer。
Node35件/native63round＋添付failure4項目、既存L2b54round＋7/L2a14を回帰確認。
Production legacy / Worker ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false。
L2b-fixの完了範囲は論理参照とintent。L3/L4/L5/B1-6には進まない。以下は各工程当時の履歴。

## L1 Cross-tab Authority Contract & Repository Race Evidence（2026-10-12・現行）

[Cross-tab Authority Contract](CROSS_TAB_AUTHORITY_CONTRACT.md)を確定。製品コード・保存方式・versionは不変更（Port1.22.8 / Studio0.26.2）。
実Chrome 155の別renderer 2タブで実`PortDatasetRepository`を競合させ、legacyでlost update 2件・delete intent消失2件を実測。
dormant Authorityのsuspend/fence/Account binding変更は27ラウンドで違反未観測（下限値、保証ではない）。
他tabのWAL pendingが`recovery-required`として一時観測される可用性欠陥も記録した。
negative characterization driverは通常CI外、oracle/acceptance gating 5件だけを通常CIへ追加。
新Authorityの正本はIndexedDB（records/manifests/head/control/journal/oplog/roots）、線形化点は1 readwrite transactionのcomplete。
legacy本番は現状維持でリスク明記。Account協調・Pro margin・DB major分離・sentinel・GC・Sync導出を契約化した。
B1-6再開とshared write解禁は不可。次はL2a（Authority store、dormant）。

## Pro Final Commit Race限定修正（2026-10-12）

Port1.22.8 / Studio0.26.2。[Operation Commit Guard契約](OPERATION_COMMIT_GUARD.md)を参照。
OpusのTOCTOU/ABA/責務分散指摘に対し、既存Repositoryへ同期operation guardとprivate固定contextを追加。
元の再現8件は変更前2 PASS/6 FAIL→8 PASS。元のassertion/checkpointと以下の停止報告は保持する。
本番Port advanced save/preset create/advanced applyとdormant Facadeを同境界へ接続し、Standard対照を維持する。
追加148 matrix、native2-tabおよび実Port Pro UIの成功/拒否対照を確認する。
未通知server revokeとPro sourceのcross-tab可視化/完全同lock線形化は未保証。cloud backend再認可は維持。
B1-6は未完了。次はfresh server fenceと正式Account/control接続、operator/cleanup回収、old writer排除、
reconciliation/partition/rollback acceptanceの独立再監査。Studio shared write解禁不可。
Production Authority legacy / Worker ACCEPT_COMPAT / enforcement OFF / Host canWrite=false。
今回deploy/D1適用/cutoverなし。以下のv4停止報告を含む記述は当時の監査記録。

検証実測: Worker/Account760 PASS、Port/shared1801 PASS（baseline1645＋元Pro8＋追加matrix148）、
Other apps Sync85 PASS / 変更cache参照を含む全186 PASS、Studio314 PASS（commit前clean guardのみ除外）。
commit後はStudio全315件を除外なしで実行してからpushする。native workerd/D1/R2は8 PASS。
既存Asset2 / Generation4 / Local final-await6（最終await3＋初回3）すべてPASS。
Chrome: 新認可10、Port Standard18 routes＋4Themes、正式Pro26項目、runtime safety10、Migration18、
Studio Host10＋Metronome/Editing Session76 PASS。console/page error/404なし、意図しないSync/network writeなし。
Shared Pro helperの変更に伴い全readerのcache keyを更新。他アプリdomain/versionは不変更。


2026-10-12。**Phase Aで新しいPro認可競合を再現し、指定の停止条件に従って停止。B1-6未完了、commit / pushなし。**
既存3修正を作り直さず、dormant Studio Facadeと修正済みactive Port Repositoryの接続を監査した。
製品コードは変更していない。以下の過去報告は原文を保持する。

## 開始時Gitとbaseline（最終報告1、3–5、34–38）

開始HEAD / origin/main / remote mainはすべて`c417a9e1806756af5dec9a3362ae16c7bf2683d9`。
main、tracked clean、staged空。remote実値も読み取り確認した。
既存untrackedは`.claude/`、`workers/sound-cruise-sync/node_modules/`のみで、変更・stageしない。
禁止された旧repo / migration bundleは使用していない。

| 今回の実測 | 結果 |
|---|---:|
| Worker / Account | 760 PASS |
| Port / shared（全階層test.js / test.mjs） | 1645 PASS |
| Other apps（従来Sync範囲） | 85 PASS |
| Studio（差分追加前、Git clean guardを含む） | 315 PASS |
| 隔離workerd / D1 / R2 | 8 PASS |
| 元Asset race | 2 PASS |
| 元server Generation race | 4 PASS |
| 元Local final-commit race | 再現3＋対照3＝6 PASS |
| 新規Pro final-commit接続テスト | **対照2 PASS / 再現6 FAIL** |

既存3競合はbaseline内に加えて、合計12件を単独再確認してPASS。
workerdは既存transaction fence1、Asset lifecycle3、generation race4をローカル実行した。
新規Pro再現追加後の全suite再実行・ブラウザー実行は、停止条件により行っていない。

## 再現した重大問題（2、14–16、60）

ファイル: `apps/cruise-port/tests/authority-pro-final-commit-race.test.mjs`。

```sh
node --test apps/cruise-port/tests/authority-pro-final-commit-race.test.mjs
```

既存Migration Engineで隔離Account-bound Authorityをstage / seal / publishし、active Repositoryを取得。
既存`createPortMetronomeFacade`のfixtureExecutorへそのRepositoryを接続する。
認可は既存`createProOperationResolver`を使い、検証client / clock / 資格状態だけを隔離fixtureへ置き換える。
本番network、実資格、実ユーザーデータは使用しない。

順序:

1. Pro有効時にadvanced saveまたはpreset createを開始する。
2. operational Pro resolverが成功し、operationへgeneration / credential identity / validUntilを固定する。
3. callerの非同期assertCurrentとAuthority journal検証を通過する。
4. 同じdataset lockを競合holderが取得し、保存の最終exclusive lockを待たせる。
5. lease期限切れ、既知の失効、またはPro generation変更を確定する。
6. lockを解放すると、変更済み資格でもlocal commitが成立する。
7. Facadeの保存後検証は失効を検出するが、既に保存済みなのでlocal-saved / sync-unconfirmed / publish=falseを返す。

| 操作 | lock待機中の変化 | 期待 | 実測 |
|---|---|---|---|
| advanced save | 期限切れ / 既知の失効 / generation変更 | 拒否、dataset不変 | 3件とも保存成立 |
| preset create | 同上 | 拒否、dataset不変 | 3件とも保存成立 |
| 両操作の対照 | 資格変更なし | 保存成功 | 2件ともPASS |

失敗6件の共通結果は`ok=true`、dataset revision変更、localStatus=local-saved、syncStatus=sync-unconfirmed。
新しいAPIを作って迂回したテストではなく、既存Facade・Pro resolver・active Repositoryの組合せで再現した。
FIFO lock fixtureへ競合holderを挿入し、同じlockのgrant順で境界を固定したNode検証。
実ChromeのNative Web Locks / 実Proサーバーとの通信を検証したとの主張はしない。

## 原因と影響範囲

- `metronome-facade.mjs:40–44`は、操作のPro検証をRepositoryのasync `assertCurrent`として渡す。
- 修正済みAuthority Repositoryではasync prepareをlock外で完了し、その後に最終exclusive lockを取得する
  （`port-dataset-repository.js:192–195`）。これは前回の正しいAuthority線形化契約であり、元へ戻さない。
- 同期commitではAuthority Providerのsuspension / ticket / Account / generation / control / journal / CASを確認する。
  しかしFacade操作のPro proof / expiry / known revocation / credential generationはその同期guardへ渡されていない。
- Facadeの保存後検証（46–47行）は保存事実を正しく返しているが、commit前の認可漏れを防ぐ役割にはならない。

問題は「修正済みLocal Authority guard」と「Pro-only操作認可」の未接続境界。
元のsuspend / fence / Account final-await race、Asset race、server Generation raceの再発とは区別する。
advanced設定のlocal保存とpreset作成を実証した。cloud publish、Worker側Pro admission回避、Account混入、binary削除は実証していない。
production Studio UIはfixtureExecutorを渡さずread-onlyのままで、本番でのPro制限解除を確認したとの主張もしない。
このまま隔離製品統合を完成扱いすると「Pro資格有効時のみ保存」の要件を満たせないため、重大競合として停止する。

## 横断監査・Source接続の到達点（2、6–25）

| 接続点 | 今回の確認と残工程 |
|---|---|
| Account Source | 正式Account storageのgetAccount / getGeneration / subscribeAccount、Port runtime activationを調査。新しいSource bridgeは未実装 |
| membership Source | 認証済みWorker evidenceのmembership ID / generationが必要。表示用runtime statusを認可として採用していない |
| Authority Source / Fresh evidence | Local Providerの同期identity/control guardとWorker ledger証拠を確認。remote証拠からlocal controlへの接続は未実装 |
| Cached status分離 | 通常Hostの表示cacheをwrite権限へ変更していない。テストも既存operational Pro resolverを経由 |
| Port / Studio Host | 同じPort-owned Repositoryとdormant Facadeを隔離テスト内で接続した段階で上記問題を発見。製品SourceやUIへの新接続なし |
| Read-only副作用 | 製品起動経路は不変更。今回の新規browser副作用測定は未実施 |
| Standard / Pro / readiness | 既存操作別policyを調査。Pro-only操作の最終mutation認可にBlocker。Standard動作を変更していない |
| Operation context | async boundaryにはPro proofが固定されるが、Authorityの同期最終guardに含まれない。全Source接続は未完成 |
| Migration / Fence / Cutover recovery | 既存回帰を確認。v4でのfresh evidence→final reconciliation→pointerの新規結合実証は未実施 |
| Operator / recovery | 既存はcode-branded隔離capability、production routeなし。管理方式調査・隔離operator flowの完成には未到達 |
| Asset lifecycle / orphan | 既存Nodeとworkerd回帰PASS。永久tombstone・不明時保持を変更せず、追加orphan回収は未実装 |
| Account binding / Sync Runtime / full snapshot | 既存ownership・15 key / 18 type・lock順・full snapshotを不変更。新しいqueue/publish接続は未実装 |

指定契約すべての精読・更新と残る製品統合は停止により未完了。
Studio独自dataset / outbox、Metronome専用runtime、partial Sync送信は追加していない。
既存基盤を再設計した変更もない。

## Browser・実機（26–33、39–40）

Port/Studio実UI two-tab統合、settings / preset / delete-edit競合、offline/reconnect、Account切替、
Pro expiry、external Sync、dirty/base/playback保護の新規ブラウザー検証は未実施。
今回のPro競合はNodeで再現したものとして区別する。
Port desktop/mobileとStudioの既存browser suiteも今回未実行。console / application404 / unexpected mutationは未測定。
前回のbrowser実績を今回の結果として流用しない。

Safari/macOS、iPhone Safari、iPhone PWA、BFCache、sleep/wake、storage partition、offline/reconnectは
本番Acceptance Gateの未確認項目。Chrome viewport変更による代用はしない。

## Production・version・Git（41–56）

本番Worker deploy / D1 migration / cutover / active pointer公開 / epoch・minimum変更 / 旧writer拒否は実施なし。
既存Portユーザーデータの移行・削除も行っていない。
製品コード・設定は不変更で、legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF /
PortDataHost.canWrite=falseを維持する。live production状態を再監査したとの主張はしない。
Port1.22.7 / Studio0.26.1 / Studio schemaVersion1を据え置く。

差分は本報告と新規Pro再現テストのみ。過去報告を原文保持し、他の指定文書更新は未実施。
未stageのまま保持し、commit / pushなし。新hash・commit files・push結果は該当なし。
予定message「PortとStudioのAuthority統合基盤を整備」は未使用。
終了時のdiff --check、HEAD / origin / remote一致、ahead/behind、staged空は最終応答で実測報告する。
既存untracked2ディレクトリは変更・stageしない。

## 判定・次工程（57–62）

- B1-6隔離統合は未完了。B1全体は未解消。shared writeは解禁不可。
- BlockerはPro-only操作の認可が最終Authority commitへ接続されていないこと。
- 次は固定operationのPro proof / expiry / known revocation / generationを、awaitを挟まない最終commit guardへ
  接続する限定修正。cached statusのbooleanや保存後rollbackで代用しない。
- 同期guardへ渡す正式Sourceと無効化の線形化を定義し、既存Authority lock / suspension / CASを維持する。
  commit後に失効した場合のlocal-savedという正しい履歴報告とは区別する。
- 本8ケースに加えStandard操作、advanced preset apply、dispose、Account/membership変更、実lock待機、
  cloud側Pro admissionを回帰してからv4のSource / Host / operator統合へ戻る。
- モデル適性: 横断接続監査にはAstra / 中が妥当。限定修正はSol / 高が候補。
  正式Source・同期失効・cross-context認可の設計が広がる場合はAstra / 中を優先する。

---

# Local Authority Final Commit Race — 限定修正完了

2026-10-12。B1-6全体の製品統合へは戻らず、Local Authority保存確定の競合だけを修正した。
既存の再現テストと停止報告を保持。本節の下に停止報告原文をそのまま残す。
commit/push hash・最終Git状態は作業完了報告で実測提示する。

## 開始・再現・根本原因

開始HEAD / origin/main / remote main: `aa24087db85303af55bae82f13097ba5bb5fbc17`。
main、ahead/behind0/0、staged空。既存未commitは本停止報告とauthority-final-await-race.test.mjs。
既存untracked .claude/ と workers/sound-cruise-sync/node_modules/は不触・stage対象外。

元6ケースは、修正前 **対照3 PASS / 再現3 FAIL**、修正後 **6 PASS**。
初期/最終検証でsuspendWrites、ticket revoke、Account A→Bを確定させる。元assertionは変更していない。
根本原因は、最後のcaller await後にreadability/revisionだけを確認してWALへ進み、
停止/journal/fence/Account sourceがdataset lockに参加せず、旧検証結果を使っていたこと。

実装はRepository・dormant Migration Engine・write controlの3ファイル。
残りの実コード差分はPort1.22.7のversion/cache graph同期。sharedの変更はtest importer URLだけ。
Studio / Worker / 他アプリ実コード・D1 schema・backend policyは変更しない。

## 実効境界と失敗意味

正式契約: [PORT_LOCAL_AUTHORITY](PORT_LOCAL_AUTHORITY.md)、[Repository](PORT_DATASET_REPOSITORY.md)、
[Migration Engine](PORT_AUTHORITY_MIGRATION.md)、[Readiness](PORT_WRITE_READINESS.md)。

| 論点 | 修正・実証 |
|---|---|
| 線形化 | save=同dataset lock内のfinal metadata setItem成功。状態変更=同lock内のshared control publication |
| Lock | Authorityだけasync準備をlock外へ分離、final callbackは同期。既存activation→Sync→dataset順を維持 |
| State change | suspend/resume・ticket revoke・協調identity変更が既存dataset lock/共有epochへ参加 |
| Suspension | 停止完了が先ならpending保存拒否。停止→resumeでも古いcontextを復活させない |
| Fence | realm-local WeakMap＋shared durable fenceRevoked/epoch。revoke Promise完了をcross-context失効確定とする |
| Account | 同期readIdentityで固定Account/membership IDと別々のgenerationを照合。A→B/A→B→Aでretagしない |
| Authority/pointer | generation/migrationId/active pointer/namespace/sealed marker一致。旧prepared handleはread-only |
| Journal | hash検証済みrawを最後の同期guardで再照合。unknown/control欠落/recovery stateは拒否 |
| CAS/full data | full base/revision/key revision/forward/unknown fields/delete intent維持。全inventoryを検証しdraft freeze |
| WAL | partial failureは元rawへrollback。rollback失敗ならpending WAL/recovery-requiredを保持 |
| Async gaps | 初回/最終caller validation、writer、最後のjournal/hash awaitを故障注入。CAS読取後のsource変化も拒否 |
| Post-commit | 保存事実を取り消さず、固定old context＋publish=falseを返す。新Accountへ送信しない |
| Response loss | 元base/context/operationIdのretryをCAS/失効で拒否。data/revision保持、二重commitなし |
| Draft | authority拒否でprivate draftを保持、永続dataを置換・破壊しない。勝手なoperationId更新なし |
| Two contexts | shared storage/epochでsave/save、save/stop/revoke/Account切替を検証。storage event cacheは不要 |
| Old build | 通常legacy writerはnamespace分離。新Authorityの協調writerが対象で、本番旧writer排除全体は未解消 |

async readinessのbooleanだけで最終保存を許可しない。bound ownerにgeneration不明ならwrite不可。
local-onlyはAccount/membership不要。readIdentity/setIdentityは同期sourceとして明示注入し、
別realmのAccount source変更はshared controlへの協調更新を要求する。
server revoke/fresh evidenceを自動検知するbridgeは未接続で、B1-6残gate。
RepositoryはCAS APIであり、optional operationIdのみで新baseを採用する新dedupe APIではない。
response lossから新Account/新baseへ旧操作を自動rebaseしない。

## 検証結果

| suite | 今回実測 |
|---|---:|
| 修正前baseline Worker / Port・shared / Other Sync | 760 / 1588 / 85 PASS |
| Studio作業中baseline | 314 PASS。clean guardはcommit後の315全件で確認 |
| 元Local race | 修正前3 PASS / 3 FAIL → 修正後6 PASS |
| 新規Node競合/失敗/CAS/WAL | 51 PASS |
| Port/shared全階層 | 1645 PASS（1588＋元6＋追加51） |
| Worker/Account | 760 PASS |
| Other apps従来Sync範囲 | 85 PASS |
| Studio作業中 | 314 PASS、commit後Git clean込み315全件を別途確認 |
| workerd/D1/R2 | 8 PASS |
| 元Asset Cleanup race | 2 PASS（単独再確認も実施） |
| 元server Generation race | 4 PASS（単独再確認も実施） |
| 新native Chrome race | 12 PASS。二tab6競合＋reload後失効5＋native lock grant順1 |
| Port desktop/mobile | 18経路＋readiness26ケースPASS |
| Port migration/native Storage/IDB | 18項目PASS |
| Studio read-only Host | 10ケースPASS、canWrite=false、API副作用0 |
| Studio Metronome M1/M2＋Structure Editing Session | 76 PASS（M1/M2 53＋Editing Session23、Pre-DTMも既存ケースで確認） |
| Console/404/unhandled | 0。migration suiteの外部stylesheet1 requestはstub応答、意図しないnetwork mutationなし |

ブラウザーは隔離Chrome profile、loopback fixtureだけ。Web Locks・shared localStorage・native IDBを使用する。
保存開始時刻/Promise resolve順ではなく、実lock grant順とcontrol epochで確定順序を検証した。
Safari/PWA実機、OS sleep/wake、BFCache、別partition、Port/Studio本格同時UI統合は今回の完了範囲に含めない。

## Production・Version・次工程

Port **1.22.7**（内部安全patch＋必要なcache graph/test reference更新）。Studio **0.26.1 / schema1**維持。
通常Portはlegacyで起動し、migration/controlを自動生成しない。通常Studioはread-only Hostのまま。
本番Worker deploy / D1適用 / cutover / active pointer公開は実施なし。
production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=false**。
新stage/commit/pushは指定対象の個別stage・限定commit・通常pushのみ、禁止Git操作は使用しない。

限定Local Final Commit Raceは解消。**B1-6未完了 / B1全体未解消 / shared write解禁不可**。
次はB1-6安全監査と正式Source/fresh evidence/operation contextの製品接続。
残Blocker: remote evidence→local control bridge、operator/authorized recovery、旧controlの扱い、
local legacy writer停止、Account/AppDevice/Proを含むqueue/publish境界、reconciliation UX、
Port/Studio同時UI、実機/partition、cleanup crash回収・fence対応rollback/deploy acceptance gate。
今回の適性はAstra・中（排他設計・複数状態・長い制約の判断）。cache同期は機械作業として軽量モデル適性。
実際のモデル設定を変更したという意味ではない。

---

以下はB1-6 v3停止報告の原文（本修正前の履歴）。

# B1-6 Authority Integration v3 — Local Authority最終await競合による停止

2026-10-12。**Phase Aで新たな重大なAuthority write fence競合を再現し、停止。B1-6未完了、commit / pushなし。**
依頼の「新重大競合を再現した場合は再現テストを作成して停止」に従う。
製品コードは変更しない。これまでの修正・停止報告は本節より下に原文のまま保持する。

## 開始状態・修正済み競合の回帰（報告項目1、3–4、32–36）

開始HEAD / origin/main / remote mainはすべて`aa24087db85303af55bae82f13097ba5bb5fbc17`。
main、tracked clean、staged空。既存untrackedは`.claude/`と`workers/sound-cruise-sync/node_modules/`のみ。
remote実値を読み取り確認してから監査を開始した。禁止された旧repo / migration bundleは使用していない。

| 今回実測したbaseline | 結果 |
|---|---:|
| Worker / Account | 760 PASS |
| Port / shared（全階層test.js / test.mjs） | 1588 PASS |
| Other apps（従来Sync範囲） | 85 PASS |
| Studio（作業差分追加前、Git clean guard込み） | 315 PASS |
| 隔離workerd / D1 / R2 | 8 PASS |
| 元Asset race | 2 PASS。Worker全件内と単独再確認 |
| 元Generation race | 4 PASS。Worker全件内と単独再確認 |
| 新規Local Authority最終await競合 | **3 PASS / 3 FAIL** |

workerdは既存のtransaction fence1、Asset lifecycle3、generation race4をローカル実行した。
新規6ケースのうち、初回検証中の無効化は3件とも拒否されるが、最終検証中では3件とも保存が成立する。
元のAsset / server Generation raceの再発ではない。

## 再現・原因・影響範囲（2、10–16、21、58）

再現テスト: `apps/cruise-port/tests/authority-final-await-race.test.mjs`。

```sh
node --test apps/cruise-port/tests/authority-final-await-race.test.mjs
```

既存Migration EngineでAccount Aにboundしたfull datasetをstage / seal / publishし、active Repositoryを取得する。
同じfixture lock managerを使用し、保存はAuthority datasetのexclusive lock内で実行する。
private draftにBPM166を設定し、commit直前の2回目の`assertCurrent()`でawaitを止める。
別の制御処理として次のいずれかを完了させてから、awaitを再開する。

| 完了した無効化 | 期待 | 実測 |
|---|---|---|
| `await engine.suspendWrites()`、journal.writeDisabled=true | pending保存を拒否、元dataset保持 | ok=true / committed、dataset変更 |
| `revokeIsolatedFence(fence)` | 失効ticketのpending保存を拒否 | 同上 |
| Account identity A→B | Aの古い操作のcommitを拒否 | 同上（Aのnamespaceが更新される） |

同じ無効化を1回目の検証中に行う対照ケースはすべて拒否される。
この違いにより、単にgateが実装されていない問題ではなく、最終await後の検証漏れと特定できる。

原因:

1. `port-authority-migration.mjs:261`のactive Repository wrapperは
   `await current(j) → writable() → await options.assertCurrent()`の順で検証する。
2. 最後のcaller検証を待つ間、migration journalのwriteDisabled、fence ticket、Account identityが変更できる。
3. `port-dataset-repository.js:138`のawait終了後は、schema・raw値・revisionを比較してWAL / data / metadataを書き込む。
4. この直前の`inspect()`はreadabilityを確認するだけで、writeDisabled / ticket失効 / Account bindingを再確認しない。
5. `suspendWrites()`のmigration lockと保存のAuthority dataset lockは別であり、停止完了がpending保存を直列化しない。

影響は隔離active Authority Repositoryを利用するlocal mutationの認可境界。
この状態でdormant Facadeを接続すると、RepositoryのCASが成功しても「現在write可能」を保証できない。
旧Accountのnamespaceへのstale commitを実証したが、Account Bのdatasetへの混入・cloud送信・lost update・本番事故を実証したわけではない。
WorkerのD1 guard、R2 cleanup契約、通常Studio UIのread-only gateを迂回したとの主張もしない。
本番migration / active Repositoryは接続しておらず、今回も接続していない。

再現はmemory storageと既存FIFO lock fixtureでの決定的な非同期境界検証であり、native Chrome Web Locks実測ではない。
callerのassertCurrentには検証遅延だけを注入し、その外側から停止・失効・Account変更を実行した。
依頼が要求する保存停止・Account bindingの最終認可に関わるため、小さな表示や契約文言の不整合として処理しない。

## 横断監査の到達点（2、5–23）

| 接続点 | 今回の確認と未完了範囲 |
|---|---|
| Account / membership generation | 0037のserver取得・ledger固定・D1内比較・stale read拒否を確認。旧4件PASS。local final awaitは上記Blocker |
| local Authority generation | pointer / journal / namespaceの固定とactive handle guardを確認。最終write認可に未保護区間あり |
| writerProtocol / syncProtocol / writeEpoch | server既存guardの回帰PASS。Facadeの新Authority operation context結合は未実装 |
| Repository revision | 同lockでbase / key revision / 最終raw比較。ただしrevision一致はwrite資格の有効性を証明しない |
| Migration Journal | hash検証・migration lock・suspendWritesの永続化を確認。停止完了後にpending saveが通ることを再現 |
| Cloud checkpoint / Cutover ledger | 既存B1-5と0037の固定・retry / recoveryを確認。v3のfresh evidence→pointer結合は未実装 |
| Asset cleanup claim | 0036排他・immutable identity / retryを変更せず、既存Node / workerd回帰PASS |
| Operator authorization | 現在はcode-branded隔離capability、production routeなし。v3の正式な隔離operator flowは未実装 |
| Sync Execution Lock | 既存Account+app排他とdataset lock順の契約・runtime接続点を調査。新Authority runtime接続は未実装 |
| Studio PortDataHost | read-only / dormant Facade / operation boundaryを調査。通常Host canWrite=falseを維持、新Authority未接続 |

指定契約の全件精読・統合設計・Phase B以降の実装は停止により未完了。
既存のallWritersCompatible fixtureを製品認可へ昇格していない。Pro資格を表示用cacheへ置き換えていない。
Standard / Pro別操作readinessの新接続、membershipを含むoperation contextの完成、full snapshot/runtime結合は未実証。
Studio独自dataset / outbox、Metronome専用runtime、partial snapshot送信は追加していない。
遅延uploadの未公開orphan追加回収も未実装。前回の永久tombstone・結果不明時の保持を維持する。

## 同時動作・ブラウザー・実機（24–31、37–38）

Phase FのPort/Studio同一origin・partitionによるtwo-tab検証は未実装・未実行。
settings / presets / delete-edit / offline-reconnect / Account switch / Pro失効 / external Syncの統合成功を主張しない。
Port desktop/mobileとStudioの既存browser suiteも今回未実行。console / app404 / unexpected network mutationは未測定。
前回のbrowser結果を今回の実測として流用しない。

Safari/macOS、iPhone Safari、PWA、BFCache、sleep/wake、storage partitionは本番acceptanceの未確認項目として残す。
Chrome viewportで実機確認を代用しない。新規重大競合の解消とChrome統合が完了しても、別途実機gateが必要。

## Production・version・Git（39–54）

製品コード・version・schema・設定は変更なし。Port1.22.6 / Studio0.26.1 / Studio schemaVersion1を維持。
本番Worker deploy、D1 migration、cutover、active pointer公開、epoch/minimum更新、旧writer拒否は実施なし。
ACCEPT_COMPAT / legacy / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=falseを変更していない。
live production状態を再監査したとの主張はしない。

差分は本報告と新規再現テストのみ。既存履歴・旧再現を保持。その他の指定文書更新は停止により未実施。
各ファイルは未stageで保持し、commit / pushを行わない。新commit hash / commit files / push結果は該当なし。
予定message「PortとStudioのAuthority統合基盤を整備」は未使用。
終了時のHEAD / origin/main / remote main一致、ahead/behind、staged空、diff --checkは最終応答で実測報告する。
既存untracked2ディレクトリは未変更・未stage。

## 完了判定・次工程（55–60）

- B1-6隔離統合: 未完了。B1全体: 未解消。shared write: 解禁不可。
- Blocker: Local Authorityの停止・ticket失効・Account変更が、最終await中の保存を止められない。
- 次Phase: 最終mutationと同じ実効境界へwrite gate / Account bindingを結び付ける限定修正を先行する。
  asyncの取得・検証と、awaitを挟まない最終commit guardを区別し、suspend / revokeとの順序を定義する。
- caller検証の順番を変えるだけでは、他のawait境界も含む保証の再確認が必要。
  dataset CASを維持し、停止完了後のpending commitを拒否するか、既にcommit済みだった事実と停止の順序を明示する。
- 修正後は本6ケース、Account/membership/Pro/dispose、native lock / two-tab、全baselineを確認してからv3統合を再開する。
- モデル適性: 横断監査はAstra / 中が妥当。限定修正はSol / 高を候補とし、非同期認可とlock順の設計が広がる場合はAstra / 中を優先。

---

# Migration / Cutover Generation Race — 限定修正完了

2026-10-12。B1-6全体の製品統合へは戻らず、世代競合だけを修正した。
既存の再現4件と停止報告を削除・改変せず保持する。停止報告原文は本節の下部。
commit/pushの実値は作業完了報告で別途提示する。

## 原因・契約・経路監査

[Worker正式契約](../../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)と
[Migration Engine接続境界](PORT_AUTHORITY_MIGRATION.md)を参照。

| 論点 | 修正・実証 |
|---|---|
| 根本原因 | ledgerにserver Account/membership generationがなく、active stateとIDだけを検証していた |
| Account / membership | server rowから別々に取得。client申告generationを無視し、安全な正整数へ限定 |
| ledger | migrationId/local generation/Account/app/membership/user/各phase operation/epoch/checkpointに両generationを固定 |
| prepared→paused | 開始preparedで固定した値を再利用。paused時に現世代へbindし直さない |
| paused→enforced | ledger trigger・membership publication trigger・終端assertionを同D1 batchで実行 |
| stale | transition全体をrollback、paused/base epoch/minimum維持、fresh evidence禁止 |
| retry / idempotency | 同migration/opでもcurrent世代をtransaction内で照合し、旧成功を再認可しない |
| response loss | unchanged世代ならcommit結果を回収、世代変更後なら履歴を保持してfresh成功を拒否。epoch二重更新なし |
| recovery | scoped capabilityで過去row＋authorizationFresh=false/recoveryRequired=trueを取得。barrier解除/retag/降格なし |
| evidence/read | current serverと固定ledgerを同SELECTで照合、Account/member generations・barrierIdをfenceへ結合 |
| 通常mutation | 共通evaluatorのpreflightとmutation batchで世代比較。AppDevice/Pro失効・CAS/dedupeは維持 |
| error | code=dataset_authority_unavailable (503)、internal reason=migration_generation_stale。公開readは既存codeで非network-retry停止 |
| B1-4 Engine | 隔離checkpoint/evidence拒否がrecovery-requiredへ伝播。旧journal/fence/source保持、pointer未公開 |
| revoke / recreate | Account/member revoke、同ID世代増分、member ID再作成を拒否。IDが同じだけでは継続認可しない |
| isolation | foreign Account capability/migration/opを拒否、同世代2deviceの通常CAS成功、他アプリguard対象外 |
| Asset Cleanup | claim/object identity・各generation/epoch・R2 reservation/tombstone契約を保持。元競合2件PASS |
| additive0037 | 新column2とguardsのみ。既存record/member/asset損失なし。旧ledger NULLをbackfillせずfail-closed |

fresh read後でも将来のmutationは世代を再検証する。D1 batchは一transactionとして直列化される。
batch内generation更新のSQLite故障注入は自transaction rollbackの検証であり、外部transactionの
途中interleaveを主張しない。response-loss後の過去commitと現在の認可を分離する。

## 開始時と最終検証

開始HEAD=origin/main=remote main: `13e7d642fc4da0cdaeb02f801f24e0abdeb63f84`。
main / ahead0 behind0 / staged空。既存未commitは本停止報告とgeneration再現テストだけ。
既存untracked `.claude/` / `workers/sound-cruise-sync/node_modules/`は変更・stageしない。

| 検証 | 結果 |
|---|---:|
| 元のgeneration再現4件 | 変更前4 FAIL → 修正後4 PASS。元assertion保持 |
| 追加generation/普通mutation/engine/isolation | 26 PASS |
| 追加additive0037 migration | 3 PASS |
| Worker / Account全回帰 | 760 PASS（baseline727＋再現4＋追加26＋migration3） |
| Port / shared全階層 | 1588 PASS |
| Other apps従来Sync範囲 | 85 PASS |
| Other apps全範囲 | 186 PASS |
| Studio | 作業中314 PASS。tracked clean guardを含む315件はcommit後確認 |
| native workerd / D1 / R2 | 8 PASS（既存4＋generation race4） |
| 元Asset Cleanup race | 2 PASS（Worker総数内、単独再確認もPASS） |
| Chrome Port desktop/mobile | 18経路＋readiness26ケースPASS、Account/Sync・Pro・Gear・My Apps・Practice |
| Chrome Studio Read-only Host | 10ケースPASS、canWrite=false、API副作用なし |
| Chrome Studio Metronome M1/M2 | 53 PASS、独立Audio/Settings/保存/conflict/lifecycle |
| Browser console / 404 / unhandled | 0 |
| ローカルWrangler migration | 一時DBへ37件適用成功、再実行No migrations to apply |

SQLiteは既存データ入り0036から0037へ適用して保存内容を比較。
旧paused ledgerは新column NULLのまま、read/update/retag拒否とepoch維持を確認。
再実行安全性は公式Wrangler migration ledgerを使う。生ALTER SQLの重複実行はしない。
workerd世代競合4件は実D1でprepared→paused後とenforce batch直前のAccount/member世代変更を検証する。
production operator用のHTTP routeは追加していない。

## 公開境界・残Blocker・次工程

Port **1.22.6** / Studio **0.26.1 / schema1**。Worker中心のため両アプリ実コード/版は据え置き。
本番deploy / D1適用 / cutover / enforcement変更 / shared write解禁は実施していない。
production **ACCEPT_COMPAT / legacy / enforcement OFF**、Studio **shared write OFF / PortDataHost.canWrite=false**。

限定generation raceは解消し、B1-6安全監査・統合作業の再開に進める。
**B1-6未完了 / B1全体未解消 / shared write解禁不可**。
残Blockerはfresh evidenceの製品接続、operator認可と旧ledgerのauthorized recovery、
Account切替とPort/Studio同時browser、local legacy writer停止、reconciliation UX、
実partition・cleanup claim crash回収・fence対応rollback/deployのacceptance gate。
static isolated ticketはremote revokeを自動検知しない。isolated checkpoint拒否の検証を製品統合完了と扱わない。

今回の実装選択は既知原因と限定境界の高リスク修正であり、モデル適性はSol・高を基本候補とする。
独立B1-6統合監査はAstra・中を第一候補とし、複数仮説の深い検証が必要な場合のみ高へ上げる。
この適性評価はタスクの性質による判断であり、実際のモデル設定を変更したという意味ではない。

---

以下はB1-6停止報告の原文（今回の修正前の履歴）。

# B1-6 Authority Integration v2 — 世代検証不整合による停止

2026-10-12。**B1-6 v2未完了、製品実装・commit・pushなし。**
依頼の停止条件「migration/fence不整合」に該当する既存cutoverの不整合を、隔離SQLiteで再現した。
以下に今回の実測を記録する。Asset race修正結果と、それ以前の停止報告は下部に原文を保持する。

## 開始状態・baseline（報告項目1–2、30、32、34–38）

- HEAD / origin/main / remote main: `13e7d642fc4da0cdaeb02f801f24e0abdeb63f84`。
- main、tracked clean、staged空、ahead/behind 0/0。開始時にremote実値も確認した。
- 既存untracked: `.claude/`、`workers/sound-cruise-sync/node_modules/`。変更・stage対象外。
- Port1.22.6、Studio0.26.1、Studio schemaVersion1。

| suite | 今回のbaseline実測 |
|---|---:|
| Worker / Account | 727 PASS |
| Port / shared（全階層のtest.js / test.mjs） | 1588 PASS |
| Other apps（前回と同じSync対象） | 85 PASS |
| Other apps（全階層へ拡張した実行） | 186 PASS |
| Studio | 315 PASS（作業差分追加前、Git cleanチェックを含む） |
| workerd / D1 / R2 | 4 PASS（既存transaction fence1、Asset lifecycle3） |
| 元のAsset Cleanup race | Worker727内で2 PASS。追加の単独再確認も2 PASS |
| 新規cutover generation再現 | **4 FAIL** |

Port/sharedの最初のglob実行は1552件だったため、全階層のtest.jsも含めて1588件を実行し直した。
Other appsも最初のトップ階層のみの実行とは分け、前回と同じ85件と全階層186件を確認した。
workerdはsandbox内の起動制約のため、ローカル実行権限で再実行して4件通過。本番へは接続していない。
これらのbaseline成功を、新規の世代変更競合が安全である証拠とは扱わない。

## 再現した停止条件（8–12、17、63）

再現ファイル: `workers/sound-cruise-sync/test/authority-cutover-generation-race.test.js`。

```sh
node --test workers/sound-cruise-sync/test/authority-cutover-generation-race.test.js
```

1. Account generation=1、membership generation=1の隔離データで、既存controllerによりprepared→pausedへ進める。
2. 同じAccount IDを維持し、Accountまたはmembershipのgenerationだけを2へ変更する。
3. 旧migrationId / local Authority generation / operationIdでenforcedへ進める。
4. 現実には拒否されず、ledgerはenforced、writeEpochは2になる。
5. `readAuthorityEvidence`もenforced / transactionalAdmission=trueの証拠を返す。

Account / membershipそれぞれについて、paused直後とenforce用D1 batch実行直前の2境界を検証し、計4件とも同じ失敗を確認した。

```json
{"rejected":false,"phase":"enforced","writeEpoch":2,"exposesEnforcedEvidence":true}
```

期待する安全条件は、旧世代のcutoverを拒否し、paused barrierと元のepoch=1を保持すること。
テストは既存migrations0001–0036と本体controller / evidence readerを使う。
世代更新は障害注入として直接SQLで行う。Account recovery / app detach等にも実在する世代無効化を分離して検証しており、
それらの認証済みHTTP操作全体を再現したとの主張はしない。cross-accountデータ漏洩や本番での発生を実証したものでもない。

原因となる境界:

- `0035_add_transaction_fence.sql`のcutover ledgerにはAccount / membership generationの固定値がない。
- `authority-cutover.js`のpreparedはmembership ID / sync user / base epochを固定するが、両generationを固定しない。
- paused / enforcedのbatchは現在のactive状態を条件にするだけで、開始時generationとの一致を条件にしない。
- `readAuthorityEvidence`はmembership / ledger identity、phase、epochを照合するが、開始時generationを比較できない。
- 現状のoperationIdによる再送成功・recoverについても、修正時には同じ世代契約を適用する必要がある。

通常Account APIにはcutover routeがなく、code-branded隔離capabilityでだけ再現した。
「既存operator routeの認証回避を発見した」とは扱わない。一方、このcontrollerをそのままHost統合の正当なfence証拠へ接続できない。

## 残工程と未検証範囲（3–7、13–16、18–29、31、33、39–41）

| 項目 | 今回の状態 |
|---|---|
| Integration architecture / Port・Studio Host / readiness | 既存read-only Host・dormant Facade・operation boundaryを調査。新Authorityへの接続は未実装 |
| Migration / fence / cutover / recovery | 上記不整合で停止。fresh checkpoint→final reconciliation→seal→pointerの結合実証なし |
| Operator authorization / API | 既存はcode capabilityのみ、production routeなし。正式operator認可・dry-run・auditの設計実装は未完了 |
| Asset lifecycle / cleanup | 前回修正を変更せず、元再現2件とworkerd/R2を再検証してPASS |
| Orphan追加回収 | 遅延uploadの未公開orphan追加回収は未実装。前回の保持契約を維持 |
| Account / Pro / Sync / full dataset / partial snapshot | 既存実装を不変更。B1-6 operation contextとHost/runtime結合の新規実証なし |
| Port + Studio simultaneous / settings・preset・delete競合 | 今回のtwo-tab統合fixtureは未実装・未実行 |
| Offline / Account switch / Pro失効 / External Sync | 既存baselineの範囲のみ。B1-6結合ケースの成功とは扱わない |
| Port Chrome / Studio Chrome / console / 404 | 停止により今回未実行。前回のブラウザー件数を今回の実測として流用しない |
| Safari/macOS・iPhone/iPad・PWA・partition・BFCache・background | 実機未確認。Chrome viewportとの同一視なし |

指定文書すべての精読・更新とPhase B–Gの実装は停止により未完了。
今回更新する文書はこの停止報告だけ。未実施の各Phaseを完了として記載しない。

## Production / version / Git（42–59）

製品コード・schema・設定・versionは変更なし。Port1.22.6 / Studio0.26.1 / Studio schema1を維持する。
Worker deploy / production D1 migration / production cutover / active pointer公開 / 実ユーザー移行はすべて実施なし。
productionのACCEPT_COMPAT / legacy / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=falseを変更していない。
live production設定を再監査したとの主張はしない。

未commit差分は、この文書と新規再現テストの2ファイルだけ。
stage・commit・pushは行わないため、新commit hash・commit files・push前検査は該当なし。
予定message「PortとStudioのAuthority統合基盤を整備」は未使用。
`git diff --check`を確認し、終了時のHEAD / origin / remote一致、ahead/behind、staged空を最終応答で報告する。
既存untracked2ディレクトリは変更しない。再現テストはFAILのまま未stageで保持する。

## 判定と次工程（60–65）

- B1-6隔離統合: 未完了。B1全体: 未解消。production shared write: 解禁不可。
- Blocker: 開始時Account / membership generationをcutover ledger・D1 transition・evidenceへ束縛する契約が未成立。
- 次Phase: この世代検証を先に修正し、新規4件をPASSにする。operator認可・identity・epoch・migrationIdとともに
  generationを固定し、同じD1 transactionで比較する。古いclaimのgenerationを現在値へ無条件retagしない。
- 事前SELECTだけの修正では、batch直前注入2件を解消できない。response-loss retry / restart / stale evidenceにも適用し、
  世代不一致を明示的な再認可・復旧へ送る。既存ledgerの移行方法を別途検討する。
- その修正の全回帰後に、B1-6 Phase AからHost・operator・migration/fence結合を再開する。
- モデル適性: 当初推奨Astra / 中は横断境界の調査に妥当。原因が明確になった限定修正はSol / 高が候補。
  停止理由は依頼に明記された安全条件違反であり、能力不足や時間切れではない。

---

# Asset Cleanup vs Reference Addition Race — 修正結果

2026-10-12。前回の停止報告は下部に原文を保持する。
**Asset raceの限定修正。B1-6の残りの製品統合には進んでいない。**
詳細な排他・復旧契約は[ASSET_LIFECYCLE](../../../workers/sound-cruise-sync/ASSET_LIFECYCLE.md)。

## 原因・修正・coverage（報告項目3–25）

元の再現2件は開始時FAILを確認し、元の競合順序を保持したままPASSへ変更。
参照公開はrecord INSERT/UPDATE trigger、削除予約は現在refs/identity/eligibilityを確認するD1 batchで調停する。
legacyでも新protocolでも「参照commitが先なら予約不可、予約が先なら参照commit不可」。
予約UUID・Account/membership generation・epoch・object key/version/hashを固定し、R2成功後のD1 finalizeまで保持する。
結果不明はrecovery-required、crashではdeletingも回収対象。TTL解除・無条件cancelなし。
同asset ID/keyの再利用は禁止し、再uploadは新ID/key。削除済み予約を永久保持して旧cleanupから新objectを分離する。

Gear / My Apps / Practice attachment / owner refs / migration push / tombstone復活に同じSQL guardが適用される。
prepare再送・upload・commitも予約を確認し、upload途中の予約はD1公開を止める。
unreferenceやremoval safetyだけでは削除資格にならない。既存Account/AppDevice/Pro/epoch/CAS/dedupeを緩和しない。
Port migration inventoryはcleanup証拠をmanifest/hashへ保存し、予約中・復旧待ちassetのstage/sealを拒否する。
本番のfresh evidence取得・Host接続は未実装。

## 開始状態（1–2）

HEAD / origin/main / remote main = `cdc112ad7985ade5857c9a57ff1960df984dc77c`。
main、tracked clean、staged空、ahead/behind0/0。
前回追加の再現テストと本停止報告は未commitのまま存在し、両方を保持して本修正に含める。
既存untracked `.claude/`、`workers/sound-cruise-sync/node_modules/`には変更しない。

## 検証（26–36）

| 検証 | 結果 |
|---|---:|
| Worker / Account | 727 PASS（既存672＋元再現2＋lifecycle53） |
| 元再現 | 2 PASS。R2 delete待機中のpushは409 / asset_reference_unavailable |
| Lifecycle / failure injection | 53 PASS。予約の前後、record transaction直前、D1/R2故障、response loss、crash前後、retry、世代変更、stale claim、recreate等 |
| 実workerd / D1 / R2 | 新規3 + 既存fence1 = 4 PASS |
| Port / shared | 1588 PASS（既存1583＋migration5） |
| Other apps | 85 PASS |
| Studio | 機能314 PASS。Git cleanを含む315全件はcommit後・push前に確認 |
| Port Chrome | 18 desktop/mobile routes、保存26（既存20＋画像・添付6）、runtime safety10、local authority26、writer12 requests、migration18、transaction fence10 |
| Studio Chrome | 97 + read-only Host10 PASS。M1/M2、Structure、Editing Session、Pre-DTM、4themes、printを既存suiteで確認 |
| console / app404 / unexpected Sync | 0。拒否を検証するHTTP fixtureの期待済み409/503は別扱い |

実workerdで実HTTP pushと待機中R2 deleteを競合させ、D1 triggerで拒否した。
さらに別名の2 Worker instanceが同じ隔離D1/R2で同時cleanupするケースも成功。
テスト用runtime control / AppDevice resolverとsynthetic Pro資格を使用。本番サービスへの接続はない。
ChromeでGear画像・My Appsアイコン・Practice添付の実表示、owner参照、reload後のbytesをdesktop/mobileで確認。
実Safari/iPhone PWAは今回の対象外・未検証。viewport変更をその実機検証とは呼ばない。

## Production・version・Git（37–51）

本番Worker deploy / D1 migration / cutoverは禁止のまま、実行なし。
ACCEPT_COMPAT / legacy / enforcement OFF / shared write OFF / PortDataHost.canWrite=falseを維持。
production bundleにfixture route / cutover controllerの混入なし、ESM bundle生成成功。
Portは内部migration safety修正のpatch **1.22.6**。64ファイルの既存version/cache差分は機械的一致を確認。
Studio **0.26.1 / schema1**維持。他アプリ本体・version変更なし。shared変更はPort importを持つ既存testのcache参照だけ。

変更文書: 本報告、Worker SYNC_WRITER_AUTHORITY / ASSET_LIFECYCLE、Port AUTHORITY_MIGRATION / LOCAL_AUTHORITY。
新0036はadditive。既存asset metadata・旧claimの非rewriteをテストした。本番適用はしていない。
`git diff --check`を確認し、承認済みの各ファイルだけを個別stageする。
commit messageは `Sync Asset cleanupと参照競合を修正`。
commit後はdirect child / staged空 / tracked clean / ahead1 behind0、push前にremote実値一致を確認する。
commit hash・対象file一覧・push前後Git実測は最終応答とcommit差分に記録する。

## 判定と次工程（52–58）

- Asset race: 隔離検証で解消。本番には未反映。
- B1-6: 残りの製品統合を再開可能だが、この作業では未実施。B1全体は未解消。
- Production shared write: 解禁不可。
- 旧B1-5 claimのidentity不足、世代不一致claimは自動解除せず保持する。別途operator復旧判断が必要。
- 遅い旧uploadのbytesは未公開orphanとして残り得る。永久tombstoneを解除せず、追加の掃除方針は別工程。
- 本番公開は0036、対応Worker、運用/rollbackを別gateで検証する。旧Workerへの無条件rollbackは禁止。
- 次工程はB1-6 Phase A–Hの残り。operator認可、Host/full snapshot連携、fresh evidence、実partition等の判断を続ける。
- モデル適性: Sol / 高は原因が特定済みの本安全修正に適する。B1-6全体の横断設計はAstra / 中〜高を推奨する。

---

## 限定commit対象（87 files）

実装・テスト・文書23、version/cache更新のみ64。既存untracked2件は含めない。

```text
apps/cruise-port/ai-support-client.js
apps/cruise-port/ai-support-ui.js
apps/cruise-port/app-version.js
apps/cruise-port/app-version.test.mjs
apps/cruise-port/cruise-port-capabilities.js
apps/cruise-port/cruise-port-edition.test.mjs
apps/cruise-port/docs/B1_AUTHORITY_INTEGRATION.md
apps/cruise-port/docs/PORT_AUTHORITY_MIGRATION.md
apps/cruise-port/docs/PORT_LOCAL_AUTHORITY.md
apps/cruise-port/gear-category-store.js
apps/cruise-port/gear-list-store.js
apps/cruise-port/gear-photo-store.js
apps/cruise-port/gear-photo-workflow.js
apps/cruise-port/home-display.js
apps/cruise-port/index.html
apps/cruise-port/metronome-app.js
apps/cruise-port/metronome-presets-store.js
apps/cruise-port/metronome-store.js
apps/cruise-port/metronome-timing.js
apps/cruise-port/module-cache-keys.test.mjs
apps/cruise-port/my-apps-capabilities.js
apps/cruise-port/my-apps-capabilities.test.mjs
apps/cruise-port/my-apps-icon-store.js
apps/cruise-port/my-apps-icon-workflow.js
apps/cruise-port/my-apps-store.js
apps/cruise-port/port-account-join.js
apps/cruise-port/port-asset-sync.js
apps/cruise-port/port-dataset-repository.test.mjs
apps/cruise-port/port-dataset-storage.js
apps/cruise-port/port-local-authority.test.mjs
apps/cruise-port/port-migration-candidate.mjs
apps/cruise-port/port-sync-local-validation.js
apps/cruise-port/practice-calendar-sp610.test.mjs
apps/cruise-port/practice-calendar-sp611.test.mjs
apps/cruise-port/practice-calendar-sp612.test.mjs
apps/cruise-port/practice-calendar-sp613.test.mjs
apps/cruise-port/practice-calendar-sp614.test.mjs
apps/cruise-port/practice-capabilities.js
apps/cruise-port/practice-capabilities.test.mjs
apps/cruise-port/practice-dataset-writes.js
apps/cruise-port/practice-menu-app-resolver.js
apps/cruise-port/practice-menu-app.js
apps/cruise-port/practice-menu-attachment-store.js
apps/cruise-port/practice-menu-calendar-store.js
apps/cruise-port/practice-menu-history-store.js
apps/cruise-port/practice-menu-pending-attachments.js
apps/cruise-port/practice-menu-progress-store.js
apps/cruise-port/practice-menu-sets-store.js
apps/cruise-port/practice-menu-sp615.test.mjs
apps/cruise-port/practice-menu-store.js
apps/cruise-port/practice-unsaved-edit.test.mjs
apps/cruise-port/pro-app-boot.js
apps/cruise-port/pro-readiness.test.mjs
apps/cruise-port/pro_9a3943176561/index.html
apps/cruise-port/settings-store.js
apps/cruise-port/sync-center-navigation.js
apps/cruise-port/sync-center-orchestrator.js
apps/cruise-port/sync-center-ui.js
apps/cruise-port/sync-pro-lock.js
apps/cruise-port/tests/asset-cleanup-migration.test.mjs
apps/cruise-port/tests/feature-help-browser.cjs
apps/cruise-port/tests/feature-tutorial-browser.cjs
apps/cruise-port/tests/readiness-core-browser.cjs
apps/cruise-port/tests/runtime-regression-browser.cjs
apps/cruise-port/tests/standard-readiness-browser.cjs
apps/cruise-port/tests/standard-readiness-revision-browser.cjs
apps/cruise-port/tool-capabilities.js
apps/cruise-port/tuner-app.js
apps/cruise-port/tuner-store.js
apps/shared/sync-account/multi-app-sync-runtime.test.mjs
workers/sound-cruise-sync/ASSET_LIFECYCLE.md
workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md
workers/sound-cruise-sync/migrations/0036_add_asset_deletion_reservations.sql
workers/sound-cruise-sync/src/app.js
workers/sound-cruise-sync/src/asset-database.js
workers/sound-cruise-sync/src/asset-deletion.js
workers/sound-cruise-sync/src/writer-fence.js
workers/sound-cruise-sync/test/ai-diagnostics.test.js
workers/sound-cruise-sync/test/asset-app.test.js
workers/sound-cruise-sync/test/asset-lifecycle-fixture.js
workers/sound-cruise-sync/test/asset-lifecycle-worker-entry.js
workers/sound-cruise-sync/test/asset-lifecycle-workerd.mjs
workers/sound-cruise-sync/test/asset-lifecycle.test.js
workers/sound-cruise-sync/test/authority-cleanup-race.test.js
workers/sound-cruise-sync/test/sqlite-d1.js
workers/sound-cruise-sync/test/sync-target-naming.test.js
workers/sound-cruise-sync/test/transaction-fence.test.js
```

## 前回停止報告（履歴・原文保持）

# B1-6 Authority Integration — 停止報告

2026-10-12。**B1-6未完了。commit / pushなし。**
開始時点の既存コードで、参照中binaryをscheduled cleanupが削除できる競合を隔離再現した。
依頼の停止条件「cleanupで参照中binary削除可能」に従い、統合実装を停止した。
この文書はIntegration Contractの完成版ではない。

## 再現したblocker

対象は`workers/sound-cruise-sync/src/app.js`の`handleScheduled`、
`asset-database.js`の`claimCleanup` / `isReferenced` / `markDeleted`、
`writer-fence.js`のmutation guard。

1. Account Aに、猶予期間を過ぎたunreferencedのGear画像を用意する。
2. scheduled cleanupがAccount claimを取得し、現在参照なしを確認する。
3. R2 deleteのawait中に、同AccountのGear recordから画像を参照する正式push handlerを実行する。
4. pushはHTTP 200、operationは`applied`。live recordにassetIdが保存される。
5. R2 deleteが完了し、D1 assetは`deleted`になる。live owner referenceは残る。

claimはcutover prepareを排除するが、通常のrecord mutationからの参照追加を排除しない。
隔離writer policyを使ってもasset参照guardは`available` / `unreferenced`を許可し、cleanup claimを照合しない。
参照確認とR2削除の間に別requestが成立するため、最後にもう一度SELECTを追加するだけでは安全性を証明できない。

再現テスト:

```sh
node --test workers/sound-cruise-sync/test/authority-cleanup-race.test.js
```

結果: **2件FAIL**（既存legacy経路、isolated writer policy付きlegacy epoch経路）。両方:

```json
{"responseStatus":200,"status":"applied","referencedBeforeDeletion":true,"objectPresent":false,"assetState":"deleted"}
```

本番入口と同じpush/scheduled handler、SQLite migrations 0001–0035、実Pro verifierを使う。
AppDevice resolverとruntime controlは既存test fixture、R2はmemory fake。
R2 deleteの非同期境界にpushを挿入する決定的な競合テストであり、実Cloudflare/R2の実測ではない。
本番network、credentials、本番データは使用していない。

**enforced ledger付きAccountでの削除を再現したものではない。**
現状はledger付きAccount全体をcleanupから除外している。
今回の問題はcutover前のlegacy Accountで成立し、B1-6のcleanup recoveryを接続する前に解消が必要。
前工程の全テストが成功したことを、この競合の安全性証明とは扱わない。

## 依頼項目ごとの実施状況

| 依頼項目 | 結果 |
|---|---|
| 1 開始時Git | HEAD / origin/main / remote main = `cdc112ad7985ade5857c9a57ff1960df984dc77c`。main、tracked clean、staged空、ahead/behind 0/0 |
| 2–6 Architecture / Port・Studio Host / read-only / readiness | 接続点調査の途中で停止。製品コード変更なし。Studio canWrite=false、dormant Facadeは未接続のまま |
| 7–12 Migration / evidence / barrier / epoch / idempotency / crash | B1-6結合は未実装・未検証。B1-5の既存テストはbaselineに含む。pointer公開の新規実証なし |
| 13–14 Operator認可 / API | 既存Pro運用は運営者のCloudflare/D1操作。cutover controllerは隔離code capabilityのみ、公開routeなし。B1-6の認可方式確定・API追加には至っていない |
| 15–17 Cleanup / orphan / binary | 上記競合を再現。claim recoveryは未実装。Gear以外の新規横断検証には進んでいない |
| 18–22 Account / Pro / runtime / full・partial snapshot | 既存契約・コード不変更。B1-6 operation contextとfull snapshot連携の新規実装なし |
| 23–30 同時動作 / settings・preset・delete競合 / offline / Account切替 / Pro expiry / external Sync | 実Port + Studio 2-tab fixtureは未実装・未実行。既存baselineの成功と区別する |
| 31 Safari/PWA | 実機未検証。storage partitionは別Authorityの境界として扱う。Chrome viewportをSafari実証としない |
| 32–37 Node / 各suite | 開始baselineはWorker672、Port/shared1583、他app85、Studio315、全PASS。追加cleanup回帰2件FAIL。追加後の全suite再実行はしていない |
| 33、38–40 Browser / console / 404 | 停止前に未実行。前工程の97+Host10等を今回の実測として扱わない。今回console/404ゼロは未判定 |
| 41–45 production状態 | Worker deploy / D1本番適用 / production cutoverなし。コード定数ACCEPT_COMPAT、production activation変更なし、Studio canWrite=false。live productionを再監査したとの主張はしない |
| 46–47 Version / schema | Port1.22.5、Studio0.26.1、Studio schema1維持。追加は失敗を示す回帰テストと停止報告のみ、製品コードのversion変更なし |
| 48 Docs | 本停止報告だけ追加。指定既存契約の更新・全件精読は停止により未完了。B1-6完了とは記載しない |
| 49 Diff | 既存trackedファイル変更なし。新規2ファイルは未stageで保持。git diff --checkを確認 |
| 50–53 Commit / files / push | commitなし（新hashなし）、stageなし、pushなし。予定message「PortとStudioのAuthority統合基盤を整備」は未使用 |
| 54–57 最終Git | HEAD / origin / remoteは開始コミットのまま、ahead/behind 0/0。既存untrackedに加え本報告と再現テストを保持 |
| 58–60 完了判定 | B1-6未完了、B1全体未解消、production shared write解禁不可 |
| 61 Blocker | cleanup中の参照再追加とR2 deleteが排他されていない。残りのB1-6要件も未検証であり、追加blockerなしとは断定しない |
| 62 次工程 | cleanup claimと全writerの参照・公開mutationを同じD1境界で排他する設計・修正を先行。その後B1-6 Phase Aから残作業を再開 |
| 63 モデル適性 | Astra / 高を推奨。複数の永続化境界と競合の判断が必要。停止原因はモデル能力でなく、再現された安全条件違反 |

## 修正工程の受入条件（未実装）

- claim取得と削除対象のstate / identity / owner refs検査をtransactionで固定する。
- 削除claim中の参照追加とasset公開を、legacyを含む全mutationのtransaction内で拒否するか、安全な順序に直列化する。
- R2結果不明ではclaimを保持し、Account / membership / epoch / object identityを固定して回復する。
- 経過時間だけでclaimを解除しない。D1更新失敗、Worker crash、重複request、Account変更も検証する。
- 本再現2件を成功させ、既存全回帰と実workerd/D1検証を実施した後、残りのB1-6統合へ進む。
- 修正工程でもproduction deploy / migration / cutover / enforcement / shared writeの有効化は別途承認範囲とする。
