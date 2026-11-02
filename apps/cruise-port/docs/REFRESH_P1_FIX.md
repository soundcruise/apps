# P1: presentation refresh must not activate Port Sync

Fixed stack: PR #164 a840aed0ec908e7cd36bec9316dc39ce4c0fb231 -> PR #165 a35057b7d2869ce5ca522d16c0a0ff46b1068c10 -> this isolated patch. Main observed: 4a0dc37910f8e520fcb7d4d0af780f1752e16460. All remain unmodified by this task. The unreleased candidate versions remain Port 1.25.0 / Studio 0.71.3; no extra release stage is introduced.

## Reproduction and cause

Native rename save finishes its dialog then awaits onSaved(). That callback is the shared bindSyncCenterActions refresh. In the base, refresh defaulted activate:true, so renderSyncCenterView called ensure before repaint. The same callback is used after invitation close, target revoke/detach, setup/recovery and other action refreshes. It is not an expression of intent to adopt local records.

A synthetic Studio entrance with retained A Gear joined B and correctly withheld initial Sync. Renaming a target then triggered 1 bootstrap, 1 push, 2 snapshots and 1 migration-complete request. Native Sync finished and the entrance removed its frame. The corrected regression waits for the refreshed name, not merely dialog removal: the dialog closes before onSaved completes. An earlier timing-only test would have missed the P1.

## One product-line fix

`refresh: () => renderSyncCenterView(),`

The renderer's existing default is activate:false and its Account load is read-only. The shared callback ignores any incidental arguments; it never uses runtime presence as activation permission.

The suggested Boolean(runtime) shortcut is intentionally not used. A runtime object is allocated before credential provision / dataset initialization finishes and may survive partial/failed initialization. Object existence is not confirmation of local-data adoption. Even for an established owner, a display refresh needs no ensure: existing runtime lifecycle continues independently.

Explicit native start/resume and the explicitly labelled resume-to-open-conflicts path keep their direct activate:true calls. Account creation/join/recovery still start through their own existing orchestrator contracts; the clean-join guard from #164 remains intact. No permission, runtime, schema, Outbox, payload, Worker, shared, four-app or NEWS code changes. No new state/key/service.

## Acceptance

Actual Studio public entrance E2E now:

1. Keeps an old Account Gear record, a native serialized A Outbox record and a deletion intent; removes the local Account connection and joins B.
2. Closes the joined dialog, changes a target name, waits for the new name in native rows, opens/closes a Port invitation and revokes a separate synthetic target through the real confirmation button.
3. Waits for the ensuing Account summary/row refreshes and asserts zero /v1/sync requests from that profile, no runtime, identical Gear/intent bytes and identical A Outbox.
4. Only then presses the native explicit start/resume button and observes entry into the existing bootstrap path. It does not auto-select a conflict outcome.

The disposable target is separate from the issuer/current target, so the fixture does not invalidate unrelated profiles. Two intermediate expanded-fixture failures were corrected: clicking the lifecycle dialog instead of its submit button, and reading the native Sync namespace from the Studio parent (which intentionally does not load it) instead of the actual frame. No timeout extension or product guard relaxation.

Full product suite preserves clean first joins, formal Studio entrance with consume ACK loss and no extra passcode, registered name/current marker, cold auto-resume, PWA return, Pro/Device denial and Account A/B isolation. Existing recovery suite independently covers actual images/source-final, attachments, ACK loss and two-device CAS/conflict UI. Fresh nonempty rename coverage does not manufacture image binaries; those are covered by the existing genuine binary regression.

See refresh-p1/validation.json for counts. Tests are local/disposable/synthetic only. No real Account, Production operation, merge or Pages publication. Public release must contain all three stack patches; do not publish the vulnerable #164/#165 intermediate tree. With automatic Pages-on-main, approve a single final combined-tree release rather than exposing sequential intermediate deployments.
