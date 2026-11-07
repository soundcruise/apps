# NEWS 0.48.0 — human confirmation of acquired AGM book news

Base main: `bf7458fceb5d61e740d1b68408d2919af7299946` (NEWS 0.47.0).
This PR is local implementation only. It does not merge/deploy, migrate, fetch a publisher, call a paid service, confirm facts in production, or approve/reject/publish news.

## Current seven and the owner's completed decision

The read-only production snapshot confirms Shimamura Fender x MusicNomad Tool Kit (`ff9b8092…`, article 108267) is approved; the other seven are still pending. The new approval is retained in the existing Ledger. No prior human decision is changed.

- Human nonpublication decisions available without new development: Shimamura NANOBASS (formally detected duplicate of the approved Ikebe winter-colour article), AGM Vol.110 correction (routine correction, editorial value decision), and Ikebe Tool Kit (alternative to the now-approved Shimamura representative, after the owner compares the same product/event). NULL facts are not themselves nonpublication grounds. The Ikebe automatic facts failure remains; it is not presented as formal duplicate validation.
- Human primary facts confirmation: AGM book via this PR after deployment; Morris west preliminary / Toshihide Tenma concert / Kyushu preliminary via existing 0.47.0 form. No further Morris detail request is made.
- Morris required fields: independent event subject/name, event date and venue for an event announcement. West subject and concert performer are known editorial references, not proof of the missing day/venue. Kyushu requires explicitly resolving the year/date and venue, without inference from weekdays, URL or another card.
- Actual retained AGM evidence shows the new book form can be enabled with the existing source URL, publication date, response hash and title fingerprint. It does not establish the book title/author/release date. No structural fixture or test hash is substituted into production evidence.

The already-approved Shimamura Tool Kit currently has `productType:guitar` and a published label describing it as a guitar. That existing product-type discrepancy is noted for a separately authorized correction; this PR does not rewrite the approved row or invalidate its human decision.

## Minimal confirmation workflow

1. Open the existing AGM candidate in Operator; choose Overview, then the collapsed book confirmation section.
2. Only if the linked primary article is actually about a named book release, enter its formal **book title**, **author**, and **release date**. Enter the **publisher** only if explicitly stated. The stored article publication timestamp is not editable and is never used as a guessed release date.
3. Explicitly check personal primary-article verification, bound book identity, publication/release date distinction, acoustic-guitar relevance and no copied source prose/guessed facts.
4. Save through authenticated `/api/agm-book-facts-confirm`. This is a facts correction, not a publication decision. The human and automatic provenance formats are distinct. A neutral release-information label avoids asserting that an old date is still a future release.
5. Only an ordinary validation PASS makes the candidate READY. Publication remains the separate existing human decision. If facts cannot be established, retain a documented fact-confirmation hold; do not loop the same parser or infer the missing facts.

The form is a common mechanism for already acquired AGM News articles, not an article-ID exception, and it must not be used to turn a routine correction into an unrelated book story.

## Storage and safety contract

- No new schema, migration, trigger, raw body or source headline persistence.
- Reuse `news_facts_rechecks` and its existing atomic facts-patch trigger. Human provenance records verifier hash, confirmation time/request, all explicit checks, original acquisition proof and cache-payload hash. The article URL, saved publication timestamp and keyed title fingerprint must match the actual acquired payload.
- The atomic INSERT fences the full candidate snapshot/revision/status, current acquisition payload/hash/lease, source enable/stop/backoff and source-health generation, global controls, and takedown.
- The saved human receipt is required by publication validation; editing its facts or borrowing its proof does not pass. A later cache refresh does not silently discard an unchanged human confirmation; source-policy/health/takedown/expiry and duplicate checks still run normally.
- Idempotent replay handles a lost ACK; an altered payload under the same request ID is rejected. Existing non-NULL facts and decided candidates cannot be overwritten through this entry point.
- Successful human facts are reused by normal acquisition, without extra HTTP or pretending that an automatic parser succeeded. Ordinary collection cannot overwrite them with an automatic parse.
- Book duplicates compare the same named book, author and release date; different editions/dates remain separate. Rejection uses the existing separate human decision route and does not require publication-complete facts.
- Access, allowed-operator identity, Origin and CSRF apply to the new route. Confirmation saves do not write publication Ledger/feedback/Shadow or automatically publish.

## Acceptance boundary and deployment approval

Local tests prove a fictional, acquired, anchored book can reach READY after explicit human confirmation and survive workerd D1 restart. The production SELECT-copy replay proves actual anchor/form eligibility only; no real book facts have been supplied or saved by Codex. Morris human facts also remain unconfirmed.

After separate approval: merge the fixed PR head and deploy NEWS/Operator while preserving current live bindings, Web flags, cron and 2026-11-08 09:10 JST stop reservation. No migration or additional source fetch is required. The owner can then confirm the real AGM fields once and make the separate editorial decisions for the three nonpublication recommendations.
