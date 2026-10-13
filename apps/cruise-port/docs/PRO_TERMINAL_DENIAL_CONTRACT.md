# L3c Observed Revocation Safety Fix

2026-10-13。開始HEAD `a6b5bcd988995585f2ed80e40175f3924e1b0d6f`。
Production legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false。
Studio schema1 / Authority physical schema2・9 stores。本番操作・L3d以降は対象外。

## 修正前反例

real Workerで資格をrevokeした後、正式source経由validateはterminal denialを観測するが共有状態を更新しない。
旧prepared handleはcommitでき、新規offline proofも旧receiptで発行できる。
wall=NaNのStore早期拒否もprivate proofへ届かず、時計正常化後に同handleがcommitできる。
Node3反例とnative3反例を修正前に記録し、恒久回帰にする。

## 正式denial分類

Device Session helperが検証requestの対象をprivateに固定し、実応答を分類する。
HTTP401＋body.ok=false＋正式endpointに対応する既知codeがそろった時だけterminal。

| response | 分類 / 処理 |
|---|---|
| challenge/renew/sessionのinvalid_credential | 資格不在・verifier/scope不一致・revoke。対象資格terminal |
| challenge/renew/sessionのreauth_required | generation退役・90日idle・guarded renewのreauth要求。対象資格terminal |
| device_session_mismatch、invalid_session_proof、未知code、不正body、401/403だけ | device/proof不成立またはambiguous denial。新認可は拒否、資格自体の退役を推測しない |
| 503/429等の一時障害 | 既存有効grantのallowanceを使用。terminal扱いしない |
| network/timeout/offline | 既存のbounded allowanceだけ。未知server revokeの完全検知を主張しない |

denialは検証request ID・credential指紋・generation・sessionVersion・operation revision指紋・receipt identity・reasonへ固定。
callerのterminal booleanを受け入れる共有失効APIを作らない。正式source自身が正式clientの結果を処理する。

## Shared invalidation / ordering

既存Pro shared pending revoke / auth / operation epoch / receiptを利用し、別のAuthority専用失効台帳を作らない。
formal sourceは対象資格のin-memory同期ラッチを先に保持し、共有pending markerとrevisionへ反映する。
検証開始時のoperation revisionはdenialの帰属に固定する。現行authのcredential/generation/sessionVersionが対象と一致する時だけ現行資格を除去する。
同じ資格Aの途中revision更新は資格のterminal状態を解除しない。UI validationとoperation validationは異なるrevisionのrequest結果を共用しない。
古いAへの応答が新しいBのauth・epoch・receiptを変更しない。A receiptの削除は対象keyだけで、Bのepochを進めない。
共有処理・対象receiptのforget完了をawaitしてからterminal処理済みの拒否を返す。
失敗はpropagationFailedとしてfail-closed、処理完了を主張しない。

pending markerはcrash/reopen時も既知失効を保持する。receiptの削除が遅延/失敗してもmarkerを保持する。
marker保存失敗でも同一auth除去で後続sourceを閉じ、auth除去失敗でもmarkerとreceipt除去で閉じる。
receipt削除失敗でもauth除去＋markerを維持する。各独立故障とsource再生成を正式回帰で確認する。
全永続入口が同時に失敗したままcrashする場合、in-memory latchの跨再起動保持は保証できない。
この場合をpropagated=trueと扱わず、正常な永続状態への回復・オンラインの正式資格再確認が必要。
未観測server revoke、同期source読取り直後の他renderer変更、storageの手動改変を完全検知するとの主張はしない。
新qualificationへの正式更新は別identity。未確定operationへ新資格をretagしない。
Pro DBとAuthority DBは別transaction。同期source read後の未観測他tab/server変更との完全な原子性は保証しない。

## Clock / oracle

Storeがguard前に不正wall/例外を観測した場合も、対象trusted private proofを不可逆にblockする。
guardのnonfinite mono/clock例外/origin変更もblock。既存Proの5分clock correction許容は維持する。
確定operation replayは過去factだけ。clock/sourceの現認可ではない。

native oracleは後続mutationのrequest開始を観測してから先行rendererのsnapshotを再取得する。
必要なcompletionを確認できない場合はinconclusiveとして失敗する。古いsnapshot・timeout延長・不要なretryでPASSにしない。
既存assertion/round数を維持する。

## 完了gate

全required Node/native/Playwright/製品隔離回帰、commit後Studio315、remote一致が必要。
Standard/Account独立/Control/Evidence Lifetime/Pointer/CAS/Referentialを維持。
L3d・B1-6再開・shared write解禁・本番deploy/D1/cutoverは行わない。

## 正式検証記録（2026-10-13）

- 開始baseline: Worker760 / Port/shared2257 / Other186 / Studio315、全PASS。
- 修正前Node3 FAILで旧handle成功・新offline proof成功・NaN正常化後の成功を確認。
  Native3反例もinsecureConfirmed=true。修正前ログは/private/tmp/ors-reproduction-node.log / ors-reproduction-native.jsonに保持。
- 新規Node39（観測失効・3endpoint分類・共有故障・旧A/新B・同A revision・inflight identity・clock・receipt・retry/replay）＋oracle4 PASS。
  既存Pro48 / Device Session20、Standard3操作・Account独立・Control偽装・同ID retag・origin・final admissionを維持。
- 最終Node: Worker/Account760、Port/shared2300（baseline＋43）、Other186、Authority492（baseline449＋43）、Studio dirty314、workerd8、全PASS。
  commit後Studio315はclean guard込み・除外なしで必須。commit/push条件は本節末尾に従う。
- 新native Observed Revocation13＋7、既存Pro22＋7、Evidence admission16＋7、Evidence lifetime14＋7、
  Control48＋7、Pointer Safety15＋7、Pointer A–F＋7、CAS54round＋7、Referential63round＋failure4＋7、Policy9＋7、L2a14。
  全PASS。全stdout JSONをparseしverdict/cases/rounds・別renderer PID・violations/inconclusive/error/404/unexpected mutation0を照合した。
  Observed13のPID49052/49055、Pro22のPID49199/49201。Control155238bytes・Pointer Safety82567bytesも完全。
- 新native fixtureの初回は対象A以外のBまでterminalを返すtransportと、Bの正式UI/session確立待ちが不足していた。
  初回出力を保持し、対象credentialへのtransport bindingと正式完了checkpointを追加した。
  これは新qualificationを有効に確立してから旧Aを返す試験の準備修正であり、認可をretryしてPASSにする変更ではない。
  既存oracleのassertion/round数・timeoutは維持。fresh completion不在をPASSへ変更しない。
- 正規Playwright1.62.1、既存runtime・専用8766: Port6suite、Studio5suite（97＋Host10）。
  通常routes/Structure/Editing Session/Pre-DTM/M1/M2/read-only Host・4Themes/Printの追加CDP13、全PASS。
  application error/404/unexpected network mutation0。standard-readinessの意図した401/offline errorのみ別記録。
  package install/lockfile変更なし、利用者profile/既存8765不触。本番通信はfixtureでintercept。
- Port1.22.18 / Studio0.26.12は限定patch。共通helper/gate cacheは5/32、参照全Pro HTMLとPitch fallbackを整合。
  他アプリは共通Pro参照とその期待値だけを更新し、固有機能/保存先/版定数を変更しない。
- 私有同期ラッチはshared sourceの同document内だけで、Authorityへ独立した失効rowを追加しない。
  永続正本は既存auth/pending/operation epoch/対象receipt。同期資格確認と別DBを単一transactionと称さない。

実測ログは/private/tmp/ors-final-*.log、ors-native-*.json、ors-pw-*.log、ors-browser-regression.json。
全gate PASS後だけ個別stageで「IndexedDB AuthorityのPro失効伝播を修正」を1commit。
direct child/clean/staged空/ahead1behind0、commit後Studio315、直前remote一致でだけ通常pushする。
完了範囲は上記3修正。L3d/Account協調・B1-6再開・shared write解禁・本番Worker/D1/cutoverは未実施。
