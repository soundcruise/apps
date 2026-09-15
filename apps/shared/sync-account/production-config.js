(function installSoundCruiseProductionSyncConfig(global) {
  'use strict';

  // Release foundation only. General admission requires a reviewed change to
  // this client gate plus both independent Worker-side gates.
  const config = Object.freeze({
    enabled: false,
    environment: 'production',
    endpoint: 'https://sound-cruise-sync.cruise-port-requests.workers.dev',
    portUrl: '/apps/cruise-port/#sync-center'
  });

  global.__SOUND_CRUISE_SYNC_CENTER__ = config;
  global.__SOUND_CRUISE_MULTI_APP_SYNC__ = config;
})(globalThis);
