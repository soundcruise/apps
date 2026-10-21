# Official basic pattern pure API v1

Rhythm Cruise owns the canonical Create stage 2/3 musical definitions in `js/official-patterns.mjs`. The classic UI receives mutable clones from `getCreateBasicStageDefinition(stageN)` after one versioned dynamic import, before its existing settings/seed/bind sequence. It has no second handwritten pattern table or fallback table. Stage 1/4/5 and practice builtins retain their definitions.

The nine basic patterns are approved for Studio Standard and Pro retrieval, display and future snapshot adoption. This grants no access to My Rhythm, saved Pro libraries, practice controls, Cloud Sync or backend authorization. The module never initializes those services.

## API

`listOfficialPatterns(query?)`: optional shallow plain own-data record `{apiVersion:1, collection:'create-basic'}`; omitted keys default to these values. Returns `{ok:true,apiVersion:1,patterns:[{patternId,patternRevision,name,grid,legacyRef}]}` in stage 2 then stage 3 order.

`getOfficialPattern(patternId, options?)`: exact string ID (maximum 128 characters), optional `{apiVersion:1,patternRevision:<positive safe integer>}`. Omitted revision selects current revision. Returns `{ok:true,apiVersion:1,pattern}`. No string coercion, trimming or nearest-revision fallback.

Failures are `{ok:false,error:{code}}`: `invalid-argument`, `unsupported-api-version`, `unsupported-collection`, `unknown-pattern`, `unsupported-pattern-revision`. Accessors, hooks, symbols, arrays and inherited query records are rejected without reading their values. Arbitrary Proxy traps cannot be guaranteed side-effect free; thrown traps are contained as invalid arguments.

DTO fields: `patternId`, `patternRevision:1`, `name`, `encoding:'rhythm-official-cells-v1'`, `legacyRef:{stageN,presetIndex}`, `meter:{beats:4,beatUnit:4}`, `tpq:24`, `patternBars:1`, `lengthTicks:96`, `grid`, `cellTicks`, `feel:'straight'`, `sourceDirections:{stage,preset}`, `cells`, `semanticProfile:'rhythm-create-basic-v1'`.

Each cell has local `id:c00..c15`, `tick`, `type:hit|rest|tie`, `direction:down|up|null`, `directionBasis:stage-default|preset-explicit|none`, `legacyDirManual:true|null`. Raw preset directions absent versus explicit null remain distinct. `legacyDirManual` represents compatibility/pinning, never human verification. No accent, dead, mute, independent stop, strings or pitches are invented. Rest interrupts logical continuation; tie sustains a preceding attack and never reattacks on a chord change. Orphan sustain remains unresolved by the consumer. Physical preview release time is not native note duration.

## Stable identity

IDs have the prefix `rhythm:create-basic:` and suffixes: `basic-eighth`, `offbeat-eighth`, `one-three-eighth`, `two-four-eighth`, `standard-eighth`, `continuous-sixteenth`, `eighth-two-sixteenths`, `mixed-sixteenth`, `standard-sixteenth`.

Names, native cells and effective directions are fixed by the independent R2 104-cell oracle in the test fixture. Existing UI aliases `official:<index>` remain unchanged. Same ID/revision payload is immutable; DTO changes, including names, require a revision policy. API version, encoding, payload revision and application version are distinct.

Application version remains owned by `RHYTHM_CRUISE_VERSION` in `script.js`; this module does not duplicate it. Candidate owner version is 1.21.0. The UI's module query derives from that source. Studio must inject a verified owner app version through its own reader metadata envelope in R4. Studio Production remains 0.43.1; this topic alone is not releasable until the separate Studio mirror/cache update is integrated and tested.

Public results and private definitions are deeply frozen; calls return independent DTO copies. The owner-internal stage projection returns fresh mutable clones. Imports perform no DOM/global registration, storage/IDB, audio/mic, network, clock/random, timer, Pro/Account/Sync or SW initialization. Local ESM asset loading by the host is not an API network request.

## Acceptance

Run the four existing owner Node files and `node --test tests/official-patterns.test.mjs` from the app directory. The fixture is a copy of the independent reviewed R2 oracle, not generated from this API.

Browser runner: `NODE_PATH=<Playwright module directory> QA_DIR=<outside repo> CHROME_PATH=<Chrome executable> node apps/rhythm-cruise/tests/official-patterns.browser.cjs` from the repository worktree. It owns an ephemeral loopback port and disposable Chrome contexts. No 8765/8766 access. It compares baseline and candidate product storage ledgers and all Standard pattern selections; it preserves and checks the real unauthenticated Pro gate. No successful Pro credential or grant is fabricated. Authenticated Pro UI actions remain an explicit separate acceptance limitation when credentials are unavailable. Baseline permitted bootstrap writes are recorded, not erased or called zero. Pure import/list/get independently require zero writes.

No Studio/schema/Project/Session/Undo persistence or 24-to-480 conversion is implemented here. No live credentials, real user storage, production publish or shared-write enablement is part of the tests.

With explicit user approval, set `PRO_OWNER_FIXTURE_APPROVED=1` to additionally compare baseline/candidate Pro owner UI in a separately labelled `/owner-fixture/` URL. This fixture retains actual owner markup/script/CSS and removes all other script tags before adding the owner script only. It has no authentication, Account or Sync connection and does not claim an authenticated Pro session. The real product entry/gate is also tested unchanged. Without approval, that URL is rejected and authenticated UI coverage stays unverified.
