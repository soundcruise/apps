# Phase 3H isolated real-Firestore review

`node phase3h/server.mjs` opens a local-only, ephemeral, read-only review for the
single fictional candidate and the two named Phase 3H test attempts. It uses
`gcloud` service-account impersonation; the short-lived token stays in process
memory. The service account currently has Firestore create and get permissions:
this server executes only fixed document reads, but its credential is not a
read-only IAM principal. The server cannot list collections, edit candidates,
or perform publication decisions. It binds 127.0.0.1, checks the Host header,
uses restrictive CSP, and serves no credential to the browser. It is an isolated
local experiment, not a network authentication boundary for production use.
Restart after token expiry. Do not point it at a production project or run it
as an externally exposed service.

The similar-news data are offline fixtures, not a read of actual NEWS or a
formal SAME decision. Public approved articles and authenticated private
pending/rejected, discovery and decision ledgers must be obtained through
separate authorized read-only channels in a later phase. Missing or expired
history must be visible, and cannot be treated as an empty complete history.
The human publication decision remains in the existing operator process.

For future real data: choose documented retention periods only after rights and
privacy review; delete source and candidate content on valid deletion requests,
while retaining the minimal lawful, purpose-limited identity tombstone needed to
prevent rejected or taken-down items silently reappearing. Separate the receipt
retention decision from payload retention, and specify reconciliation for
conflicting deletion obligations. Do not introduce TTL or auto-deletion without
separate approval and cost review. A process death before audit or a Firestore
outage can prevent recording an attempt; reconcile independently and never claim
complete audit. This phase does not delete or alter existing cloud records.
