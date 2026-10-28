Current additional27 lifecycle entries: [Account / Membership / Device contract](MAINTENANCE_ACCOUNT_DEVICE_LIFECYCLE.md). Inventory57 HTTP isolated,26 HTTP +1 Scheduled HOLD. Earlier counts/results below describe their historical stage. Full Bridge / Production HOLD.

Subsequent isolated membership/grant profiles: [MAINTENANCE_ACCOUNT_MEMBERSHIP](MAINTENANCE_ACCOUNT_MEMBERSHIP.md). The historical results below remain historical; Full Bridge / Production HOLD persists.

# Account / Pro Maintenance Owner HTTP — isolated v1 + lifecycle extension

Limited candidate on PR29. Full Bridge remains HOLD. No normal router import,
Production binding, migration, deployment, consumer cutover, Shared Write or
canWrite activation is included. Existing Studio0.47.20 / Port1.24.23 / schema2
and the private Worker0.1.0 convention remain unchanged.

## Trust and owner profiles

The factory requires a trusted native D1 binding, existing owner environment,
and distinct explicit writer/security scopes. Request JSON is never an owner.
Only Turnstile, clock and crypto dependencies from the existing test interfaces
are accepted; authentication/repository override hooks are not passed through.

| State | Evidence / permitted use |
| --- | --- |
| Before Account creation | Invocation UUID and keyed request fingerprint; explicitly unregistered, no future Account/device identity |
| Creating Account | Original Account owner validates input, rate limit and Turnstile; its single batch establishes actual IDs and typed outcome |
| Account established/member pending | Existing HMAC Account credential, actual Account generation/recovery version/device credential version |
| Member established/device absent | Actual membership id/state/generation/sync user snapshot; never infer missing counters |
| Device registration | Same-transaction owner/membership snapshot assertions and exact managed-user/device/link result |
| Authenticated Account/device | Original credential verifier and current Account/device state in every activity/business transaction |
| Recovery/reissuance | Existing recovery-code/claim HMAC, exact next credential verifier and Account CAS; current committed claim evidence for historical activity |
| Pro issue/renew/revoke | Existing passcode/Turnstile, HMAC, generation, one-use signed device challenge, key binding and lifecycle policy |
| Activity/last_seen | Separate security-lane child operations, including GET side effects; insert-ignore row proof is distinct from final active-state proof |
| Unknown/mismatch | No inferred identity or business capability. Original HTTP validation rejects; unmatched SQL/profile is HOLD |

Fingerprints use the existing respective owner pepper and a separate HMAC
domain. Method, service origin, path/query, Origin, body, Authorization and
invocation UUID are bound. Plain passcode/token hashes, Authorization values,
request payloads and response credentials are not retained in Bridge metadata.
The current-app detach fingerprint additionally binds X-Sound-Cruise-App-Authorization;
existing13 route fingerprint formats remain unchanged.
Key rotation/reconciliation across unavailable historical keys is not solved;
unverifiable historical requests stay HOLD.

## Exact isolated HTTP scope

| Method | Route | Write responsibility |
| --- | --- | --- |
| POST | /v2/accounts/start | Bootstrap writer |
| POST | /v2/accounts/port-device | Membership ensure / app-device provisioning writer |
| GET | /v2/accounts/summary | Authenticated last_seen/activity security writes |
| GET | /v2/accounts/devices | Authenticated last_seen/activity security writes |
| POST | /v2/accounts/devices/revoke | Exact Account device and associated links revocation |
| POST | /v2/accounts/recovery/prepare | Recovery attempts / exact claim preparation |
| POST | /v2/accounts/recovery/commit | Recovery CAS / exact historical reconciliation / activity |
| POST | /v2/pro-auth/verify | Issuance writer OR wrong-passcode lockout security write |
| GET | /v2/pro-auth/session | Existing Pro observation; not save admission |
| GET | /v2/pro-auth/policy | Existing public policy |
| POST | /v2/pro-auth/revoke | Authentic own credential revocation, including already-revoked zero-change success |
| POST | /v2/pro-auth/device-session/challenge | Original signed device challenge |
| POST | /v2/pro-auth/device-session/renew | Original signed device-session renewal writer |

The lifecycle extension adds these four POST routes on PR30:

- /v2/accounts/recovery-rotation/prepare
- /v2/accounts/recovery-rotation/commit
- /v2/accounts/environments/current/detach
- /v2/accounts/apps/current/detach

See MAINTENANCE_ACCOUNT_LIFECYCLE.md for their exact Owner semantics. There are
now17 connected isolated HTTP entries. The historical84 index actually contains
83 HTTP entries plus one scheduled entry, not84 HTTP entries. Remaining66 HTTP
and one scheduled entry are HOLD. Account joins/invitations, membership-wide
mutation/delete, QA/operator, legacy Sync, Asset/R2 and administrative paths
remain unconnected. External/manual writers also require separate exclusion. QA credentials,
even without the QA header, are HOLD before activity/canonical mutations.

The wrapper enforces original Origin/method/body bounds and bookmark rules,
adds a mandatory UUIDv4 X-Maintenance-Operation-Id, rate-limits registration,
and exposes error/reconcile metadata through CORS. Account body.operationId,
when present, must match the invocation UUID. No client-selected scope/owner
assertion/SQL/outcome is accepted. Unsupported native/session escape is HOLD.

## Stop and transaction boundary

Both scopes start closed and require the existing isolated handover proof.
Normal writer stop fences bootstrap, membership/device creation, Pro issuance
and renewal. The separately open security lane preserves revocation, lockout,
read authentication activity and existing legitimate recovery. Recovery does
not reopen the writer or grant a new writer capability. Closing the security
scope fences its registered parents/children as well; urgent operations need
an explicitly open security lane, not a bypass of its stop.

An HTTP parent is registered durably before the original handler runs and stays
registered until the known HTTP outcome is recorded. Each owner transaction has
a derived unique UUID, keyed exact statement binding and typed result. The
current owner assertions, child epoch and parent registered/security epoch
assertions execute with original uninterrupted business statements, final
outcome assertion and child receipt in one D1 batch. Original changes() chains
and returned result offsets are preserved. No independent DB/R2 atomicity is
assumed. A final assertion failure rolls back business SQL and its receipt.

Account revoke proves the actual target revoked row and lifecycle target;
Pro renew proves the exact device key, timestamp, lease and one-use proof.
Zero changes is permitted only by an owner-specific semantic outcome such as
already-revoked Pro or insert-ignore activity, not by generic transaction success.

## Unknown results and explicit resolution

Metadata registration is not business success. HTTP root completion means
`http-result-recorded-not-an-authorization`, and children identify individual
transactions. Reconciliation verifies binding/receipt hashes and returns only
historical facts, never a cached secret, response replay or new authorization.

After ACK loss, interrupted runtime or ambiguous failure, return503 and retain
root/children. A duplicate invocation never reruns the owner. The caller must
explicitly reconcile. If two recovery mutations were already compiled, the
losing final CAS/fence remains unknown to its caller; another invocation's
success is not promoted to its own receipt. An already-committed claim observed
before planning mutation instead retains the owner's HTTP200 historical path,
with only activity children and no new recovery-commit success receipt.

`resolvePending(originalRequest,{sourceOperationId,resolutionOperationId})`
is an explicit isolated control API, not a Production route. It requires the
exact request HMAC/root identity and a registered mutation with no receipt,
external pending or previous resolution. In one D1 transaction it fences that
specific operation and commits a typed resolution receipt. Original SQL is not
retried. A concurrent commit either already won (resolution refuses) or loses
the source/parent fence. Resolve root and each pending child explicitly. A root
resolution forbids later child admission/commit. Committed child facts remain.
The classification is **this operation had no protected D1 commit**, not whole
invocation rollback. Rate-limit/CAPTCHA effects are not reversed. No R2/external
unknown is resolved by this D1-only proof.

## Verification / remaining boundaries

Run scripts/maintenance-owner-http-native.mjs with explicit disposable evidence
and local runtime package paths; MAINTENANCE_OWNER_BROWSER=true adds real Chrome
CORS and Studio boot checks. The script never uses remote bindings and uses
synthetic credentials/empty schema fixtures only. Existing owner tests and
maintenance-bridge-v2-native.mjs are separate regression runs.

The historical PR30 accepted run used Miniflare5.20260911.0-alpha/workerd1.20260911.1 and Chrome
through Playwright1.56.1. Historical PR30 evidence: native26 PASS, Browser6 PASS,
core regression23 PASS, existing Account/Pro Node81 PASS and Studio metadata/host
Node31 PASS, all with zero fail/skip. Native raw R13 is the final accepted run;
earlier failed development runs are retained separately and are not PASS evidence.

Native request interruption/reopen is tested by stopping/restarting the local
workerd runtime between registration and business commit. It is not an OS
power-failure or Production durability attestation. Independent instances and
simultaneous requests share native D1; real multi-device/Cloud remain untested.

No Production handover/drain, old writer exclusion, real cleanup, R2 recovery,
schema promotion/journal ordering, backup/restore, normal consumer migration,
Owner key rotation, production expiry/physical-commit guarantee or Cloud saving
is accepted by this candidate. Separate approvals and implementation remain
required. Do not infer Full Bridge or Production rollout readiness from this PR.

The lifecycle extension reruns existing13 native26, Account/Pro Node81 and Studio
Node31; its final direct native19 and Browser9 cover the four added routes. Core23
is reused unchanged historical evidence, not newly executed. See the lifecycle
contract and current evidence manifest for exact run identities.
