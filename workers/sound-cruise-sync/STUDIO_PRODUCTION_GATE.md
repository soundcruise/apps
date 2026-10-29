# Studio Production release gate candidate (No Deploy)

Studio frontend 0.49.1 / schema2; exact PR #56 dependency. The new `src/studio-production-entry.js` and `wrangler.studio-candidate.jsonc` are candidate artifacts only. Existing Wrangler/main entry and byte-pinned v137 remain unchanged. No production resource or release gate adoption is authorized by this document.

## Bundle and server gate

The entry delegates all non-Studio requests to exact v137 via the existing proof-aware Scheduled wrapper. `/isolated/studio/*` is never public. The public document route is 423 unless server `STUDIO_RELEASE_ROUTE_ENABLED` is the literal string `true`. Even then an exact policy object and its canonical SHA256 must match: `id`, `limits`, `rate`, `evidencePolicy`, `retentionPolicy`, `allowedOrigins`. This hash proves configuration consistency, not operator approval. No client header/query/cookie can supply server configuration. Invalid policy returns 503 HOLD only for Studio. The D1 activation table remains authoritative; OFF maps to 423, canary constrains Account/device/dataset, final SQL guards include current activation/Owner/Pro/epoch. Unknown/partial schema remains rejected. No public activation mutation API is added.

The server validator reuses the actual Studio schema2, music theory, Chord theory and offline native Rhythm snapshot reader. These pure model definitions initialize once; no Project/request is stored in the module host. Missing Rhythm support was found by independent review and fixed before acceptance.

Candidate config differs from current Wrangler only in `main` and explicit route-disabled variable. Existing compatibility date, bindings, limits and cron are retained. New production binding allocation, server policy values, observability/traces and permission changes need separately reviewed configuration. Account/Pro pepper, Turnstile secret and limiter bindings use their existing contracts; never put values in policy, logs or manifest. Studio document/registration IP limiter bindings are additionally needed before enabling the route. Do not reuse shared whole-app write flags as activation.

## DDL

`studio_0001_rc4`, 83 objects, canonical hash `9fe8c42228f08df58c165d616780a252b45d7b58590ead1c70e394f6f3de00a9`. Exact shared0033 schema/journal and fresh Studio namespace only; one guarded native D1 batch. Duplicate/partial/unknown schemas refuse; do not blindly rerun SQL. Shared0034–0037 are not required. Existing migration files in ancestor commits are not approval to apply them.

## Coexistence, drain and rollback

Before any Studio enrollment, OFF candidate plus empty Studio schema can preserve legacy traffic; no global shared-writer cutover is assumed. Pure Studio DDL adds namespaced objects, not shared triggers. Final schema assertion and application commit must remain one batch. This does not prove arbitrary external SQL safe.

Before first canary, old v137 Scheduled and in-flight Account cleanup can remove native recovery evidence without the new wrapper. Prove old deployment/Version URL/override/service callers cannot bypass the candidate and that old cleanup has converged; a cron disable or fixed delay alone is insufficient. HTTP/Account recovery/deletion and external SQL affecting shared proofs must also be coordinated. Cloudflare metadata cannot enumerate all past/in-flight writers. If convergence cannot be proven, canary HOLD; do not claim first-handover acceptance. No automatic rollback to unprotected v137 after Studio native proofs exist.

## Backup and independent restore runbook

Separate approval required. Define a writer-quiescence window covering shared HTTP, old Scheduled, version overrides, external SQL and asset cleanup. Stop admission before new claims. Record pending/unknown operations and R2-deleted/D1-unconfirmed states without repairing them. Prove drain using operation outcomes and bounded in-flight evidence; unknown outcome stays HOLD. Take an encrypted D1/schema/journal and R2-object manifest at the agreed cutline; D1/R2 are not an atomic snapshot. Keep encryption keys in an independently approved store and custody, not next to ciphertext. Never use a plaintext SQL export as the default deliverable. If the approved tool cannot avoid plaintext staging, secure staging/erase requires explicit approval or stop.

Restore into fresh isolated D1/R2 with separate keys/access. Verify every table/chunk/object hash, journal/schema/marker, Account/Pro generations and native proofs, Port/4-app references, Studio head/receipt/checkpoint/tombstone. Preserve the original backup. Any partial restore or mismatch marks the target UNKNOWN/PARTIAL; do not retry into the same target or overwrite Production. Whole-D1 restore can lose normal Account B/other-owner updates after the cutline; prohibit automatic rollback. R2 restore is separate, not implied by D1 restore. Synthetic encrypted backup + separate-process restore are test evidence only.

## First recommendation for operator decisions (not applied)

Canary: 1 operator Account, 2 dedicated devices, explicitly listed datasets, 48 hours, 10 documents, 64 MiB stored chunks, 64 active operations, metadata512 rows/4 MiB, 120 Account requests/60s. This allows two near-maximum documents and bounded history; HOLD/429 retains outbox. No unresolved UNKNOWN/proof automatic purge, and Account maintenance stays prohibited in canary. Threshold alerts at 70%/90%, stop at repeated auth/CAS/receipt/schema/restore anomalies. Numeric values are candidates, not entitlement or approved fixture policy.

General: begin at the same safety caps pending real canary CPU/memory/cost evidence; propose 20 documents/128 MiB only after measuring. Do not promise unlimited use or approve general launch when deletion requests/UNKNOWN cannot be handled. Document/metadata/device exhaustion requires explicit safe resolution or operator HOLD. Logical capacity and stored-history capacity differ. Tombstones and receipts retain current-head safety; expiry alone never proves deletion safe.

Proposed deletion intent lifetime24h, verified request acknowledgement within72h and processing target30d, backup7 daily +4 weekly generations, two custodians for recovery keys, RPO24h/RTO8h, canary incremental cost stop at USD10 or operator-approved lower cap. These require operator/privacy/legal and restore feasibility decisions, not assertions of current service guarantees. Costs need current account plan and measured D1/R2 usage. Pending/UNKNOWN cannot be assigned a destructive TTL; resolution ownership and escalation remain mandatory. Scheduled HOLD alerts operator immediately; inspect exact cause, never loosen schema/proof guards.

## Measured vs unmeasured

Test results are recorded in repo-external task evidence. The assembled entry is exercised by the actual UI scenario with synthetic environment/Turnstile responses and native workerd/D1; a byte-identical standalone bundle additionally rejects OFF, fixture path and client enable attempts. Legacy/Scheduled regressions import this new entry with route disabled. Native migration/backup tests reuse exact current DDL. CPU and isolate peak memory, real Safari/OS/devices/network, real Pro/Turnstile and Production restore remain unaccepted.

Before general launch: Safari manual new-profile registration/kit custody, offline/IDB restart, 2-tab CAS, native Rhythm/max Project, real-key loss/recovery, UNKNOWN/discard/adoption, tombstone/local preservation, canary exclusion/kill. Browser console has no unexpected error, no forbidden destination, and no local/outbox loss. Worker canary must measure CPU (not wall time), peak memory, query/request bytes and D1 usage/concurrency with margin to current plan limits; stop on limits/unknown outcome. Do not infer these results from local Chromium.

## Release order

Approve exact policy and configuration/backup window → fresh metadata/first-handover gate → encrypted backup and independent restore → Studio-only fresh DDL → candidate OFF deployment/readback → scoped canary with old-writer exclusion → Safari/devices/resources → dependency-ordered publication with current main/NEWS preservation → explicit general activation. Separate approvals are required for backup/export/restore, DDL, Worker/Secrets/limit bindings, canary, merge/Pages and general activation. No automatic progression. PR33/v2 formal protection HOLD remains; no v3 adoption is implied.
