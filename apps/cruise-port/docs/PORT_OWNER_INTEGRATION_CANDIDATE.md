# Port Owner integration candidate — isolated PASS, product adoption HOLD

Base: PR114 d32179c874a0a1ef99ad850ef19ebefe5e21cd0c. Port candidate 1.25.0; Studio base-line cache candidate 0.53.2. UI PR112/113 remain separate and unmodified. Neither this version nor a Pro-ready display is Owner adoption.

## Implemented connections

`openIsolatedPortOwnerRepository` connects the existing Port IDB Authority/backend and PortDatasetRepository, not a new Port storage engine. It requires an already published, bound Account Authority; the existing v3 Account mutation source; genuine owner-context observation; existing branded Pro Device Session adapter; and a branded per-operation Account admission. It never installs over normal Port storage at boot or adopts legacy values implicitly.

The new `savePortDataset` action is all-Pro and limited to the existing Port dataset keys, with full dependency pinning and existing domain/forward-schema validation. Schema-version mutation and arbitrary deletion-journal injection are refused. The existing Authority transaction derives deletion intents and validates retained fields. Studio Project qualification is never accepted as Port membership.

Account and Pro commit guards are independent. Only a prepared result from the genuine co-located Account admission factory can mint a request-bound Owner guard. The Authority transaction validates its scope, operation, action, generation, base revision and changes digest before invoking it; a plain callback returning true is rejected even if Pro is valid. The guard rechecks Account/device/membership generation, credential expiry/revocation, source binding, exact control/head and retirement at the local linearization boundary. Pro's original branded guard remains mandatory. Failed or retired handles cannot retry; lost local ACK remains UNKNOWN until explicit historical lookup.

The existing SQL Account Save Owner gains `allowPortRecords: true` only as an explicit isolated opt-in. Default stays BPM-only. It reuses validated Port operations, the same D1 sync repository, Account/app-device/Pro authentication, record CAS, final SQL fence and exact typed receipts. Deletion, newer explicit restore and receipt reconciliation are covered. It does not install schema or expose a new Production route. Operation-lease/cutover combinations with this new flag are refused until their BPM-specific envelope is extended.

## What is actually tested

Node tests combine real Account Owner crypto/SQL, existing mutation receipts, IDB Authority and branded synthetic Pro proofs; a separate official Pro gate/Device Session test confirms the new action cannot substitute Pro for Account admission. A discovered Account-after-observation race and a forged guard bypass were fixed with direct counterexamples.

Dedicated Chrome uses separate profiles and two different synthetic Account/app Device credentials linked to one real fixture Account/membership. Standalone Port Gear UI uploads via the isolated authenticated SQL Owner; the Studio Port iframe downloads using the existing authenticated Cruise Sync snapshot handler, reopens safely, edits using real Port UI and uploads back. This uses actual local D1 and R2 bindings. It is an explicit test transport, not automatic product Sync enrollment or browser local Owner adoption. Auth credentials are held in the test transport/Port context, never sent through an iframe-to-Studio bridge.

The existing Asset Sync uploads source/final through the authenticated asset handler and native D1/R2; another Device verifies bytes/hash. A commit ACK loss is retained, then the same pending operation is explicitly resumed without a second object. This does not prove Account-switch atomicity of every image/icon/attachment workflow. Domain adapter tests exercise all structured families; Chrome's two-device UI roundtrip specifically covers Gear.

## Unresolved product gates

1. **Browser local Owner adoption**: the current synchronous Account admission is a co-located fixture contract. A browser cannot synchronously read live server SQL inside its IDB transaction. An HTTP observation or caller callback is rejected as a substitute. Reuse/extend existing SQL-first Owner operation/lease/receipt application for general Port records, preserving current Account/pointer/retirement checks at local application. Normal boot is intentionally unchanged; PR114's quarantine remains.
2. **Old build / ABA / Offline**: isolation means the adopted fixture reads its Authority namespace, not legacy localStorage, but no product-wide all-writer retirement or server epoch enforcement was performed. No claim of old-build exclusion. Unobserved remote revocation cannot be inferred offline; preserve drafts/pending and reconcile explicitly. No automatic A-to-B adoption.
3. **Binary transition**: full image/icon/attachment owner migration, deletion/re-edit orphan recovery across Account changes remains HOLD. D1/R2/IDB are not one atomic transaction; never delete needed old source/final before recovery proof.
4. **Pro surface**: UI113 readiness/frame-session/relock/audio/microphone/timer/unsaved-crop contract remains required. Local boot readiness is not Pro qualification. No parent credential forwarding or layout/theme changes were introduced.
5. **Project**: schema2, raw JSON CAS, Durable Outbox, UNKNOWN, tombstone/reconcile stay unchanged. Prior dedicated Project evidence is reused, not counted as new proof of a combined adopted-Owner browser flow.

No Production operation, Shared Write activation, formal auth/schema adoption, main merge, Pages publish, v2 change or PR33 HOLD release is included. Integrated Writer P2 remains HOLD. These constraints must remain in any PR, handoff and release decision.
