# Production preparation — 2026-11-08

This updates the original PR #234 acceptance. Initial fixed head/tree were `f16188e150e7fa57e6f548a1d0c5d4cd97a1aaad` / `8fa609b141e0ba1bdb03359018b3ef1ca06b8abc`. The same PR is extended; Studio remains the unpublished 0.87.0 candidate. No main merge, Pages release, Production Worker replacement, general intake opening or paid inference was performed.

## Actual Production baseline and prepared integration

- Production Worker version `ae8d9611-2f3c-45ee-b6ed-e537e8d4da0f`, 100%; deployment `2be01215-bfcc-4205-91ab-1e24a22a0d35`.
- This contains an AI相談 candidate newer than main. It is not source-identical to PR #234's original `index.js` entry. Do not deploy main's Worker as a substitute.
- Actual deployed entry is `studio-canary-entry.js`, importing `production-v148.mjs` and `ai-support-candidate.mjs`. Retrieved deployed module bytes were preserved privately and hashed in [production-preflight.json](production-preflight.json). No Account IDs embedded in the deployed artifact were copied into this report or new source.
- `prepare-report-overlay.mjs` checks all three complete hashes, copies those modules unchanged, bundles only the report feature, and emits a separate overlay entry that re-exports the existing named exports. A Wrangler no-bundle dry-run verifies all original module bytes remain identical in the upload candidate.
- `report-release-entry.js` is now a factory accepting a verified existing Worker, not a direct import of main's unverified entry. Existing fetch/scheduled handlers are delegated once; the report schedule uses only REPORT_DB.
- Frozen-artifact workerd comparison preserves health 200, Project OFF 423 and method/route/auth rejection responses. These are unauthenticated structural checks, not real-Account Sync acceptance. Production health was 200. No live authentication was bypassed.
- Existing Production settings hash, bindings, deployment and cron were re-read and unchanged. Cron remains `15 3 * * *` UTC (12:15 JST); existing route list is empty and the workers.dev hostname remains in use. AI相談 mode stays OFF; Project route flag stays false. No REPORT_DB binding has yet been added to this existing Worker.

Preparation commands (no upload):

```sh
REPORT_BUILD_RUNTIME=<installed sync package.json> \
node workers/sound-cruise-sync/scripts/prepare-report-overlay.mjs \
  <downloaded verified Production module directory> <new private output directory>
wrangler deploy --dry-run --config <output>/wrangler.jsonc --outdir <new private build directory>
```

The emitted config is intentionally named `studio-reports-overlay-dry-run-only` and omits Production bindings. It is not a deploy-ready Production config. After explicit deployment approval, recheck the live version and module/settings hashes, retain every existing secret/binding/var/route/cron, add only the REPORT_DB binding and report settings, and deploy the prepared module set to the existing Worker. Preserve the current version as rollback target; no D1 rollback or report deletion is part of a Worker rollback.

## Dedicated Production D1 — completed

Created `cruise-studio-reports-production`, ID `d1054012-3f3f-4eff-bad0-d801683273b8`. It was initially empty. Applied exactly `report-migrations/0001_reports.sql` then `0002_retention.sql` using `wrangler.reports-production-db.jsonc`. This config has no Worker entry and cannot deploy a Worker. Both requests succeeded; the four tables and four named indexes were verified. Reports and audit are both 0. Existing Sync/Account/NEWS databases were not queried for user content or migrated.

Final preparation bookmark: `00000001-0000000e-0000511d-76e74b9c5289d4d5fbf4316cfa834a08`. This is a bookmark of an empty new database, not evidence of a restored user-data backup. Migration hashes are in production-preflight.json. Never reapply the files blindly; inspect columns/schema first. No existing shared migration journal was changed.

## Access real connection — blocked by existing API scope

Reading Access organization returned 403 / `Authentication error`. A request to create a *new, development-only* Operator Access application also returned 403 / `auth.forbidden`; no app or policy was created or modified. Existing NEWS authentication was not changed. A verified human login cannot be claimed with these permissions.

Minimum owner action:

1. In the existing Zero Trust organization, create a **self-hosted Access application protecting only the report Operator paths** (`/report-operator` and `/report-operator/*`), initially on the development Worker hostname `cruise-studio-reports-dev-20261108.cruise-port-requests.workers.dev`. Allow only the operator's existing identity. Do not turn on protection for the entire Sync Worker: Port/Account clients must remain outside this application. If workers.dev path-level application configuration is unavailable, select an approved dedicated operator hostname before changing DNS or routing.
2. Provide the resulting non-secret application audience and organization issuer; keep the operator-email allowlist private. The owner can alternatively grant a narrowly scoped Access Applications/Policies editing token to carry out this setup. No Pro password, Access assertion, Cookie or OTP should be supplied to the agent.
3. Configure the distinct REPORT_ACCESS_ISSUER, REPORT_ACCESS_AUD, REPORT_OPERATOR_EMAILS, REPORT_OPERATOR_ORIGIN, REPORT_CSRF_SECRET and REPORT_RATE_SECRET on the approved target. Secret uploads to the Production Worker create versions/deployments, so none were performed in this preparation phase. For an Operator-only phase use STUDIO_REPORTS_ENABLED=true, REPORT_INTAKE_ENABLED=false and REPORT_AI_ENABLED=false; intake remains closed. The actual human must complete the Access login. Then test list/decision/CSRF/denial/export using synthetic reports in development, before a Production release.

All Operator endpoints still verify RS256 issuer/audience/expiry/email; forwarding a header or knowing the Pro passcode grants no operator role.

## AI provider and approval boundary

The initial Qwen candidate is currently listed for planned deprecation on 2026-11-20. Preparation selects `@cf/openai/gpt-oss-20b`, whose official model page currently lists $0.20/M input tokens and $0.30/M output tokens, with low reasoning supported. AI相談's model and billing tables are unchanged.

Proposed initial settings, **still OFF**:

```text
REPORT_AI_ENABLED=false
REPORT_AI_DAILY_CALLS=10
REPORT_AI_DAILY_MICROUSD=100000
REPORT_AI_CALL_MICROUSD=10000
```

The implementation hard-caps configured calls at 10/day and reserved cost at $0.10/day. Each attempt, including failed/timed-out attempts, reserves $0.01 first; the model's output is limited to 1,200 tokens and input remains bounded by the report limits and five candidate titles. Reservations are conservative application accounting, not an external billing-account hard cap. Other services' Workers AI usage is separate. Paid activation and a single bounded real inference still need explicit cost approval. No real model call or billing-plan change was made; synthetic AI success is not real-model acceptance.

Official sources checked 2026-11-08:
- [Qwen model/deprecation](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/)
- [GPT-OSS-20B model and pricing](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/)
- [Workers AI billing/free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/)

## Retention and privacy — implemented and tested

- Report free text, diagnostic metadata, AI analysis, decision details and related free-text fields are redacted at 90 days; a non-content receipt/status stub remains to avoid resurrection via old request IDs. Existing audit payloads for that report are also cleared. The user form states the purpose and retention period before sending.
- Audit metadata lasts 365 days. IP-hour limit records expire after two hours; global daily counters after two days. Legacy limit rows get a bounded two-day grace. Old AI budget rows expire after 31 days.
- `REPORT_RETENTION_ENABLED=true` runs dedicated maintenance independently of intake state using the preserved schedule. Scheduled deletion is daily, so the target is 90 days plus schedule latency, not an exact second deadline. All redaction and audit changes form one D1 batch; existing storage is never touched.
- The Operator detail has an explicit irreversible privacy-erasure action with confirmation, JWT/CSRF and revision validation. It redacts content and prior audit payloads without deleting Account, Project or Sync data. AI claims/results check revision and redaction state, preventing erased text from being saved back. Already-started provider requests cannot be recalled; no provider request was made in Production.
- Report bodies, tokens and credentials are not written to application logs. Reports and corrections are rendered as text, not HTML or executable instructions.

## Acceptance state and next deployment

Final development Worker version: `1cd7e661-783d-4ae9-bc48-7aa99b894fdb`; paid AI remains OFF.

12/12 local real workerd/D1 and signed synthetic Access tests cover intake/admin separation, retries, costs, Operator UI, privacy redaction and expiry. The baseline comparison test covers frozen deployed modules plus an OFF overlay. Existing Studio metadata/cache checks pass. Development HTTP storage is real; AI results there remain synthetic/OFF.

Production E2E status:

| Requested case | State |
|---|---|
| A: authorized Studio form | Not run; candidate frontend is not published |
| B/C: Production receipt and D1 report | Not run; new database remains empty and existing Worker is unchanged |
| D/E/F: real Access login, decisions, Codex export | Not run; Access app creation denied by API scope |
| G: paid real-model analysis | Not run; no paid activation approval |
| H: non-admin Production denial on new API | Pending route deployment; configured synthetic verifier rejects non-admin access |
| I/J: existing Studio/NEWS/Sync/Account | Existing production resources/code unchanged; health and OFF/rejection probes only, not new authenticated acceptance |

After Access setup and integration/cost approval: (1) deploy the verified OFF overlay preserving existing settings, (2) configure and test Operator-only access with intake and paid AI OFF, (3) publish Studio-only candidate assets through the existing Pages branch, (4) perform the actual authorized Pro-entry/synthetic-report E2E, (5) enable intake and the separately approved AI budget. The 200-file candidate package was regenerated. A local Jekyll safe-build attempt could not start because the earlier temporary Jekyll runtime is no longer installed; run the existing safe-build/package hash check in the release environment before Pages approval. Normal Studio package is now 200 files (110 current plus frozen 90 compatibility); no main merge or Pages release was performed here.
