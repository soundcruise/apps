# Discovery-to-READY operations

Normal processing runs at 06:00 JST (`0 21 * * *` UTC). Publication remains a
human decision. No new publisher endpoint, permission or request budget is added.

## Durable boundary

`news_discovery_receipts` retains its eight-column schema. The additive
`0023_discovery_work.sql` migration imports those receipts into a companion work
table without modifying candidates, decisions or publisher-access records.

Recognized permission-scoped article URLs on a fetched listing/feed are recorded
before editorial selection or detailed parsing. Malformed listing cards remain
visible as discovered/evidence-insufficient work. A publication-date watermark is
only usable with an independently known candidate URL. A tracking transaction
failure makes collection unsuccessful; it cannot advance discovery as completed.

The bounded parser windows remain unchanged (including AGM RSS 100 / News 30).
This does not claim to discover URLs outside the acquired, permitted surfaces.

## States and scheduling

The work table separates discovered, known, duplicate, out_of_scope,
outside_date_window, awaiting_fetch_budget, awaiting_allowed_retry,
evidence_insufficient, parser_failed and validated_ready. These are system
processing states, never human approve/reject records. A known state alone is not
a READY result. Every READY state is derived from formal publication validation.

Eligible candidates are persisted before the detail budget is spent. Oldest
pending work is evaluated first in the next scheduled run, even if its URL has
left the listing, including a 304 listing result. Budget waits are due at the next
06:00 JST; robots, source stops and publisher Retry-After still take precedence.
Tracked primary detail work cannot spend HTTP in the hourly lifecycle cron.

AGM's existing URL-only News backlog remains authoritative for its pre-candidate
detail fetches: at most 16 HTTP / 9 details per day and 7-day revalidation. Morris
continues to use its own once-daily listing and once-only fresh-detail ledger.
Yamaha and other OFF sources are not enabled.

## Evidence and failures

Primary detail facts, field provenance, response hash, fingerprint binding and
parser version are retained as a bounded typed projection. No original headline,
prose, HTML or images are retained. Valid compatible evidence can repair missing
provenance without HTTP after the one-day transport cache has expired. A failure
with the same evidence/fingerprint and parser is not fetched repeatedly. A newer
parser may reconsider the URL in an allowed subsequent calendar-day budget;
discarded HTML cannot be reconstructed or claimed as re-parsed.

Missing listing metadata and permission-blocked evidence are explicitly unresolved.
They do not acquire guessed facts or broaden retrieval permission. URL processing
counts therefore differ from candidate/review counts.

## Observability and release checks

`news_preparation_runs.metrics_json.discovery` and the existing structured
`news_preparation` log contain state counts and unresolved backlog. Initial
recovery metrics separately record new candidates, READY, deferred work, errors
and HTTP success/failure. Operator adds a compact URL processing summary; existing
review queues and display management remain intact.

Retention remains bounded to the existing 90-day operational lifetime. Only typed
facts and bounded code-only history (last 20 transitions) are stored. Apply the
additive migration before deploying either updated Worker. Rollback to the prior
Workers is schema-compatible; do not drop the companion table during rollback.

The October 27 regression fixture contains verified facts/hashes from the two
approved primary GETs. Its rendered HTML is a synthetic structural projection.
Both full primary responses were separately replayed in memory through cron;
the morning listing HTML was unavailable. No forced production cron is required
for release verification; the next real 06:00 run remains a live verification.
