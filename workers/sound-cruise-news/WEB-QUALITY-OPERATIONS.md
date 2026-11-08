# Web discovery quality PR1 — NEWS / Operator 0.49.0 candidate

Scope: offline development only. Production remains NEWS discovery OFF / manual OFF,
Operator viewing ON / manual OFF. No searches, inference, judgments, deployment or
remote migration were performed. No registration/publication authority is added.

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
only as `publishedAtHint` / `provider_unverified`. Optional last_modified/lastModified
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
- unknown publication date or Japanese language: held without asking AI to invent either.

Japanese characters in a title or provider language tags are not formal page-language
proof. A recent provider date plus a Japanese title (or Japanese language hint) permits
unverified AI triage only. The model output remains separate from facts; formal date,
page language and publication eligibility remain unverified in the Operator response.
The nine-field estimate schema remains closed. No search hint is registered as NEWS.

Legacy successful estimates remain intact. Legacy pending hints are screened without
paid inference. At most 75 queue entries are checked per invocation; eligible batches
remain at most three hints and existing daily AI limits apply. A later search providing
missing date information may release a metadata-only hold once; model-failure counters
are not reset. Search hints are not modified by this migration; screening occurs only
when an authorized future discovery run is enabled.

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

Actual retained data cannot prove freshness. Holding such items without AI is an honest
cost reduction, not evidence that they are worthless or that recall improved. Date labels
are never written into formal NEWS facts/provenance. Acompass, the AGM book and Fender
new colors are covered when returned by a mocked provider with recent date hints; absent
dates hold them. Already known URLs are excluded even if they are comparison positives.

No live search recall, publication-date-field availability, language verification,
model quality, latency or billing claim follows from these tests. Minimal paid follow-up,
only after approval: the three new queries once each (about $0.021 at the old unit price),
with exact input/output-stage records. For known comparison stories already outside
14 days, do not count failure to return them as a new-query recall failure; test their
screening separately. Do not restart a recurring pilot to perform this acceptance.

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
paid search/model tests, then evaluate useful Japanese new discoveries/search, unknown-date
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

**Operational limitation:** if Cloudflare continues to return no publication-date
metadata, this strict path sends no date-unknown item to AI. It still records and
shows discoveries. A later permission-scoped formal-source metadata connection,
or a separately confirmed provider-date API path, is needed for autonomous freshness
verification. Adding year words or calling a stronger LLM does not remove this limit.

Validation on this candidate: NEWS/Operator 1,795 passed; Port NEWS 9 passed; NEWS and Operator Wrangler dry-runs passed. Migration compatibility and live-Access-shaped local E2E are included; no production deployment or paid acceptance occurred.
