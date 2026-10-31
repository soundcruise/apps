# Writer P2: local compatibility candidate, integrated HOLD

Base: PR107 `f9cdc72b903087c8bf11bba074e0e3228e5cfcae`, parent PR106 `00a022ca65402888553e580d3f9d10fb754ae89e`.
No fix PR followed PR107 in the fresh PR inventory. The PR107 and PR106 worktrees were clean. The UI 0.54 theme branch and the separate dirty UI integration worktree are preserved. This candidate uses a separate clone/common Git directory.

## What changes

Port remains the owner of the same dataset keys, metadata, localStorage repository and image stores. No Account/Pro credentials, ownership, membership, schema, Cloud write epoch, migration, or server permission are adopted or fabricated.

* Normal Port repository writes use a local compatibility context. Its initial Account storage source, observer generation, persisted Account row and Pro observation are checked. Async draft preparation is followed by the existing dataset Web Lock and a readonly transaction on the existing Account DB `meta` store. The actual localStorage publication is synchronous in the Account read's onsuccess callback; cooperating Account readwrite transactions serialize before or after this local publication. Missing/unreadable/replaced sources reject writes.
* A form read before initial Account observation completes cannot retrospectively acquire admission. Its read token remains invalid; an explicit reread is required.
* Pro credential/operation epoch/pending invalidation changes and unknown synchronous Pro observations reject local publication. Pro actions retain their existing operational lease/capability checks; this local snapshot does not renew or grant Pro.
* Constructing an explicitly enabled Studio Sync Client marks its document as requiring Port Owner admission. Its Port iframe writes are quarantined for that document's lifetime, including after Client disposal. Studio Project credentials do not prove Port membership. This blocks the three PR107 counterexamples **also before a session transition**. It is not a completed Account-bound Port writer or an identity-change-specific authorization proof. Port forms remain readable and retain input; normal boot without an enabled Client and standalone anonymous/offline local saving remain supported.
* Rejected writes leave repository data and Project Outbox unchanged. The existing image replacement workflow removes only newly allocated source/final on metadata failure and preserves the old pair. This does not make binary/metadata transactions atomic.
* Port patch 1.24.24 and Studio patch 0.53.1 invalidate their reviewed cache dependency paths. No UI layout/theme changes are included. The inherited four Port theme assertion failures remain unchanged.

## Precise linearization and limits

For cooperating current Port writers, publication of the repository's final non-pending metadata is the local success point, under the Port Web Lock. The readonly Account transaction gives a consistent local Account row at that point; it is NOT a Cloud generation/authorization/CAS transaction, and localStorage plus multiple IndexedDB databases are not one atomic durable transaction.

The change does **not** fully fence noncooperating old builds/raw localStorage writers, raw Account ABA that returns an identical row without a durable observed generation, unobserved remote Account/Device/Pro changes while offline, or another tab's memory-only Studio identity. A Project Client's marker is document-local, not a cross-tab identity authority. New reads after reload are not proof of dataset ownership, and pending A data must never be automatically retagged as B or queued under B.

Consequently integrated P2 and Port↔Studio Cloud acceptance remain **HOLD**. Required next implementation: explicitly adopted existing Port Owner/Authority and all-writer lifecycle, current server authorization/final SQL fence, durable identity transition/retirement with old-build exclusion, Account-scoped pending/explicit reconciliation, and binary-reference/delete recovery across that boundary. Existing isolated Authority/Owner adapters should be reused; no duplicate Port dataset is warranted.

## Data contract and tests

The existing Port Sync adapter's structured record roundtrip covers tuner/metronome/presets, practice menus/sets/cycle/history/calendar, gear/categories and My Apps; device timer/audio state and local binary IDs are excluded. Four-app adapters remain separate owners. Existing synthetic asset upload/download, hash and conflict tests were rerun where affected. These are not proof of authenticated two-device Port↔Studio sync or binary transition safety.

Dedicated Chrome tests cover standalone/iframe local offline saves, observed Account/Device/Pro changes, raw cross-tab Account replacement, two-tab stale CAS, sticky Studio quarantine, failed image metadata cleanup, and normal B preservation. A retained old-build raw-write counterexample is marked HOLD, not counted as a passing security test. The native Chrome/workerd/D1 Project Client fixture preserves real UNKNOWN and explicit reconciliation while Port form writes are rejected. No production data, credentials or services are used; external HTTP requests are blocked.

No Production change, shared write activation, adopted v2 PASS, PR33 HOLD release, main merge or Pages publication is implied. Candidate adoption into the UI line requires a reviewed merge preserving the UI 0.54 work and final version/cache reconciliation. Deployment/auth/storage adoption requires separate approval.
