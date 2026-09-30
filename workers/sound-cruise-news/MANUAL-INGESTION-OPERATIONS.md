# Manual NEWS ingestion — operator operations

NEWS 0.7.1 / Cruise Port 1.9.0. Authenticated Cloudflare OAuth CLI only. Public HTTP has no mutation endpoint. No publisher requests are made by this CLI.

## Scope and source review

`src/manual-sources.js` is separate from the automatic source registry. Current reviewed scopes:

- `manual-apu`: APU Software home, active broad paid-product price reductions. Manufacturer's official support post may verify the deadline; publisher copy is not retained.
- `manual-ikebe`: main-host `/blog/<slug>/` guitar event/interview facts. This does not reuse PB product authorization and does not authorize automated event discovery.

For another source/surface, assess current public access, robots, applicable policy, direct links, opt-out and takedown first; add a bounded reviewed scope and tests. Absence of an explicit automation permission alone is not a prohibition. This registry never enables automatic collection. Scope evidence expires after 90 JST calendar days.

## Facts and checks

Input JSON accepts only the keys declared in `src/manual-ingestion.js`. Unknown keys, title/headline/body/excerpt/HTML/images are rejected. Confirm each `checks` and `articleChecks` entry against the actual article; do not mark checks true without inspection. Canonical official URLs must be clean HTTPS URLs matching the approved scope. Publication dates must be verified, past/current and under 90 days old.

Sale fields: `kind: sale`, `sourceId`, `officialUrl`, `publishedAt`, `seller`, `saleType`, `startDate`, `endDate`, optional `endTime`, `equipment`, `brands`, `benefit: price_reduction`, `scope: broad`, integer `percentOff`, and checks. Fixed vocabulary comes from `sale.js`; validation also passes the existing Sale classifier. Coupon/points/shipping-only, one-store, single-SKU, unclear benefit and expired promotions fail. APU's known support URL is the only currently permitted optional `verificationUrl`.

Artist/Live fields: `kind: artist_live`, common source/date/checks, `artist`, `eventType` (`concert`, `recital`, `exhibition`, `guitar_festival`, `interview`), independent `eventName`, `eventDate`, optional `endDate`, `venue`, and `relevanceReason` (`guitarist`, `acoustic_performance`, `singer_songwriter`, `guitar_centric_live`, `guitar_event`). Unknown event types and generic labels fail. Interviews enter Artist; other supported events enter Live. Exhibition labels never claim an artist performs or attends.

Original publisher titles are used transiently for normalized/near-copy comparison. Do not put them in input files, research files, shell history, logs, or committed examples. Read them interactively without echo and pipe a JSON array to the CLI in memory:

```python
# Run from workers/sound-cruise-news. facts.json contains structured facts only.
import getpass, json, subprocess
original = getpass.getpass('Original title for transient comparison: ')
subprocess.run(['node', 'scripts/manual-add.mjs', '--file', 'facts.json', '--dry-run'],
               input=json.dumps([original]), text=True, check=True)
```

Inspect the independent label and deadline, then repeat with `--apply` after checking the actual source. Default is dry-run. The apply path reads the current production API and pending review count, compares the quality gate, then inserts atomically with audit and revision. It does not overwrite existing URLs, revive tombstones, or bypass collection/publication/source STOP. An existing URL produces `inserted: false`; for a later campaign on the same evergreen URL, use a separately reviewed direct announcement URL. Never silently replace a previous campaign.

## Visibility, retention and stops

A Sale requires `sale_ends_at`. Date-only deadlines use 23:59:59.999 JST; choose a conservative verified date when the publisher's timezone is unspecified. The API, ticker and Port list automatically hide expired Sale items, including cached pages. All manual items retain the existing 90-day publication-date bound and hourly physical purge. An expired review scope hides its manual records too.

Use existing OAuth operator commands for an individual `source-disable`, item takedown, or global publication/API OFF. Manual IDs are accepted by the operator STOP registry. A source cannot be enabled using the automatic source-evidence gate; refresh/review its manual scope explicitly. Takedown and revision checks invalidate visibility immediately. Rejected/duplicate insertion never overwrites important stored data.

## Research and release gate

`research-retention.mjs` permits canonical URL, timestamp, HTTP status, hash, counts, flat allowlisted facts and reason codes only. Default query removal, explicit identity-parameter allowlists, social/share URL rejection, nested/raw-field rejection, and normalized/near-copy title checks run before writing. Publisher responses and original titles stay in memory; guard failure creates no artifact.

`quality-gate.js` compares current and candidate independent labels, useful categories, ticker top five and review burden. It blocks HIGH VALUE decreases, useful-category loss, NOISE/generic-label increases, a LOW/NOISE ticker leader, and a review queue increase above max(3, 25%). This label-based gate supplements operator relevance review; it does not claim to measure the full factual quality of an article. Each manual apply uses it; batch releases must compare the full proposed public set before deployment.
