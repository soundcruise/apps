# Product attribution and published headline corrections

`product-attribution.js` separates the information source, verified product brand,
announcement actor and headline subject. A source name cannot fill a missing brand.
An actor must be backed by a product-bound explicit primary-subject fact; a known
brand alone does not prove that it announced, released, distributed or sold a product.

Product-information headlines use a nominal form (`Brand、機材「Model」の新製品情報`)
when only the information notice is established. They do not assert a launch or a
brand's publication action. This renderer is shared by Kikutani's controlled news
cards, common product-information rendering and published presentation facts.
Other existing source-specific extraction and launch validations stay in place.

Kikutani parser `kikutani-listing-product-2` adds optional, identity-bound listing
action facts. Version 1 proofs remain valid for their existing identity/type facts;
only version 2 can prove `listingNotice`. A tag alone is not a launch action.
Without a verified action, the renderer uses `Brandの機材「Model」を紹介`, describing
the introduction rather than asserting a manufacturer's launch. Unknown guitar
product grammar is retained as facts-incomplete review, never invented READY.

A generic guitar cannot become acoustic from its brand/category. For an explicit
owner confirmation, `headlineQuality.evidence` separately records
`owner_product_type_confirmation`, a bounded confirmation reference and only the
`productType` field. It cannot prove publisher identity/action/date, cannot carry
a publisher response hash, and never enters the human decision teacher. Original
source facts and their proof are retained unchanged.

For owner-authorized corrections to approved articles, use
`publishedCorrectionStatements` with reviewed, article-bound `headlineQuality`
and appended provenance. A saved structured-facts receipt must cover identity,
type and action. Plans must identify explicit existing IDs, compare all current
row fields, expire after one hour and fail closed on concurrent edits/takedowns.
Do not use approve/reject, delete/reinsert or pending-recovery pathways.

The correction preserves underlying product facts, duplicate identity, source,
URL, publication date and human decision. It changes only the display label,
additive presentation facts/proof and review revision, with an administrative
audit entry and public cache revision. Ledger, feedback, Shadow and presentation
preferences (HOT and day-local order) are excluded from writes.

2026-10-23: reviewed all 11 approved Kikutani articles. Six distributor product
information labels use verified identity/type/purpose and neutral introductions;
the owner confirmed the acoustic type of BAN1V/BAN2V and BAR2R. Five existing
own-brand, Godin and exhibitor labels remain unchanged. No publisher request or
source-policy change is required.
