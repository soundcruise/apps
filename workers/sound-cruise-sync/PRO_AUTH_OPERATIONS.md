# S2-A Common Pro authentication operations

This local implementation is a release candidate. No production migration, secret, deploy, or code rotation was performed in this batch.

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
