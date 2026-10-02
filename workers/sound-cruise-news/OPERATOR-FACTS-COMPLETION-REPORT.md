# NEWS Operator Review Phase A.5 — Facts Completion Report

## Overall Verdict

Safe recheck infrastructure deployed. Partial event facts recovered; **0/13 are approvable** under the unchanged publication policy. This is not a claim that all pending articles became decision-ready. No approve/reject was performed.

## 1. Starting Baseline

2026-10-02T10:19:47Z: main = origin/main d0e6b258, ahead/behind 0/0, tracked/staged clean. Known untracked .claude/ and workers/sound-cruise-sync/node_modules/ untouched. NEWS 0.10.0; Port 1.13.1. Approved 49 / pending 13 / rejected 19; ledger 0. Public version 6867244e-f42c-4a5f-a733-49a34e58a829; Operator 064a8919-d934-4a07-a553-78ae0efb1502.

## 2. Current Pending Audit

Snapshot before recovery (IDs shortened here; full identity/details below).

| Candidate | Source | Current blocker | Missing facts | Duplicate | Reviewability |
|---|---|---|---|---|---|
| bd2d0be4e4 | IK Multimedia | facts_incomplete | 確認済みの製品識別情報（メーカー／製品名・型番） | NO | FACTS_RECOVERY_UNCERTAIN |
| 368e218d4d | 池部楽器 | facts_incomplete | 確認済みの製品識別情報（メーカー／製品名・型番） | NO | FACTS_RECOVERY_UNCERTAIN |
| 4020bf1b51 | 島村楽器 | facts_incomplete | 確認済みの製品識別情報（メーカー／製品名・型番） | NO | FACTS_RECOVERY_UNCERTAIN |
| 4632d340b4 | 島村楽器 | duplicate | — | YES | DUPLICATE_BLOCKED |
| b2b7643732 | 島村楽器 | facts_incomplete | 確認済みの出来事（発表・発売・更新等） | NO | FACTS_RECOVERY_UNCERTAIN |
| b3462045cf | 池部楽器 | facts_incomplete | 確認済みの製品識別情報（メーカー／製品名・型番） | NO | FACTS_RECOVERY_UNCERTAIN |
| b44fe9ca6a | 池部楽器 | facts_incomplete | 確認済みの製品識別情報（メーカー／製品名・型番） | NO | FACTS_RECOVERY_UNCERTAIN |
| b7cb377c37 | 池部楽器 | facts_incomplete | 確認済みの製品識別情報（メーカー／製品名・型番） / 確認済みの出来事（発表・発売・更新等） | NO | FACTS_RECOVERY_UNCERTAIN |
| bf0895e203 | 島村楽器 | facts_incomplete | 確認済みの製品識別情報（メーカー／製品名・型番） / 確認済みの出来事（発表・発売・更新等） | NO | FACTS_RECOVERY_UNCERTAIN |
| 3a6dd027f7 | 池部楽器 Events | facts_incomplete | 人物・イベント種別・開催日・会場・ギターとの関連 | NO | FACTS_RECOVERY_UNCERTAIN |
| b5c0c40743 | IK Multimedia | facts_incomplete | 製品本体／拡張・パック等の対象範囲 | NO | FACTS_RECOVERY_UNCERTAIN |
| 5343ab1aab | 池部楽器 | facts_incomplete | 確認済みの出来事（発表・発売・更新等） | NO | FACTS_RECOVERY_UNCERTAIN |
| a740971f36 | IK Multimedia | facts_incomplete | 確認済みの製品識別情報（メーカー／製品名・型番） / 確認済みの出来事（発表・発売・更新等） | NO | FACTS_RECOVERY_UNCERTAIN |

### Candidate details — before

#### bd2d0be4e4

- ID: bd2d0be4e45e696a20ad5a3b7919b8ec3261eb132ded7168d6646ae7ef6d7a4a
- Source: IK Multimedia (ik)
- Category: amps_effects
- Cruise label: 審査待ち（製品名と出来事の確認が必要）
- Date: 2026-10-01T00:00:00.000Z
- Source URL: https://www.ikmultimedia.com/news/?item_id=19855
- Review reason: label_required / label_required
- Current facts: null
- Publication blockers: facts_incomplete
- Duplicate: none

#### 368e218d4d

- ID: 368e218d4d5072a545f671dbf0b50dff5a7a6c21e5e6bf0fe545213cc2b9f3cb
- Source: 池部楽器 (ikebe)
- Category: recording_audio
- Cruise label: 審査待ち（製品名と出来事の確認が必要）
- Date: 2026-09-30T15:00:00.000Z
- Source URL: https://www.ikebe-gakki-pb.com/new_product/172649/
- Review reason: label_required / label_required
- Current facts: null
- Publication blockers: facts_incomplete
- Duplicate: none

#### 4020bf1b51

- ID: 4020bf1b51afb5a9a6d290f79281834f27d30314282da0a1553d9b8b08fed92f
- Source: 島村楽器 (shimamura)
- Category: electric_guitar_bass
- Cruise label: 審査待ち（製品名と出来事の確認が必要）
- Date: 2026-09-30T15:00:00.000Z
- Source URL: https://www.shimamura.co.jp/update/guitar-bass/2026/10/89868/
- Review reason: label_required / label_required
- Current facts: null
- Publication blockers: facts_incomplete
- Duplicate: none

#### 4632d340b4

- ID: 4632d340b4ef7ea60e45df539514f767fdbc103aa6c68921d0353235a949b949
- Source: 島村楽器 (shimamura)
- Category: amps_effects
- Cruise label: LAVA MUSIC、LAVA STUDIOを発表
- Date: 2026-09-30T15:00:00.000Z
- Source URL: https://www.shimamura.co.jp/update/amp-effector/2026/10/84665/
- Review reason: factual_label_ready / structured_review_required
- Current facts: {"brand":"LAVA MUSIC","product":"LAVA STUDIO","version":null,"category":"amps_effects"}
- Publication blockers: duplicate
- Duplicate: https://sleepfreaks-dtm.com/dtm-materials/lava-studio/

#### b2b7643732

- ID: b2b7643732e29e4f0d616141ff04598228e304a8d187e5a33b3fe48db0a44536
- Source: 島村楽器 (shimamura)
- Category: recording_audio
- Cruise label: MV6の製品情報（要確認）
- Date: 2026-09-30T15:00:00.000Z
- Source URL: https://www.shimamura.co.jp/update/dtm-recording/2026/10/90252/
- Review reason: classification_uncertain / classification_uncertain
- Current facts: {"brand":"SHURE","product":"MV6","version":null,"category":"recording_audio","identifierBasis":"explicit_model_code"}
- Publication blockers: facts_incomplete
- Duplicate: none

#### b3462045cf

- ID: b3462045cf60048fd40ed3efd260453b8d69089647e61538e7f3625d5518c88f
- Source: 池部楽器 (ikebe)
- Category: recording_audio
- Cruise label: 審査待ち（製品名と出来事の確認が必要）
- Date: 2026-09-30T15:00:00.000Z
- Source URL: https://www.ikebe-gakki-pb.com/new_product/172622/
- Review reason: label_required / label_required
- Current facts: null
- Publication blockers: facts_incomplete
- Duplicate: none

#### b44fe9ca6a

- ID: b44fe9ca6a358d9cb333956f9823903f2079b54a8dd240096c262fd5101831d5
- Source: 池部楽器 (ikebe)
- Category: amps_effects
- Cruise label: 審査待ち（製品名と出来事の確認が必要）
- Date: 2026-09-30T15:00:00.000Z
- Source URL: https://www.ikebe-gakki-pb.com/new_product/172640/
- Review reason: label_required / label_required
- Current facts: null
- Publication blockers: facts_incomplete
- Duplicate: none

#### b7cb377c37

- ID: b7cb377c374722cf20bc5b9da2aed032dae4e03984573ac1193eca98fc92d286
- Source: 池部楽器 (ikebe)
- Category: amps_effects
- Cruise label: 審査待ち（製品名と出来事の確認が必要）
- Date: 2026-09-30T15:00:00.000Z
- Source URL: https://www.ikebe-gakki-pb.com/new_product/172658/
- Review reason: label_required / label_required
- Current facts: null
- Publication blockers: facts_incomplete
- Duplicate: none

#### bf0895e203

- ID: bf0895e2038bdbbef32652e055571dfd47f7a7065e7276f8191cfa37bcfe3c88
- Source: 島村楽器 (shimamura)
- Category: acoustic_guitar
- Cruise label: 審査待ち（製品名と出来事の確認が必要）
- Date: 2026-09-30T15:00:00.000Z
- Source URL: https://www.shimamura.co.jp/update/guitar-bass/2026/10/89963/
- Review reason: label_required / label_required
- Current facts: null
- Publication blockers: facts_incomplete
- Duplicate: none

#### 3a6dd027f7

- ID: 3a6dd027f7b38e59be5d4f7914d47d278c1794f806409b62d38a81a949571f08
- Source: 池部楽器 Events (ikebe-event)
- Category: live_guitar
- Cruise label: 審査待ち（人物・日時・会場の確認が必要）
- Date: 2026-09-17T15:00:00.000Z
- Source URL: https://www.ikebe-gakki.com/blog/20261021-aco-workshop/
- Review reason: classification_uncertain / classification_uncertain
- Current facts: null
- Publication blockers: facts_incomplete
- Duplicate: none

#### b5c0c40743

- ID: b5c0c40743312c4f6c874924662b353ee970947208e4e070d12bd3ce0c129c23
- Source: IK Multimedia (ik)
- Category: dtm_software
- Cruise label: ReSingの製品情報（要確認）
- Date: 2026-09-17T00:00:00.000Z
- Source URL: https://www.ikmultimedia.com/news/?item_id=19790
- Review reason: label_required / label_required
- Current facts: {"brand":"IK Multimedia","product":"ReSing","version":null,"category":"dtm_software","identifierBasis":"official_manufacturer_model","manufacturerSource":"ik","scopeUncertain":true}
- Publication blockers: facts_incomplete
- Duplicate: none

#### 5343ab1aab

- ID: 5343ab1aabd9de0661c790a89e4e53e2748f345a46981377b04d6457415f13b1
- Source: 池部楽器 (ikebe)
- Category: amps_effects
- Cruise label: KORG、Nu:Tekt NuTube OD-KIT CUSTOM CRAFT BD-Sの製品情報
- Date: 2026-09-16T15:00:00.000Z
- Source URL: https://www.ikebe-gakki-pb.com/new_product/172475/
- Review reason: classification_uncertain / label_required
- Current facts: {"brand":"KORG","product":"Nu:Tekt NuTube OD-KIT CUSTOM CRAFT BD-S","category":"amps_effects","version":null,"identifierBasis":"reviewed_listing_model","listingSource":"ikebe"}
- Publication blockers: facts_incomplete
- Duplicate: none

#### a740971f36

- ID: a740971f365a8fdcce2e32ddd03c6c4f0f7d301db127e50a71a10075b1cc3cdb
- Source: IK Multimedia (ik)
- Category: amps_effects
- Cruise label: 審査待ち（製品名と出来事の確認が必要）
- Date: 2026-08-06T00:00:00.000Z
- Source URL: https://www.ikmultimedia.com/news/?item_id=19650
- Review reason: label_required / label_required
- Current facts: null
- Publication blockers: facts_incomplete
- Duplicate: none

## 3. Required Facts

Existing operator-publication-1 is unchanged.

- Product: validatedProductFacts-recognized identifiers/category/version where present; supported event_type other than 'other'; no scopeUncertain; factualLabel/validLabel; known nonfuture publication date within 90 days and unexpired candidate. Brand is not universally mandatory: existing distinctive-software-model path permits a null brand.
- Named guitar event: existing assessed guitarist/type/explicit date/venue/relevance evidence; highValueLabel whitelist and eventEndsAt. No URL-date or shop-tag venue inference. Generic guitar_event requires its existing evidence/label and event date.
- Artist/interview/sale: their existing kind-specific label/evidence/deadline/authorized-source checks. No new required fields.
- Every type: legal/source/health/kill/takedown, fingerprint, source URL/path, duplicate checks and final human checklist/decision CAS. No exception for operators.

## 4. Facts Recovery Architecture

POST /api/facts-recheck requires Access identity, exact Origin, session CSRF and exact bounded JSON {id,snapshot,revision,requestId}. No facts/URL/label supplied by the client. Server chooses the assessed surface. Fixed listing recheck for Shimamura/Ikebe/IK; direct public article fields only for Ikebe Event. One source recheck per 24h, source lease shared with collection, two publisher requests maximum (robots + permitted surface). A facts-only source cache avoids multiplying requests across 13 candidates. No other sources/pages, assets, images, redirects or pagination. The article-first preference does not override listing-only source policy.

## 5. Parser Reuse

Reuses parseShimamuraListing, parseOfficialListing/parseLegacyListing, candidateFrom, factualLabel, factualTopicKey, sourceUrl/robotsPolicy/boundedFetch, legalGate, eventEndsAt and publicationValidation. Event extraction is in shared high-value.js, restricted to explicit labeled event sections. No operator inference dictionary, search snippets, AI-generated facts, new model/person scope or publication gate edits.

## 6. Fact Provenance

Per field: source URL/ID, verifiedAt, extraction method, parser version and transient response SHA-256. Stored with atomic recovered patch or unchanged-facts verification record. No raw HTML, source headlines, body or images retained. Source projection cache expires after 24h; operational recovery evidence after 90 days.

## 7. UI Changes

Shows missing facts, publication blockers, permitted recheck surface/method, last check/outcome and field provenance. '事実を再確認' never sends a decision. Existing approve/reject confirmation/checks/outbox are preserved. Recovered facts may remain incomplete and approval stays disabled.

## 8. Atomicity / Concurrency

Full candidate row snapshot + review_revision checked before fetch and in conditional INSERT at commit. Additive D1 trigger commits candidate fields/provenance/revision/audit atomically. Kill/source-backoff/takedown are rechecked at SQL boundary. Concurrent decision/content change aborts; recovery cannot revive decided candidates. Actor-bound request hash and unique request ID give exact retry; changed retry payload rejected. Recovery is excluded from decision ledger/feedback.

## 9. Duplicate Handling

LAVA STUDIO keeps duplicate error and existing Sleepfreaks direct link; no fetch, fact rewrite or duplicate override. Recovery never changes published-row comparison policy.

## 10. Current 13 Reviewability

| Candidate | Before | Facts recovered | After | Can approve | Can reject |
|---|---|---|---|---|---|
| bd2d0be4e4 | FACTS_RECOVERY_UNCERTAIN | facts_not_recovered | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| 368e218d4d | FACTS_RECOVERY_UNCERTAIN | facts_not_recovered | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| 4020bf1b51 | FACTS_RECOVERY_UNCERTAIN | facts_not_recovered | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| 4632d340b4 | DUPLICATE_BLOCKED | facts_duplicate_preserved | DUPLICATE_BLOCKED | NO | YES |
| b2b7643732 | FACTS_RECOVERY_UNCERTAIN | facts_unchanged | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| b3462045cf | FACTS_RECOVERY_UNCERTAIN | facts_not_recovered | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| b44fe9ca6a | FACTS_RECOVERY_UNCERTAIN | facts_not_recovered | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| b7cb377c37 | FACTS_RECOVERY_UNCERTAIN | facts_not_recovered | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| bf0895e203 | FACTS_RECOVERY_UNCERTAIN | facts_not_recovered | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| 3a6dd027f7 | FACTS_RECOVERY_UNCERTAIN | 開催日・会場・種別・関連evidence | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| b5c0c40743 | FACTS_RECOVERY_UNCERTAIN | facts_unchanged | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| 5343ab1aab | FACTS_RECOVERY_UNCERTAIN | facts_not_on_current_surface | FACTS_RECOVERY_UNCERTAIN | NO | YES |
| a740971f36 | FACTS_RECOVERY_UNCERTAIN | facts_not_recovered | FACTS_RECOVERY_UNCERTAIN | NO | YES |

Results: 13 rechecks; one partial facts update, two unchanged-facts verifications (SHURE MV6/ReSing), one item absent from the current listing (KORG 172475), eight without recoverable identifiers, one duplicate preserved. Four successful surfaces × two requests = eight publisher requests maximum. The event article explicitly names an instructor, but the conservative extractor did not confirm that field; it was not guessed or stored. Its named person is also outside the existing assessed-artist label whitelist, so recording the name alone would not enable approval. Other unresolved product identifiers/actions/scope remain pending.

## 11. Decision Learning Boundary

Ledger remains 0. Recovery table is not decision feedback or a training signal. Only actual final decisions write the existing ledger; CLI system_repair attribution remains conservative. A synthetic test proves recovered facts → final human decision → one human_operator ledger entry, without touching production.

## 12. Security / Safety

Existing Access app/policy, one approved operator, 6h session, JWT signature/issuer/audience/expiry/type, server allowlist, CSRF, Origin, CSP and authenticated static assets remain unchanged. No bypass or public admin route. Redirect/size/robots/header opt-out checks retained. Opt-out/access refusal/robots changes stop the source; 429/5xx enforce backoff. Parser/timeout/malformed-response failure leaves candidate and existing public visibility unchanged and blocks repeated recheck traffic via cache. Verified facts are not an override.

## 13. Tests

NEWS 399/399 PASS (379 previous + 20 facts tests); Port NEWS 27/27 PASS. SQLite and actual local workerd/D1 tests cover missing/recovered/partial facts, products/events, invalid/disabled source, parser/upstream/timeout/redirect/size/optout, stale snapshot, concurrent decision/content edit, cache/rate bounds, retry/payload conflict, atomic rollback, duplicate and final human attribution. Existing Phase A security/decision tests pass; recheck endpoint authentication/CSRF added. Syntax, diff-check, dry-run and secret scan pass. Real rendered synthetic fixture verifies approve enabled; production 13 correctly disabled. Mobile 375/393px without horizontal overflow.

## 14. Versions / Deploy

NEWS 0.11.0 (new capability); Port stays 1.13.1. Additive NEWS D1 0012 migration only, preceded by private SQL backup. All 81 candidate business rows and ledger stayed identical across migration. Operator final version 7a2dd37f-2cab-4918-95ac-29cf7cfe6c58; public final version 0adf4c4d-df21-41eb-b50c-3c5fb7b9cb5e. Existing source allowlist/Cron and Access remain.

## 15. Production Verification

Approved 49 / pending 13 / rejected 19; decision ledger 0. Only event candidate 3a6dd027f7 business fields updated (verified facts, event deadline, provenance/revision); every other candidate unchanged. Public API 49 article projections identical to baseline. Root/API without Access return 302; authenticated UI version 0.11.0. Recheck API/validation/provenance/disabled approval/duplicate/mobile inspected. No production approve/reject and no raw body retention.

## 16. Git

Explicit staging/normal commit/push only. No git add ., reset --hard, clean, stash or force push. Known untracked preserved. Final commit/status recorded in chat.

## 17. Next Step

Human operator may inspect originals and reject unsuitable/duplicate items now. Do not force-approve unresolved articles. Additional scoped work would be needed for unsupported identifiers, explicit instructor extraction, and existing person/model publication scope; not implemented in this phase.

## YES / NO

- facts-incomplete blockers are visible: YES
- operator can safely request facts recheck: YES
- facts are taken only from verified sources: YES
- facts can be guessed when missing: NO
- facts update automatically approves article: NO
- provenance is recorded: YES
- stale facts update is rejected: YES
- duplicate protection preserved: YES
- current pending approve/reject performed: NO
- decision ledger remains human-decision only: YES
- Phase A security regressed: NO
- recommendation implemented: NO
- auto decision implemented: NO
- all tests pass: YES
- production verification passes: YES
- Git safety followed: YES

---

# NEWS Operator Review Phase A.6 — Targeted Candidate Evidence Completion Report

## Overall Verdict

READY FOR HUMAN DECISION: **2 candidates**. No publication rule was relaxed and no approve/reject was executed. Verified evidence was saved for three candidates; ReSing remains uncertain.

## 1. Starting Baseline

Measured 2026-10-02 11:39 UTC: main = origin/main = b90ad0c9b50af9d33c03a05c4000b631389d605a, ahead/behind 0/0, tracked/staged clean. Known `.claude/` and Sync node_modules preserved. NEWS / Operator / public Worker 0.11.0; Port 1.13.1. D1 approved 49 / pending 13 / rejected 19 / ledger 0; public projection 49. The initial OAuth D1 read failed once (7403); identity confirmation and the second read succeeded.

## 2. Target Selection

D1 corrects the two swapped IDs in the request: SHURE = b2b7643732; KORG = 5343ab1aab.

| Candidate | Existing facts | Missing blocker | Recovery likelihood |
|---|---|---|---|
| SHURE b2b7643732 | Brand / partial MV6 identity / category | Full generation and explicit action | HIGH |
| KORG 5343ab1aab | Full model / brand / category | Explicit introduction/action | HIGH |
| Event 3a6dd027f7 | Date / venue / workshop / relevance | Person, assessed named-person scope | MEDIUM initially; LOW for approval after identifying an unassessed person |
| IK b5c0c40743 | ReSing / manufacturer / category / uncertain scope | Exact target identity and scope evidence | LOW |
| IK bd2d0be4e4, a740971f36 | No product facts | Identifier and action | LOW |
| Ikebe 368e218d4d, b3462045cf, b44fe9ca6a, b7cb377c37 | No product facts | Identifier and action | LOW |
| Shimamura 4020bf1b51, bf0895e203 | No product facts | Identifier and action | LOW |
| LAVA 4632d340b4 | Existing product facts | Approved Sleepfreaks duplicate | LOW; duplicate stays blocked |

## 3. Ikebe Event

[Original source](https://www.ikebe-gakki.com/blog/20261021-aco-workshop/). Verified instructor **西山隆行** from the labeled instructor section, sole profile heading and article title. Guitar/workshop relevance is explicit. Date 2026-10-21, venue イケシブ and workshop type preserved.

The previous parser stopped at an empty WordPress spacer before the nested instructor columns. Only this known empty spacer and the sole instructor heading are now accepted. Related people/cards, hidden content, duplicate headings and URL dates cannot supply facts.

Worker transport rejected a redirect and left the candidate intact. The exact original page was available to the authenticated server-side CLI. The CLI shares all ordinary source/robots/lease/CAS/provenance gates and accepts no candidate/URL/decision arguments. Its event-only 24-hour cache records a separate bounded server purpose. No redirect-following exception was introduced.

Result: artist saved, status pending, no duplicate; existing named-guitarist pilot excludes this person, so approval remains disabled. The UI describes the current pilot condition without claiming the person is still unknown.

## 4. SHURE MV6

[Original source](https://www.shimamura.co.jp/update/dtm-recording/2026/10/90252/). Three agreeing explicit signals identify **MV6 Gen 2**, and the main article explicitly states its release. The incomplete MV6 identifier is refined on this exact URL only; arbitrary model changes remain blocked. Published day 2026-10-01 confirmed and unchanged. Category recording_audio; event_type release; independent label `SHURE、MV6 Gen 2を発売`.

Result: READY_FOR_HUMAN_DECISION, approval enabled, rejection available, pending, no duplicate. No decision executed.

## 5. KORG BD-S

[Original source](https://www.ikebe-gakki-pb.com/new_product/172475/). The sole main model heading agrees with the stored identity. The same main article explicitly introduces OD-KIT CUSTOM CRAFT. Under the existing classifier, introduction maps to new_product. Product identity and amps_effects category unchanged; published day 2026-09-17 confirmed, not treated as a shipping date. Independent label uses the existing factualLabel implementation.

Result: READY_FOR_HUMAN_DECISION, approval enabled, rejection available, pending, no duplicate. No release date guessed.

## 6. IK ReSing

[Requested original source](https://www.ikmultimedia.com/news/?item_id=19790) returned the site's Japanese news listing to the server, without an identified item 19790 article. Its visible ReSing expansion card is item **19792**, not 19790. The source's fixed press listing also no longer contains 19790. Neither similar names/dates nor the load-more link establish an explicit cross-language identity relation.

Result: **still uncertain**. No expansion/standalone fact stored, no scopeUncertain flag cleared, no individual IK parser added, no auto-reject. Current facts/provenance/status remain unchanged. A neighboring item's evidence must not be borrowed.

## 7. Parser / Extractor Changes

Exact original-page surfaces for three candidates only; visible source-specific structured sections; matching explicit publication day; deterministic action extraction; full model refinement narrowly scoped to SHURE. Shared generic listing recovery stays available for other candidates. Scheduled discovery, source policy, collection allowlist and publication validation unchanged.

The original 24-hour listing cache is retained; targeted cache keys distinguish candidate/parser. Each recheck is bounded to robots plus one page, with shared source lease, rate accounting, timeout, size cap, no redirects, kill/backoff/opt-out handling, full-row CAS and atomic facts/provenance. Request replay never refetches. No raw HTML, article body, exact headline or external image retained.

## 8. Provenance

All saved fields have source URL, source ID, verifiedAt, extraction method, parser/version, factField and response hash. These are facts-recheck records, not decisions.

| Candidate | VerifiedAt UTC | Parser | Fields with provenance |
|---|---|---|---|
| SHURE | 2026-10-02T11:55:00.198Z | target-evidence-1 | brand, product, version, category, identifierBasis, event_type |
| KORG | 2026-10-02T11:56:18.632Z | target-evidence-1 | brand, product, category, version, identifierBasis, listingSource, event_type |
| Event | 2026-10-02T12:02:55.845Z | target-evidence-2 | kind, category, artist, eventType, eventDate, venue, evidence, event_type |

Each URL is the corresponding original source linked above. Method: targeted_explicit_primary_fields. Target parser version 2 adds the confirmed empty-spacer handling; the earlier successful SHURE/KORG provenance accurately retains version 1. The authoritative exact timestamps are in D1 facts_provenance.

## 9. Publication Validation

`decision-policy.js`, metadata eligibility, source policies and their evidence, schema and migrations unchanged. Existing publication validation rerun for every patched candidate. Recovered full SHURE identity is checked again against duplicates. LAVA remains DUPLICATE_BLOCKED. Source health was not fabricated to make candidates eligible.

## 10. Current 13 Reviewability

Before: 12 FACTS_RECOVERY_UNCERTAIN + 1 DUPLICATE_BLOCKED, no approval enabled.

| Candidate | Before | New evidence | After | Approve | Reject |
|---|---|---|---|---|---|
| bd2d0be4e4 IK19855 | Uncertain | None; outside target scope | Uncertain | NO | YES |
| 368e218d4d Ikebe172649 | Uncertain | None | Uncertain | NO | YES |
| 4020bf1b51 Shim89868 | Uncertain | None | Uncertain | NO | YES |
| 4632d340b4 LAVA STUDIO | Duplicate | None; protection preserved | DUPLICATE_BLOCKED | NO | YES |
| b2b7643732 SHURE | Uncertain | MV6 Gen 2 + release | READY_FOR_HUMAN_DECISION | YES | YES |
| b3462045cf Ikebe172622 | Uncertain | None | Uncertain | NO | YES |
| b44fe9ca6a Ikebe172640 | Uncertain | None | Uncertain | NO | YES |
| b7cb377c37 Ikebe172658 | Uncertain | None | Uncertain | NO | YES |
| bf0895e203 Shim89963 | Uncertain | None | Uncertain | NO | YES |
| 3a6dd027f7 Event | Person missing | 西山隆行 instructor | Existing pilot condition blocks publication | NO | YES |
| b5c0c40743 ReSing | Scope uncertain | Exact target inaccessible; no facts borrowed | Uncertain | NO | YES |
| 5343ab1aab KORG | Action missing | Explicit introduction | READY_FOR_HUMAN_DECISION | YES | YES |
| a740971f36 IK19650 | Uncertain | None | Uncertain | NO | YES |

## 11. Learning Boundary

Ledger 0. No approve/reject executed. Existing legacy/operator feedback count is 22, with no entries during this phase; facts recovery writes no feedback. No human teacher signal was fabricated, and no adaptive recommendation was implemented.

## 12. Tests

NEWS **412/412 PASS**, including all Phase A/A.5 security, real local D1 atomicity, replay, concurrency, duplicate, source gates and transport regression. Port NEWS **27/27 PASS**. New fixtures cover explicit actions, incomplete/ambiguous/hidden/changed model statements, stale publication day, opt-out, event columns/spacer, missing IK identity, provenance, untouched candidate fields, shared cache isolation, simultaneous rechecks, server-purpose restriction and SQL binding. Syntax and diff --check pass; secret scan uses actual private values without printing them. No unrelated app full suites run.

## 13. Versions / Deploy

NEWS package / Operator: **0.12.0** (new operator-visible targeted evidence capability). Public NEWS Worker remains **0.11.0**; Port remains **1.13.1**. Only Operator deployed. Final Worker version ID: **a9dc0f96-caba-422b-b8c4-26599124937b**. Existing Access exact host, human-only Allow policy and 6-hour session verified read-only; no access grant or security setting changed.

## 14. Production Verification

D1: approved 49 / pending 13 / rejected 19 / ledger 0. Only the three target candidate rows changed; all statuses, all other 78 candidate rows, source health and takedowns unchanged. Source request timing/cache and operational audit updates are expected, not fabricated healthy runs. Public 49 article projections byte-for-byte equal before/after. Public health OK, collection/publication/API on. Unauthenticated root, JS, CSS and pending API return Access 302. Authenticated management UI confirms target facts/provenance, two approvals enabled, other approvals disabled and rejection available. No production decision executed.

## 15. Git

Existing work and known untracked directories preserved. Changes restricted to NEWS Operator/extraction/tests/operations/report. Explicit stage, commit and normal push only after checks; final commit SHA recorded in the user-facing closeout. No git add ., reset --hard, clean, stash or force push. No Cloud Sync, Account, Worker binding, D1 schema, Port or AI Support changes.

## 16. Next Step

The human operator can review SHURE and KORG and choose approve/reject with the existing four checks. This phase stops before any decision. Event requires a separately authorized named-guitarist scope review; ReSing requires primary evidence explicitly identifying item 19790. No recommendation phase started.

| Final check | YES / NO |
|---|---|
| Ikebe Event gained verified person/relevance facts | YES |
| SHURE MV6 gained verified event facts | YES |
| KORG BD-S gained verified event facts | YES |
| IK ReSing scope determined | NO |
| publication policy relaxed | NO |
| guessed facts stored | NO |
| duplicate protection preserved | YES |
| at least one candidate became safely approvable | YES — 2 |
| current pending approved/rejected | NO |
| decision ledger modified | NO |
| Phase A security regressed | NO |
| adaptive recommendation implemented | NO |
| all tests pass | YES |
| production verification passes | YES |
| Git safety followed | YES |
