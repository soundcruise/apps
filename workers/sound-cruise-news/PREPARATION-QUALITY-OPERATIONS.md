# Human-only NEWS preparation and measurement

Daily collection and hourly facts recovery never approve or reject a candidate.
The scheduled automatic-publication call is removed; hourly objective blockers
remain visible lifecycle/validation states. Existing human decisions, publication
criteria, permission limits, source stops, cache and fetch ledgers are unchanged.

## Observations

Migration `0021_preparation_metrics.sql` adds only two isolated tables:

- `news_discovery_receipts`: canonical source/article URL, first/last observation,
  publication date if present, controlled outcome/reason and existing candidate ID.
- `news_preparation_runs`: source/JST day/run identity and bounded aggregate JSON.

No original headline, body, HTML, image, free-text feedback or credential is stored.
No HTTP is added. All AGM sections and Morris's receipt-only processing use the
same observations. Shimamura records structural exclusions and watermark skips
without changing selection rules. Maintenance probe requests are counted once.

`newUrls` means a URL absent from retained discovery receipts and pre-existing
candidates, not proof of a newly published article. The first measured run may
include older previously excluded URLs. `knownUrls` is separate from semantic
duplicate blockers; legacy `collection_runs.duplicates` mixes both and must not
be presented as genuine duplicate news.

`candidateGenerated` counts projected candidates, `candidateCreated` new saved
rows. Formal validation is read-only and evaluated after source health is saved;
`readyNew` is a subset of new pending candidates, never a publication count.
Facts completeness/validation rates use the explicitly measured pending subset.
Zero denominators are null. At most 600 distinct observations and 100 pending
validations are measured per source run, prioritizing new candidates; overflow is
reported (`truncated` / `validationNotMeasured`), not represented as success.
Two batched SQL statements atomically save receipt JSON and the aggregate run.
Repeated run IDs are idempotent. Measurement failures log a separate event and do
not disable a publisher or change candidate validity. Retention is 90 days.

From NEWS 0.36.2, reviewed maintenance recovery belongs to the daily 06:00 JST
collection, not the hourly timer. The identified internal rolling-day delay is
aligned to that next slot; explicit publisher Retry-After and unexplained longer
holds remain binding. The single robots probe is shared with the collector.
See COLLECTION-RECOVERY-OPERATIONS.md for safety gates and schedule telemetry.
Hourly pending-facts recovery and retention remain independent and unchanged.

## Read-only audit

Run `node scripts/preparation-audit.mjs 30 .local/preparation-audit.json` from this
Worker directory (installed Wrangler/OAuth and intended production config).
It performs authenticated D1 reads only. Use 14 or 30 days; days are JST.

The report includes all configured sources, including recently active sources
now stopped, with `enabledNow` and health/state separately. Historical sightings,
saved candidates, known/duplicate counts and excluded counts are observable.
Historical initial facts/validation/READY rates are null where not recorded;
current repaired facts must never be substituted for those initial measurements.
Assisted versus autonomous facts correction receipts, administrative headline
corrections, explicit error-correction reason codes and maintenance audits are
reported separately. Unclassified old quality corrections are not claimed to be
confirmed headline errors.

Teacher summaries use latest committed human decisions under the current policy
with retained structured profiles; approved examples also require verified facts.
System repairs, fixtures, source policy, failed decisions and headline corrections
are excluded. Repeated independent rejection reasons guide investigation/tests;
they do not change source policy, validation or trigger automatic decisions.

## Next scheduled check

After the normal daily cron, verify `news_preparation_runs` and its structured
`news_preparation` logs for all active sources: source outcome, request counts,
observed/new/known URLs, candidate creation, facts, validation errors, READY and
unknown formats. Compare source health and maintenance outcomes independently.
AGM must remain within existing access/cache rules, Morris within its existing
once-only ledger, and Yamaha stays OFF. Do not force a same-day collection for QA.
