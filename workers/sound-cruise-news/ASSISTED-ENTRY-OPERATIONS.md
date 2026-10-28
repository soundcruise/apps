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

The initial Operator 0.37.1 input-to-READY path passed isolated authenticated API acceptance, but duplicate matching missed brand case differences and a single model included in a peer's explicit multi-model launch. The acceptance candidate (NEWS 0.39.1 / Operator 0.37.2) corrects only the assisted boundary. It compares explicit model identities case-insensitively and supports either arrival order. Automatic-to-automatic matching retains the existing rules. An introduction, a different version or an explicit color/edition event is not silently collapsed into the original launch. It does not split a combined model-name string or infer model aliases.

The added acceptance test uses fixed-clock, isolated human-confirmation inputs. FG7 identity/publication-day examples reference previously saved facts; article URLs and other type examples are fixtures, not newly verified Yamaha articles. The tests do not establish that a human has now visited an actual article. No production article is inserted or approved.

Acceptance covers authenticated Operator preview/save, facts/proof, generated label/category, URL collision, cross-source duplicates, reverse arrival order, missing facts, scope gates and zero external fetch. A real local workerd/D1 test additionally checks READY, replay and atomic audit rollback. It uses a local-only database binding and never connects to production D1.

First real registration still requires the human to read the permitted official Topics article, use its real publication day, enter only evidenced actor/subject/type/action, and select an action matching the article. “発売” must not substitute for “紹介” or a future release plan. Product launch dates and free-form supplemental claims are not inferred. The current supported form is intentionally limited; if a material qualifier, multiple-model identity or action cannot be represented accurately, do not force a match or register a misleading label. Category overrides remain available after saving.

This candidate must not be described as deployed merely because isolated tests pass. Shared-main, Pages and production Worker release require the applicable ownership/release approval. The original NEWS worktree, Studio clone and their refs/index/worktree metadata are not modified by this isolated acceptance branch.
