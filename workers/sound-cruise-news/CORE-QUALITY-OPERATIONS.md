# NEWS Core Quality controls (0.8.1 / Port 1.10.0)

## Collection versus publication

- `source_state.disabled=1`: collection stopped. The collector lease and every publisher attempt refuse access. Existing approved facts/links remain visible until normal expiry.
- `publication_blocked=1` or `takedown=1`: approved items are hidden. Every publication write also refuses the source. Item takedown and global controls remain effective.
- `source-collection-stop`: audited collection-only stop.
- `source-publication-block` / `source-publication-unblock`: audited publication controls; unblock requires `review_complete` and never clears collection stop or takedown.
- Existing `source-disable` remains an explicit full source kill, including takedown. Do not use it for transient collection failures. `source-enable` remains a separately reviewed collection/publication restart.
- Timeout, upstream error, transient 403, changed listing and robots/opt-out uncertainty stop acquisition. Review the policy scope before deciding whether stored links also require removal.

Use the existing authenticated `scripts/operator.mjs control` path. There is no public admin HTTP route. Source changes invalidate edge cache keys through the controls revision. Automatic stops emit an operational alert; if such a stop would hide three or more approved items, an additional `approved_mass_visibility_loss` product alert is emitted. The offline quality gate checks per-source loss and missing visible IDs independently.

## Sleepfreaks

Migration 0010 preserves `disabled=1`, the failed-request time, backoff and all stored records. Its `publication_blocked=0` restores exactly five already-approved articles. The 403 cause remains **UNKNOWN / likely infrastructure**, not a confirmed publisher opt-out. No request was made during this repair.

Future acceptance should include a separately authorized, one-use robots check from the **production Worker collection network**, with an explicit request budget, source identity, audit and comparison to at most one operator-terminal GET. A bounded diagnostic must not clear the collection-stop flag or start discovery/Cron acquisition. This is a design requirement for a later task, not an endpoint or fetch added here. No alternate UA, proxy or refusal bypass.

## Event and Sale deadlines

Scheduled Artist/Live facts with an `endDate`, or just `eventDate`, expire inclusively at that date's 23:59:59.999 JST. Interviews retain publication-based retention. API filtering occurs before pagination, and every page cache is bounded by the next event/Sale deadline. Port also filters a previously loaded payload. Event expiry does not delete D1 records: ordinary 90-day retention remains.

Sale labels can include validated integer percentages and allowlisted brand/equipment nouns. This does not replace the seller/benefit/deadline evidence requirement. APU's existing manual Sale was rejected because stored evidence did not establish the support author's official identity or specific product value. Manual ingestion remains available.

## Facts, dedupe and replay

Ikebe AUTO requires an explicitly present brand, adjacent bounded model identifier, product type and clear event/date on the assessed listing. Unknown names, planned releases, unrelated numbers and uncertain context remain REVIEW. No brand owner or model is supplied from a missing source fact.

IK storage dedupe compares canonical identity and validated same-source model/category/version/event family/JST publication day. Different dates/products/versions, underspecified packs (including translated pack names and older `label_required` records) and unversioned updates are preserved. Collector leases and an atomic insert predicate protect concurrent writes. Rejected rows are never resurrected.

`replayPendingFacts` is an authenticated operator-side function over stored pending facts only. It cannot reconstruct original text from an HMAC, fetch a publisher, or reopen rejected rows. This sprint's nine remaining Ikebe rows contain eight missing identifiers and one uncertain use: none can safely be promoted from retained evidence alone.

## Quality gate

`apps/cruise-port/news-quality.js` supplies the shared utility vocabulary and freshness ranking to Port, Worker and release QA. Check all ticker positions, fresh useful counts (24h/7d), event expiry, visible duplicates, per-source/whole-list mass loss and review surge. When intentionally restoring already-approved items or rejecting an item through audited review, record that exact authorized visibility transition; do not turn it into a general regression exception.
