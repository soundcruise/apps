Current additional27 lifecycle entries: [Account / Membership / Device contract](MAINTENANCE_ACCOUNT_DEVICE_LIFECYCLE.md). Inventory57 HTTP isolated,26 HTTP +1 Scheduled HOLD. Earlier counts/results below describe their historical stage. Full Bridge / Production HOLD.

# Account / membership grant lifecycle — isolated Maintenance profile

Direct parent PR #31 `663dae6bf6d52b1a98b63c924b315f483a12f6f2` (tree `4d1945a3cb6ef762cccc940c7358cb59b62358cb`). Dependency main → #26 → #27 → #28 → #29 → #30 → #31 → this topic. Full Bridge and Production rollout remain **HOLD**.

## Exact scope

13 additional route/method pairs, reusing the original Account handler and repositories:

| Path | Methods / purpose |
|---|---|
| `/v2/accounts/memberships` | GET owner summary; POST first pending membership preparation or existing pending/active observation |
| `/v2/accounts/app-join-invitations` | GET issuer-only exact invitation-ID status; POST issue |
| `/v2/accounts/app-join-invitations/consume` | POST first activation or ready Account-managed membership reconnect, `new_app` |
| `/v2/accounts/app-join-invitations/cancel` | POST issuer cancellation |
| `/v2/accounts/port-join-invitations` | GET issuer-only exact-ID status; POST issue |
| `/v2/accounts/port-join-invitations/consume` | POST new Account-device enrollment via existing Owner grant |
| `/v2/accounts/port-join-invitations/cancel` | POST issuer cancellation |
| `/v2/accounts/handoffs` | POST Production **rejoin** grant |
| `/v2/accounts/handoffs/consume` | POST Production rejoin, `new_app` |
| `/v2/accounts/handoffs/cancel` | POST issuer cancellation |

GET invitation is not a list endpoint. Membership POST does not accept `port`; existing Port orchestration remains its Owner. No invented transfer, approval or membership-move API. The84-entry historical index is83 HTTP +1 Scheduled; now30 HTTP have isolated profiles,53 HTTP +1 Scheduled remain unconnected. Counts are route-level with explicit mode restrictions, not all-mode acceptance.

QA credentials, `existing_chord` import, initial QA handoff and deleted-membership reprepare are HOLD **before native handler side effects**. Existing Chord has legacy credential activity and a separate migration transaction; deleted reprepare depends on proven scheduled purge. Broad membership delete/unlink/transfer and remaining device lifecycle are separate unconnected Owner plans. The four current detach/recovery operations from #31 remain security profiles.

## Authority and transaction

An issuance/cancellation request authenticates the existing sca1 Account-device via the existing Owner. A consume request's authority is the HMAC-verified, persisted Owner grant and its issuer/account/member relationship. Incoming sca1/scd1 strings are **new enrollment targets**, never authenticated current identities. Grant knowledge alone is insufficient: production provenance, issuer membership and non-revocation, active nondeleted Account, current Account/recovery/credential counters, grant purpose/app/member, cancellation, expiry, actual member state/generation/user and expected new credential verifiers must all agree. Cross-Account device reuse is refused.

The new module does not replace native validators, HMAC, public app allowlist, Turnstile, rate limits, Owner SQL, generation rules or data stores. It only supplies purpose-specific Bridge assertions and outcomes. No new schema or migration.

The exact root UUID/request HMAC binds request method, path/query/body/origin/authorization. Root is a durable security-lane invocation reservation, not save authority. Child operations reuse existing Bridge UUID/digest/epoch/current-parent guards, registration, typed receipt and explicit reconciliation. Every business batch executes unchanged native SQL between same-transaction preconditions and a semantic outcome guard. Native D1 batch rollback covers business effects and typed receipt together.

- First pending membership requires actual Account owner and absence; outcome proves exact new membership, prepared UUID/device, generation1, no user.
- Issue pins actual membership state/generation/user, and ready dataset for reconnect. Expired/replaced-grant retirement is **writer lane**, although it cancels old rows. That preliminary step can commit before later issuance fails; its distinct receipt says no new grant.
- Consume pins grant snapshot and live issuer Account/device. Port grant also persists expected Account/recovery counters. App/handoff snapshot pins current member generation. Active reconnect additionally checks canonical managed-user association, active nondeleted sync user, ready dataset and native device limit.
- First App activation keeps Owner semantics: generation increments once; canonical user, App/Account devices, link and managed-user mapping are created in the original batch. Reconnect preserves user/generation; Port join creates an Account-device without inventing App membership.
- Outcome proves exact consumed grant UUID/fingerprint and both incoming credential verifiers, link/account/app/member association, active user and resulting generation. INSERT0/UPDATE1 is not success. Zero/mismatch triggers SQL rollback, retaining registered evidence.
- Expiry is checked with SQL clock in both grant guard and result guard. This is a SQL evaluation boundary, **not proof of physical commit before deadline** or trusted Production clock.

App/handoff native grant rows do not store issuance-time generation. This profile snapshots current Owner state and relies on native Recovery/detach cancellation. It does not invent a historical issuance counter or claim arbitrary raw-writer ABA exclusion. Same-origin/raw SQL actors and noncooperating legacy writers remain separate gates.

## Stop, recovery, historical facts

Issue, join, handoff and first membership preparation require writer lane open. Explicit cancel remains security lane, so writer stop cannot prevent legitimate Owner cancellation, recovery or revocation. Security stop still closes those operations. Security capability is never promoted to writer.

Historical already-prepared/already-issued responses from the existing Owner do not create new permissions. A repeated Bridge UUID never reruns the handler; it requires explicit `reconcile`, which returns only typed historical facts, never new credentials, cached auth responses or present authorization. A changed digest rejects. ACK loss, failed batch or interruption keeps pending. Registered receipt-less D1 operations may be explicitly operation-fenced under the existing recovery contract; preceding successes are not erased. No automatic retry or cleanup.

The module does not modify Pro credentials or grant Pro membership. Existing backend paid checks remain required. Account joins do not enable Cloud Sync or normal writers.

## Verification and deployment boundary

Explicit runner: `scripts/maintenance-account-membership-native.mjs`, with repo-external `MAINTENANCE_MEMBERSHIP_EVIDENCE_DIR` and existing local `MAINTENANCE_V2_RUNTIME_PACKAGE`. Optional `MAINTENANCE_MEMBERSHIP_BROWSER=true` uses disposable Chrome, loopback ephemeral ports and native D1; no remote binding. Synthetic credentials only. It is outside default Node discovery.

Direct tests cover all13 routes and production submodes, forbidden modes, foreign identity, cancel/expiry, Recovery/revocation, generation drift, zero-row rollback, concurrent adapter instances, request replay, ACK loss, reopen, ready-user/device-limit races and stop. Existing17-route native and Owner Node regressions are distinct. Exact run results and source hashes are repo-external; historical results are not counted as current PASS.

Normal router/core/schema/migrations, Studio/Port/Shared/NEWS assets and workflows remain unchanged. Existing candidate versions Studio0.47.20 / Port1.24.23 / Project schema2 and private Worker0.1.0 remain; no browser cache change is needed for this unrouted Worker-only profile. No new boot import. Shared Write OFF, canWrite=false, normal consumer/writer/Cloud disconnected. No deploy, main merge, Production credentials/API or data migration.

## Remaining shared Owner work and release path

Group by durable Owner transaction, not route-count quotas:
1. Remaining Account-wide membership/device deletion, detach, cancellation/retention, QA/operator authority: prove graph ownership, purge provenance and legacy migration boundaries together where compatible.
2. Sync repository and legacy authentication activity: sync start/pair/push/changes/snapshot with revision/receipt/fence, plus explicit legacy cutover and migration. Preserve read endpoints' auth activity semantics.
3. Asset/R2/cleanup and scheduled retention: durable reservation/pending, external-effect uncertainty, drain and exact R2/D1 partial-recovery. No atomicity assumption.
4. External/admin/old-version writers exclusion, full inventory and initial v137 handover/drain evidence.
5. Formal migration artifact + encrypted backup and actual isolated restore + approved Production maintenance window, then compatible Worker default OFF. These require separate approval.
6. Owner-limited canary including key/clock/TTL/renewal, backend/local partial results, binary recovery; Cloud Sync end-to-end across tabs/devices; Studio PC feature/UI/OS acceptance can progress in parallel.
7. Combined Studio + Cloud release only after normal consumer/write cutover, data restoration, security and operational gates pass and user approves. Studio stays0.x until that approval.

No step is automatically started by this implementation; Full Bridge HOLD is not lifted by a limited review PASS.
