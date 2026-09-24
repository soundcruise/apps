# S2-A Common Pro authentication operations

This local implementation is a release candidate. No production migration, secret, deploy, or code rotation was performed in this batch.

## Phase 1 initial state

Migration 0029 is additive and repeatable. It creates a single state row with generation `1`, active slot `A`, and legacy UI compatibility enabled. Applying it alone does not remove an existing browser's v1 UI entry. Until the active passcode slot, a separate 32+ character credential pepper, Turnstile secret, and rate limiter are available, `/verify` fails closed with 503. `/policy` can still report the compatibility setting.

The Worker reads `PRO_PASSCODE_SLOT_A` or `PRO_PASSCODE_SLOT_B` according to D1 state. Each is a Worker secret containing exactly four ASCII digits. `PRO_CREDENTIAL_PEPPER` is a separate high entropy Worker secret used only for HMAC of bearer credentials. Secret values must never be written to this repository, fixtures, deployment command history, logs, or reports. Existing Turnstile Siteverify uses `TURNSTILE_PRODUCTION_SECRET_KEY`; the Pro action is `sound_cruise_pro_verify`. The public site key remains in the browser.

An independent reviewer should verify the D1 migration, the active slot secret, pepper, Turnstile hostname/action, the dedicated `PRO_VERIFY_RATE_LIMITER` (5 attempts per minute per IP), the public origin, and local gates before any production action. Deploy order should avoid publishing new browser HTML before Worker and secrets are ready. Browser release also requires the updated cache references. Standard editions do not load the Pro gate.

## Future Phase 2 rotation (not executed)

Prepare the inactive slot with the new four digit value as a Worker secret. Verify its readiness without exposing the value. Change `pro_auth_state` in one D1 transaction: increment `generation`, select the prepared slot, set `legacy_compat_enabled = 0`, `legacy_retired_at` to the change time, and `updated_at` to the same time. The primary-consistent `/session` checks the credential row against current generation, so old tokens require reauthentication immediately after that state change. Do not switch the state before the inactive slot is ready. Once legacy compatibility is retired, do not turn it back on for an outage. Rotate browser assets and communicate the new code through the existing YouTube membership channel.

Cloudflare's Workers rate limiting binding is an abuse control, not a globally exact counter across all data centers. Existing cached client code cannot be remotely erased; the Worker never grants a new credential from legacy state and denies old generation credentials after rotation. Pending browser revocations retry when online, but a browser that permanently loses its local storage before retry cannot complete that best effort request.
