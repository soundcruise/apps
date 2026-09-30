> Quality + Coverage Phase 2 — 2026-09-30: Port 1.7.0 / NEWS Worker 0.5.0. Production allowlist: Shimamura, Kikutani, Sleepfreaks, ZOOM, amass (one guitarist tag RSS). Generic Music Natalie is OFF because the evaluated surface supplies no eligible guitar news. Daily collection remains 06:00 JST. Sale coverage remains an explicit unresolved gap. See [Phase 2 quality/evidence decisions](QUALITY-COVERAGE-PHASE2.md).

> Coverage Expansion Phase 1 — 2026-09-30: Port 1.6.0 / News Worker 0.4.0.
> Four-source production allowlist: Shimamura, Kikutani, Sleepfreaks, Music Natalie.
> Daily 06:00 JST collection; hourly physical retention. Exact legacy fixture grants restore old news without live collection permission.
> Review uses authenticated Wrangler CLI only; no public admin. SALE sources remain OFF and named-artist coverage remains incomplete.
> Current operations: [COVERAGE-OPERATIONS.md](COVERAGE-OPERATIONS.md). Earlier instructions below are historical; do not rerun initial bootstrap or hourly/single-source completion commands.

> Production completion — 2026-09-30: Port 1.5.0 uses the dedicated real News API.
> News Worker 0.3.0 / D1 migrations 0001–0008 / guarded hourly collection and automatic
> publication are ON for Shimamura product news only. Initial listing GET was exactly one;
> REVIEW remains pending. SALE sources remain disabled. Current operations:
> [PRODUCTION-COMPLETION-OPERATIONS.md](PRODUCTION-COMPLETION-OPERATIONS.md).
> Earlier phase descriptions below are historical; do not run snapshot bootstrap.

# Sound Cruise NEWS 0.2.0 — automatic NEWS release candidate

NEWS-FINAL preparation is implemented locally. Live validation is time-gated until
2026-09-30 08:16:26 JST; production creation/deploy/enable are still pending.
Use [PRODUCTION-OPERATIONS.md](PRODUCTION-OPERATIONS.md) for the guarded rollout,
automatic publication boundary, operator CLI, kill/takedown and Port integration.
The sections below also retain the earlier pilot history; production automatic
publication supersedes the earlier requirement to manually approve every item.

Source is committed with Port 1.3.0's static 23-item NEWS beta release.
The NEWS Worker is **not deployed**. No remote D1 operation or production Cron activation.
Production collection and API modes remain OFF; Port reads its static fixture only.
No Sync Worker imports, bindings or modifications.

## Review map

```
registry + source-policies
 -> evidence/expiry/legal-status/enabled gate
 -> D1 collection_enabled + source kill/interval/lease
 -> robots structural validation + parser
 -> bounded Feed metadata fetch
 -> source paths + event/relevance + product facts
 -> secret-keyed HMAC headline sketches + independent label -> pending D1
 -> structured human review -> approved -> indexed SQL API
API: D1 global state -> current policy -> revision-keyed 5-minute edge cache
Scheduled: physical purge only, independent of collection_enabled/api_enabled
Port: fixture default; explicit API transport contract and disabled fallback
```

- `src/registry.js`, `source-policies.js`: 26 classifications, all disabled. Partial evidence is not permission.
- `src/policy.js`: robots structure, CR/CRLF, URL/size/timeout/refusal/backoff.
- `src/metadata.js`, `fingerprint.js`: relevance/path/event/product extraction, near-copy guard.
- `src/store.js`, `migrations/0002_safety.sql`: controls, audit, retention, schema upgrade.
- `src/review.js`: state machine, required booleans and article checklist code values.
- `src/admin.js`: validated operations compiled to parameterized D1 statements.
- `src/worker.js`: CORS, SQL limit/offset, internal cache, public projection.
- `src/retention.js`: scheduled physical deletion, aggregate logs, failure propagation.
- `test/`: pure policy tests, SQLite rollback tests and actual Miniflare D1 round trip.

Legal policy: [NEWS-LEGAL-COMPLIANCE.md](../../apps/cruise-port/NEWS-LEGAL-COMPLIANCE.md).
JP2B-2 original audit was requested but not supplied; implementation uses findings
quoted in the user's JP2B-3 request. Do not describe the original as reviewed.

## Local verification

Run commands in this directory:

```
npm ci --ignore-scripts
npm test
npm run migrate:local
npm run dev -- --compatibility-date 2026-09-18 --test-scheduled
curl 'http://127.0.0.1:8795/__scheduled?cron=17%20*%20*%20*%20*'
npm run collect:local -- sleepfreaks
npm run review:local -- list
node scripts/recheck-local.mjs
```

Current collection returns `evidence_missing`, with zero publisher requests.
Do not remove gates, edit reviewedAt, reset backoff or use test registry injection
with a real fetcher to force a dry-run. chuya remains stopped; no automatic re-enable.
`quality-replay.mjs` accepts an already existing local research snapshot and performs
classification only, with no network or DB write. Its robots stub is explicitly
not source-policy or robots approval. No raw titles are printed or copied into repo.

Installed Wrangler 4.131.1/workerd supports compatibility_date through 2026-09-18.
Config target is 2026-09-28; local simulation uses 09-18 explicitly. Full 09-28
runtime verification remains a pre-deployment requirement.
Wrangler DB is `.wrangler/state`, CLI DB `.local/d1`. They are separate. Local
migration tracking is atomic/idempotent; 0002 quarantines legacy approvals and
preserves metadata with `legacy_recollection_required`. Missing fingerprints are
not fabricated. They need a future authorized recollection before approval.

## Policy evidence

Required: termsUrl, linkPolicyUrl, policySummary, reviewedBy (operator/manual/admin),
reviewedAt, robotsReviewedAt, discoveryReviewedAt, policyDecision=approved.
All three dates must be nonfuture and <=90 days old. SAFE alone is insufficient.
CONTACT also requires permissionRef and still cannot collect without a reviewed
classification code change. UNKNOWN/DO_NOT_USE never collect via normal config.

Partial URLs/summaries are recorded for Shimamura, Roland, Audio-Technica, Kanda,
Hookup, ESP and SONICWIRE. Missing evidence stays missing. The Sleepfreaks privacy
policy and store Terms do not approve the news metadata collector.
Phase 1 candidate preset: Shimamura / Sleepfreaks / Hookup, all OFF.

## Robots and collection

Empty robots is valid. Nonempty zero-UA, malformed directives, flattened comments,
HTML soft404, unreviewed 404 and unavailable responses fail closed. CR/CRLF normalize.
Unparseable/changed/disallow causes a persistent source stop and human re-review.
robots.txt's own X-Robots-Tag does not imply a source crawl refusal. Feed response
noindex/none/nosnippet/noarchive/nofollow conservatively stops the source. Article
headers/meta are checked manually before approval, not automatically fetched.

24-hour source interval, minimum 6 hours, sequential fetch, DB lease and local lock.
Robots 512KB, Feed 1MB, 15-second timeout, max100 entries, redirect limit0; only registry
HTTPS origin and DNS-pinned public IPv4. No article/image fetch or browser emulation.
401/403/451 stop; 429 respects Retry-After (minimum24h); 5xx exponential up to7days.
ETag and Last-Modified supported. Sitemap declarations are not automatically followed.

## Manual approval

`npm run review:local -- review file.json`. Example input (replace item and facts):

```
{
 "action":"approve", "id":"candidate hash", "reviewedBy":"operator",
 "label":"独自の製品・出来事の短い説明", "category":"dtm_software",
 "publishedAt":"2026-09-28T00:00:00Z", "topicKey":"brand-product-event",
 "checks": {
  "relevanceChecked":true, "factsChecked":true, "articleOptOutChecked":true,
  "duplicateChecked":true, "dateChecked":true, "sourcePolicyChecked":true,
  "labelChecked":true, "guitarEvidenceChecked":false
 },
 "articleChecks": {
  "metaRobots":"clear", "botSpecificMeta":"clear", "xRobotsTag":"clear",
  "access":"public", "linkReuseNotice":"clear", "canonical":"matches",
  "publicationDate":"verified", "independentLabel":"verified",
  "relevance":"gear", "primarySource":"no_primary_found"
 }
}
```

Do not set a check without performing it. A refusal cannot be entered as clear.
No person names, article content, emails or free-text review evidence are stored.
Permitted alternative codes are defined in `ARTICLE_CHECKS`. For Artist/Live require
explicit guitar evidence; Natalie/Skream are artist-only, guitar-required.
Date changes require `dateOverrideReason`: feed_date_incorrect / publication_verified /
timezone_correction. Retention cannot be extended by changing dates.
Rejected items require `{"action":"reopen","id":"...","reviewedBy":"operator"}`.
Approval enforces normalized and near-copy rejection plus approved topic uniqueness.
NFKC/whitespace/punctuation/case normalization + HMAC-SHA256 uses domain-separated exact/key-ID/grams and at most 64 bottom-k grams. Sketches are compared over the same hash range. This remains a heuristic. An uncompromised high-entropy secret prevents DB-only gram dictionary checks; lengths/equality still leak and key compromise removes that protection.
Uncertain candidate labels remain `label_required`; placeholders cannot be approved.

## Kill / takedown: local commands

```
npm run admin:local -- global-off global operator_stop
npm run admin:local -- collection-off global operator_stop
npm run admin:local -- api-off global operator_stop
npm run admin:local -- source-disable sleepfreaks owner_request
npm run admin:local -- source-delete sleepfreaks owner_request
npm run admin:local -- item-delete ITEM_SHA256 owner_request
```

Actions include collection-on/api-on (review_complete required), source-enable
(review_complete + enabled registry + complete unexpired evidence required).
All local operations, audit and cache revision changes execute in one D1 batch.
Item delete adds a hash tombstone for90days; source takedown persists until reviewed.
Do not reset source state to get around a refusal. Corrections to approved items use
structured approval again. For article opt-out delete the item instead of just reject.
The report `.local/last-run.json` is refreshed by these CLI operations.

## Remote takedown design — NOT executed in this phase

1. Generate a plan, for example:
   `npm run admin:plan -- source-delete sleepfreaks owner_request /tmp/news-stop.sql`
2. Review the SQL, expiry/time, exact account and **News-only** D1 database UUID.
   No production DB exists in this config. Never substitute a Sync D1 identifier.
3. Only after separate production authorization, an operator may run the installed
   Wrangler `d1 execute` against the verified News UUID using `--remote --file`.
   The current phase does not run that command or create that resource.
4. Every remote plan first sets global collection/API OFF. This deliberately keeps
   the API stopped if multi-statement file execution is interrupted. Plan execution
   is not claimed to be a D1 binding batch transaction. Audit/cache revision are
   included. Inspect success for every statement; rerun a freshly generated reviewed
   plan after failure. No requester personal data or free-form SQL input is accepted.
5. Verify `/v1/news` returns disabled, verify target removal, then explicitly review
   any restart plan. Reopening API never implicitly restarts collection or sources.
   Add separate account-scoped access, runbook and deployment checks before release.

## API contract / cache

GET /health, /v1/news?limit=20&offset=0, /v1/news/ticker; OPTIONS preflight.
Production origin allowlist: only https://soundcruise.jp. Local origins are an explicit
JSON setting used only in local mode. No wildcard or credentials. CORS is not auth;
public no-Origin reads are permitted only when API mode/state are enabled.
Production config API/collection mode stays off. No public admin endpoint.

Global D1 API state checked before every internal cache lookup. All admin/review/purge
operations change revision; cached payload keys include revision and active sources.
Internal edge TTL <=300seconds, shortened at retention expiry. Responses to browsers
and downstream caches are no-store so a takedown is visible on the next request.
Already displayed content on an open page disappears on next provider refresh; this
phase does not add polling or remote push to Port.
SQL filters approved/unexpired/current source, orders and paginates in D1; no10001-row
application scan. Unique approved topic index prevents duplicate publication races.
Only public fields + publishable:true are returned; pending/rejected/checks/fingerprints/
legal status are never projected. Port validates contractVersion, publishable and fields;
disabled returns a specific fallback without stale fixture substitution.

## Physical retention

Scheduled handler always purges independently of collection/API OFF. Candidate/review/
fingerprint metadata expires no later than min(published+90d,firstCollected+90d).
Proposed production schedule: `17 * * * *` (hourly), currently **not configured**.
Purge removes NEWS due within the next hour to allow physical deletion by the90-day
limit during healthy operation. Failures throw and must alert/retry operationally.
Runs90days, item tombstones90days, content-free admin audit365days; persistent source
stop state remains. Atomic batch rollback protects current rows on failure. Logs are
counts only. API separately rejects expired metadata regardless of Cron health.
Local manually exported snapshots are not remotely purgeable; manage their90-day
expiry and takedown separately. Fixture23 has the documented prototype exception.

## Second audit prerequisites / remaining evidence

- Original JP2B-2 audit document has not been supplied; findings in user request covered.
- All source evidence incomplete; real Sleepfreaks dry-run is gated, not bypassed.
- Human editorial approval and article opt-out review remain mandatory.
- Phase1 activation, production D1/Cron, runtime date verification are future work.

## JP2B-5 privacy and readiness

Inject `NEWS_HEADLINE_PEPPER` through the secret environment for local collection,
quality replay and approvals; use at least 32 random bytes. Never put its value
in config, command arguments, SQL, logs, reports or source. No default real key
exists. Tests inject a test-only deterministic key. Missing keys stop collection
before network access and stop approval; different key IDs also fail closed.
Key rotation requires recollection.

Migration 0003 removes `title_hash` from the active schema and clears legacy
fingerprints. Rejected rows stay rejected; all other old rows become pending with
`legacy_pepper_recollection_required`. No title recovery or signature conversion.
Historical migrations still mention the old column. Historical copies/backups
are not retroactively erased; no forensic wiping guarantee. Production has no data.

Dictionary extraction requires explicit brand AND product in the same metadata,
and explicit event words. Uncertain candidates remain pending/label_required.

Shimamura stays OFF / NOT READY: robots verified, single Feed probe without a
validated response. No candidate collection followed. See SHIMAMURA-READINESS.md
and src/shimamura-evidence.js. Only two previously verified guitar/effects paths
are provisionally allowed; no guessed DTM paths. Final readiness also checks
global production OFF and empty Cron. Sleepfreaks/Hookup remain disabled.

## JP2B-6: fixed Shimamura listing adapter (current)

Supersedes the earlier Feed readiness section for Shimamura. Uses only
`https://www.shimamura.co.jp/update/common/new-item/`, discovered from official
category navigation, for guitar/bass, effects and DTM/recording discovery.
`src/shimamura-listing.js` is a source-specific server-side parser, not an arbitrary
URL scraper. htmlparser2 parses strings without executing scripts or loading assets.
Raw publisher HTML/title must never be saved as fixtures, snapshots, logs or traces.
Tests use authored synthetic HTML; structural observations contain no publisher text.

The JP2B-8 offline parser requires one visible product-news listing h1/h2 but does
not assume that the heading and cards share a section. It scans visible anchors
outside navigation/header/footer and accepts only same-origin numeric article URLs
under the allowed guitar/bass, amp/effector and DTM/recording paths. A visible
title and date are expected. An isolated missing date or category mismatch stays
pending for review. Loss of page identity, article paths, most dates, or a sane
article count fails closed. Clearly unrelated and tutorial content
is rejected. On this Shimamura product-news listing, sale/campaign items are
outside the reviewed source scope and stay excluded (see the 1.5.0 sale rules below
for other sources). No article fetch occurs.

Collector enforces 24h per source, one robots + one listing request, no pagination,
512000 bytes, conditional GET/304, existing SSRF/redirect/timeout/backoff/kill rules.
Only ETag/Last-Modified and a successful discovery timestamp persist, not HTML.
Migration 0004 adds the timestamp. Date-only metadata uses one JST-day overlap.
Raw titles are cleared after the pending-only sink; N-1 HMAC/N-2 rules remain.

Current state: **READY FOR PRODUCTION NEWS INFRA** after the authorized
2026-09-30 08:39:30 JST final validation. Exactly one listing GET returned
HTTP 200 / 127022 bytes; the unchanged parser extracted 11 metadata-complete
candidates (3 AUTO_PUBLISHABLE, 8 PUBLISH_REVIEW). Source Health is healthy.
`discoveryValid=true`; `localPilotEnabled`, `enabled`, `productionEnabled` remain
false. This is WIP readiness only, with no production collection or deployment.
Shimamura SALE is still unapproved. Policy approval remains an internal
DOCUMENTED SILENCE judgment, not publisher permission. No raw HTML or original
headline was persisted. Next eligible listing: 2026-10-01 08:39:30.960 JST.
See FINAL-LIVE-VALIDATION.md; earlier phase records below are historical.

JP2B-8 also records a future `AUTO_PUBLISHABLE` / `PUBLISH_REVIEW` / `REJECT`
content decision. This is advisory: every collected candidate still has manual
review status `pending`, and pilot publication still requires human approval.
Missing brand, uncertain classification or factual headline similarity routes a
relevant item to review; compliance failures remain hard gates. The keyed headline
fingerprint stays secret-derived, and only deterministic fact templates can be
generated. No raw source title, body or HTML is stored.

Migration 0005 adds structured source health and state-transition alerts. Use the
local `npm run health:local` CLI to inspect them after local DB setup. Alert rows
contain only source, status, reason and time; repeated states are deduped and
recovery is visible. No public health API or Port admin UI is exposed because a
safe operator-only auth path has not been established. Email/in-app delivery can
be added after that access boundary is defined.

Dependency audit: the added htmlparser2 dependency has no reported advisory in
this run. npm audit still reports the pre-existing fast-xml-parser XMLBuilder
moderate advisory; XMLBuilder is not used by this implementation. No unrelated
forced dependency upgrades were made.

## NEWS 1.5.0: sale candidates (offline)

`src/sale.js` assesses sale signals: event (fixed vocabulary), scope
(broad/brand/shop/unknown), seller (registry name for official/retailer/distributor
sources), equipment (fixed vocabulary), start/end dates (JST) and nature
(sale/campaign). Major equipment sales are eligible (`category: sale`). Coupon,
points, shipping-only, novelty/lottery, trade-in, single-item/used markdowns, small
weekend or single-shop promotions and ended sales are rejected. Everything else is
recall-first `PUBLISH_REVIEW` with a `sale_*` decision reason, unless the source's
sale capability is approved and the sale is broad, dated, equipment-specific and
from a clear seller, in which case it is `AUTO_PUBLISHABLE`. Labels never contain
publisher copy or hype wording (`validLabel` rejects hype terms). Registry fields
`contentTypes` and `saleCollection` record per-source sale capability; `soundhouse`
(UNKNOWN) and `ikebe` are `pending_evidence` and disabled.


### SALE safety closure (2026-09-29, offline; Port 1.5.0 WIP)

The current registry's common evidence AND explicit `contentTypes: [..., "sale"]` /
`saleCollection: approved` are checked again immediately before automatic approval.
Missing, malformed, pending or revoked SALE capability is not authority. Source
health, collection/publication controls, disable/takedown and keyed provenance stay
in the shared publication boundary. Unapprovable AUTO candidates remain pending.

Explicit benefit-only promotions and single-item markdowns take precedence over
Black Friday/settlement/anniversary wording. An event name alone is not a price sale
or broad scope. Compound terms (guitar effects, amp-simulator plugins) are not
independent equipment lists. Unknown shop/brand scope stays `PUBLISH_REVIEW`;
clearly small promotions are rejected. Ambiguous mixed benefits/price text stays
in review; separately clear broad price reductions remain eligible.

Migration 0007 projects an inclusive nullable `sale_ends_at` display deadline from
SALE facts (`endDate`, optional `endTime`). JST date-only lasts through 23:59:59.999;
explicit HH:mm ends at that instant, inclusive. SQL filters expiry before page/ticker
selection; additive keyset `nextCursor` prevents expiry-induced offset skips. Cache
entries cannot outlive the next sale transition. Port receives `saleEndsAt`, validates
and filters it, and refreshes an open screen at expiry/on wake without a request.
Unknown deadlines follow normal 90-day visibility. Expiry does not delete rows.

Closure tests: NEWS 120, Port 885; all eight suites total 1,794 PASS with outbound
network blocked, external attempts 0. Production Port baseline 1.4.3; NEWS remains
uncommitted 1.5.0 WIP. No source enablement, live fetch, deployment or production
mutation occurred. Shimamura final live validation remains the next separate phase.


## Production infrastructure — 2026-09-30

News D1 and Worker/API are deployed with collection hard OFF, automatic publication
OFF and Cron=[]. The production API returns a valid empty contract (200).
`?category=` accepts only the existing NEWS category allowlist, uses bound SQL,
and isolates category cache keys; invalid categories return 400. Operator CLI
and API kill were tested on the empty News DB. There are no candidates or runs,
and no publisher request occurred. Port Pages remains 1.4.3.
See PRODUCTION-INFRASTRUCTURE.md and the current section of PRODUCTION-OPERATIONS.md.
