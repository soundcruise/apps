# Isolated Dot review UI

The isolated Worker serves a read-only shell and the same Dot review renderer used by Operator. Every shell, asset and candidate request passes existing Access authentication and human authorization; no D1 binding, mutation, or decision endpoint is present. The relay remains off by default. Values are rendered as text and links accept only HTTPS without credentials.

The optional NEWS comparison adapter accepts a bounded snapshot supplied through an authorized server-side reader. No production D1 reader is connected here. It records coverage for approved, pending, rejected, system exclusions, discovery, decision ledger and takedowns; missing or failed sources are unexamined. Similarities are only navigation aids and the result remains UNCERTAIN with incomplete history. It cannot alter past decisions or treat a missing match as a formal non-duplicate.

Local preview supports a signed fixture (`createLocalOperator(reader, {isolated:true})`); it is not evidence of real Cloudflare Access. Real Cloud Run and Firestore data were not modified by this change. A real screen test needs separate authorization for deployment of the isolated Worker and for a supervised, time-limited Cloud Run ingress trial, followed by restoring Invoker IAM and disabling the relay. No production Operator deployment is included.
