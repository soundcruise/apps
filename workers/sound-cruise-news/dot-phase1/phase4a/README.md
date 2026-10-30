# Phase 4A isolated Operator preview — not production integration

The preview uses the existing Operator stylesheet and Phase 2E review renderer,
serves one local Moon Guitar fixture, and enforces the Phase 1 input validator and
fail-closed evidence assessment. Start with `node dot-phase1/phase4a/preview.mjs`.
The server listens only on 127.0.0.1, validates Host, serves no credentials,
provides no mutation endpoint and does not contact Firestore, D1 or the real
Operator. It does not implement or emulate Cloudflare Access or CSRF: local
loopback is not an authentication boundary. It is a visual prototype, not a
production Operator route and not proof of production authorization.

A production candidate reader requires a separately approved reader service
identity and a tested database-scoped IAM condition. The existing Drive reader
has create privileges and is not the requested read-only review principal.
A server-side bridge must independently authenticate operators using the
existing Access checks, maintain origin/security controls, validate bounded
untrusted payloads and safe URLs, and never expose Google tokens to browsers.
The route must be disabled until configured and have no publication or decision
capability. Its Access/CSRF behavior and audience need explicit integration
review and real tests; this prototype has none of those capabilities.

Only fixture similarities are displayed. A later authenticated read-only bridge
must establish complete query scope for approved, pending, rejected, system
exclusions, discovery, decision ledgers and takedowns; declare pagination and
retention gaps. Similarity is not SAME; insufficient evidence is UNCERTAIN.
Do not revive rejected or removed items automatically. Delivery receipt and
payload retention, deletion requests and minimal tombstones require a separate
approved policy before real data is staged. No production data was read or
changed by this preview.
