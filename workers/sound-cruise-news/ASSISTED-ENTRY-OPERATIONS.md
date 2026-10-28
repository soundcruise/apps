# Limited assisted entry

Automatic sources retain their existing collection pipeline and budgets. This entry method does not fetch URLs, inspect publisher cookies, or bypass source health.

## Permission boundary

Only the explicitly configured Yamaha `jp.yamaha.com` guitar Topics article paths are supported. Yamaha automatic acquisition remains OFF following the 2026-10-28 answer. The earlier introduction permission supports independent factual labels, attribution `ヤマハ / ヤマハミュージックジャパン`, and direct links. The separate `www.yamaha.com` newsroom is excluded. Martin and other sources require their own verified conditions before adding an allowlist entry; this mechanism grants no permission.

## Operator workflow

1. A human reads the official article through their normal permitted browsing.
2. Open “公式記事を手動確認して登録（半自動対象のみ）” in NEWS Operator.
3. Enter the canonical article URL, actual publication date, brand/organizer, subject, type and evidenced action. Event notices also require the actual event date and venue. Never substitute the publication date for an event or release date.
4. Confirm the facts and permitted scope, then preview the independent label, category and duplicate result. An optional independently written label must retain the subject and actor. Missing facts prevent saving; duplicates cannot become READY.
5. Save as pending publication judgment. Formal validation determines READY_FOR_HUMAN_DECISION. This operation does not approve, reject or publish.
6. Make the final publication decision using the existing review flow. Later corrections use the assisted edit button; category corrections use the existing category editor and override priority.

## Evidence and safety

`news_assisted_edits` records the human actor, timestamp, before-bound immutable URL/publication identity, submitted facts, independent label, permission reference and idempotency key. `facts_provenance` explicitly identifies human official-article confirmation and zero publisher HTTP requests. No publisher HTML, original headline, images, response hash or fictional Bot success is stored. Candidate storage and audit insert are one atomic D1 batch. Optimistic concurrency protects edits; URL and publication date cannot be changed. A network-failed save retries the same operation identifier.

The existing duplicate, 90-day, global publication stop, takedown and source publication-block gates still apply. Source collection disabled status is distinct from a publication prohibition. A proof-bound assisted article can be formally approved and shown without enabling its Bot source. Automated facts recheck has no acquisition surface for assisted records. Manual category overrides, HOT/order, existing publication decisions, Ledger, feedback and Shadow are not modified by facts entry/correction.

## Release verification

Apply only additive migration `0024_assisted_entries.sql` before deploying NEWS and Operator. Do not modify Pages, Sync, Studio, cron or collection configuration. Check both Worker versions, an authenticated empty-form preview, and unchanged preexisting candidate/teacher/presentation data. Do not create a fabricated production article for a smoke test. Actual Yamaha publication requires a human to supply verified real facts and separately approve.
