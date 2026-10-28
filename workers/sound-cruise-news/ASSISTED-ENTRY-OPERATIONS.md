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

## Paste UX candidate (Operator 0.38.0)

The default entry has two text fields: article URL and necessary human-confirmed information. The start link opens the permitted Yamaha guitar Topics listing in the human's browser. The app never opens it automatically. It must not change to another host if that link is unavailable.

Paste only the relevant facts, including a clearly identified article publication date. The parser accepts explicit factual lines or an unambiguous actor/type/quoted-subject/action sentence. For example, in an **isolated fixture**, `記事公開日：2026年10月27日` and `Yamahaはアコースティックギター「TEST-100」を発表しました。` supply the facts without separate brand/model/type/action entry. Bare dates, unbound subjects, multiple independent announcements and ambiguous fields require clarification. Only missing fields are displayed. New colors, changed specifications and planned releases must not be forced into the supported launch choices; this candidate does not add an event schema for them.

“記事案を作る” parses the supplied information through an authenticated, CSRF-protected, read-only endpoint and calls the existing assisted preview. It shows an independent label, category, interpreted facts, article date, manual-confirmation provenance and duplicate result together. A confirmation checkbox remains necessary. A duplicate blocks the simple UI save. Saving uses the original audited/idempotent transaction and formal validation, then reads the resulting candidate back and refreshes the existing review list. Saving and publication remain separate.

The paste is transient: it is neither logged, inserted into D1, used as a publisher response/hash, nor published. Only the confirmed structured facts enter the existing manual-provenance audit. This is a deterministic bounded parser, not a claim of complete natural-language understanding. The optional detailed entry and existing correction UI remain available. Only Yamaha is enabled for assisted entry; its automatic source remains OFF. No cron, collector, source state, acquisition budget or source permission changes are included.

Validation includes unit/API tests, a localhost-only in-memory UI fixture (`node test/assisted-paste-ui-server.mjs`), responsive manual browser acceptance and the full existing suites. The fixture has a fixed synthetic identity, no production credentials/bindings, and rejects all external fetches. It must never be deployed. This UX revision requires its own integration/release approval; the prior PR #34 fixed-head approval does not authorize publishing subsequent changes.

## Product-type reacceptance candidate (2026-10-29)

Candidate versions: NEWS 0.40.0 / Operator 0.39.0. Production remains unchanged. New precise type choices are confined to assisted entry and use existing NEWS categories; no automatic collector, registry, cron, budget or robots policy is changed.

`assisted-product-type.js` resolves the whole noun phrase, not a substring or longest matching keyword. It first separates explicit usage/compatibility relations (`用`, `向け`, `対応`) and marked accessory notes, then resolves the main noun against exact aliases. Thus an electro-acoustic pickup remains a pickup, with electro-acoustic guitar recorded separately as its usage target. Nested/unknown relations, unsupported main nouns, independent alternatives and conflicting type claims remain unresolved. Missing type does not prevent other confirmed fields from being retained; the UI asks for the missing type only when those other fields are known.

Parsed type evidence stores only the bounded factual noun phrase, its role split and method/version. It is explicitly human-supplied information, never a publisher HTTP response. Preview/save independently reconstruct the type evidence and require its main noun, category and headline to agree. A manual follow-up uses `human_type_selection`, while a parsed phrase uses `human_supplied_type_phrase`. Both retain the existing human-confirmation provenance, immutable publication identity and atomic audit. Old assisted records without this new evidence retain their read compatibility; there is no migration or regeneration. The old generic accessory choice is no longer offered for new entry because it cannot establish a precise main product type.

Preamp, footswitch, tuner, strings, case and effects options preserve their specific noun in the label. Electronics map to the existing amps/effects category; strings/cases/tuners map to the existing guitar/bass category. Guitar usage alone never turns an accessory into an instrument. Category overrides remain separate and authoritative.

Acceptance covers field-form and action-bound sentence inputs through facts, headline, category, validation and formal READY, as well as ambiguous/unsupported types that must not save. Existing assisted, legacy duplicate, auth/CSRF, replay, atomic rollback, presentation/category and automatic collection tests are rerun. This candidate remains a Draft PR and requires a new fixed-head integration approval after acceptance. No production article, decision, source enablement, migration or deployment is part of this work.
