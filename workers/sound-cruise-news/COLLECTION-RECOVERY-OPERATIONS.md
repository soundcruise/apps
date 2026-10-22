# Daily maintenance recovery and listing evidence

## Temporary publisher maintenance

Only the already reviewed Shimamura `/maintenance.html` and AGM home-page **302
from robots.txt** are eligible for a bounded recovery probe. This is not general
redirect support. The destination is never followed. The previous run must have
stopped on that redirect; explicit operator stops, takedowns, publication blocks,
policy expiry, other failures and unreviewed destinations are excluded.

At the next eligible daily collection, a D1 claim permits one robots GET. Its
attempt clock and request log are shared with collection. Identical reviewed
robots directives and an allowed listing are required to resume. The same
robots response is reused for the ordinary collector. A repeated 302 remains
stopped with daily backoff; 403, 429, other errors or changed robots require review
and do not enter a repeated automatic probe. A resumed listing still passes its
normal structural/opt-out checks. Its original discovery watermark is retained
until successful collection so the stopped interval is covered. Recovery backlog
stays human-review-only, including on later rediscovery. No public endpoint,
permission expansion, redirect following or automatic publication is added.

## Kikutani official NEWS cards

The fixed public listing remains the only scheduled discovery surface (robots +
one listing; no pagination/details). Controlled card tags are considered together
with explicit brand/model nouns and guitar/maintenance context. An unknown brand
is not by itself an exclusion. Only a `新製品情報` card with bound product facts
can generate the new listing-derived facts. The label describes **the distributor
publishing new-product information**, never an inferred release date or unverified
acoustic/electric subtype. Unknown guitar subtype uses `media_other`.

Each retained fact requires card/article binding, current parser version, keyed
headline fingerprint and original listing-response hash. Original headlines,
HTML, descriptions and images are not retained. The formal publication validator,
duplicate/90-day/source gates and human review remain mandatory. Events without
actual dates/venues and interviews without a verified guitar subject do not gain
READY merely from an event/artist card tag. Single-item purchase gifts remain
outside the established sale policy. Existing publications are not rewritten.

## Ikebe primary product sections

Parser 12 evaluates a safe model-bound sentence separately from later accessory
and future-option specifications. Related/other-company text and anaphoric
references with an unsafe antecedent cannot corroborate a launch. Canonical URL,
publication date, manufacturer tag, type and product headings remain required.
A primary title's explicit release is classified as release. One retrieved
response is reused for extraction and replay; no extra request is added.

## Shimamura software identity

Parser 7 can bind an explicit manufacturer launch sentence to a single named
software instrument when the manufacturer is absent from the editorial title.
The product must be present in the title and independently in the primary JAN
product table. Related cards, connected equipment and ambiguous multi-product
subjects cannot supply that binding. The software-instrument subtype requires
current primary-field provenance. Explicit release facts and the printed release
date remain separate from the article publication date; no new URL/model aliases
or additional publisher requests are introduced.
