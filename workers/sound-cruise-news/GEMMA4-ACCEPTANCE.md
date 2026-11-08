# Gemma 4 limited acceptance — NEWS / Operator 0.50.1 candidate

2026-11-08. Local development and six approved native Workers AI REST calls only.
Production remains NEWS 0.50.0 Web OFF/manual OFF, Operator view ON/manual OFF.
No Worker deployment, main merge, D1 write, source HTTP, Exa search, judgment or publication.
Current main at branch creation: 9efc189d (Studio/Sync changes after 614b381a; NEWS unchanged).

## Specification, billing and preflight

Model: `@cf/google/gemma-4-26b-a4b-it`. The authenticated model catalog lists it
as Cloudflare-hosted text generation with default reasoning enabled (optional).
The official model page and authenticated catalog agree on uncached input $0.10/M
and output $0.30/M tokens. The catalog additionally lists cached input $0.05/M.
The per-model input schema was fetched without inference before any paid request.

- https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/
- Authenticated metadata: `GET /accounts/{account}/ai/models/schema?model=...`

The request used the existing account's **native Workers AI /ai/run** route without
any gateway ID/unified-billing options or external provider. The billing path is
Workers AI Neurons, not an AI Gateway prepaid-credit request. Official pricing says
Gateway credits require specifying a configured gateway. Account subscription detail
returned 403 under current OAuth, so no claim is made about an invoice balance or
paid-plan detail from that endpoint. This does not alter the selected direct billing
path. No subscription, payment method, auto-top-up, token or IAM change was made.

Six immutable request bodies were prepared first. Each had max_completion_tokens=1500
and enable_thinking=false. A deliberately large input allowance of UTF-8 request bytes
+4096 tokens (not an exact tokenizer result or a provider-enforced dollar limit), plus
all 1500 output tokens at the full uncached price, gave **$0.0070538** for all six,
below the approved $0.05. Calls/case IDs and budget were reserved locally before POST;
repeated case IDs and a seventh call are refused. No automatic retry or fallback.
Only six public-title/URL inputs and typed unverified date hints were submitted.
No article body, secrets, reasoning text, operator identity or formal facts were sent.

## Small adapter corrections made before the calls

1. Gemma's current model schema requires response_format.json_schema with a **name**
   and nested **schema**. The prior generic native JSON-mode bare schema did not
   match this per-model contract. Gemma now sends a named strict schema; existing
   nine fields and legacy model envelope behavior remain unchanged.
2. Set chat_template_kwargs.enable_thinking=false only for this Gemma model.
   Retain the existing 1500 completion ceiling rather than increasing it.
3. The adapter previously dropped already-retained date hints. It now sends validated
   publicationDateHint, lastModifiedHint and search time with explicit
   `dateStatus: unverified_hints_only`. Invalid dates become null. Formal verification
   objects, candidate snapshots, facts, judgments and arbitrary metadata are excluded.
4. Diagnostic classifier revision is web-triage-3; usage records include the model ID.
   Model output is still an estimate only. This PR does not set a production model
   or add an old-Qwen fallback or reset stored hint retry/estimate data.

## Real six-case result

Each case was sent once as one hint. Requests completed 2026-11-08 12:46–12:47 JST.
All six: HTTP 200, complete JSON, exactly nine schema fields, Japanese reasons,
finish_reason=stop, no refusal, no truncated output. Usage did **not** provide a
reasoning token count; it is unknown, not silently recorded as zero. Thinking was
explicitly disabled and no reasoning message/content field was returned.

| Case | Input basis and date status | Result | Input/output tokens | Time | Neuron-based estimate USD |
| --- | --- | --- | --- | --- | --- |
| Acompass 60 launch | Actual saved title/update; publication hint is a local evaluation value, not an Exa field or formal fact | Useful acoustic amp; raw priority high | 514 / 115 | 2.590 s | 0.0000859 |
| Headway The Eagle limited | Retained Japanese title, no date | Limited woods/finish retained; high value, medium priority | 476 / 119 | 2.444 s | 0.0000833 |
| Infinite old feature | Retained 2022 date evaluation label plus a synthetic recent update | Low value/priority; no recent-news promotion | 472 / 107 | 2.073 s | 0.0000793 |
| FG/FS7 lineup | Retained product-page title/URL, no date | Low news value/priority, unknown event | 483 / 61 | 1.412 s | 0.0000506 |
| Oki Jin book | Saved fixed comparison title: Dec15 is a release date, publication unknown | Useful instruction book; medium priority; date verification needed | 452 / 118 | 2.131 s | 0.0000806 |
| Bacchus flagship | Actual saved title/update, no detailed model/specifications | Brand/event named without invented model codes; medium value/priority | 489 / 115 | 2.121 s | 0.0000834 |

Totals: **2886 input + 635 output tokens**, including 320 cached input tokens;
12.771 s summed request time, mean 2.129 s, range 1.412–2.590 s.
Token estimate ignoring cache is $0.0004791. Returned usage.neurons corresponds to
**$0.0004631 before free allowance/tax** at $0.011/1000 Neurons; it agrees with the
cached-input price. **Actual invoiced amount after the account's free allowance is
unconfirmed**. These calls were not deducted from D1 Web-run counters.

See GEMMA4-ACCEPTANCE-RESULTS.json and bounded real-response projections in
`test/fixtures/gemma4-acceptance-responses.json`. Input basis/expectations are in
`test/fixtures/gemma4-acceptance-inputs.json`; evaluation labels are not model fields
or formal provenance. A synthetic date never becomes production evidence.

## Adoption and limits

**Provisionally adopt for unverified discovery hints with human review.** Do not use
Gemma's category, dates, importance or duplicate guess as formal NEWS authority.
No broad model comparison is needed based on these results.

Observed limitations:
- Category was `news_hint`, `news` or `unknown`, rather than a stable formal taxonomy.
  The existing formal parser/category validation must supply that classification.
- One raw priority was high with only an unverified publication hint. Existing runner
  caps high to medium, and publication-unknown results to low, without creating NEWS.
  An offline adversarial replay with that captured high estimate verifies the guard.
- The old-article reason states the supplied 2022 evaluation hint assertively; the
  reason remains an unverified AI estimate and is not a formal publication date.
- The ambiguous Bacchus title gets high relevance; a human still reviews its value.
- Six fixed one-hint requests do not establish statistical accuracy, recall, sustained
  capacity/latency, or live three-hint-batch behavior. Three-item schema handling has
  local mocks; no additional inference was made to extend this sample.

## Conditions for a separate approved restart

Do not enable exploration as part of this PR. After this patch's separate merge/deploy
approval, preserve Web OFF/manual OFF, set the intended production model only under
explicit configuration approval, and verify actual bindings/Access/data preservation.
A separately approved bounded restart may use Exa three queries/day, maximum five,
existing maximum five AI reservations/day, batches of at most three, manual OFF,
no retries without bounds, no automatic formal registration/publication. Inspect the
first normal batch's JSON/finish/usage/error and current model log, stop Web only on
errors/cap overruns. This is an operational acceptance condition, not another open-ended
model-comparison exercise. Do not restart with the retiring old Qwen configuration.

## Next development unit: permission-scoped B to existing NEWS intake

Keep this separate from the Gemma compatibility patch; this changes the formal
registration boundary, not just a model transport contract. No new crawler, table
family, publication system or separate approval layer is needed.

- **A reuse:** exact safe source URL plus the existing fully validated candidate gives
  a reference/revision to that candidate. Reuse existing approved/rejected/takedown
  history; do not create another candidate or repeat AI. Ambiguous aliases require
  existing identity/canonical evidence, not matching title/brand words.
- **B intake:** first require current registry/path permission and an *actual allowed
  listing/cache record* with source proof, publication date and entry fields. Reuse
  the normal collector's `persistDiscoveredEntries` → `candidateFrom`/`NewsStore.put`
  and existing initial-readiness/facts/provenance/lifecycle handling. That helper records
  discovery receipts and clears entry titles; call it only with allowed real entries,
  never a search title relabeled as listing evidence. Start with one permitted retailer
  contract (Ikebe), then apply the same validated contract to Shimamura. Normal robots,
  opt-out, access interval, cache, daily budget, once-only rules, CAS and takedown remain
  authoritative. A not-yet-listed search-only URL stays unregistered with a concrete
  reason/confirmation path, not an automatically fabricated receipt.
- **C stop:** no registered permission/path/proof means no fetch or forced registration.
  Use the existing authenticated human-confirmation path only after the operator truly
  confirms the required facts *and* the source contract permits that path. Yamaha
  newsroom Acompass60 and its product page remain unapproved; Topics permission does
  not cover them. Model success grants no permission.
- **Editorial history:** reuse objective URL/product/event/edition + dated formal identity
  and the existing reason codes/Ledger. Human rejection of an old overview does not
  reject future editions by that brand. Keep ambiguity for review; do not fine-tune on
  raw history or feed free-form Ledger text as trusted instructions.
- **Ikebe preference:** leave `preferReviewSources` unchanged. Both records must have
  valid formal evidence/relevance, same exact models/specifications/dates/event, and
  no human decision. A valid Shimamura article need not wait for Ikebe; published or
  judged articles are never replaced or withdrawn automatically.

Acceptance for that one next PR: real-shaped permitted saved listing/cache evidence
replays into an idempotent formal candidate/READY through existing validators; repeated
URL/event, different editions, old human decision and takedown are protected; C performs
zero HTTP/registration. No production write or auto-publication during development.

## Validation and preservation

NEWS/Operator full regression: **1,804 PASS**. Port NEWS: **9 PASS**. Both production-configuration Wrangler dry-runs: **PASS**; no deployment. The six real responses replay locally through the final adapter, and request bodies match the six executed bodies exactly. Only diagnostic revision/log fields changed after the calls.

Before/after SELECT hashes match for candidate_items (259), news_web_hints (58), news_web_runs (8), news_decision_ledger (191), news_takedowns (3) and news_controls (1). Both production versions, bindings, Web flags and crons match. The six paid test calls exist only in the local acceptance ledger, not production NEWS run history. No formal registration, judgment or publication occurred.
