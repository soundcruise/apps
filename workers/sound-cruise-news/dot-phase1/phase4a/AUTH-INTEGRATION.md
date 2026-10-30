# Phase 4A authenticated read-only integration — isolated, not deployable

The existing Operator handler authenticates every request with its Cloudflare
Access JWT verification (signature/JWKS, issuer, audience, expiry, age and human
email allowlist), then checks origin before routing. The Dot GET routes are
available only through an explicitly injected `dotReader` argument in local
tests. The deployed Worker default does not provide that argument and the UI is
hidden. No production Firestore binding, cloud service or secret is added.
The static Dot asset is subject to the same Operator authentication.

`firestore-reader.mjs` is a Node server-side adapter: bounded pages (1–20),
validated document IDs and cursors, bounded input size and read deadlines. It
validates untrusted candidate JSON, evaluates evidence fail-closed with no
permission policy assumed, strips delivery idempotency keys from the returned
candidate, and presents duplicate state as UNCERTAIN with incomplete history.
Detail reads receipt and at most 10 attempts. It is read-only; there is no
publication or review-decision endpoint. Database data should be restricted by
IAM, not Firestore security rules for server credentials.

`local-operator.mjs` is a localhost-only demonstration. It uses the real isolated
Firestore reader identity through a short-lived token, and injects a locally
signed Access-like test JWT to exercise the real verification code. It is NOT
Cloudflare Access, not a production auth service, and never deploys. Its
previews of existing Operator controls are inactive. The local process holds the
Google token; the browser receives no Google credentials. It is not suitable as
an exposed server. Token expiry requires process restart.

Google WIF can exchange a trusted external OIDC identity for a short-lived
credential, but an eligible Cloudflare Worker workload assertion and the trust
configuration for this environment have not been established. Do not use an
end-user Access JWT as an assumed workload identity. Cloud Run with the existing
reader service account is another candidate, but a private, authenticated
Cloudflare-to-Cloud Run channel and its caller identity are not implemented.
No public unauthenticated HTTP endpoint should be introduced. Neither path is
approved for deployment by this change.

NEWS dedupe remains unconnected: approved, pending, rejected, system exclusions,
discovery, decision ledger and takedowns are all UNCHECKED. Fixture similarities
are not formal SAME; incomplete or expired history is not a negative match.
The current branch is stacked on the earlier Dot draft and predates current main;
review/rebase or equivalent reconciliation with current main is required before
any integration. Cloud, IAM, Access and production resources remain unchanged.
