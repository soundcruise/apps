# S2-A Common Pro authentication operations

S2-A Phase 1 is live. Check production migration, secret-name, and Worker deployment metadata to determine H1 rollout status.

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
