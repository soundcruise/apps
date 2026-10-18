# Persistent Rhythm snapshot foundation — R5 candidate

Development candidate Studio 0.44.0 / schemaVersion 2. Production remains 0.43.1; Rhythm Production mirror remains 1.20.0. R3 candidate 1.21.0 is not published or merged by this work. Adoption is not imported, registered or instantiated by product boot/UI. Reader and safe existing consumers are connected first. Completion requires the separate Node, Browser, performance and Git gates; this document does not itself certify acceptance.

## Stored musical authority and offline reading

`js/core/rhythm-snapshot.js` exports CommonJS / `CruiseStudio.rhythmSnapshots` with `validateRhythmMaterial`, `readRhythmMaterial` and a canonical `contentKey`. Owner callbacks, app installation/current version, R4 runtime sourceContext, Git receipts, network, credentials and Repository writes are not reader dependencies.

The new strict union is `{id,encoding:'rhythm-owner-cells-v1',snapshot,provenance:{origin:'user-set',source,adapterVersion:1}}`. All keys are required, extra keys reject. Native snapshot retains the R3 DTO's 15 fields: patternId, patternRevision, name, encoding, legacyRef, meter, tpq, patternBars, lengthTicks, grid, cellTicks, feel, sourceDirections, cells, semanticProfile. Source retains ownerApp/ownerAppVersion/ownerApiVersion/patternId/patternRevision/encoding. Local c00 identities are scoped by material ID; material, binding, bar and event IDs remain Project-global. Adoption uses schema.newId; a collision rejects atomically.

Supported: official nine identities/revision1/API1, rhythm-official-cells-v1, rhythm-create-basic-v1, 4/4, one bar, straight, 24TPQ/96ticks, eight cells of12 or sixteen of6. Historical source version is a bounded semver string, not a requirement that the current installed owner match. Provenance is a record of adoption, not authentication or proof of exact original distribution.

Validation inspects original descriptors before cloning/JSON: exact shape, finite/safe integer time, direction-source consistency, local cell IDs/order, continuation and bounded JSON data. No unknown-field stripping, inferred repair or automatic refresh. Cross-realm ordinary JSON and null-prototype records are supported. Arbitrary JavaScript Proxy traps cannot be made harmless; exceptions fail closed.

Limits: <=256 native materials, <=4096 native cells, each native snapshot <=16KiB of compact JSON length*2; Project <=8MiB of compact JSON length*2. Legacy material counts retain their existing contract. Reader success returns independent deeply frozen material/projection. Native24 data is the sole saved musical authority. Derived480 PPQ data is never persisted. All104 source cells use exact integer multiplication20. Hit is attack, rest clears continuation, tie sustains a preceding uninterrupted attack in this bar. Orphan/rest-after tie rejects; cross-bar/cyclic carry is unsupported. Direction does not manufacture air/dead/stop/strings/pitches. `performanceReady` and `completeScore` remain false.

Schema2 dispatch requires the injected reader for new encoding. Missing helper/unknown encoding reject. Old studio-strum-v1 meaning is retained. Old readers reject the new union despite the same schema number. Project load alone neither converts nor saves it; no downgrade fallback exists.

## Legacy bridge and consumers

Generic readProjection/toLegacyView reject any Project containing new native materials, including unused ones. `readStructureProjection` / `model.toStructureView` issue a nonpersistable purpose-tagged structure DTO with typed basicRhythm/rhythmByBar. Rich entries have a name, explicit unsupported status and480 projection, never fake legacy slots. Repository/JSON export reject derived DTOs.

Legacy edit bridge accepts explicit intent/stable bar IDs for rich Projects and checks actual callback deltas against that intent. Code, lyric, melody pitch, section, bar ordering/count and display edits preserve unrelated materials/IDs/bindings. Canonical duration/rest/gap commands remain independent. Changed legacy snapshots use copy-on-write: fresh material/cell IDs and an unambiguous legacy alias, preserving shared source references. Old basic-strum display recognizes its generated custom alias. New bars inherit basic; deleted bars lose only their bindings; duplicateBar mints new bar/event/binding IDs and shares materials. Native materials are not garbage collected. Unknown/missing intent and ambiguous object mapping reject before publication. Section rename checks the stable section ID and the complete callback result: only that section name may differ. Other section fields/order, bars and every other view field must remain unchanged. The operation adapter rejects stale Session/project/version frames after deletion, switching or Undo; a raw bridge intent is not a temporal capability.

Rich effective basic/bar old-stroke editing rejects; unrelated legacy overrides stay editable. Explicit reset removes a binding and inherits basic. Native materials remain intact. For a managed legacy `strum_bar_*` material only, the bridge reflects the old editor's explicit deletion when the targeted stable bar cleared its override and no basic/bar reference remains. Unrelated unused materials are retained; binding-only clear is not deletion intent. The legacy reference check includes the basic rhythm. Old stroke functions never convert native cells into studio-strum-v1.

Structure shows the adopted name and old-editor unsupported state. The affected old input is disabled; code/lyrics/solfege editing continues. Print exposes an explicit unsupported-rhythm notice and retains non-rhythm content. Melody Common Music conversion validates canonical input and owns its prepared DTO; unsupported guitar data is local to the guitar voice, so melody/rest/gap notation continues. No empty normal guitar pattern substitutes for rich data.

Pre-DTM/direct arrangement generation refuse any effective rich bar, even with guitar disabled or a preset selected. Refresh clears prior arrangement/exports. Unused native materials can coexist with effective legacy arrangements without being deleted from the saved Project. MIDI serialization only receives a successful arrangement. JSON export/import uses canonical data and full validation. Historical schema1 fixture rebuilding cannot read a rich Project through generic toLegacyView.

## Adoption, stale checks and Save

`createRhythmAdoptionService({owner,schema,rhythmSnapshots,adapter,repository,getContext})` exposes prepare({patternId,patternRevision:1,target}), prepareReuse({materialId,target}), prepareClear({barIds}) and apply(handle). Target is {kind:'basic'} or {kind:'bars',barIds:[stableIDs]}. New acquisition uses the verified injected R4 facade. Reuse reads existing material without owner availability.

Private WeakMap handles are single-use, including on failed apply. Preparation and application recheck actual Session, session/project/document identity, workspace generation, snapshotVersion, history epoch, exact base raw revision, targets and blocked input/modal/save/external-update/conflict/closing/open-group state. Pending text groups require explicit completion, never implicit flushing by preparation. Runtime verification is not a saved-data reader requirement.

Canonical all-content equality excluding material ID (code-unit object-key ordering, array order retained, no Unicode normalization or hash-only match) shares equivalent snapshots. Native/source/name/version differences require a distinct material. Basic replacement preserves every bar override. Bar replacement preserves binding IDs; new bindings get fresh IDs. Clear removes only explicit overrides. A same-target same-material operation is no-op with no history/dirty/version change. No automatic GC.

Application is a single existing Session.runOperation with requireUndo/preserveAppliedUndo. Session validates staging, reserves Project/history capacity and publishes atomically. Session and Repository both reject same-ID native content/encoding/provenance changes; existing Chord guards remain. History is100 entries /8MiB UTF-8, distinct from Project JSON length*2. Failure preserves applied Undo/redo/draft/base/raw. Only explicit Save calls Repository; exact raw comparison, Web Locks, immediate recheck and project/index rollback remain. storage-failure and result-unknown are distinct; an unknown result is not reported as proven unchanged persistence. Save does not roll adopted draft/history back.

## Performance and acceptance

Semantic reuse is inside one schema validator instance, bounded at256 entries /4MiB key strings. Each validation still scans original Project descriptors, capacity, global IDs, references and fields. Native/provenance exact compact JSON content (excluding independently checked material ID) is inspected before lookup; object key reordering may cause a harmless cache miss. Semantic adoption/material equality remains order-independent. Each structure projection reuses the projections obtained by its own complete validation, then copies each output to preserve consumer independence; only owned frozen successful reader results are cached. Mutation/unknown fields/prototype changes do not pass an ID-only or freeze-only trust check. Failure is not cached as success.

Formal thresholds remain64-bar synchronous command p95<=16ms and staff p95<=500ms; raw values decide. Performance runner RHYTHM_PERF=1 covers8/32/64/128, legacy/shared/distinct-ID/Chord+Rhythm, save before/after, warmup3 and20 measured samples. PERF_TRIAL identifies an independent invocation; require3 completed formal trials.128 is durability, not a new16ms gate. Save every sample, fixture and source hash. A failed gate prevents commit/push; safety checks must not be removed to improve a score.

Node suites use independent fixed R2/R3 data and real R4 acquisition plus separately constructed saved fixtures. Browser tests use a disposable profile/loopback and explicit fixture-only service imports. Setup/settings/adoption/Save ledger phases remain distinct. No production users, Pro/Account/Authority/Sync, shared write, owner storage, Worker or existing8765/8766 are involved. Actual OS IME/Safari/printer acceptance is not claimed.

R6 adoption UI, MyRhythm/Pro libraries/Cloud Sync, voicing/strings/complete TAB/Audio, owner publication, metadata/cache integration and main/Pages release are separate work.

### R5 recovery: read-only material snapshot reuse

Editing Session keeps a private WeakMap from a source material object to an independently JSON-copied, deeply frozen material value. The source object is not trusted: each lookup compares its complete content with the frozen candidate after the existing JSON descriptor/domain checks. A different value, replaced array or different object cannot obtain a stale successful snapshot. Caller-provided Object.freeze is never a trust token.

Only read-only working/base/history snapshots reuse these values. Mutable drafts retain separate JSON-equivalent copies and the original Proxy behavior, including descriptor-bypass defenses. No project/Session/material ID/version key grants validation authority. Undo/Redo, Save/Load, external revision and Session switching still use their existing full validation and identity checks; weak keys disappear with their source objects. History byte sizes are still measured from the complete resulting snapshot JSON in UTF-8, including all material content. Project length*2 and exact raw revision remain unchanged.

The first recovery diagnostic still exceeded16ms with64 distinct native materials. Phase2 measures the final candidate separately; prior partial improvement is not performance acceptance.

### R5 recovery phase2: full preflight and detached copy

The measured command path repeatedly walks original JSON descriptors and creates detached drafts/history/read snapshots. Full preflight remains mandatory: own hooks are rejected in the own-descriptor walk; inherited hooks/accessors are checked once per prototype within each traversal. Every original property, symbol, finite number, array index/density, cycle and depth is still checked. This is not incremental validation and adds no cross-call validation cache.

For schema2 payloads that already passed that preflight, Editing Session makes a recursive detached JSON-equivalent copy without a temporary whole-payload JSON string. It preserves array order, duplicates aliases, copies own `__proto__` as data, preserves strings/Unicode and normalizes negative zero as JSON did. The mutable staged draft and published draft remain independent even if a callback retains raw descriptor aliases. Unvalidated/schema1 copy paths retain their prior JSON behavior. Legacy restoration-source and owned read-only material reuse boundaries are unchanged.

Project capacity still serializes the complete Project using length*2. History capacity still serializes the complete owned history using UTF-8. No validation, immutable-material comparison, stale check, explicit Save or raw-revision guard is skipped. Acceptance requires the final Node/Browser suites and all three uninstrumented performance trials.

Phase2 also reuses the current existing History content when it belongs to this Session/history epoch/cursor and its complete content equals the fully preflighted current draft. It creates no new cache or validation token. Before-operation history reuse follows full domain validation. Working reads still inspect every original descriptor, compare complete content and rebuild live metadata/restoration-source fields; source values are detached unless already privately owned/frozen. Save metadata and exact raw revision are never taken from an older history entry. Out-of-band mutations or array replacement fail equality and use the ordinary copy path. Reset/replacement/external adoption clears history; Undo/Redo choose the current cursor. A/B Sessions never share this candidate. History size accounting uses the unchanged exact UTF-8 size of the already owned history value.

### R5 recovery phase4: draft mutation ownership

Phase4 supersedes the descriptor-bypass behavior described in the earlier recovery notes. Descriptor reads (`Object`/`Reflect.getOwnPropertyDescriptor`, `getOwnPropertyDescriptors`) return the same tracked nested proxies as ordinary reads. No mutable draft value is returned raw. Ordinary assignment, delete, array index/length changes and array methods still notify the Session; assigned objects are independently copied. An inherited prototype path cannot be used as a draft mutation target. Privately owned deeply frozen restoration sources remain immutable values, not mutable proxies.

Reflective writes (`defineProperty`, `defineProperties`, prototype changes, preventExtensions, freeze and seal) reject before changing the target. Targets retain ordinary configurable data properties and the standard non-configurable primitive Array length, so descriptor wrapping obeys Proxy invariants. Detached operation/published/destroyed draft references reject writes. Live native Rhythm and Chord material content cannot be changed through reflected nested references; staged operations still use the existing full same-ID protection before publication. Schema-field edits cannot switch off the draft's original schema2 JSON/material guards.

Earlier tests that injected invalid values by bypassing the Proxy now assert rejection at the mutation boundary, unchanged data/history/version/raw and zero hook calls. The original invalid external-input/Repository tests remain; this changes rejection timing rather than permitting an invalid value. A valid reflected edit advances snapshotVersion and invalidates old Structure/Melody/Adoption/consumer frames. If an invalid edit is rejected with no state change, existing frames remain current.

After closing those ownership paths, a private per-draft mutation counter records the last successful JSON-shape preflight. Independently copied JSON starts at its own checked generation. Any allowed mutation advances the counter; a changed generation must pass the full descriptor/finite/density/cycle/depth walk again before reuse. This mark is not caller-visible, not keyed by project IDs and not a domain-validation or authorization flag. It only avoids repeating the same Session JSON walk on unchanged, exclusively owned data. Replaced/Undo/Redo/restored drafts start independent tracking; no mutable raw reference crosses Sessions. Internal Save metadata is copied from the validated Repository result; Save itself retains its complete preflight and schema/material/raw-revision checks.

Domain/schema validation still runs at begin, commit and Structure projection. Material equality, protected legacy source, content comparison, Project length*2, History UTF-8 budgets, Undo reservation, context/generation/revision checks and explicit Save are unchanged. Direct array holes or extra array fields invalidate the JSON proof and reject at the next snapshot/operation boundary. A successful JSON proof never makes an invalid domain value valid. No consumer projection cache or second Project is introduced.

### Recovery Phase 5: normal writes and early reflection refusal

Draft descriptor reads return the same tracked proxies as ordinary reads. Detached
aliases and reflective writes (`defineProperty`, prototype changes, freezing,
sealing, and preventing extensions) reject before mutation. Rejection retains the
live data, snapshotVersion, history/cursor/epoch, pending operation ownership, and
repository. An explicitly begun operation remains caller-owned until cancelled
or committed; `runOperation` cancels its failed staging and restores its prior text
group. Refused reflection does not by itself make an unchanged handle stale.

Ordinary property writes, deletes, nested JSON edits and array operations remain
available. A live descriptor-value edit is now tracked immediately: it invalidates
old consumer/command tickets and closes old out-of-band history. A following
normal operation starts from that current value; it cannot replay the overwritten
entry. Tests must check this barrier and subsequent Undo/Redo rather than assume
an unobserved mutation survives until a later `stale-history` check.

Immutable Chord/native Rhythm materials reject same-ID content changes. Complete
JSON-equal (including matching object/array types) nested replacement (including key-order-only provenance replacement)
is allowed: the value is copied into Session ownership, tracking advances, old
aliases detach, and old handles become stale. Equality does not grant permission
for changed content, skip external input validation, or change a repository raw
revision. Undo/Redo and explicit Save keep their existing owners and budgets.
