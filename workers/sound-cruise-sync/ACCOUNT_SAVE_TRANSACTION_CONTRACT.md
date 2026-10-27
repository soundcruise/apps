# Unrouted Account / Port save transaction boundary

Canonical contract: [Port backend/local outcome contract](../../apps/cruise-port/docs/BACKEND_SAVE_TRANSACTION.md).

`src/account-save-transaction.js` is explicit fixture-only injection. Neither `app.js` nor `account-app.js` imports it. No HTTP endpoint, production migration, Wrangler config, binding or deployment is added. The actual local workerd test validates the existing D1 batch/fence rollback boundary; it does not establish production readiness.

Production work would require owner-approved credential lifecycle/clock semantics, authenticated request/receipt routes and the proposed columns on existing owner/log rows. Do not install the fixture schema or enable save permission automatically. Account observations are not admission. Backend SQL and browser IndexedDB remain independent commits and independent receipts. No Shared Write/normal writer/Cloud/L3d enablement belongs to this candidate.
