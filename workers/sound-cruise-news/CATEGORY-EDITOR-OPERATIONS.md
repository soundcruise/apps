# NEWS category editing

The existing ten categories remain unchanged. `candidate_items.category` and
`product_facts.category` retain their primary-evidence classification. Manual
presentation categories live in `news_category_overrides`, applied by the public
API (including filters/ticker) and Operator views. They take precedence over every
collector, facts recheck, historical replay and administrative facts repair,
without changing facts, source gates, duplicate identity, deadlines or READY.

An authorized human Access session can open a candidate's category editor for an
approved, pending or reopened, unexpired article that is not taken down or
publication-blocked. There is no new approval/rejection operation. A category
change cannot repair missing evidence or promote a candidate to READY.

`GET /api/candidates/:id/category` returns current/evidence categories, current
snapshot/revision, the formal category choices and the latest 20 category edits.
`POST /api/category` requires the existing same-origin/Access/CSRF controls, a UUID
request ID, existing category and matching candidate snapshot/revision. System
actors and arbitrary additional fields are rejected. A full row CAS inserts one
edit receipt; SQLite triggers atomically update the override, increment review
revision and invalidate the public cache. A transaction failure rolls back all
four writes. The exact operation can be replayed after a lost response without a
second edit. Concurrent category, decision or facts changes fail closed.

Category history retains ID, old/new category, time, verified Access actor and
`manual_category_edit`, without source prose or tokens. It is separate from
Ledger/feedback/Shadow, retained for 365 days. Orphan overrides are purged when the
90-day article retention removes their candidate. Selecting a category again
remains a manual designation; no implicit reset to automatic classification.

UI: expand “カテゴリを変更”, select “表示カテゴリ”, choose “変更内容を確認”,
check old → new, then “カテゴリを保存”. Errors are shown locally and in the page
notice. Public categories update without unpublish/republication. Unsaved HOT/
order changes must first be saved or cancelled; category saves do not discard or
write presentation preferences. Publication confirmation always reads a fresh
candidate snapshot and accepts its effective display category.

Kikutani parser v3 recognizes acoustic guitar types explicitly bound to the
quoted main product, not the distributor or a brand default. Acoustic construction
is proven by v3 field-level provenance; older v1/v2 identity and launch proofs
remain supported. Generic guitar tools stay guitar/bass, vague guitar types stay
unresolved, and accessories/related use/tone analogies do not prove acoustic type.

2026-10-23: audit all 11 approved Kikutani articles. Owner-confirmed BAN1V/BAN2V
and BAR2R need display-category correction from media_other to acoustic_guitar.
BAN4CE bk already has acoustic_guitar. MUSICNOMAD MN238/MN871/MN872 retain
 electric_guitar_bass because the saved evidence proves general guitar tools.
Use the authenticated UI for the two authorized production corrections after
backup/preview, all regression tests, migration 0022 and Worker deployment. Verify
all candidate fields except review_revision, all public fields except the two
categories, and Ledger/feedback/Shadow/HOT/order/source states before and after.
