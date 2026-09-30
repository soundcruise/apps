// Phase 2 restricted first-party scope assessments. No publisher license is inferred.
export const QUALITY_EVIDENCE=Object.freeze({
  "zoom": {
    "legalStatus": "SAFE",
    "termsUrl": "https://zoomcorp.com/ja/jp/privacy-policy/",
    "linkPolicyUrl": "https://zoomcorp.com/ja/jp/privacy-policy/",
    "policySummary": "Official manufacturer public news listing and first-party policy reviewed. No explicit automation/link grant found. Restricted daily facts-only assessment, not publisher permission: fixed recorder/firmware product nouns, independent labels, no development stories, bodies or images.",
    "reviewedBy": "operator",
    "reviewedAt": "2026-09-30",
    "robotsReviewedAt": "2026-09-30",
    "discoveryReviewedAt": "2026-09-30",
    "policyDecision": "approved",
    "robotsValid": true,
    "robotsHash": "0170f36052a23f03528b2fbc7a27f2f9fecbde1fbbd3e2da998b47e963af88f8",
    "policyDigest": "b6275c39c707ff2bc042824e500ee704f3a7e2a1ce87c2b9dfc901f8719be50e",
    "discoveryValid": true,
    "sourceRulesReviewed": true,
    "discoveryUrl": "https://zoomcorp.com/ja/jp/news/",
    "discoveryType": "official_listing",
    "allowedPaths": [
      "/ja/jp/news/"
    ],
    "deniedPaths": [
      "/ja/jp/news/application/",
      "/ja/jp/privacy-policy/",
      "/ja/jp/news/f6-development-story/",
      "/ja/jp/news/the-history-of-zoom-handy-recorders/"
    ],
    "contentTypes": [
      "product"
    ],
    "automationPolicy": "documented_silence",
    "explicitAutomationPermission": false,
    "evidenceScope": "public_factual_metadata_only",
    "saleCollection": "none",
    "guitarEvidenceRequired": false,
    "artistOnly": false,
    "crawlIntervalHours": 24,
    "discoveryProof": {
      "url": "https://zoomcorp.com/ja/jp/news/",
      "hash": "3837c0ef13d6a2ad6d2a9c72180f75cb3f05db6019e490954ed9099dedb69454",
      "at": "2026-09-30T08:47:10.186Z",
      "discovered": 12,
      "auto": 3,
      "review": 0,
      "reject": 9
    },
    "labelValidation": "live_and_synthetic",
    "allowedEventTypes": [
      "new_product",
      "release",
      "update",
      "firmware",
      "price_change",
      "discontinued",
      "recall"
    ]
  },
  "amass": {
    "legalStatus": "SAFE",
    "termsUrl": "https://amass.jp/rss/about",
    "linkPolicyUrl": "https://amass.jp/help/privacy.php",
    "policySummary": "First-party publisher expressly offers news by artist/genre tag RSS. RSS information page and privacy statement reviewed; copyright remains reserved. Internal SAFE scope assessment replaces UNKNOWN only for this one guitarist tag feed; no claim of licensed commercial republication. Named guitarist + explicit guitar evidence required; no headlines, bodies, excerpts or images retained; no full-music RSS, daily limited scope, kill/takedown.",
    "reviewedBy": "operator",
    "reviewedAt": "2026-09-30",
    "robotsReviewedAt": "2026-09-30",
    "discoveryReviewedAt": "2026-09-30",
    "policyDecision": "approved",
    "robotsValid": true,
    "robotsHash": "1d2ba4272a369509f60c446a16f4ec62ed4853c3d8d9d3a24e6aeacf41d1e4c5",
    "policyDigest": "89a90725c9c1f55c4f161ae9431bb3798ccebdd7d910d8c73cfde91a7fae0e79",
    "discoveryValid": true,
    "sourceRulesReviewed": true,
    "discoveryUrl": "https://amass.jp/rss/3745",
    "discoveryType": "rss",
    "allowedPaths": [
      "/"
    ],
    "deniedPaths": [
      "/rss/",
      "/tag/",
      "/help/"
    ],
    "contentTypes": [
      "artist"
    ],
    "automationPolicy": "documented_silence",
    "explicitAutomationPermission": false,
    "evidenceScope": "public_factual_metadata_only",
    "saleCollection": "none",
    "guitarEvidenceRequired": true,
    "artistOnly": true,
    "crawlIntervalHours": 24,
    "discoveryProof": {
      "url": "https://amass.jp/rss/3745",
      "hash": "1f301ca95aeb10a1c4e2f85b799d4e087124081504534e503feaf8cd79f2ac16",
      "at": "2026-09-30T08:47:10.476Z",
      "discovered": 21,
      "auto": 1,
      "review": 0,
      "reject": 20
    },
    "labelValidation": "live_and_synthetic",
    "articlePathPattern": "^/[0-9]+/$"
  }
});
