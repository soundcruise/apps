# Authorized Production rollout — 2026-11-08

PR #234 is extended in place. The owner approved the existing Worker overlay, Studio-only main/Pages release, and GPT-OSS-20B operation (10 analyses/day, $0.10/day application reservation, $0.01/attempt). No billing subscription was created or changed.

## Access and dedicated storage: real acceptance PASS

The Wrangler OAuth identity could read/deploy Workers but Access APIs returned 403 because the existing token lacked Access scopes. A legitimate existing Safari Cloudflare login allowed the owner-only Access application to be configured. The final save was separately confirmed by the owner at action time; no token/Cookie/OTP was extracted.

- Independent application: `Cruise Studio Reports Operator` (`8830e3ec-9ac6-449f-9ba8-07a64d8917e6`).
- Only the existing Worker hostname's `/report-operator*` path is protected. Account, Sync, NEWS and `/v1/reports` remain outside this application.
- The existing owner-only human policy is reused; no NEWS policy or membership was changed. Worker-side RS256 issuer/audience/email validation and CSRF remain mandatory.
- An unauthenticated client is redirected to Access; the actual owner signed in through Cloudflare and loaded the production Operator page.
- A CSRF-protected Operator-only synthetic report action permits acceptance while general intake is OFF. It accepts only a UUID and creates fixed synthetic content. It does not expose a bypass or arbitrary public intake.
- Production dedicated D1 saved a synthetic report and receipt. Real browser operations persisted held, accepted and rejected decisions and audit history. A structured `studio-fix-request-v1` request was generated and the copy action executed without a displayed error.
- No Account, Project, existing report-user content, Sync or NEWS data was used in acceptance.

## Worker integration: existing modules/settings retained

Original deployment: `2be01215-bfcc-4205-91ab-1e24a22a0d35`, version `ae8d9611-2f3c-45ee-b6ed-e537e8d4da0f` (rollback target).

Initial Operator-only deployment: `9a159c11-ff32-47d4-a97f-06b596fd0b9c`, version `c0a2b146-a951-4a6e-8b9f-278d73a4f3ea`. All three deployed legacy module SHA-256 hashes match the frozen baseline exactly. Existing bindings and vars are equal; only report bindings/configuration are added. Cron remains `15 3 * * *`. Existing AI相談 mode and Project release flag are unchanged. Production health returns 200. Unauthenticated contract probes are not represented as authenticated real-user Sync acceptance.

A no-bundle overlay imports the downloaded current Production artifact rather than replacing it with main's older Worker. Existing secrets are preserved with Cloudflare's `keep_bindings: ["secret_text"]`; no secret values are committed. Shared database migrations were not applied. REPORT_DB alone uses its already-applied dedicated migrations.

## Real AI acceptance: PASS, one invocation

Workers Paid was already the current plan. The real provider is `@cf/openai/gpt-oss-20b`. Acceptance temporarily limited the daily call cap to **1**, with public intake OFF. The owner-triggered retry processed only the fixed synthetic report. Production D1 shows `ai_state=done`, attempts=1 and a persisted 1,131-character analysis with `verifiedFacts=[]`. The separate daily budget row shows calls=1 and reserved_microusd=10000 ($0.01 reservation; not a claim of the exact billed amount). Provider output was displayed in the real authenticated Operator UI. No synthetic model result is claimed as real acceptance.

Operational limits remain separate from AI相談's budget. The application reservation is not a Cloudflare account-wide billing cap. Failures still consume a reservation and leave the report retriable. Report free text/analysis are redacted after 90 days plus schedule latency; audit metadata after 365 days. Automatic report-retention execution in the next actual Scheduled event remains to be observed; local tests do not prove that future event ran.

## Small fixes and focused tests

- Add the authenticated, CSRF-protected fixed synthetic-report action for an intake-OFF acceptance phase.
- Empty Operator aggregates return numeric zeros instead of SQL SUM nulls.
- Local real workerd/D1 tests cover these additions and the existing retry, idempotency, privacy, limits, CAS, denial and budget contracts. Existing Studio 12-case acceptance is reused; only related metadata checks are rerun.

## Release boundary

The normal Pro-only Studio package is 110 current files plus 90 frozen compatibility files. Publish only manifest-listed Studio assets on the existing Pages branch; retain Port 1.29.0, NEWS, the four apps and shared bytes. Standard Studio remains unpublished. The frontend form requires normal Pro entry; no live authentication bypass is allowed.

General intake must stay OFF until actual Access/storage acceptance has passed. Frontend and normal Pro-entry transport acceptance, final deployment IDs, published hashes and any remaining human gate are recorded in the final execution report. Do not infer their PASS from the backend results above.
