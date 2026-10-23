# L3c Trusted Pro Device Session Adapter

## L3c Security Recovery — 未コミット限定候補（2026-10-22）

[現在の永続失効契約](PRO_TERMINAL_DENIAL_CONTRACT.md#l3c-security-recovery--限定候補2026-10-22)を参照。
既存Pro DB version1/stateの同じreceipt keyへtombstoneを保持し、同一RW内でreceipt CASと直列化する。
Adapter/Authority Store/Workerの製品実装は不変更。Sourceの同期readはDBを開かず、正式非同期認可では
従来のreadonly receipt検査がtombstoneを拒否する。通常UIも同じterminal伝播へ接続する。
pending ACKは永続fenceを解除せず、旧資格Aと新資格Bを分離する。
Standard/Account独立、両30秒margin・時計補正・Pointer/Control/Evidence/履歴replayを維持する。
固定baseは0335aa09。Studio schema2はbaseから継承し、今回Studio保存仕様を変更しない。
Production legacy/ACCEPT_COMPAT/enforcement OFF/shared write OFF/canWrite=false、L3d未着手。
commit/push/deployは実施しない。検証実測とbase既存FAIL・所有境界guardの扱いはrepo外証跡と完了報告で区別する。


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

2026-10-13。開始HEAD `cb1ce792675d0d67ed095ccbacfe2ad1c77db54b`。
Production legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false。
Studio schema1 / Authority physical schema2・9 stores。通常bootへ接続しない。

## Phase A：既存正式契約の棚卸し

1. proof sourceはshared/pro-gate.jsのSoundCruiseProOperationSource。表示accessGranted/isProとは別。
2. validateは既存Pro Device Sessionのchallenge/renew（ECDSA P-256のdevice key proof）とgeneration照合を使う。
3. receiptはshared/pro-device-session.jsがnonexportable AES-GCM keyでsealする。key binding/metadata/time stateをunseal時に検証。
4. offline grantはこの検証済みreceiptだけ。表示cache/edited validatedAt/旧v2 compatibility応答はgrantではない。
5. GRACE=7日、IDLE=90日、REVALIDATE=12時間。offlineUntil=accessExpiresAt、lastValidatedAt+7日以下。
6. wall high-waterは暗号化receiptへCAS更新する。期限はserverObservedAtから計算。
7. 同documentのmonotonic経過をwall高水位へ加える。異rendererのperformance.nowを比較しない。
8. wallの小補正は5分まで許容。観測したrollback/offlineExpiredはserver検証成功まで保持。
9. resetInFlight・pending revoke・auth欠損でsource.read.revoked=true。forgetは非同期receipt削除前にoperation epochを進める。
10. Pro generationは資格世代。Authority generation/Account generationとは別。
11. sessionVersionは資格identityへ固定。AdapterはDevice Session v3と正式receiptを必要とする。
12. operation revisionはoperation epoch/authEpoch/resetInFlight。credential変更・reset・観測失効で旧操作を止める。
13. credential fingerprintは非可逆SHA256。raw credential/keys/proofをAuthorityへ保存しない。
14. 未確定retryは現資格を非同期validateし、同じ元identityへだけ新private proofを作る。
15. 別tabはlocalStorageのauth/epoch/pendingを同期read。receiptは別IDBで非同期検証。通知は正本ではない。
16. ProはAccountログインと独立。local Pro保存にAccount/AppDevice/membershipを追加要求しない。

## Adapter / trust boundary

Port-owned内部Adapterだけが正式sourceと既存createProOperationResolverを使う。
Adapterはcallerのsource/client/guard/isPro/authorized/期限をDIで受け付けない。
source.validate成功だけでなく、既存helperの正式read-only clientで同資格のreceiptを検証する。
このため任意boolean/偽validate応答/表示objectだけではprivate contextを作れない。
同originの任意JavaScript・storage改変を隔離するsecurity sandboxではない。既存のbrowser-held-key信頼モデルを維持する。

private WeakMap context/guardをscope・Authority generation・operationId・action・prepared payload fingerprint・target keysへ固定。
永続operation identityにはPro generation/credential fingerprint/sessionVersion/operation revision fingerprintを含める。
同operationIdのaction/payload/target/資格/revisionのretagは予約照合で拒否する。
Control evidence/capabilityをPro proofに使わない。test providerと正式Adapterのbrandも別。

## Final admission / clocks

非同期source/receipt validationはtransaction外。最終RW transaction内の同期guardは
現source、local auth/epoch/pending、private proof、generation/sessionVersion/revision/fingerprint、scope lease、clock originを再照合。
既存resolverのassertCommitを使い、観測済みsource/proof失効はその操作にstickyに保持する。
wall/mono残marginは両方30000ms以上（29拒否、30/31許可）。prepare成功をcommit許可と扱わない。
Controlの厳密wall逆行ルールをProへ移植しない。Proは既存5分補正許容を維持する。
clock originが変わる旧操作は拒否し、新しい非同期検証とprivate operation proofを必要とする。

Device Session DBとAuthority DBは別transaction。最終guardは**観測可能な同期source変更**を拒否する。
別DBの未読receipt変更や未観測server revokeを原子的に検知できるとは主張しない。
offlineは既存検証済みgrantの残予算内だけ。既知revokeは拒否、Cloud資格は別gate。

## Retry / replay / Standard

retryは元payload/base/identityを維持して新proofを取得する。資格/revision変更は新operationIdが必要。
確定replayは過去factだけでpublish=false。現在のPro/cloud許可を付与しない。
Standard BPM/delete/applyはPro・Account不要。Standard applyはBPMだけでraw advanced値を保持。
advanced save/create/advanced applyは正式proof必須。Adapter未接続の通常scopeはfail-closed。

## 完了gate

新Authorityは隔離fixtureのみ。正式source/helperの製品挙動・保存先は維持。
全required Node/native/Playwright/製品隔離回帰、commit後Studio315、remote一致を確認して限定commit/通常push。
L3d以降・本番Worker/D1/cutover・B1-6再開/shared write解禁は行わない。


## 実装上の補足

正式helperのread-only clientにはAdapter内部の短命readonly storeを供給する。
キー生成/receipt更新を行わず、各readのtransaction完了時にconnectionをcloseし、blocked/upgrade/破損を拒否する。
callerのstore/client/source injectionを受けるAPIではない。資格やreceiptは戻り値へ含めない。
operation contextをclone/別scope/別generationへ移すことはできない。新runtimeは新しい非同期proofを取得する。

Pro generationと資格指紋に加えsessionVersionとoperationRevisionFingerprintをformal authorizationIdentityに追加する。
これらはformal request fingerprintへ含まれ、既存reservations/oplogの同ID retag検出をそのまま使う。
旧fixture identity（generation/fingerprint）の履歴replayは互換を維持し、正式Adapterの新identityへ自動補完しない。
物理schema/Store inventory/Action Policy区分を変更しない。

新native oracleは正式dataset操作のreservation transactionとmutation transactionを区別する。
Pro mutationの実開始gateを保持し、相手の実RWが待機すること、first complete/abort後にsecondが開始することを検証する。
既存Control/Pointer oracleとround数は維持する。traceのtimeout clockは試験用Pro clockと分離し、実時間で失敗する。


## 最終検証記録（2026-10-13）

- 開始baseline: Worker760 / Port/shared2209 / Other186 / Studio315、全PASS。
- 新規Pro Node48 PASS。実shared gate・Device Session・real Worker＋隔離SQLite/IDBを使用。
  Standard3操作、Pro3操作、偽造/clone/Control流用、両margin29/30/31、reset/pending/revoke、generation/sessionVersion/revision/資格変更、
  sticky失効/小時計補正/origin/reopen、offline、同ID retag、historical replay、abort/response loss、最終admission、実Repository backend/serialized retryを検証。
- 最終Node: Worker/Account760、Port/shared2257（baseline＋48）、Other186、Authority449（baseline401＋48）、Studio commit前314、全PASS。
  commit後Studio315はclean guardを含め除外なしで実行し、完了報告へ記録する。
- Pro native22＋既存acceptance7 PASS。renderer PID42931/42933、実native crypto/IDB/正式shared source。
  auth transportのみ使い捨てfixture。formal Worker/key/server検証はNode real Worker回帰と既存workerdで確認。
- 必須Evidence native14＋7 PASS、PID41189/41204。独立監査の実行履歴から回収した追加admission16を正式suiteへ保存し、16＋7 PASS、PID41280/41299。
  abort→retry前reopen→rollback、manifest読取り中失効、両margin、同operation/evidence別renderer競合の両順序×3を維持。
  ユーザー補足により旧未保存independent16は必須扱いせず、今回正式保存した追加試験として実測する。
- Control48＋7、Pointer Safety15＋7、Pointer A–F＋7、CAS54round＋7、Referential63round＋failure4＋7、Policy9＋7、L2a14、全PASS。
  最初の並列native実行でControl/Pointer Safetyの完了event観測assertionとPolicyのPID証明が未成立。
  初回FAIL出力を保持し、既存oracle/assertion/round数を変更せず単独順次再実行した全suiteがPASS。初回をPASSに数えない。
- Local workerd/D1/R2 8 PASS。本番deploy/D1操作なし。
- stdout JSON全体をparseし、verdict/件数/PID/inconclusiveを照合。Control155238bytes、Pointer Safety82567bytesも完全。
- 正規Playwright1.62.1の既存runtimeを実測。Port6suite（18/26/10/18/standard-readiness/10）、Studio5suite（97＋Host10）、全PASS。
  install/package/lockfile変更なし。通常routes/Pro/Presets・Structure/Editing/Pre-DTM/M1/M2/read-only Host・4Themes/Printの追加13件PASS。
- application error/404/unexpected network mutation0。standard-readinessの意図した401/offline errorのみ別記録。
- 通常bootはAuthority DBを生成しない。schema1/physical2・9 stores、legacy/ACCEPT_COMPAT/enforcement OFF/shared write OFF/canWrite=falseを維持。
- Port1.22.17 / Studio0.26.11は内部Adapter/guardの限定patch。製品UI/保存先/認証方式の追加変更なし。

同期guardの失効観測はそのrealmのprivate operation proofへ保持する。shared receiptへ独自のControl失効rowを追加しない。
新runtimeの認可は正式Device Sessionの永続time stateと新しい非同期検証/操作proofに依存し、跨runtimeのmonotonic連続性を仮定しない。
同期source read後の別tab変更との完全な線形化、別DB間の原子性、完全未観測の再起動/時計変更、未観測server revokeは既存契約の限界として維持。

実測ログは/private/tmp/l3c-verified-results.json、l3c-native-*.json、l3c-final-*.log、l3c-pw-*.log、l3c-browser-regression.json。
最終required gate成立後だけ限定commit。direct child/clean/staged空/ahead1behind0・Studio315・直前remote一致後だけ通常push。
L3c完了範囲は隔離正式Pro Adapter。次は独立安全監査、L3d以降のAccount協調は別指示。B1-6再開/shared write解禁不可。
