# S2-A Common Pro authentication operations

S2-A Phase 1 is live. Check production migration, secret-name, and Worker deployment metadata to determine H1 rollout status.

## Pro entitlement for paid backend APIs (P0)

App data-plane requests carry two independent credentials: `Authorization: Bearer <device credential>`
and `X-Sound-Cruise-Pro-Authorization: Bearer <existing Pro credential>`. Pro validation uses
`inspectProCredentialReadOnly`: the existing HMAC verifier, global scope, current generation and
revocation state. It performs no Pro credential write. Device/Account ownership and all existing
admission, origin, rate-limit and runtime gates still apply. A client edition or legacy UI marker
does not grant entitlement.

Pro is required for `/v1/sync/start`, `pair`, `pairing-codes`, `bootstrap`, `push`,
`migration/complete`, `changes`, `snapshot`, `removal-safety`, and every asset route (including
binary upload and download). `/v2/accounts` management/recovery/status routes and legacy device,
recovery and Account management remain separately authenticated and do not require Pro.

The deployed P0 baseline has no wall-clock token TTL. The P1 local candidate below adds
bounded backend leases and server-enforced inactivity; it has not been deployed.

Updated Pro clients forward the current v2 token from the existing shared session. Legacy UI-only
sessions use the existing Pro gate to obtain a server credential when accessing the paid backend.
Pro denials reopen that gate; they never detach Account/device bindings, erase records, discard
outbox entries or resolve conflicts. Transient verification-store failures return 503 and retain
the session. An already-open older client must reload to send the new header.

For rollout, publish the additive CORS support first, then the updated client entry points, then
enforcement. Do not turn off enforcement as an authentication workaround. Keep the Pro Auth API
and existing secrets/bindings intact; no D1 migration or production sync write is needed.

## P1 device session lifecycle — local candidate, not production

### Audit and model

Baseline Git: `27aa5b15`; Port 1.18.2 / Pitch 2.27.6 / Fretboard 2.22.4 /
Rhythm 1.17.5 / Chord 1.18.3. The existing opaque `scp1` bearer/HMAC verifier,
generation, revocation, passcode slots and Turnstile/lockout rules remain in use.
The old gate checked `/session` at boot but used unbounded local `validatedAt`
during outages; v1 markers/cookies could unlock without a server credential.

The candidate binds the existing credential to a browser-created P-256 public key.
The private signing key and a separate AES-GCM sealing key are nonexportable
CryptoKeys persisted in an origin-wide IndexedDB database. The token remains in
the existing shared localStorage slot; no Account or application data moves there.
Same browser/origin Pro apps share the keys and credential. Separate Safari/PWA
storage partitions, new browsers and deleted browser storage remain separate sessions.

`POST /v2/pro-auth/device-session/challenge` authenticates the existing bearer and
returns a two-minute, HMAC-protected challenge bound to credential, generation
and public key. `POST .../renew` requires its browser-key signature. A guarded D1
batch enforces revocation, generation, binding, inactivity and one-use proof at
commit time. Copying the bearer cannot rebind an already-bound credential to a
new key. Neither a client edition flag nor a legacy UI marker issues a session.

### Lifetime and normal UX

- Server inactivity: 90 days since the last successful browser-key validation.
- Backend access lease: 7 days, renewed silently at boot, after 12 hours of active
  use, on return to a visible tab, and before paid backend requests when due.
- Local-only offline grace: seven days from server validation in a normal clock
  environment, with device-bound, best-effort rollback detection. Server time and
  the original deadline are sealed under the browser AES key; localStorage
  timestamps never grant offline access. The hardened maximum observed clock and
  persistent block flags are detailed below. This is not a cryptographic guarantee
  of seven real days against a malicious owner of a completely offline browser.
- No fixed absolute password interval. Repeated key validation supports continuing
  use over months/years. Normal refresh/restart needs no passcode.
- Transient network/503/429 failures retain the credential and permit only an
  existing bounded grant. After grace ends the UI locks; returning online silently
  restores a still-active server session without requiring the passcode.
- Explicit reset immediately locks and deletes the local grant, queues the existing
  server revocation even offline, and broadcasts the shared auth change. Authoritative
  revocation/generation/verifier/key mismatch locks on the next online confirmation.
  Late validation and late login responses cannot undo reset or replace a new login.

Re-entry cases: initial login, explicit reset, revocation, generation retirement,
90-day inactivity, a new storage partition/browser/device, lost browser keys or an
unsafe/unverifiable auth state. A prolonged outage alone does not erase a valid
credential. Backend Pro AND Account/device authorization remains enforced at every
data transfer, including assets and the existing AI entitlement verifier.

### Legacy transition and limits

Migration `0033` adds Pro-only metadata/proof replay storage and starts a 90-day
transition clock; no Account, dataset, record, asset or existing verifier/token is
rewritten. A valid unbound v2 token upgrades automatically at its next online visit,
without the passcode or a replacement token. Bound tokens need their existing key.
Old clients can use unbound backend tokens only during the transition. GET `/session`
never renews a bound lease. The old policy compatibility indication becomes false
at the transition deadline; the underlying legacy flag is not abruptly flipped.
The updated gate never accepts v1 UI flags, even while old-client compatibility is
temporarily advertised. A v1-only user has no verifiable entitlement: one password
entry is required and must be communicated as such, not reported as silent migration.

An existing unbound bearer is the only proof available during its first binding;
a previously stolen unbound token cannot be distinguished from its genuine holder.
After binding, a stolen bearer can still use a current backend lease for up to seven
days if it also has valid Account/device authority, but cannot renew without the key.
This does not protect against arbitrary same-origin script execution, a compromised
OS or full browser-profile theft. Static local Pro code remains client-controlled;
the server enforcement protects paid backend operations. Offline clock checks are
bounded normal-browser safeguards, not a trusted hardware clock or DRM claim.

### Production migration plan and release gate

Do not deploy this candidate automatically. Required before production:

1. Restore Cloudflare D1 read authorization and inspect aggregate generation,
   active/revoked credential counts, oldest issuance and legacy compatibility. The
   initial attempted read returned API 7403 on 2026-10-04; the acceptance audit below
   subsequently completed read-only access with existing permissions. Public policy reports
   protocol 2 / legacyCompatibilityEnabled=true. No secret/token values were read.
2. Validate Safari home-screen PWA and Android Chrome key persistence/storage
   partitions using disposable isolated sessions. Confirm real existing v2 sessions
   upgrade without a password; record v1-only/storage-failure cases explicitly.
3. Back up Pro metadata and apply additive migration 0033 only. Leave generation,
   passcode, revocation, Account and application data unchanged. The transition
   starts at migration time, so do not apply it prematurely.
4. Deploy the compatible Worker with existing bindings/secrets intact, then publish
   all five helper/gate entry points. The new client also supports online validation
   against a pre-P1 Worker without creating an unchecked offline grant. Update cache
   references and verify every entry point. Set formal patch versions at release;
   current local S2-A work keeps formal app versions unchanged per AGENTS.md.
5. Observe aggregate bound/unbound counts and auth failure codes before the deadline.
   Advance by a forward change if cohorts remain on old clients; never restore
   unlimited trust, lower generation or silently unbind credentials. Communicate the
   single v1-only login. Require explicit release approval after compatibility evidence.
6. Retire the legacy flag only after the validated cohort is migrated and the finite
   transition completes. Keep all Pro endpoints available during rollback; an old
   gate may not understand bounded grants. Prefer a compatible forward fix.

Local tests cover 14 months of silent server renewal, 90-day inactivity, seven-day
lease/grace, real browser CryptoKey persistence/reload, same-origin app sharing,
copied/tampered state, proof replay, revocation/generation races, data preservation,
Account/Sync/asset/AI regressions. Production migration and device acceptance remain
release gates; local success alone is not evidence of production cohort readiness.


### Production readiness acceptance — 2026-10-04, no production changes

Historical acceptance of the initial candidate. The subsequent hardening section
below supersedes its verdict under the explicitly accepted best-effort local model.

Verdict: NOT READY. Legacy retirement: NOT READY now; after the offline-clock
acceptance blocker is resolved, use a migration window rather than immediate flag retirement.

Read access succeeded with the existing Wrangler OAuth/account; no permission was
added. Independent SELECT queries returned rows_written=0 / changed_db=false.
Aggregate census at 16:58 JST: 67 Pro credential rows; 55 unrevoked/current-generation,
12 revoked, zero unrevoked obsolete-generation. Of the 55 eligible rows, 41 were
issued within seven days, 14 within 7–30 days, none over 30/90 days. Issuance spans
2026-09-24 through 2026-10-04. Generation 1 / slot A / legacy flag 1. Migration 0032
is latest; 0033 is absent, so no device-bound format exists in production.
Rows are credentials, not people or guaranteed surviving browser sessions.

Migration classes: A (already-bound) 0; B (valid unbound, next-online automatic
binding) 55; C (v1-only or lost browser storage) unknown; D (revoked/obsolete) 12.
v1-only markers, pending local reset/revoke queues and last-validation timestamps
are client-only/not persisted in the deployed schema; they cannot be counted from
D1. Issuance age is not last-validation age. No telemetry/schema was added merely
to obtain those counts. All 55 surviving valid v2 tokens are server-eligible for
migration without a passcode if that credential remains in the browser. Isolated
real-device key persistence passed; actual production migration was not performed.

**Acceptance blocker: offline clock adjustment.** An isolated reproduction advances
server/real time by eight days while returning the browser clock to its previous
saved time. The encrypted receipt still allows local Pro with seven days remaining.
`allowance()` estimates elapsed time solely from Date.now deltas; if those deltas
stay at zero, its five-minute rollback detector does not trigger. Reloading also
restarts the gate expiry timer from that stale allowance. Encryption protects the
receipt but does not authenticate elapsed time. The previous claim that local clock
changes never extend grace was too broad and is withdrawn. Backend lease and
90-day inactivity are still enforced against server time and reject this bypass.
Do not release until clock handling is corrected and the cross-restart/offline time
limitation is explicitly resolved/accepted. Do not claim that a monotonic in-page
clock alone provides trusted time across browser restarts or device sleep.

Storage-loss isolated tests cover key-only loss, localStorage-only loss, both and
site-data clearing: none restores an already-bound credential; app/Account data is
not touched. Shared Pro/Account/Sync/assets/AI regression subset: 103/103 PASS.
The separate audit probes deliberately assert the observed clock bypass as a finding,
not as a successful security requirement.

Real-device acceptance used the actual local shared gate/device-session helper and
local Worker handler with an isolated in-memory SQLite fixture over temporary HTTPS.
It used a disposable test-only passcode, no production secrets/bindings and no
production auth or application storage. It did not exercise production app screens.

| Context | Observed result |
| --- | --- |
| iPhone Safari, iOS 26.6.1 | Initial authentication, IndexedDB key creation, reload and user-confirmed Safari termination/reopen passed. Both signing/sealing keys reported nonexportable. Twelve-hour equivalent silent renewal, simulated Pro API outage within grace and online recovery passed without another passcode. |
| iPhone home-screen Cruise QA | First open required its own authentication. Context `a90e4420` differed from Safari `69a2bb2e`; after authentication/reload it remained unlocked with its own persisted nonexportable keys. Safari and standalone storage were not forcibly joined. |
| Android Pixel 10, Chrome 154.0.8037.94 | Nonexportable IndexedDB keys persisted across reload and user-confirmed Chrome termination/reopen. Twelve-hour equivalent silent renewal, simulated outage/grace and recovery passed. All five QA routes (Pitch, Fretboard, Rhythm, Chord, Port) stayed unlocked without repeated passcode entry in context `2a566cbf`. |

The twelve-hour/outage checks were fixture time/network simulations; they did not
change device clocks or disrupt production connections. iPhone Safari also shared
auth on the Fretboard QA route; the remaining routes use the same tested shared gate.
A new home-screen storage partition needs one initial login, then renews within its
own partition. It must not be reported as an unexpected reset of Safari auth or as
evidence that application/Account data should be merged. Full standalone process
termination/offline-cycle acceptance was not separately performed.

Active users retaining keys and coming online within 90 days have no scheduled
passcode interval; v1-only state, storage loss, a new browser/partition, explicit
reset, revocation or generation retirement requires reauthentication. D1 cannot
estimate the real user frequency of those client-side events. Prior local candidate
regression suites passed 2014/2014 (Worker 587, Port 992, Shared 249, Pitch 37,
Fretboard 32, Rhythm 21, Chord 96). This audit reran the relevant 103-test subset;
the clock finding prevents treating these passing regressions as release approval.

Backup prerequisites before a future approved migration:

1. Record Worker version `1b7ddaf6-259f-430f-ace3-ff68323e4156`, config/binding names,
   migration list, schema, aggregate row counts and generation/slot/revocation state.
2. At the actual release freeze, record a fresh D1 Time Travel bookmark. Readiness
   bookmark was read successfully; it is not a substitute for a migration-time one.
3. With approved restricted local storage, export only Pro metadata tables
   (`pro_auth_state`, `pro_credentials`, `pro_auth_lockouts` and, after activation,
   `pro_session_proofs`). Opaque bearer/passcode plaintext is not in those tables;
   verifier hashes are still sensitive. Encrypt the backup, restrict access, record
   checksum/counts/schema, keep it outside Git and never print row contents in logs.
   Restore rehearsal must use an isolated DB. No production export occurred here.
4. Add migration 0033 only after client compatibility/device evidence passes. Keep
   Account/dataset/record/asset counts and generation unchanged and compare afterward.

Rollback must preserve the new challenge/renew endpoints, device bindings, bounded
leases and P0 authorization; prefer a compatible forward fix. Migration 0033 is
additive and old SQL can read the old columns, but a pre-P1 Worker is **not** an
acceptable functional/security rollback after P1 clients have been published:
new first-login payloads can be rejected, and its old `/session` fallback loses
binding/time enforcement. Mixed cached clients must be tested during the finite
window. Leave extra columns/tables in place; do not destructively undo migration.

Never restore the whole shared Sync D1 to an old bookmark for a Pro-only incident:
that would also rewind user data. Restore auth metadata only through a reviewed
merge that preserves the highest generation, all newer revocations, existing key
bindings and one-use proof state; never reactivate revoked credentials, unbind a
credential or rewind validation/lease timestamps blindly. No restore/rollback,
revocation, generation change or production mutation was executed in this audit.

Final read-only verification retained 67/55/12 auth total/eligible/revoked rows,
generation 1, slot A, legacy flag 1 and latest migration 0032. Worker deployment
remained version `1b7ddaf6-259f-430f-ace3-ff68323e4156` at 100%. Account/device/data
counts remained 12 accounts, 72 Account-device links, 80 devices, 41 datasets,
516 records and 39 assets; successful queries all reported rows_written=0 and
changed_db=false. Compound SELECT requests hit D1's term limit, so final counts
were verified with separate SELECT calls, without changing schema or permissions.
The temporary local QA server/tunnel were stopped after acceptance. Existing
production apps, browser site data and the temporary phone QA shortcut were left
intact. This audit changed operations documentation only, preserved all prior local
candidate source/test changes, and performed no version bump, stage, commit or push.

### Offline grace hardening — local candidate, 2026-10-04

Security boundary: Sync, attachments, AI and other server-backed Pro operations
continue to require server-side Pro entitlement AND their existing Account/device
authorization. Their server-clock leases, 90-day inactivity, generation and
revocation checks are unchanged. Completely local features use a device-bound
session, recent successful server validation and best-effort clock checks.

The AES-GCM sealed receipt now includes `timeStateVersion: 2`,
`serverValidatedAt`, `localTimeAtValidation`, `maxObservedLocalTime`, a nondecreasing
server-time estimate, `clockRollbackDetected` and `offlineExpired`. The signing and
sealing keys remain nonexportable in the same IndexedDB store. Time state is
authenticated with the credential-specific receipt key as additional data.
An atomic compare-and-swap in the IDB readwrite transaction prevents a stale app
from overwriting another app's newer time observation or block flag; encryption
finishes before opening that transaction. Contention/storage failure fails closed.

During one document's lifetime, `performance.now()` supplies an additional elapsed
time floor. On boot, resume, local use and visible minute checkpoints, the helper
records the maximum wall-clock/elapsed-time observation. Background cached checks
do not renew a server lease; network renewal remains due after 12 hours. A wall
clock more than five minutes below the high-water mark blocks offline trust.
Smaller corrections are tolerated without moving the original grace deadline.
Both detected rollback and observed expiration are persisted even on a denied
check. Reload/restart, restoring the wall clock or repeated rollback does not clear
those flags. Only a successful, key-proven server validation establishes a new
grace origin and clears them. Other open apps recognize that authoritative renewal.

An offline denial retains the token, device keys, Account and application data.
The gate first attempts silent validation; a network failure displays its temporary
revalidation message. Returning online validates and restores a still-active session
without the four-digit passcode. Old local-candidate receipt formats have no unchecked
fallback: the same credential is renewed online without deleting/replacing it.

Limits: a browser that was completely absent and then restarts at its previous
wall-clock value has no authenticated evidence of time spent absent. The original
audit's fresh-client, completely unobserved eight-day reset remains indistinguishable
from a prompt normal restart. It is an explicit limit of the revised security goal,
not described as fixed. Monotonic clocks are document-scoped and may stop during
sleep; full profile/receipt replay, malicious local script and OS compromise are
also outside local protection. See [performance.now() clock and sleep behavior](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now).
The server still rejects an expired lease or inactive session regardless of these
local clock manipulations. Do not claim trusted cross-restart time or offline DRM.

Regression cases cover a running-clock return to validation time, observed expiry
followed by rollback/reload, repeated rollback, small correction, silent recovery,
encrypted time state, concurrent app updates, and the explicitly unobservable
restart limit plus server rejection. The initial implementation failed three of
the new regression cases; the hardened implementation passes them.
Client cache references are helper `?v=2` and shared gate `?v=27`. Formal versions
remain unchanged during this local S2-A phase. No production migration/deploy,
auth mutation, revocation or generation change is authorized by this hardening.

Hardening regression results: 2024/2024 PASS (Worker 587, Port 993, Shared 258,
Pitch 37, Fretboard 32, Rhythm 21, Chord 96). Syntax and diff checks pass.
An actual isolated Chromium browser also passed detected rollback, retained lock
after reload, silent online recovery and all five shared QA routes. These results
use the real candidate helper/gate and an in-memory test Worker, not production
application data. The previous readiness device results above predate this repair;
they do not replace fresh iPhone Safari/home-screen and Android regression.

The new read-only production census still reports 67 credential rows, 55 valid v2,
12 revoked and zero unrevoked obsolete-generation rows; generation 1 / slot A /
legacy flag 1, latest migration 0032. Every query reported zero writes. Valid v2
credentials remain eligible for next-online device binding without a passcode;
client-only legacy/storage-loss counts remain unknown. Legacy retirement needs
the finite migration window described above, never immediate flag retirement.

Fresh iPhone Safari acceptance passed through the USB Web Inspector on 2026-10-04.
In isolated context `c599245a`, initial authentication and reload retained session
version 3 and both nonexportable keys. A 30-second correction did not lock or renew
the session. One-day equivalent offline use remained unlocked; returning the clock
to validation time locked it while retaining the credential. Reload and another
rollback remained locked. Online recovery made one challenge/renew exchange and
unlocked without re-entering the passcode. Clock/network changes were confined to
the QA fixture, not the device settings. No production app/Account data was used.

Fresh iPhone home-screen acceptance also passed in isolated standalone context
`ae04f950`, separate from Safari's `c599245a`. Its own initial authentication and
reload retained both nonexportable keys. An eight-day equivalent offline expiration
locked the session. Returning the clock to validation time and reloading did not
restore grace or delete the credential. One online challenge/renew exchange restored
access without another passcode. Navigation from Pitch to the Fretboard QA route
retained the standalone context, keys and unlocked session. The tests used the
actual candidate helper/gate in QA routes, not the full production application UI.

Fresh Android acceptance passed on Pixel 10 / Chrome 154.0.8037.94 through the USB
DevTools target on 2026-10-04. After the user reconnected USB and restored device
connectivity, the current QA page was inspected directly, rather than relying on
the stale error-page target. In isolated context `6b9d1550`, reload retained session
version 3 and both nonexportable keys. A 30-second correction caused no lock or
renewal. One-day equivalent offline use remained unlocked; returning the clock to
validation time locked the session while retaining the credential. Reload and a
repeated rollback remained locked, with zero network requests while the simulated
Pro API outage was active. Online recovery completed one challenge/renew exchange
and unlocked without re-entering the passcode. The Chord QA route retained the same
context, keys and unlocked session. No additional process-termination test was
repeated; the historical test above is distinct evidence. Clock/outage simulations
were confined to the QA fixture; no device clock/network settings were changed by
the agent and no production app data was used.

Current readiness verdict: **READY WITH OBSERVATIONS** under the explicitly accepted
best-effort local protection model. Fresh Safari, standalone and Android acceptance
now pass. The completely unobserved cross-restart limit remains explicit and is not
claimed fixed. Server-backed enforcement remains authoritative. The temporary local
QA server and HTTPS tunnel are stopped at closeout; existing phone shortcuts/site
data are preserved.

Valid v2 migration/device binding is ready for the next-online transition, subject
to the release-time backup, additive migration 0033, compatible Worker/client order
and explicit production approval described above. Legacy retirement is **READY WITH
MIGRATION WINDOW**, not ready for immediate flag removal: eligible credentials,
cached clients and unknown v1/storage-loss cohorts must be handled and observed
before the finite transition ends. This readiness result does not authorize or
perform a production migration, deploy, auth-state change, commit or push. Formal
app versions remain unchanged and all prior local candidate work is preserved.

### Production session lifecycle activation — 2026-10-04

The user explicitly approved production migration after local/isolated acceptance.
This activation supersedes the local-only restriction above for this release only;
it does not authorize legacy retirement or a generation/passcode change.

Preflight: main/origin main `27aa5b15`, ahead/behind 0/0; all prior candidate files
retained. Production Worker was `1b7ddaf6-259f-430f-ace3-ff68323e4156`; generation 1,
slot A, legacy flag 1, 68 credentials (56 eligible v2, 12 revoked), migration 0032.
Account/application counts: 12 accounts, 72 links, 80 devices, 41 datasets,
516 records, 39 assets. The difference from the earlier census is one normally
issued credential, not a migration-created credential.

Backup completed before mutation: the three Pro metadata tables were read into
memory with Wrangler disk logging disabled and saved as AES-256-GCM ciphertext in
the Git-ignored `.wrangler/pro-session-release-20261004/` directory. The separate
decryption key and backup files have owner-only permissions. No plaintext backup,
bearer/passcode body or verifier contents were printed. Auth schema, Worker settings,
versions, counts and the immediate pre-migration Time Travel bookmark were recorded.
Decrypt/import rehearsal into an isolated in-memory SQLite DB passed. A first plan
to write a temporary plaintext SQL export was rejected by automatic approval review;
it was abandoned in favor of this encrypted, memory-only method.

Migration 0033 applied at 2026-10-04 21:57:35 JST. A memory-only comparison against
the encrypted backup confirmed all original state/credential/lockout fields exactly
unchanged. Generation, slot, legacy flag, eligible/revoked totals and all listed
Account/application counts were unchanged. New bound/proof counts were zero.
The finite unbound transition ends 2027-01-02 21:57:35 JST. This is a migration window,
not permission to turn the legacy flag off without a later observation/review step.

Worker `21000665-c910-4619-aaf3-5295dbb339bc` was deployed at 100% before Pages.
Its bindings, plaintext vars, secret names and runtime flags match the previous
deployment; the cron remains `15 3 * * *` and AI remains off. Public policy now
reports protocol 3, device-session required, 90-day inactivity, seven-day grace,
and legacy compatibility enabled. No production revocation/reset/generation test
or destructive data transfer is permitted as part of acceptance.

Release patch versions: Pitch 2.27.7, Fretboard 2.22.5, Rhythm 1.17.6, Chord 1.18.4,
Port 1.18.3. All normal app asset references and version assertions were updated;
the historical Pitch fallback loader also uses helper `?v=2` and gate `?v=27`.
Full release regression: 2024/2024 PASS, plus the fallback reference regression;
syntax, diff check and secret scan pass. The Worker package manifest is a private
development package version, not a separate deployed application version.

GitHub Pages uses one build from main/root: shared assets and all five app entries
are delivered together, rather than separate app deployments. Each entry loads the
session helper before the gate. Worker deployment must continue to precede that
atomic client release. Pages/existing-session acceptance and post-release metrics
are recorded at closeout below; legacy remains ON while migration is observed.

#### Production acceptance closeout

Release commit `2a6aec9e` was normally pushed to main. GitHub Pages build
1259476867 completed at 2026-10-04 22:11:06 JST. All 14 public HTML/shared/app
asset probes exactly matched the release source, including all five app versions,
helper `?v=2`, gate `?v=27`, and backend helper `?v=2` where used. The cohort
settings-only page retains its existing lack of a data-transfer helper.

Android Pixel 10 / Chrome 154 existing production session was inspected before
the reload: valid v2 shape, generation 1, Port 1.18.2, no device-session helper.
After Pages reload it opened Port 1.18.3 without a four-digit entry. The browser
created nonexportable ECDSA and AES-GCM keys and one encrypted receipt. Production
credential count stayed 68: the existing credential was bound, not replaced.
Pitch 2.27.7 -> Fretboard 2.22.5 -> Rhythm 1.17.6 -> Chord 1.18.4 -> Port 1.18.3
all retained the shared credential and showed no passcode overlay. USB inspection
was interrupted; Android auto-lock was confirmed and unlocking resumed inspection.
This was a physical inspection interruption, not an observed authentication failure.

Offline acceptance used the deployed helper and existing encrypted receipt in an
isolated auth-transport probe: only that probe's request callback threw a network
error. It retained a valid offline grant, then a separate callback to the real
production challenge/renew endpoints silently renewed the same credential.
The production gate remained open and its ensure-session check returned true.
The device clock, device Wi-Fi/mobile settings and production app data were not
modified. This verifies auth-transport outage/recovery; it is not a claim that a
full uncached app can first load while completely offline. Reset, revocation and
generation rejection remain covered by the isolated real-Worker regression suite;
no user's production session was deliberately reset or revoked.

Public production smoke: policy protocol 3 and legacy ON; missing/invalid Pro
credentials denied at session/challenge/renew, Sync and attachment endpoints;
Account summary retains its separate Account-auth denial; AI remains disabled.
All 12 smoke probes passed. Auth/device tokens, verifier contents and passcodes
were never included in reports or screenshots. Temporary DevTools windows were
closed and the Android tab was left at Cruise Port Pro.

Post-acceptance census at 2026-10-04 22:29 JST: 68 total credentials, 56 valid
current-generation credentials, 1 device-bound (1.79%), 55 not yet migrated,
12 revoked, 0 inconsistent bound metadata. These are credential counts, not
unique people. No persistent aggregate migration-error or forced-reauth counter
exists, so those global totals are not measurable; neither occurred in the tested
existing session. Original Pro state/credential/lockout fields still exactly
matched the encrypted backup. Generation 1, slot A, legacy flag 1 and the listed
Account/application counts were unchanged after acceptance. Only additive schema,
device-session metadata and proof replay rows changed as intended.

Production activation verdict: **PASS WITH OBSERVATION**. Legacy retirement
verdict immediately after release: **NOT READY**. Keep compatibility ON and
observe eligible credential migration, failed renewals and reports from cached
clients/v1-only or storage-loss contexts over an operational observation window.
The finite unbound window still ends 2027-01-02 21:57:35 JST; any retirement
decision requires a separate review. Best-effort clock detection remains subject
to the previously accepted unobserved cross-restart time limitation above.

## Phase 1 initial state

Migration 0029 is additive and repeatable. It creates a single state row with generation `1`, active slot `A`, and legacy UI compatibility enabled. Applying it alone does not remove an existing browser's v1 UI entry. Until the active passcode slot, a separate 32+ character credential pepper, Turnstile secret, and rate limiter are available, `/verify` fails closed with 503. `/policy` can still report the compatibility setting.

The Worker reads `PRO_PASSCODE_SLOT_A` or `PRO_PASSCODE_SLOT_B` according to D1 state. Each is a Worker secret containing exactly four ASCII digits. `PRO_CREDENTIAL_PEPPER` is a separate high entropy Worker secret used only for HMAC of bearer credentials. Secret values must never be written to this repository, fixtures, deployment command history, logs, or reports. Existing Turnstile Siteverify uses `TURNSTILE_PRODUCTION_SECRET_KEY`; the Pro action is `sound_cruise_pro_verify`. The public site key remains in the browser.

An independent reviewer should verify the D1 migration, the active slot secret, pepper, Turnstile hostname/action, the dedicated `PRO_VERIFY_RATE_LIMITER` (5 attempts per minute per IP), the public origin, and local gates before any production action.

### Forward release

Release in this order:

1. Provision and validate required Cloudflare resources and bindings.
2. Apply D1 migration 0029.
3. Configure the required Pro secrets.
4. Deploy a backward-compatible Worker that implements the Pro Auth API.
5. Validate the Worker API, including `/policy`, `/verify`, `/session`, and `/revoke`.
6. Publish the GitHub Pages client and its current cache references.
7. Complete device QA and observe the release.

Do not publish the client before the Worker. Standard editions do not load the Pro gate.

### Phase 1 rollback

After a new client has been published even once, do not roll back first to a pre-S2-A Worker that has no Pro Auth endpoints. That combination can treat missing `/policy` or `/session` responses as explicit rejection and lock both legacy and v2 users. Keep the Worker Pro Auth API available throughout rollback. If needed, first return the client to a version compatible with the still-running Worker. If a Worker rollback is necessary, use only a Worker version that remains compatible with every new client and cache that may still be in use. The preferred rule is to prohibit rollback to a pre-S2-A Worker for as long as any new client may exist.

Reverting GitHub Pages does not remove a new client already held by browser cache, a Service Worker, or an offline client. Therefore, publishing the old Pages files is not evidence that it is safe to remove the Pro Auth endpoints.

## Future Phase 2 rotation (not executed)

Prepare the inactive slot with the new four digit value as a Worker secret. Verify its readiness without exposing the value. Change `pro_auth_state` in one D1 transaction: increment `generation`, select the prepared slot, set `legacy_compat_enabled = 0`, `legacy_retired_at` to the change time, and `updated_at` to the same time. The primary-consistent `/session` checks the credential row against current generation, so old tokens require reauthentication immediately after that state change. Do not switch the state before the inactive slot is ready. Once legacy compatibility is retired, do not turn it back on for an outage. Rotate browser assets and communicate the new code through the existing YouTube membership channel.

After Phase 2, never lower the generation, restore legacy compatibility, or restore a retired four-digit passcode. Recovery must keep the server-verification model and use a forward fix or a compatible rollback that preserves the Pro Auth API and current generation.

Cloudflare's Workers rate limiting binding is an abuse control, not a globally exact counter across all data centers. Existing cached client code cannot be remotely erased; the Worker never grants a new credential from legacy state and denies old generation credentials after rotation. Pending browser revocations retry when online, but a browser that permanently loses its local storage before retry cannot complete that best effort request.

## H1 progressive IP lockout

H1 keeps the existing 5-attempts/minute/IP limiter and Turnstile. Only a well-formed, rate-limit-passed, Turnstile-passed wrong four-digit comparison increments the D1 counter. Five consecutive failures start a 5-minute lock, the next five after expiry start a 15-minute lock, and later groups of five start a 30-minute lock. The fifth wrong attempt remains a 401; attempts during the lock receive 429 and `Retry-After`. A successful credential issue resets the IP's failures and escalation. After 24 hours without a wrong-passcode failure, the next failure starts at level 0. The existing daily scheduled cleanup deletes stale rows.

Migration 0030 stores only a 64-character HMAC key and temporary lock metadata. `PRO_LOCKOUT_PEPPER` must be a new, independent, high-entropy Worker secret of at least 32 characters. Do not reuse `PRO_CREDENTIAL_PEPPER`, store a raw IP, or put either pepper in source, logs, or a command argument. A missing pepper or lockout table makes `/verify` return 503; `/session`, `/revoke`, and legacy `/policy` remain available. The lock check precedes Turnstile so a locked request does not consume a challenge. A caller can learn only that its current source IP is locked and the remaining wait in seconds, not the failure count or escalation level. Shared public IPs share this bounded lock.

For production release: independently review H1, apply migration 0030, securely configure `PRO_LOCKOUT_PEPPER`, then deploy the H1 Worker. Keep the S2-A Pro Auth API available throughout. Validate 429/`Retry-After`, successful reauthentication, session/revoke continuity, legacy UI, and aggregate error rates.

Rotating `PRO_LOCKOUT_PEPPER` changes every HMAC IP key, so existing lockout rows no longer match new requests and active locks are effectively reset. Do not rotate it without an operational reason. Accept that reset during an emergency rotation; bearer credentials and the Pro generation are unaffected because they use separate state and secrets.

A temporary rollback from H1 to a pre-H1 S2-A Worker can leave migration 0030 and its rows in D1 safely, but that Worker does not clean stale lockout rows. A prolonged rollback pauses this cleanup. Returning to H1 resumes the existing daily cleanup; do not roll back to a pre-S2-A Worker that lacks the Pro Auth API.
