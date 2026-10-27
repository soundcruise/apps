# Account save admission: unrouted isolated owner contract

See the complete [Port/Account contract](../../apps/cruise-port/docs/ACCOUNT_SAVE_ADMISSION.md).

`src/account-save-admission.js` reuses the existing Account credential verifier.
No app/account router imports it. Worker package/config/compatibility/migrations,
existing credentials, HTTP methods, rollout flags and deployed endpoints do not
change. Test-only SQLite lease columns extend synthetic existing device rows;
they are NOT a production migration, new Account store or new authentication system.

Only an explicitly co-located fixture can provide the synchronous owner probe
required at a local Authority transaction's admission point. Remote owner reads,
including first-primary D1 snapshots, do not make D1 and browser IndexedDB atomic.
Revocation after that probe remains a production integration gap. No route is
installed until a backend transaction/serialization contract and credential expiry
policy are approved and tested. No synthetic approval activates a product gate.

D1 sessions provide sequential consistency, with first-primary applying to the
first query. D1 batches transact within D1; neither feature spans a client database:
[D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).
Current tests exercise local SQLite only; no remote D1, R2, Worker or Secrets.
