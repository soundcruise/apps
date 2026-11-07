# NEWS 0.47.0 — pending recovery and editorial decisions

Base main: `63363dda56d054a949526c4a51959eda4c0d77eb` (NEWS 0.46.0).
This change does not merge/deploy itself, migrate D1, publish/reject a candidate, or change Web discovery, schedules, permissions or budgets.

## Production evidence and honest acceptance boundary

The read-only snapshot on 2026-11-07 confirms eight pending candidates after the owner decided the two READY candidates. The two decisions and their Ledger records are preserved. During this read-only task, the existing 14:17 JST automatic recheck saved formal Shimamura Tool Kit and NANOBASS facts; these were not writes performed by this task.

| Remaining candidate | Disposition to prepare | Current evidence / next step |
|---|---|---|
| Ikebe Fender × MusicNomad Tool Kit | Formal revalidation | Production parser16 failed `facts_scope_uncertain`, then `facts_primary_type_unbound`. Structural reproduction used an electric-guitar category whereas the publisher's listing identifies an accessory. Parser17 supports a model-bound maintenance-tool definition in the accessory category; no general accessory/type bypass. Actual article must still pass formal acquisition/validation. |
| AGM Oki Jin book | Formal revalidation | Retained `agm-article-6` cache has `productFacts:null`; original HTML is not retained. Actual-row replay proves bounded parser upgrade eligibility, not recovered book facts. Book/release day parsing is separately tested. |
| Morris west preliminary | Primary facts confirmation | Stored listing has no formal facts. Owner authorized one supplemental read; HTTP200, but current primary parser returned `listing_structure_changed`. No repeated request or invented facts. Event name/date/venue require a verified primary confirmation. |
| Morris Toshihide Tenma concert | Primary facts confirmation | Supplemental HTTP200; primary parser returned `facts:null` / `NO_COMPLETE_ARTICLE_TYPE`. Event date/venue remain unverified. |
| Shimamura Tool Kit | READY / human publication decision | Existing 14:17 JST normal recheck recovered formal facts. Exact production-code replay validates it. Ikebe is still not formally valid, so source preference must not hold this valid article indefinitely. If the owner chooses Shimamura now, compare the Ikebe alternative for a separate reasoned nonpublication decision. |
| Shimamura NANOBASS winter colour | Human nonpublication recommendation / fixed formal duplicate check | Existing 14:17 JST normal recheck recovered facts. Production 0.46.0 missed the approved duplicate: `Phil Jones Bass` / `Nanobass X4C` versus `PJB(Phil Jones Bass)` / `NANOBASS X4C`. The reviewed manufacturer spelling plus bounded case comparison detects the same dated limited-colour event. The approved article is unchanged. |
| AGM Vol.110 correction | Human nonpublication recommendation | Routine editorial correction, no new product/event value established. No dedicated publication parser or automatic rejection. |
| Morris Kyushu preliminary | Source-fact conflict / primary confirmation | Year conflict and venue are unresolved. Supplemental HTTP200 failed primary structure validation. Do not infer a corrected year from weekdays, the URL, or another card. |

Current production-code replay finds two validation PASS records, but NANOBASS is a known duplicate missed by 0.46.0. The new code leaves only the Shimamura Tool Kit READY and blocks NANOBASS against the approved representative. Accessory/book structural fixtures passing are not production response replay.

## Shared fixes

- Duplicate spelling comparison preserves the exact model tokens, product type, empty version, limited-colour action/signal, publication day and variant boundary. The regression uses actual retained PJB comparison values, not only the previously passing uppercase fixture. No human decision is overwritten.
- Accessory category corroboration requires a model-bound maintenance-kit definition. Co-development tolerates whitespace/case only; the primary heading, partners and article statements must still agree. Old parser16 sealed evidence remains supported.
- AGM successful complete caches are reused. A known older incomplete parser cache can reserve **one upgrade acquisition per source per rolling 24h**, within the existing nine-detail daily envelope. Parser marker, hash, lease and CAS reservation are written before any HTTP. Failure, crash/restart and concurrent calls cannot create an unlimited retry. Collection/recheck use the same path. No new table/trigger.
- Old incomplete AGM caches become due after parser replacement rather than retaining the previous long retry date. Same-parser failures retain normal backoff. Source policy/robots/HTTP stop checks remain outside and mandatory.
- Explicit book release predicates select the release day; a separately labeled publication day is not a contradictory release date. Missing author/publisher/date are never invented.
- Morris automatic detail access remains once-only. A valid saved listing anchor can expose the existing human primary-confirmation form even for historical evidence waits. The save still requires Access/CSRF, full explicit checks, source health, candidate CAS, proof anchoring, duplicates and takedown validation.
- A human nonpublication decision does not require complete publication facts. Evidence-wait UI no longer hides the existing rejection route. Missing facts alone are explicitly not a rejection reason. No automatic human verdict or publication path is added.
- Morris structural errors record bounded stage/count diagnostics, not original titles or article bodies.

## One-time Morris observation

The owner explicitly authorized supplemental acquisition during this task. Three selected URLs had `baseline_old` receipts and zero previous detail requests. Exactly one GET per URL was made, sequentially with ten-second spacing, disclosed Bot UA, bounded body, zero redirects/retries, and no listing/RSS/media fetch. Existing source/robots evidence was checked. No raw response was saved. The 48-hour freshness rule is internal; the publisher's agreed new-information/low-frequency method was not treated as blanket permission for repeated historical crawling.

This was a **read-only diagnostic observation**, not a production collector/recheck run. D1 receipts and candidates were not rewritten. Its three actual requests are recorded separately in the private local evidence; D1 collector counts must not be presented as including them. Do not repeat these three reads as part of deploying this PR. They did not establish sufficient formal facts and are not READY evidence.

## Deployment and completion (requires separate approval)

1. Verify the fixed PR head/main and current Workers, snapshot D1 and Web settings/automation hashes.
2. Merge/deploy NEWS and Operator while preserving live Web flags, bindings, cron and restoration procedure. No migration.
3. Use existing formal rechecks for the Tool Kit/book only if source checks and shared acquisition budget allow. Preserve the actual result rather than substituting fixture proofs.
4. Owner may confirm independently checked Morris event name/date/venue through the anchored form. Do not refetch the three already observed details; do not infer Kyushu's year. If primary facts cannot be confirmed, leave a documented source-fact hold.
5. Owner may reject NANOBASS and the routine correction. Tool Kit representative selection is conditional: valid Shimamura can proceed now; prefer Ikebe only once both are formally valid, and reject the unselected same-event alternative only after content comparison. Approval/rejection/publication are separate authorizations.
6. Verify approved rows/Ledger/takedowns/public API and pilot flags remain unchanged except for expressly authorized decisions.

Monitor initial READY rate, same-parser repeated attempts, stale-parser recovery latency, technical vs editorial pending counts, and manual confirmation count using existing preparation/lifecycle records. No new monitoring subsystem.
