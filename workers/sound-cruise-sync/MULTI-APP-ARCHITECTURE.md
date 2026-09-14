# Sound Cruise Sync Multi-App Architecture

Status: M1 architecture freeze / M2 local backbone
Date: 2026-09-14

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

M2 creates these forward-only schema contracts but deliberately exposes no new
public Recovery, delete or handoff route. The transactional implementations and
security tests are a later checkpoint; a half-implemented destructive endpoint
must never be exposed to production.

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

The versioned HTTP contract to implement behind the new gate is:

```text
POST /v2/accounts/start
GET  /v2/accounts/summary
POST /v2/accounts/memberships/:appId/handoffs
POST /v2/accounts/memberships/:appId/claim
POST /v2/accounts/recovery/prepare
POST /v2/accounts/recovery/commit
POST /v2/accounts/delete-intents
DELETE /v2/accounts
```

App payload push/pull remains on app data-plane routes. The new API must not
reuse the legacy `/v1/sync/account` name, which currently means deletion of one
app-scoped `sync_user` even though its historical UI calls that an account.

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

There is no automatic backfill in migration `0008`.

1. Existing Chord Sync keeps its current identity, dataset, devices and legacy
   Recovery.
2. Opt-in prepares a new Account and Chord membership without linking them.
3. The client and server show the existing Chord dataset/device summary.
4. The user saves the new Account Recovery Code.
5. Commit links the existing `sync_user_id` and devices and enters `dual` mode;
   it does not rekey the dataset or revoke devices.
6. After a durable client acknowledgement and a successful Account-authenticated
   read, a separate finalization changes the membership to `account` mode.
7. Until finalization, rollback removes/deactivates only the new link and leaves
   legacy Chord fully operational. No old Recovery is invalidated during prepare.

The precise dual-mode credential transition requires dedicated response-loss,
parallel-commit and rollback tests before any pilot or Remote D1 migration.

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
- **M3:** versioned non-destructive Account/handoff API contracts and additive
  shared transport/credential primitives. Do not refactor Chord wholesale.
- **M4:** existing Chord opt-in bridge (`legacy → dual → account`) with
  response-loss and rollback coverage.
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
