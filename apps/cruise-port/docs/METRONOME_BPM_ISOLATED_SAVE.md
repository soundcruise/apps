# Metronome BPM隔離縦断保存 v1

Studio0.47.9 / Port1.24.12の未公開内部保守候補。Project schema2・既存Authority physical2・Account physical3を維持。通常ユーザー向けUI/bootへの接続はないため既存内部基盤候補と同じpatch運用とする。PR #10→#11→#12→#13→#14に依存。

## Ownerと利用範囲

Port `port-metronome-bpm-isolated.mjs`とStudioの注入専用`isolated-bpm-controller.mjs`で、読取り→memory draft→明示保存→再読込みを構成する。Port `metronome-store.js`の読取/正規化/保存、既存`saveBpm` policyとAuthorityのCAS/manifest/oplogを利用する。別のMetronome正本・Studio保存領域・Sync engineを作らない。fixture scope/同一IDB factory/明示finalAdmissionが必須。製品bootはimportしない。

正式Account providerのowner-confirmed-at-readは観測であり保存権限ではない。finalAdmissionは今回のtests専用synthetic backendが注入する別契約で、Production owner route・backend transaction再認可・credential expiryの実装完了を意味しない。実資格/Account/Cloud/Worker/D1/R2/Secretsを使わない。Shared Write OFF、通常PortDataHost.canWrite=false。

## 保存・Account・transaction

- load: Account ownerの物理3 full inventory manifest（revision/fence/receipt ledger/identityを含む）を固定し、未知/pending/不一致を拒否する。Authority active generation、Control/pointer、停止intent/barrierを照合し、owner観測のAccount/membership世代を区別する。BPMの旧schema/破損はロードだけで修復しない。Port loaderは私有read viewだけで利用する。
- draft: Studio controllerの一時メモリのみ。入力30〜240の整数。製品設定やAccount/Undo/Projectは変更しない。
- prepare: Account sourceとprovider観測を再照合し、別のfixture最終認可を要求する。Port saveMetronomeSettingsで値を生成し、旧rawの未知fieldを保持する。saveBpm policyがBPM以外の変更を拒否する。Account manifest digest/identity/credential version、Authority base/key revision・Control/pointerをfingerprintへ固定する。
- commit: 非同期検証の後にも、実Authority保存transaction内で同期final guardを評価する。guard不在/false/例外/Promise/thenable/expiry/世代不一致なら保存しない。既存CAS、Control停止barrier、manifest/records/head/oplogの単一transactionを変更しない。データの更新と永続oplog receiptは同時に確定する。
- BPM更新はAccountを変更する操作ではないためAccount mutation CAS/receiptを新造しない。既存Account revision/ledgerをreadonlyでpinし、cooperative Account切替のAuthority停止intentをfinal commitが読む。Account CAS用receiptとBPM dataset用receiptを区別する。
- Account DBとAuthority DBの単一transactionは仮定しない。schema-aware同一origin raw writerの改変/完全なABA排除は未保証。最終Account読取後のraw改変を通常writerの安全性証明にしない。

## 復旧ticket・成功判定

prepare時、既存Authority reservationのfingerprintを確定する。新しいread-only recoveryIdentity/reconcileOperationは、fingerprint bodyとimmutable oplog/manifest/全record hashを照合するだけで、新たなcommit/retry/現在の認可を発行しない。

ticketはscope/generation/operationId/BPM/Account digest、元のfingerprint body、checksumを保持する。bodyはBPM raw、base manifest/versions/Control、Account digest/identityを含むが、Account credential payloadや他のPortデータrawは含まない。checksumは署名ではなく整合検査。

commit前に既存Shared backup ownerの固定pinへ`bpm-<operationId>`単位で追加し、独立readbackする。操作IDは英数字/_/-の1〜64字。単一pending keyを更新/削除しない。各ticketはimmutableで、同ID異内容は拒否する。最初のDB作成競合では、保存データを一度も書かなかったloserに限り、既存ownerの同一metadata addを一度再試行する。BPM mutation自体は再実行しない。

acknowledgeRecoveryはbusy区間で当該ticketの成功を照合し、controller内のpending選択を解除するだけ。durable ticketは消さない。他tab/新operationの証跡を削除しない。今後のretention/容量保護は別契約。pin容量不足はデータcommit前に停止し、原本を保持する。

応答喪失/crash/reopen後は明示operationIdでticketを読み、正確なfingerprintとBPM、永続receipt/manifest/recordが一致した場合だけsaved=true/historical=trueを返す。ticket/oplog欠落、破損、世代不一致なら成功推定・自動再送しない。現在BPMが偶然同じでもreceiptの代わりにしない。ID/ticketを失えば未証明のまま。停止後も過去の確定receiptは照合できるが現在の保存資格にはならない。

遅延成功の結果を現在のview/draftへ適用しない。成功後は明示再読込みが必要。Account切替後、旧Aのpending操作で新BのAccount receipt/Authority/prepared操作を変更しない。正常Bは自身の新しいprovider/Authority generationで同じ縦断経路を利用する。

## 受入と未保証

Nodeは正常save、same-key/ABA、二重送信、CAS、final同期guard、expiry/時計巻戻し、ticket追加競合、旧ackと新ticket、quota/abort、crash各境界、receipt欠落、未知Account、未知Port field保持、A拒否/B保存を検証する。native Chromeは2renderer・通知欠落・実IndexedDB、明示UI、close/reopen・ack喪失・保存前crash・quota・最終拒否・expiry・A/B切替を検証する。試験件数/commit/tree/hashはrepo外証跡で確定する。

fixtureの最終backendはsyntheticであり、server truth/lease条件を制御する。実owner SQL/Port consumer互換は既存owner回帰で別途検証する。providerの5秒観測期限とsynthetic backendの60秒test leaseは資格expiryの本番契約ではない。実マイク/実Account/OS電源断/Safari/正式性能の新規測定は行わない。

本番保存には、owner route・資格issuance/renew/expiry・backend transaction内再認可、consumer cutover、旧writer/raw制限、migration/binary/Cloud復旧、retention/export、最終admissionの受入と明示承認が必要。今回のfixture成功でこれらを解禁しない。次の最小単位は本番未接続のowner最終admission契約/契約試験であり、通常writer/Cloud/Shared Writeを開始しない。
