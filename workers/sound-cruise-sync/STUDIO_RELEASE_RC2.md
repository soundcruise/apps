# Studio RC2 — isolated operations and retention candidate

This candidate depends directly on PR #50. It does not activate a public route,
modify the v137 bundle, deploy, modify shared migrations 0034–0037, or release
PR #33's formal Git-protection HOLD. The independent clone's exact-scope gate is
not a B+C v2 protection acceptance. Studio/Port public versions are unchanged;
only the internal undeployed Studio schema candidate advances to studio_0001_rc2.

## DDL and rollout

`schema-candidates/studio_0001_rc2.sql` is the fresh-install replacement candidate
for RC1, never an in-place migration of RC1 data. The programmatic migration plan
executes its exact-0033 schema/journal assertion, all Studio DDL, independent
marker/journal, and disabled control in one D1 batch. Partial, unknown, already
installed RC1/RC2 databases refuse installation. Keep RC1 SQL as historical evidence;
do not apply both. Production DB has no Studio users; any contrary finding stops
rollout and requires a separately reviewed migration. Production manifests and
approval hashes must be regenerated from this candidate before deployment.

## Retention and authorization

No retention duration or physical purge is enabled by default. A trusted host may
inject exactly `{id, physicalDelete:true, minHistoryAgeMs, rateKeepMs,
intentLifetimeMs}`. No HTTP field, header or env flag supplies this capability.
All numeric values in tests are synthetic; none constitute an approved policy.
The release Worker stays default OFF without a fixture capability.

- `retention-plan` is an authenticated, account-scoped dry-run. It binds the exact
  pending/chunks/head/receipts/adoption/resolutions/enrollment observation and policy.
- `collect` retires superseded committed operation bodies (or an adopted source
  whose descendant is committed). Current live head and unresolved UNKNOWN are
  retained. Pending manifests, typed commit/adoption receipts, change metadata,
  and recovery proof remain for reconciliation and replay rejection.
- `discard` is a separate explicit current-Owner decision for an uncommitted
  operation. Any head reference, commit receipt, or source/destination adoption
  dependency refuses discard. A former device/generation needs the existing
  current-generation native recovery proof. Merely knowing an Account ID is not
  authority. A terminal resolution and audit receipt are atomic with body deletion.
- `begin`, `upload`, `commit`, and new `adopt` check terminal state, including a
  final SQL fence. A historical receipt never authorizes another write.
- UNKNOWN is never deleted by age. Missing bodies/keys/receipts keep recovery HOLD
  unless the current Owner explicitly resolves that exact pending operation.
- Tombstones and receipt metadata stay durable; stale writers cannot resurrect
  a deleted document. There is no background mutation of localStorage/Outbox.

`retention` recomputes bytes and pending-minus-resolution counts and compares them
with transactionally maintained usage counters. A mismatch is HOLD, not auto-repair.
Resolved operations no longer consume the active-operation quota; their minimal
replay/recovery metadata remains. This does **not** claim that unlimited growth of
retained evidence is ready for general release. Metadata retention/archive policy
and measured fleet-scale cost remain release gates. Neither old receipts nor
proofs are purged to make a quota test pass.

Account erase has two distinct steps. An authenticated current Owner with deletion
admission captures immutable intent, exact scope, policy digest, epoch and expiry.
A trusted internal job (no HTTP endpoint) may erase payload only after the native
Account is absent and every captured scope value still matches. Intent is an
explicit deletion mandate valid until its deadline, not an old credential; native
recovery does not silently cancel it. New data/enrollment, different epoch/policy,
expiry or absent intent causes HOLD. No legacy Account deletion is triggered by
this module. Erased-Account marker, pending/receipt/proof/intent/audit metadata
remain, enrollment is revoked, and an accidentally recreated Account ID cannot
use Studio authority. Unknown orphans without intent stay protected.

SQL authorization linearizes at the final assertion within the D1 transaction.
This does not prove physical commit before credential expiry, or atomicity with
IndexedDB. Post-commit activity/transport failure is UNKNOWN; reconcile is explicit.

## Scheduled boundary

The candidate wrapper delegates to the byte-pinned v137 handler. Only three known
DELETE patterns (recovery claim, lifecycle operation, Account purge) gain predicates.
It retains native recovery proof for an affected Studio Account until an equivalent
retained proof passes SHA256, result identity, generation and exact tuple checks.
The tuple must still match inside the protected DELETE transaction. Corrupt proof
holds that Account; it is never treated as capture success. Unknown DELETE shapes
refuse. Unrelated Port/Chord/Pitch/Fretboard/Rhythm cleanup and R2 behavior remain
v137 behavior. R2 delete/D1 mark remains non-atomic; this patch makes no new guarantee.

Proof lookup is per DELETE's native target, with 129-row lookahead, at most 128
verified tuples / 128 KiB, and 8 KiB result JSON. Exceeding bounds retains that target's
native evidence; no all-Account proof list is built or bound. These are safety
bounds, not data-retention deadlines. Unknown/partial Studio schema still holds
Scheduled globally because safe SQL interpretation is unproven. Direct old version
URLs/manual SQL bypass this wrapper; exclusion and initial handover remain required.
No new Studio cron or automatic physical cleanup is enabled.

## Performance and quotas

Pending terminal status shares the pending read; receipt/change are joined under
the same authorization batch. Chunk collision check, idempotent insertion and
native Account activity are one final-authorized transaction. Request-local
activity context cannot cross credentials. No schema/journal/auth/Pro/CAS guard is
removed. Usage counters are maintained by insert/delete/resolution triggers.

Rate accounting stays per Account; policy-controlled removal touches only that
Account's expired windows. A persisted common window-size/clock floor rejects
window rollback or silently changed rate-window configuration. A rate rejection
rolls back its increment. A clock anomaly may HOLD the affected requests; no reset
is inferred. Public capacity/rate choices remain unapproved.

Planning range only: begin canary with 50–100 documents, 128–256 MiB body quota,
200–1000 active operations and 120–240 requests/minute per Account. A near-limit
9.45 MB synthetic document requires 73 chunks plus begin/commit/read; reserve
another full upload and pending adoption in quota. These ranges are not a public
SLA or production configuration. Smaller limits must not make a valid schema2
project impossible to save. D1 billing, concurrent devices, unresolved UNKNOWN and
retained proof growth require canary measurement before public choices.

Native Node process RSS is not Worker isolate memory or CPU. Production Worker
128 MiB isolate/CPU limits require actual paid-plan canary profiling; local success
cannot prove deployed resource headroom. Sources:
https://developers.cloudflare.com/workers/platform/limits/
https://developers.cloudflare.com/d1/platform/limits/
D1 `batch` counts as one per-invocation query, while individual statement limits
still apply. No Production quota/configuration has been changed.

## Validation and release gates

Run synthetic native tests with STUDIO_TEST_RUNTIME (Miniflare/esbuild) and a fresh
STUDIO_TEST_OUTPUT. `test/studio-release-rc2.test.mjs` directly covers new boundaries.
The RC1 regression is rerun with the exact new migration ID; its assertions remain.
`STUDIO_RC_V137_ONLY=1` exercises the pinned real v137 entry. Browser mode uses
`STUDIO_RC_BROWSER_ONLY=1` plus STUDIO_CLIENT_OUTPUT, independent Chrome profiles,
network refusal and real native HTTP. Evidence is outside the product repository.

Remaining release sequence: approve retention/deletion/notification/quota/rate
policy and terminal metadata retention; regenerate exact DDL/Worker manifests;
separately approve encrypted Production backup and isolated real restore;
prove old Worker ingress/Scheduled/manual-writer exclusion and handover;
separately approve default-OFF DDL/Worker rollout, readback, then Owner canary;
measure deployed CPU/memory and cross-device Safari/real-device E2E;
complete Studio product acceptance and independently authorize stacked PR
integration/Pages. No one of these approvals authorizes another.
