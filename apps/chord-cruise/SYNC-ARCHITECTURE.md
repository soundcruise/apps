# Chord Cruise Sync architecture

Chord Cruise has two deliberately separated sync layers.

## Legacy compatibility layer

The Legacy layer remains authoritative for an existing active Legacy identity. It owns the original Chord device credential, pairing, recovery, delete, migration, and semantic merge paths. Production still blocks new Legacy enrollment while preserving existing Legacy push, pull, pairing, recovery, and delete behavior.

An active Legacy credential is never silently replaced. An unknown credential, wrong verifier, wrong app credential, or any Account-managed identity also stops without replacement.

## Account-managed layer

New Sound Cruise Sync uses the shared Account client, shared Join dialog/card, Account membership, dataset lifecycle, and common ready/attention vocabulary. Chord-specific code is limited to:

- the Chord record and local-storage adapter;
- Legacy state detection and compatibility operations;
- Chord semantic hydrate/merge confirmation;
- the retired Legacy identity bridge.

Ready Account-managed datasets hydrate or start the runtime. They never re-run `beginInitialMigration`.

## Retired Legacy bridge

The Worker may return `retired_legacy_device` only after the exact credential verifier matches a Chord device that is both retired and not present in `sync_account_managed_users`. That result does not consume the Join invitation.

The Chord client then creates one new Account-managed app-device candidate and persists only a non-secret, operation-bound marker containing the retired device ID and candidate device ID. Identity replacement is allowed only when both IDs still match. Settings, folders, saved chords, and library order are outside this marker and must remain unchanged.

The bridge must not accept:

- active Legacy devices;
- unknown device IDs or wrong verifiers;
- credentials for another app;
- active or revoked Account-managed/cross-account identities;
- membership failures as evidence of retirement.

### M13 acceptance evidence

M13 accepts the retired Legacy bridge through strict Worker integration coverage and local data-preservation tests. A dedicated real-device Remote acceptance was not run because no safe, disposable QA-only retired Legacy fixture existed; creating one would require either new test infrastructure or touching a protected identity. This is classified as non-blocking. If such a fixture arises naturally in future QA, the existing product path may be checked without additional implementation.

## Path classification

| Path | Class | Reason |
| --- | --- | --- |
| Legacy bootstrap, pairing, recovery, delete | A — Legacy required | Existing users depend on the original authority model. |
| Chord record adapter and semantic merge | B — Chord required | Chord local schema and merge semantics are app-specific. |
| Retired Legacy bridge | B — Chord required | Only Chord has a pre-Account production identity to preserve. |
| Account Join client, cards, credential generation | C — shared | Uses `apps/shared/sync-account`. |
| Account dataset/runtime lifecycle | C — shared where possible | Chord keeps only its data adapter and hydrate confirmation boundary. |
| Manual “sync setup resume” UI | D — obsolete | Recoverable work resumes automatically; failures use common attention/retry copy. |
| Historical branches without reachability proof | E — unknown | Keep until call sites and state transitions prove them unreachable. |

## Four-app parity

| Lifecycle | Pitch / Fretboard / Rhythm | Account-managed Chord |
| --- | --- | --- |
| Join material and transport | Shared Account client | Shared Account client |
| Join UI and state labels | Shared UI | Shared UI |
| Credential promotion | Shared data-plane bootstrap | Chord adapter, guarded retired bridge only |
| Initial migration | Shared runtime adapter | Chord adapter |
| Existing ready dataset | Hydrate then runtime | Hydrate then runtime |
| Reload/pending recovery | Automatic | Automatic |
| Conflict/offline/outbox | Shared runtime | Existing Chord semantic runtime |
| Legacy compatibility | Not applicable | Isolated Legacy layer |

Do not add new Account-managed product behavior to a Chord-only state machine. Extend the shared Account/runtime layer first, and keep any Chord exception limited to data semantics or the documented Legacy boundary.
