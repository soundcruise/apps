# Unpublished Account lifecycle / authenticated Port save routes

The canonical contract is [Owner Credential / Save-Reconcile](../../apps/cruise-port/docs/OWNER_CREDENTIAL_SAVE_ROUTES.md).

`account-credential-lifecycle.js` reuses existing sca1 owner verification and device rows. `account-save-routes-isolated.js` explicitly composes the owner with the existing save transaction. These modules are absent from normal Worker routers. Proposed lifecycle/history flags, generation binding and operation ledger are fixture-only columns; there is no production migration/configuration or new Account storage.

Current history is saved-data readonly with explicit durable owner floor/expiry writes, separate from save permission and current-credential authenticated. See [Owner Clock / Renewal Recovery](../../apps/cruise-port/docs/OWNER_CLOCK_RENEWAL_RECOVERY.md). Confirmed expiry is terminal across rollback/reopen; unconfirmed aborted SQL observations and physical wall-clock guarantees remain distinct production gates. Save/lifecycle denial facts and final SQL assertions do not create browser IndexedDB atomicity. Keep Shared Write OFF, canWrite=false and every production gate closed.
