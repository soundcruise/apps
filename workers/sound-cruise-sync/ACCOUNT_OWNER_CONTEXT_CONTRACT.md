# Account Owner Generation / Freshness contract v1

This is an **unrouted isolated API candidate**, not a deployed route or a new
authentication system. Existing AccountClient, Account DB, sca1 credential HMAC,
Port Authority, CAS/intent/receipt/tombstone/old-writer gates remain owners.
Studio0.47.5 / Port1.24.8 are internal maintenance candidates. Worker private
package0.1.0, configured compatibility2026-09-01, existing HTTP contracts/config/
migrations remain unchanged. No Worker version is deployed by this change.

## Proof sources / independent namespaces

| Fact | Owner / proof source | Validity |
|---|---|---|
| Account ID, exact credential/device source | Canonical local Account DB opaque capture plus actual sca1 parsing/HMAC owner verification | Local source must be reread after awaits; no grant |
| Local durable Account revision | Shared journal/marker/fence/bootstrap CAS snapshot | Local ordering/integrity only; not server generation |
| Account generation | `sync_accounts.generation` in the primary SQL snapshot | At-read, never synthesized from UI revision |
| Port membership ID/generation/state | `sync_account_memberships` for exact Account/app=port, same SELECT | At-read, active/nondeleted, exact Authority identity required |
| Device linkage | Same SELECT EXISTS: current Account device linked to nonrevoked Port app device belonging to that membership's user | A relation, not Pro or final app authorization |
| Credential rotation version | Current `sync_account_devices.credential_version` after exact HMAC verifier comparison | Not sca1 token-format version=1 |
| Credential liveness | Same-row verifier, revoked_at and Account state, production provenance | Confirmed at SQL read; later revocation remains possible |
| Observation validity | Owner clock started before query, max5000ms, consumed by SQL/crypto time | Bounds observation age; never an irrevocable credential lease |
| Authority generation / Control / pointer epochs | Existing Port Authority DB | Separate local scope; cannot be silently updated from response |
| UI notification revision / local wall/monotonic clocks | Renderer | Invalidation/elapsed-budget reduction only; cannot prove server state |

Current Account devices have **no credential-expiry column or renewal endpoint**.
`credentialExpiresAt=null` accurately represents this. Observation expiry tests do
not claim the Account credential expires or has gained a new renewal mechanism.

## Server read contract

Proposed GET `/v2/accounts/owner-context?requestId=<uuid-v4>&challenge=<uuid-v4>`.
Both fields are client-generated request binding only, never a server generation
or identity assertion. Extra/duplicate parameters or other methods refuse.
Bearer credential travels only through the existing AccountClient request header.

`readAccountOwnerContext` creates a fresh `withSession('first-primary')` and issues
its first/only statement as the joined Account/device/Port membership/runtime
read. It ignores bookmarks and has no unconstrained/replica fallback. Missing
session support refuses. Use the existing credential verifier's exact HMAC,
timing-safe comparison and terminal Account-state decisions. There is no
last_seen/activity touch, qualification issuance, Account revision increment,
receipt, D1 mutation or other side effect. Normal auth still touches activity as
before; its SQL and behavior stay unchanged.

The SELECT uses LEFT JOIN membership, so an unlinked/missing/inactive Port member
is unresolved, NOT a credential revocation. It requires production provenance,
Account read gate enabled in cohort/open, positive runtime generation, positive
Account/member/credential versions, active nondeleted membership and exact device
link. Unknown/unsafe/null/string generation values refuse.

Response includes contractVersion1, purpose=account-owner-observation, echoed
requestId/challenge, exact IDs/generations/credentialVersion, snapshotStartedAt,
observedAt, expiresAt=start+5000, remainingMs=expiry-observed, runtimeGeneration.
Clock rollback, nonfinite time, server work exceeding budget or storage failure
refuses. Always `operationAuthorized=false`, `canWrite=false`, Cache-Control
no-store. No credential/verifier/pepper, reusable signed bearer token or server
write capability is returned.

Cloudflare's first-primary means only the first query is sent to primary; later
queries are sequentially consistent and need not reflect latest state. The single
joined SELECT is therefore essential. Verified documentation:
https://developers.cloudflare.com/d1/best-practices/read-replication/
https://developers.cloudflare.com/d1/worker-api/d1-database/

Read liveness has a linearization point at the SELECT. Revocation immediately
after it may occur before the response reaches the client: that response is still
a bounded historical observation, NEVER current mutation admission. Native D1
tests intentionally exercise this case rather than hiding it.

## Client / Port consumer boundary

The additive Shared pure wrapper uses existing AccountClient.request, without
changing summary/devices, the classic client or existing HTML imports. PR10's
Port provider explicitly opts in with `ownerContext:true`; default remains false.
No normal product entrypoint opts in. Only branded isolated fixture scopes can
instantiate it and all network transport remains fixture-injected.

The provider pins the entire canonical Account/revision and Authority snapshot.
Server Account/member ID+generation must equal the pinned Authority identity;
changed or missing generations remain unresolved, not automatically adopted.
Only a current request nonce/source may publish; notifications are supplementary.
The renderer subtracts elapsed monotonic AND wall-clock cost conservatively from
the server-owned remaining budget. Local clocks only shorten/reject observations;
they do not set server time, server generations or credential expiry. Cache reads
actively check expiry even if no timer/event fires. Clock rollback/realm change/
invalid time expires irreversibly; moving the clock back cannot revive that entry.
A new valid request/nonce can obtain a new owner observation, never renew an old
response by copying its data or changing its deadline.

The public frozen returned object remains an as-of-read record. It cannot expire
itself and `getCachedStatus` cannot synchronously reread IndexedDB. Neither cached
status nor a retained returned object is a current Account credential or writer
gate. All flags remain authorizationConfirmed=false, operationAuthorized=false,
continuityProven=false, recoveryRequired=true, canWrite=false. Reopen gets no
inherited in-memory observation. A pending durable stop still blocks rereading.

Credential terminal responses retain PR10's exact-source persistent stop-only
Authority transaction, runtime latch and latest-response protection. No Account
clearing, receipt creation, confirm/resume or automatic CAS retry. Delayed A with
the same Account ID but a different credential cannot stop/overwrite valid B,
its existing mutation receipt or prepared operation. Before-stop abort/crash has
no durable terminal fact: no authorization or automatic recovery is inferred.

## Production dependencies deliberately NOT implemented

1. Registering the new route must use the existing Account router's allowed
   origins/method/preflight, rate limits, runtime policy and production admission.
   QA support, if desired, requires the existing QA owner policy and identity;
   this production-provenance contract refuses QA, never treats it as production.
2. Decide and deploy a server-owned credential lease/expiry policy only if a real
   lease is needed. This change does not invent such a credential or offline proof.
3. Normal consumer migration/provider installation and old-writer/cutover policy
   remain blocked; old summary consumers continue unchanged.
4. Final mutation admission must authenticate the actual current credential and
   atomically recheck current Account/member generations, Pro/app/device rights,
   operation binding, tombstones, writer protocol, migration generation and write
   epoch in the real server transaction. This observation is not its replacement.
5. Migration/binary durability/recovery remain separately required. Account DB and
   Authority DB still do not share a transaction. Same-origin raw IndexedDB writers
   can forge/rollback local metadata; no local reader is an ACL. The backend must
   ignore client-provided generations/observations as authority and validate its
   own current records. No Shared Write/Cloud/normal writer activation here.

## Tests and guarantee limits

Actual SQLite schema/queries and existing HMAC verification, local native
workerd/D1 sessions and changed/late/revoked states, browser native IndexedDB
requests through an isolated HTTP owner fixture, dropped notifications, same-ID
credential rotation B receipt/prepared preservation, crash/reopen, expiry/rollback,
malformed proof and legacy consumer compatibility are required. Server fixture
setup writes only synthetic local databases. No real credentials, production
endpoint, secret, remote D1/R2/Worker operation, Safari/OS power-loss/real IME claim.
