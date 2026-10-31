# Phase 3F: isolated durable staging design (not implemented)

## Boundary

The existing Phase 3E job intentionally creates a temporary SQLite database and
deletes it on exit. Its `created` status is not a durable receipt. No NEWS D1,
production Operator, publication decision, or scheduler is part of this design.
Schema and source policy are re-evaluated on the receiver; a delivery notice or
matching hash is neither source permission nor human confirmation.

## Proposed Firestore model

Use a separate isolation database and ADC with the existing job identity. Do not
enable Firestore, change IAM, or deploy until approved. Actual service-account
authorization must be scoped and tested: Firestore IAM may not enforce an
application collection as a security boundary for server credentials.

One transaction must atomically read and conditionally create:

* `receipts/{sha256(idempotency_key)}`: raw key, canonical payload digest,
  candidate document reference and first delivery metadata.
* `candidates/{sha256(candidate_id)}`: candidate ID, untrusted input, validation
  and policy result, provenance state, and processing time. Raw ID in the record
  must match the lookup to guard even against key-derivation errors.
* `attempts/{attempt_id}`: run, file, version, notice, exact input hash,
  outcome, safe error code and timestamps. Attempt IDs are caller-generated
  once per logical attempt and reused after an ambiguous ACK; they are not a
  substitute for the delivery idempotency key.

Same idempotency key and canonical digest is replay; same key with a different
digest is conflict. A different key colliding on candidate ID is not a new
candidate: inspect the existing record and fail closed unless a documented
equivalence rule applies. Never overwrite records on conflict. Store a bounded
audit result, including validation failures, separately from accepted candidate
content. A transaction conflict is not authorization to retry indefinitely.

Maintain separate hashes for the exact LF-joined Docs body (notice verification)
and the canonical parsed JSON (delivery idempotency). Persist Drive file ID,
version, modified timestamp and notice ID as observed; equality of the exact
body hash does not authenticate the sender or independently prove article
facts. Refresh both file metadata before committing and stop on version change.
There is still a cross-service race after the final Drive read: the receipt must
record the observed version, not claim the source cannot change after commit.

## Required validation before deployment

Test real Firestore transaction semantics in an emulator and then the isolated
cloud: concurrent distinct keys for one candidate, parallel identical keys,
changed body with the same key, transaction abort, commit followed by lost ACK,
restart, deletion and reappearance of Drive documents, expired authorization,
and persistence of audit failure. A fake client or SQLite test alone does not
prove Firestore behavior. Exclude plaintext credentials and full source body
from logs. Define maximum sizes, retention, deletion and tombstone policy before
retaining real candidate data; do not let TTL erase the only duplicate barrier.

Review UI integration needs a read-only adapter returning candidate, policy,
evidence and audit state; it must not expose the existing demo decision as a
publication decision. No production connection is implemented.
