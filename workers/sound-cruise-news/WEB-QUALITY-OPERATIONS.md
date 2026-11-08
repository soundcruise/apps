# Web discovery quality PR1 — NEWS / Operator 0.50.0 candidate

Scope: offline development only. Production remains NEWS discovery OFF / manual OFF,
Operator viewing ON / manual OFF. This update performs no new searches, inference, judgments, deployment or
remote migration; the prior approved three-request acceptance is distinguished below. No registration/publication authority is added.

## Search contract and limits

Three daily searches retain three independent lanes: acoustic instruments; limited
editions/reissues/emerging makers; acoustic amplification/vocal/recording equipment.
The order rotates daily, but all three lanes remain covered. Queries are not locked
to any manufacturer. A custom `NEWS_WEB_QUERIES` list can replace a slot with an
English discovery query; no extra query is automatically created. Query identifiers
for defaults stay with their lane even when order changes; custom identifiers are
slot identifiers, with the exact configured query text retained for interpretation.

A rolling 14-day date range in JST is appended to each query. **This is a textual
search preference, not a guaranteed date filter.** Cloudflare's documented binding
only exposes gatewayId, provider, query, limit and byokAlias. Exa's own API exposes
startPublishedDate/endPublishedDate, but forwarding those through the existing
Cloudflare binding is not documented. We do not invent parameters, change credentials,
or switch billing paths. Native filters require a separately verified adapter path.

References checked 2026-11-08:
- https://developers.cloudflare.com/web-search/how-to-use/
- https://developers.cloudflare.com/web-search/about/
- https://exa.ai/docs/reference/search

The provider remains Exa, five results/search, three planned queries/run, with the
existing maximum five search reservations and five AI reservations per UTC day.
Failures/unknown responses consume reservations. There is no automatic request retry
or provider/model fallback. Existing manual/Cron lock and once-daily manual contract
are unchanged. These are request-count limits, not provider-enforced dollar caps.
The current Cloudflare provider page lists Exa at $7/1,000 requests. At $0.007/search, a three-query acceptance costs about $0.021;
30 days at three queries/day about $0.63, excluding tax and other charges. Current
account invoices/pricing must be checked before paid acceptance. See https://developers.cloudflare.com/web-search/providers/. That page currently lists Exa Zero Data Retention as No; this PR sends only generic news queries and does not claim provider-side zero retention.

## Metadata, screening and evidence

The normalized Cloudflare response guarantees URL/title, not a publication date.
A forward-compatible optional `publishedDate`, when present, is validated and stored
only as `publishedAtHint` / `provider_unverified`. The real `lastModifiedDate` (and legacy aliases last_modified/lastModified)
is stored separately and is **never** substituted for publication date. Missing dates
remain null. No year is inferred from URL/title, anniversary, copyright or search time.
The response body is capped at 64 KiB and 10 result entries; descriptions/body/images,
authors, provider raw errors and credentials are not persisted.

Before AI, we distinguish:
- normalized URL already in NEWS (including rejected records): no AI or judgment change;
- fragment/tracking variants of the same URL: same URL, with numeric article IDs retained;
- long identical title at another URL: uncertain article alias, held, never a canonical claim;
- formally stored product model overlap: conservative `known_product_event_unconfirmed`
  hold, never a formal same-event duplicate verdict; legacy comparisons reuse the existing
  provenance-bound legacy identity reader rather than interpreting display labels;
- edition/reissue/color/signature/custom/new-feature wording: never collapsed by model alone;
- generic pages and roundups: no AI; roundups remain leads for original sources;
- provider-supplied old/future publication dates: held as unverified date evidence;
- unknown Japanese language: held; unknown publication date: follow the permission-scoped verification path below. A recent modification may prioritize semantic triage, never establish freshness.

Japanese characters in a title or provider language tags are not formal page-language
proof. A recent provider publication hint or recent modification hint plus a Japanese title (or Japanese language hint) permits
unverified semantic AI triage only. With publication date unknown, priority is capped at low and a successful estimate stays in publication_verification_pending (or AI-low-value exclusion), without repeated AI calls. The model output remains separate from facts; formal date,
page language and publication eligibility remain unverified in the Operator response.
The nine-field estimate schema remains closed. No search hint is registered as NEWS.

Legacy successful estimates remain intact. Legacy pending hints are screened without
paid inference. At most 75 queue entries are checked per invocation; eligible batches
remain at most three hints and existing daily AI limits apply. A later search providing
missing publication/modification information may release a metadata-only hold once; model-failure counters
are not reset. Search hints are not modified by this migration; screening occurs only
when an authorized future discovery run is enabled. The Operator separately resolves verification pointers read-only even while NEWS exploration is OFF.

Ikebe preference stays in the existing formal source-preference code, unchanged.
It requires both sources' valid evidence, same product/event and no human decision.
This PR does not use a search title/model guess to prefer, reject, replace or publish.

## Trace storage and compatibility

Additive migration **0026_web_search_quality.sql**, not applied remotely:
- one nullable `news_web_hints.search_meta_json` column (max 4,000 characters);
- one `news_web_searches` table, indexed by expiry, no foreign keys/triggers.

Each reserved search must first create a durable `started` record. If it cannot be
written, no API request is sent. Its ID is UTC day + reservation number. Records hold
query ID/text, actual start time, provider, outcome, and up to ten rank/URL/disposition/
reason/date-hint entries. Completed empty response, search failure and processing
failure are distinguishable. `started` means outcome unknown, not zero results.
URLs with credentials, arbitrary query values or literal IP hosts are not retained;
tracking is stripped, reviewed numeric article query keys are preserved. A null URL
with `invalid_or_private_url` is intentionally redacted and cannot identify that URL.

No more than 200 search records; no more than 32 KiB result JSON per record. Normal
31-day operation at the hard daily cap needs at most 155 records. Trace and hint TTL
are 30 days; hints retain the existing 5,000-row cap. Expired rows are hidden on reads
and physically cleaned on the next enabled exploration run. **While exploration stays
OFF, there is no new physical-purge schedule; expired storage may remain, bounded by
these row caps.** No existing cron is changed. Operator returns the last 15 unexpired
search records, using existing Access authorization and text-only rendering.

Apply 0026 before deploying the new Operator if viewing is ON. Old workers ignore the
new column/table. The migration preserves URL, estimates, retry times, decisions and
all formal NEWS tables. Worker rollback is not a D1 rollback; do not delete retained
pilot hints or restore the whole database to undo this additive migration. Deployment,
backup/bookmark and migration remain separate user approvals. Ordinary NEWS collection
and the public API do not depend on the new table. Web OFF returns before any new DB access.

## Offline evaluation and what it cannot prove

`test/fixtures/web-quality-pilot.json` holds the 58 retained URL/title hints (45 pilot,
13 baseline), and bounded projections of 259 existing candidates, without article
bodies, personal operator identities or credentials. Independently checked publication
dates are evaluator labels, **not fields returned by the pilot API**. Three comparison
news items are fixed inputs, not newly discovered API results or formal evidence.

Tests report two separate modes:
1. Replay of actual retained URL/title fields, without invented date metadata.
2. A clearly labeled simulation of optional provider dates using independent date labels.

Actual pilot data cannot prove freshness. Holding such items without AI is an honest
cost reduction, not evidence that they are worthless or that recall improved. Date labels
are never written into formal NEWS facts/provenance. Acompass, the AGM book and Fender
new colors are covered when returned by a mocked provider with recent date hints; absent
dates hold them. Already known URLs are excluded even if they are comparison positives.

### Actual three-search acceptance already completed, not repeated

The separately approved 2026-11-08 10:24 JST acceptance ran three requests ($0.021
estimated, actual billing unconfirmed), returned 15 ranks / 14 URLs and found Acompass
60 at equipment rank 1. There were **zero publication-date fields and 12 lastModifiedDate
values**. Safe projections are in test/fixtures/web-quality-live-20261108.json. No
response descriptions, article bodies or credentials are in the fixture.

Replaying those inputs locally retains all 12 modification values and all 15 publication
values remain null. Three archive/tag/index URLs are recognized as general pages. With
an empty synthetic history, three distinct article titles with recent modification
metadata reach one mocked semantic batch, remain date-unverified, priority low, and
cannot register/publish NEWS. Production-history exclusions are evaluated separately.
This is not a new live/model test, proof of new-query recall, or proof of formal readiness.
The current change ran zero paid searches/inferences. Do not repeat the three searches
merely to test metadata normalization.

### A/B/C verification bridge (read-only)

The new web-verification.js joins a safe exact source URL to the existing registry,
source conditions, candidate and discovery-work records. It never fetches a URL,
writes a formal record, changes a retry time, or creates a listing receipt.

- **A:** an existing candidate passes the existing complete publicationValidation
  (provenance, dates, identity, duplicate, takedown, source/health/fingerprint). Show
  its existing verified date, candidate ID and revision separately from search hints.
  The date is NOT copied into provider metadata, and the hint is not made a formal fact.
- **B:** a permitted article belongs to an enabled normal collector. Show the existing
  candidate/lifecycle or discovery-work action and next time. Only that normal path
  may acquire/check it, using its robots/cache/once-per-URL/budget/CAS rules. If the
  URL has not appeared in an authorized listing, show listing_discovery_required;
  **this PR does not promise automatic registration of a search-only URL**.
- **C:** unknown/CONTACT/DO_NOT_USE/expired permission, outside an allowed article
  path, stopped source, human exclusion/takedown or unavailable evidence. Display
  reason and a source/candidate confirmation link; no automatic fetch or retry.

A resolver checks at most 100 URLs and ten full formal validations per request,
with memoization; remaining candidates keep their existing verification route without
asserting a verified date. Search traces retain the point-in-time route; Operator
re-resolves it on each read so holds can point to newly created formal evidence
without another search or model call. Run-time refresh touches only Web metadata.
There is no new scheduled task, global crawler, source permission or formal import endpoint.

Acompass 60 is discovered and may receive semantic triage from its search title.
The www.yamaha.com newsroom registry is CONTACT and jp.yamaha.com product pages are
not the guitar-Topics assisted-entry scope. Both are C, with registrationAllowed=false.
Topics permission cannot authorize the general press release. No Yamaha HTTP was made.

For search-only URLs not covered by normal listing discovery, a future *separate*
thin registration adapter must prove permission for the specific source/path and
an allowed listing/cache record before calling the existing collector intake. This
changes the formal registration boundary and needs separate acceptance; adding it
as a generic URL fetch to this discovery PR would bypass existing listing contracts.
Unknown-source/Yamaha permission must be resolved first. No extra state machine or
independent publication mechanism is needed.

## Model migration preparation

The configured production model is not changed by this PR. There is no fallback to
old Qwen. Candidate Gemma 4 uses max_completion_tokens=1500, existing JSON Schema and
bounded parsing of native structured response or choices[0].message.content. Refusals,
non-stop finish reasons, truncation, malformed/oversized JSON and count/schema failures
are safely held. No raw model response is logged. Transport errors cause no immediate
retry or model switch. Legacy Qwen compatibility is retained for existing configuration,
including its legacy max_tokens/no_think contract; this does not authorize use after retirement.

Candidates, not accepted models:
- @cf/google/gemma-4-26b-a4b-it
- @cf/qwen/qwen3.8-27b, only if the first candidate is inadequate

https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/

Local mocks establish adapter shape only. Actual schema support, Japanese quality,
reasoning consumption, latency and fees remain untested. A separate approved few-call
acceptance should cover Japanese launch, signature vs signed item, old article, general
page, unknown date and uncertain relevance; record finish_reason, token usage, Japanese
reason, timing and price basis. Do not increase tokens or fall back to another model
without an explicit bounded test plan and approval. The old model retires November 20.

## Next acceptance / formal NEWS connection

Do not enable production exploration, manual execution or automatic publication as part
of this PR. First approve 0026, current-code deployments with flags unchanged, the minimal
separately approved model contract test (existing searches need not repeat), then evaluate useful Japanese new discoveries/search, unknown-date
rate and actual human review time. Formal NEWS connection is a separate thin adapter for
permission-scoped URLs into existing discovery/collector/provenance/facts/duplicate/takedown/
validation; source conditions requiring listing evidence must still be satisfied. No
independent registration or approval system is needed. Publication remains a human decision.

## Recorded offline result

At fixed evaluation time 2026-11-08 09:00 JST, raw 45 pilot hints screen as:
8 general pages, 13 publication-date holds, 21 language holds, 2 known-product/event
uncertainty holds, and 1 roundup requiring original sources. Zero have enough
retained metadata for AI admission. The old title-only heuristic would admit 18
URLs to AI; this comparison is an eligibility comparison, not 18 actual calls or
proof that those 18 stories have no value. The 13 baseline hints are also replayed.

In the independently labeled date simulation, all 12 period-before article-date
labels remain outside AI admission. Eleven get the old-publication reason, one
already has a known-product/event reason. These labels are not silently promoted
to fields that Cloudflare returned. Both FG7/FS7 aliases are held for the same
stored product's event uncertainty. Comparison positives are admitted only when
mocked date hints are present; an absent date holds rather than inventing freshness.

**Operational limitation:** a recent update is only a triage preference. Old articles
with recent edits can still be triaged, but are not marked new or formally ready.
Undated items without a recent modification remain held with an actionable A/B/C
verification route. A listing-discovery requirement or source-permission gap is not
resolved by a stronger model, by repeating searches, or by forging a receipt.

Validation: NEWS/Operator **1,799 passed**, Port NEWS **9 passed**, both production-config
Wrangler **dry-runs passed** (no deployment). Dedicated metadata/bridge tests: 14 passed.
The formal bridge regression runs a synthetic permission-scoped collector into formal
validation, then follows B→A using SELECT only. It verifies null/tampered provenance,
takedown, disabled/out-of-scope sources, unchanged retry dates and existing records.

`WEB-QUALITY-LIVE-REPLAY-RESULTS.json` replays the real 15 ranks against saved
58-hint/259-candidate projections: semantic triage 3, general pages 3, known-product
event uncertainty 2, publication date unknown 4, known Web URLs 2, known NEWS URL 1.
All 15 publication values remain null; 12 updates are retained. These are offline
screening results, not formal NEWS admissions or actual model decisions.

Minimal next acceptance: separately approve migration 0026 and deploy current code
with NEWS OFF/manual OFF and Operator viewing ON/manual OFF preserved. Verify all
58 old rows remain readable, update/publication labels and A/B/C links through real
Access, one permitted pre-existing candidate resolves from the existing formal validator,
and Yamaha newsroom remains C. No new search is needed. Real new-model JSON/quality
acceptance requires a separately approved bounded call/count/cost plan using saved
inputs. Do not enable discovery with the retiring model merely to exercise this PR.
