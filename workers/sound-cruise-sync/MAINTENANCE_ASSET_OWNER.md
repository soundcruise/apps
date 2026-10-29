# Isolated Maintenance Asset Owner (PR37 dependent)

No normal app/index import, no deployed route/config/schema change. Shared Write OFF,
canWrite=false, ordinary consumers/writers and Cloud remain disconnected. No public
asset/version/cache changes: this is an explicitly constructed, private test capability.

## Exact HTTP scope

| Method | Existing path | Isolated contract |
|---|---|---|
| POST | /v1/sync/assets/prepare | Existing quota/Asset operation repository; final Account/member/device/Pro/dataset/writer fence and row-count assertions |
| PUT | /v1/sync/assets/{uuid}/content | Bounded 6 MiB subset, exact binary/headers fingerprint, native format/size/hash validation; durable per-Account external pending BEFORE R2; guarded markUploaded |
| POST | /v1/sync/assets/commit | Existing head/readback + repository lifecycle CAS; final Owner and exact Asset row assertions |
| GET | /v1/sync/assets/{uuid} | Managed Port only, exact Asset identity, no response binary/credential retained in Bridge receipt |
| POST | /v1/sync/assets/unreference | Logical state only; all requested row CAS updates required; never R2 delete |

Maintenance invocation UUID is separate from the Asset business operation UUID shared
by prepare/PUT/commit. HTTP root fingerprint includes device and Pro authorization,
body bytes digest, content type, claimed hash, Asset operation ID and writer headers.
Unknown/legacy/QA owners fail closed. Larger supported native assets remain outside
this isolated bounded upload subset. This adds no production HTTP endpoint.

All writes use schema0037 because native writer SQL requires generation-bound cutover
columns. 0033/34/35/36 writes HOLD, not inferred compatible. Native download is a
read-only subset at0033 with guarded authentication activity. Owner candidate schema
is not in Bridge's exact base profiles and is HOLD, including partial application.

## External boundary and recovery

Caller explicitly provides a per-Account external scope with verified isolated
stop/handover/open evidence. It cannot equal writer/security scope. Scope creation,
handover or production activation is never automatic. Pending on A must not consume
B's separate scope. A single unresolved external in an Account serializes its R2
operations; it does not authorize unrelated mutation or credential revival.

Upload stores the immutable source manifest/object identity/operation binding in
existing Bridge metadata before PUT. Its D1 markUploaded batch asserts that exact
external pending plus Owner generation, device, Pro SQL expiry, dataset readiness,
Maintenance epoch and writer fence. R2 success alone never confirms D1 success.

External pending is retained even on HTTP success. Explicit reconcile reads facts;
optional resolution requires external scope CLOSED and current Owner/Pro/Asset/
dataset SQL assertions. Only already-uploaded/available/unreferenced D1 state with
matching R2 size/hash metadata can resolve the pending. It does not reconstruct
credentials, repeat PUT/DELETE, clear backup or silently repair prepared state.
Prepared D1 + R2-present, missing R2, changed generation or contradictory receipts
remain HOLD/UNKNOWN for a separately specified Owner repair. Reopening the scope
requires existing core handover/open admission; no automatic reopen.

The final SQL assertion linearizes D1 authorization, not physical commit expiry.
SQL and R2 are non-atomic. A stop/revocation after the last R2-precheck may allow a
physical R2 side effect; subsequent D1 rejection leaves durable pending/claim. This
fixture does NOT prove a production lease/fencing guarantee across that gap.

## Scheduled subset

`createIsolatedMaintenanceAssetScheduled` is a separate factory, NOT the normal
Scheduled handler. The caller supplies the existing trusted Asset Owner verifier,
exact owned Asset digest and SQL assertions. No production scheduler service identity
or new authentication issuer is supplied by this factory.

Only owned unreferenced Assets older than30 days and schema0036/0037 are considered.
Before a new deletion: verify schema and handover; reject invalid JSON/any live Asset
ID string reference across datasets; persist external pending; use the existing
repository to create a permanent cleanup reservation with Owner+Maintenance+
pending assertions in the SAME D1 batch. Validate claim and current Owner before
one R2 delete. Success still returns external_pending; exceptions return unknown.
The same operation cannot execute a second delete, including another instance.

Reconcile only HEADs the immutable reserved key. If present/unknown/conflicting,
keep pending. If absent and still valid, explicit scope stop + Owner-proven recovery
can complete existing repository lifecycle, release claim, create typed recovery
receipt and resolve source in ONE D1 batch. The Bridge optional business recovery
requires exact Owner-approved business outcome digest and only one wrapped batch;
no raw DB/metadata escape. It is external-only and closed-scope-only. All pending
metadata remains immutable after resolution. No automatic rollback or repeat delete.

Broad legacy Scheduled effects remain HOLD: Account dormant/purge, invitation and
recovery retention, lifecycle receipt deletion, change watermarks, tombstones,
deleted users, credential/lockout cleanup. Security admission lanes of existing HTTP
owners are unchanged. Registry empty/fixed wait cannot prove old cleanup drain.

## v137 / rollout exclusions

Before any real claim, an approved handover must exclude legacy HTTP writers,
version URLs/overrides, Scheduled triggers, external writers, old in-flight work,
partial results and unknown outcomes. The synthetic fixture proves only the contract
and local races, not real exclusion. Existing v137 ignores Bridge epoch. Once a
new claim/generation exists, rollback to v137 is prohibited without an independently
reviewed restoration plan. Never treat R2+D1 as atomic; never restore all D1 and lose
normal B/other owner post-backup changes. Encrypted backup/key custody, actual isolated
restore, R2 reference reconciliation, migration/journal and production permissions
require separate approval. No Production read or write is performed by this work.

## Coverage and release gates

84 existing HTTP +1 Scheduled. 71 HTTP isolated-connected,13 HTTP HOLD (Legacy7,
QA/old Bridge6). Scheduled is PARTIAL, not fully connected: Asset-only subset above;
broad retention/purge HOLD. These counts are not readiness percentages.
Full Bridge, v2 formal protection and PR33 HOLD remain. No v3 adoption.

Critical path: close/connect Legacy/QA compatibility; scoped retention/purge with
pending/receipt protection; real v137 ingress exclusion/drain; encrypted backup and
actual restore; approved migrations/default-OFF deployment; Owner clock/key/Pro
operations; BPM canary and multi-device Cloud E2E; Studio functional/performance/OS/
Safari/audio final acceptance. Studio feature work can proceed in independent clones.
