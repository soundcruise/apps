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

## 2026-10-28 final technical acceptance candidate

Candidate versions: NEWS 0.39.2 / Operator 0.37.3. Initial assisted duplicate gaps (brand case, explicit multi-model membership and reverse arrival order) are covered, together with old published product identities stored only in `headlineQuality`.

The legacy adapter is read-only. It requires the existing schema/label validator, approved status, bound candidate ID and source URL, original publication within 90 days, identity/type/action evidence and the matching latest authorized headlineQuality provenance receipt. Unsupported receipts, changed bindings, future verification timestamps and display text without facts are not trusted. Explicit modern brand/product/models identities retain their original comparison path.

Comparison identities normalize brand spelling/case, product/type, version, qualifier, action family and explicit dates. Announce/release/scheduled release are the original launch family. Introductions, new colors, specification changes, reissues, different types/brands/versions and conflicting explicit dates are separate. Product families are never expanded by prefix. An explicit list in the verified product field can yield complete model-code members (spaced slash or full-width slash); partial prefixes and ambiguous codes such as LL16D/ARE are not completed or split. No display headline is parsed into facts.

This identity is not copied into candidate facts or persisted. It does not make an old article READY, migrate old rows, or change existing human/publication decisions. Only comparisons involving assisted entries gain the compatibility bridge. Legacy-to-legacy and other automatic-to-automatic semantics remain unchanged. Same canonical URL/publication identity remains a duplicate even when its action wording differs.

Preview/save/validation and the final human decision share this comparison. A bound JSON snapshot fences the approved comparison peers, including nonmatches, against concurrent insertion, deletion or editing. The pending save and decision SQL check the fence atomically. The snapshot is server-only and is not exposed in Operator responses or written to D1. Bounded comparison sets fail closed rather than bypassing duplicate checks.

Acceptance uses fixed-clock isolated human-confirmation inputs and a sanitized saved legacy metadata fixture. The fixture's independent Sound Cruise label is not an original publisher headline. It does not claim a new Yamaha visit. Tests include unsupported trust conditions, independent events, brand/model overlap, exact URL identity, reverse order, unchanged old-to-old behavior, concurrent evidence changes, and actual local workerd/D1 decisions/rollback. No production article is inserted or approved.

First real registration still requires a human to read a permitted official Topics article, use the real publication day, and enter only evidenced actor/subject/type/action. A scheduled release must not be described as already released. Unsupported qualifiers/actions must not be forced into the launch choice to obtain READY. Category overrides remain available after saving.

This is an unmerged Draft PR candidate. Shared-main/Pages integration and production Worker release require separate acceptance/approval. No migration, deployment, source enablement or publisher acquisition is part of this repair.
