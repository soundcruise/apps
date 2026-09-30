# NEWS Quality + Coverage Phase 2 — decisions before rollout

## Scope and success metric

Improve useful, unique factual news, not source count. Port 1.7.0 / NEWS Worker 0.5.0. No schema migration, Sync, Account, AI, publisher bodies or images. Initial production: c5d1ab0d, Port 1.6.0, Worker 0.4.0, visible 30. Original 23 fixture-equivalent articles are archive coverage; do not count three pre-Phase-1 AUTO records as new supply merely because their origin is automatic_collection.

## Current source audit

Shimamura: 11 / AUTO 8 / REVIEW 3; latest run duplicate 11; new Phase-1 publications 3. Three installation/AV/furniture records were rejected; two products duplicated legacy.
Kikutani: 20 / AUTO 2 / REVIEW 1 / REJECT 17; fresh publication 1. Explicit guitar recital was a confirmed metadata-level recall opportunity; generic artist profiles cannot safely infer instrument or product. The new recital template requires explicit guitar and recital, and blocks piano/cancel/postpone AUTO. It does not fabricate performer/event dates.
Sleepfreaks: 10 / AUTO 4 / REVIEW 0 / REJECT 6; new publications 3. Five exclusions are AI/general seminar/tutorial paths. LAVA STUDIO has a truthful model/brand alias and is recovered; manufacturer ownership is not inferred from unrelated words.
Natalie: repeated generic feed sample 30 / AUTO 0 / REVIEW 0 / REJECT 30. Rejection is source_scope, not proof that the publisher has no guitar news. Generic feed has no explicit publication date for these Atom entries; updated is not promoted into published. An official topic tag was checked but did not establish a usable guitar-specific surface. Remove it from production allowlist.

## New sources and evidence

ZOOM: fixed `https://zoomcorp.com/ja/jp/news/`, 12 cards. Three eligible recorder/microphone firmware or release facts; eight older than 90 days, one development-story exclusion. Published time is written English date interpreted as JST. Only reviewed manufacturer model nouns can infer ZOOM identity from first-party listing; event must be a release/update/firmware/recall etc. No generic development/history content. First-party privacy policy is privacy-focused, not an automation license. SAFE whitelist plus documented-silence limited factual assessment; robots allow, explicit daily bounds, opt-out and kill remain.

amass: first-party RSS guidance explicitly offers artist/genre tag RSS; `https://amass.jp/rss/3745` is reached from the official Rick Nielsen tag page. 21 entries: one in-window explicitly named guitarist + guitar; 20 old entries. In-window relevant precision 1/1, zero review; no generic feed enable. Internal SAFE scope assessment applies only to this fixed RSS; copyright remains reserved, no publisher license asserted. A single scoped feed is sparse and does not complete singer-songwriter/Artist coverage. One article was manually fetched only to discover its official tags; no article body/excerpt/headline/image was retained. Runtime performs no article fetch.

## Sources deliberately not enabled

- Ikebe PB: prior robots404 and applicable policy gap remain. Alternate official main host robots is valid; trade-law/membership pages do not grant automatic news rights. Sale-category sample had expired, old, shop/used/points/uncertain campaigns, not a current high-quality broad sale. No production host change or permission inference.
- Sound House: one 15-second robots attempt failed again. No alternate user-agent, proxy, authenticated session or denial workaround. OFF.
- IK: official public promos list inspected with legal/trademark pages; displayed news_date contains until/deadline, not reliable publication dates. Offers were principally individual bundles/model deals, not verified broad current manufacturer campaign metadata. OFF; do not publish end dates as new article dates. Forum and Tone.net rules do not authorize the corporate news site.
- Audio-Technica: first-party terms permit identified links with no framing/false affiliation and mandatory takedown. Robots404 was assessed for investigation only, not activated in registry. Official HTML had no article metadata; news bootstrap uses stateful client APIs. No CSRF/API-control workaround. OFF pending fixed public metadata surface.
- Hookup: applicable terms reserve expression rights. Official news is client-rendered, blog RSS mostly interview/how-to rather than product announcement. Support RSS exceeds bounded response; no increasing request cap to chase coverage. OFF.
- Deviser: official RSS exposes known maker categories and fragments (e.g. Headway DSP-OSAMURAISAN); missing model identification for relevant-looking releases remains. Category or finish fragment cannot invent model names/series. OFF.
- SONICWIRE: prior feed header opt-out preserved; no alternate format/path used to evade it. OFF.
- Shimamura fair listing: mostly local shop/wind-instrument promotions; no broad current sale established. Product-only source rules are unchanged.
- Skream: generic/artist index exists but publisher terms are hosted on another official host with robots404 and applicability/metadata narrowing unresolved. OFF.
- TFT: generic entertainment and separate corporate policy, no independently validated guitar-specific surface. OFF.
- AGM/KORG/ESP/Yamaha newsroom: CONTACT remains, no permission received; no outreach.
- Takamine/Kurosawa: DO_NOT_USE preserved; no requests.
- Yamaha403, Roland/AHS/chuya unparseable robots, Kanda redirect and Morris policy gap preserved from fresh same-day Phase 1 evidence. No denial bypass.

## Operations and rollback

Allowlist is immutable-code evidence gated. ZOOM/amass each use one robots + one metadata request per run (2 max), daily06JST. Scheduled day leases, failures/backoff/refusal, health, retention90d and original-date preservation are unchanged. Existing ARTICLE checks/expiry/sale boundaries are retained. UNKNOWN or incomplete sources do not become enabled merely from env IDs.

Immediate source kill: `node scripts/operator.mjs control source-disable SOURCE_ID quality_review`. CLI fails closed with API OFF; after verifying the target state, explicitly restore with `node scripts/operator.mjs control api-on global review_complete`. Do not delete source rows or rebuild D1. Generic Natalie stays out of current allowlist even if its old health last-success remains.

Rollback to previously audited 0.4.0 collection code/config is schema-compatible (no new migrations). Prefer current hard-OFF infrastructure deployment for systemic rollback. Do not roll back a collection-running pre-0009 positional-insert version. Pages uses normal revert/push; no reset or force push. New rows can remain hidden by source allowlist; archive grants and user data are preserved.

## Remaining quality gaps

Sale is NONE. Recording is useful but sample is older firmware/release data, not fresh interface launches. Artist has one actual scoped guitarist story; domestic singer-songwriter breadth and event dates remain poor. Further evidence/discovery work is necessary before claiming a daily all-field news digest. User value remains the expansion criterion.
