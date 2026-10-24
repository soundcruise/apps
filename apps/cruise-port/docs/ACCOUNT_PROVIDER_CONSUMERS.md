後続の隔離consumer移行と現行0.47.6 / Port1.24.9候補は [ACCOUNT_CONSUMER_MIGRATION](ACCOUNT_CONSUMER_MIGRATION.md) を参照。以下はPR #10/#11時点の契約・履歴。通常起動・writerの本番移行は未実施。

# Official Account observation provider and consumer boundary v1

Additive follow-up: [Account owner generation/freshness](../../../workers/sound-cruise-sync/ACCOUNT_OWNER_CONTEXT_CONTRACT.md)
defines an unrouted isolated primary-snapshot API and `ownerContext:true` opt-in.
It obtains Port membership generations at-read and expires observations, never
grants writer admission or a credential lease. Default summary/devices behavior
below is retained; production route/normal consumer migration remains blocked.

Port1.24.7 / Studio0.47.4, StudioProject schema2. This is an explicitly isolated,
dormant extension. Shared Write OFF and Studio `canWrite=false` remain mandatory.
Studio stays 0.x.y until the user approves its first formal release. No normal
writer, Cloud runtime, credential issuance or production authentication changes.

## Owner API audit and actual limitations

The owner remains Shared `sync-account-client.js` / `AccountClient`, the canonical
Account DB and Port Authority. `summary(credential)` and `devices(credential)`
are the actual official methods used by the new Port adapter; no parallel client,
Account store, authentication or Sync engine is introduced.

Worker `account-app.js` `publicMemberships()` excludes `appId='port'` from summary
and memberships. The official devices response contains exactly-current-device
information including credentialVersion/revokedAt, but no Port membership
generation and no signed credential-freshness lease/expiry. Account generation,
membership generation, credentialVersion, local durable revision, UI notification
generation and Authority generation/pointer epoch are different namespaces.
Never derive one from another. The two reads are not a server-atomic snapshot.

Even authenticated GET may call normal Account authentication's last_seen/activity
touch. Consequently this extension MUST use the supplied isolated transport; no
production credential or endpoint is used in its tests or production smoke.

`projectOfficialAccountObservation` accepts the official Account+devices shapes,
checks matching Account ID, positive server Account generation, exactly one
current nonrevoked device matching the pinned Account device ID and positive
credentialVersion. It validates and copies public app memberships without copying
unknown data or credentials. Port membership remains null, expiry remains null,
freshness is observed-only. Missing, duplicate, malformed or incompatible data is
unresolved, never inferred. Unknown Port member payload is rejected rather than
being treated as a newly authorized API extension.

## Isolated connection and barriers

`createIsolatedPortAccountProvider` requires the existing branded privileged
Authority fixture scope, explicit Account owner mutationStore, existing Shared
notification source, AccountClient constructor and injected transport. Construction
opens only that isolated Authority store; it does not fetch, migrate Account DB,
create an Account or install a product consumer. Normal unbranded scopes refuse.
Tests explicitly enroll/cut over their disposable canonical Account DB to protocol3.
No production v1 database is enrolled, renamed or auto-followed by this change.

Before a refresh, the provider captures the existing owner API's opaque full
Account+journal+marker+fence+bootstrap context and exact Authority Control/pointer.
Authority must be active, bound to the same Account and have no pending recovery
intent. Full durable-source and Authority comparisons are repeated after awaits
and immediately before publishing. Notification generation is only an earlier
invalidation hint. Missing notifications, Account byte changes with the same key,
cooperative revision ABA, stale generation and disposed instances refuse results.
Only the newest successful observation may publish; terminal responses for the
same pinned source are not discarded simply because another refresh was newer.

An official terminal response for a still-current exact source invokes the existing
`beginAccountTransition` transaction with kind=revoke and pinned identity/Control/
pointer epochs. That transaction atomically persists the stop intent and Authority
invalidation. This provider does NOT clear/replace Account, create a mutation
receipt, confirm an intent, resume Control, move ownership or replay any operation.
An old A cannot select a new B by Account ID alone. A source mismatch stops neither
B nor its prepared operations; the Authority transaction independently refuses an
obsolete generation/identity/epoch. Account and Authority DBs are still separate.
Unattributed raw writes are NOT promoted into a cooperative Account transition.

Stop failure returns recovery-required/stopProven=false, retains a same-runtime
terminal latch and grants nothing. A successful durable stop blocks reopening even
if a subsequent transport incorrectly returns success. If a crash happens before
stop commits, no durable terminal fact is claimed: reopening still grants no
authorization, continuity, writer or resume permission. Historical receipt reading
returns only mutationProven and recoveryRequired, never success/admission.

Every state has authorizationConfirmed=false, operationAuthorized=false,
continuityProven=false, recoveryRequired=true, canWrite=false. An observed UI state
is an as-of-read report, not a continuously fresh capability. Arbitrary same-origin
raw writers can still modify known stores or roll back bytes/metadata; neither this
adapter nor local checks are an IndexedDB ACL. No normal write consumer is exposed.

## Consumer inventory / migration status

| Consumer | This change | Continuing boundary |
|---|---|---|
| Port owner observation facade | Explicit `createAccountObservationConsumer`, only status/refresh/subscribe | Fixture opt-in, no client/source token/writer exposure |
| Studio readonly display projection | Pure `account-provider-projection.mjs`, exercised through actual provider fixture | No default Host/boot replacement, Port member/freshness remain unknown |
| Port `sync-center-orchestrator.js` / controller | Unchanged legacy AccountClient/storage route | Account create/recover/delete/detach and terminal cleanup not migrated |
| Port `port-account-join.js` | Unchanged legacy join persistence | No bootstrap/provider qualification replacement |
| Port `port-sync-controller.js` | Unchanged owner reader/runtime | No ensure/provision or normal writer activation |
| Shared AccountClient local writer methods | Existing #8 injected participation adapter retained | All 17 writer paths still require approved normal installation |
| Shared `chord-account-bridge.js` | Unchanged legacy bridge | No migration of dual-commit/rollback |
| Shared `multi-app-sync-bootstrap.js`, app consumers | Unchanged legacy AccountClient and storage | No independent Sync engine or implicit cutover |
| Studio `port-data/connection.mjs` / Host | Existing default legacy readonly inspection retained | Unsupported Account schema remains an error; no automatic protocol3 follow |

Existing Account DB v1/meta and normal Port behavior remain untouched. Known old
v1/v2/meta writers are fenced only in explicitly cut-over fixtures. Same-origin
new-store-aware raw access is not claimed completely refused. Existing data is not
deleted or overwritten; unknown receipt/schema state never triggers migration.

## Next save gates (no activation in this change)

1. Owner-approved authoritative Port membership identity/generation and trustworthy
   current credential qualification, with exact source binding and server admission.
2. Complete normal provider installation / legacy consumer migration, including
   pending rows, initial recovery, noncooperating writer and cutover policy.
3. Migration and binary durability/recovery across crashes, exact generation and
   canonical ownership, without losing existing user data or normal B.
4. Final Account/Authority/Pro/backend transaction admission; explicit separate
   approval before normal writers, Cloud or Shared Write are enabled.

P3 retirement-only Issue #3 stays separate. These fixtures are not real Account
authentication, a production cutover, Safari, hardware power-loss or real IME QA.

## Acceptance

Node covers official response shapes, exact source/revision ABA, late A/B, durable
stop/reopen, overlapping requests, timeout, corrupt receipt, aborted stop, ordinary
scope rejection, immutable public output and no Account/Authority mutation on reads.
Native Chrome uses separate loopback/profile, disabled cross-tab notifications,
two renderers, actual IndexedDB stop acknowledgement loss and renderer close/reopen.
Existing receipt/intent/old-writer/Pro/Evidence tests remain required for the touched
boundary; assertions/timeouts are unchanged. UI cohort checks the unchanged normal
readonly path and cache identity, using only synthetic microphone input.
