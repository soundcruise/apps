# Web discovery PR1 (0.42.0)

The existing NEWS scheduled entry point may run Web discovery after the daily collector. No cron is added or enabled by this PR. Only `NEWS_WEB_ENABLED=true` enables the runner and authenticated Operator list. Leave it unset/off until a separately approved deployment and paid API acceptance.

## Configuration

- NEWS_WEB_DAILY_LIMIT: integer 1–5, default 5; UTC day. D1 UPDATE RETURNING reserves quota before each attempt, including failures and concurrent runs.
- NEWS_WEB_QUERIES: JSON array of 1–10 nonempty strings, max 1024 characters. Default eight Japanese/English cross-brand acoustic, limited model, reissue, workshop and manufacturing queries; three rotate each JST day.
- NEWS_WEB_DENIED_HOSTS: JSON array of hostnames; matches each hostname and its subdomains.
- NEWS_WEB_GATEWAY: existing AI Gateway id, default `default`.
- NEWS_WEB_MODEL: approved Workers AI model name starting `@cf/`; required for live operation.
- An AI binding named AI must be configured in the collector Worker at separately approved deployment. No new credentials or paid bindings are activated here.

Exa adapter uses `AI.websearch`, five results/search. Model adapter uses `AI.run`, at most three batches per run, ten hints/batch and 1500 output tokens/call. Daily AI-call reservations use the same daily limit (default five). This is a count/output bound, not a hard monetary or total token billing cap. Input is capped by ten hints with title <=300 and URL <=2048 characters; model price and actual tokenizer determine input costs. Search cost at the observed $0.007/query: default limit <=$0.035/day, upper configurable limit <=$0.035/day, excluding gateway fees/tax. No paid calls were made for this PR. Live model quality and actual cost require separate acceptance.

## Storage and safety

Migration 0025 creates two independent tables, `news_web_hints` and `news_web_runs`; no foreign keys/triggers and no writes to formal candidate, decision, publication, deletion or takedown tables. Apply only locally for this PR. Existing migration ledger ensures one-time ALTER application. Roll back Worker with Web OFF; retain additive tables until separately approved removal. Worker rollback does not undo DB data.

Hints retain URL/title (no article body), search provider/time, estimate, reason, status and expiry. Published date remains unknown. Model results never become formal facts. Exact normalized known candidate URLs are skipped regardless of candidate review status; this is not identity/event duplicate clearance. Deleted/expired history and unknown aliases remain unverified; this feature provides no re-registration or publication path. Configured denied hosts avoid model use. URL fragment duplicates coalesce; different query strings remain different URLs.

Classified/excluded URLs do not get model reevaluation when rediscovered. Holds retry no sooner than one day, max three attempts, then remain visible until expiry. A changed title at the same URL is not silently reclassified. Manual editing/reprocessing controls are outside PR1; after expiry a rediscovered URL may be treated as a new hint. At most 5000 rows are accepted, expired hints are removed on enabled runs after 30 days; daily counters retain 31 days. OFF performs no new DB/API work but also pauses cleanup. Stored data is accessible only through existing Operator human Access/Origin validation. GET only; no new write API or CSRF bypass. A failing Web run is caught outside the collector.

## Reproduce without paid calls

`npm ci`
`node --test test/web-discovery*.test.js`
`node scripts/web-discovery-local.mjs`

Open http://127.0.0.1:8798. This loopback-only fixture preview runs the production renderer against persistent local D1, with explicit mock AI. It is not proof of real Access or model quality. The automated E2E independently verifies signed local RS256 Access fixture authentication, unauthenticated/Origin/POST denial, real workerd D1 migrations and restart persistence. `test/fixtures/web-search-exa.json` contains minimal URL/title fields from the three approved Exa searches; no original article text or credentials. Do not use titles/dates as verified NEWS facts.

## Local acceptance (2026-10-31)

- NEWS/Operator full regression: 1528/1528 passed (main baseline 1522/1522).
- Port NEWS regression: 60/60 passed.
- Dedicated persistent D1/auth/render/budget tests: 6/6 passed; local browser preview confirmed Japanese/English and Emerald hints.
- NEWS and Operator Wrangler dry-run, syntax, diff whitespace and secret-pattern checks passed.
- The Operator endpoint returns the newest 100 retained hints; pagination/edit controls are outside this initial read-only slice.
- Mock AI exercises schema, low-value exclusion and failure handling; it does not establish real model accuracy. Paid search/model calls: zero.

## Limited acceptance preparation (requires explicit approval)

Recommended trial candidate: `@cf/qwen/qwen3-30b-a3b-fp8`; multilingual support and advertised pricing make it a plausible first choice, but accuracy, JSON compliance, latency and actual tokens are untested. Compare against `@cf/meta/llama-3.3-70b-instruct-fp8-fast` only if necessary. Fixture tests use mocks and do not compare model quality. Request separate approval specifying exact model, number of calls and spending limit before any paid model test.

Daily default is 3 Exa searches (up to five under retries/re-runs), $0.63 for 30 days at $0.007/query; 5/day maximum $1.05. Three 1500-output-token model calls/day for 30 days at $0.335/M output tokens cost up to $0.045225 in output tokens; up to five calls/day across repeated runs cost $0.075375. Inputs are extra at $0.0509/M tokens and not yet measured. Taxes, retries, plan, AI Gateway billing and other services are extra; these are estimates, not spend caps.

Before production changes, verify current main/PR head and tree, D1 schema and existing migration list; confirm recoverable backup and restore procedure, current Worker versions and kill switches. Obtain approval together for main integration, additive migration 0025, NEWS and Operator deployments with NEWS_WEB_ENABLED unset/off, and the separately scoped monitored short ON period. Configure collector AI binding and selected model; configure the same Web feature flag on both Workers. Verify real Access and normal NEWS functions with Web OFF. On ON, bound first run to three Exa queries and model calls, monitor calls, errors and spend; stop immediately for unexpected access, existing NEWS disruption, budget anomalies or failed rollback. Turn Web OFF on both Workers on completion, confirm calls stop, verify existing NEWS. Worker rollback and D1 restore are separate; retain additive tables and existing records unless separately approved. Monitor errors, costs, duplicates and quality daily for seven days only if continued operation is separately authorized.

## Limited Qwen fixture trial (2026-11-01 JST)

Two requests total: the first was HTTP 401, no inference; Wrangler refreshed its existing OAuth session, and the second request succeeded using Workers AI REST with the PR1 prompt and a Japanese five-item saved Exa fixture. No Web searches were made. Direct Workers AI REST was used; AI Gateway billing was not exercised.

The successful result returned `result.response` as a structured JSON array, not a JSON string. PR1 initially held it as `invalid_estimate`; the adapter now accepts bounded structured arrays and retains the existing closed-schema validation. Offline replay of the exact result passed five of five schema validations. One model response is insufficient to measure stability, English quality or retry behavior. Brand/category extraction looked useful, but all five items were high priority, one summary was treated as high priority, one same-brand duplicate was only a suggestion, and a signature was described as signed; do not promote estimates to facts or assume no duplicates. English-model acceptance remains untested.

Latency was 6.857 seconds. Usage reported 490 input tokens, 1,306 output tokens and 42.066 neurons. At the model's published token-equivalent prices ($0.0509/M input, $0.335/M output), estimated inference cost is $0.000462451 before plan/free allocation; actual charge was not verified. HTTP 401 resulted in no model inference, not evidence of a separately itemized charge. No secret values or inference reasoning are recorded here.

## Previous bilingual Qwen comparison plan — superseded

`test/fixtures/qwen-quality-set.json` fixes seven previously saved search results: three Japanese titles (including signature and roundup), four English titles (emerging brand, electric-guitar article, product page and 2018 acoustic article). The 2018 publication year is a separately verified evaluation label, absent from the actual model input. The model must not infer an age from the URL or fabricate a date; the expected outcome is freshness unknown / no high priority, not a confident old-article determination. Fixture labels are evaluation notes, not model inputs or formal facts.

Proposed paid test: `@cf/qwen/qwen3-30b-a3b-fp8`, two Workers AI calls maximum, one Japanese batch (3) and one English batch (4), production prompt/adapter, max_tokens 1500 each, total proposed expense ceiling $0.02. Record elapsed time, usage, response validation, significance/priority, unsupported claims and classification errors. No Web search, D1 writes, deployments or production configuration changes. Stop after any authentication/billing error; do not retry. Token-based estimate is not a provider-enforced hard spend cap. Only perform after explicit approval.

Initial model adoption remains conditional: the earlier unmodified prompt returned high priority for all five Japanese items, including a roundup, and represented an artist signature model as signed. The revised prompt tells the model that a signature model is not evidence of physical signing, caps priority when recency is unverified, and treats summaries/product pages conservatively. This prompt was tested structurally with mocks only; real Japanese/English quality and stability remain unproven. AI output remains an unverified hint and never a publication fact.

## Japanese-first discovery policy

Default rotation retains three searches per day, at least two Japanese queries per day; English cross-brand discovery remains within the same 3–5 daily budget. Search titles are untrusted hints, and Japanese characters do not establish the language of the linked page. Titles without Japanese characters are kept as `hold` with `japanese_article_unconfirmed` and bypass AI classification; this conservative heuristic can also hold Japanese pages with romanized titles. Japanese-looking titles are eligible for AI triage, but every item is returned as `pageLanguage: unverified`, `publicationCandidate: false` and must have page language checked by a human. No Japanese-language article lookup is automatically triggered for an English discovery; the Operator is prompted to search for one. There is no NEWS registration path in this PR.

The proposed Qwen comparison is now Japanese-only: `test/fixtures/qwen-japanese-quality-set.json` has five saved search titles covering Japanese launch, limited edition, signature model, summary and store listing. Two calls maximum: batches of three and two, max_tokens 1500, estimated budget ceiling $0.02; no search or production access. Tests must inspect Japanese reasons, schema validity, priority, false claims and freshness uncertainty; labels are evaluator annotations, never model inputs. Requires explicit approval before calling the model. One earlier Japanese batch was tested with the previous prompt; the current prompt and language-specific behavior have not been tested with a live model.
