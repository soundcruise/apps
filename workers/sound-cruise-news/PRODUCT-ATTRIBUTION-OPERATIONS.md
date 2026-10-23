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

The Kikutani extraction schema/parser version stays at `kikutani-listing-product-1`:
only headline rendering changed. Existing brand/model/type/purpose/card-tag/hash
proofs stay valid. A generic guitar cannot become an acoustic guitar from the
brand name or category. New candidates still require formal validation and human
publication review.

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
information labels need the brand-first nominal form; five existing own-brand,
Godin and exhibitor labels remain unchanged. Saved official listing receipts
suffice; no publisher request or source-policy change is required.
