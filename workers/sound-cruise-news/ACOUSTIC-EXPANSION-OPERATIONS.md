# Acoustic NEWS expansion — 2026-10-23

## Implemented: AGM same-response discovery and bounded catch-up

The six approved surfaces, daily source lease, robots checks and **16-request
maximum** are unchanged. No pagination, archives, search API or new publisher
surface is added. The 7-day evidence cache/conditional GET design is unchanged.

- Evaluate all entries already returned by each RSS response, up to the existing
  common 100-entry/1 MB parser bound, instead of discarding entries after ten.
- Evaluate every valid News card in the same bounded HTML response (maximum 30).
  Cache hits require no HTTP. At most **nine actual detail requests** occur.
- Prioritize deferred/new or incomplete evidence before routine expiry checks of
  otherwise valid evidence. Never extend a cache's validation timestamp by reuse.
- If the detail budget is exhausted, retain only the canonical URL, discovery
  timestamps and `agm_detail_budget_deferred` in `news_discovery_receipts`.
  This does not create a candidate, facts or a verified headline.
  Queue persistence is required before marking discovery successful; a write
  failure cannot silently advance the discovery watermark. Metrics remain optional.
- Later normal collection can revisit those exact URLs even after they leave the
  listing. Each run considers at most 70 queued URLs plus 30 current cards. It
  shares the same nine-detail limit, source/URL leases, failure clocks and access
  controls. A deferred URL does not consume an article HTTP-attempt clock.
- Queue observations expire after 90 days from first observation. Actual article
  dates must still come from primary metadata; the ordinary 90-day publication
  check and duplicate validation apply. Discovery time never substitutes for date.
- Original headlines/body/images are not stored in the queue. Current titles are
  transient and are erased by the existing collector cleanup. Existing candidate
  IDs, dates, human decisions, category overrides, HOT and order are untouched.
- Metrics/logs expose listing URLs, queued/replayed/deferred counts. Deferred work
  is not reported as editorial rejection or READY. Publication remains human-only.

This recovers *observed* overflow; it cannot reconstruct URLs that disappeared
from RSS/News before any permitted successful response. Recovery from those older
gaps is unknown, not zero. No new archive requests are implicitly authorized.

## Production state and evidence limits

Read-only D1 snapshot: 214 candidates, 162 public articles. AGM's last successful
collection was 2026-10-21 06:00:30 JST. The 2026-10-23 08:11:50 JST robots probe
returned the reviewed 302 to the home page. NEWS 0.36.1 recorded a rolling internal deadline of 2026-10-24
08:11:50 JST. NEWS 0.36.2 supersedes only that maintenance timing: the next
regular 2026-10-24 06:00 JST run can probe once, subject to external holds and
the reviewed recovery gates. Hourly recovery is removed. No attempt is made today.

Saved state/audit/run rows were replayed in an isolated database: eligibility is
false now and true at the next regular 06:00 slot, without HTTP or production writes.
No stored AGM detail cache/discovery receipt exists in the current D1 snapshot;
therefore no stopped-period article can be recovered from those receipts today.
Original discovery responses are not retained, so the actual missing count cannot
be measured. Synthetic pipeline tests are explicitly not real-article recovery.

Coverage baseline stays 60/162 (37.0%); last 30 days 28/107 (26.2%). These are
cross-category editorial relevance assessments, not a request to relabel articles.
Generic audio accessories are not reclassified as acoustic-guitar equipment.

## Deviser / Headway — existing OFF source

`deviser` already has the official `/feed/` surface and `/information/` article
scope. The 2026-09-30 assessment retained robots/policy hashes, `robotsValid=true`
and a restricted documented-silence policy. This is neither a publisher grant nor
an explicit rejection. The actual blocker is `discoveryValid=false`,
`structured_facts_incomplete`: four relevant-looking feed entries did not have a
verified model/series and specific factual-label path. Current raw RSS evidence is
not retained. A privacy policy alone does not establish all reuse conditions.

Keep OFF. Do not invent current feed XML, product identities or dates. Metadata
format tests retain Headway categories/date/URL while rejecting any implication
that those tags alone establish complete product facts. Env allowlisting cannot
bypass readiness. Event/artist scope is a prospective extension to the existing
product-only assessment and needs its own review.

Official indexed information currently exposes the 2026-08-31 DSP-OSAMURAISAN
price change and 2026-08-24 guitar-making video. Product pages marked NEW without
publication dates are not new dated articles. The already published Headway
Shikizakura announcement is a cross-source duplicate, not a new item to import.
No explicit refusal was found in saved records. No matching NEWS permission email
was found; absence of Gmail evidence does not rule out a prior form submission.

Next: within an approved research budget, verify current robots/policy and the
already known RSS once, reuse that response, bind Headway product/actor/action/date
and facts provenance, replay formal validation/duplicate checks. Enable only after
actual discovery and factual-label acceptance. No product-specific regex aliases
or blanket brand-based acoustic classification are proposed.

## Martin Club Japan — preparation only

Official surfaces: `https://www.martinclubjp.com/product-information/` and
`https://www.martinclubjp.com/news-list/`. Public indexed entries carry dates,
product identities, short descriptions and direct links. Some links leave this
host (e.g. kurosawagakki.com); they must not be followed under a Martin-only grant.
The www/non-www host relationship must be explicitly reviewed, not auto-normalized.

The official disclaimer requires individual approval for commercial information
use and prior consent for links. No matching permission email was found; do not
classify this as confirmed never-contacted. No live collection, feed URL guessing,
robots retry, implementation or source registration is added. Current robots body,
RSS URL, HTTP validators and DOM selectors remain unverified.

The earlier bounded audit observed product 1 / News 1 in 30 days, product 4 / News
3 in 90 days. These are observations, not a future supply guarantee. Clapton and
Hamada announcements overlap existing NEWS. Bonamassa models and 16 Series were
independent research candidates, not READY. Rebirth Tour and its 10/16 radio
broadcast have ended; do not publish them as upcoming events. A separately dated
report can be evaluated only on its own evidence.

### Minimal contact question (not sent)

Ask the official https://www.martinclubjp.com/contact/ whether the stated free/
membership-app NEWS use (objective facts, independent short headline, attribution
and direct article link; no body/headline/image reuse) and once-daily checking of
the two named lists plus necessary new details can be approved under disclaimer
items 1 and 7. Request only any required attribution/access conditions. Do not ask
staff to explain dates/URLs already visible publicly, or guess personal details.

### Acquisition plan after approval

One robots check + two lists = at most three base requests/day plus a bounded N
of necessary new details. Trial and scheduled requests share the ledger. One
response feeds discovery, facts and replay. Existing canonical URL, brand/actor,
source-specific provenance, date, duplicate and validation paths are mandatory.
Same product/announcement from AGM or a retailer is one event, not a new source
article to inflate counts. Confirmed identities/date/action only; failures stop
before READY. No automatic publication, source expansion, auth or redirect bypass.

## Release and next verification

NEWS patch only; Operator/Port and their public contracts do not change. No DB
migration or article update is needed (existing metrics/receipt tables are reused).
Run full NEWS/Operator and Port NEWS suites, both Worker builds, syntax, diff and
secret scans, then deploy only NEWS. Do not run collection as a release smoke.
After recovery, compare ordinary-run discoveries, detailed GET count, queue drain,
formal READY and independent acoustic increment against the baseline; do not claim
live recovery from fixture success. Yamaha remains OFF with zero related requests.
