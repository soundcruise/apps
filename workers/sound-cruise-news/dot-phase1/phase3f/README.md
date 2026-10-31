# Isolated Firestore staging prototype

This code is not deployed. `DOT_STAGE=firestore` and the exact isolation project
must be explicitly configured on the existing Phase 3E job; the default remains
its disposable SQLite smoke test. Do not set a key-file credential. No actual
Firestore database, API, IAM, job deployment or schedule is created here.

`saveDelivery` evaluates the existing schema and fail-closed source/evidence
policy. In one Firestore transaction it reads the hashed idempotency key,
candidate ID and stable attempt ID and creates all necessary records. Existing
same key and canonical JSON digest is replay; altered content is conflict. A
new key for an existing candidate is `candidate_conflict`, not an overwrite.
Retries of the same attempt ID do not create a second attempt. Job restarts
use a new attempt ID and are deduplicated via the receipt.

The Docs body SHA-256 and canonical input digest are separate. Candidate,
receipt and attempt documents are independently stored but atomically written
for successful deliveries. Confirmed failures are recorded only if Firestore is
available and the failure is reached by the pipeline; token failure, process
crash before audit, and Firestore failure can leave no attempt record. A caller
must not claim complete audit from these documents. Neither hash proves source
rights or factual truth. The last Drive revision check and Firestore commit are
not a distributed transaction; the record identifies the observed version.

`createReviewServer` is local-emulator-only and exposes the existing review
assets and read-only review data. Demo decisions and all production mutations
are disabled. The viewer contains untrusted input and must remain isolated.

Tests require a running emulator at 127.0.0.1:8789 and Java supported by the
installed emulator. The emulator starts empty and has no automatic persistence
across emulator restarts without explicit export/import. Emulator tests do not
establish production IAM, Firestore service behavior, or cloud cost. Retention,
deletion and tombstones require a separate design before real data is saved.

## Emulator export and restore acceptance

The gcloud Firestore Native emulator was tested with the local-only project
`demo-news-phase3f` and `(default)` database. A candidate, receipt and attempt
were written, then an explicit export was requested while the emulator was
running using the local emulator endpoint
`POST /emulator/v1/projects/demo-news-phase3f:export`, with `database` set to
`projects/demo-news-phase3f/databases/(default)` and `export_directory` set to
an existing writable local directory. The resulting `*.overall_export_metadata`
file was supplied to `gcloud emulators firestore start --import-data=...` in a
new emulator process. The three record counts and canonical digest matched;
replay, conflict and the review API worked after import.

An earlier Ctrl-C stopped the gcloud launcher without completing the shutdown
export, so `--export-on-exit` alone was not reliable in that environment. The
explicit running-process export was checked before stopping the first server.
The imported data can collide with test fixtures: run the regression suite on a
fresh emulator or isolated data, not against a populated persistence fixture.
