# Pending six recovery — 2026-11-01

## Approved immediate recovery (0.42.2)

The operator has explicitly approved a bounded internal acquisition exception for
the six existing candidate IDs/URLs and their current revisions (0, or 1 for
Aguilar/Native Instruments). Until 2026-11-02 00:00 JST, the existing authenticated
individual facts-recheck action may consume one additional article attempt per
candidate. Scheduled/fixture actors and all other candidates retain normal limits.
An atomic, unique `bounded-primary-retry` audit entry binds the request, actor,
snapshot and revision; failures also consume the grant. Replays use the normal
facts receipt. Its separate transport cache does not spend other candidates'
ordinary daily slots. No migration or direct database repair is used.

Only retained parsing failures, same-day URL caching and the internal article
budget are bypassed. Source permission, source stop/backoff/lease, robots hash and
path checks, opt-out, canonical URL/date, formal parsers/provenance, final CAS,
duplicate/reject/takedown and human publication gates remain unchanged. Additional
official-identity network lookup is disabled on this bounded path. Each attempt
can fetch robots and the one registered article URL, without redirects or retries.
No publication operation is part of this recovery. Grants expire automatically;
cache/receipt retention and ordinary deletion remain unchanged.

Base: main `a993ba3eb41297dacadf56ac6714199548333949` (PR #130 merged).
Scope: existing Shimamura/Ikebe primary-facts recovery, version 0.42.1. No migration, new source permission, publication route, Web-discovery change or production deployment.

## Observed production state (read-only)

All six candidates remain pending with no formal product facts. Both sources were healthy, enabled and not publication-blocked. No takedown matched their candidate IDs; retained candidate/URL/topic checks found no definite prohibiting match. Missing facts still prevent a final identity-based duplicate decision.

| Source / article | Observation | Local fix/projection result |
| --- | --- | --- |
| Shimamura 105214, EastWest Hollywood Scoring Tools | Daily primary acquisition budget deferred | Explicit software definition, manufacturer pronunciation, own JAN table; READY |
| Ikebe 173848, OLLO AUDIO X2 | `facts_primary_type_unbound` | Exact short model in product heading, tagged maker, typed own definition and reservation statement; READY |
| Shimamura 103352, Louis LCT-TUNE | Daily primary acquisition budget deferred | Unquoted model corroborated by title/own table and clip-tuner definition; READY |
| Ikebe 173861, EarthQuaker Devices Plumes / Blumes | `facts_primary_type_unbound` | Explicit two-overdrive group, two own headings and individual limited-release statements; READY |
| Ikebe 173801, Aguilar DB700 / All Black | `facts_scope_uncertain` | Same base model and explicitly named colour variant, own head-amplifier definition; READY |
| Shimamura 102807, Native Instruments Massive XL | `facts_release_date_conflict` | Publication 2026-10-29 and separately printed release 2026-10-28; source-bound dated announcement, not an inferred publication date; READY |

Article URLs retain their existing source paths; there are no article/brand allowlists in the new rules. Tests use minimal structural projections and independent synthetic variants, not retained publisher articles or actual Cloudflare Access evidence.

At the read on 2026-11-01 JST, Shimamura had used 1/1 primary article slots. Its next calendar budget starts **2026-11-02 00:00 JST**. The two deferred lifecycle records already point to that boundary. Ikebe's configured primary limit remains 6/day; no same-day primary cache entries were observed. No limits were raised and no additional production rechecks were sent in this change.

## Recovery contract

- Primary pipeline v4 extends bounded product definitions; prior successful v1–v3 evidence remains readable.
- New evidence shapes require v4 provenance. Candidate URL, publication date, fingerprint/evidence key and CAS still bind every saved field.
- A current-parser failure remains terminal until new evidence or a real parser upgrade. An earlier known pipeline's retained failure can re-enter the ordinary pending queue after upgrade.
- An existing discovery-work row alone no longer permanently prevents a never-fetched/budget-deferred URL from using a normal slot. Current failure caching, same-URL/same-JST-day checks, source budget, robots, lease/backoff and source policy still apply.
- Explicit earlier release dates can be evaluated by the existing dated-announcement fallback, while a changed article publication date or conflicting release-date fields still fail closed.
- No human decisions are created by recovery. READY is `validation.valid=true` / `READY_FOR_HUMAN_DECISION`; the candidate remains pending. Operator's “掲載する” is a separate publication action and is not authorized here.

## Verification

- Dedicated tests: six parser projections; six full recheck → saved proof → Operator READY paths; invalid/hidden source evidence; short-model boundaries; multi-model/variant conflicts; publication/release dates; old-proof downgrade; duplicate, takedown and source-block guards.
- Actual migrations in persistent workerd D1: all six READY, restart and re-read, zero publication decisions. Shimamura cases use successive JST-day slots, not an increased test budget.
- Recovery tests: old terminal failure requeued after parser upgrade; current failure cached; same-day URL not re-fetched; deferred article can use the next calendar-day slot.
- Full NEWS/Operator, Port NEWS, both production-config dry runs, syntax and diff/secret checks are run against the final code; final results: NEWS/Operator **1,564 PASS**, Port NEWS **60 PASS**, dedicated **30 PASS** (included in NEWS total); both Worker dry runs, syntax, diff and added-content secret-pattern checks PASS.

## Production approval required

This PR is not deployed. Actual production READY remains **0 of 6**, with all six unresolved until approved deployment and successful source revalidation.

Proposed bounded approval: merge the reviewed fixed head; deploy Operator then NEWS using current production variables/bindings, preserving Web-pilot ON, manual Web run OFF and every existing cron; check Access and normal NEWS; use only ordinary available acquisition slots through existing recovery; stop at READY and report each candidate's current validation/duplicates. No D1 edits, migration, cache reset, policy/budget expansion, reject/takedown override or publication. Capture current Worker recovery versions before deployment. Do not roll back to an old Worker merely to stop Web discovery if that would discard this parser fix.

Three Shimamura primary acquisitions may require up to three ordinary daily slots. Existing initial recovery processes oldest durable work before new URLs, so the backlog need not be displaced by a continuous stream of new items. If source evidence changes, permissions fail or budgets remain unavailable, keep the affected candidate held.

## Local follow-ups

- Daily pilot record: changed from 06:30 to **07:30 JST**, active; next scheduled occurrence **2026-11-02 07:30 JST**, seven planned dates through Nov 8.
- Pilot stop: **2026-11-08 09:10 JST**, active, unchanged time. Preserve newer approved NEWS fixes when switching Web discovery off. Verification failures notify and instruct at most two retries 30 minutes apart, only 07:15–20:00 JST. The reservation is removed only after actual OFF verification.
- Both are local thread heartbeats. Computer/app availability is required; missed execution/catch-up while sleeping is not proven. AC `pmset` showed automatic system sleep 0; manual sleep, app exit, shutdown and connectivity remain risks. No power setting was changed.
- Mac-independent proposal, not implemented or deployed: a server-enforced Web-discovery deadline checked at entry and before paid calls, keeping the Operator read view available. This needs a separately approved small Worker change/configuration, not a new cron, IAM role or paid service. Current Cloudflare 06:00 JST collection/discovery is unchanged.
