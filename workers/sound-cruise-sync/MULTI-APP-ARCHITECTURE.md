# Sound Cruise Sync Multi-App Architecture

Status: M10 public-admission release foundation / general activation OFF
Date: 2026-09-16

## Current M10 authority

This section is the authoritative description of the current implementation.
Everything after **Historical checkpoint record** preserves the decisions and
boundaries at the named milestone; statements there such as “unrouted”,
“unreferenced”, “M10 work”, or “production Account OFF” are historical and must
not be used as current deployment instructions.

Sound Cruise Sync now has a shared Account control plane above four isolated app
data planes. Chord, Pitch, Fretboard and Rhythm Pro load their app adapter and
shared runtime only when an explicit QA or production configuration is enabled.
The deployed production configuration is explicit and disabled. Standard
editions remain local-only. Cruise Port owns only Account orchestration and
non-secret status; it never opens an app's browser storage or reads app payloads.

### Current schema and runtime

- Schema migrations `0001` through `0018` define Account tables,
  membership/device links, QA admission, provenance-bound App Join invitations,
  lifecycle operations, conflict metadata and seven-day delete grace. Migration
  `0018` backfills existing Accounts and invitations to `qa`; it enables no
  public traffic.
- Existing `/v1/sync/*` remains the app data plane with revision CAS,
  idempotent operations, outbox retry, tombstones and explicit conflict
  resolution. Existing Legacy Chord credentials remain valid.
- `/v2/accounts/*` is the Account control plane. It supports Account creation
  and summary, membership preparation, Account devices and revoke, handoff,
  App Join, Chord bridge, Recovery, app-scoped delete and Account-wide delete.
- The Account runtime row is independent of the Legacy runtime row. Invalid or
  missing rows and unclassified actions fail closed.
- Account-managed app identities use app-scoped credentials for data-plane
  access. An Account credential cannot read or write an app payload.
- Account and App Join rows carry an explicit `qa` or `production` admission
  provenance. QA invitations retain mandatory issuer/app QA sessions;
  production invitations require those fields to be null and remain bound to
  the authenticated Account device.
- Local saves are authoritative first. Startup, focus, online resume and a
  local-save signal reconcile without polling. Outbox operations retain stable
  IDs across response loss. Semantic conflicts stop before overwrite and are
  resolved only by explicit Local, Remote or Later actions.

### Current HTTP surface

```text
POST   /v2/accounts/qa/enroll
POST   /v2/accounts/start
GET    /v2/accounts/summary
GET    /v2/accounts/memberships
POST   /v2/accounts/memberships
GET    /v2/accounts/devices
POST   /v2/accounts/devices/revoke
POST   /v2/accounts/recovery/prepare
POST   /v2/accounts/recovery/commit
POST   /v2/accounts/delete-intent
DELETE /v2/accounts
POST   /v2/accounts/memberships/:appId/delete-intent
DELETE /v2/accounts/memberships/:appId
POST   /v2/accounts/handoffs
POST   /v2/accounts/handoffs/consume
POST   /v2/accounts/handoffs/cancel
GET    /v2/accounts/app-join-invitations
POST   /v2/accounts/app-join-invitations
POST   /v2/accounts/app-join-invitations/consume
POST   /v2/accounts/app-join-invitations/cancel
GET    /v2/accounts/bridges/chord
POST   /v2/accounts/bridges/chord/prepare
POST   /v2/accounts/bridges/chord/dual
POST   /v2/accounts/bridges/chord/finalize
POST   /v2/accounts/bridges/chord/rollback
```

Lifecycle mutations require an operation ID, a request fingerprint and the
current authorization/CAS contract. Recovery rotates the single current
Recovery Code, revokes old Account containers and preserves datasets. An
environment revoke also revokes linked app devices without deleting data.
Delete first enters a seven-day grace state; bounded scheduled cleanup performs
physical purge only after the grace boundary.

### Admission and authority separation

The control plane has two explicit admission modes; one is never inferred by
removing checks from the other:

- **QA admission** starts with a one-time QA Enrollment Code and creates a
  scoped QA session. QA Account requests and QA App Join retain the session
  binding and the existing QA query activation.
- **Production public admission** starts without QA material. Its public
  bootstrap is `POST /v2/accounts/start`, protected by exact origin,
  Turnstile action, the Account-start limiter, operation ID, client-generated
  candidate Account credential, Recovery-saved confirmation and both
  independent public-admission gates.
- An **Account credential** authorizes Account summary, environments,
  membership/Join issue, revoke and delete. It never authorizes app payloads.
- An **app credential** authorizes exactly one app data plane. Production app
  credentials remain usable when new public admission is switched off.
- A **Recovery Code** is a separate verifier-only recovery authority. It is
  not an Account, app or QA credential and is never persisted by the client.
- An **App Join invitation** is a five-minute, one-time, verifier-only grant
  bound to Account, membership, target app, issuing Account device and
  operation. Production consume creates distinct Account and app devices and
  creates no QA session.

Account read, data-plane read/write, Recovery and lifecycle exit paths do not
derive authority from the public-admission switch. Closing admission must not
brick an existing production Account.

### Current production exposure

General production admission is enabled for Pro editions:

- `SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED` is exactly `"true"` in the active
  Worker deployment. Missing, malformed and differently-cased values fail closed.
- Production Account start also requires Account runtime
  `rollout_mode = 'open'`; this is independent from QA admission.
- `SYNC_ACCOUNT_PUBLIC_APP_IDS` is parsed as an exact, unique app allowlist.
  Invalid entries and duplicates fail closed.
- `apps/shared/sync-account/production-config.js` is loaded by Cruise Port and
  the four Pro apps with `enabled: true`. The exact
  `soundcruise.jp?sound-cruise-qa=1` path still selects QA mode.
- Standard Chord, Pitch, Fretboard and Rhythm load neither production config
  nor Account/data-plane wiring.
- Legacy Chord new start remains independently frozen unless
  `CHORD_LEGACY_NEW_START_ENABLED` is exactly `true`; existing Legacy
  credentials and routes are unchanged.
- CORS remains exact-origin `https://soundcruise.jp`. Domain-separated
  peppers, Turnstile actions and independent limiter bindings fail closed.

General enablement remains controlled by three independent layers: the Worker
static admission switch, the Account runtime row and the client production
configuration. No one layer is sufficient by itself.

### Current release evidence boundary

Four-app onboarding and cross-container sync, offline/outbox recovery,
lost-save prevention, tombstones, conflict safe-stop and both conflict
resolutions have Remote acceptance. Account Recovery and environment revoke
also have recorded Remote lifecycle operations. App-scoped and Account-wide
delete have comprehensive transaction, grace, concurrency, response-loss and
isolation tests, but their destructive product flows still require dedicated
Remote acceptance on disposable lifecycle QA Accounts.

## Historical checkpoint record (M2-M9.5)

The remainder is retained to explain why each boundary was introduced. Its
checkpoint-specific production statements are not the current release plan.

## M7 Fretboard data-plane adapter

M7 adds the local, unreferenced adapter
`apps/fretboard_cruise/sync/fretboard-sync-adapter.js`. Neither shipped
Fretboard edition imports it, and production admission remains Chord-only. The
app ID is `fretboard`; canonical schema version starts at `1`. The existing
Fretboard app state has no IndexedDB store and continues to use the single
`fretboard_cruise_state` localStorage key. The adapter never uploads that giant
state as one record.

### State inventory and sync boundary

Required cloud content is limited to explicitly saved custom route stages,
custom quiz stages, and saved edits to the six official route/quiz stages.
Recommended content is stage completion/attempt/perfect counts, completed basic
rule steps, custom-stage order, and portable practice preferences: tempo, quiz
time/question limits and countdown sound, notation, loop count, note-name
visibility, progression/tap mode, and legacy rhythm sound type.

The current screen/course, the entire in-progress `memorize` session, current
question/answer/score/combo, `visualize` selection, rule navigation, selected
settings tab, and temporary UI state are ephemeral. `routeEditor`,
`quizEditor`, both Pro custom editors, preview data, selection/expansion state,
and their bounded Undo histories are unsaved local drafts. They are not cloud
records even though the legacy app persists them for same-device recovery.

String spacing, camera rotation/perspective, viewport mode, orientation
automation, Bluetooth timing assistance, confirmation timing, rhythm volumes,
group scroll positions and custom-stage scroll positions are device-specific
and remain local. Shipped route/quiz bodies and their applied/model version
markers, plus the route-editor scale-guide variant, are generated built-ins.
The legacy singular `cruiseProCustomStage` is deterministically folded into the
current ordered array without duplicating an already migrated ID. Exact shipped
content is omitted; only a stable built-in-key override is serialized when the
saved semantic content differs. There is no current favorite concept or
unbounded learning history.
Pro gate state and all Account/app credentials, Recovery, Pairing, handoff and
token material live outside the snapshot and backup boundary.

Custom stage names and group names are user-entered cloud content. No notes,
profile fields, recordings, debug information or runtime answers are uploaded.

### Canonical records, identity and references

The Fretboard registry accepts `settings`, `custom_route`, `custom_quiz`,
`builtin_route_override`, `builtin_quiz_override`, `stage_order`, and
`progress`. Route/quiz notes are bounded `(stringName, fret)` pairs. Custom
items keep their existing `pcs_*` legacy identity through stable
`legacy:route-stage:*` or `legacy:quiz-stage:*` record IDs; a malformed old
item without an ID receives a deterministic semantic-plus-ordinal migration
ID. Thus retry is stable, same-name items remain distinct, and normal rename
does not change an existing ID.

Orders contain canonical references and validation rejects dangling custom
stage references. Official stages use `builtin:route-stage:1..6` and
`builtin:quiz-stage:1..6`. Generated built-in bodies are recognized by frozen
semantic fingerprints. Fretboard local app migration/version markers remain
separate from Sound Cruise canonical schema version `1`; an unknown future
canonical version fails closed.

### Progress, merge and deletion

Official route clear counts and quiz attempt/perfect counts merge by maximum,
which is retry-safe and does not double-count a replay. Completed basic-rule
steps merge by set union. These counters have no trustworthy per-operation
clock, so timestamps are not invented and device time never chooses a winner.
Settings merge field-by-field. Disjoint custom additions and compatible order
extensions combine; conflicting order of shared references is explicit.
Different semantic payloads for the same custom or built-in override ID return
the shared `semantic_conflict` result instead of silently overwriting.

The current adapter produces an authoritative snapshot. A future online diff
layer compares it with the prior cloud shadow and emits the existing data-plane
delete operation/tombstone for removed custom content or cleared overrides.
No Fretboard-only delete route is introduced.

### Apply, backup and authority

Remote apply validates before mutation, saves one app-namespaced backup of the
complete legacy state needed for exact rollback, and reconstructs only the
durable slices inside the current state. It preserves unknown local fields,
navigation/session state, drafts and histories, display/device preferences,
route scroll maps, and per-group quiz/custom-stage scroll positions. Official
quiz defaults are materialized only so local scroll positions can survive a
remote removal of an override. The adapter then rereads, canonicalizes and
compares the manifest; write errors, invalid references and verification
failure restore the byte-identical prior state. Shared backup storage retains
the latest five Fretboard backups and rejects credential-like material.

Initial migration requires an active `fretboard` membership and a Fretboard app
device credential. An Account credential alone cannot write app records, and
the adapter creates no Account, identity, membership or device. Existing
`/v1/sync/*` routes remain the data plane. Migration `0013` only expands the
local record-type storage constraint while preserving Chord, Pitch and Rhythm
rows. `SYNC_ALLOWED_APP_IDS="chord"` independently keeps Fretboard unreachable
in production.

## M6 Rhythm data-plane adapter

M6 adds the local, unreferenced adapter
`apps/rhythm-cruise/sync/rhythm-sync-adapter.js`. No shipped Rhythm HTML imports
it, and production admission remains Chord-only. The app ID is `rhythm` and
canonical schema version is `1`.

### Legacy inventory and sync boundary

Rhythm has no IndexedDB data store. Durable app state is split across
`rhythmCruiseSettings`, `rhythmCruiseCreatePresets:v1`,
`rhythmCruiseCustomPresets:v1`, `rhythmCruiseStagePrefs:v1`,
`rhythmCruiseClickSettings:v1`, and the sample-seeding flag. User-created
stages and both saved preset families are required sync content. Saved order,
built-in BPM/bar overrides, tap layout/input/judgement preferences, and durable
click-practice preferences are recommended sync content.

Microphone presets, tap calibration presets, wired/Bluetooth/platform latency,
thresholds, input/audio device selection, click volume, calibration results and
audio setup flags are device-specific. VexFlow zoom is viewport-specific.
Current stage, BPM/bars runtime, editor draft, selected UI, AudioContext,
recording and waveform are ephemeral. The bounded 100-entry result-card history
is local session history rather than durable achievement progress and stays
local; no recording or waveform is persisted or uploaded. Pro auth and all
Account/app credentials, Recovery, Pairing, handoff and token material are
outside snapshots and backups.

### Canonical model and merge

The Rhythm registry accepts `settings`, `custom_stage`, `create_preset`,
`custom_preset`, `stage_order`, `preset_order`, and
`builtin_stage_preferences`. Existing legacy IDs are preferred; missing IDs use
a deterministic semantic hash plus source ordinal, so same-name items remain
distinct and migration retry cannot multiply records. Generated sample stages
use stable `builtin:stage-sample:*` references and are not copied. Deletion,
reordering or editing is represented by an enable override, order record or
stable custom override. Built-in stage bodies are likewise not copied.

Settings merge field-by-field. Stage and preset records merge by stable ID and
report `semantic_conflict` for different content. Timestamp-only preset changes
can combine, but timestamps never decide between semantic edits. Ordering only
combines disjoint references; overlapping disagreement is explicit. There is
no cloud progress record because current Rhythm persistence has no durable
achievement model.

### Apply, backup and authority

The adapter implements the shared read/normalize/validate/serialize/meaningful/
merge/apply/backup/restore/manifest/migration-plan contract. Apply validates and
backs up before the first write, writes every managed key, rereads and compares
the canonical manifest, and rolls back every managed key after any injected
write or verification failure. Local latency, calibration, audio, zoom and
history survive remote apply. Shared app backups are app-namespaced,
secret-rejecting, and now retain only the latest five backups per app.

Initial migration requires an active `rhythm` membership and a Rhythm app
device credential. An Account credential cannot authorize record writes, and
the adapter creates no Account, membership, identity or device. Existing
`/v1/sync/*` routes remain the data plane. Migration `0012` only expands the
local record-type storage constraint while preserving Chord/Pitch rows;
`SYNC_ALLOWED_APP_IDS="chord"` independently keeps Rhythm unreachable in
production.

## M5 Pitch data-plane adapter

M5 adds a local, unreferenced Pitch adapter at
`apps/pitch-cruise/sync/pitch-sync-adapter.js`. It is not imported by the Pitch
HTML and therefore exposes no production UI or network path. The official app
ID is `pitch` and its first canonical schema version is `1`.

### Legacy inventory and classification

The adapter reads only these durable Pitch keys:

- `pitchTrainerProData`: built-in and user-created chords/progressions (mixed in
  the legacy representation).
- `pitchTrainerSettings`: shared learning/display preferences plus the local-only
  audio calibration fields `baseHz` and `sustainTime`.
- `pitchTrainerProAccidentalDisplay`: shared display preference.
- `pitchTrainerStagingProMelodySlots` and
  `pitchTrainerStagingProChordSlots`: explicitly saved custom stages and order.
- `pitchTrainerTestModeEnabled` and `pitchTrainerTestModeResults`: durable test
  preference and bounded per-stage completion progress.

User-created chords, progressions and saved stages are required sync data.
Display/learning settings and bounded progress are recommended sync data.
`baseHz` and `sustainTime` are device-specific and remain local. Current screen,
tab/modal/editor state, current question/answer, timers, score/streak, AudioContext
and other session state are ephemeral. Generated default chords/progressions are
built-in and are never copied to D1. Pro gate state, app/Account credentials,
Recovery, Pairing, handoff, badge/intro state and edition navigation state are
security or UI bookkeeping and are outside both snapshot and backup.

Pitch stores no microphone recording or unbounded session history. User-entered
custom names and stage descriptions are part of the items the user explicitly
chooses to sync; M5 adds no new identity/profile field.

### Canonical records

The `pitch` registry accepts `settings`, `custom_chord`, `custom_progression`,
`melody_stage`, `chord_stage`, `stage_order`, and `progress`. Payloads are
strictly app-specific even where a type name overlaps Chord. Legacy numeric IDs
become stable `legacy:<kind>:<id>` record IDs. Missing legacy IDs use a
deterministic semantic hash plus source ordinal, so retry/response loss cannot
multiply records.

Built-in chords and progressions use version-independent keys such as
`builtin:chord:c` and `builtin:progression:basic`. Exact built-in payloads are
excluded. A user disabling a built-in is represented only as a settings
override. An edited generated chord is a stable built-in override record,
whereas an additional user-created chord that merely has the same notes remains
a separate custom record. Custom progressions and custom chord stages reference canonical
custom IDs or stable built-in keys, never a generated Date-based built-in ID.

The synced settings fields are `instrument`, `notationStyle`, `scaleEnabled`,
`isAnswerMode`, `keyRandomMode`, `baseOctave`, `keyOffset`, `noteSpeed`,
accidental display, test mode enabled, and built-in enable overrides. Apply
preserves the current device's `baseHz` and `sustainTime`.

### Snapshot, migration, merge and apply

The adapter contract provides local read/normalization, strict validation,
deterministic record serialization/deserialization, meaningful-data detection,
category-aware merge, manifest calculation, backup/restore, remote apply, and
initial-migration planning. Unknown schema versions and malformed/dangling
legacy references fail closed. Generated built-ins and default settings alone
are not meaningful local data.

User-created records merge by stable ID. Different semantic payloads for the
same ID are explicit conflicts. Settings merge by independent field and stop on
an overlapping disagreement because legacy settings have no trustworthy update
timestamp. Progress merges `clearCount` by maximum and `lastClearedAt` by the
latest valid completion time, avoiding double counting after retry. Disjoint
saved-stage orders can be combined; overlapping different order is a conflict.
Timestamps are not generic last-write-wins signals. The completion timestamp is
semantic only for progress.

Remote apply validates first, writes a backup through the injected shared app
backup store, materializes all managed keys, rereads/canonicalizes, compares the
manifest, and restores every managed key on any write or verification failure.
The shared backup database is separate from Account credential storage and
rejects auth/credential/Recovery/Pairing/handoff/token material.

Initial migration requires an active `pitch` membership and a `pitch` app
device credential. An Account credential may accompany control-plane context
but cannot authorize a Pitch record operation. The adapter creates no Account,
membership, identity or device.

### Worker boundary and rollout

M5 keeps `/v1/sync/*` as the revision-safe app data plane and adds an
app-specific record-schema registry rather than a second Pitch-only route.
Chord validation and hashing remain backward-compatible. Migration `0011`
expands only the record-type storage constraint while preserving existing rows;
runtime admission still requires the independent app allowlist. Production
`SYNC_ALLOWED_APP_IDS` remains exactly `chord`, so the local Pitch registry and
adapter cannot be reached in production in M5.

## Decision

Sound Cruise Sync uses a hybrid model: a shared Account control plane sits above
the existing app-scoped sync identities and datasets. `sync_users` is not
converted into the Account table and is not rekeyed. A membership may point to
one existing app identity through `sync_user_id`.

```text
Sound Cruise Account
├── one Account Recovery credential
├── Account credential containers
├── Chord membership ───── existing app identity/dataset/devices
├── Pitch membership ───── app identity/dataset/devices
├── Fretboard membership ─ app identity/dataset/devices
└── Rhythm membership ──── app identity/dataset/devices
```

This retains the proven Chord data plane and gives Cruise Port a control-plane
summary without allowing Port to read or write another app's browser storage.

## Non-negotiable invariants

- Existing Chord `/v1/sync/*` routes, tables, Recovery and credential semantics
  remain unchanged until an explicit, user-confirmed bridge commit.
- Applying the M2 migration creates no Account for an existing Chord user,
  revokes no device, rotates no Recovery verifier and changes no dataset.
- Standard editions remain local-only. Multi-App Account admission is Pro-only
  in clients, but Worker authorization never treats a client-side Pro gate as a
  security credential.
- Cruise Port is optional. Each Pro app can create or join an Account without
  Port and continues syncing if Port is unavailable.
- An app extracts and applies only its own local data in its own storage
  container. Port never reads app `localStorage` or IndexedDB.
- Recovery, Pairing and handoff plaintext is shown or transported only where
  required and is never stored in D1. D1 stores fixed-length verifiers.
- Multi-App rollout has an independent authoritative D1 gate. Its migration
  default is `development` with every operation disabled.
- The existing Chord record allowlist remains Chord-only in M2. App IDs and
  record validation are not broadened before an adapter exists.

## Schema ownership

### `sync_accounts`

Owns Account state, the single Recovery verifier/version, generation and delete
lifecycle. Account Recovery uses compare-and-swap against both Recovery version
and Account generation.

### `sync_account_memberships`

One row per `(account_id, app_id)`. The app IDs are `chord`, `pitch`,
`fretboard`, and `rhythm`. A membership starts `pending` with no `sync_user_id`.
The app later opens in its own container, creates or validates its app-scoped
identity/dataset, and commits the link. One app identity can belong to at most
one membership.

`recovery_mode` makes the existing Chord transition explicit:

- `legacy`: only the current app Recovery is authoritative.
- `dual`: the bridge exists but legacy rollback remains available while the
  Account Recovery save/acknowledgement is finalized.
- `account`: the shared Account Recovery contract is authoritative.

### `sync_account_devices`

An Account Device is a credential container, not a physical device. Safari,
Home Screen PWA, Chrome profile and another app can be separate credential
containers on the same phone or Mac. The model does not attempt unreliable
physical-device deduplication.

### `sync_membership_device_links`

Maps an existing app device to a membership and, when available, to the Account
credential container that authorized the handoff. The app device remains the
credential used for app data-plane calls. Standalone apps may leave
`account_device_id` null.

### App dataset

The authoritative app dataset remains the existing `(sync_user_id, app_id)`
row in `sync_datasets`, with records and changes in the current data-plane
tables. Memberships do not combine four payloads into one dataset. This keeps
validation, migration, conflicts, backup and rollback isolated per app.

Later app adapters register app-specific record types and schema versions. The
Chord registry stays `settings`, `folder`, `chord`, and `library_order` until
that registry path is implemented and gated.

### Claims, intents and handoffs

- `sync_account_recovery_claims`: short-lived, verifier-only, scoped `app` or
  `account`, and bound to expected Recovery version/generation.
- `sync_account_delete_intents`: short-lived destructive confirmation, scoped
  `app` or `account`.
- `sync_membership_handoffs`: one-time verifier-only authorization from Port or
  an app to another app's isolated container.

M2 created these forward-only schema contracts. M3 exposes only non-destructive
Account creation, read, membership preparation and handoff operations behind
the still-disabled Account runtime gate. Account Recovery and deletion remain
unrouted; a half-implemented destructive endpoint must never be exposed.

## Worker service and API boundary

M2 adds internal repository/service APIs only:

- `createAccountBackbone`: atomically inserts one active Account, one Account
  credential container and one to four pending memberships.
- `activateMembership`: atomically validates an active app identity/dataset and
  credential, links its app device, and activates exactly one matching pending
  membership. Response-loss retries are idempotent.
- `getAccountSummary`: returns non-secret Account and membership/dataset status;
  verifier fields are never selected.
- `provisionAccount` and `getAccountSummary`: validate input and independently
  enforce the Multi-App D1 gate.

No M2 module is imported by the current request router, so the existing Chord
path cannot accidentally enter the new logic.

The M3/M4 versioned HTTP contract behind the new gate is:

```text
POST /v2/accounts/start
GET  /v2/accounts/summary
GET  /v2/accounts/memberships
POST /v2/accounts/memberships
GET  /v2/accounts/devices
POST /v2/accounts/handoffs
POST /v2/accounts/handoffs/consume
POST /v2/accounts/handoffs/cancel
GET  /v2/accounts/bridges/chord
POST /v2/accounts/bridges/chord/prepare
POST /v2/accounts/bridges/chord/dual
POST /v2/accounts/bridges/chord/finalize
POST /v2/accounts/bridges/chord/rollback
```

App payload push/pull remains on app data-plane routes. The new API must not
reuse the legacy `/v1/sync/account` name, which currently means deletion of one
app-scoped `sync_user` even though its historical UI calls that an account.

Account start receives client-generated Account credential and Account
Recovery material. The UI must display and obtain acknowledgement that the
Recovery Code was saved before submitting start. Only dedicated HMAC verifiers
are stored. A client operation ID plus request fingerprint makes a response-loss
retry return the original Account rather than create a second one.

Handoff issue likewise receives client-generated 256-bit opaque material. The
issuer retains the secret only in memory and opens the target app with
`#sound-cruise-handoff=...`; the target removes the fragment with
`history.replaceState` before making a request. D1 stores only the dedicated
handoff verifier. Consume atomically creates one Account credential container,
one reserved app identity/device, a membership link and an active membership.
It deliberately creates no `sync_datasets` row and does not migrate payloads.
Exact consume retries return the original IDs; a different retry is rejected as
consumed.

The reserved app identity is marked in `sync_account_managed_users`. Its
internal Recovery verifier exists only to satisfy the legacy `sync_users`
invariant and is not a user-facing app Recovery Code. M4 must explicitly reject
legacy app Recovery for this marker before connecting any app client.

M3/M4 use three dedicated future secret domains and four independent future
rate limit bindings:

- `SYNC_ACCOUNT_CREDENTIAL_PEPPER`
- `SYNC_ACCOUNT_RECOVERY_PEPPER`
- `SYNC_ACCOUNT_HANDOFF_PEPPER`
- `ACCOUNT_START_RATE_LIMITER`
- `ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER`
- `ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER`
- `ACCOUNT_BRIDGE_RATE_LIMITER`

Exact Account origins come from `ACCOUNT_ALLOWED_ORIGINS`; wildcard CORS is
forbidden. Account creation requires Turnstile action
`sound_cruise_account_start`. Authenticated handoff issue and a 256-bit,
short-lived, one-time consume do not add a second Turnstile interaction. All
bindings are fail-closed. M3 does not add any production config, secret or rate
limit binding.

Shared additive browser primitives live in `apps/shared/sync-account/`. Account
credentials use their own IndexedDB database and never reuse app credential
keys. Account Recovery and handoff tokens are rejected by the persistence
abstraction. M4 adds a Chord-specific bridge adapter to this unreferenced shared
directory. The current Chord client still does not import any of these files,
so the bridge has no production UI entry point.

## Independent rollout control

`sync_account_runtime_control` is separate from `sync_runtime_control` and has:

- Account admission
- membership admission
- Account summary read
- Account Recovery
- Account delete
- Port orchestration

The default is `development` and all flags are off. Admission is also denied in
`development` and `closed` even if a flag is set accidentally. Recovery and
deletion can remain independently available during an admission close so an
existing Account is not trapped. No current Chord route reads this table.

## Recovery model

There is one Account Recovery Code. It is not copied into four app rows.

### App-scoped Recovery

1. Verify the Account Recovery Code and rate/Turnstile checks.
2. Prepare a claim for one membership and show only that app's dataset summary.
3. Generate and show the next Account Recovery Code once.
4. After the user confirms storage, commit with Account version/generation CAS.
5. Rotate the one Account Recovery verifier, revoke only app devices linked to
   the target membership, create replacement credentials and cancel conflicting
   claims/handoffs.
6. Other memberships and their app devices remain active. Because the shared
   code rotated, every later Recovery uses the newly saved code.

### Account-wide emergency Recovery

The same prepare/save/commit protocol uses `scope=account`, shows a four-app
summary, rotates the Account Recovery verifier, and revokes every Account and
app credential linked to every membership. New app credentials are delivered
only through one-time handoffs when each app opens. Port never receives or
applies app payloads.

Both scopes must be idempotent after response loss. A committed claim is
recognized by its exact claim verifier, next version and created credential.
Concurrent commits use compare-and-swap and transaction rollback.

## Delete model

### App-scoped delete

The intent names one membership. Commit marks that membership and its linked
app identity deleting, revokes only its app devices, and schedules only that
dataset for purge. Account and other apps remain active. App-local storage is
not deleted by the Worker or Port.

### Account-wide delete

The intent has `scope=account`. Commit marks the Account and all memberships and
linked app identities deleting, revokes all Account/app credentials, and
schedules every cloud dataset for purge. This is an explicitly labelled,
secondary security operation and is not the default delete UI.

## Cruise Port orchestration

The primary “4つのアプリをクラウド同期” operation creates an Account and four
pending memberships. It does not migrate app data. For each app:

1. Port requests a short-lived one-time handoff.
2. The app opens in its own origin/container and consumes that handoff.
3. The app inspects its own local data, shows the existing safe migration/merge
   summary, and runs its adapter only after confirmation.
4. The app commits membership activation and reports server-side progress.
5. Port displays `未設定`, `初回同期が必要`, `同期済み`, or `要確認` from
   membership/dataset metadata.

The raw handoff secret should be carried in a non-persisted fragment or entered
by the user, then removed from browser history immediately. Only its verifier is
stored. A handoff is app-bound, membership-bound, expiring and single-use.

An individual Pro app follows the same protocol with one initial membership.
The user may add Port and the other memberships later. Port outage never blocks
normal app push/pull or app-scoped security actions.

## Existing Chord bridge

There is no automatic backfill in migration `0008` or `0010`. M4 implements an
explicit, dual-authority protocol:

1. If no Account exists, the client first uses the existing Account start flow.
   Its Recovery candidate must be shown and acknowledged as saved before the
   Account is created. Existing Accounts reuse their already saved Account
   Recovery version; a second Account is never created for that path.
2. The client then presents both an active Account credential and an active
   Chord app credential. Neither authority can claim the other by itself.
3. `prepare` checks an active legacy user, a ready Chord dataset, a pending Chord
   membership, matching generations, no Account-managed marker, no active
   legacy Recovery claim/delete intent and no conflicting bridge. It persists
   only operation metadata and returns a non-secret record/device summary.
4. `dual` atomically activates the pending membership, points it to the existing
   `sync_user_id`, links the two credential containers, bumps generations and
   records the acknowledgement. It creates no user, device, dataset, record or
   change and does not rotate the legacy Recovery verifier.
5. `finalize` is a separate explicit CAS. It verifies both live credentials,
   active membership, ready dataset, Account Recovery verifier/version and all
   generations. Only then does it set `recovery_mode=account`, add the managed
   marker and disable legacy Recovery by version rotation plus a keyed internal
   verifier. The app devices and data plane remain unchanged.
6. A prepared bridge can be rolled back directly. A dual bridge atomically
   removes only the membership/device link and returns that membership to
   pending. The Account, its other memberships and all legacy Chord data remain.
   Finalized bridges are forward-only; a silent downgrade would revive an old
   authority and is therefore rejected.

Every transition has an operation ID, secret-free request fingerprint,
generation compare-and-swap and exact-retry resolution before rate limiting.
The first credential-container pair to prepare owns that bridge attempt; a
simultaneous Safari/PWA attempt (even for the same Account) receives an explicit
ownership conflict rather than creating or silently taking over a second link.
The browser stores only resumable bridge metadata before the network call. It
never persists Account Recovery, legacy Recovery or handoff plaintext. A reload
can reconcile `prepared`, candidate-saved, `dual`, finalized or rolled-back
state from the server.

### Dual-mode authority and legacy operation matrix

Dual mode deliberately follows the conservative policy: legacy Recovery alone
remains executable until finalize. Account Recovery becomes the Chord Recovery
authority only in account mode. A successful legacy Recovery or legacy Recovery
Code rotation during dual updates the bridge's expected legacy version; it does
not prematurely enable Account Recovery.

| Legacy app operation | legacy | dual | account |
|---|---:|---:|---:|
| push / pull / snapshot / migration completion | allow | allow | allow |
| Pairing | allow | allow | allow |
| app device list / revoke | allow | allow | allow |
| legacy Recovery prepare / commit | allow | allow | deny |
| legacy Recovery Code issue | allow | allow | deny |
| legacy app Cloud Delete | allow | deny | deny |

Cloud Delete is also denied while a bridge is merely prepared, because a
pre-issued app deletion racing the ownership commit could orphan the Account
membership. Account-scoped deletion will be implemented through the dedicated
Account intent model, not by weakening `/v1/sync/account`.
Pending Pairing is not a destructive ownership conflict: Pairing remains
app-scoped, and any change in active-device count is informational rather than
part of the bridge CAS.

Migration `0010` adds only bridge state/operation metadata and the membership
legacy-Recovery-disabled timestamp. Expired `prepared` rows are transitioned to
`rolled_back` by the bounded cleanup chain. An abandoned new Account is retained
rather than automatically deleted: the user already owns its credential and
Recovery Code, and it may contain other memberships. No production migration,
binding, secret, runtime switch or client import is part of M4.

## App adapter boundaries

Every adapter owns:

```text
extractLocalSnapshot()
validateRecord()
serializeRecords()
applyRemoteSnapshot()
merge()
isMeaningfulLocalData()
backup()
restore()
```

- Chord remains the reference typed-record implementation.
- Pitch must distinguish built-in/default chords and progressions from user
  content before upload. Development and test keys are excluded.
- Rhythm syncs durable custom stages/presets and selected settings/progress.
  Audio, waveform, device latency/calibration and session state are excluded.
- Fretboard must first split the large `fretboard_cruise_state` into canonical
  durable records. Editor drafts, history, current exercise and transient UI
  state are excluded. Uploading the current monolithic blob is prohibited.

## Revised checkpoint roadmap

- **M2 (this checkpoint):** additive Account schema, internal repository/service,
  independent fail-closed gate, migration and compatibility tests.
- **M3 (this checkpoint):** versioned non-destructive Account/handoff API,
  verifier-only one-time handoff, reserved app identity activation and additive
  shared transport/credential primitives. Chord remains unmodified.
- **M4 (this checkpoint):** existing Chord opt-in bridge
  (`legacy → dual → account`) with response-loss, concurrency, destructive
  guard, crash-resume and rollback coverage; still unreachable from production
  clients.
- **M5:** Pitch canonical adapter and standalone/Account membership flow.
- **M6:** Rhythm canonical adapter with audio/device-state exclusions.
- **M7:** Fretboard durable-state extraction and canonical adapter.
- **M8:** Cruise Port Sync Center read model and restrained UI, still behind the
  independent gate.
- **M9:** one-tap four-membership orchestration and mixed-completion progress.
- **M10:** integrated Mac/iPhone browser/PWA QA, scoped/global Recovery and
  delete, emergency gates, staged Remote D1 migration and production rollout.

Every checkpoint requires current Chord regression, Standard local-only
regression, Worker tests, `git diff --check`, secret scan and an explicit STOP
gate before Remote D1 writes or production deployment.

## M9 one-tap orchestration and client runtime

“4つのアプリをクラウド同期” means control-plane preparation, not central data
upload. Cruise Port creates the Account only after the user has saved the
client-generated Account Recovery Code, idempotently prepares four memberships,
and reconstructs progress from the authenticated server summary. It never opens
an app data database or reads any app local-storage key.

App handoffs are issued just in time when an app row is selected. The five-minute
one-time secret is carried only in the URL fragment. The receiving Pro app removes
the fragment with `history.replaceState` before network work and never writes the
secret to Web Storage, IndexedDB, logs, analytics or a referrer. An abandoned or
expired handoff is simply reissued from Port; membership progress remains intact.

Handoff consumption has two explicit modes. `new_app` creates the reserved
Account-managed app identity. `existing_chord` also requires a live Chord data
credential and creates only the app-container Account device; it leaves the
membership pending for the dual-authority M4 bridge. Thus Port cannot assert that
a Chord installation is existing, and consuming a handoff cannot duplicate its
user, device or dataset.

Pitch, Rhythm and Fretboard use one shared client runtime with their M5–M7
adapters. The runtime owns an app-namespaced credential, persistent outbox,
canonical shadow, cursor, conflict markers and retry state. A missing
Account-managed dataset is bootstrapped through an authenticated, idempotent
endpoint. Initial setup handles empty upload, hydrate and adapter merge; semantic
conflicts stop without applying data. Normal local saves remain durable first and
then emit a narrow dirty notification. Cloud failure never rolls back that local
save.

On startup, focus, online resume and a local save, the runtime reconciles a server
snapshot without polling. Diffing the last acknowledged shadow produces stable
record updates and tombstones. An operation ID is created once and persisted in
the outbox, so response-loss retries reuse it. Revision conflicts are retained for
user attention, 429/5xx use bounded exponential backoff, pause gates retain work,
and revoked credentials stop with an authentication-required state. Adapter
materialization preserves device-only Pitch sound values, Rhythm audio/latency
values and Fretboard viewport/orientation values.

The setup landing and completion UI exists only for a handoff-enabled Pro app.
Completion offers a top-level return to Cruise Port `#sync-center`. Standard pages
load no M9 runtime. The tracked production configuration remains Account OFF and
`SYNC_ALLOWED_APP_IDS=chord`; M9 is activated only by an explicit development
configuration. Account Recovery execution and Account-wide deletion remain M10
work; M9 connects only Account creation and the Recovery-save guard.

## M9.5 Port-first existing-data linking

Cruise Port and each browser/PWA app are independent storage containers. Port
therefore never reads app localStorage/IndexedDB and never copies an Account
credential into an app. The normal cross-container flow uses a short-lived
`SCJ1` Existing App Join Code: Port issues it for one pending membership,
displays it only in memory, and the target app consumes it in its own container.
The app creates separate Account-device and app-device credentials locally, then
runs the same adapter migration as the optional same-container handoff.

Join Codes contain 100 bits of random Crockford material, expire after five
minutes, are verifier-only in D1, and are bound to Account, membership, target
app, issuing Account device, and Port QA session. Issue and consume have separate
rate-limit namespaces. Consume is transactional and one-time; exact operation
retries recover a lost response, while replay, wrong-app use, cancellation,
expiry, issuer revocation, and concurrent candidates fail closed.

Chord with a live legacy credential consumes in `existing_chord` mode and then
uses the M4 `legacy -> dual -> account` bridge. Chord without a credential and
Pitch, Rhythm, and Fretboard use `new_app`, then perform their own local
migration. Local meaningful/cloud empty uploads local data; local empty/cloud
meaningful hydrates; both meaningful use semantic adapter merge. Before remote
materialization the app saves a secret-free local snapshot; apply failure rolls
back that snapshot. Semantic conflicts stop before overwrite.

Legacy Chord start is frozen independently for new callers. Previously issued
Chord credentials retain push, pull, Pairing, Recovery, and delete behavior;
Standard remains local-only. M9.5 does not widen production Account/runtime
flags, origins, app allowlists, secrets, or bindings.
