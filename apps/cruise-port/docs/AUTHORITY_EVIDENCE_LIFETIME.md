# IndexedDB Authority Evidence Lifetime — L3b-2 Safety Fix

## L3c Trusted Pro Device Session Integration（2026-10-13・現行）

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


2026-10-13。修正前HEAD `3007e79dba2d98fa97a841433bf43d633f6b9d03`。
Port **1.22.16** / Studio **0.26.10** / Studio schema1 / Authority physical schema2・9 stores。
Production legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=falseを維持。
本契約はControlの証拠寿命だけを限定修正し、L3c以降のprovider/Account/製品入口を接続しない。

## 修正前反例

issuedAt=100000 / expiresAt=160000でprepareし、wall=170000ではcontrol-evidence-stale。
wall=110000へ戻して同じprepared handle/evidence/capability/operationIdをretryすると、
resumeとrenewの両方がcontrol-committed / changed=trueになる。Node2件とnative2件で再現する。

## 不変条件 / clock domain

一度失効または時計不正を観測した証拠は、wall rollback/retryで有効へ戻らない。
私有WeakMap contextはevidence identity/digest・issuer identity・generation・runtime lease・clock identity、
wall expiry/anchor・monotonic deadline/anchor・last observed wall/mono・expired/invalidatedを保持する。
公開fieldやcaller booleanを正本にしない。同じissuer/runtimeで同じevidenceIdを再attestしてもcontextを初期化しない。
同じidentityに異payloadを入れることも拒否する。

clock sourceは明示isolated scopeに束縛したwall/monotonic/origin。通常はDate.now/performance.now/performance.timeOrigin。
anchor時のwall残予算をmonotonic deadlineへ変換し、最終admissionで両残予算を確認する。
どちらか一方が30000ms未満ならexpiredをラッチ。29秒拒否、30秒ちょうど許可、31秒許可。
wall/monotonicの観測値逆行、clock origin変更、不正値/例外はinvalidatedをラッチする。
異renderer/reload/再起動のmonotonic値を比較・引継ぎしない。

## 共有範囲 / durable ownership

共有範囲は同Authority DB・partition・generationのprovider＋evidenceId。
reservations storeへevidence-lifetime rowを保存し、証拠digest/issuer/runtime/clock所有を固定する。
初期bindingはControl identity予約と同じtransactionで確定する。
一度登録した既存証拠を別runtimeが再attestしても再所有できない。期限内でも拒否する。
BroadcastChannelは失効の正本ではない。新runtimeにはproviderの新しい証拠identityと新operationが必要。
旧未確定Control予約に寿命情報が無い場合も現在値から補完せず、未確定retryを拒否する。
確定factの履歴lookup/replayは現在の証拠所有を再認可せず、Controlを変更しない。

## Transaction / abort

最終寿命判定・共有rowの照合と更新・Control/fact更新は既存8-store native RW transactionで直列化する。
expired/invalidatedを観測した拒否はControl/factを変更せず、失効rowだけを保存してtransaction complete後に返す。
判定と失効永続化の間に別の同証拠mutationを許可しない。
低level abortで失効row更新がrollbackしても私有ラッチは戻さない。既に永続化したruntime所有も残るため、
別runtimeは旧証拠でcommitできない。同runtimeのretryは失効ラッチを再永続化して拒否する。
寿命rowをGC/削除/resetするAPIは提供しない。保存破損・不整合はfail-closed。

## Prepared / retry / fresh evidence

prepareは未来のcommit許可ではない。最終admissionで現在clock・私有ラッチ・共有rowを再確認する。
同じhandle/operationIdの証拠を差し替えない。fresh provider証拠＋新identity＋新operationなら正常動作を維持する。
plain/clone/別scope/別generation/失効leaseのtokenは拒否する。
revoke前の証拠はControl epoch bindingでも拒否し、identity/member generation/pointer/fenceの既存CASを維持する。
replayは過去factのみで、expired判定や後続revoke/invalidateを解除しない。

## Harness output

cross-tab driverはJSON全体のstdout write callbackを待ってから終了する。
終了コードだけでPASSを判断せず、保存したstdoutのJSON parse・verdict・case/round数・inconclusiveを照合する。
>64KiBの出力をpipeで取り込む回帰を追加し、assertion/round/race oracleを減らさない。

## 検証 / 残件

Node/nativeの修正前反例を保持し、修正後はexpire→rollbackを拒否する恒久試験として実行する。
clock/margin/lifecycle/abort/cross-runtime/queue/expiry vs commit/Pointer/Action Policy・製品隔離を確認する。
正式server provider、Account協調、cloud admission接続はL3c以降。Worker D1 fenceは最終認可のまま。
本契約はローカル時計や任意storage改変への暗号学的耐性、remote revoke完全検知を主張しない。

## Durable row inventory

新store/物理schema bumpは行わない。既存reservationsへkind=evidence-lifetime / schemaVersion1を追加。
keyは[generation, evidence-<SHA256(providerId,evidenceId)>]。同keyにdataset/publication/Controlがあれば衝突として拒否する。
fingerprintはimmutable evidence snapshotのdigest。rowはaction=observeEvidence / policy=control-evidence-lifetime-v1 / origin=v2。
evidenceLifetimeはschemaVersion/providerId/issuerId/runtimeId/clockId、wallAnchor/monoAnchor/monotonicDeadline、
lastObservedWall/lastObservedMonotonic、expired/invalidated、immutable evidence snapshotを保存する。
monotonicDeadline=monoAnchor+max(0,expiresAt-wallAnchor)。anchor/deadline/identityの書換えは拒否。
更新できるのは観測高水位の増加とexpired/invalidatedのfalse→trueのみ。
capability/opaque証拠tokenや認証資格は保存しない。rowの公開UUIDは権限ではない。

最初の寿命確認は未確定Controlのtransaction入場時に行い、期限切れならControl CASが失敗する場合も失効を記録する。
正常なclock判定だけで確定せず、full manifest読取り後・Control更新直前にも再評価する。
成功fact replayは寿命評価前に履歴として返すため、古い成功を再実行せず、clock状態を新たな認可と扱わない。

既知反例の修正前ログは/private/tmp/elf-reproduction-node.logと/private/tmp/elf-reproduction-native.jsonに保持する。
Nodeの恒久反例2件は修正後PASS。stdout回帰は1MiBをbackpressure付きpipeでparseし、出力エラーを成功にしない。
commit前required native/browser回帰は下記のとおりPASS。commit後Studio315は除外なしで実行し、完了報告に記録する。


## 最終検証記録（2026-10-13）

- Node: Worker/Account760、Port/shared2209（baseline2175＋寿命32＋stdout2）、Other186、Authority401（baseline369＋寿命32）、Studio dirty314、全PASS。
- Local workerd/D1/R2:8 PASS。本番deploy/migrationなし。
- Evidence native:14＋既存acceptance7 PASS。別renderer PID38602/38604、同origin、Web Locksなし、通知drop。
  resume/renewそれぞれ同handle期限切れ→rollback拒否・peer同証拠拒否、revoke→peer旧renew拒否、
  structuredCloneのbrand移送拒否、expiry/valid commit両順序、実transaction待機中の期限切れ、abort後の不可逆失効、
  dispose/reopen旧証拠拒否・fresh証拠成功、renew/Pointer switch両順序を確認。
- Control native48＋7、Pointer Safety15＋7、Pointer A–F＋7、CAS54round＋7、Referential63round＋failure4＋7、Action Policy9＋7、L2a14、全PASS。
- Queue raceは実RW transactionのqueued/request-started/completed順をgateで証明し、inconclusive0。round数・既存oracleを維持。
- Cross-tab全stdoutをJSON parseしverdict.pass=true、violations/unavailable/unexercised0、case/round数を照合。
  Control155238bytes、Pointer Safety82567bytesも完全。1MiB backpressure回帰2件もPASS。
- Playwright1.62.1は既存runtimeを実測して利用。Port6 suite（18/26/10/18/standard-readiness/10）、
  Studio5 suite（Keyboard21/Editing23/M1 29/M2 24/Host10）、全PASS。install/package/lock変更なし。
- Port通常routes/Presets/Pro、Studio Structure/Editing/Pre-DTM/M1/M2/read-only Host、4Themes/Printの追加13件もPASS。
  application error/404/unexpected network mutation0。standard-readinessの意図した認証401/offlineだけ別記録。
- Production bootでAuthority DB生成なし。PortDataHost.canWrite=false、schema1/physical2・9 storesを維持。
- 完了範囲はEvidence Lifetime Safety Fixとstdout flushだけ。L3c未着手、正式provider/Account/製品Control接続なし。
  次はこの修正の独立安全監査。B1-6再開/shared write解禁は別gateのまま。

実測ログは/private/tmp/elf-verified-results.json、elf-native-*.json、elf-final-*.log、elf-pw-*.log、
elf-browser-regression.json。これらは隔離試験のローカル記録であり、リポジトリへ追加しない。
commit後はdirect child/clean/staged空/ahead1behind0とStudio315を確認し、remote一致時だけ通常pushする。
