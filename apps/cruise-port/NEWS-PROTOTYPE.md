# NEWS-JP2A — manual SAFE fixture

Status: Port 1.3.0 production beta release uses 23 manually reviewed SAFE fixture records.
The NEWS collector and API remain disabled; Port uses the fixture provider only.
NEWS_MODE is `beta` in news-data.js. `off` disables entry/ticker and shows an
unavailable message on #news; `on` removes the beta note.

## Manual SAFE fixture provenance

The user supplied the NEWS-JP1-B SAFE-ENOUGH FOR PROTOTYPE whitelist on
2026-09-28. The existing A2 news-40.csv was filtered locally without accessing
external sources. The fixture contains 23 real records, 23 unique topics:
Ikebe 7, Shimamura 5, Discover chuya 3, SONICWIRE 2, Kikutani 1, Hookup 1,
Sleepfreaks 1, IK Multimedia 1, AHS 1, Yamaha 1. Gear 100%, Artist 0%.

Final polish adds Yamaha FG/FS7 using the supplied jp.yamaha.com product page,
which directly describes the models. The news listing returned HTTP 403 during
verification. The product page lists October availability, so the independent
label says announced, not already released. Publication date remains September 18
as supplied by the user and A2. No newsroom URL is used.
CAJ now uses the supplied individual Shimamura article URL (web verification
returned an error); AHS uses its Instrument X setup/update page with 1.0.1 history.
The whitelist concerns publishers, so approved Ikebe coverage of VOX is retained.
Dates encode 00:00 Japan time for date-only records; no date is shifted for ticker.

Never add article bodies/HTML, descriptions or external image URLs. No collector
is connected to Port. prepareNews remains the ingestion boundary. Browser tests check
real fixture rendering with the actual clock before synthetic edge-case tests.

## Canonical record

Required: id, label (max 140 characters), sourceName, sourceUrl (HTTPS; no embedded
credentials), publishedAt/createdAt/updatedAt (UTC ISO timestamps), category,
topicKey, sourceKind, sourceSafety=safe, manualReviewStatus=approved.
sourceKind: official / distributor / retailer_editorial / media.
Artist/live additionally require manually verified guitarEvidence:
acoustic_guitar_vocal / guitar_performance / guitar_gear / guitar_recording.
Piano-only/general entertainment records must not be approved.
Unknown fields are not copied into the canonical model.

Date windows are elapsed UTC days with inclusive 7/14/90-day boundaries. Future
records are excluded. Display groups use Japan time. All helpers accept a test
clock; production dates are never rewritten. Duplicate topics choose official,
then distributor, retailer editorial, media; same-kind ties choose newest.

## Local verification

- `node --test apps/cruise-port/*.test.mjs`
- Serve repository root: `python3 -m http.server 8765 --bind 127.0.0.1`
- Run `node apps/cruise-port/tests/news-browser.cjs` with Playwright resolvable
  (the Codex bundled NODE_PATH can be used). Chrome must be installed.
- Browser checks 375/393/1024px, synthetic records, filtering, literal XSS text,
  off/beta/on, empty/error, reduced motion, focus pause, navigation, broken chunk,
  no news external requests. All outbound requests are intercepted and aborted.
  Screenshots are written to /tmp/news-jp2a.
- Existing regressions: Port 817 (809 existing + 8 NEWS tests), Shared 226, Sync 385,
  Pitch 30, Fretboard 25, Rhythm 19, Chord 95; all passed on 2026-09-28.

The app dynamically imports NEWS so a missing news chunk does not abort Home.
Both standard and Pro HTML expose the same local route and cache-versioned assets.
NEWS never touches account/sync state, localStorage or IndexedDB.
