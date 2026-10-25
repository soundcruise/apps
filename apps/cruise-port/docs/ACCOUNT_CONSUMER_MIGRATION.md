後続の [Pointer/Consumer Cutover fixture](OWNER_POINTER_CONSUMER_CUTOVER.md) はPort ownerのBPM専用fixture ID間だけをreadonly選択します。本書の通常Port/Shared/Studio consumer inventoryは未cutoverのまま維持し、通常writer/Cloud/本番認証を有効化しません。

後続の隔離Account物理移行・Port原本保全は [ACCOUNT_PORT_CUTOVER](ACCOUNT_PORT_CUTOVER.md) を参照。以下はPR #12時点のconsumer契約。通常writer/Cloud本番接続は未実施。

# Isolated Account consumer migration v1

Studio 0.47.6 / Port 1.24.9 candidate; StudioProject schema2 unchanged.
Dependency: PR #10 -> PR #11 -> this topic. No production installation or router
activation. Studio remains 0.x.y until explicit first-release approval.

## Implemented surface

Shared `account-observation-consumer.mjs` is an import-pure, explicit dependency
injection adapter over the existing Port owner provider. `read()` requests a new
nonce-bound primary observation through the official AccountClient; `current(view)`
asks that SAME provider to recheck the opaque canonical Account context and the
Authority Control/pointer after asynchronous consumer work. The provider keeps the
context private. Consumers receive no credential, source token, writer or receipt
mutation capability. `peek()` reevaluates the owner's observation budget on every
call. `dispose()` only releases this consumer; it does not stop a shared owner.

Only owner-confirmed-at-read observations with positive Account/member/credential/
runtime generations and the known false authorization flags qualify for DISPLAY.
PR #10's summary/devices-only projection is insufficient and is refused. Missing,
unknown, delayed, mismatched, disposed or expired evidence produces unconfirmed;
there is no legacy fallback. Concurrent responses cannot replace a newer view.

`createSyncCenterController({config:{enabled:true},isolatedAccountConsumer:reader})`
uses the existing controller's new explicit readonly branch. It never constructs
another AccountClient or calls legacy getAccount, clearAccount or Port credential
readers. `accountState` remains unknown, app/device action lists remain empty,
setup planning is unavailable and all write/sync flags remain false. Existing
SyncCenter UI therefore cannot treat observation as active Account authorization.
This intentionally does not fabricate the missing summary/devices feature data.

`createPortDataHost({connect,schema,isolatedAccountConsumer:reader})` uses the same
Shared reader instead of the legacy Account/meta and Sync qualification readers.
The existing Port dataset and Pro readonly connection remains independently usable.
Before publishing it rechecks the opaque source after dataset/Pro awaits. If that
check fails the Account/member observation is removed, while independently local
Port data may still be displayed. Account evidence never sets sync='synced', grants
Pro, or feeds save admission. enableLocalWrites/activateSync return blocked without
acquiring a writer. Cached observation expiry clears displayed identity/generations.
The Studio display projection explicitly labels server generations as as-of-read.

Neither normal entrypoint supplies the optional reader. There is no automatic
schema cutover, provider network request, Account creation, runtime ensure/provision,
Cloud start or authentication switch. Existing normal Port and Studio defaults are
retained. Tests explicitly inject the reader into the ACTUAL controller and Host,
including the real readonly Port connection/dataset reader in native Chrome.

## Identity and authority namespaces

| Value | Proof source | Meaning / limit |
|---|---|---|
| Account identity/device | Canonical owner capture + current server owner snapshot | Exact pinned credential, never exported |
| Durable Account revision | Existing full mutationStore context/marker/journal | Opaque equality checks, not server generation; no new store |
| Account generation | Single primary server Account row | As-of-read server value |
| Membership generation | Same primary joined Port membership row | Must match pinned Authority identity; no auto-adoption |
| Credential version | Current device DB rotation version | Not sca1 format, not an expiry |
| Authority generation/Control/pointer | Existing owner hydrate and transitions | Local durable stop/recovery barrier |
| UI notification generation | Existing Shared storage hint | Earlier invalidation only; never sole proof |
| Observation budget | Server 5000ms budget minus local wall/monotonic elapsed | Historical read limit, NOT auth lease |

`credentialExpiresAt` remains null. A retained frozen response cannot self-expire
and is not a capability. Call current after awaits; call peek for current display.
Even current=true is a read-result check, NOT transaction admission or an ACL.
Same-origin raw writers may alter known stores or restore Account/journal bytes;
this work does not claim to completely reject them. Checks cannot close a raw-write
race after the last read. No protected mutation is exposed through this surface.

Terminal responses retain the owner's atomic Authority stop-intent transaction.
Account DB and Authority DB remain separate; no cross-DB transaction is assumed.
Consumers never clear/replace Account, manufacture mutation receipts, confirm a
transition, replay an operation or resume a stopped Control. Late A must not stop
or overwrite B. Canonical receipt/history and B's prepared operation are preserved.

## Complete static consumer inventory and migration status

Inventory covers normal JS/MJS uses of AccountClient, accountRoot, accountClient,
SoundCruiseSyncAccount, plus the owner definitions. No unrelated app code is changed.

| Owner / normal path | Current dependencies | This topic / remaining gate |
|---|---|---|
| Shared AccountClient request/summary/devices/memberships | Existing authentication client, canonical storage | Reused through Port provider + new readonly consumer, fixture-only; normal construction unchanged |
| Port SyncCenter controller | AccountClient summary/devices, legacy Account/meta, terminal cleanup | Explicit readonly observation branch migrated; normal detailed summary remains legacy |
| Studio PortDataHost + display projection | Port dataset reader, local Account/Sync metadata, independent Pro reader | Account status branch migrated under explicit injection; default boot unchanged |
| Port SyncCenter UI | Controller presentation, orchestrator callbacks, edition/capabilities | Existing renderer compatibility verified; no new action handlers or orchestration installed |
| Port SyncCenter orchestrator | Account start/recovery/rotate/revoke/delete/detach, setup, handoff, join; resume can WRITE | Retained legacy; not supplied by new consumer and not qualified for formal writes |
| Port port-account-join | Pending Account persistence, issue/consume/cancel/reopen | Retained legacy; pending/CAS/cutover migration required |
| Port port-sync-controller reader/owner | Reader cached state vs owner ensure/provision/sync/conflict/assets | Readonly reader/dataset reused; owner/runtime not activated or migrated |
| Port AI Support client | Account credential + Pro credential; support POST | Retained legacy; cannot use new observation as send authorization |
| Port account-writer-participation | Existing coordination, mutation store, intent/receipt | Kept; no normal installation or gate change |
| Shared AccountClient writer methods | 17 local participation paths plus remote mutation/handoff/join APIs | Existing writer protocol retained; new reader exposes none of these |
| Shared multi-app-sync-bootstrap/runtime | AccountClient/storage, handoff/join/confirm/detach, provision/push/pull | Retained legacy; never start from observation |
| Shared chord-account-bridge | Account+app credentials, prepare/finalize/rollback dual operations | Retained legacy; transaction/backend migration needed |
| Shared sync-app-backup | App runtime/backup data | Retained; no new backup/import or binary write path |
| Shared sync-account-core/db | Credential parsing, canonical storage/writer participation | Definitions retained, no second store or new auth |
| Chord sync-account-orchestration / sync-client / sync-pairing-ui | Account summary/storage, join/handoff, bridge/runtime | Retained legacy; no automatic consumer switch |
| Pitch/Fretboard/Rhythm sync adapters | Shared runtime + app data/credentials | Retained legacy; no product edits, new authorization or Sync activation |
| Studio default port-data/connection | Legacy schema reader + Port dataset/Pro cached reader | No protocol3 auto-follow; Host bypasses legacy Account/localStatus ONLY when explicitly injected |

"Retained legacy" does not mean those existing production APIs were globally
revoked or hardened. It means this isolated surface cannot reach or authorize them,
and no production rollout of the migration is permitted yet. UI hiding is display
compatibility, NOT the durable protection. The durable stop/CAS/receipt remains in
the existing owner; backend final transaction reauthorization is still required.

## Compatibility, tests, rollout gates

Versions/cache follow exact changed ESM importer edges: controller plus its UI,
navigation and orchestrator importers get the Port release key, then the existing
entry key. Unchanged logic and keys stay unchanged. Shared classic files and
external apps' HTML references are untouched. No schema or stored row is rewritten
by merely loading existing Projects/Account data.

Targeted Node uses actual AccountClient + owner SQL fixture + native-IDB-compatible
fixture; actual controller and Host tests cover missing proof, full-source changes
without notice, generation mismatch, expiry/rollback, delayed/double responses,
late A success/terminal vs B, receipt/prepared operation and stop/reopen.
Native Chrome uses two renderers, dropped BroadcastChannel, real readonly Port
connection and actual SyncCenter renderer, isolated primary owner transport, crash/
reopen, Console/404 and forbidden-transport assertions. Existing Account receipt/
intent/old-writer/Pro safety and legacy controller/Cloud/cache/UI cohorts remain.
No assertion/timeout is relaxed and no production credential is used.

Before formal consumer installation / save activation:

1. Deployable owner route must have reviewed router/CORS/rate/auth policies. Current
   owner-context core remains UNROUTED, fixture only. 5s observation is no credential
   expiry; issuance/renew/expiry and backend transaction reauthorization need their
   own approved owner contract and tests.
2. Approve canonical legacy consumer cutover, all pending rows/receipts, enrollment,
   raw writer limitations and interrupted migration/reopen. Unknown data is kept.
3. Complete binary transfer/reference durability, migration recovery and generation
   binding without data loss; receipt cannot substitute for missing binary proof.
4. Final Account/Authority/Pro/backend admission must be atomic at each owner's
   real commit boundary. No DB-spanning atomicity fiction. Separate authorization
   is required for normal writers, Cloud, Shared Write or production auth changes.

P3 retirement-only Issue #3 remains separate. Real credentials, Safari, OS IME,
hardware power-loss and production authentication were not tested by these fixtures.
