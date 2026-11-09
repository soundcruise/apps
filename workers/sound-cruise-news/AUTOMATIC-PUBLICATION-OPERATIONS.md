# Automatic publication completion candidate — NEWS 0.54.0

## Boundary

Production remains accepted NEWS/Operator 0.52.2. This updates Draft PR #252;
no merge, deployment, production write, source HTTP, paid call or publication
is authorized here. `publishAutomatic` has no Worker/HTTP/cron caller and is a
complete no-op unless its internal caller explicitly supplies `{enabled:true}`.
Web discovery/manual/B→A remain OFF. There is no new migration or scheduler.
The minor version reflects the read-only assessment API, not publication enabling.

## Independent audit dispositions

The second independent audit was CONDITIONAL PASS. The supplied findings were
checked against fixed head `be5ea64379ad01e61d0c10264c8ca3c2957952ce`.

- Adopt: remove whole-table snapshots of source_health, source_state and
  news_category_overrides. Remove the common controls revision fence, which
  retention increments even without an editorial/publication change.
- Adopt: continue after known candidate race/eligibility outcomes. Unexpected
  exceptions, SQL/transaction failure and context-limit errors still stop.
- Compare but reject: broader learning shapes B and C both cause one false-publish
  direction in retained prior-only replay. Keep exact factShape, five independent
  teachers, source/category/event/action separation and structured-human-v3.
- Adopt: bounded authenticated SELECT-only prospective assessment, reusing
  assessAutomatic and existing Operator authentication. No second record store.

## Existing publication transaction reused

`publishAutomatic` uses `operatorDecision`, current publicationValidation and the
existing conditional Ledger INSERT/trigger. The shared boundary already checks:
full candidate snapshot/revision, expiry, publication ON, source health successful
run timestamp, disabled/takedown/publication_blocked, approved duplicates and the
existing legacy duplicate fence. The trigger atomically updates candidate, audit,
feedback and controls; failure rolls the whole decision back. No formal validator,
collector, pending-resolution, source permission or rejection rule is changed.
The exact CAS row and repeated timestamps now travel as one bound JSON frame.
This preserves all comparisons and transaction semantics for human/automatic
actors, while fixing the existing four-model human decision's D1 parameter overflow.
Human four-model teacher decisions and the automatic commit are both exercised
in real local workerd/D1; no production decision is performed.

Only additional automatic requirements are checked at commit:

- No prior decision of any actor for this candidate; no target category override.
- Strictly healthy target source/reason, unchanged target robots hash, and no active target backoff.
- The immutable IDs of committed human teachers used in this evaluation are
  unchanged. Normal Ledger rows are immutable except persisted-label retention;
  that label is not a learning input. Human input is read once and shared with prepareShadowEvaluation, preventing
  a learning/fence read mismatch. The commit fence includes later/future-dated
  committed human IDs, so a new judgment made after evaluation start invalidates
  the action too. evaluateDecisions still excludes future timestamps from
  learning, and ordinary human history queries keep their prior behavior.
- For Shimamura only: live same-category pending Ikebe candidates, their effective
  category and publication health/stop/robots fields are unchanged. Insertion, deletion,
  edits, relevant category transitions and an invalid competitor becoming valid
  are detected. Heartbeat timestamps, leases and unrelated sources are excluded.

Existing sourcePreferenceIdentity chooses Ikebe only for formally valid unjudged
exact product/events. Different models, colors, editions, dates and actions remain
significant. Missing or invalid Ikebe does not create a waiting period. Existing
published or human-decided news is never replaced. An existing formal duplicate
fence may still abstain if its own relevant evidence changes; it is not bypassed.

## Scope and errors

The initial automatic scope is pending never-decided Ikebe/Shimamura typed
product/launch news with current formal PASS, relevance PASS, publisher-structured
provenance, verified date and explicit model/event identity. READY or a historical
Shadow match alone grants no authority. Human-confirmed facts, manual category
overrides, uncertain identity, AGM editorial/book articles, Morris events, sales
and firmware remain outside this automatic scope.

Existing Shadow must recommend approve from at least five independent compatible
human editorial decisions without contradiction. Technical failure, duplicate and
source-policy rejections remain excluded from low-value learning. Automatic
Ledger rows use automatic_policy with coarse automaticEvaluation; no human
insights profile/Shadow envelope is created and they cannot become human teachers.

Known candidate-not-found/changed/already-decided/stale, duplicate, takedown,
source/publication and formal-validation eligibility errors abstain for that item
and continue. A bounded structured log retains candidate ID and known reason,
not SQL, response bodies or free-form errors. DB/transaction failures, schema or
context-limit errors and unknown exceptions propagate. No retry is added. Prior
commits remain identifiable in the existing Ledger if a later item fails.
Request keys bind policy/candidate/snapshot; returned counts use decision-ID
ownership rather than D1 meta.changes, which also counts trigger writes.
Automatic policy version is verified-retail-editorial-2. Shadow rule stays v3
because its learning semantics were not changed; older audit records stay intact.

## SQL and bound data are different limits

Cloudflare documents SQL statement text 100,000 bytes, 100 bound parameters, and
string/BLOB/row size 2,000,000 bytes:
https://developers.cloudflare.com/d1/platform/limits/
Bound JSON is not concatenated into SQL text. Peer context is application-bounded
to 512 live competitors / 1,000,000 UTF-8 bytes; teacher IDs to 1,000,000 bytes.
These application bounds are not claimed to be a separate D1 request-body quota.

Real local workerd/D1 tests measure each complete final INSERT separately:

| Fixture | SQL bytes | Parameters | Bound-data bytes | Largest bound string |
| --- | ---: | ---: | ---: | ---: |
| Ikebe | 6,711 | 47 | 17,200 | 15,087 |
| Shimamura with a nonmatching Ikebe peer | 9,657 | 51 | 35,480 | 17,286 |
| Ikebe four-model signature announcement | 8,337 | 94 | 19,813 | 16,287 |

With 100 unrelated source/state/category rows in an offline comparison, old versus
new bound data fell from 138,368 to 17,160 bytes for Ikebe, and 157,591 to 34,596 for
Shimamura. Old SQL text was 9,194 bytes, not 138–158 KB: the larger number was bound
data. These cases do not certify every source/model combination. An exploratory
Shimamura four-model structural template failed to establish brand/model facts;
it is not counted as formal success and no parser was changed to force it.
Four-model commit proof here is Ikebe only. Before a limited real publication,
check its exact full statement/parameters under the same local D1 test; a DB
limit error remains fatal rather than silently skipping it. Start with the
verified single-model scope. Balanced conditions remain necessary for workerd D1 expression-depth limits.

## A/B/C replay, not publication accuracy

Use only the retained decision-time profiles/validation and strictly earlier
committed/created teachers. Do not fill old profiles from current facts. From 191
Ledger records: 190 latest candidate judgments, 186 bound pre-decision frames,
185 independent article/topic cases; narrow Ikebe/Shimamura product/launch subset
98 cases. This explicitly defined replay population is not assumed identical to
an audit population selected using other candidate fields.

| Variant | Definition (source/category/event/action kept) | Approve | Reject | Human agreement | False-publish direction |
| --- | --- | ---: | ---: | ---: | ---: |
| A — adopted | Exact factShape | 4 | 0 | 4 | 0 |
| B — rejected | Verified product profiles share brand/product/identifierBasis core | 11 | 0 | 10 | 1 |
| C — rejected | Ignore only kind/version shape differences in verified product profiles | 11 | 0 | 10 | 1 |

All 185 cases were evaluated under every variant; the remaining 181/174/174 abstain.
The 98-case narrow retail subset has the same recommendation/error counts.
The counterexample is retained as a small decision-time coarse projection in
`test/fixtures/editorial-shape-counterexample.json`; no publisher proof or raw
article is included. It keeps the strict rule from accidentally reintroducing the
unsafe merge. Thresholds, contradiction rules, human independence and temporal
exclusions are unchanged. Four historical agreements do not certify automatic
eligibility or safety: historical evidence-origin classification is absent.

## Prospective read-only use

After separately approved OFF deployment, authenticated
`GET /api/automatic-assessment` evaluates at most three pending candidates using
assessAutomatic. No query parameters/write verb, cron, UI workflow or record store
is added. Access identity/origin and no-store response policy match existing GETs.
It returns candidate/revision/snapshot/evaluation time, automatic and Shadow rule
versions, eligibility/known reasons, formal validation, editorial evidence and the
next action. Technical evidence/source recovery is distinguished from human
editorial judgment. A candidate that changes during the read is an abstention.

The export assessAutomaticCandidates supports bounded offline use. Tests prohibit
all non-SELECT calls and verify unchanged candidates/Ledger/Shadow. Read output is
not a publication authorization or a persisted Shadow observation. Compare with a
later existing human Ledger frame only when candidate/revision/snapshot and rule
match, the read preceded the decision, and no later facts are used. The existing
human pre_decision Shadow frame remains the authoritative retained comparison.

## Next minimum acceptance

Approve this updated PR for merge and OFF deployment with the existing guard,
then use the bounded GET on actual next normal candidates. No new long pilot or
paid call is needed. Confirm real current proof, abstentions and the ordinary
human decision frame. Actual automatic publication still needs a separate explicit
limited authorization specifying candidate scope/count and invocation/OFF boundary;
synthetic commits and historical agreement do not substitute for it. No further
management platform or new learning engine is proposed.

## Final local verification

NEWS/Operator: 1,904 PASS; Port NEWS: 60 PASS; both Worker dry-runs PASS.
The original normal collectors, publicationValidation, source preference rules,
Shadow rule/evidence retention, auth/CSRF and decision Ledger schema are unchanged.
The new GET requires existing Access authentication, rejects write methods and
query expansion, and is tested with SELECT-only database access. No main merge,
production deployment/write or paid/source request was performed.
