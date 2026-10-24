# Account writer participation v1 — isolated acceptance contract

This extends PR7, dependent on PR5 → PR6 → PR7. Port1.24.5 / Studio0.47.2
are maintenance candidate identities, not production publication. StudioProject
schema2, Authority schema2, receipt logical schema1 remain unchanged. Shared Write
OFF; Studio `canWrite=false`. No normal route imports these new modules. The
classic Account DB/client, authentication and Sync implementations are unchanged.

## Owners and physical migration

Shared owns the existing `sound-cruise-sync-account` database, `meta` store.
Port owns the fixture-only Account/Authority coordination adapter. No new database,
Account identity, authorization, project or Sync owner is introduced.

`enrollIsolatedAccountWriters({indexedDB,scopeName})` requires the existing
fixture-only Authority namespace. It validates existing physical version1 Account,
journal/marker, snapshots **every meta key/value**, checks supported JSON-like
values and the 1MiB snapshot bound, and hashes the snapshot outside transactions.
One versionchange transaction upgrades physical Account DB1→2, compares all rows,
and adds only `accountWriterFence:v1`. Existing Account, receipts, pending, QA and
unknown-owner rows remain byte/value equivalent. Unsupported values/future schema,
missing/corrupt receipt components, stale snapshot, competing enrollment, extra
stores or blocked connections refuse; no automatic repair, row deletion or restart.
Unknown rows are preserved, not treated as ours to write. An absent DB is not created.
The fence contains schemaVersion1, writerProtocol2, exact scopeName, random epoch,
monotonic revision starting0, and legacy snapshot digest. Scope names are isolation
checks, not credentials or server authorization.

A versionchange that is blocked rejects without forcing other connections closed.
If it later unblocks, the abandoned request aborts its upgrade; a rejected call
cannot silently migrate later. New enrollment is a separate explicit action.
No normal startup enrolls. Default PR7 protocol1 remains physical1 and unchanged.
All future production migration/recovery/rollback UX requires separate acceptance;
no downgrade or destructive migration is provided here.

## Durable mutation / revision contract

`createIsolatedAccountMutationStore({indexedDB,scopeName,protocol:2})` reads and
validates the fence together with Account/journal/marker. Private capture tokens
bind full Account bytes, exact receipt history and the durable fence. Account CAS,
receipt append, marker and fence increment commit in **one meta RW transaction**.
Auxiliary pending/QA writes use the same Account/journal/marker/fence CAS and
increment the same fence revision even if Account bytes are unchanged. Reads
validate this capture without incrementing. Overflow refuses without pruning.
Account journal revision counts Account mutations; fence revision counts all
participating Account and auxiliary mutations. Neither is UI/server generation.
A participating A→B→A has a different durable revision and refuses an old token.
Old/different scope/identity/epoch/revision or foreign auxiliary writes refuse.
CAS/receipt abort leaves all components unchanged. Retry with a forged or consumed
operation capture refuses. Duplicate receipt lookup remains historical-only.

## Per-operation Port API and source pin

`createIsolatedAccountWriterAdapter({indexedDB,scopeName,scopeFactory,locks,summary})`
is explicitly fixture-only. `scopeFactory` must return a fresh branded scope per
Account mutation, with the same registered DB/partition; disposed scopes are not
reused. `summary` returns an explicit fixture server observation plus Authority
generation, never synthesizes them from a UI counter or authenticates a caller.

1. Before server work, `capture(expectedAccount)` pins the complete source record
   and durable revision in a private token. Wrong/stale source fails closed. Object
   key order differences can conservatively refuse. No capture is allowed without
   a bound source Account. An old A operation must never be retagged using a new B
   capture. Existing method arguments must originate from this pinned source.
2. `run({context,writerId,operationId,invoke})` consumes that token once. Unsupported
   creation/qualification modes refuse **before callback/network**. Known writers
   receive a private per-operation storage facade, injected into the existing owner
   client/PortJoin/Bridge. It is not installed as global storage.
3. Own auxiliary writes advance only this operation's private successor. Before
   Account publication, the existing Port coordinator durably installs its stop
   intent and Control invalidation in the **Authority** transaction. Account CAS
   follows separately. Summary/capture races are rechecked. We do not claim a
   transaction across the two DBs or a server-side Account transition barrier.
4. Own Account success adopts only its returned UI generation and own committed
   successor token; it never recaptures a foreign Account or pending record to
   complete cleanup. Own cleanup after a foreign write fails. One Account commit
   per invocation. Callback must await its owner/storage operations. An uncertain
   transaction after interrupted callback is recovered through receipt, never
   automatically retried. Escaped facade is closed after invocation.

The adapter has a fixed writer decision registry; it is not a capability/auth API.
It assumes trusted fixture owner invocations, not arbitrary untrusted callbacks.
Production installation must add a trusted provider, actual source/argument binding
and server qualification; this fixture API alone is not the product writer gate.

## Complete current writer inventory and disposition

| Source / existing owner methods | Local writes | Isolated disposition |
|---|---|---|
| Shared AccountClient `startAccount` | pendingStart, Account | blocked-create; no bound-source Authority creation contract |
| `commitAccountRecovery`, `resumePendingRecovery` | pendingRecovery, Account | replace with existing bound-source capture only; first/unbound recovery blocked |
| `commitAccountRecoveryRotation` | Account | replace, full-record CAS |
| `revokeEnvironment` | conditional Account clear | remove |
| `detachCurrentEnvironment`, `resumePendingEnvironmentDetach` | pendingEnvironmentDetach, Account clear | remove |
| `detachApp`, `resumePendingDetach` | pendingDetach | auxiliary CAS |
| `commitDelete`, `resumePendingDelete` | pendingDelete, conditional Account clear | remove; app-only branch leaves Account untouched |
| `consumeJoinInvitation`, `consumeHandoff` | pendingConsume, Account, optional QA | replace only with bound-source capture; unbound path blocked |
| `resumePendingStart`, `resumePendingConsume` | pending + Account, optional QA | replace only with bound-source capture; unbound path blocked |
| `confirmConsumePersisted` | clear pendingConsume | auxiliary CAS |
| `enrollQa` | qaAdmission | blocked-qualification (no new qualification) |
| PortJoin `consume` / `resume` via `persistJoinedAccount` | pendingConsume, Account, QA | consume blocked-create; resume bound-source only |
| Port Sync Center terminal-code handling in `load` | clear Account | `port.terminal-clear` remove with original source capture |
| Shared ChordAccountBridge `prepare`, `commitDual`, `finalize`, `rollback`, `resume` | pendingBridge | auxiliary CAS; actual client passed by caller |
| Bridge `createAccountAndPrepare` | via AccountClient.startAccount | blocked-create |
| Shared storage `setAccount`, `clearAccount`, `changeAccountIfCurrent` | Account | replace / remove / both via opt-in facade |
| Shared storage set/clearPending Start/Consume/Bridge/Recovery/Delete/Detach/EnvironmentDetach and QA | auxiliary | exact allowlist; unknown key refused |

Other apps call the same Shared client; they are not migrated/rewired here. Methods
such as `provisionPortDevice`, membership prepare/status, invitation issue/cancel,
`detachCurrentAppEnvironment`, `revokeAppEnvironment`, `cancelAppDelete` and
recovery/delete preparation mutate server state or read only, not this Account
DB. They are inventoried as server-only, not certified by local revision tests.
No Worker/backend assertion or authorization is changed.

## Old writer refusal — exact guarantees and limits

After a completed explicit v2 upgrade, **all known classic writer entry points**
open physical VERSION1 and receive VersionError; cached classic connections close
on versionchange, or the upgrade remains blocked. A transaction already accepted
before upgrade must finish/abort first; the full upgrade CAS catches changed rows.
We neither terminate another renderer nor silently grant it protocol2 access.
Before explicit upgrade the old v1 behavior is unchanged. Product consumers are
not broken on ordinary startup because this migration is never auto-enabled.

**Not solved:** same-origin raw IndexedDB writer opening without a version (or
explicit version2), devtools/direct meta writes, wholesale key rollback, or a raw
ABA returning identical complete bytes. IndexedDB has no per-script ACL. The
native tests deliberately show raw writes can succeed. An unattributed Account
mismatching receipt tail refuses capture, but matching raw ABA is unprovable:
`continuityProven=false`, `operationAuthorized=false`, `canWrite=false`,
`recoveryRequired=true` always. A local fence is not tamper-proof authentication.
Do not report all legacy writers or all creation/recovery paths migrated.
These are **normal-provider activation blockers**, not accepted exceptions for
production. No Studio writer connection, Shared Write, L3d or Account switch is
unlocked by this work.

## Crash, B preservation and next acceptance

Authority intent/irreversible stop precede Account CAS. Crash before CAS keeps stop
without receipt; crash after CAS/ack-loss has historical proof, never auto-resume.
Reopen reader is read-only and does not confirm stopped intents or touch Control,
pointers, tombstones, receipts or prepared operations. Captured old A refuses
before changing B Authority. Notifications and Web Locks alone are not the durable
CAS guarantee; two-tab tests drop all notifications. B authorization remains under
existing Pro/provider gates; these tests do not mint or certify B credentials.

Required tests: current owner-method and source coverage; classic refusal; full
legacy row preservation; upgrade conflict/blocked/abort; durable auxiliary CAS;
multiple connections; participating ABA; raw limitation; late A vs B; own-successor
cleanup; same-transaction abort at Account/journal/fence; native crash/page loss and
reopen, readonly UI/cache/No-write. Node and native scopes use only synthetic data.

Next: trusted normal provider and **complete** source binding for every caller;
all-consumer migration/recovery and old-code coexistence policy; server/credential
qualification; raw noncooperating continuity solution or owner-approved enforcement
boundary; migration/cutover + binary durability; final admission in actual mutation
transaction; connected crash/reopen acceptance. None may relax old writer, CAS,
tombstone, Pro or final admission gates. Production remains separately authorized.
