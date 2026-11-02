# Studio 0.71.3 — preserve native Account join until first Sync finishes

## Fixed dependency and cause

Base PR #164: a840aed0ec908e7cd36bec9316dc39ce4c0fb231. Main observed: 4a0dc37910f8e520fcb7d4d0af780f1752e16460. PR #164 remains open and unchanged; this candidate depends on it. Port stays 1.25.0 from that dependency; Studio becomes 0.71.3.

The Studio Account subscription invalidates/rechecks entrance qualification on native Account DB generation changes. Native portJoin.consume persists the Account before settlePortSync starts/completes. The entrance previously removed accountFrame immediately when its summary/Pro checks succeeded. That destroyed the still-working native document, canceling the subsequent Device/bootstrap/pull path. An initial product reproduction confirmed the new formal join succeeds when this premature removal is prevented. The exact timing of the operator's historical Production incident is not independently captured.

## Minimal product change

Only the existing Studio entrance module and release version/cache edges change. Account DB subscription and existing check() remain the sole entrance proof source; no new authentication source, credential, Account record, key, API or Sync runtime is introduced.

During native join, the entrance retains the same iframe, native dialog, controller and inputs. It observes the existing native dialog phase and Port status attributes. Studio's main shell stays inert and its visible ready signal is withheld until BOTH existing entrance authorization and native synced completion are available. The native runtime's Account identity must also match the entrance's qualified Account. No display attribute grants Pro or writer admission.

On success, the existing observer disconnects before frame removal, Studio Home is requested through the normal navigation/unsaved guard, and subsequent Sync Center uses the same persisted Device mapping. It does not invoke a start button, reload the page, reissue qualification, adopt records or select a conflict choice. The valid shared Pro Session remains reusable; the product test asserts no second passcode verification request during onboarding. Existing native qualification API checks still run.

A user who merely opened the Account connection frame and then connected through another existing native Account path retains the prior entrance behavior when no join dialog is open or working. A typed/open join form is not discarded by that fallback.

Nonempty/unknown data, conflicts, communication failures and qualification refusal retain the native frame and existing recovery controls. The parent distinguishes Account-confirmed from first-Sync confirmation-needed instead of permanently calling a stopped state checking. Existing formal Pro refusal, generation fencing and retained old-Account forms are unchanged.

## Synthetic product acceptance

- Actual public Studio index with no Account and a valid server-issued synthetic Pro Session → locked entrance → Account connection iframe → native join dialog.
- Default Cruise Studio name, edited Entrance PC name, native invitation consume with committed response ACK loss and existing resume reconciliation.
- Native Cloud Gear receive without a manual Sync click, entrance qualification, Home, then actual Sync Center with registered name/current-device badge and automatic resume.
- A separate profile creates old-Account Gear, clears its local Account connection, joins another Account through the locked entrance and proves local bytes unchanged, no /v1/sync request, shell still inert and the native review frame retained.

The retained-data scenario simulates the post-removal Account DB state. It does not itself exercise Production or remote Account deletion. Existing suites separately cover Account/Device/Pro refusal, offline grace, delayed/failed Account reads, preserved form/image/attachment, tools/apps, ACK/CAS recovery and center/right same-frame display. Not every failure permutation is injected during the new join case.

The first full-suite iteration exposed an old fixture that created an Account outside the open connection frame; the fallback above preserves that legitimate path. No timeout extension, qualification bypass or relaxed save guard was used.

## Results and remaining acceptance

See entrance-join-0713/validation.json. All tests use disposable localhost profiles and local synthetic Worker/DB fixtures; Production requests sent: zero. Protected Port/4-app/shared/Worker trees match PR #164. Studio has exactly 34 release files after the real Jekyll build; development score/Pre-DTM/Project files remain excluded.

After review and separate publication approval, test real operator Account deletion/connection, valid and expired Pro Session, iPhone peer data, image hydration, Safari and real two-device Sync. Do not delete a real Account or discard local data merely to recreate the synthetic clean case. Existing nonempty-data review is intentional, not automatic adoption. No merge, Pages publication or Production operation is part of this candidate.
