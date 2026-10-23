# Pending lifecycle (C.6)

## October 18 primary recovery verification

NEWS 0.30.3 / Operator 0.29.3 update Shimamura's primary product and review
parsers. Review identity accepts the grammatical Japanese subject delimiter,
typographic multi-effect names and corroborated trial sections. Product evidence
preserves colon-bearing models, recognises explicitly named Stratocaster guitars,
and binds collaboration/limited-colour actions in the primary launch statement.
Fitted components cannot supply the complete product's type. No brand/model list
or category-based type inference is added. New parser cache keys are distinct;
previously verified review-v1/product-v5 proofs remain valid under their existing
source, field, method and timestamp checks.

The owner explicitly authorised one additional primary GET each for four existing
Shimamura candidates on October 18. This is a one-time maintenance exception, not
a scheduler or publisher-budget policy change. Acquired HTML is replayed in memory
and discarded; only bounded structured facts, response hashes and provenance are
retained. Recovery remains pending for final human approval. Mixed signature and
reissue series evidence is held when the current family parser cannot safely bind
the individual qualifiers. Morris acquisition, parsing and permission rules are
unchanged; its already-spent listing budget must not be replayed over HTTP.

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

## Non-event product / gear articles (2026-10-09)

Existing Ikebe pending articles with `other` / `review` can use the same approved,
bounded primary-article recovery flow. `product_article` is an article classification,
not a guessed release/announcement. A distinct manufacturer tag, explicit product
sections, substantive functional/use descriptions, article type and one of the
supported practice / guitar equipment themes are required. Price/shop boilerplate,
related cards, hidden text, restock/sale-only and ambiguous identity are insufficient.

The article validator requires parser-bound provenance for subject, type, models,
theme, relevance and classification, plus all existing source/health, fingerprint,
date, duplicate, takedown and expiry checks. Multi-product articles retain exact
section names and explicitly described accessory roles; no alias is inferred.
Explicit launches stay on the established event parser using the same response.

Independent headlines use 紹介 / レビュー / 試奏 / 特集 / 解説 only when supported.
Recovery uses `system_recheck`; it creates a facts receipt and current-revision
Shadow observation, and never approves, rejects, or writes a human teacher signal.
READY candidates remain pending until the operator decides. Weaker listing
rediscovery cannot overwrite these verified article facts.

There is no source, collection frequency, schema, Access, auth, scheduler or public
NEWS UI change. The first acceptance targets are the two existing YAMAHA / LAVA
holds; their published dates and identities are preserved.

## Registered official identity recovery (NEWS 0.26.2 / Operator 0.25.3)

A Shimamura primary-product identity mismatch may use a registered official authority.
This is the same facts-recheck path used by autonomous and operator rechecks; it does
not approve, relax publication criteria, or create a human teacher signal.

- Priority: manufacturer product, authorized distributor product, manufacturer press,
  repeated primary subject-body identity, then listing/title. Conflicting official
  identities/type/timing remain held even when one has higher priority. No official
  evidence also remains held. Retailer titles alone cannot resolve a spelling mismatch.
- Authorities are an explicitly reviewed origin/path/brand registry, separate from
  NEWS collection sources. The initial verified registration is Hi Resolution's
  MOTU product surface; no individual product/model is whitelisted. Manufacturer
  and press authorities require their own registration/robots review before use.
- Discovery is limited to registered product links bound to primary introductory
  paragraphs, or an internal reviewed hint in `news_facts_sources`, keyed
  `official-identity-hint:<candidate id>` with `{candidateId, sourceUrl, officialUrl}`.
  The public recheck request cannot supply an official URL or a facts override.
  Hints are transient maintenance evidence, not a new crawler or collection scope.
- Canonical URL + unique Product structured identity + visible exact product heading
  + registered brand + at least two matching primary paragraphs are required.
  Hidden/related/comparison/accessory/restock/sale/old-product text cannot supply
  missing identity. Ambiguous multiple launch models require review.
- At most two registered URLs are considered. Each authority origin has a daily
  lease/budget of one new product surface plus robots; verified evidence for the
  same URL can be reused within that day. Existing source gates/budget remain.
  Robots changes, disallow, opt-out, redirects, failures and conflicts fail closed.
- Only bounded identity, authority type/URL, verification timestamp, response hash,
  prior conflicting brand/model and explicit release period are saved. Bodies,
  original headlines, images, prices and inferred exact release dates are not saved.
- A recovered candidate is still evaluated by the existing duplicate/publication
  validators. If an approved duplicate exists, the authorized maintenance resolution
  uses `system_policy / duplicate`, stops recheck and leaves human Ledger/feedback
  and the published original untouched.

## Morning facts recovery and bounded scheduling (2026-10-14)

NEWS 0.26.5 / Operator 0.25.6 preserve the publication, permission, robots,
response-size and source/day acquisition boundaries. Ikebe's structured product
sections can corroborate explicitly realized custom colours across distinct pedal
models and a contact-cleaner's printed model code. Type/edition evidence requires
current parser-bound provenance at publication validation. Unrelated devices,
accessories, uncertain purpose and historical/review contexts cannot supply facts.
A positively identified outdoor/party playback-only portable Bluetooth speaker can
supply source-policy evidence; this is not a general speaker, audio or brand ban.
Authenticated maintenance resolution uses the existing guarded system-policy helper,
without Decision Ledger or human feedback. Scheduler records an objective policy block
without repeatedly fetching the publisher; it does not perform human decisions.

AGM tour recovery requires a named grammatical artist subject, matching introduction,
acoustic relevance and an independently repeated tour name in the article's event
information. No product-release date is inferred from article publication. Kikutani
exhibitions may provide date/venue in separate labeled primary fields before the
product catalogue. Conflicts, hidden/related text and invalid dates remain held.
Parser-versioned per-candidate exhibition cache prevents sharing another exhibition's
facts or replaying obsolete extraction across parser updates.

Hourly batches give another source a slot before a second uncached candidate from
the same source, while preserving operator interest priority and the four-candidate
batch bound. Source/day acquisition is unchanged. Budget deferrals follow the stored
budget expiry and do not increment failed recovery attempts or exponential backoff.
Several new candidates from one source can therefore still require multiple days;
this is a bounded acquisition trade-off, not evidence of low publication value.
The separately authorized five-candidate maintenance catch-up calls the same facts
recheck/provenance/CAS path as ordinary scheduled recovery. READY remains pending
until the owner decides. No evidence-shortage deletion rule was added.


## Morris independent classification (NEWS 0.30.2 / Operator 0.29.2)

- Listing/article parser version 3 replaces legacy-first extraction with one independent candidate evaluation. Versions 1 and 2 remain accepted for existing immutable evidence.
- Product announcement/release/signature, recruitment, exhibition/hosting/performance, service notice, report, craft/feature/support, catalog and artist activity are evaluated without an event-keyword early exit. Exactly one complete interpretation is required; conflicting complete interpretations remain unresolved.
- Recruitment remains a `guitar_event` competition with explicit event name, action, full calendar date and venue. Workshop hosting additionally requires explicit Morris organizer and acoustic context. Neither receives a guessed date or a reduced event validation gate.
- A `morris_editorial` / `support_notice` requires explicit acoustic repair scope and intake-stop action. Full repair and paint-related repair have separate closed topics and labels, avoiding an overbroad service-stop headline.
- Each verified listing entry stores `recoveryAnalysis` version `morris-recovery-2`: evaluated type codes, triggered candidates, boolean checks, missing-field codes and result/reason. Existing per-entry proof retains source/article URL, original response hash, parser version, permission reference and verification time. No raw heading, full description, HTML or images are stored.
- After the next regular 06:00 JST collection, inspect the saved listing receipt, candidate-level classifications and authoritative `publicationValidation` / Operator reviewability. Count all baseline receipts separately from pending candidates. Do not equate transport success, synthetic test success or an empty pending queue with real article recovery.
- Existing daily listing / once-only new-detail budgets, no historical-detail fetching, no RSS, 90-day article retention, ended-event protection and immutable published/human evidence are unchanged. Same-day replay cannot reconstruct yesterday's null facts and must never initiate a new fetch.

## October 24 initial preparation / shared article budget (NEWS 0.37.0)

This section supersedes the earlier one-new-surface rule **for Ikebe PB only**:
the owner authorized at most six necessary new primary article checks per JST day,
shared between 06:00 collection and hourly rechecks. Shimamura remains one. A fixed
listing cache is separate from per-article claims. Atomic cache claims enforce the
combined article limit; a repeated URL uses its existing transport/facts receipt.
The JST calendar boundary removes yesterday's late rescue starving today's morning
preparation. Publisher frequency/robots/Retry-After/access refusal always takes priority.
Other sources keep their existing budgets, including Morris once-only new details,
AGM discovery/detail limits, seven-day cache and daily maintenance recovery, and OFF
Yamaha/Deviser. There is no forced collection or additional discovery scope.

Scheduled Ikebe/Shimamura preparation uses the same recheck service, CAS trigger,
provenance, duplicate and 90-day validator, never a parallel approval path. New
candidates precede deferred pending work; examination is bounded to 30 candidates.
Network/body absence is distinguished from unsupported primary definitions. HTTP
refusal after successful listing is reflected in source health and the collection
outcome, not reported as a successful full preparation. Parser failure leaves the
source's transport success intact while recording failed preparation separately.

A current-version, fingerprint-bound, hash-bearing verified primary facts projection
may repair missing provenance without a new HTTP request even after its one-day
transport cache expires. The existing 90-day facts-recheck receipts allow safe reuse
even after that short cache is purged; failed-extraction receipts preserve only
bounded failure codes and response hashes, never the original response. Every normal source/date/duplicate/publication gate still
runs. No old HTML is reconstructed. Same-version unsuccessful primary evidence with
the unchanged listing fingerprint stops automatic retries after a visible unchanged-
evidence assessment; a changed candidate revision/fingerprint or new parser version
can cause a new assessment under the shared budget. No evidence shortage is treated
as a human reject.

Preparation metrics record initial evaluation, facts recovery, READY, budget deferral,
cache reuse, HTTP detail success/failure and validation/provenance failures. Existing
facts rechecks/lifecycle/logs record hourly outcomes and bounded parser-attempt codes.
Audit aggregation separates initial-/autonomous-/morris-auto- system corrections from
assisted maintenance corrections. Historical missing measurements stay unknown.
