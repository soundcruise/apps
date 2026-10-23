# Daily maintenance recovery and listing evidence

## Temporary publisher maintenance

Only the already reviewed Shimamura `/maintenance.html` and AGM home-page **302
from robots.txt** are eligible for a bounded recovery probe. This is not general
redirect support. The destination is never followed. The previous run must have
stopped on that redirect; explicit operator stops, takedowns, publication blocks,
policy expiry, other failures and unreviewed destinations are excluded.

At the next eligible daily collection, a D1 claim permits one robots GET. Its
attempt clock and request log are shared with collection. Identical reviewed
robots directives and an allowed listing are required to resume. The same
robots response is reused for the ordinary collector. A repeated 302 remains
stopped with daily backoff; 403, 429, other errors or changed robots require review
and do not enter a repeated automatic probe. A resumed listing still passes its
normal structural/opt-out checks. Its original discovery watermark is retained
until successful collection so the stopped interval is covered. Recovery backlog
stays human-review-only, including on later rediscovery. No public endpoint,
permission expansion, redirect following or automatic publication is added.

## Daily clock (NEWS 0.36.2)

All ordinary discovery and reviewed maintenance recovery runs use
`0 21 * * *` UTC = **06:00 Asia/Tokyo on the following JST date**.
`17 * * * *` retains physical retention and the existing bounded pending-facts
rechecks; it no longer probes maintenance or performs discovery/backfill.
Cloudflare `scheduledTime` identifies the intended run; logs also record actual
handler/source start times. Delivery latency is not a different collection slot.

The old rolling 24-hour wait on the reviewed maintenance redirect is an internal
NEWS restriction, not publisher permission. Its identified legacy deadline may
be shortened to the next 06:00. Example: an AGM stop at 2026-10-23 08:11:50 JST
is eligible at 2026-10-24 06:00, not 08:11:50 plus the hourly :17 timer.
Eligibility alone makes no HTTP request and does not resume the source.

Only the exact reviewed robots 302 destinations above qualify. Redirect proof
now retains a valid Retry-After deadline (seconds or HTTP date), never response
HTML or the full header set. A publisher deadline or an unexplained longer
existing hold is never shortened. If the deadline extends beyond 06:00, recovery
waits for the next daily slot at/after it. A continuing reviewed 302 remains off
until the following morning; other 3xx, 403/429/errors, changed robots and explicit
stops remain blocked for review. Redirects are never followed.

A per-source/JST-day durable claim and compare-and-swap source-state checks guard
the single robots GET. Reviewed directives must be unchanged; the same response
is reused for the daily collector. Clearing the identified maintenance wait
cannot clear a takedown, publication block, intentional stop or concurrent hold.
No retry loop or new manual/emergency collection endpoint is introduced.

AGM keeps five RSS surfaces (up to 100 parsed entries each), News up to 30,
nine detail requests, total sixteen requests including the recovery robots GET,
7-day cache, conditional GET/304 and the existing deferred URL receipts.
Deferred URLs are processed only in normal daily discovery, never via hourly
maintenance recovery. Backlog age/90-day and source/editorial gates remain.
Other sources retain their source-specific permission and acquisition limits.
Healthy scheduled sources already use JST-day leases rather than rolling 24h;
normal manual collection, facts rechecks and unrelated error backoffs stay as-is.

`news_collection` records intended/actual starts, next daily slot, per-source
outcome/stop reason, recovery outcome/next slot, HTTP counts, new candidates and
measured READY counts (null if unmeasured), plus AGM backlog remaining. Existing
D1 run/health/preparation records provide durable request/outcome/facts metrics.

## Kikutani official NEWS cards

The fixed public listing remains the only scheduled discovery surface (robots +
one listing; no pagination/details). Controlled card tags are considered together
with explicit brand/model nouns and guitar/maintenance context. An unknown brand
is not by itself an exclusion. Only a `新製品情報` card with bound product facts
can generate the new listing-derived facts. The label describes **the distributor
publishing new-product information**, never an inferred release date or unverified
acoustic/electric subtype. Unknown guitar subtype uses `media_other`.

Each retained fact requires card/article binding, current parser version, keyed
headline fingerprint and original listing-response hash. Original headlines,
HTML, descriptions and images are not retained. The formal publication validator,
duplicate/90-day/source gates and human review remain mandatory. Events without
actual dates/venues and interviews without a verified guitar subject do not gain
READY merely from an event/artist card tag. Single-item purchase gifts remain
outside the established sale policy. Existing publications are not rewritten.

## Ikebe primary product sections

Parser 12 evaluates a safe model-bound sentence separately from later accessory
and future-option specifications. Related/other-company text and anaphoric
references with an unsafe antecedent cannot corroborate a launch. Canonical URL,
publication date, manufacturer tag, type and product headings remain required.
A primary title's explicit release is classified as release. One retrieved
response is reused for extraction and replay; no extra request is added.

## Shimamura software identity

Parser 7 can bind an explicit manufacturer launch sentence to a single named
software instrument when the manufacturer is absent from the editorial title.
The product must be present in the title and independently in the primary JAN
product table. Related cards, connected equipment and ambiguous multi-product
subjects cannot supply that binding. The software-instrument subtype requires
current primary-field provenance. Explicit release facts and the printed release
date remain separate from the article publication date; no new URL/model aliases
or additional publisher requests are introduced.
