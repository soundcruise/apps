# Pointer / consumer fence coordination and explicit partial recovery v1

Isolated technical candidate, direct parent PR #22 `ae1309d554d7df1bd60f9362cfd23c3bf8d05465` / tree `791af2e136db35048541cddfc69b9a6563ccd51b`. Dependency: main → #16 → #17 → #18 → #19 → #20 → #21 → #22 → this topic. Internal maintenance versions Studio **0.47.17**, Port **1.24.20**, Project schema **2** unchanged. Public main remains `d66107c5ef30ca1a0873f0943876c73e745c14b5`, Studio0.47.9 / Port1.24.12.

## Protected scope / existing owners

This models **one Port Account/device/dataset's cooperating BPM fixture consumer**, on PR21's readonly/fenced Authority generation. The two closed fixture IDs are `port-bpm-fixture-v1` and `studio-bpm-readonly-fixture-v1`, both owned by Port. The latter is an isolated selection fact, not an installation of normal Studio/Port consumers. Normal product AccountClient/provider, SyncCenter controller/orchestrator, join, Pro, AI Support, Shared runtime/bootstrap/bridge, Chord/Pitch/Fretboard/Rhythm consumers and Studio's default reader retain their existing migration status in [ACCOUNT_CONSUMER_MIGRATION](ACCOUNT_CONSUMER_MIGRATION.md). No normal writer/consumer cutover, Cloud Sync, L3d or production authentication change occurs.

Existing Account canonical capture/CAS/revision/full-source manifest, HMAC/credential lifecycle/durable owner clock, Pro/app-device verification, writer fence, Sync repository SQL save/receipt, Authority records/manifests/oplog/pointer/journal and Shared immutable backups remain their owners. No second authentication service, dataset authority or Sync engine is created. Additional SQL tables are **fence metadata and transition facts**, not dataset copies. Their installer/initial registration exists only in tests; unknown/unregistered state is never automatically seeded/repaired.

`enableOwnerCutover` requires the existing strict lifecycle/operation-lease fixture mode. It defaults OFF; production routers, bindings, Wrangler, migrations and deployment config are untouched. Cutover routes live only in the existing unrouted isolated route factory. The old default lease mode remains compatible. In coordinated mode, legacy/unleased save and v1 unbound lease envelopes are refused. Protocol envelope **v2** adds a typed consumer binding to the exact request digest; this is not StudioProject schemaVersion2 or a project migration. No HTML normal boot path installs the coordinator.

## State machine and linearization

1. **Explicit local stop.** `begin({sourceGeneration,reauthorizationOperationId,targetConsumerId,transitionId,explicit:true})` captures exact current Account/full-source manifest, readonly Authority snapshot, pointer, Control epoch, typed consumer epoch and immutable backup inventory. Before mutation, a separate cutover pending pin is durably added/read back. `stopOwnerCutover` requires a scoped opaque purpose and exact snapshot/consumer CAS. In one existing Authority transaction it adds an immutable typed stop fact and advances Control/fence epochs with recoveryRequired=true. Existing suspended/fenceRevoked flags remain true. The old prepared operation cannot pass the new Control/base, including in a local receipt-application race.
2. **Owner SQL stop.** A current Account/app-device/Pro/writer qualification is required. One owner batch CASes the registered pointer/consumer metadata from open to stopped, increments the **current** operation-fence counter, inserts an immutable request-bound transition and performs a final joint current-owner/Pro/writer/stopped-state assertion. The increment uses the value inside this SQL transaction, not a stale pre-read counter; lease issuance racing the stop cannot make stop skip a winning lease. The current counter/update count and exact transition/request/registry revision are proven together. This SQL final assertion is the owner-stop linearization point. It blocks **both** new lease issuance and the final SQL consume guard for old leases.
3. **In-flight classification.** A save which serialized before owner stop may have committed; a save after stop cannot consume its lease in this mode. The stopped owner returns a bounded complete local-scope roster (max64 operations) and exact backend facts, including latest BPM record. Extra unregistered SQL operations, missing/mismatched receipts, unknown floors, registry phase/completion contradictions or a nonmatching consumer/pointer refuse progress. The client requires each exact original operation pin and lease pin and uses one Authority readonly transaction to classify original typed receipt/oplog/manifest or a distinct typed recovery fact. No local success is inferred from a backend fact.
4. **Explicit partial recovery, if needed.** See below. It occurs on the **original generation**, while its stop remains set; no old prepared object or old operation ID is transplanted into a new generation.
5. **Readonly pointer / consumer publication.** After all operations are proven either backend-not-committed, locally applied or explicitly recovered, existing Port validation requires known empty binary and locally absent Sync connections. The new generation is prepared/sealed with identical complete source values. A fresh owner-stopped qualification pins current source, roster, Account manifest, consumer, pointer and publication intent. A dedicated opaque publication purpose revalidates stop, full snapshot, local inventory and exact pointer/consumer CAS in **one existing Authority transaction**. It supersedes the old Control (without clearing its stop), publishes pointer + namespace + journal + typed publication fact, and advances the consumer epoch atomically. The new Control is active but suspended=true AND fenceRevoked=true, recoveryRequired=false. The fixture consumer remains readOnly=true. This is the local publication linearization point.
6. **Owner confirmation.** The same explicit workflow may record the resulting pointer/consumer/publication digest on the owner, changing stopped to **readonly**, never back to open. No lease issuance is restarted. After an uncertain response, `reconcile` is observation; `confirm({transitionId,explicit:true})` is a separately named state-changing continuation with a newly checked current owner and local typed publication. A second confirm of an already proven identical completion only reads its fact.

This is more than an ordering convention: either side's durable stop survives interruption, every future cooperative mutation is fenced by its own owner transaction, and pointer publication requires the stopped-owner proof plus its own exact local CAS. Neither stop is undone on failure. It is nevertheless **not a cross-DB transaction**.

## Partial outcomes / APIs

`inspect({transitionId})` classifies original operations without applying/retrying them. `reconcile({transitionId})` observes the transition/publication/consumer/owner facts without sending stop, save, recovery, publish or confirm. These operations do not mutate business data, intent, pointer, consumer or backup; existing authenticated owner clock/terminal-expiry observations and transaction assertions remain restrictive owner metadata operations.

| Observed state | Result / next explicit action |
|---|---|
| Backend not committed | Proven under the persistent stopped owner; original pin/lease remains. It is not retried. |
| Backend committed, local receipt absent | `backend-committed-local-unapplied`; publication refuses. |
| Backend committed, local result unknown | Read exact typed row + oplog + manifest. Missing/corrupt/inconsistent evidence stays unproven. |
| Backend committed, original local application proven | `backend-committed-local-applied`; historical only. |
| Backend committed, separate local recovery proven | `backend-committed-local-recovered`; original fact/pin retained. |
| Local candidate staged, backend/fence unknown | Candidate and stop retained, old pointer retained; no automatic continuation. |
| Local stop committed, fence result unknown | `localStopped=true, ownerStopped=null`; no pointer switch. |
| Fence stopped, pointer not switched | `fence-stopped-pointer-not-switched`; explicit publish may proceed only after fresh complete proofs. |
| Pointer/consumer committed, ACK lost | Historical lookup can prove both; `pointer-switched-owner-stopped` if owner confirmation is missing. Explicit confirm is separate. |
| Pointer/consumer and owner readonly completion proven | `readonly-cutover-confirmed`; never write-ready. |
| Consumer/pointer integrity unknown | Fail closed; retain known historical facts and all stops/pins. |

Known `localStopped`, `ownerStopped`, `pointerCommitted`, `consumerCommitted`, `localRecovered`, `ownerConfirmed` facts are kept even if a later Account change, callback, readback or network step fails. null means unproven, not false or safe to resend. A typed response is validated/request-bound before postsource checks so delayed old A facts are not lost; they never certify current B authorization. Public reasons use a fixed Map and never echo arbitrary dependency codes, SQL, native prototype functions or secrets.

`recoverPartial({transitionId,operationId:<new UUID>,sourceOperationId,explicit:true})` is the only local recovery mutation. It requires current canonical Account/member/device/credential owner proof, source/full manifest, current stopped owner fence, Control/pointer/consumer, exact roster/digest, original immutable pin/body/lease and a validated latest backend fact. The backend latest record must still be that operation's exact revision/hash/payload; a historical receipt alone cannot overwrite newer data. Other unresolved partial operations block v1 recovery. An owner qualification of this fresh recovery intent is required; the five-second reader/old lease/old receipt is not a grant.

The same Authority transaction checks source head/versions/full snapshot and consumer, applies only the original committed BPM value with normal BPM/field/reference semantics, and appends a **new recovery UUID's typed fact/oplog/manifest**. It retains the original operation reservation, pin and receipt and never sends the old SQL save. Inspect/reopen can link the distinct fact to the original operation. A new pending recovery with no proven local result stays stopped; there is no unconditional retry/cleanup shortcut. Immutable pin additions require previous inventory plus exactly the returned own pin, not a recaptured baseline that might absorb foreign pending data.

## Scope limits and failure preservation

The backend still does not directly read a browser's live IDB pointer. The registry is a current **owner fence binding** for this cooperating fixture scope. It blocks a newly granted permission until the registered source pointer/consumer matches and remains open, and then keeps that scope permanently stopped/readonly across publication. It is not a proof that all other devices, arbitrary SQL paths, other Cloud writers or default legacy production routes are fenced. Those consumers are not cut over here. Same-origin raw IDB/SQL actors are not cryptographically excluded by local hashes/brands; they remain a separate containment gate.

Account DB, Authority DB, backup DB and backend SQL commit independently. Current Account/full-source manifest/backup are checked before and after async owner/local steps; local intent/pointer/consumer/CAS checks are within the Authority transaction. A change in the remaining cross-DB window can leave a historical recovery/publication applied but current confirmation failed. Both old/new consumers stay stopped/readonly, owner phase never returns to open, facts and pending evidence are retained. Do not report atomic saving or current authorization from that historical result. Physical disk-flush/power-loss guarantees, actual production credentials/routes, normal consumer restart, real binary/Cloud restoration and live rollout are unprovided.

Unknown/legacy/nonempty material, incomplete pending pairs, receipt corruption, manifest mismatch, competing intent or orphan pins are neither normalized nor deleted. Initial consumer/registry bootstrap is explicit test setup only; existing unknown rows reject. Existing normal resume/publication and migration/Pro/old-writer/binary/final-admission guards are not weakened.

## Required counterexamples / acceptance map

| User case | Direct coverage |
|---|---|
|1 old valid lease + pointer request; 4 old save after stop; 25 normal readonly transition|Port normal old-lease cutover + Worker stop/consume tests|
|2 issue vs cutover; 3 in-flight save vs stop|Worker concurrent issue/stop; prepared old save; prior SQL winner classified; actual D1 stop final-owner race|
|5 stop ACK loss; 6 unknown stop|Port/Worker ACK-loss reconciliation, timeout, native fence-unknown|
|7 pointer CAS; 8 pointer ACK loss|Port competitor/Authority ABA, typed publication, reopen + explicit confirm|
|9 Account switch; 10 credential revocation|Account ABA/B switch, expiry/revocation before publication, native equivalents|
|11 delayed A + normal B|Port delayed response protects B Account/Authority and prepared local/backend operations; actual D1 B continues|
|12 Authority ABA; 13 Consumer ABA|Epoch/pointer/registered-state mismatch, no implicit repair|
|14 backend-only; 15 local unknown|Explicit original-generation recovery; typed result after lost local ACK; native reopen|
|16 missing backend;17 tampered backend;18 local mismatch|Receipt integrity rejection before publication|
|19 missing backup;20 source manifest mismatch|Exact pin pairs/baseline/full-source checks|
|21 same op different digest|Immutable transition/pin/owner-row conflict|
|22 crash/reopen;23 tabs|Durable local stop/owner stop/staging/publication/confirm phases and concurrent explicit intents|
|24 no explicit intent|Begin/recovery/publication/confirm reject absent/false explicit|
|26 Shared Write OFF;27 canWrite=false|Every public result and unchanged normal Studio readonly boot tests|

Node, local workerd/disposable D1 SQL, real Chrome IDB/Web Locks/reopen, Studio readonly/cache, exact metadata, existing Git safety fixtures and supplementary exact cross-owner scope gates are required. New scoped tests and existing regression results are recorded separately in repo-external evidence. No assertion/timeout is loosened. No new performance, OS-native IME, Safari or real-printer acceptance is claimed.

Next minimum: owner-qualified, explicit **re-admission of one registered readonly consumer** under the new pointer/epoch (still isolated), with resolved transition/partial outcomes and unchanged old-writer/binary/final-admission conditions. Production consumer connection or release requires separate approval; this phase never auto-starts it.
