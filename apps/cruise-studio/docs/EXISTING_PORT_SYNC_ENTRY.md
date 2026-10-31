# Existing Port Sync product entry integration

Candidate: Studio 0.62.0 / Port 1.27.0. UI base PR #127 cb68742de16762f9cffc18f62fcce3ee785d6f32. Port attribution/writer changes are selected from PR #124, with the PR #114 cooperative writer modules. PR #119's isolated SQL Owner repository/API is excluded. Existing UI branch and all existing PR heads are unchanged.

Studio tuner/metronome/practice/Gear/My Apps now open the canonical native Port Pro entry. Native Pro gate, Account DB, Port stores and one native Sync controller own the work. Studio keeps iframe lifecycle/unsaved-leave handling and read-only Port overview (canWrite=false). PR #127's My Apps focus rule remains applied. No dataset mirror is created. NEWS entry is unchanged.

The Account DB in shared/sync-account is the only persistent local Account source. The opt-in Project identity host derives its Account/Pro session from it, invalidates/disposes its old client on Account notifications and creates a new client over the existing Account-keyed Outbox. Duplicate Account registration/recovery/credential entry is hidden in shared mode; users use Port Sync Center. Port membership and Project enrollment remain separate server contracts. Default Studio boot has no Cloud configuration and stays disconnected. No Production transport override is added.

Fresh Account checks run before/after identity and Project HTTP operations and after waiting for the Project lock. Project remote apply publishes inside the existing Account readonly transaction and existing Project lock, retaining final Project revision checks. The linearization claim covers cooperating writers and this final local publication, not arbitrary raw localStorage writers or an already dispatched Cloud request. The backend's existing authorization/CAS remains authoritative for Cloud operations.

Port's explicit attribution choices remain: adopt eligible unbound data into the current Account, retain the previous Account's data, or keep it device-local. Known A data cannot be adopted by B. No automatic deletion occurs. A previously consented mode:sync can resume the same existing controller after a safe native reload/online event, with the controller's fresh Account/attribution checks. A new/unbound Account still requires explicit consent.

Asset corrections: remote crop remains in published metadata until local binary references are valid. Pending local crop is preserved. Missing remote cache is not inferred as local deletion. Hydrated metadata binding and owner IDs/crop publish together under the existing dataset transaction, with exact metadata and visual-base checks. Downloads/hash work stay outside that publication. A local metadata-only event does not initiate image deletion.

Dedicated product E2E uses independent persistent Chrome profiles/processes, the actual Studio index and canonical Port Pro index, native Account/Pro libraries, and a disposable native workerd/D1/R2 backend. Existing v137 Port Sync routes and the existing candidate Project release factory are composed only in the test harness. The local Account admission/Asset flags and Project DDL are synthetic test configuration; this is not acceptance of deployed v138 or Production schema/activation. All backend requests are intercepted locally; external requests are aborted. No real Account, credential or user data is used.

Accepted: real Gear form Port→Cloud→Studio→Cloud→Port; existing tuner/metronome/preset/practice/calendar/My Apps stores; actual photo source/final byte hashes; attachment open/download bytes; offline reconnect; shared Project enrollment and commit-ACK loss with durable UNKNOWN and native D1 revision 1; Account-switch old-form rejection, known-owner attribution rejection, client recreation/no cross-Account Project send; revoked native App Device 410; Pro revoke-pending; default Studio boot zero local writes and canWrite=false. The test itself records exact scoped assertions.

Remaining release acceptance: simultaneous two-profile Port CAS conflict and Port lost-push ACK/reconcile through the actual entry; server-side Pro generation expiry through both products; My Apps icon upload/re-edit/deletion and attachment/photo concurrent deletion/re-edit; worst-case large binary adoption-lock latency; Safari/mobile and noncooperating old-build policy. Prior protocol/unit PASS is not recounted as these missing E2E cases. No release/Production PASS is asserted. Normal anonymous/offline cooperative-writer compatibility is covered by retained local tests; no backend authorization is inferred from a browser lock.

Run from an independent clone, with a preinstalled dedicated test runtime (Playwright/Miniflare/esbuild/fake-indexeddb) and a repo-external output directory:

    STUDIO_TEST_RUNTIME=/absolute/runtime/package.json STUDIO_CLIENT_OUTPUT=/absolute/output node apps/cruise-studio/tests/port-product-sync.browser.mjs

No deploy, migration, merge or public activation is part of this candidate.
