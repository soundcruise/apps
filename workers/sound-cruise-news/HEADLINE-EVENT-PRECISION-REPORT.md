# NEWS Headline Event Precision Improvement Report

## Overall Verdict

LOCAL IMPLEMENTATION / AUDIT / TESTS COMPLETE. Explicit user approval received for the five verified corrections, NEWS/Operator deployment, commit and normal push. Production execution is in progress.

## 1. Starting Baseline

2026-10-03 JST; main = origin/main = f525c3bb59718278d4464bdc858d446001923f24; ahead/behind 0/0; tracked/staged clean. Known .claude/ and workers/sound-cruise-sync/node_modules/ preserved. Measured public NEWS 0.13.0 and authenticated Operator 0.20.1. Port 1.15.0. Production approved56 / pending13 / rejected20 / human Ledger7 / Shadow34.

## 2. Current Headline Rules

| Event Type | Previous Headline Pattern | Weakness |
|---|---|---|
| new_product | manufacturer + product + を発表 | generic 登場/発表 matched before any edition/variant distinction |
| release | manufacturer + product + を発売 | no launch-nature refinement; a release word alone could overstate a variant |
| update | product/version + を更新 | preserved |
| firmware | product/version + のファームウェア更新 | preserved; human significance review retained |
| other | の製品情報, REVIEW | no verified action |
| price_change / discontinued / recall | 価格改定 / 販売終了 / リコール情報 | preserved |
| sale / guitar_event / guitar_artist | dedicated structured templates | outside product refinement; preserved |

Product identity facts were already verified separately, but lacked edition/event-action facts. No product-name replacement or original publisher headline storage was added.

## 3. Event Taxonomy

Keep existing coarse event_type values and DB schema. Add optional product_facts.productEvent = {action,basis,signal}. Actions: new_variant, special_edition, limited_edition, new_color, collaboration, reissue, rerelease. Existing new_product/release/update/firmware work without this optional field. A verified specification-launch statement classified as other may use the existing new_product coarse bucket, with its precise productEvent action controlling the headline. Uncertain signals stay REVIEW instead of becoming a generic launch.

This is structural facts refinement, not synonym rotation. Topic/duplicate identities retain the existing product launch family. No category taxonomy changes.

## 4. Evidence Rules

Only verified product identity plus an explicit event statement in the same primary title clause can refine collection-time facts. No inference from model code, a color/material noun alone, Special in a product name, descriptive special/custom sound/circuit, unrelated adjacent sentence, negation, historical example, or unconfirmed scheduled release.

One-time existing published correction additionally verifies robots, source state/permission, opt-out, bounded same-origin HTML (512KB), original publication day distinct from modified day, actual article product headings, and primary title/first lead. Related links/sidebar/specs cannot supply an event. Store enum facts and response-hash provenance, not the article body or exact headline. HTTP redirects and failed robots fail closed; no bypass.

## 5. Gibson Case

Primary source: https://www.shimamura.co.jp/update/guitar-bass/2026/10/89963/

Base products are SJ-200 and Hummingbird. The current article explicitly introduces koa specification variants of these existing products, with ornamental detailing and koa back/sides; it does not introduce both product families for the first time. Publication date remains 2026-10-01 JST. New factual headline: **Gibson、SJ-200 / Hummingbirdに特別仕様が登場**. Material and detailed decoration stay out of the headline.

## 6. Headline Generator

| Verified action | Headline suffix |
|---|---|
| new product / release | を発表 / を発売 (legacy behavior) |
| special_edition | に特別仕様が登場 |
| new_variant | に新仕様が登場 |
| limited_edition | の限定モデルを発表 (explicit limited color: に限定カラーが登場) |
| new_color | に新色が登場 |
| collaboration | のコラボモデルを発表 (explicit collaboration color: にコラボカラーが登場) |
| reissue / rerelease | を復刻 / を再発売 |
| update / firmware | existing suffix unchanged |

Verified action precedes product identity/brand formatting. Invalid action/basis/signal facts cannot produce a publishable facts-only label. Multi-product identity stays concise. Verified action labels are not overridden by a coarser immutable legacy fixture label.

## 7. Existing Published Audit

All56 saved published rows inspected.24 stored product headlines ending を発表/を発売 received a bounded direct primary-page check.22 returned200; Yamaha robots and Sleepfreaks redirect were blocked and not bypassed. Some publisher layouts do not expose the generic h1 audited by the read-only helper; these are explicitly unverified. Remaining32 are existing independently authored specific/information/update/artist/event labels, not blanket rewritten. Five primary-evidence corrections planned.

| Article / Current Stored Headline | Actual Event / Assessment | Proposed Headline | Confidence |
|---|---|---|---|
| [ESP、PA-MF-10を発表](https://www.shimamura.co.jp/update/guitar-bass/2026/09/85289/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [Fender、FSR American Acoustasonic Telecasterを発表](https://www.shimamura.co.jp/update/guitar-bass/2026/09/87963/) | limited_edition | Fender、FSR American Acoustasonic Telecasterの限定モデルを発表 | HIGH: primary article + identity/date CAS |
| [Jackson、Flex A-Frame Standを発表](https://www.shimamura.co.jp/update/guitar-bass/2026/09/85571/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [BOSS、EX-4を発表](https://www.shimamura.co.jp/update/amp-effector/2026/09/87167/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [VOX、AC MINIを発表](https://www.shimamura.co.jp/update/amp-effector/2026/09/81190/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [Yamaha、FG7 / FS7シリーズの新モデルを発表](https://jp.yamaha.com/products/musical_instruments/guitars_basses/ac_guitars/fg_series/fg_7/index.html) | coarse product launch retained | unchanged | UNVERIFIED: robots_unavailable |
| [SINPHONICAを発表](https://sleepfreaks-dtm.com/softsynth/sinphonica/) | coarse product launch retained | unchanged | UNVERIFIED: redirect_blocked |
| [ZOOM、WLM-1を発売](https://zoomcorp.com/ja/jp/news/wlm1_notice/) | postponement/specification notice: prior date audit flagged release-label semantics | unchanged | requires a separate verified notice parser; no speculative rewrite |
| [Ibanez、j.custom RG8570EM-NTを発表](https://www.ikebe-gakki-pb.com/new_product/172605/) | limited_edition | Ibanez、j.custom RG8570EM-NTの限定モデルを発表 | HIGH: primary article + identity/date CAS |
| [Fortin Amplification、3.33を発表](https://www.ikebe-gakki-pb.com/new_product/172597/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [Epiphone、Joan Jett Olympic Specialを発表](https://www.ikebe-gakki-pb.com/new_product/172505/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [KORG、Nu:Tekt NuTube HIGH GAIN ODを発表](https://www.ikebe-gakki-pb.com/new_product/172492/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [KORG、Nu:Tekt NuTube OD-KIT CUSTOM CRAFT BD-Sを発表](https://www.ikebe-gakki-pb.com/new_product/172475/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [KLOWRA、Leap Octaveを発表](https://www.ikebe-gakki-pb.com/new_product/172417/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [KORG、TM-1を発表](https://www.ikebe-gakki-pb.com/new_product/172461/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [IK Multimedia、TONEX Boardを発売](https://www.ikmultimedia.com/news/?item_id=19753) | coarse product launch retained | unchanged | UNVERIFIED: article layout not parsed |
| [Harrison Audio、FLEX 10を発表](https://atdistribution.net/information/1047/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [Gibson、SJ-200 / Hummingbirdを発表](https://www.shimamura.co.jp/update/guitar-bass/2026/10/89963/) | special_edition | Gibson、SJ-200 / Hummingbirdに特別仕様が登場 | HIGH: primary article + identity/date CAS |
| [PRS、Silver Skyを発表](https://www.shimamura.co.jp/update/guitar-bass/2026/10/89868/) | collaboration | PRS、Silver Skyにコラボカラーが登場 | HIGH: primary article + identity/date CAS |
| [SHURE、MV6 Gen 2を発売](https://www.shimamura.co.jp/update/dtm-recording/2026/10/90252/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [Yamaha、RS20MMを発表](https://www.shimamura.co.jp/update/guitar-bass/2026/10/89944/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [Gretsch、G6136TGQM-59を発表](https://www.shimamura.co.jp/update/guitar-bass/2026/10/90845/) | limited_edition | Gretsch、G6136TGQM-59の限定モデルを発表 | HIGH: primary article + identity/date CAS |
| [Novation、FLpadを発売](https://www.shimamura.co.jp/update/dtm-recording/2026/10/91045/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |
| [Universal Audio、Volt Gen 2を発売](https://www.ikebe-gakki-pb.com/new_product/172671/) | coarse product launch retained | unchanged | primary title inspected; no safe refinement |

WLM-1's release/postponement issue already documented in the preceding date audit remains a separate notice-semantics correction candidate. This report does not claim every public headline has been independently proven correct. No ambiguous rows are silently rewritten.

## 8. Pending Audit

All13 saved pending records inspected and their primary URL attempted. No pending facts/status/decision writes. Fulltone OCD has explicit limited-model evidence but lacks an accepted full product identity; it stays REVIEW. ReSing pack/scope uncertainty is retained. LAVA duplicate, event policy limits and missing identifiers remain authoritative blockers. No invented teacher signals or forced new_product reclassification.

| Pending Article | Stored Event Type | Assessment | Result |
|---|---|---|---|
| [ReSingの製品情報（要確認）](https://www.ikmultimedia.com/news/?item_id=19790) | release | base product vs expansion/pack unresolved; scopeUncertain retained | unchanged |
| [審査待ち（製品名と出来事の確認が必要）](https://www.ikmultimedia.com/news/?item_id=19650) | other | product/action not verified; retain REVIEW | unchanged |
| [審査待ち（人物・日時・会場の確認が必要）](https://www.ikebe-gakki.com/blog/20261021-aco-workshop/) | guitar_event | event pilot/policy limit; unrelated to product-action refinement | unchanged |
| [LAVA MUSIC、LAVA STUDIOを発表](https://www.shimamura.co.jp/update/amp-effector/2026/10/84665/) | new_product | launch evidence present; existing published duplicate block retained | unchanged |
| [審査待ち（製品名と出来事の確認が必要）](https://www.ikebe-gakki-pb.com/new_product/172658/) | other | product/action not verified; retain REVIEW | unchanged |
| [審査待ち（製品名と出来事の確認が必要）](https://www.ikebe-gakki-pb.com/new_product/172649/) | new_product | product/action not verified; retain REVIEW | unchanged |
| [審査待ち（製品名と出来事の確認が必要）](https://www.ikebe-gakki-pb.com/new_product/172640/) | release | explicit Japanese limited OCD model; full product identity not accepted by existing facts contract, no forced new_product | unchanged |
| [審査待ち（製品名と出来事の確認が必要）](https://www.ikebe-gakki-pb.com/new_product/172622/) | new_product | product/action not verified; retain REVIEW | unchanged |
| [審査待ち（製品名と出来事の確認が必要）](https://www.ikmultimedia.com/news/?item_id=19855) | release | product/action not verified; retain REVIEW | unchanged |
| [審査待ち（製品名と出来事の確認が必要）](https://www.ikmultimedia.com/news/?item_id=19867) | other | product/action not verified; retain REVIEW | unchanged |
| [ReSingの製品情報（要確認）](https://www.ikmultimedia.com/news/?item_id=19799) | other | base product vs expansion/pack unresolved; scopeUncertain retained | unchanged |
| [審査待ち（製品名と出来事の確認が必要）](https://www.ikmultimedia.com/news/?item_id=19595) | other | product/action not verified; retain REVIEW | unchanged |
| [ReSingの製品情報（要確認）](https://www.ikmultimedia.com/news/?item_id=19580) | other | base product vs expansion/pack unresolved; scopeUncertain retained | unchanged |

## 9. Backward Compatibility

No migration; no changed category/date/URL/status/human decisions. Public API contractVersion1 and fields remain unchanged; it returns the saved refined label. Shared factualLabel feeds both Operator publication validation and automatic templates. Operator exposes the additive facts in its existing evidence view. Topic/duplicate keys unchanged. Source robots/legal gates, firmware review, Access/JWT/CSRF unchanged.

Future decisionProfile carries productAction only for verified event facts; mixed/unknown actions cannot count as strong/exact similarity. Historical human profiles/Decision Ledger and stored Shadow evaluations are immutable; headline correction writes only operational audit/provenance and invalidates public cache through controls revision. No correction is a teacher.

## 10. Tests

NEWS/Operator539/539 PASS (510 existing +29 added); Port NEWS28/28 PASS. Added coverage includes all product actions, legacy true launch/release/update/firmware, descriptive Special/custom, color-only/material-only, unrelated product sentence, negation/history, multi-product Gibson, uncertainty REVIEW, collaboration/limited color precision, invalid facts, legacy-label override, API contract, future similarity separation, publication vs modification dates, exact scoped CAS and no Ledger/Shadow writes. Syntax, diff check, targeted secret scan PASS. Both Worker dry-runs PASS.

## 11. Versions / Deploy

Patch correction: public NEWS0.13.0→0.13.1; Operator0.20.1→0.20.2, package/lock aligned. Port1.15.0 unchanged (no Port code/assets changed). Config/secret/auth unchanged; no migrations. The initial automatic approval review rejection was resolved by explicit user authorization. Existing infrastructure/offline scripts are not reused to upload secrets or change Access; intended deploy is code-only with existing vars/secrets retained.

## 12. Production Verification

Five authorized corrections applied to production before deployment. Exact before/after comparison passed: only label/product_facts/facts_provenance/review_revision changed in these five rows; all other rows and fields, Ledger7 and Shadow34 unchanged. Final UI/release verification to complete: five saved/public/Operator/Port labels agree; approved56/pending13/rejected20/human7/Shadow34 unchanged; all pending and non-target rows byte-for-byte unchanged; each changed row differs only in label/product_facts/provenance/review_revision; Ledger and Shadow histories unchanged; no browser console errors. No approve/reject operation is planned.

## 13. Git

Implementation and report are uncommitted locally. Explicit file staging only after final checks/approval. No prohibited Git operation used; known untracked preserved.
