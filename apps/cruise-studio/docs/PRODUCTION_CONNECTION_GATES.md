## Owner Route/Schema候補v1による更新

既存Production dispatcherとの接続候補を実装。通常indexはcapabilityなしで常時拒否、候補DDLはmigrations外・default OFF。原本schema/旧route互換と隔離route/lease/復旧を検証する段階。本番A/C gate（physical commit expiry、clock/TTL/rotation、enrollment/fence、raw writer containment、正式consumer）は解除しない。詳細: `workers/sound-cruise-sync/OWNER_ROUTE_SCHEMA_CANDIDATE.md`。次は未知の本番保証を解消したうえで、別承認の無効状態infra rolloutを判断する。canary/Cloud/1.0.0承認とは分離。

# Studio initial release — production connection gates

2026-10-27 / Studio 0.47.20 candidate, Port 1.24.23, Project schema 2.
This is a classification and delivery plan, not permission to deploy or enable
writes. PR26/27 plus the bounded second-cycle fixture demonstrate isolated owner
contracts. Production remains on the existing public main, Shared Write OFF and
PortDataHost.canWrite=false. Do not treat stale historical roadmap sections as
current acceptance. Evidence is code + focused raw reports, not feature metadata
alone. Score/Pre-DTM full completion is outside initial release scope.

A = required before production saving. B = required before Cloud Sync.
C = required before 1.0.0 release. D = separable later work.
Categories may repeat because saving and Cloud are release dependencies.

| Item | Gate | Current fact / required completion |
| --- | --- | --- |
| Owner clock, Credential TTL/rotation | A, C | Isolated floor/expiry/renewal work. Need production trusted clock semantics, TTL/recovery window, key rotation/retention, revoke and lost-key operations, telemetry and rollback plan. Client/UI time is not proof. |
| Final SQL authorization vs physical commit | A, C | Final assertion/CAS/receipt in SQL batch is tested. Physical expiry-through-commit is NOT proven. Owner must define/approve a valid authorization linearization guarantee or deploy enforceable fencing; do not silently redefine existing expiry contract. |
| Same-origin raw writer | A, C | Known API/old schema rejection exists. Same-origin raw IDB writes cannot be denied by API checks alone. Require explicit containment/cutover/trust boundary and detection/recovery; never claim total raw-writer rejection. |
| Normal Provider/Consumer/writer cutover | A, C | Fixtures only. Production route, authenticated provider, consumer registry/fence, staged opt-in, old writer stop, final save authorization and no-auto-resume must be accepted before connection. |
| Migration/legacy writer | A, C | Isolated manifest/CAS/barrier/crash contracts exist. Need production inventory, backup/readback, forward/unknown-schema refusal, old-build coexistence and restoration rehearsal on disposable copies. No live migration in this task. |
| Binary/backup preservation/recovery | A for participating datasets; B; C | Isolated bytes/hash/readback contracts exist. Before enabling datasets with attachments, exact metadata/bytes, capacity/ack/crash/lost-key/retention and restore must be accepted. A bounded BPM-only delivery cannot be advertised as full Port saving. |
| Cloud Sync/multiple devices | B, C for Port parity | No production connection. Require A gates plus conflict/delete/outbox/device epoch/fence and full dataset/binary recovery; validate credential expiry/revoke and network loss. Local fixture success is insufficient. |
| Real Pro credentials | A for protected saving; B; C | Fixture Pro checks pass. Need approved production qualification/renewal/revocation/device session testing, independently from Account. No secrets or real credentials used here. |
| Safari/microphone/OS IME | C where the feature is promised | Fake microphone/Chrome automation do not prove Safari hardware permission, audio routing/lifecycle or native Japanese IME. Physical printer/MIDI only if included in initial feature promise. |
| PC Port parity gaps | C | Practice/Gear/My Apps are readonly or launch-only; persistent CRUD, attachments, progress/history and settings/Account/Sync UI need owner-based integration. Metadata presentation alone is not feature completion. |
| Home/NEWS/My Apps launch | C focused regression | Existing PC renderers/provider/resolver and readonly flows implemented. Verify production transport/launch/empty/error/a11y. NEWS owner behavior is not changed by this task. |
| Tuner/Metronome PC controls | C | Existing Port logic + memory/draft controls. Formal settings/preset save/cross-device operation still depends on A/B; hardware lifecycle requires real-device acceptance. |
| Further arbitrary isolated renewal cycles | D | Exactly two fixture cycles are supported; do not add third/fourth synthetic features now. |
| Production repeated renewal / history retention | A, C | Real recurring renewal and bounded retention/recovery policy must be provided by the production owner before connecting a lifecycle that needs them. Two fixture cycles alone are insufficient; establish this in the next production owner unit. |
| Full score/TAB/MusicXML/Pre-DTM | D | Excluded by the user's initial-release goal; retain current editing/data compatibility. |
| Studio 1.0.0 version | C | Only after explicit user approval of formal release. Keep 0.x.y until then. Port uses its own version rules. |

## Dependency order and next smallest unit

1. **Next: deliver the existing production Worker owner contract as a disabled,
   reviewable integration unit.** Map current public entrypoints/schema to the
   accepted lifecycle/save/reconcile/operation contract; resolve the authorization
   linearization/clock/TTL/rotation assumptions with the owner. Implement only the
   minimum compatible handler/DDL/feature-flag wiring and disposable migration/
   route tests needed for a later controlled rollout. Default OFF, no deployment,
   no live Account/DB/secret operations and no Studio writer activation. If a
   production guarantee is unavailable, hold that path and name the exact owner
   decision rather than generating another synthetic success.
2. Separately approved production rollout of disabled infrastructure, read-only
   provider observation and operational verification. Preserve existing Port users.
3. Separately approved bounded BPM explicit-save canary: real final admission,
   receipt/recovery, old writer containment/cutover and restoration. Shared writes
   remain gated outside the approved dataset/cohort.
4. Expand owner-based saving to Port settings/Practice/Gear/My Apps and binary
   only after A gates for each dataset; PC UI draft work can proceed in parallel.
5. Connect Cloud/multi-device after B gates; acceptance must include delete/
   conflict/offline/backup and real credential lifecycle. No independent Sync engine.
6. Complete C parity, accessibility/keyboard/layout, real OS/hardware and end-to-end
   regression, then user release approval, version 1.0.0 and approved publication.

Steps 2/3/5/6 require explicit production/release approval. This plan grants none.
The initial backend unit in step 1 advances production compatibility instead of
repeating a broad audit or adding more isolated renewal generations.
