# AGM acquisition evidence reuse

The six permission-scoped discovery surfaces are unchanged: five RSS feeds and
the News listing, plus the reviewed robots.txt. With nine reusable News articles,
a scheduled run makes **7 HTTP requests instead of 16**. Each necessary detail
GET adds one request; a conditional GET returning 304 also counts as a request.

## Reuse and revalidation

- `NEWS_AGM_REVALIDATION_DAYS` is shared by NEWS and Operator. Default **7**;
  accepted range 1–30 whole days, invalid configuration falls back to 7.
- `news_agm_article_cache` holds normalized facts, independent labels, original
  publication dates, canonical URLs, keyed headline fingerprints, parser version,
  provenance, original response hash, revalidation/attempt times and HTTP validators.
  It never retains publisher HTML, original headlines, descriptions or images.
- Listing and article headline fingerprints are separate. Changed listing headlines,
  incompatible parsers, corrupt/missing evidence and publication-date conflicts
  require an unconditional detail check. A valid retained candidate can supply
  initial cache evidence without a warm-up request; old parser proofs are not upgraded.
  Incompatible extraction changes must advance `AGM_ARTICLE_PARSER` or the cache
  format constant; cache reuse also rechecks the current formal facts validator.
- Formal evidence validation still runs on reusable facts. Discovery does not
  authorize publication, refresh the original publication date or alter human decisions.
  Duplicate, expiry and operational gates continue at their normal boundaries.
- Expired compatible evidence uses ETag and/or Last-Modified where available.
  A bound 304 advances only the revalidation timestamp, keeping the original 200
  response hash and provenance verification time. An unbound 304 fails closed.
- New/incomplete evidence receives the existing bounded detail check. A shared
  URL lease prevents concurrent acquisition. A failed/incomplete attempt suppresses
  another automatic detail attempt for 24 hours, including the facts recheck path.
  The next ordinary scheduled run may retry; no immediate second GET is added.
- A trusted internal correction job may request `forceRevalidate`; no new public
  input/HTTP endpoint or automatic retry loop exposes this option. Existing robots,
  source policy, request budget and stop/backoff checks still apply.
- Retention deletes cache receipts after 90 days without an actual detail attempt;
  reusing evidence never extends the candidate's 90-day publication window.

## Operation and verification

Apply additive migration `0020_agm_article_cache.sql` before deploying either Worker.
Existing candidates, human Ledger, feedback, Shadow and presentation records are
not migrated. Both Worker deployments are necessary because both acquire/reuse facts.
Port and its public NEWS contract are unchanged.

The `news_collection` structured log includes AGM `requests`, `requestCounts` and
`articleCache` (hits, fetched 200 responses, notModified, attempted suppression).
`collection_runs.requests` remains the authoritative total request counter.
The normal schedule remains 06:00 JST; do not force another same-day collection
to demonstrate savings. Initial runs may need a cache warm-up for old/incomplete
provenance. The first real post-deploy request reduction must be verified from the
next normal run, separately from the isolated regression test results.

Regression tests cover cold 16 / warm 7 / one new 8 requests, all six sections,
formal validation and concrete editorial labels, current/obsolete retained proof,
missing/corrupt cache, changed headlines, 7-day expiry, validators and 304, shared
recheck evidence, local workerd/D1 concurrency, opt-out/403/429, 90-day expiry,
existing publications and teacher protection. Publisher access is mocked throughout.
