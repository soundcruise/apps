/** Forward the existing Pro credential; only the server grants entitlement. */
(function installProBackendEntitlement(global) {
  'use strict';
  const TOKEN_RE = /^scp1\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;

  function readProCredential(storage = global.localStorage) {
    try {
      const auth = JSON.parse(storage?.getItem('soundCruiseProAuth') || 'null');
      return auth?.v === 2 && Number.isSafeInteger(auth.generation) && auth.generation > 0 &&
        TOKEN_RE.test(auth.credential) ? auth.credential : null;
    } catch (_) { return null; }
  }

  async function proAuthorizationHeaders(storage = global.localStorage) {
    let credential = readProCredential(storage);
    // UI-only legacy sessions reauthenticate through the existing Pro gate.
    // Neither an edition flag nor a legacy marker can mint a credential.
    if (!credential && typeof global.__soundCruiseRequireProBackendAuth === 'function') {
      await global.__soundCruiseRequireProBackendAuth();
      credential = readProCredential(storage);
    }
    return credential ? { 'X-Sound-Cruise-Pro-Authorization': `Bearer ${credential}` } : {};
  }

  function rejectProAuthorization(code, headers) {
    if (code !== 'pro_required' && code !== 'pro_reauth_required') return;
    const authorization = typeof headers?.get === 'function'
      ? headers.get('X-Sound-Cruise-Pro-Authorization') : headers?.['X-Sound-Cruise-Pro-Authorization'];
    global.__soundCruiseRejectProBackendAuth?.(authorization?.replace(/^Bearer /, '') || null);
  }

  global.SoundCruiseProBackendEntitlement = Object.freeze({
    readProCredential, proAuthorizationHeaders, rejectProAuthorization
  });
})(globalThis);
