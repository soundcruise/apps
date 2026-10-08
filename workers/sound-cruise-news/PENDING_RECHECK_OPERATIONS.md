# Pending lifecycle (C.6)

## Existing and new lifecycle

Collection -> candidate pending -> collection/manual facts recovery -> operator validation -> human decision or retention.
C.6 adds hourly `17 * * * *` lifecycle validation/recovery before the existing retention run. Daily collection remains `0 21 * * *` (06:00 JST). Scheduled rechecks are isolated from collection/publishing; failed rechecks log their own failure and do not skip retention.

`news_pending_lifecycle` is additive operational state, not Decision Ledger. Initial scheduling has no invented history. A run claims a 5-minute candidate lease, checks the current snapshot, reuses the existing facts-recheck CAS/trigger, then stores current-revision Shadow and bounded lifecycle history. Interest changes use authenticated Access identity, CSRF, candidate snapshot and state history CAS. Nothing in this module calls approve/reject.

## Cadence and limits

At most four due candidates per hourly trigger; protected operator one-time catch-up accepts `POST /api/pending-recheck` with `{ "scope": "due" }`, at most twenty. Interest first, earliest deadline next, fewer missing facts next, earliest due next. Backoff: 6 hours, 1 day, 3 days, then 7 days. Final check target is two hours before the publication deadline (physical retention removes candidates one hour early). Batch bounds mean this is best effort, not a guaranteed deadline service.

Existing robots, legal/source gates, leases, opt-out, response bounds and provenance remain in force. The existing operator-validation source exception is reused: at most one new recovery surface per source per day, or an existing per-surface one-day cache can be used. Daily collection does not starve recovery; no additional general collector permission is granted. No new evidence endpoint or parser permissions are added. Unsupported or policy-gated sources remain pending with a reason and next check. Ready/duplicate/policy-blocked records get daily validation without publisher fetching. Expired/takedown records stop scheduling. A changed candidate revision requeues a prior assessment.

## Source support

| Source | Allowed recovery | Limits |
|---|---|---|
| Shimamura | fixed listing; previously assessed individual targets | no broad article crawl |
| Ikebe | fixed new-product listing; previously assessed targets | identity/date must match |
| IK | fixed official listing | ambiguous product scope remains unresolved |
| Ikebe Event | assessed original event fields | completing facts does not relax pilot publication policy |
| Other active sources | no existing recovery surface | validation/scheduling only; no fetch |

## Objective block and learning

Blocks are existing validation's confirmed published duplicate, explicit `publication_decision=REJECT`, verified stored expiry, or takedown. The candidate remains pending and the UI says automatic publication block, distinct from human reject. A policy/source gate alone is not enough to assert permanent out-of-scope. Single HTTP 404/410 is `PERMANENT_INVALID` diagnostic and remains retryable; permanent deletion is not inferred. Facts/identity/category/relevance uncertainty, long pending (14 days), errors and timeouts never reject.

Interest is `publish_interest` / `cancel_publish_interest` history in lifecycle state, never an approve teacher. Automatic results are `system_recheck`, never human decisions. Shadow observations use current revision/snapshot; immutable previous observations are retained for audit.

Provenance stays in existing facts tables. Lifecycle history is bounded to 20 events and is removed when its candidate is physically retained out. Existing facts history retains 90 days, source cache one day, human decisions/Shadow 365 days.

## Deployment

Apply migration 0014 before either Worker. Deploy public NEWS scheduled implementation and Operator 0.19.0. Access configuration, AUD, allowlist and CSRF remain unchanged. Do not use production approve/reject for smoke testing. Verify approved candidates and human Ledger are unchanged and inspect `news_pending_recheck` structured metrics (due, attempted, recovered, newlyReady, autoBlocked, noEvidence, failure, durationMs).

## Pending cleanup and primary evidence recovery (2026-10-09)

Supported listing extraction remains the first path. An insufficient listing result can escalate to a per-candidate, canonical Shimamura product article or an explicitly labeled Ikebe guitar workshop. A previously verified primary cache selects the same parser. Each ordinary recovery retains the robots + one bounded article budget, no redirects, source gates, opt-out, 24-hour cache and source/day scheduling limit. Only structured facts, hashes and provenance are persisted. Related cards, hidden elements, original headlines, prose and images are not stored. Workshop publication requires the named instructor, guitar relationship, labeled venue and valid event date; product launches require a subject-bound announcement. New primary evidence is protected against weaker listing rediscovery.

`src/pending-resolution.js` is an internal, explicitly authorized maintenance helper, not an HTTP endpoint or automatic editorial decision. `preparePendingResolution` accepts the expected candidate snapshot and a unique request ID. It recognizes only a confirmed published duplicate, an intentionally stopped source with its operational stop record, or actual stored expiry. Temporary disable, metadata shortage, editorial uncertainty, published records and records with a human decision are protected. Every candidate column, the duplicate original, latest source stop and lifecycle are compared inside the D1 batch. Stale evidence aborts the whole batch. The candidate becomes rejected with `system_policy` or `source_policy`; its facts, headline, date, URL and identity are retained. Terminal lifecycle state has no next recheck or lease.

Use `preparePendingResolution` again for a new operation; never accept a caller-supplied SQL plan through a public route. Apply only the reviewed plan with `applyPendingResolution` on the authenticated maintenance D1 binding. Request IDs make successful retries idempotent. The operation writes coarse `news_admin_audit` and lifecycle history, not Decision Ledger, human feedback or teaching features. This boundary avoids the human-decision trigger's feedback insertion. No migration is needed. The scheduled recheck still never approves or rejects.

READY records remain pending for the owner's final publication decision. A zero raw pending count is not a safe acceptance criterion when READY or unavoidable evidence shortages remain.
